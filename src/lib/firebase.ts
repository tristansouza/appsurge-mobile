import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase's React Native conditional export is selected by Metro at runtime;
// use the shared package entry here so TypeScript does not bind to web-only
// declaration files.
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Parameters<typeof initializeAuth>[1] extends { persistence?: infer Persistence } ? Persistence : never;
};

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Public web OAuth client used for Google sign-in (safe to embed).
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// iOS-native OAuth client. The native Google SDK on iOS REQUIRES a dedicated
// iOS-type OAuth client (Google Cloud console → Credentials → OAuth client
// ID → iOS, bundle com.appsurge). Passing the web client here crashes
// the app at signIn() time, so there is deliberately NO fallback: without a
// real iOS client the sign-in button is hidden on iOS instead.
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

const missing = Object.entries(firebaseConfig).filter(([, value]) => !value).map(([key]) => key);
if (missing.length) {
  console.warn(`Firebase config is incomplete. Missing: ${missing.join(', ')}. Copy .env.example to .env and restart Expo.`);
}

export const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);

let auth: Auth;
try {
  auth = initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });
} catch {
  auth = getAuth(firebaseApp);
}

export const isGoogleSignInConfigured = Boolean(googleWebClientId);

// Whether the Google button should render at all: Android rides the Firebase
// google-services.json client (works with just the web client ID); iOS needs
// the dedicated iOS-type client or the native SDK hard-crashes.
export function isGoogleAvailableOnThisPlatform(): boolean {
  return Platform.OS === 'ios' ? Boolean(googleIosClientId) : isGoogleSignInConfigured;
}
export const googleIosUrlScheme = googleIosClientId
  ? `com.googleusercontent.apps.${googleIosClientId.replace('.apps.googleusercontent.com', '')}`
  : null;

let googleConfigured = false;
export async function configureGoogleSignIn() {
  if (!googleWebClientId || googleConfigured) return googleConfigured;
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  const { Platform } = await import('react-native');
  GoogleSignin.configure({
    webClientId: googleWebClientId,
    // Only ever set from a real iOS-type OAuth client — see note above.
    ...(Platform.OS === 'ios' && googleIosClientId ? { iosClientId: googleIosClientId } : {}),
    offlineAccess: false,
  });
  googleConfigured = true;
  return true;
}

export { auth };
