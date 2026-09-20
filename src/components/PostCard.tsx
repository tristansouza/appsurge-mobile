import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Post } from '../types';
import { colors, globalStyles, radius, shadow, spacing } from '../theme';
import { MediaPlaceholder } from './MediaPlaceholder';
import { PlatformBadge } from './PlatformBadge';
import { StatusPill } from './StatusPill';

export function PostCard({ post, onPress, compact = false }: { post: Post; onPress?: () => void; compact?: boolean }) {
  const slides = Array.isArray(post.slides) ? post.slides : [];
  return (
    <Pressable onPress={onPress} style={[styles.card, compact && styles.compact]}>
      {slides.length && !compact ? (
        // Generated slideshow — horizontally swipeable slides with a page dot strip.
        <View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {slides.map((dataUrl, index) => (
              <Image
                key={`${post.id}-slide-${index}`}
                source={{ uri: dataUrl }}
                style={styles.slide}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
          {slides.length > 1 ? (
            <View style={styles.dots}>
              {slides.map((_, index) => (
                <View key={`dot-${index}`} style={styles.dot} />
              ))}
            </View>
          ) : null}
        </View>
      ) : slides.length && compact ? (
        <Image source={{ uri: slides[0] }} style={styles.slideCompact} resizeMode="cover" />
      ) : (
        <MediaPlaceholder color={post.mediaColor} label={post.mediaLabel} height={compact ? 100 : 128} />
      )}
      <View style={styles.body}>
        <View style={styles.top}>
          <PlatformBadge platform={post.platform} compact />
          <StatusPill status={post.status} />
        </View>
        <Text style={styles.title}>{post.title}</Text>
        <Text numberOfLines={compact ? 2 : 3} style={styles.caption}>{post.caption}</Text>
        <View style={styles.meta}>
          <Text style={styles.date}>{post.date} · {post.time}</Text>
          {slides.length ? <Text style={styles.slideCount}>{slides.length} slides</Text> : null}
          <Text style={styles.more}>•••</Text>
        </View>
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
  compact: { flexDirection: 'row', padding: 8, gap: 12 },
  body: { padding: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { ...globalStyles.h2, fontSize: 17, lineHeight: 22 },
  caption: { ...globalStyles.caption, marginTop: 7 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15 },
  date: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  slideCount: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  more: { color: colors.subtle, fontSize: 16, letterSpacing: 1 },
  slide: { width: 300, height: 340 },
  slideCompact: { width: 92, height: 100, borderRadius: radius.md },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
});
