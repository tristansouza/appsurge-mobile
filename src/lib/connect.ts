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
  type MobilePlatform,
} from './platformAuth';
import { buildWeeklyPlan, saveConnection, type ConnectionRecord } from './cloudStore';

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
  try {
    const clientIds = await getOAuthClientIds();
    const clientId = clientIds[platform];
    if (!clientId) {
      return { kind: 'error', message: `${config.label} OAuth is not configured on the Appsurge gateway yet. Try again soon.` };
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
    const browserSession = WebBrowser.openAuthSessionAsync(
      url.toString(),
      redirectUri,
    ).catch(() => null);

    // Outcome gate: resolves as soon as ANY consumer publishes an outcome
    // (global deep-link handler or the local consume below).
    const outcomeGate = waitForOutcome(platform, 150_000);

    let outcome: ConnectOutcome | null = null;

    // iOS resolves the session with the redirect URL directly.
    const browserResult = await browserSession;
    const successUrl =
      browserResult && browserResult.type === 'success' && 'url' in browserResult
        ? browserResult.url
        : null;
    if (successUrl) {
      outcome = await consumeOAuthDeepLink(successUrl);
    }

    if (!outcome) {
      // Browser session ended without handing us the URL (Android: the tab
      // dismissed via deep link or the user backed out). The deep link has
      // usually already been consumed by the global handler — but on some
      // Android builds it lands a beat later. Short grace window, then
      // report cancelled.
      outcome = await Promise.race([
        outcomeGate,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
      ]);
    }

    webSessionStarted = false;
    return outcome ?? { kind: 'cancelled' };
  } catch (error) {
    webSessionStarted = false;
    return { kind: 'error', message: error instanceof Error ? error.message : 'Could not start the connection flow.' };
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

export async function consumeOAuthDeepLink(url: string): Promise<ConnectOutcome | null> {
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
