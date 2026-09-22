import React from 'react';
import { ActivityIndicator, StyleSheet, StatusBar, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from './src/theme';
import { SessionProvider, useSession } from './src/lib/sessionContext';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { VerifyEmailScreen } from './src/screens/VerifyEmailScreen';
import { AppSetupScreen } from './src/screens/AppSetupScreen';
import { MainTabs } from './src/navigation/MainTabs';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadAppRecord } from './src/lib/cloudStore';
import { maybeHandleInitialUrl, consumeOAuthDeepLink, isCompletionUrl, isOAuthDeepLink } from './src/lib/connect';
import { subscribeWebViewAuth, dismissWebViewAuth } from './src/lib/webViewAuthPresenter';
import { WebViewAuthModal, type WebViewAuthRequest } from './src/ui/WebViewAuthModal';
import { NotificationGate } from './src/ui/NotificationGate';
import { trackAppOpened, trackTabViewed } from './src/lib/analytics';
import { Linking } from 'react-native';

const ONBOARDING_KEY = '@appsurge/onboarding_seen_v1';

// Compile-time flag (app.json extra): demo/store-capture builds skip auth,
// email verification, and setup, and open straight into the main app with
// the bundled demo dataset. Production builds never see this.
const DEMO_BUILD = String(process.env.EXPO_PUBLIC_DEMO_BUILD || '') === '1';

const queryClient = new QueryClient();
const Stack = createNativeStackNavigator();
const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.canvas, card: colors.canvas, text: colors.ink, primary: colors.accent, border: 'transparent' } };

// 'unseen' → show the first-launch onboarding; 'seen' → straight to auth/app.
function useOnboardingState(): ['checking' | 'unseen' | 'seen', () => void] {
  const [state, setState] = React.useState<'checking' | 'unseen' | 'seen'>(DEMO_BUILD ? 'seen' : 'checking');
  React.useEffect(() => {
    if (DEMO_BUILD) return;
    let active = true;
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((value) => { if (active) setState(value === 'true' ? 'seen' : 'unseen'); })
      .catch(() => { if (active) setState('unseen'); });
    return () => { active = false; };
  }, []);
  const complete = React.useCallback(() => {
    setState('seen');
    AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => undefined);
  }, []);
  return [state, complete];
}

// Checks whether the signed-in user has an app set up in Firestore. A null
// check result (offline / Firestore unreachable) falls through to the app so
// a connectivity blip never locks someone out of their own content.
function useAppSetup(enabled: boolean): ['checking' | 'needed' | 'ready' | 'unknown', () => void] {
  const [state, setState] = React.useState<'checking' | 'needed' | 'ready' | 'unknown'>(DEMO_BUILD ? 'ready' : 'checking');
  React.useEffect(() => {
    if (!enabled || DEMO_BUILD) return;
    let active = true;
    loadAppRecord().then((record) => {
      if (active) setState(record ? 'ready' : 'needed');
    }).catch(() => { if (active) setState('unknown'); });
    return () => { active = false; };
  }, [enabled]);
  const markReady = React.useCallback(() => setState('ready'), []);
  return [state, markReady];
}

// Routes OAuth deep links (appsurge://auth/...) into the connect flow, both
// on cold start and while the app is open.
function useDeepLinks() {
  const [webAuth, setWebAuth] = React.useState<WebViewAuthRequest | null>(null);
  React.useEffect(() => {
    void maybeHandleInitialUrl();
    const subscription = Linking.addEventListener('url', (event) => {
      if (isOAuthDeepLink(event.url)) void consumeOAuthDeepLink(event.url);
    });
    const unsub = subscribeWebViewAuth(setWebAuth);
    return () => {
      subscription.remove();
      unsub();
    };
  }, []);
  return webAuth;
}

function RootNavigator() {
  const { user, loading } = useSession();
  const [onboarding, completeOnboarding] = useOnboardingState();
  const authed = Boolean(user && user.emailVerified);
  const [setup, markSetupReady] = useAppSetup(authed);
  const webAuth = useDeepLinks();

  // Mandatory notifications gate: shown once per signed-in session before
  // the home screen, until permission is granted. Keyed by uid so signing
  // out and back in presents it again.
  const [notifyDoneFor, setNotifyDoneFor] = React.useState<string | null>(null);
  const notifyDone = notifyDoneFor !== null && notifyDoneFor === (user?.id ?? '');

  // Fire-and-forget lifecycle analytics. App Opened fires once per
  // RootNavigator mount (the navigator persists for the app's lifetime).
  // Lives ABOVE the early returns — hooks must run on every render.
  React.useEffect(() => {
    trackAppOpened();
  }, []);

  if (loading || onboarding === 'checking' || (authed && setup === 'checking')) {
    return <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View>;
  }

  const showOnboarding = onboarding === 'unseen' && !user;
  const needsSetup = authed && setup === 'needed';
  const showNotifyGate = authed && !needsSetup && !notifyDone;

  if (showNotifyGate) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        <NotificationGate onDone={() => setNotifyDoneFor(user?.id ?? '')} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}
      onStateChange={(navState) => {
        if (!navState) return;
        // Tab switches surface as route-name changes in the active stack.
        const route = navState.routes[navState.index];
        const name = route?.state?.routes?.[route.state.index ?? 0]?.name ?? route?.name;
        if (name) trackTabViewed(name);
      }}>
      {/* Translucent so the warm canvas draws behind the status bar clock/battery */}
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {showOnboarding && <Stack.Screen name="Onboarding">{() => <OnboardingScreen onDone={completeOnboarding} />}</Stack.Screen>}
        {!showOnboarding && !user && <Stack.Screen name="SignIn" component={SignInScreen} />}
        {user && !user.emailVerified && <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />}
        {!showOnboarding && needsSetup && <Stack.Screen name="AppSetup">{() => <AppSetupScreen onComplete={markSetupReady} />}</Stack.Screen>}
        {!showOnboarding && authed && !needsSetup && <Stack.Screen name="Main" component={MainTabs} />}
      </Stack.Navigator>
      <WebViewAuthModal
        request={webAuth}
        onDeepLink={(url) => {
          // The WebView intercepts the https launchpad callback (e.g.
          // https://app-surge.dev/auth/threads/callback?code=…) — accept BOTH
          // it and the appsurge:// deep link here. Filtering on
          // isOAuthDeepLink alone silently dropped the https callback, leaving
          // the connect flow to time out.
          if (isCompletionUrl(url)) void consumeOAuthDeepLink(url);
        }}
        onClose={() => dismissWebViewAuth()}
      />
    </NavigationContainer>
  );
}

export default function App() {
  return <AppErrorBoundary><QueryClientProvider client={queryClient}><SessionProvider><SafeAreaProvider><RootNavigator /></SafeAreaProvider></SessionProvider></QueryClientProvider></AppErrorBoundary>;
}
const styles = StyleSheet.create({ loading: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' } });
