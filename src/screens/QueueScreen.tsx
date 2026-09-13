import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { PostCard } from '../components/PostCard';
import { usePosts } from '../hooks/useAppData';
import { Post, PostStatus } from '../types';
import { colors, globalStyles, radius, spacing } from '../theme';

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

  const replaceMedia = async () => {
    if (!ImagePicker) return Alert.alert('Media', 'Image picker not available.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && editing) setEditing({ ...editing, mediaLabel: 'New media selected', mediaColor: colors.sage });
  };

  const saveEdit = () => {
    if (!editing) return;
    if (creating) queryClient.setQueryData(['posts'], (current: Post[] = []) => [editing, ...current]);
    else updatePost(editing.id, editing);
    setEditing(null);
    setCreating(false);
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
            <Text style={styles.aiBody}>Review each post and make it yours.</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.subtle} />
        </View>

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
                  <>
                    <Pressable onPress={() => reject(post)} style={styles.reject}>
                      <Icon name="close" size={15} color={colors.accent} />
                      <Text style={styles.rejectText}>Reject</Text>
                    </Pressable>
                    <Pressable onPress={() => approve(post)} style={styles.approve}>
                      <Icon name="checkmark" size={16} color={colors.surface} />
                      <Text style={styles.approveText}>Approve</Text>
                    </Pressable>
                  </>
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
  saveButton: { height: 52, borderRadius: 14, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' },
  saveText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
});
