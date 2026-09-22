import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { PostCard } from '../components/PostCard';
import { usePosts } from '../hooks/useAppData';
import { captionToSlidePrompts, generateSlideshow } from '../lib/gateway';
import { approveAllPlanSlots, buildWeeklyPlan, setSlotStatus, type PlanSlotRecord } from '../lib/cloudStore';
import { loadConnections } from '../lib/cloudStore';
import { Post, PostStatus } from '../types';
import { colors, globalStyles, radius, shadow, spacing } from '../theme';
import { trackPlanRegenerateStarted, trackPlanGenerated, trackPlanGenerationFailed, trackReviewOpened, trackPlanApproved, trackPlanApprovalFailed, trackPostEdited, trackSlidesGenerated } from '../lib/analytics';

let ImagePicker: typeof import('expo-image-picker') | null = null;
try { ImagePicker = require('expo-image-picker'); } catch {}

const filters: Array<PostStatus | 'All'> = ['Needs review', 'Scheduled', 'Published'];

// Days of the current week (Mon–Sun) for the calendar strip — no more
// hardcoded "OCTOBER 2024".
function currentWeekDays(): { label: string; date: Date }[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return { label: String(date.getDate()).padStart(2, '0'), date };
  });
}

function currentMonthLabel(): string {
  const month = new Date().toLocaleString('en-US', { month: 'long' }).toUpperCase();
  return `${month} ${new Date().getFullYear()}`;
}

