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

let googleConfigured = false;
export async function configureGoogleSignIn() {
  if (!googleWebClientId || googleConfigured) return googleConfigured;
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: googleWebClientId, offlineAccess: false });
  googleConfigured = true;
  return true;
}

export { auth };
