import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithCredential, GoogleAuthProvider, signOut as firebaseSignOut, updateProfile, type User as FirebaseUser } from 'firebase/auth';
import { auth, configureGoogleSignIn, isGoogleSignInConfigured } from './firebase';
import { User } from '../types';

export function mapFirebaseUser(user: FirebaseUser): User {
  return { id: user.uid, name: user.displayName ?? user.email?.split('@')[0] ?? 'Appsurge user', email: user.email ?? '', avatar: user.photoURL ?? undefined, emailVerified: user.emailVerified };
}

export function subscribeToSession(onChange: (user: User | null) => void) {
  return onAuthStateChanged(auth, (user) => onChange(user ? mapFirebaseUser(user) : null));
}

export async function signIn(email: string, password: string) {
  try {
    const result = await signInWithEmailAndPassword(auth, email.trim(), password);
    return mapFirebaseUser(result.user);
  } catch (error) {
    // No account yet for this email — create one automatically so a new
    // user never has to find the sign-up form first. Firebase then sends
    // its built-in email confirmation (verification) message.
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'auth/invalid-credential') {
      try {
        const created = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(created.user);
        return mapFirebaseUser(created.user);
      } catch {
        throw error; // surface the original sign-in error
      }
    }
    throw error;
  }
}

export async function signUp(name: string, email: string, password: string) {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name.trim()) await updateProfile(result.user, { displayName: name.trim() });
  await sendEmailVerification(result.user); // Firebase's email confirmation template
  return mapFirebaseUser(result.user);
}

export async function resendVerificationEmail() {
  const user = auth.currentUser;
  if (!user) throw new Error('You need to be signed in first.');
  if (user.emailVerified) return 'already-verified';
  await sendEmailVerification(user);
  return 'sent';
}

export async function reloadVerificationState() {
  const user = auth.currentUser;
  if (!user) return false;
  await user.reload();
  return user.emailVerified;
}

export async function signInWithGoogle() {
  if (!isGoogleSignInConfigured) {
    throw new Error('Google sign-in needs the Android client ID from your Firebase console. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to .env, then rebuild the app.');
  }
  const configured = await configureGoogleSignIn();
  if (!configured) {
    throw new Error('Google sign-in needs the Android client ID from your Firebase console. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to .env, then rebuild the app.');
  }
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (!result.data?.idToken) throw new Error('Google sign-in was cancelled.');
  const credential = GoogleAuthProvider.credential(result.data.idToken);
  const userCred = await signInWithCredential(auth, credential);
  return mapFirebaseUser(userCred.user);
}

export function isGoogleAvailable() {
  return isGoogleSignInConfigured;
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOut() {
  await firebaseSignOut(auth);
}

export async function getIdToken() {
  return auth.currentUser?.getIdToken() ?? null;
}

export function firebaseErrorMessage(error: unknown) {
  if (error instanceof Error && error.message && !error.message.startsWith('Firebase:')) return error.message;
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account exists for this email.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/account-exists-with-different-credential': 'This email already has a password account. Sign in with your password first.',
    '12501': 'Google sign-in was cancelled.',
  };
  return messages[code] ?? (error instanceof Error ? error.message : 'Something went wrong. Try again.');
}
