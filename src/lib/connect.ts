// Platform connection orchestration for the mobile app.
//
// Flow: open the platform's authorize page in an in-app browser session →
// the user consents → the platform redirects to the Appsurge launchpad
// (app-surge.dev/auth/<platform>/callback) → the relay page bounces the
// auth code into this app via the `appsurge://auth/<platform>/callback`
// deep link (registered intent filter in AndroidManifest.xml) → the code
// is exchanged for tokens through the gateway Worker (secrets stay in
// Cloudflare) → the connection is persisted to Firestore.
//
// Timing model (why the outcome bus exists):
//   • Android (Chrome Custom Tab): the deep link fires WHILE the browser
//     tab is still open. App.tsx's global Linking listener consumes it.
//     `openAuthSessionAsync` only resolves later, when the tab is closed —
//     usually as `dismiss`. So the awaiting caller must NOT trust the
//     browser result; it waits for the published outcome instead.
//   • iOS (ASWebAuthenticationSession): the session intercepts the custom-
//     scheme redirect and resolves `success` with the URL directly. The
//     global listener may never see a Linking event, so the caller
//     consumes the URL itself.
//   • Race: on some Android versions the browser resolves `dismiss` a beat
//     before the deep-link event is dispatched. A short grace window
//     covers that before reporting `cancelled`.
//
// Every consumed URL is deduped, so the global listener and the flow-local
// consumer can never double-exchange the same authorization code.
//
// X has no OAuth support in the gateway, so it is offered as a manual
// "connect on desktop" flow.

import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { getOAuthClientIds, exchangeCodeForTokens, upgradeInstagramToken } from './gateway';
import {
  PLATFORM_CONFIGS,
  generatePkce,
  generateState,
  launchpadRedirectUri,
  viaAppLinkHop,
  LAUNCHPAD_ORIGIN,
  type MobilePlatform,
} from './platformAuth';
import { buildWeeklyPlan, logActivity, saveConnection, type ConnectionRecord } from './cloudStore';

// Platform id → display name (mirrors dataSource.ts; kept local so the
// connect flow never imports the demo-data module).
const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  threads: 'Threads',
};
import { presentWebViewAuth, dismissWebViewAuth } from './webViewAuthPresenter';
import { trackConnectStarted, trackSocialAccountConnected } from './analytics';

const PENDING_KEY = '@appsurge/oauth_pending_v1';

type PendingHandoff = {
  platform: MobilePlatform;
  state: string | null;
  codeVerifier: string | null;
  startedAt: number;
};

let pending: PendingHandoff | null = null;
let webSessionStarted = false;



export type ConnectOutcome =
  | { kind: 'connected'; platform: MobilePlatform; record: ConnectionRecord }
  | { kind: 'error'; platform?: string; message: string }
  | { kind: 'cancelled' };

// ---- Outcome bus -----------------------------------------------------------
// Deep links can be consumed by the global handler (App.tsx) or by an
// awaiting connect flow. Whoever consumes publishes the outcome; screens
// subscribe so they always hear the result no matter who consumed.

type OutcomeListener = (outcome: ConnectOutcome) => void;
const outcomeListeners = new Set<OutcomeListener>();

export function subscribeToConnectOutcomes(listener: OutcomeListener): () => void {
  outcomeListeners.add(listener);
  return () => {
    outcomeListeners.delete(listener);
  };
}

function publishOutcome(outcome: ConnectOutcome): void {
  for (const listener of [...outcomeListeners]) {
    try {
      listener(outcome);
    } catch {
      // A broken listener must never break the connect flow.
    }
  }
}

// ---- Deep-link handling ---------------------------------------------------

export function isOAuthDeepLink(url: string | null): boolean {
  if (!url) return false;
  return url.startsWith('appsurge://auth/');
}