export function QueueScreen() {
  const insets = useSafeAreaInsets();
  const { data: posts = [] } = usePosts();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<PostStatus | 'All'>('Needs review');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [editing, setEditing] = useState<Post | null>(null);
  const [creating, setCreating] = useState(false);
  const [slidesBusy, setSlidesBusy] = useState(false);
  const [slideError, setSlideError] = useState('');
  const weekDays = React.useMemo(currentWeekDays, []);
  const todayLabel = weekDays[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1].label;
  const filtered = useMemo(() => posts.filter((post) => filter === 'All' || post.status === filter), [filter, posts]);

  const updatePost = (id: string, patch: Partial<Post>) => {
    queryClient.setQueryData(['posts'], (current: Post[] = []) =>
      current.map((post) => (post.id === id ? { ...post, ...patch } : post))
    );
  };

  const approve = (post: Post) => updatePost(post.id, { status: 'Scheduled' });
  const reject = (post: Post) => updatePost(post.id, { status: 'Failed' });

  // ---- Plan regeneration + bulk approval review flow ----------------------
  const [regenBusy, setRegenBusy] = useState(false);
  const [reviewStep, setReviewStep] = useState<'closed' | 'terms' | 'walkthrough' | 'generating'>('closed');
  const [acceptedTerms, setAcceptedTerms] = useState<Record<string, boolean>>({});
  const [walkthroughIndex, setWalkthroughIndex] = useState(0);
  const [reviewDrafts, setReviewDrafts] = useState<Post[]>([]);
  const [regenError, setRegenError] = useState('');

  const reviewPosts = useMemo(
    () => posts.filter((post) => post.status === 'Needs review'),
    [posts],
  );

  const regeneratePlan = async () => {
    if (regenBusy) return;
    setRegenBusy(true);
    setRegenError('');
    const startedAt = Date.now();
    try {
      trackPlanRegenerateStarted();
      await buildWeeklyPlan(); // AI writes a fresh 7-day plan into Firestore
      await queryClient.invalidateQueries({ queryKey: ['posts'] });
      await queryClient.invalidateQueries({ queryKey: ['weekly-plan'] });
      trackPlanGenerated(Date.now() - startedAt);
    } catch (cause) {
      trackPlanGenerationFailed(cause instanceof Error ? cause.message : 'unknown');
      setRegenError(cause instanceof Error ? cause.message : "We couldn't build a new plan. Try again.");
    } finally {
      setRegenBusy(false);
    }
  };

  const openReview = () => {
    if (!reviewPosts.length) return;
    trackReviewOpened(reviewPosts.length);
    setReviewDrafts(reviewPosts.map((post) => ({ ...post })));
    setWalkthroughIndex(0);
    setReviewStep('terms');
  };

  // Platforms with pending posts — each needs its posting terms accepted.
  const pendingPlatforms = useMemo(() => {
    const seen: string[] = [];
    for (const post of reviewDrafts) {
      if (!seen.includes(post.platform)) seen.push(post.platform);
    }
    return seen;
  }, [reviewDrafts]);

  const allTermsAccepted = pendingPlatforms.every((platform) => acceptedTerms[platform]);

  const acceptTermsAndContinue = () => {
    setReviewStep('walkthrough');
  };

  const finishWalkthrough = async () => {
    setReviewStep('generating');
    const startedAt = Date.now();
    try {
      // Persist each reviewed post: caption edits and any rejects.
      for (const draft of reviewDrafts) {
        const dayMatch = draft.id.match(/plan-(\d+)-/);
        const day = dayMatch ? Number(dayMatch[1]) : null;
        if (day !== null && !Number.isNaN(day)) {
          await setSlotStatus(day, draft.status === 'Failed' ? 'rejected' : 'approved');
        }
      }
      await approveAllPlanSlots();
      await queryClient.invalidateQueries({ queryKey: ['posts'] });
      await queryClient.invalidateQueries({ queryKey: ['weekly-plan'] });
      trackPlanApproved(reviewDrafts.length, Date.now() - startedAt);
      setReviewStep('closed');
    } catch (cause) {
      trackPlanApprovalFailed(cause instanceof Error ? cause.message : 'unknown');
      setRegenError(cause instanceof Error ? cause.message : "We couldn't approve the plan. Try again.");
      setReviewStep('closed');
    }
  };

  const replaceMedia = async () => {
    if (!ImagePicker) return Alert.alert('Media', 'Image picker not available.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && editing) setEditing({ ...editing, mediaLabel: 'New media selected', mediaColor: colors.sage });
  };

  // Slideshow generation via the gateway → Cloudflare Workers AI
  // (FLUX.1-schnell) — the same pipeline the desktop app uses. The caption
  // is split into slide prompts locally, images render inline once ready.
  const generateSlides = async () => {
    if (!editing || slidesBusy) return;
    setSlidesBusy(true);
    setSlideError('');
    const startedAt = Date.now();
    try {
      const prompts = captionToSlidePrompts({ title: editing.title, caption: editing.caption });
      const results = await generateSlideshow({ prompts, aspectRatio: '9:16' });
      const dataUrls = results.filter((r) => r.ok && r.dataUrl).map((r) => r.dataUrl!);
      if (!dataUrls.length) throw new Error(results[0]?.error ?? 'No slides were generated.');
      setEditing({ ...editing, slides: dataUrls });
      trackSlidesGenerated(true, dataUrls.length, Date.now() - startedAt);
    } catch (cause) {
      trackSlidesGenerated(false, 0, Date.now() - startedAt);
      setSlideError(cause instanceof Error ? cause.message : "We couldn't generate your slides. Try again.");
    } finally {
      setSlidesBusy(false);
    }
  };

  const saveEdit = () => {
    if (!editing) return;
    trackPostEdited(creating);
    if (creating) queryClient.setQueryData(['posts'], (current: Post[] = []) => [editing, ...current]);
    else updatePost(editing.id, editing);
    setEditing(null);
    setCreating(false);
    setSlideError('');
  };

  const openComposer = () => {
    setCreating(true);
    setEditing({
      id: `new-${Date.now()}`,
      platform: 'Instagram',
      status: 'Scheduled',
      title: 'New content',
      caption: '',
      date: 'Mon, Oct 21',
      time: '9:00 AM',
      mediaColor: colors.peach,
      mediaLabel: 'Choose media',
    });
  };

  const countFor = (status: PostStatus) => posts.filter((post) => post.status === status).length;

  return (
    <View style={[globalStyles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={globalStyles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>CONTENT STUDIO</Text>
            <Text style={globalStyles.h1}>Review queue</Text>
            <Text style={styles.subtitle}>Shape this week's content before it goes live.</Text>
          </View>
          <Pressable style={styles.add} onPress={openComposer}>
            <Icon name="add" size={22} color={colors.surface} />
          </Pressable>
        </View>

        <View style={styles.toolbar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {filters.map((item) => (
              <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}>
                <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
                  {item}{item === 'Needs review' ? `  ${countFor('Needs review')}` : ''}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.viewToggle}>
            <Pressable onPress={() => setView('list')}>
              <Icon name="list" size={17} color={view === 'list' ? colors.ink : colors.subtle} />
            </Pressable>
            <Pressable onPress={() => setView('calendar')}>
              <Icon name="calendar-outline" size={17} color={view === 'calendar' ? colors.ink : colors.subtle} />
            </Pressable>
          </View>
        </View>

        <View style={styles.aiCard}>
          <View style={styles.aiIcon}>
            <Icon name="sparkles" size={19} color={colors.lavender} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiTitle}>Created with your brand voice</Text>
            <Text style={styles.aiBody}>Review the week, then approve everything at once.</Text>
          </View>
          <Pressable onPress={() => void regeneratePlan()} disabled={regenBusy} hitSlop={6}>
            {regenBusy ? <ActivityIndicator size="small" color={colors.accent} /> : (
              <View style={styles.regenBtn}><Icon name="refresh" size={15} color={colors.accent} /><Text style={styles.regenText}>Regenerate</Text></View>
            )}
          </Pressable>
        </View>
        {regenError ? <Text style={styles.regenError}>{regenError}</Text> : null}

        {view === 'calendar' && (
          <View style={styles.calendar}>
            <Text style={styles.month}>{currentMonthLabel()}</Text>
            <View style={styles.days}>
              {weekDays.map(({ label }) => (
                <View key={label} style={[styles.day, label === todayLabel && styles.dayActive]}>
                  <Text style={[styles.dayText, label === todayLabel && styles.dayTextActive]}>{label}</Text>
                  <View style={styles.dot} />
                </View>
              ))}
            </View>
          </View>
        )}

        {filtered.length ? (
          filtered.map((post) => (
            <View key={post.id} style={styles.post}>
              <PostCard post={post} onPress={() => setEditing(post)} />
              <View style={styles.actions}>
                <Pressable onPress={() => setEditing(post)} style={styles.secondary}>
                  <Icon name="create-outline" size={15} color={colors.ink} />
                  <Text style={styles.secondaryText}>Edit</Text>
                </Pressable>
                {post.status === 'Needs review' && (
                  <Pressable onPress={() => reject(post)} style={styles.reject}>
                    <Icon name="close" size={15} color={colors.accent} />
                    <Text style={styles.rejectText}>Exclude</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <Icon name="checkmark-circle" size={32} color={colors.green} />
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptyBody}>Nothing in this view right now.</Text>
          </View>
        )}
      </ScrollView>

      {reviewPosts.length ? (
        <View style={[styles.approveBar, { paddingBottom: Math.max(insets.bottom, 12) + 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.approveBarTitle}>{reviewPosts.length} post{reviewPosts.length === 1 ? '' : 's'} ready</Text>
            <Text style={styles.approveBarSub}>Review once, approve the whole week.</Text>
          </View>
          <Pressable onPress={openReview} style={styles.approveAllBtn}>
            <Icon name="checkmark-done" size={17} color={colors.surface} />
            <Text style={styles.approveAllText}>Approve all</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={reviewStep !== 'closed'} animationType="slide" transparent onRequestClose={() => setReviewStep('closed')}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modal, { maxHeight: '88%' }]}>
            {reviewStep === 'terms' && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Text style={globalStyles.h2}>Before we post</Text>
                  <Pressable onPress={() => setReviewStep('closed')}><Icon name="close" size={22} color={colors.muted} /></Pressable>
                </View>
                <Text style={styles.reviewBody}>Accept the posting terms for each platform in this week's plan. You only do this once per platform.</Text>
                {pendingPlatforms.map((platform) => (
                  <Pressable key={platform} onPress={() => setAcceptedTerms((current) => ({ ...current, [platform]: !current[platform] }))} style={styles.termsRow}>
                    <Icon name={acceptedTerms[platform] ? 'checkbox' : 'checkbox-outline'} size={22} color={acceptedTerms[platform] ? colors.accent : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.termsTitle}>I accept {platform}'s posting terms</Text>
                      <Text style={styles.termsSub}>Appsurge posts to {platform} on my behalf according to their platform rules and my connected account's permissions.</Text>
                    </View>
                  </Pressable>
                ))}
                <Text style={styles.reviewFoot}>You can revoke access anytime from Settings → connected accounts.</Text>
                <Pressable onPress={acceptTermsAndContinue} disabled={!allTermsAccepted} style={[styles.saveButton, !allTermsAccepted && { opacity: 0.45 }]}>
                  <Text style={styles.saveText}>Continue to review</Text>
                </Pressable>
              </ScrollView>
            )}

            {reviewStep === 'walkthrough' && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={globalStyles.h2}>Review {walkthroughIndex + 1} of {reviewDrafts.length}</Text>
                  <Pressable onPress={() => setReviewStep('closed')}><Icon name="close" size={22} color={colors.muted} /></Pressable>
                </View>
                {reviewDrafts[walkthroughIndex] ? (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={styles.walkPlatform}>{reviewDrafts[walkthroughIndex].platform} · {reviewDrafts[walkthroughIndex].date}</Text>
                    <Text style={styles.walkHook}>{reviewDrafts[walkthroughIndex].title}</Text>
                    <Text style={styles.label}>DESCRIPTION</Text>
                    <TextInput
                      multiline
                      value={reviewDrafts[walkthroughIndex].caption}
                      onChangeText={(caption) => setReviewDrafts((current) => current.map((item, index) => (index === walkthroughIndex ? { ...item, caption } : item)))}
                      style={styles.captionInput}
                    />
                    <View style={styles.walkNav}>
                      {walkthroughIndex > 0 ? (
                        <Pressable onPress={() => setWalkthroughIndex((i) => i - 1)} style={styles.secondary}>
                          <Icon name="chevron-back" size={16} color={colors.ink} />
                          <Text style={styles.secondaryText}>Back</Text>
                        </Pressable>
                      ) : <View style={{ flex: 1 }} />}
                      <Pressable
                        onPress={() => setReviewDrafts((current) => current.map((item, index) => (index === walkthroughIndex ? { ...item, status: 'Failed' as PostStatus } : item)))}
                        style={[styles.secondary, reviewDrafts[walkthroughIndex].status === 'Failed' && { backgroundColor: colors.accentSoft }]}
                      >
                        <Icon name="close" size={15} color={colors.accent} />
                        <Text style={styles.rejectText}>Exclude</Text>
                      </Pressable>
                      {walkthroughIndex < reviewDrafts.length - 1 ? (
                        <Pressable onPress={() => setWalkthroughIndex((i) => i + 1)} style={styles.approve}>
                          <Text style={styles.approveText}>Next</Text>
                          <Icon name="chevron-forward" size={16} color={colors.surface} />
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => void finishWalkthrough()} style={styles.approve}>
                          <Icon name="checkmark-done" size={16} color={colors.surface} />
                          <Text style={styles.approveText}>Approve week</Text>
                        </Pressable>
                      )}
                    </View>
                    <Text style={styles.reviewFoot}>Excluded posts are dropped from the plan; everything else goes out on schedule.</Text>
                  </ScrollView>
                ) : null}
              </>
            )}

            {reviewStep === 'generating' && (
              <View style={styles.generatingWrap}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.generatingTitle}>Scheduling your week…</Text>
                <Text style={styles.generatingBody}>We're approving your posts and locking in the schedule. This takes a moment.</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(editing)} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={globalStyles.h2}>{creating ? 'Create post' : 'Edit post'}</Text>
              <Pressable onPress={() => setEditing(null)}>
                <Icon name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            {editing && (
              <>
                <Text style={styles.label}>TITLE</Text>
                <TextInput value={editing.title} onChangeText={(title) => setEditing({ ...editing, title })} style={styles.smallInput} />
                <Text style={styles.label}>CAPTION</Text>
                <TextInput multiline value={editing.caption} onChangeText={(caption) => setEditing({ ...editing, caption })} style={styles.captionInput} />
                <View style={styles.formRow}>
                  <View style={styles.formField}>
                    <Text style={styles.label}>DATE</Text>
                    <TextInput value={editing.date} onChangeText={(date) => setEditing({ ...editing, date })} style={styles.smallInput} />
                  </View>
                  <View style={styles.formField}>
                    <Text style={styles.label}>TIME</Text>
                    <TextInput value={editing.time} onChangeText={(time) => setEditing({ ...editing, time })} style={styles.smallInput} />
                  </View>
                </View>
                <Pressable onPress={replaceMedia} style={styles.mediaButton}>
                  <Icon name="image-outline" size={18} color={colors.accent} />
                  <Text style={styles.mediaButtonText}>Swap media</Text>
                </Pressable>
                <Pressable onPress={() => void generateSlides()} style={[styles.mediaButton, slidesBusy && { opacity: 0.6 }]} disabled={slidesBusy}>
                  {slidesBusy ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Icon name="sparkles-outline" size={18} color={colors.accent} />
                  )}
                  <Text style={styles.mediaButtonText}>{slidesBusy ? 'Generating slides…' : 'Generate slides'}</Text>
                </Pressable>
                {slidesBusy ? <Text style={styles.slidesNote}>We're generating your slideshow with Cloudflare Workers AI — this takes up to a minute.</Text> : null}
                {slideError ? <Text style={styles.slidesError}>{slideError}</Text> : null}
                <Pressable onPress={saveEdit} style={styles.saveButton}>
                  <Text style={styles.saveText}>Save changes</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm, marginBottom: spacing.lg },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 7, maxWidth: 245 },
  add: { width: 43, height: 43, backgroundColor: colors.accent, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  filters: { gap: 9, paddingRight: 12 },
  filter: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 15, paddingVertical: 10 },
  filterActive: { backgroundColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: colors.surface },
  viewToggle: { flexDirection: 'row', gap: 10, backgroundColor: colors.surface, borderRadius: 10, padding: 10 },
  aiCard: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: colors.lavenderSoft, borderRadius: radius.md, marginBottom: spacing.lg, gap: 11 },
  aiIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  aiTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  aiBody: { color: colors.muted, fontSize: 12, marginTop: 3 },
  calendar: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  month: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  day: { alignItems: 'center', gap: 7, padding: 6, borderRadius: 10 },
  dayActive: { backgroundColor: colors.accent },
  dayText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  dayTextActive: { color: colors.surface },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  post: { marginBottom: 19 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  secondary: { flex: 1, height: 43, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  secondaryText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  reject: { height: 43, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  rejectText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  approve: { height: 43, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  approveText: { color: colors.surface, fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', paddingTop: 70 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 12 },
  emptyBody: { color: colors.muted, fontSize: 13, marginTop: 5 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(36,33,30,0.32)' },
  modal: { backgroundColor: colors.canvas, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: spacing.lg, paddingBottom: 35 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  label: { color: colors.muted, fontSize: 10, letterSpacing: 1.1, fontWeight: '800', marginBottom: 8 },
  captionInput: { minHeight: 105, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, color: colors.ink, fontSize: 14, textAlignVertical: 'top', marginBottom: spacing.lg },
  formRow: { flexDirection: 'row', gap: 12 },
  formField: { flex: 1 },
  smallInput: { height: 48, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, color: colors.ink, fontSize: 13, marginBottom: spacing.lg },
  mediaButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, height: 48, borderRadius: 12, backgroundColor: colors.accentSoft, marginBottom: 12 },
  mediaButtonText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  slidesNote: { color: colors.muted, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginBottom: 12 },
  slidesError: { color: colors.danger, fontSize: 12, fontWeight: '600', marginBottom: 12 },
  saveButton: { height: 52, borderRadius: 14, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' },
  saveText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  regenBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  regenText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  regenError: { color: colors.danger, fontSize: 12, fontWeight: '600', marginBottom: spacing.lg, marginTop: -8 },
  approveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, ...shadow },
  approveBarTitle: { color: colors.ink, fontSize: 13.5, fontWeight: '800' },
  approveBarSub: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  approveAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.green, borderRadius: radius.md, paddingHorizontal: 18, height: 46 },
  approveAllText: { color: colors.surface, fontSize: 13.5, fontWeight: '800' },
  reviewBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: spacing.lg },
  termsRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  termsTitle: { color: colors.ink, fontSize: 13.5, fontWeight: '800' },
  termsSub: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  reviewFoot: { color: colors.subtle, fontSize: 11, lineHeight: 15, marginVertical: spacing.md },
  walkPlatform: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  walkHook: { color: colors.ink, fontSize: 17, fontWeight: '800', lineHeight: 23, marginBottom: spacing.md },
  walkNav: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  generatingWrap: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: spacing.lg },
  generatingTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', marginTop: spacing.lg },
  generatingBody: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
});
