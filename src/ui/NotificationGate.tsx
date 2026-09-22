// Mandatory notifications gate — shown before the home screen on every
// fresh session until permission is granted. There is deliberately NO skip
// path: the user must grant (via the OS prompt) or enable via system
// Settings. The gate cannot be bypassed — without notifications Appsurge
// can't deliver the publish/fail/plan-ready alerts it exists for.
//
// iOS: maps to the system permission prompt via expo-notifications.
// Android 13+: POST_NOTIFICATIONS runtime permission via the same API.
// Android 12-: no runtime permission exists — getPermissionsAsync still
// resolves (granted) so those users are never blocked by an unaskable
// permission.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { colors, radius, shadow, spacing } from '../theme';
import { trackNotificationPermission } from '../lib/analytics';

export function NotificationGate({ onDone }: { onDone: (granted: boolean) => void }) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'ask' | 'denied'>('ask');
  const [retried, setRetried] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    try {
      const settings = await Notifications.getPermissionsAsync();
      if (settings.granted) {
        onDone(true);
        return;
      }
    } catch {
      // Permission API unavailable — don't trap the user on this screen.
      onDone(false);
      return;
    }
    setPhase('ask');
  }, [onDone]);

  // Whether the OS had already denied before this session's first prompt
  // (drives the denied_first analytics property).
  const deniedBeforePrompt = useRef(false);
  useEffect(() => {
    void Notifications.getPermissionsAsync().then((settings) => {
      deniedBeforePrompt.current = !settings.granted;
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // No-skip gate: when the user comes back from system Settings with
  // notifications enabled, let them through immediately instead of leaving
  // them stuck on this screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void Notifications.getPermissionsAsync()
        .then((settings) => { if (settings.granted) onDone(true); })
        .catch(() => undefined);
    });
    return () => sub.remove();
  }, [onDone]);

  const request = async () => {
    setBusy(true);
    try {
      const result = await Notifications.requestPermissionsAsync();
      if (result.granted) {
        trackNotificationPermission(true, deniedBeforePrompt.current);
        onDone(true);
      } else {
        trackNotificationPermission(false, deniedBeforePrompt.current);
        setPhase('denied');
      }
    } catch {
      trackNotificationPermission(false, deniedBeforePrompt.current);
      setPhase('denied');
    } finally {
      setBusy(false);
    }
  };

  // After a denial, the user can re-prompt right on this screen. Android
  // honors the second request dialog (if not permanently denied); iOS
  // resolves instantly with the stored denial, so we detect that and route
  // to Settings instead of spinning on a doomed request.
  const tryAgain = async () => {
    setBusy(true);
    try {
      const result = await Notifications.requestPermissionsAsync();
      if (result.granted) {
        onDone(true);
        return;
      }
      // A request that returns denied *immediately* (no dialog shown) means
      // the OS permanently denied — re-prompting in-app can't work. The note
      // below switches to steer the user to Settings, the only remaining path.
      setRetried(true);
      setPhase('denied');
    } catch {
      setRetried(true);
      setPhase('denied');
    } finally {
      setBusy(false);
    }
  };

  // After a hard denial (especially iOS), the only path back is Settings.
  const openSettings = () => {
    void Linking.openSettings();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.iconWrap}>
        <View style={styles.iconBadge}>
          <Icon name="notifications" size={30} color={colors.surface} />
        </View>
      </View>
      <Text style={styles.h1}>Stay in the loop</Text>
      <Text style={styles.body}>
        Appsurge needs notifications to tell you the moment a post goes live, if one fails, and when your
        weekly plan is ready to review.{'\n\n'}It's required for Appsurge to work properly.
      </Text>
      <View style={{ flex: 1 }} />
      {phase === 'denied' ? (
        <>
          <Text style={styles.deniedNote}>
            {retried
              ? "Your device is blocking the request. Enable notifications for Appsurge in system Settings — it takes a second."
              : "Notifications were denied — they're required for Appsurge. Let's try that again."}
          </Text>
          <Pressable style={styles.cta} onPress={tryAgain} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.surface} /> : (
              <>
                <Icon name="notifications-outline" size={17} color={colors.surface} />
                <Text style={styles.ctaText}>Try again</Text>
              </>
            )}
          </Pressable>
          <Pressable onPress={openSettings} hitSlop={10} disabled={busy}>
            <Text style={styles.laterLink}>Open Settings</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable style={styles.cta} onPress={request} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.surface} /> : (
              <>
                <Icon name="notifications-outline" size={17} color={colors.surface} />
                <Text style={styles.ctaText}>Allow notifications</Text>
              </>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.xl, justifyContent: 'flex-end' },
  iconWrap: { alignItems: 'center', marginBottom: spacing.lg },
  iconBadge: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...shadow },
  h1: { color: colors.ink, fontSize: 27, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center', marginBottom: 12 },
  body: { color: colors.muted, fontSize: 14.5, lineHeight: 22, textAlign: 'center' },
  deniedNote: { color: colors.muted, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginBottom: spacing.md },
  cta: { height: 54, borderRadius: radius.md, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: spacing.md },
  ctaText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  laterLink: { color: colors.subtle, fontSize: 13, fontWeight: '700', padding: 8 },
});