// The WebView intercepts the https launchpad callback before it loads, but
// downstream parsing only understands the appsurge:// scheme. Convert an
// https callback (https://app-surge.dev/auth/<p>/callback?code=…&state=…)
// into its appsurge:// equivalent so one consumer handles both paths.
export function toOAuthDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'appsurge:') return url;
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.hostname !== 'app-surge.dev' && parsed.hostname !== 'www.app-surge.dev') return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 3 || segments[0] !== 'auth' || segments[segments.length - 1] !== 'callback') return null;
    const deep = new URL(`appsurge://auth/${segments[1]}/callback`);
    parsed.searchParams.forEach((value, key) => deep.searchParams.set(key, value));
    return deep.toString();
  } catch {
    return null;
  }
}

/** True when a URL completes an OAuth flow in either form. */
export function isCompletionUrl(url: string): boolean {
  return isOAuthDeepLink(url) || toOAuthDeepLink(url) !== null;
}

export function parseOAuthDeepLink(url: string): { platform: string; code: string | null; state: string | null; error: string | null } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'appsurge:') return null;
    // Registered schemes put "auth" in host; unregistered ones can stuff it
    // into the pathname. Normalize both.
    const segments = `${parsed.host}${parsed.pathname}`.split('/').filter(Boolean);
    if (segments.length < 3 || segments[0] !== 'auth' || segments[segments.length - 1] !== 'callback') return null;
    const platform = segments[1];
    const strip = (value: string | null): string | null => {
      if (value == null) return null;
      const cleaned = value.replace(/\/+$/g, '');
      return cleaned.length > 0 ? cleaned : null;
    };
    return {
      platform,
      code: strip(parsed.searchParams.get('code')),
      state: strip(parsed.searchParams.get('state')),
      error: strip(parsed.searchParams.get('error')),
    };
  } catch {
    return null;
  }
}

function rememberPending(handoff: PendingHandoff) {
  pending = handoff;
  AsyncStorage.setItem(PENDING_KEY, JSON.stringify(handoff)).catch(() => undefined);
}

async function takePending(): Promise<PendingHandoff | null> {
  if (pending) {
    const current = pending;
    pending = null;
    AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
    return current;
  }
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingHandoff;
    AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
    if (Date.now() - parsed.startedAt < 30 * 60 * 1000) return parsed;
    return null;
  } catch {
    return null;
  }
}

// ---- Connect flow ----------------------------------------------------------

