import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { useSession } from '../lib/sessionContext';
import { colors, globalStyles, radius, shadow, spacing } from '../theme';

/**
 * Shown right after account creation until the user taps the link in the
 * Firebase email confirmation message. Fires once per mount automatically,
 * then re-checks whenever the user taps "I verified my email".
 */
export function VerifyEmailScreen() {
  const insets = useSafeAreaInsets();
  const { user, resendVerification, checkVerification, signOut, error, notice, clearError, clearNotice } = useSession();
  const [checking, setChecking] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // Poll a few times right after mount — by the time the user switches to
  // their mail app and back, verification usually already landed.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        if (cancelled) return;
        const verified = await checkVerification();
        if (verified || cancelled) return;
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const resend = async () => {
    clearError();
    clearNotice();
    try {
      await resendVerification();
      setSeconds(45);
    } catch {
      // surfaced through context error
    }
  };

  const recheck = async () => {
    setChecking(true);
    clearError();
    try {
      await checkVerification();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.xxl }]}>
      <View style={styles.card}>
        <View style={styles.badge}>
          <Icon name="mail-outline" size={26} color={colors.accent} />
        </View>
        <Text style={globalStyles.h2}>Confirm your email</Text>
        <Text style={styles.copy}>
          We sent a confirmation link to <Text style={styles.email}>{user?.email}</Text>.
          Tap it to activate your account — it's Firebase's standard email confirmation.
        </Text>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={recheck} disabled={checking} style={styles.primary}>
          <Text style={styles.primaryText}>{checking ? 'Checking...' : 'I verified my email'}</Text>
        </Pressable>
        <Pressable onPress={resend} disabled={seconds > 0} style={styles.secondary}>
          <Text style={[styles.secondaryText, seconds > 0 && styles.secondaryDisabled]}>
            {seconds > 0 ? `Resend available in ${seconds}s` : 'Resend confirmation email'}
          </Text>
        </Pressable>
        <Pressable onPress={() => signOut()} style={styles.signOut}>
          <Text style={styles.signOutText}>Use a different account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, ...shadow },
  badge: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  email: { color: colors.ink, fontWeight: '800' },
  notice: { color: colors.green, fontSize: 13, fontWeight: '700' },
  error: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  primary: { height: 54, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  secondary: { height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  secondaryDisabled: { color: colors.subtle },
  signOut: { alignItems: 'center', paddingVertical: spacing.sm },
  signOutText: { color: colors.subtle, fontSize: 13, fontWeight: '700' },
});
