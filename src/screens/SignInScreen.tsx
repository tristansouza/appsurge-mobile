import React, { useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { useSession } from '../lib/sessionContext';
import { trackSignInStarted, trackPasswordResetRequested } from '../lib/analytics';
import { colors, globalStyles, radius, shadow, spacing, warmShadowColor } from '../theme';

function GoogleG() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export function SignInScreen() {
  const { signIn, signInWithGoogle, resetPassword, error, clearError, googleAvailable } = useSession();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    clearError();
    setNotice(null);
    if (!email.trim() || !password) {
      setNotice('Enter your email and a password (at least 6 characters).');
      return;
    }
    setBusy(true);
    try {
      // Signs in, or creates the account automatically if it doesn't exist.
      trackSignInStarted('email');
      await signIn(email, password);
    } catch {
      // The session context exposes the friendly error.
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    clearError();
    setNotice(null);
    setBusy(true);
    try {
      trackSignInStarted('google');
      await signInWithGoogle();
    } catch {
      // The session context exposes the friendly error.
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) {
      setNotice('Enter your email first.');
      return;
    }
    try {
      await resetPassword(email);
      trackPasswordResetRequested();
      setNotice('Password reset email sent.');
    } catch {
      // The session context exposes the friendly error.
    }
  };

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.brand}>
          <Image source={require('../../appsurgeicon-fullbleed.png')} style={styles.appIcon} />
          <Text style={styles.brandText}>Appsurge</Text>
        </View>
        <View style={styles.hero}>
          <Text style={globalStyles.h1}>Welcome back.</Text>
          <Text style={styles.subtitle}>Your content engine, in your pocket.</Text>
        </View>
        <View style={styles.form}>
          {googleAvailable && (
            <>
              <Pressable disabled={busy} onPress={google} style={styles.googleButton}>
                <GoogleG />
                <Text style={styles.googleText}>Continue with Google</Text>
              </Pressable>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}
          <Text style={styles.label}>EMAIL</Text>
          <TextInput autoCapitalize="none" keyboardType="email-address" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} value={email} onChangeText={setEmail} placeholder="you@company.com" placeholderTextColor={colors.subtle} style={styles.input} />
          <Text style={[styles.label, { marginTop: spacing.lg }]}>PASSWORD</Text>
          <View style={styles.passwordWrap}>
            <TextInput ref={passwordRef} secureTextEntry={!showPassword} returnKeyType="go" submitBehavior="submit" onSubmitEditing={() => { if (!busy) void submit(); }} value={password} onChangeText={setPassword} placeholder="At least 6 characters" placeholderTextColor={colors.subtle} style={[styles.input, styles.passwordInput]} />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} style={styles.eyeBtn} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
              <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={colors.muted} />
            </Pressable>
          </View>
          {email.trim() ? (
            <Pressable onPress={forgot} style={styles.forgot}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          ) : null}
          {(error || notice) && <Text style={styles.message}>{error ?? notice}</Text>}
          <Pressable disabled={busy} onPress={submit} style={styles.button}>
            <Text style={styles.buttonText}>{busy ? 'Please wait...' : 'Sign in'}</Text>
            <Icon name="arrow-forward" size={18} color={colors.surface} />
          </Pressable>
          <Text style={styles.hint}>Tip: use your work email — your whole team can share the same plan.</Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.xl },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appIcon: { width: 32, height: 32, borderRadius: 9 },
  brandText: { color: colors.ink, fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  hero: { marginTop: 56, marginBottom: 30 },
  subtitle: { color: colors.muted, fontSize: 16, marginTop: spacing.sm },
  form: {},
  googleButton: { height: 56, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  googleText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  dividerText: { color: colors.subtle, fontSize: 12, fontWeight: '700' },
  label: { color: colors.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: '800', marginBottom: 9 },
  input: { height: 54, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.ink, fontSize: 15, shadowColor: warmShadowColor, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  eyeBtn: { position: 'absolute', right: 14, height: 54, justifyContent: 'center', alignItems: 'center' },
  forgot: { alignSelf: 'flex-end', marginTop: 13 },
  forgotText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  message: { color: colors.accent, fontSize: 13, lineHeight: 18, marginTop: 14 },
  button: { height: 56, borderRadius: radius.md, backgroundColor: colors.accent, marginTop: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  hint: { color: colors.subtle, fontSize: 12, lineHeight: 17, marginTop: 18, textAlign: 'center' },
});
