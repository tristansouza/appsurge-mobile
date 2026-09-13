import { useSession } from '../lib/sessionContext';

// Compatibility adapter for existing screens while the app moves to the
// Firebase-backed session context.
export function useAuth() {
  const { user, loading, signIn, signOut } = useSession();
  return {
    session: user ? { token: '', user } : null,
    loading,
    signIn,
    signOut,
  };
}
