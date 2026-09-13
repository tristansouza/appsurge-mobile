// Client for the Appsurge gateway (Cloudflare Worker).
//
// ALL platform OAuth client secrets and the Gemini API key live in the
// Worker's encrypted env bindings — never in this app. The mobile app
// authenticates with the single revocable GATEWAY_API_KEY (same key the
// desktop renderer uses) and every sensitive call is proxied:
//
//   GET  /config/oauth              → public client IDs for authorize URLs
//   POST /oauth/exchange            → code/refresh → tokens (secrets injected)
//   POST /instagram/token/upgrade   → short-lived IG token → long-lived
//   POST /gemini/{path}             → Gemini AI proxy (server key injected)

const GATEWAY_URL = (process.env.EXPO_PUBLIC_GATEWAY_URL ?? '').replace(/\/+$/, '');
const GATEWAY_API_KEY = (process.env.EXPO_PUBLIC_GATEWAY_API_KEY ?? '').trim();

export const gatewayConfigured = Boolean(GATEWAY_URL && GATEWAY_API_KEY);

export function gatewayNotConfiguredError(): Error {
  return new Error(
    'The Appsurge gateway is not configured in this build (EXPO_PUBLIC_GATEWAY_URL / EXPO_PUBLIC_GATEWAY_API_KEY).',
  );
}

async function gatewayFetch(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response> {
  if (!gatewayConfigured) throw gatewayNotConfiguredError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 25_000);
  try {
    return await fetch(`${GATEWAY_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GATEWAY_API_KEY}`,
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---- Public OAuth client IDs (safe to embed, not secrets) --------------

export type OAuthClientIds = Partial<Record<'tiktok' | 'instagram' | 'youtube' | 'threads', string>>;

let clientIdsCache: OAuthClientIds | null = null;

export async function getOAuthClientIds(): Promise<OAuthClientIds> {
  if (clientIdsCache) return clientIdsCache;
  const res = await gatewayFetch('/config/oauth', { method: 'GET', timeoutMs: 12_000 });
  if (!res.ok) throw new Error(`Gateway /config/oauth failed: HTTP ${res.status}`);
  const data = (await res.json()) as OAuthClientIds;
  clientIdsCache = Object.fromEntries(
    Object.entries(data).filter(([, value]) => typeof value === 'string' && value.length > 0),
  ) as OAuthClientIds;
  return clientIdsCache;
}

// ---- Token exchange (secrets stay server-side) --------------------------

export type PlatformTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  openId?: string;
  scope?: string;
  raw: unknown;
};

export async function exchangeCodeForTokens(input: {
  platform: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<PlatformTokenResponse> {
  const res = await gatewayFetch('/oauth/exchange', {
    method: 'POST',
    body: JSON.stringify({
      platform: input.platform,
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      ...(input.codeVerifier ? { code_verifier: input.codeVerifier } : {}),
    }),
  });
  const text = await res.text();
  return parseTokenResponse(text, `HTTP ${res.status}`);
}

export async function refreshPlatformToken(input: { platform: string; refreshToken: string }): Promise<PlatformTokenResponse> {
  const res = await gatewayFetch('/oauth/exchange', {
    method: 'POST',
    body: JSON.stringify({ platform: input.platform, grant_type: 'refresh_token', refresh_token: input.refreshToken }),
  });
  const text = await res.text();
  return parseTokenResponse(text, `HTTP ${res.status}`);
}

export async function upgradeInstagramToken(accessToken: string): Promise<PlatformTokenResponse> {
  const res = await gatewayFetch('/instagram/token/upgrade', {
    method: 'POST',
    body: JSON.stringify({ access_token: accessToken }),
  });
  const text = await res.text();
  return parseTokenResponse(text, `HTTP ${res.status}`);
}

// Normalizes TikTok / Instagram / YouTube / Threads token envelopes.
function parseTokenResponse(text: string, statusLabel: string): PlatformTokenResponse {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Token exchange failed (${statusLabel}): ${text.slice(0, 160)}`);
  }
  const tokenData: any = Array.isArray(data?.data) && data.data.length > 0
    ? data.data[0]
    : data?.data && typeof data.data === 'object'
      ? data.data
      : data;
  const accessToken = tokenData?.access_token ?? tokenData?.accessToken;
  if (!accessToken) {
    const code = data?.error ?? data?.error_code ?? data?.error_type;
    const desc = data?.error_description ?? data?.errorDescription ?? data?.error_message;
    throw new Error(`Token exchange rejected${code ? ` (${code})` : ''}${desc ? `: ${desc}` : ''}`);
  }
  return {
    accessToken,
    refreshToken: tokenData?.refresh_token ?? undefined,
    expiresIn: typeof tokenData?.expires_in === 'number' ? tokenData.expires_in : undefined,
    openId: tokenData?.open_id ?? tokenData?.user_id ?? undefined,
    scope: typeof tokenData?.scope === 'string' ? tokenData.scope : undefined,
    raw: data,
  };
}

// ---- Gemini AI proxy -----------------------------------------------------

export async function generateAiContent(prompt: string, maxOutputTokens = 1024): Promise<string> {
  const res = await gatewayFetch('/gemini/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST',
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens },
    }),
    timeoutMs: 45_000,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI request failed: HTTP ${res.status} ${text.slice(0, 160)}`);
  }
  const data: any = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((part: any) => part?.text ?? '').join('').trim()
    : '';
  if (!text) throw new Error('AI returned an empty response.');
  return text;
}
