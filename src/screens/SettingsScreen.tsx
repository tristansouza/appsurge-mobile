import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
// ActivityIndicator is used by both the name editor and the connect rows.
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { PlatformBadge } from '../components/PlatformBadge';
import { useAuth } from '../hooks/useAuth';
import { useSession } from '../lib/sessionContext';
import { startPlatformConnect, subscribeToConnectOutcomes, type ConnectOutcome } from '../lib/connect';
import type { MobilePlatform } from '../lib/platformAuth';
import { disconnectPlatform } from '../lib/cloudStore';
import { useConnections } from '../hooks/useAppData';
import { loadAppRecord, updateAppDetails, type AppRecord } from '../lib/cloudStore';
import { trackConnectFailed, trackConnectCancelled, trackPlatformDisconnected, trackAppDetailsUpdated, trackDisplayNameUpdated } from '../lib/analytics';
import { Connection } from '../types';
import { colors, globalStyles, radius, shadow, spacing } from '../theme';

export function SettingsScreen() {
  const { session, signOut } = useAuth();
  const { data: connections } = useConnections();
  const queryClient = useQueryClient();
  const { user, renameSelf } = useSession();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [weekly, setWeekly] = useState(true);

  // Editable app details — loaded from Firestore (mobile record or the
  // desktop-sync bridge), edited inline, saved back to Firestore.
  const [app, setApp] = useState<AppRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [appleStoreUrl, setAppleStoreUrl] = useState('');
  // First store link is required; the opposite store's optional field appears
  // once the first one is filled (mirrors the setup wizard).
  const settingsStoreFields: { kind: 'play' | 'apple'; value: string }[] = [
    { kind: 'play', value: storeUrl },
    { kind: 'apple', value: appleStoreUrl },
  ];
  const settingsFilled = settingsStoreFields.filter((f) => f.value.trim().length > 0);
  const settingsFirst = settingsFilled[0] ?? settingsStoreFields[0];
  const settingsOther = settingsFilled.length === 1
    ? settingsStoreFields.find((f) => f.kind !== settingsFilled[0].kind)
    : null;
  const settingsVisibleFields = settingsOther ? [settingsFirst, settingsOther] : [settingsFirst];
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let active = true;
    loadAppRecord().then((record) => {
      if (!active) return;
      setApp(record);
      setName(record?.name ?? '');
      setStoreUrl(record?.storeUrl ?? '');
      setAppleStoreUrl(record?.appleStoreUrl ?? '');
      setDescription(record?.audience ?? '');
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const saveApp = async () => {
    if (saving) return;
    if (!storeUrl.trim() && !appleStoreUrl.trim()) {
      setSaveError('Add your Play Store or App Store link — we read the listing to learn your app.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const saved = await updateAppDetails({ name, storeUrl, appleStoreUrl, description });
      trackAppDetailsUpdated();
      setApp(saved);
      setEditOpen(false);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "We couldn't save your changes. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // Settings connects platforms directly — the same real OAuth flow the
  // setup wizard uses (in-app WebView for Threads/Instagram, Custom Tab for
  // TikTok, browser for YouTube). No "do it on the website" detour.
  const [connectingId, setConnectingId] = useState<MobilePlatform | null>(null);

  React.useEffect(() => {
    // Outcomes can arrive via the global deep-link handler while the
    // browser/webview session is still open, so listen on the bus and
    // refresh the connections query when a connect completes.
    const unsubscribe = subscribeToConnectOutcomes((outcome: ConnectOutcome) => {
      if (outcome.kind === 'connected') {
        queryClient.invalidateQueries({ queryKey: ['connections'] });
        setConnectingId((current) => (current === outcome.platform ? null : current));
      }
    });
    return unsubscribe;
  }, [queryClient]);

  const labelToId: Record<string, MobilePlatform> = {
    TikTok: 'tiktok',
    Instagram: 'instagram',
    YouTube: 'youtube',
    Threads: 'threads',
  };

  const startConnect = async (platformLabel: string) => {
    const id = labelToId[platformLabel];
    if (!id) {
      Alert.alert('Connect on desktop', `${platformLabel} connects through the Appsurge desktop app for now.`);
      return;
    }
    if (connectingId) return;
    setConnectingId(id);
    try {
      const outcome = await startPlatformConnect(id);
      if (outcome.kind === 'error') {
        trackConnectFailed(id, outcome.message);
        Alert.alert(`Couldn't connect ${platformLabel}`, outcome.message);
      } else if (outcome.kind === 'connected') {
        queryClient.invalidateQueries({ queryKey: ['connections'] });
      } else if (outcome.kind === 'cancelled') {
        trackConnectCancelled(id);
      }
    } catch (cause) {
      trackConnectFailed(id, cause instanceof Error ? cause.message : 'unknown');
      Alert.alert(`Couldn't connect ${platformLabel}`, 'Check your internet and try again.');
    } finally {
      setConnectingId(null);
    }
  };

  const toggle = (platformLabel: string, connected: boolean) => {
    if (!connected) {
      void startConnect(platformLabel);
      return;
    }
    Alert.alert(`Disconnect ${platformLabel}?`, 'Your scheduled content will stay safe.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => {
        const id = labelToId[platformLabel] ?? platformLabel.toLowerCase();
        trackPlatformDisconnected(id);
        void disconnectPlatform(id).catch(() => undefined);
        queryClient.setQueryData(['connections'], (current: Connection[] = []) => current.map((item) => item.platform === platformLabel ? { ...item, connected: false } : item));
      } },
    ]);
  };

  const startNameEdit = () => {
    setDraftName(session?.user.name ?? user?.name ?? '');
    setNameError('');
    setEditingName(true);
  };

  const saveName = async () => {
    if (savingName) return;
    setSavingName(true);
    setNameError('');
    try {
      await renameSelf(draftName);
      trackDisplayNameUpdated();
      setEditingName(false);
    } catch (cause) {
      setNameError(cause instanceof Error ? cause.message : "We couldn't save your name. Try again.");
    } finally {
      setSavingName(false);
    }
  };

  // Opens legal pages in an in-app browser session (SFSafariViewController
  // on iOS, Chrome Custom Tab on Android) — keeps users inside the app and
  // behaves consistently on both platforms.
  const openLegal = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        controlsColor: colors.accent,
      });
    } catch {
      Linking.openURL(url).catch(() => undefined);
    }
  };

  const insets = useSafeAreaInsets();

  return <View style={[globalStyles.screen, { paddingTop: insets.top }]}><ScrollView contentContainerStyle={globalStyles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>YOUR WORKSPACE</Text>
    <Text style={globalStyles.h1}>Settings</Text>
    <View style={styles.profile}><Avatar initials={(session?.user.name ?? 'A').slice(0, 2).toUpperCase()} size={52} /><View style={{ flex: 1 }}>{editingName ? (
      <View style={{ gap: 6 }}>
        <TextInput
          value={draftName}
          onChangeText={setDraftName}
          autoFocus
          maxLength={60}
          placeholder="What should we call you?"
          placeholderTextColor={colors.subtle}
          style={styles.nameInput}
        />
        {nameError ? <Text style={styles.saveError}>{nameError}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => { setEditingName(false); setNameError(''); }} disabled={savingName} hitSlop={6}>
            <Text style={styles.nameCancel}>Cancel</Text>
          </Pressable>
          <Pressable onPress={() => void saveName()} disabled={savingName} hitSlop={6}>
            {savingName ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={styles.nameSave}>Save</Text>}
          </Pressable>
        </View>
      </View>
    ) : (
      <>
        <Text style={styles.name}>{session?.user.name}</Text>
        <Text style={styles.email}>{session?.user.email}</Text>
      </>
    )}</View><Pressable onPress={startNameEdit} hitSlop={8}><Icon name="create-outline" size={19} color={session && editingName ? colors.accent : colors.muted} /></Pressable></View>
    <Text style={styles.sectionLabel}>YOUR APP</Text>
    <View style={styles.card}>
      {editOpen ? (
        <View style={styles.editStack}>
          <Text style={styles.fieldLabel}>APP NAME</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.subtle} placeholder="My app" />
          <Text style={styles.fieldLabel}>APP LINK</Text>
          <TextInput
            value={settingsVisibleFields[0].value}
            onChangeText={(v) => { if (settingsVisibleFields[0].kind === 'play') setStoreUrl(v); else setAppleStoreUrl(v); }}
            style={styles.input}
            placeholderTextColor={colors.subtle}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="Play Store or App Store link"
          />
          {settingsVisibleFields[1] ? (
            <>
              <Text style={styles.fieldLabel}>APP LINK (OPTIONAL)</Text>
              <TextInput
                value={settingsVisibleFields[1].value}
                onChangeText={(v) => { if (settingsVisibleFields[1].kind === 'play') setStoreUrl(v); else setAppleStoreUrl(v); }}
                style={styles.input}
                placeholderTextColor={colors.subtle}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="The other store's link"
              />
            </>
          ) : null}
          <Text style={styles.fieldLabel}>DESCRIPTION</Text>
          <TextInput value={description} onChangeText={setDescription} style={[styles.input, styles.inputMultiline]} multiline placeholderTextColor={colors.subtle} placeholder="What does your app do? Who is it for?" />
          {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
          <View style={styles.editActions}>
            <Pressable onPress={() => { setEditOpen(false); setSaveError(''); }} style={styles.cancelBtn} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => void saveApp()} style={[styles.saveBtn, saving && { opacity: 0.6 }]} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.saveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.appRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>{app?.name || 'Set up your app'}</Text>
            <Text numberOfLines={2} style={styles.appDesc}>{app?.audience || 'Add a description so we can tailor your content.'}</Text>
            {app?.storeUrl || app?.appleStoreUrl ? <Text numberOfLines={1} style={styles.appUrl}>{app?.storeUrl || app?.appleStoreUrl}</Text> : null}
          </View>
          <Pressable onPress={() => setEditOpen(true)} hitSlop={8} style={styles.editBtn}>
            <Icon name="create-outline" size={17} color={colors.accent} />
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        </View>
      )}
    </View>
    <Text style={styles.sectionLabel}>CONNECTED ACCOUNTS</Text>
    <View style={styles.card}>{connections?.map((connection, index) => <React.Fragment key={connection.platform}><View style={[styles.connection, index !== 0 && styles.connectionBorder]}><PlatformBadge platform={connection.platform} compact /><View style={styles.accountCopy}><Text style={styles.platform}>{connection.platform}</Text><Text style={styles.handle}>{connection.connected ? connection.handle : 'Not connected'}</Text></View>{(() => {
      const id = labelToId[connection.platform];
      const isConnecting = Boolean(id) && connectingId === id;
      if (isConnecting) return <ActivityIndicator size="small" color={colors.accent} />;
      return <Pressable onPress={() => toggle(connection.platform, connection.connected)}><Text style={[styles.connect, connection.connected && styles.disconnect]}>{connection.connected ? 'Disconnect' : 'Connect'}</Text></Pressable>;
    })()}</View></React.Fragment>)}</View>
    <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
    <View style={styles.card}><SettingRow icon="notifications-outline" title="Post updates" subtitle="Published and failed post alerts" value={notifications} onChange={setNotifications} /><SettingRow icon="sparkles-outline" title="Weekly plan ready" subtitle="When your plan is ready to review" value={weekly} onChange={setWeekly} /></View>
    <Text style={styles.sectionLabel}>ACCOUNT</Text>
    <Pressable onPress={() => signOut()} style={styles.signOut}><Icon name="log-out-outline" size={18} color={colors.accent} /><Text style={styles.signOutText}>Sign out</Text></Pressable>
    <Text style={styles.sectionLabel}>LEGAL</Text>
    <View style={styles.card}>
      <Pressable style={styles.legalRow} onPress={() => void openLegal('https://app-surge.dev/privacy/')}>
        <View style={styles.settingIcon}><Icon name="shield-checkmark-outline" size={18} color={colors.ink} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.settingTitle}>Privacy Policy</Text>
          <Text style={styles.settingSubtitle}>How Appsurge handles your data</Text>
        </View>
        <Icon name="open-outline" size={16} color={colors.muted} />
      </Pressable>
      <View style={styles.connectionBorder} />
      <Pressable style={styles.legalRow} onPress={() => void openLegal('https://app-surge.dev/terms/')}>
        <View style={styles.settingIcon}><Icon name="document-text-outline" size={18} color={colors.ink} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.settingTitle}>Terms of Service</Text>
          <Text style={styles.settingSubtitle}>The rules of using Appsurge</Text>
        </View>
        <Icon name="open-outline" size={16} color={colors.muted} />
      </Pressable>
    </View>
    <Pressable onPress={() => Linking.openURL('https://app-surge.dev').catch(() => undefined)}><Text style={styles.version}>OPEN APPSURGE WEB · v1.0.0</Text></Pressable>
  </ScrollView></View>;
}

