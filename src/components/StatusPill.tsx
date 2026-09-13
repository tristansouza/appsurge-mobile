import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PostStatus } from '../types';
import { colors, radius } from '../theme';

const stylesByStatus: Record<PostStatus, { bg: string; text: string }> = { 'Needs review': { bg: colors.accentSoft, text: colors.accent }, Scheduled: { bg: colors.lavenderSoft, text: colors.lavender }, Published: { bg: colors.greenSoft, text: colors.green }, Failed: { bg: colors.redSoft, text: colors.red } };
export function StatusPill({ status }: { status: PostStatus }) { const style = stylesByStatus[status]; return <View style={[styles.pill, { backgroundColor: style.bg }]}><Text style={[styles.text, { color: style.text }]}>{status}</Text></View>; }
const styles = StyleSheet.create({ pill: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill }, text: { fontSize: 11, fontWeight: '800' } });
