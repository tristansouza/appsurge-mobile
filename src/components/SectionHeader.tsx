import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, globalStyles, spacing } from '../theme';

export function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={styles.row}><Text style={globalStyles.h2}>{title}</Text>{action && <Pressable onPress={onPress}><Text style={styles.action}>{action}</Text></Pressable>}</View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }, action: { color: colors.accent, fontWeight: '700', fontSize: 13 } });
