import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useActivityFeed } from '../lib/queries';
import { logActivity, markActivityRead } from '../lib/cloudStore';
import { colors, globalStyles, radius, spacing, warmShadowColor } from '../theme';
import { ActivityEvent, ActivityKind } from '../types';

// Per-kind icon + tint. Colors stay inside the app's warm palette.
const KIND_META: Record<ActivityKind, { icon: React.ComponentProps<typeof Ionicons>['name']; tint: string }> = {
  'post-published': { icon: 'checkmark-circle', tint: colors.sage },
  'post-failed': { icon: 'alert-circle', tint: '#C0392B' },
  'post-scheduled': { icon: 'time-outline', tint: colors.accent },
  'plan-generated': { icon: 'sparkles-outline', tint: colors.accent },
  'plan-approved': { icon: 'checkmark-done', tint: colors.sage },
  'platform-connected': { icon: 'link-outline', tint: colors.accent },
  'platform-disconnected': { icon: 'link-outline', tint: colors.muted },
  'app-registered': { icon: 'phone-portrait-outline', tint: colors.accent },
  note: { icon: 'information-circle-outline', tint: colors.muted },
};

const KIND_LABEL: Record<ActivityKind, string> = {
  'post-published': 'Published',
  'post-failed': 'Failed',
  'post-scheduled': 'Scheduled',
  'plan-generated': 'Plan ready',
  'plan-approved': 'Plan approved',
  'platform-connected': 'Connected',
  'platform-disconnected': 'Disconnected',
  'app-registered': 'App registered',
  note: 'Update',
};

function toMillis(iso: unknown): number | null {
  if (!iso) return null;
  if (typeof iso === 'object' && 'seconds' in (iso as Record<string, unknown>)) {
    return (iso as { seconds: number }).seconds * 1000;
  }
  const parsed = typeof iso === 'number' ? iso : Date.parse(String(iso));
  return Number.isNaN(parsed) ? null : parsed;
}

function relative(iso: unknown): string {
  const ts = toMillis(iso);
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const meta = KIND_META[event.kind] ?? KIND_META.note;
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: event.kind === 'post-failed' ? '#FBEAE7' : colors.accentSoft }]}>
        <Ionicons name={meta.icon} size={17} color={meta.tint} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTitleRow}>
          <Text style={styles.rowTitle} numberOfLines={1}>{event.title}</Text>
          {!event.read ? <View style={styles.unreadDot} /> : null}
        </View>
        {event.body ? <Text style={styles.rowBody} numberOfLines={2}>{event.body}</Text> : null}
        <Text style={styles.rowMeta}>
          {KIND_LABEL[event.kind] ?? 'Update'}
          {event.platform ? ` · ${event.platform}` : ''}
          {event.source === 'desktop' ? ' · Desktop' : event.source === 'mobile' ? ' · Mobile' : ''}
          {relative(event.createdAt) ? ` · ${relative(event.createdAt)}` : ''}
        </Text>
      </View>
    </View>
  );
}

