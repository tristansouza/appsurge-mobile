import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform as RNPlatform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { recommendPlatformsAndHashtags } from '../lib/aiPlanner';
import {
  buildWeeklyPlan,
  loadAppRecord,
  loadConnections,
  saveAppRecord,
  type AppRecord,
} from '../lib/cloudStore';
import { startPlatformConnect, subscribeToConnectOutcomes, type ConnectOutcome } from '../lib/connect';
import { trackSetupStarted, trackSetupRecommendations, trackSetupCompleted, trackPlanGenerated, trackPlanGenerationFailed } from '../lib/analytics';
import { PLATFORM_CONFIGS, humanLabel } from '../lib/platformAuth';
import { PlatformId } from '../types';
import { colors, radius, shadow, spacing } from '../theme';

// Flow after sign-in: connect accounts FIRST, then app details, then the AI
// picks, then the weekly plan. Connecting needs no app info, so it goes first.
const WIZARD_STEPS = ['Connect', 'App', 'Our picks', 'Plan'] as const;

const SELECTABLE_PLATFORMS: PlatformId[] = ['tiktok', 'instagram', 'youtube', 'threads'];
const CONNECTABLE_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'threads'] as const;

export function AppSetupScreen({ onComplete }: { onComplete: (app: AppRecord | null) => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [appName, setAppName] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [appleStoreUrl, setAppleStoreUrl] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');

  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [rationale, setRationale] = useState('');
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [connecting, setConnecting] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [existing, setExisting] = useState<AppRecord | null>(null);
  const [checkedExisting, setCheckedExisting] = useState(false);

  // Prefill from Firestore: an app the user set up before, and any platforms
  // they already connected (so returning users see them as Connected).
  useEffect(() => {
    let active = true;
    loadAppRecord().then((record) => {
      if (!active) return;
      setCheckedExisting(true);
      if (!record) { trackSetupStarted(); return; }
      setExisting(record);
      setAppName(record.name ?? '');
      setStoreUrl(record.storeUrl || '');
      setAppleStoreUrl(record.appleStoreUrl || '');
      setPlatforms(record.platforms ?? []);
      setHashtags(record.hashtags ?? []);
      setRationale(record.aiRationale ?? '');
    }).catch(() => { if (active) setCheckedExisting(true); });
    loadConnections().then((connections) => {
      if (!active) return;
      const map: Record<string, boolean> = {};
      for (const connection of connections) {
        if (connection.connected) map[connection.platform] = true;
      }
      setConnected(map);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  // Connect outcomes arrive via the bus in connect.ts — the deep link may be
  // consumed by the global handler (App.tsx) while the browser session is
  // still open on Android, so the screen must listen rather than rely on the
  // startPlatformConnect return value alone.
  React.useEffect(() => {
    const unsubscribe = subscribeToConnectOutcomes((outcome: ConnectOutcome) => {
      if (outcome.kind === 'connected') {
        setConnected((current) => ({ ...current, [outcome.platform]: true }));
        setError('');
      } else if (outcome.kind === 'error') {
        setError(outcome.message);
      }
    });
    return unsubscribe;
  }, []);

  const handleConnect = async (platform: (typeof CONNECTABLE_PLATFORMS)[number]) => {
    setError('');
    setConnecting(platform);
    try {
      const outcome = await startPlatformConnect(platform);
      // Deep-link outcomes arrive via the subscription above, but failures
      // before the browser opens (gateway, PKCE, browser launch) only come
      // back through the return value — surface those here so a tap can
      // never silently do nothing.
      if (outcome.kind === 'error') setError(outcome.message);
    } catch {
      setError('Could not start the connection flow. Check your internet and try again.');
    } finally {
      setConnecting(null);
    }
  };

  const runAi = async () => {
    setAiLoading(true);
    setError('');
    const startedAt = Date.now();
    try {
      const result = await recommendPlatformsAndHashtags({
        appName: appName.trim(),
        storeUrl: storeUrl.trim(),
        appleStoreUrl: appleStoreUrl.trim() || undefined,
      });
      setPlatforms(result.platforms);
      setHashtags(result.hashtags);
      setRationale(result.rationale);
      trackSetupRecommendations(true, { platform_count: result.platforms.length, duration_ms: Date.now() - startedAt });
      setStep(2);
    } catch (cause) {
      trackSetupRecommendations(false, { error_message: (cause instanceof Error ? cause.message : 'unknown').slice(0, 160) });
      setError(cause instanceof Error ? cause.message.replace(/^AI request failed: /, '').slice(0, 160) : "We couldn't reach our content engine. Check your connection and try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const finishSetup = async () => {
    setPlanning(true);
    setError('');
    const startedAt = Date.now();
    try {
      const saved = await saveAppRecord({
        name: appName.trim(),
        storeUrl: storeUrl.trim(),
        appleStoreUrl: appleStoreUrl.trim() || undefined,
        platforms,
        hashtags,
        aiRationale: rationale,
      });
      await buildWeeklyPlan();
      trackPlanGenerated(Date.now() - startedAt);
      trackSetupCompleted(platforms.length);
      onComplete(saved);
    } catch (cause) {
      trackPlanGenerationFailed(cause instanceof Error ? cause.message : 'unknown');
      setError(cause instanceof Error ? cause.message : 'Could not finish setup. Try again.');
    } finally {
      setPlanning(false);
    }
  };

  // Reaching the final step kicks off plan generation automatically.
  useEffect(() => {
    if (step === 3 && !planning) void finishSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Only the app name is required — both store links are optional. The AI
  // works from the name alone when no links are given.
  const canRunAi = appName.trim().length > 1 && Boolean(storeUrl.trim() || appleStoreUrl.trim()) && !aiLoading;
  // One required store link first; once it's filled we know which store it is
  // and the opposite store's field appears (optional).
  const storeFields: { kind: 'play' | 'apple'; value: string }[] = [
    { kind: 'play', value: storeUrl },
    { kind: 'apple', value: appleStoreUrl },
  ];
  const filled = storeFields.filter((f) => f.value.trim().length > 0);
  const firstStoreField = filled[0] ?? storeFields[0];
  const otherStoreField = filled.length === 1
    ? storeFields.find((f) => f.kind !== filled[0].kind)
    : null;
  const anyConnected = Object.values(connected).some(Boolean);
  const connectedCount = Object.values(connected).filter(Boolean).length;

  return (
    <View style={[styles.safe, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 14 }]}>
      <View style={styles.header}>
        <Image source={require('../../appsurgeicon-fullbleed.png')} style={styles.brandIcon} />          <Text style={styles.brandText}>Appsurge</Text>
        <View style={{ flex: 1 }} />
        {step > 0 && step < 3 && (
          <Pressable onPress={() => setStep((current) => Math.max(0, current - 1))} hitSlop={10}>
            <Text style={styles.backLink}>Back</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.stepBar}>
        {WIZARD_STEPS.map((label, index) => (
          <View key={label} style={styles.stepItem}>
            <View style={[styles.stepDot, index <= step && styles.stepDotActive]} />
            <Text style={[styles.stepLabel, index <= step && styles.stepLabelActive]}>{label}</Text>
          </View>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View style={styles.stack}>
              <Text style={styles.h1}>Connect your accounts</Text>
              <Text style={styles.sub}>
                {connectedCount > 0
                  ? `${connectedCount} platform${connectedCount === 1 ? '' : 's'} connected. Add more now, or continue and do it later in Settings.`
                  : 'Sign in once per platform — a secure browser window opens, and your tokens are stored in your Appsurge account. You can skip and connect later.'}
              </Text>
              {CONNECTABLE_PLATFORMS.map((platform) => {
                const isConnecting = connecting === platform;
                const isConnected = Boolean(connected[platform]);
                return (
                  <View key={platform} style={styles.connectRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.platformName}>{PLATFORM_CONFIGS[platform].label}</Text>
                      <Text style={styles.platformSub}>{isConnected ? 'Connected' : 'Tap to connect in browser'}</Text>
                    </View>
                    <Pressable
                      onPress={() => void handleConnect(platform)}
                      disabled={isConnecting || isConnected}
                      style={[styles.connectButton, isConnected && styles.connectButtonDone]}
                    >
                      {isConnecting ? (
                        <ActivityIndicator size="small" color={colors.surface} />
                      ) : (
                        <Text style={styles.connectButtonText}>{isConnected ? 'Done' : 'Connect'}</Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <Pressable onPress={() => setStep(1)} style={styles.cta}>
                <Text style={styles.ctaText}>{anyConnected ? 'Continue' : 'Skip for now'}</Text>
                <Icon name="arrow-forward" size={17} color={colors.surface} />
              </Pressable>
              {checkedExisting && existing ? (
                <>
                  <Text style={styles.hint}>You already set up "{existing.name}" — continue to review it, or jump straight in.</Text>
                  <Pressable onPress={() => onComplete(existing)} hitSlop={8}>
                    <Text style={styles.hintLink}>Skip to the app</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          )}

          {step === 1 && (
            <View style={styles.stack}>
              <Text style={styles.h1}>Tell us about your app</Text>
              <Text style={styles.sub}>
                Name is all we need. Add your store links and we read the listings to learn what your app does and who it's for — skip them and we work from the name alone.
              </Text>
              <Text style={styles.label}>APP NAME</Text>
              <TextInput
                value={appName}
                onChangeText={setAppName}
                placeholder="e.g. Stellar Tracker"
                placeholderTextColor={colors.subtle}
                style={styles.input}
              />
              <Text style={styles.label}>APP LINK</Text>
              <TextInput
                value={firstStoreField.value}
                onChangeText={(v) => {
                  if (firstStoreField.kind === 'play') setStoreUrl(v); else setAppleStoreUrl(v);
                }}
                placeholder="Play Store or App Store link"
                placeholderTextColor={colors.subtle}
                autoCapitalize="none"
                keyboardType="url"
                autoCorrect={false}
                style={styles.input}
              />
              {!otherStoreField && (storeUrl.trim() || appleStoreUrl.trim()) ? (
                <Text style={styles.storeHint}>Now add the other store so we can read both listings.</Text>
              ) : null}
              {otherStoreField ? (
                <>
                  <Text style={[styles.label, { marginTop: spacing.md }]}>APP LINK (OPTIONAL)</Text>
                  <TextInput
                    value={otherStoreField.value}
                    onChangeText={(v) => {
                      if (otherStoreField.kind === 'play') setStoreUrl(v); else setAppleStoreUrl(v);
                    }}
                    placeholder="The other store's link"
                    placeholderTextColor={colors.subtle}
                    autoCapitalize="none"
                    keyboardType="url"
                    autoCorrect={false}
                    style={styles.input}
                  />
                </>
              ) : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <Pressable onPress={runAi} disabled={!canRunAi} style={[styles.cta, !canRunAi && styles.ctaDisabled]}>
                {aiLoading ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <>
                    <Icon name="sparkles" size={17} color={colors.surface} />
                    <Text style={styles.ctaText}>Continue — get our recommendations</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {step === 2 && (
            <View style={styles.stack}>
              <Text style={styles.h1}>Our recommendations</Text>
              <Text style={styles.sub}>Tap any platform to adjust our picks for {appName.trim() || 'your app'}.</Text>
              <View style={styles.pillWrap}>
                {SELECTABLE_PLATFORMS.map((platform) => {
                  const active = platforms.includes(platform);
                  return (
                    <Pressable
                      key={platform}
                      onPress={() => setPlatforms((current) => current.includes(platform)
                        ? current.filter((item) => item !== platform)
                        : [...current, platform])}
                      style={[styles.pill, active && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{humanLabel(platform)}</Text>
                      <Icon name={active ? 'checkmark-circle' : 'add-circle-outline'} size={15} color={active ? colors.surface : colors.accent} />
                    </Pressable>
                  );
                })}
              </View>
              {rationale ? (
                <View style={styles.aiNote}>
                  <Icon name="sparkles" size={15} color={colors.lavender} />
                  <Text style={styles.aiNoteText}>{rationale}</Text>
                </View>
              ) : null}
              {hashtags.length ? (
                <View style={styles.pillWrap}>
                  {hashtags.map((tag) => (
                    <View key={tag} style={styles.hashtagPill}>
                      <Text style={styles.hashtagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Pressable onPress={() => setStep(3)} disabled={!platforms.length} style={[styles.cta, !platforms.length && styles.ctaDisabled]}>
                <Text style={styles.ctaText}>Generate my weekly plan</Text>
                <Icon name="sparkles" size={17} color={colors.surface} />
              </Pressable>
            </View>
          )}

          {step === 3 && (
            <View style={styles.stack}>
              <Text style={styles.h1}>Building your weekly plan</Text>
              <Text style={styles.sub}>
                We're writing your first week of posts — hooks, captions, and hashtags for {appName.trim() || 'your app'}. This takes a few seconds.
              </Text>
              {planning ? (
                <View style={styles.generating}>
                  <ActivityIndicator size="large" color={colors.accent} />
                </View>
              ) : null}
              {error ? (
                <>
                  <Text style={styles.errorText}>{error}</Text>
                  <Pressable onPress={() => void finishSetup()} style={styles.cta}>
                    <Text style={styles.ctaText}>Try again</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: spacing.xl },
  brandIcon: { width: 26, height: 26, borderRadius: 8 },
  brandText: { color: colors.ink, fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
  backLink: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  stepBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.md },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  stepDotActive: { backgroundColor: colors.accent },
  stepLabel: { color: colors.subtle, fontSize: 10.5, fontWeight: '700' },
  stepLabelActive: { color: colors.ink },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 40, gap: spacing.md },
  stack: { gap: spacing.md },
  h1: { color: colors.ink, fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: colors.muted, fontSize: 13.5, lineHeight: 20 },
  label: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  input: { height: 52, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, color: colors.ink, fontSize: 14, ...shadow },
  cta: { height: 54, borderRadius: radius.md, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: spacing.sm },
  ctaDisabled: { opacity: 0.55 },
  ctaText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  errorText: { color: colors.danger, fontSize: 12.5, fontWeight: '600' },
  storeHint: { color: colors.muted, fontSize: 12, marginTop: 8 },
  hint: { color: colors.subtle, fontSize: 12, lineHeight: 17 },
  hintLink: { color: colors.accent, fontSize: 12.5, fontWeight: '800' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.ink, fontSize: 12.5, fontWeight: '700' },
  pillTextActive: { color: colors.surface },
  hashtagPill: { borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: colors.lavenderSoft },
  hashtagText: { color: colors.lavender, fontSize: 12, fontWeight: '700' },
  aiNote: { flexDirection: 'row', gap: 8, backgroundColor: colors.lavenderSoft, borderRadius: radius.md, padding: 12 },
  aiNoteText: { color: colors.ink, fontSize: 12.5, lineHeight: 18, flex: 1 },
  connectRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 12, ...shadow },
  platformName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  platformSub: { color: colors.muted, fontSize: 11.5, marginTop: 3 },
  connectButton: { minWidth: 96, height: 38, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  connectButtonDone: { backgroundColor: colors.green },
  connectButtonText: { color: colors.surface, fontSize: 12, fontWeight: '800' },
  generating: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
});
