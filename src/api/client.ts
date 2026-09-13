const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://app-surge.dev/api';

export async function apiRequest<T>(path: string, options: RequestInit = {}, sessionToken?: string): Promise<T> {
  const token = sessionToken ?? process.env.EXPO_PUBLIC_API_TOKEN;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) throw new Error(`Appsurge API error: ${response.status}`);
  return response.json() as Promise<T>;
}

export const api = {
  signIn: (email: string, password: string) => apiRequest<{ token: string; user: import('../types').User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
};