function SettingRow({ icon, title, subtitle, value, onChange }: { icon: React.ComponentProps<typeof Icon>['name']; title: string; subtitle: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={styles.settingRow}><View style={styles.settingIcon}><Icon name={icon} size={18} color={colors.ink} /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingSubtitle}>{subtitle}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.line, true: colors.accentSoft }} thumbColor={value ? colors.accent : colors.surface} /></View>; }

const styles = StyleSheet.create({ eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, paddingTop: spacing.sm, marginBottom: 7 }, profile: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.xl, marginBottom: spacing.xl }, name: { color: colors.ink, fontSize: 16, fontWeight: '800' }, email: { color: colors.muted, fontSize: 12, marginTop: 3 }, sectionLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 9, marginTop: 3 }, card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md, marginBottom: spacing.xl }, connection: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 11 }, connectionBorder: { borderTopWidth: 1, borderTopColor: colors.line }, accountCopy: { flex: 1 }, platform: { color: colors.ink, fontSize: 13, fontWeight: '800' }, handle: { color: colors.muted, fontSize: 11, marginTop: 3 }, connect: { color: colors.accent, fontSize: 12, fontWeight: '800' }, disconnect: { color: colors.muted, fontWeight: '600' },  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14 },
  legalRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  appName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  appDesc: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  appUrl: { color: colors.subtle, fontSize: 10.5, marginTop: 4 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 8 },
  editBtnText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  editStack: { paddingVertical: 14, gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 9.5, fontWeight: '800', letterSpacing: 1, marginTop: 6 },
  input: { height: 46, backgroundColor: colors.canvas, borderRadius: radius.md, paddingHorizontal: 12, color: colors.ink, fontSize: 13.5 },
  inputMultiline: { height: 84, paddingTop: 12, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: radius.md },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  saveBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 22, paddingVertical: 11 },
  saveBtnText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
  saveError: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  nameInput: { backgroundColor: colors.canvas, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, color: colors.ink, fontSize: 14, fontWeight: '700' },
  nameCancel: { color: colors.muted, fontSize: 12.5, fontWeight: '700' },
  nameSave: { color: colors.accent, fontSize: 12.5, fontWeight: '800' }, settingIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' }, settingTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, settingSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 }, signOut: { height: 49, borderRadius: radius.md, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, signOutText: { color: colors.accent, fontSize: 13, fontWeight: '800' }, version: { textAlign: 'center', color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 25 } });
