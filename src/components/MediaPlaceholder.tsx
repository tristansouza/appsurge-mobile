import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

export function MediaPlaceholder({ color, label, height = 132 }: { color: string; label: string; height?: number }) { return <View style={[styles.media, { backgroundColor: color, height }]}><View style={styles.sun} /><Text style={styles.label}>{label}</Text><Text style={styles.caption}>MEDIA PREVIEW</Text></View>; }
const styles = StyleSheet.create({ media: { overflow: 'hidden', borderRadius: radius.md, justifyContent: 'flex-end', padding: 14 }, sun: { position: 'absolute', width: 105, height: 105, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.48)', top: -30, right: -10 }, label: { color: 'rgba(36,33,30,0.72)', fontSize: 16, fontWeight: '800' }, caption: { color: 'rgba(36,33,30,0.46)', fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginTop: 4 } });
