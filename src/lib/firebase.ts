import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
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

// iOS-native OAuth client. Google auto-registers the
// com.googleusercontent.apps.<id>:// redirect for every OAuth client, so the
// web client's ID works as the iOS client ID — as long as its reversed form
// is registered as a URL scheme in the iOS build (handled via app.json).
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? googleWebClientId;

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
    // iOS requires its own client ID; without it the SDK throws
    // "failed to determine clientID" at signIn() time.
    ...(Platform.OS === 'ios' && googleIosClientId ? { iosClientId: googleIosClientId } : {}),
    offlineAccess: false,
  });
  googleConfigured = true;
  return true;
}

export { auth };