export function UpdatesScreen() {
  const insets = useSafeAreaInsets();
  const feed = useActivityFeed();
  const events: ActivityEvent[] = feed.data ?? [];

  const unreadCount = useMemo(() => events.filter((event) => !event.read).length, [events]);

  const grouped = useMemo(() => {
    const buckets: Array<{ label: string; items: ActivityEvent[] }> = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Earlier', items: [] },
    ];
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    for (const event of events) {
      const ts = toMillis(event.createdAt);
      if (ts === null) { buckets[2].items.push(event); continue; }
      if (ts >= startOfToday.getTime()) buckets[0].items.push(event);
      else if (ts >= startOfToday.getTime() - 86_400_000) buckets[1].items.push(event);
      else buckets[2].items.push(event);
    }
    return buckets.filter((bucket) => bucket.items.length);
  }, [events]);

  // Mark rows read shortly after the tab is shown, so the dot state is
  // visible on first render but clears itself without a manual refresh.
  useEffect(() => {
    if (!unreadCount) return;
    const timer = setTimeout(() => { void markActivityRead().catch(() => undefined); }, 2500);
    return () => clearTimeout(timer);
  }, [unreadCount, events.length]);

  // Lets the tab be explored before the desktop app writes its first event.
  // Deterministic ids make it idempotent.
  const seedSample = async () => {
    const samples: Array<Omit<ActivityEvent, 'createdAt'>> = [
      { id: 'sample-desktop-publish-1', kind: 'post-published', platform: 'tiktok', source: 'desktop', title: 'Published to TikTok', body: 'The 3-second hook — your audience decides in 3 seconds.', read: false },
      { id: 'sample-desktop-fail-1', kind: 'post-failed', platform: 'instagram', source: 'desktop', title: 'Post failed on Instagram', body: 'Rate limit reached — the autoposter retries in 30 minutes.', read: false },
      { id: 'sample-desktop-sched-1', kind: 'post-scheduled', platform: 'youtube', source: 'desktop', title: 'Scheduled for tomorrow', body: 'Build your content system · 10:00 AM', read: false },
      { id: 'sample-mobile-plan-1', kind: 'plan-approved', source: 'mobile', title: 'Weekly plan approved', body: '7 posts approved from your phone.', read: false },
    ];
    await Promise.all(samples.map((event) => logActivity(event).catch(() => undefined)));
    await feed.refetch();
  };

  if (feed.isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ActivityIndicator style={{ marginTop: 120 }} color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[globalStyles.content, { paddingBottom: 140 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={Boolean(feed.isFetching && !feed.isLoading)}
            onRefresh={() => { void feed.refetch(); }}
            tintColor={colors.accent}
          />
        )}
      >
        <Text style={styles.eyebrow}>LIVE FROM YOUR DESKTOP</Text>
        <View style={styles.headerRow}>
          <Text style={globalStyles.h1}>Updates</Text>
          {unreadCount > 0 ? (
            <View style={styles.unreadPill}>
              <Text style={styles.unreadText}>{unreadCount} new</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.subtitle}>Everything your desktop autoposter and this app did, in one feed.</Text>

        {events.length === 0 ? (            <View style={styles.emptyCard}>
            <Ionicons name="radio-outline" size={30} color={colors.accent} />
            <Text style={styles.emptyTitle}>Waiting for your desktop app</Text>
            <Text style={styles.emptyBody}>
              When the desktop autoposter publishes, fails, or schedules a post, it shows up here instantly.
            </Text>
            <Pressable onPress={() => void seedSample()} style={styles.seedButton}>
              <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
              <Text style={styles.seedText}>Preview sample updates</Text>
            </Pressable>
            <Text style={styles.emptyHint}>Desktop events appear when both apps are signed in to the same account.</Text>
          </View>
        ) : (
          grouped.map((bucket) => (
            <View key={bucket.label}>
              <Text style={styles.bucketLabel}>{bucket.label.toUpperCase()}</Text>
              <View style={styles.bucketCard}>
                {bucket.items.map((event) => <ActivityRow key={event.id} event={event} />)}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 7, marginBottom: spacing.lg },
  unreadPill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  unreadText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  bucketLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 9, marginTop: spacing.md },
  bucketCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.md,
    shadowColor: warmShadowColor,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 13 },
  rowIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  rowBody: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  rowMeta: { color: colors.subtle, fontSize: 11, fontWeight: '700', marginTop: 5 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    alignItems: 'center',
    padding: spacing.xl,
    marginTop: spacing.sm,
    shadowColor: warmShadowColor,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 12 },
  emptyBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  seedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 44,
    marginTop: spacing.lg,
  },
  seedText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  emptyHint: { color: colors.subtle, fontSize: 11, marginTop: spacing.md, textAlign: 'center' },
});
