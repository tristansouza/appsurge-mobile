import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function Avatar({ uri, initials = 'AM', size = 38 }: { uri?: string; initials?: string; size?: number }) {
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}><Text style={styles.text}>{initials}</Text></View>;
}
const styles = StyleSheet.create({ avatar: { backgroundColor: colors.darkSurface, alignItems: 'center', justifyContent: 'center' }, text: { color: '#fff', fontSize: 13, fontWeight: '800' } });
