// In-app WebView OAuth modal — the definitive fix for verified App Link
// hijacking on Android.
//
// Reproduced live on-device: opening the Threads authorize URL in any
// browser (Custom Tab, plain tab, even behind our server-side 302 hop)
// ends with Meta's pages launching the installed Threads/Instagram app,
// which drops the URL ("Deeplink dropped: reason=unmatched_route") and
// the OAuth flow dies. Chrome only skips App Link resolution for *our*
// redirect; Meta's own pages re-trigger it from inside the chain.
//
// A WebView inside our own activity never performs app-link dispatch —
// the page renders in-app, the consent stays in-app, and the platform
// redirect comes back to us directly. Two completion paths, both handled:
//   1. Custom-scheme redirect → appsurge://auth/<platform>/callback (the
//      intent filter catches it at the OS level; the global deep-link
//      handler consumes it).
//   2. In-page navigation to our https launchpad callback — intercepted
//      here in shouldStartLoadWithRequest before any network happens and
//      converted to the same appsurge:// URL, so the flow works even if
//      a platform refuses custom-scheme redirects from its consent page.

import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { isCompletionUrl } from '../lib/connect';
import { notifyWebViewCancelled } from '../lib/connect';
import { colors, spacing } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Meta's authorize endpoint rejects misconfigured apps with a bare
// pretty-printed JSON body ({"error":{"message":...}}) instead of an HTML
// page. Detect that and translate it into plain English with the fix.
function prettyPrintErrorHint(body: string, label: string): string | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: string; type?: string; code?: number };
      error_description?: string;
    };
    const message = parsed.error?.message ?? parsed.error_description ?? '';
    if (!message) return null;
    return `The ${label} rejected the sign-in request:\n\n\u201C${message}\u201D\n\nThis means the Appsurge app isn't fully set up in the ${label} developer console — usually the redirect URL isn't allowlisted, or the app is still in Development mode (which only allows your own developer accounts to sign in).`;
  } catch {
    return null;
  }
}

export type WebViewAuthRequest = {
  platform: string;
  label: string;
  url: string;
  /** HTTPS callback origin(s) whose navigation completes the flow. */
  callbackOrigin: string;
  redirectPath: string;
};

type Props = {
  request: WebViewAuthRequest | null;
  /** Called when the WebView path completes the flow via an intercepted
   *  https callback (the appsurge:// deep link is handled globally). */
  onDeepLink: (url: string) => void;
  onClose: () => void;
};

export function WebViewAuthModal({ request, onDeepLink, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);
  const injectRef = useRef<WebView | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    handledRef.current = false;
    setError(null);
  }, [request?.url]);

  if (!request) return null;

  const finishWithUrl = (url: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    onDeepLink(url);
    onClose();
  };

  const intercept = (nav: WebViewNavigation): boolean => {
    const url = nav.url;
    // Any navigation that completes OAuth — the https launchpad callback OR
    // the appsurge:// deep link — is routed into the connect flow, which
    // normalizes https→appsurge internally (toOAuthDeepLink).
    if (isCompletionUrl(url)) {
      const callbackUrl = url;
      setTimeout(() => finishWithUrl(callbackUrl), 0);
      return false; // cancel the navigation — our app takes it from here
    }
    return true;
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Cancel sign-in"
            onPress={() => {
              notifyWebViewCancelled();
              onClose();
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            Sign in to {request.label}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>
              {typeof error === 'string' && error.includes('\u201C')
                ? error
                : `Couldn't load the ${request.label} sign-in page. Check your connection and try again.`}
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={onClose}>
              <Text style={styles.retryText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <WebView
            ref={injectRef}
            source={{ uri: request.url }}
            style={styles.web}
            onShouldStartLoadWithRequest={intercept}
            onNavigationStateChange={Platform.OS === 'android' ? undefined : intercept}
            onHttpError={(event) => {
              const { statusCode } = event.nativeEvent;
              if (statusCode >= 400) setError(`http-${statusCode}`);
            }}
            onError={() => setError('load')}
            onRenderProcessGone={() => setError('render')}
            // Meta serves JSON OAuth errors as the page body (HTTP 400 or 200).
            // After every load, read the body text; if it's the pretty-printed
            // JSON error, replace the whole webview with a readable explanation.
            onLoadEnd={() => {
              injectRef.current?.injectJavaScript(
                'window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ kind: "body", text: document.body && document.body.innerText ? document.body.innerText.slice(0, 2000) : "" })); true;',
              );
            }}
            onMessage={(event) => {
              try {
                const payload = JSON.parse(event.nativeEvent.data) as { kind?: string; text?: string };
                if (payload.kind !== 'body' || !payload.text) return;
                const hint = prettyPrintErrorHint(payload.text, request.label);
                if (hint) setError(hint);
              } catch {
                // Non-JSON page content — normal consent pages hit this.
              }
            }}
            // Third-party cookies are required by Meta's consent pages.
            domStorageEnabled
            javaScriptEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            setSupportMultipleWindows={false}
            // Keep the agent generic — Meta blocks known webview UAs on auth pages.
            userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
            incognito={false}
            cacheEnabled={false}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0D8',
  },
  closeText: { color: colors.accent, fontSize: 15, fontWeight: '600', minWidth: 64 },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.ink },
  headerSpacer: { minWidth: 64 },
  web: { flex: 1 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  errorText: { color: colors.muted, fontSize: 14, textAlign: 'center', marginBottom: spacing.md, maxWidth: 320 },
  retryBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
});
