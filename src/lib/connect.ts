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
// X has no OAuth support in the gateway, so it is offered as a manual
// "connect on desktop" flow.

import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { generateAiContent, getOAuthClientIds, exchangeCodeForTokens, upgradeInstagramToken } from './gateway';
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

export type ConnectOutcome =
  | { kind: 'connected'; platform: MobilePlatform; record: ConnectionRecord }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

let pending: PendingHandoff | null = null;
let webSessionStarted = false;

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

    // In-app browser session: on Android Chrome Custom Tab, on iOS the
    // Safari view controller. When the relay page deep-links back into the
    // app, Android dismisses the custom tab automatically.
    webSessionStarted = true;
    const result = await WebBrowser.openAuthSessionAsync(url.toString(), redirectUri);
    webSessionStarted = false;

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { kind: 'cancelled' };
    }

    // iOS may hand the redirect URL back directly.
    if (result.type === 'success' && result.url) {
      return await consumeOAuthDeepLink(result.url);
    }

    // Android delivers the redirect as a deep link instead — wait for the
    // app to be resumed with the appsurge:// URL.
    const deepLinkUrl = await waitForDeepLink(20_000);
    if (!deepLinkUrl) return { kind: 'cancelled' };
    return await consumeOAuthDeepLink(deepLinkUrl);
  } catch (error) {
    webSessionStarted = false;
    return { kind: 'error', message: error instanceof Error ? error.message : 'Could not start the connection flow.' };
  }
}

function waitForDeepLink(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (url: string | null) => {
      if (settled) return;
      settled = true;
      subscription.remove();
      clearTimeout(timer);
      resolve(url);
    };
    const subscription = Linking.addEventListener('url', (event) => {
      if (isOAuthDeepLink(event.url)) finish(event.url);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
    // The deep link may have arrived before the listener attached.
    Linking.getInitialURL().then((url) => {
      if (url && isOAuthDeepLink(url)) finish(url);
    }).catch(() => undefined);
  });
}

export async function consumeOAuthDeepLink(url: string): Promise<ConnectOutcome> {
  const parsed = parseOAuthDeepLink(url);
  if (!parsed) return { kind: 'error', message: 'Unrecognized sign-in redirect.' };
  if (parsed.error) return { kind: 'error', message: `${parsed.platform} returned an error: ${parsed.error}` };
  if (!parsed.code) return { kind: 'error', message: `${parsed.platform} did not return an auth code.` };

  const handoff = await takePending();
  if (!handoff) return { kind: 'error', message: 'This sign-in attempt expired. Please try connecting again.' };
  if (parsed.state && handoff.state && parsed.state !== handoff.state) {
    return { kind: 'error', message: 'Sign-in state mismatch. Please try connecting again.' };
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

    return { kind: 'connected', platform: handoff.platform, record };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'Token exchange failed.' };
  }
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
