import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Platform } from '../types';
import { colors, platformTints, radius } from '../theme';

const marks: Record<Platform, string> = { Instagram: '◎', TikTok: '♪', YouTube: '▶', X: '𝕏', Threads: '@' };
export function PlatformBadge({ platform, compact = false }: { platform: Platform; compact?: boolean }) {
  return <View style={[styles.badge, { backgroundColor: platformTints[platform] ?? colors.canvas }, compact && styles.compact]}><Text style={styles.mark}>{marks[platform]}</Text>{!compact && <Text style={styles.label}>{platform}</Text>}</View>;
}
const styles = StyleSheet.create({ badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill }, compact: { paddingHorizontal: 7, paddingVertical: 7 }, mark: { color: colors.ink, fontSize: 13, fontWeight: '800' }, label: { color: colors.ink, fontSize: 12, fontWeight: '700' } });
