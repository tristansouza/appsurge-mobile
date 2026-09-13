import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Post } from '../types';
import { colors, globalStyles, radius, shadow, spacing } from '../theme';
import { MediaPlaceholder } from './MediaPlaceholder';
import { PlatformBadge } from './PlatformBadge';
import { StatusPill } from './StatusPill';

export function PostCard({ post, onPress, compact = false }: { post: Post; onPress?: () => void; compact?: boolean }) {
  return <Pressable onPress={onPress} style={[styles.card, compact && styles.compact]}><MediaPlaceholder color={post.mediaColor} label={post.mediaLabel} height={compact ? 100 : 128} /><View style={styles.body}><View style={styles.top}><PlatformBadge platform={post.platform} compact /><StatusPill status={post.status} /></View><Text style={styles.title}>{post.title}</Text><Text numberOfLines={compact ? 2 : 3} style={styles.caption}>{post.caption}</Text><View style={styles.meta}><Text style={styles.date}>{post.date} · {post.time}</Text><Text style={styles.more}>•••</Text></View></View></Pressable>;
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow }, compact: { flexDirection: 'row', padding: 8, gap: 12 }, body: { padding: spacing.md }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, title: { ...globalStyles.h2, fontSize: 17, lineHeight: 22 }, caption: { ...globalStyles.caption, marginTop: 7 }, meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15 }, date: { color: colors.muted, fontSize: 12, fontWeight: '600' }, more: { color: colors.subtle, fontSize: 16, letterSpacing: 1 } });
