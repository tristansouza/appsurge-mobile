// WebView auth presenter — a tiny module-level store the connect flow and
// the root component share. connect.ts requests a WebView session; App.tsx
// renders <WebViewAuthModal /> from this state. Kept out of React context
// because the connect flow runs outside the component tree.

import type { WebViewAuthRequest } from '../ui/WebViewAuthModal';

type Listener = (request: WebViewAuthRequest | null) => void;

let current: WebViewAuthRequest | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of [...listeners]) {
    try {
      listener(current);
    } catch {
      // A broken listener must never break the flow.
    }
  }
}

export function presentWebViewAuth(request: WebViewAuthRequest): void {
  current = request;
  emit();
}

export function dismissWebViewAuth(): void {
  current = null;
  emit();
}

export function subscribeWebViewAuth(listener: Listener): () => void {
  listeners.add(listener);
  // Sync late subscribers immediately.
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
