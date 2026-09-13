import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { MetricCard } from '../components/MetricCard';
import { PostCard } from '../components/PostCard';
import { SectionHeader } from '../components/SectionHeader';
import { useAuth } from '../hooks/useAuth';
import { usePosts } from '../hooks/useAppData';
import { colors, globalStyles, radius, spacing } from '../theme';

export function HomeScreen({ navigation }: any) {
  const { session } = useAuth();
  const { data: posts } = usePosts();
  const insets = useSafeAreaInsets();
  const firstName = session?.user.name.split(' ')[0] ?? 'there';
  const initials = (session?.user.name ?? 'A').slice(0, 2).toUpperCase();
  const todayLabel = new Date().toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return <View style={[globalStyles.screen, { paddingTop: insets.top }]}><ScrollView contentContainerStyle={globalStyles.content} showsVerticalScrollIndicator={false}><View style={styles.header}><View><Text style={styles.eyebrow}>{todayLabel}</Text><Text style={globalStyles.h1}>{greeting}, {firstName}.</Text></View><Avatar initials={initials} /></View><View style={styles.notice}><View style={styles.noticeIcon}><Icon name="sparkles" size={18} color={colors.accent} /></View><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>Your weekly plan is ready</Text><Text style={styles.noticeBody}>2 posts are waiting for your review.</Text></View><Pressable onPress={() => navigation.navigate('Queue')}><Icon name="arrow-forward-circle" size={25} color={colors.accent} /></Pressable></View><SectionHeader title="This week" action="View analytics" onPress={() => navigation.navigate('Analytics')} /><View style={styles.metrics}><MetricCard label="Total views" value="84.2k" change="↑ 24%" icon="◒" /><MetricCard label="Engagement" value="6.8%" change="↑ 1.2%" icon="♡" color={colors.lavender} /></View><SectionHeader title="Next up" action="See all" onPress={() => navigation.navigate('Queue')} />{posts?.[0] && <PostCard post={posts[0]} onPress={() => navigation.navigate('Queue')} />}<SectionHeader title="Recent content" action="See all" onPress={() => navigation.navigate('Queue')} />{posts?.slice(2, 4).map((post) => <View key={post.id} style={styles.recent}><PostCard post={post} compact /></View>)}</ScrollView></View>;
}
const styles = StyleSheet.create({ header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: spacing.sm, marginBottom: spacing.xl }, eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7 }, notice: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accentSoft, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.xl }, noticeIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, noticeCopy: { flex: 1 }, noticeTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' }, noticeBody: { color: colors.muted, fontSize: 12, marginTop: 3 }, metrics: { flexDirection: 'row', gap: 12, marginBottom: spacing.xl }, recent: { marginBottom: 12 } });
