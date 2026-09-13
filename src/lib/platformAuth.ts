import { Platform as RNPlatform } from 'react-native';

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
  },
  threads: {
    id: 'threads',
    label: 'Threads',
    authEndpoint: 'https://threads.net/oauth/authorize',
    idParam: 'client_id',
    redirectPath: '/auth/threads/callback',
    scope: 'threads_basic,threads_content_publish,threads_manage_insights',
    supportsPkce: false,
  },
};

const LAUNCHPAD_ORIGIN = (process.env.EXPO_PUBLIC_LAUNCHPAD_ORIGIN ?? 'https://app-surge.dev').replace(/\/+$/, '');

export function launchpadRedirectUri(platform: MobilePlatform): string {
  return `${LAUNCHPAD_ORIGIN}${PLATFORM_CONFIGS[platform].redirectPath}`;
}

export function redirectOriginIsCustom(): boolean {
  return LAUNCHPAD_ORIGIN !== 'https://app-surge.dev';
}

// ---- PKCE (RFC 7636) — react-native getters, Expo crypto polyfills ------

function randomBytesUrlSafe(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // btoa is available in Hermes / Expo runtimes.
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomBytesUrlSafe(64);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  let s = '';
  for (const byte of new Uint8Array(digest)) s += String.fromCharCode(byte);
  const challenge = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { verifier, challenge };
}

export function generateState(): string {
  return randomBytesUrlSafe(32);
}

export function humanLabel(platform: string): string {
  const config = (PLATFORM_CONFIGS as Record<string, PlatformOAuthConfig | undefined>)[platform];
  if (config) return config.label;
  return platform === 'x' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1);
}

export const isAndroid = RNPlatform.OS === 'android';
