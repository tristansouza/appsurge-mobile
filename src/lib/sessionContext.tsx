import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '../types';

// Demo build (EXPO_PUBLIC_DEMO_BUILD=1, set via app.json extra): no Firebase,
// no network — just a realistic signed-in user so store captures show real
// content. Production builds never read this flag.
const DEMO_BUILD = String(process.env.EXPO_PUBLIC_DEMO_BUILD || '') === '1';
const DEMO_USER: User = {
  id: 'demo-user',
  name: 'Tristan Souza',
  email: 'tristan@app-surge.dev',
  emailVerified: true,
};
import { firebaseErrorMessage, resetPassword, signIn, signOut, signUp, signInWithGoogle, isGoogleAvailable, subscribeToSession, resendVerificationEmail, reloadVerificationState, updateDisplayName } from './session';

type SessionContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  clearError: () => void;
  clearNotice: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  googleAvailable: boolean;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerification: () => Promise<void>;
  checkVerification: () => Promise<boolean>;
  renameSelf: (name: string) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (DEMO_BUILD) {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }
    let active = true;
    const unsubscribe = subscribeToSession((nextUser) => {
      if (active) {
        setUser(nextUser);
        setLoading(false);
      }
    });
    const fallback = setTimeout(() => active && setLoading(false), 2500);
    return () => {
      active = false;
      clearTimeout(fallback);
      unsubscribe();
    };
  }, []);

  const run = async (operation: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    try {
      await operation();
    } catch (cause) {
      setError(firebaseErrorMessage(cause));
      throw cause;
    }
  };

  const value = useMemo<SessionContextValue>(() => ({
    user,
    loading,
    error,
    notice,
    clearError: () => setError(null),
    clearNotice: () => setNotice(null),
    signIn: (email, password) => run(async () => { await signIn(email, password); }),
    signUp: (name, email, password) => run(async () => { await signUp(name, email, password); }),
    signInWithGoogle: () => run(async () => { await signInWithGoogle(); }),
    googleAvailable: isGoogleAvailable(),
    resetPassword: (email) => run(async () => { await resetPassword(email); }),
    signOut: () => run(async () => { await signOut(); }),
    renameSelf: async (name) => {
      await updateDisplayName(name);
      if (user) setUser({ ...user, name: name.trim().slice(0, 60) });
    },
    resendVerification: () => run(async () => {
      const result = await resendVerificationEmail();
      setNotice(result === 'already-verified' ? 'Your email is already verified — tap "I verified my email" below.' : 'Confirmation email sent. Check your inbox.');
    }),
    checkVerification: async () => {
      try {
        if (DEMO_BUILD) return true;
        const verified = await reloadVerificationState();
        if (verified && user) setUser({ ...user, emailVerified: true });
        return verified;
      } catch (cause) {
        setError(firebaseErrorMessage(cause));
        return false;
      }
    },
  }), [user, loading, error, notice]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