export async function startPlatformConnect(platform: MobilePlatform): Promise<ConnectOutcome> {
  const config = PLATFORM_CONFIGS[platform];
  trackConnectStarted(platform);
  try {
    const clientIds = await getOAuthClientIds();
    const clientId = clientIds[platform];
    if (!clientId) {
      const outcome: ConnectOutcome = { kind: 'error', message: `${config.label} OAuth is not configured on the Appsurge gateway yet. Try again soon.` };
      publishOutcome(outcome);
      return outcome;
    }

    const redirectUri = launchpadRedirectUri(platform);
    const needsPkce = config.supportsPkce;
    const pkce = needsPkce ? await generatePkce() : null;
    const state = generateState();

    const url = new URL(config.authEndpoint);
    url.searchParams.set(config.idParam, clientId);
    url.searchParams.set('scope', config.scope);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    if (pkce) {
      url.searchParams.set('code_challenge', pkce.challenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }
    for (const [key, value] of Object.entries(config.extraAuthParams ?? {})) {
      url.searchParams.set(key, value);
    }

    rememberPending({ platform, state, codeVerifier: pkce?.verifier ?? null, startedAt: Date.now() });

    webSessionStarted = true;

    // Presentation per platform:
    //  • Threads/Instagram — Meta's pages launch the installed app mid-chain
    //    in ANY browser (reproduced on-device: BarcelonaActivity receives the
    //    URL and drops it), so they authorize inside our own WebView, which
    //    never does app-link dispatch.
    //  • TikTok — verified working end-to-end in a Chrome Custom Tab today
    //    (code reached the gateway exchange), while TikTok's embedded-WebView
    //    login hits its post-login "hit a snag" error page. Keep it in a
    //    Custom Tab, shielded from direct app-link resolution by the 302 hop.
    //  • YouTube — Google has no app-link bounce; browser session as before.
    const authorizeUrl = url.toString();
    const useWebView = platform === 'threads' || platform === 'instagram';

    // Outcome gate: resolves as soon as ANY consumer publishes an outcome
    // (global deep-link handler or the WebView intercept below).
    const outcomeGate = waitForOutcome(platform, 150_000);

    let outcome: ConnectOutcome | null = null;
    let plainBrowser = false;

    try {
      if (useWebView) {
        presentWebViewAuth({
          platform,
          label: config.label,
          url: authorizeUrl,
          callbackOrigin: LAUNCHPAD_ORIGIN,
          redirectPath: config.redirectPath,
        });
        // The WebView completes the flow either via the appsurge:// deep link
        // (consumed by the global handler) or via the intercepted https
        // callback (routed through consumeOAuthDeepLink by the modal's
        // onDeepLink). Both publish to the outcome bus. Wait with the full
        // timeout; dismissal without a result is handled when the gate times
        // out or the user cancels.
        outcome = await outcomeGate;
        dismissWebViewAuth();
      } else {
        // Direct authorize URL — no hop. The 302 hop was a regression for
        // TikTok: its post-login validation fails across the cross-site
        // redirect chain ("hit a snag"). The direct Custom Tab flow is the
        // one verified working end-to-end on this device this morning.
        // (Hop remains server-side for any platform that still needs it;
        // viaAppLinkHop is a no-op for YouTube.)
        const target = authorizeUrl;
        try {
          const result = await WebBrowser.openAuthSessionAsync(target, redirectUri);
          const successUrl = result && result.type === 'success' && 'url' in result ? result.url : null;
          if (successUrl) {
            outcome = await consumeOAuthDeepLink(successUrl);
          }
        } catch {
          try {
            await WebBrowser.openBrowserAsync(target);
            plainBrowser = true;
          } catch {
            throw new Error('Could not open a browser window. Install Chrome or set a default browser, then try connecting again.');
          }
        }
        if (!outcome && plainBrowser) {
          // A real browser tab is open and the user may be signing in — wait
          // with the full timeout. Cutting off early would report "cancelled"
          // while the consent screen is still on screen.
          outcome = await outcomeGate;
        } else if (!outcome) {
          // Browser session ended without handing us the URL (Android: the
          // tab dismissed via deep link or the user backed out). Short grace
          // window for late deep-link delivery, then report cancelled.
          outcome = await Promise.race([
            outcomeGate,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
          ]);
        }
      }
    } catch (error) {
      webSessionStarted = false;
      dismissWebViewAuth();
      const failed: ConnectOutcome = {
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not open the sign-in page.',
      };
      publishOutcome(failed);
      return failed;
    }

    webSessionStarted = false;
    dismissWebViewAuth();
    return outcome ?? { kind: 'cancelled' };
  } catch (error) {
    webSessionStarted = false;
    const outcome: ConnectOutcome = { kind: 'error', message: error instanceof Error ? error.message : 'Could not start the connection flow.' };
    publishOutcome(outcome);
    return outcome;
  }
}

function waitForOutcome(platform: MobilePlatform, timeoutMs: number): Promise<ConnectOutcome | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: ConnectOutcome | null) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(outcome);
    };
    const unsubscribe = subscribeToConnectOutcomes((outcome) => {
      // Errors without a platform (e.g. unparseable redirect) belong to
      // whatever flow is active; platform-tagged outcomes must match.
      if (outcome.kind === 'connected' && outcome.platform !== platform) return;
      if (outcome.kind === 'error' && outcome.platform && outcome.platform !== platform) return;
      finish(outcome);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

export async function consumeOAuthDeepLink(rawUrl: string): Promise<ConnectOutcome | null> {
  // Accept both the appsurge:// deep link and the https launchpad callback
  // the WebView hands us — normalize to the deep-link form first.
  const url = toOAuthDeepLink(rawUrl) ?? rawUrl;
  // The global handler and an awaiting flow can observe the same deep
  // link. Only the first consumer acts; the rest are silent no-ops.
  if (isDuplicateConsumption(url)) return null;

  const parsed = parseOAuthDeepLink(url);
  if (!parsed) {
    const outcome: ConnectOutcome = { kind: 'error', message: 'Unrecognized sign-in redirect.' };
    publishOutcome(outcome);
    return outcome;
  }
  if (parsed.error) {
    const outcome: ConnectOutcome = { kind: 'error', platform: parsed.platform, message: `${parsed.platform} returned an error: ${parsed.error}` };
    publishOutcome(outcome);
    return outcome;
  }
  if (!parsed.code) {
    const outcome: ConnectOutcome = { kind: 'error', platform: parsed.platform, message: `${parsed.platform} did not return an auth code.` };
    publishOutcome(outcome);
    return outcome;
  }

  const handoff = await takePending();
  if (!handoff) {
    const outcome: ConnectOutcome = { kind: 'error', platform: parsed.platform, message: 'This sign-in attempt expired. Please try connecting again.' };
    publishOutcome(outcome);
    return outcome;
  }
  if (parsed.state && handoff.state && parsed.state !== handoff.state) {
    const outcome: ConnectOutcome = { kind: 'error', platform: parsed.platform, message: 'Sign-in state mismatch. Please try connecting again.' };
    publishOutcome(outcome);
    return outcome;
  }

  try {
    const tokens = await exchangeCodeForTokens({
      platform: handoff.platform,
      code: parsed.code,
      redirectUri: launchpadRedirectUri(handoff.platform),
      codeVerifier: handoff.codeVerifier ?? undefined,
    });

    let finalToken = tokens;
    if (handoff.platform === 'instagram') {
      try {
        finalToken = await upgradeInstagramToken(tokens.accessToken);
      } catch {
        // Keep the short-lived token; the connection still works today.
      }
    }

    const record = await saveConnection({
      platform: handoff.platform,
      accessToken: finalToken.accessToken,
      refreshToken: finalToken.refreshToken,
      expiresAt: finalToken.expiresIn ? Date.now() + finalToken.expiresIn * 1000 : undefined,
      scope: finalToken.scope,
      openId: finalToken.openId,
    });

    // Fire-and-forget: give the user a ready-to-review weekly plan the
    // moment their first platform is live.
    void buildWeeklyPlan().catch(() => undefined);

    // Update the phone's Updates tab (and the desktop's, via the same
    // Firestore collection).
    void logActivity({
      kind: 'platform-connected',
      platform: handoff.platform,
      source: 'mobile',
      title: `${PLATFORM_LABELS[handoff.platform] ?? handoff.platform} connected`,
      body: 'Ready to publish.',
    }).catch(() => undefined);

    trackSocialAccountConnected(handoff.platform);
    const outcome: ConnectOutcome = { kind: 'connected', platform: handoff.platform, record };
    publishOutcome(outcome);
    return outcome;
  } catch (error) {
    const outcome: ConnectOutcome = {
      kind: 'error',
      platform: parsed.platform,
      message: error instanceof Error ? error.message : 'Token exchange failed.',
    };
    publishOutcome(outcome);
    return outcome;
  }
}

// ---- Duplicate-consumption guard -------------------------------------------

const CONSUMED_TTL_MS = 60_000;
const consumedUrls = new Map<string, number>();

function isDuplicateConsumption(url: string): boolean {
  const now = Date.now();
  for (const [seenUrl, seenAt] of consumedUrls) {
    if (now - seenAt > CONSUMED_TTL_MS) consumedUrls.delete(seenUrl);
  }
  if (consumedUrls.has(url)) return true;
  consumedUrls.set(url, now);
  return false;
}

// Called from the root navigator when the app boots straight into a deep link.
export async function maybeHandleInitialUrl() {
  try {
    const url = await Linking.getInitialURL();
    if (url && isOAuthDeepLink(url)) void consumeOAuthDeepLink(url);
  } catch {
    // Nothing actionable — the user can retry from Settings.
  }
}

export function hasActiveWebSession(): boolean {
  return webSessionStarted;
}

// Called when the user closes the WebView modal without completing sign-in.
// Without this the awaiting connect flow would sit out its full 150-second
// timeout looking frozen — publish 'cancelled' so it resolves immediately.
export function notifyWebViewCancelled(): void {
  if (!webSessionStarted) return;
  publishOutcome({ kind: 'cancelled' });
}
