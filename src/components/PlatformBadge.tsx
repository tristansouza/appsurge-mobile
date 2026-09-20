import React from 'react';
import { Image, ImageStyle, StyleSheet, Text, View } from 'react-native';
import { Platform } from '../types';
import { colors, platformTints, radius } from '../theme';

// Real brand marks for each platform (assets/brands/ — copied from the
// desktop app's icon set). Rendered as the badge's leading icon.
const BRAND_ICONS: Partial<Record<Platform, number>> = {
  TikTok: require('../../assets/brands/tiktok.png'),
  Instagram: require('../../assets/brands/instagram.png'),
  YouTube: require('../../assets/brands/youtube.png'),
  Threads: require('../../assets/brands/threads.png'),
};

// X has no brand asset — its glyph IS the wordmark.
const marks: Record<Platform, string> = { Instagram: '◎', TikTok: '♪', YouTube: '▶', X: '𝕏', Threads: '@' };

export function PlatformBadge({ platform, compact = false }: { platform: Platform; compact?: boolean }) {
  const icon = BRAND_ICONS[platform];
  return (
    <View style={[styles.badge, { backgroundColor: platformTints[platform] ?? colors.canvas }, compact && styles.compact]}>
      {icon ? (
        <Image source={icon} style={styles.brandIcon as ImageStyle} resizeMode="contain" />
      ) : (
        <Text style={styles.mark}>{marks[platform]}</Text>
      )}
      {!compact && <Text style={styles.label}>{platform}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill },
  compact: { paddingHorizontal: 7, paddingVertical: 7 },
  brandIcon: { width: 18, height: 18 },
  mark: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  label: { color: colors.ink, fontSize: 12, fontWeight: '700' },
});
