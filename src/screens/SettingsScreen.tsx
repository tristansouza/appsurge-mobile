import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '../components/Avatar';
import { ConnectNotice } from '../components/ConnectNotice';
import { Icon } from '../components/Icon';
import { PlatformBadge } from '../components/PlatformBadge';
import { useAuth } from '../hooks/useAuth';
import { useConnections } from '../hooks/useAppData';
import { Connection } from '../types';
import { colors, globalStyles, radius, spacing } from '../theme';

export function SettingsScreen() {
  const { session, signOut } = useAuth();
  const { data: connections } = useConnections();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState(true);
  const [weekly, setWeekly] = useState(true);
  const [connectPlatform, setConnectPlatform] = useState<string | null>(null);

  const toggle = (platform: string, connected: boolean) => {
    if (!connected) {
      setConnectPlatform(platform);
      return;
    }
    Alert.alert(`Disconnect ${platform}?`, 'Your scheduled content will stay safe.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', onPress: () => queryClient.setQueryData(['connections'], (current: Connection[] = []) => current.map((item) => item.platform === platform ? { ...item, connected: false } : item)) },
    ]);
  };

  const insets = useSafeAreaInsets();

  return <View style={[globalStyles.screen, { paddingTop: insets.top }]}><ScrollView contentContainerStyle={globalStyles.content} showsVerticalScrollIndicator={false}>
    <Text style={styles.eyebrow}>YOUR WORKSPACE</Text>
    <Text style={globalStyles.h1}>Settings</Text>
    <View style={styles.profile}><Avatar initials={(session?.user.name ?? 'A').slice(0, 2).toUpperCase()} size={52} /><View style={{ flex: 1 }}><Text style={styles.name}>{session?.user.name}</Text><Text style={styles.email}>{session?.user.email}</Text></View><Icon name="create-outline" size={19} color={colors.muted} /></View>
    <Text style={styles.sectionLabel}>CONNECTED ACCOUNTS</Text>
    <View style={styles.card}>{connections?.map((connection, index) => <React.Fragment key={connection.platform}><View style={[styles.connection, index !== 0 && styles.connectionBorder]}><PlatformBadge platform={connection.platform} compact /><View style={styles.accountCopy}><Text style={styles.platform}>{connection.platform}</Text><Text style={styles.handle}>{connection.connected ? connection.handle : 'Not connected'}</Text></View><Pressable onPress={() => toggle(connection.platform, connection.connected)}><Text style={[styles.connect, connection.connected && styles.disconnect]}>{connection.connected ? 'Disconnect' : 'Connect'}</Text></Pressable></View>{connectPlatform === connection.platform && <ConnectNotice platform={connection.platform} />}</React.Fragment>)}</View>
    <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
    <View style={styles.card}><SettingRow icon="notifications-outline" title="Post updates" subtitle="Published and failed post alerts" value={notifications} onChange={setNotifications} /><SettingRow icon="sparkles-outline" title="Weekly plan ready" subtitle="When your plan is ready to review" value={weekly} onChange={setWeekly} /></View>
    <Text style={styles.sectionLabel}>ACCOUNT</Text>
    <Pressable onPress={() => signOut()} style={styles.signOut}><Icon name="log-out-outline" size={18} color={colors.accent} /><Text style={styles.signOutText}>Sign out</Text></Pressable>
    <Pressable onPress={() => Linking.openURL('https://app-surge.dev').catch(() => undefined)}><Text style={styles.version}>OPEN APPSURGE WEB · v1.0.0</Text></Pressable>
  </ScrollView></View>;
}

function SettingRow({ icon, title, subtitle, value, onChange }: { icon: React.ComponentProps<typeof Icon>['name']; title: string; subtitle: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={styles.settingRow}><View style={styles.settingIcon}><Icon name={icon} size={18} color={colors.ink} /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingSubtitle}>{subtitle}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.line, true: colors.accentSoft }} thumbColor={value ? colors.accent : colors.surface} /></View>; }

const styles = StyleSheet.create({ eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, paddingTop: spacing.sm, marginBottom: 7 }, profile: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.xl, marginBottom: spacing.xl }, name: { color: colors.ink, fontSize: 16, fontWeight: '800' }, email: { color: colors.muted, fontSize: 12, marginTop: 3 }, sectionLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 9, marginTop: 3 }, card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md, marginBottom: spacing.xl }, connection: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 11 }, connectionBorder: { borderTopWidth: 1, borderTopColor: colors.line }, accountCopy: { flex: 1 }, platform: { color: colors.ink, fontSize: 13, fontWeight: '800' }, handle: { color: colors.muted, fontSize: 11, marginTop: 3 }, connect: { color: colors.accent, fontSize: 12, fontWeight: '800' }, disconnect: { color: colors.muted, fontWeight: '600' }, settingRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14 }, settingIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' }, settingTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, settingSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 }, signOut: { height: 49, borderRadius: radius.md, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, signOutText: { color: colors.accent, fontSize: 13, fontWeight: '800' }, version: { textAlign: 'center', color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 25 } });
