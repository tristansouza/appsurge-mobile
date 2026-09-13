import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

export function ConnectNotice({ platform }: { platform: string }) {
  const openWebsite = () => Linking.openURL('https://app-surge.dev/dashboard').catch(() => undefined);
  return <View style={styles.card}><Text style={styles.title}>Connect {platform} on the website</Text><Text style={styles.body}>OAuth connections are completed securely in your browser, not inside the mobile app.</Text><Pressable onPress={openWebsite} style={styles.button}><Text style={styles.buttonText}>Open Appsurge website</Text></Pressable></View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm }, title: { color: colors.ink, fontSize: 14, fontWeight: '800' }, body: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }, button: { alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, marginTop: 12 }, buttonText: { color: colors.surface, fontSize: 12, fontWeight: '800' } });
