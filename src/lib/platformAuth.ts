import { Platform as RNPlatform } from 'react-native';
import * as Crypto from 'expo-crypto';

// Platform OAuth configs for the mobile connect flow.
//
// Mirrors desktop-app/src/platConnect.ts so both apps drive the same
// providers. The redirect lands on the Appsurge launchpad
// (https://app-surge.dev/auth/<platform>/callback), whose relay page hands
// the auth code back into this app via the `appsurge://` deep link —
// registered in AndroidManifest.xml and the iOS Info.plist via the
// "appsurge" scheme (app.json "scheme"). Token exchange always goes through
// the gateway Worker so client secrets never touch the client.

export type MobilePlatform = 'tiktok' | 'instagram' | 'youtube' | 'threads';

export const OAUTH_PLATFORMS: MobilePlatform[] = ['tiktok', 'instagram', 'youtube', 'threads'];

export type PlatformOAuthConfig = {
  id: MobilePlatform;
  label: string;
  authEndpoint: string;
  /** OAuth client-id query param name — TikTok expects `client_key`. */
  idParam: 'client_key' | 'client_id';
  redirectPath: string;
  scope: string;
  supportsPkce: boolean;
  extraAuthParams?: Record<string, string>;
  /** Host the authorize page lives on (used for the WebView decision). */
  authorizeHost: string;
};

export const PLATFORM_CONFIGS: Record<MobilePlatform, PlatformOAuthConfig> = {
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    authEndpoint: 'https://www.tiktok.com/v2/auth/authorize/',
    idParam: 'client_key',
    redirectPath: '/auth/tiktok/callback',
    // Guaranteed Login Kit pair — works for every TikTok dev app with no
    // extra scope approval. Video scopes can be opted into later.
    scope: 'user.info.basic,user.info.profile',
    supportsPkce: true,
    authorizeHost: 'www.tiktok.com',
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    authEndpoint: 'https://www.instagram.com/oauth/authorize',
    idParam: 'client_id',
    redirectPath: '/auth/instagram/callback',
    scope: 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights',
    // Instagram Business Login's documented flow is not PKCE-based; sending
    // PKCE params to Meta surfaces a misleading "Invalid platform app" page.
    supportsPkce: false,
    authorizeHost: 'www.instagram.com',
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    idParam: 'client_id',
    redirectPath: '/auth/youtube/callback',
    scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload',
    supportsPkce: true,
    extraAuthParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    authorizeHost: 'accounts.google.com',
  },
  threads: {
    id: 'threads',
    label: 'Threads',
    authEndpoint: 'https://threads.net/oauth/authorize',
    idParam: 'client_id',
    redirectPath: '/auth/threads/callback',
    scope: 'threads_basic,threads_content_publish,threads_manage_insights',
    supportsPkce: false,
    authorizeHost: 'threads.net',
  },
};

export const LAUNCHPAD_ORIGIN = (process.env.EXPO_PUBLIC_LAUNCHPAD_ORIGIN ?? 'https://app-surge.dev').replace(/\/+$/, '');

export function launchpadRedirectUri(platform: MobilePlatform): string {
  return `${LAUNCHPAD_ORIGIN}${PLATFORM_CONFIGS[platform].redirectPath}`;
}

// Threads and Instagram have verified Android App Links, so opening their
// authorize URLs directly from a mobile browser bounces into the platform's
// app and the OAuth flow dies there. Starting the browser on our own domain
// (which no app claims) and hopping to the platform via JS avoids that —
// Chrome does not fire app-link interception on JS-issued navigations.
const APP_LINK_BOUNCE_HOSTS = new Set([
  'threads.net', 'www.threads.net',
  'instagram.com', 'www.instagram.com',
  // TikTok's authorize host claims verified App Links too — same hijack.
  'tiktok.com', 'www.tiktok.com',
]);

/** Wrap a platform authorize URL in the launchpad hop page if its host is
 *  known to bounce mobile browsers into the native app. */
export function viaAppLinkHop(authorizeUrl: string): string {
  try {
    const host = new URL(authorizeUrl).hostname;
    if (!APP_LINK_BOUNCE_HOSTS.has(host)) return authorizeUrl;
    // Server-side 302 (Cloudflare Pages Function). Chrome does not resolve
    // App Links on HTTP redirects, so this reliably stays in the browser —
    // a JS-navigation hop page is NOT exempt and bounced into the app again.
    const hop = new URL(`${LAUNCHPAD_ORIGIN}/auth/hop`);
    hop.searchParams.set('to', authorizeUrl);
    return hop.toString();
  } catch {
    return authorizeUrl;
  }
}

export function redirectOriginIsCustom(): boolean {
  return LAUNCHPAD_ORIGIN !== 'https://app-surge.dev';
}

// ---- PKCE (RFC 7636) -------------------------------------------------------
// Hermes (React Native's JS engine) does NOT implement WebCrypto, so
// `globalThis.crypto.getRandomValues` / `crypto.subtle.digest` throw here.
// All randomness and hashing goes through expo-crypto's native module, and
// base64url is done by hand so we never depend on Hermes's btoa support.

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];
    out += B64URL[b1 >> 2];
    out += B64URL[((b1 & 0x03) << 4) | ((b2 ?? 0) >> 4)];
    if (b2 === undefined) break;
    out += B64URL[((b2 & 0x0f) << 2) | ((b3 ?? 0) >> 6)];
    if (b3 === undefined) break;
    out += B64URL[b3 & 0x3f];
  }
  return out;
}

function base64ToBase64Url(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = bytesToBase64Url(Crypto.getRandomBytes(64));
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return { verifier, challenge: base64ToBase64Url(digest) };
}

export function generateState(): string {
  return bytesToBase64Url(Crypto.getRandomBytes(32));
}

export function humanLabel(platform: string): string {
  const config = (PLATFORM_CONFIGS as Record<string, PlatformOAuthConfig | undefined>)[platform];
  if (config) return config.label;
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export const isAndroid = RNPlatform.OS === 'android';
