import { Platform, StyleSheet } from 'react-native';

export const colors = {
  canvas: '#FAF6F0',
  surface: '#FFFFFF',
  ink: '#1A1A1A',
  muted: '#6B6560',
  subtle: '#9C9590',
  line: '#E8E0D8',
  accent: '#6F9BCD',
  accentSoft: '#EDF4FB',
  green: '#3FA278',
  greenSoft: '#E9F6EF',
  lavender: '#8270D8',
  lavenderSoft: '#F0EDFF',
  yellow: '#E9A63A',
  yellowSoft: '#FFF4DE',
  darkSurface: '#292622',
  danger: '#B4573B',
  dangerSoft: '#F7E9E4',
  red: '#D55555',
  redSoft: '#FFF0F0',
  sage: '#C6DCD2',
  peach: '#F4C7B6',
};

// Soft platform-brand tints used by PlatformBadge (kept here so every
// screen shares one source of truth).
export const platformTints: Record<string, string> = {
  Instagram: '#FCE8EA',
  TikTok: '#E8F4F3',
  YouTube: '#FDE7E4',
  X: '#EEEEEE',
  Threads: '#EFEAFB',
};

// Warm shadow tint shared by cards and bars (iOS shadowColor).
export const warmShadowColor = '#49392D';

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  xxl: 36,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};

export const shadow = Platform.select({
  ios: { shadowColor: warmShadowColor, shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 3 },
  default: {},
});

export const globalStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  h1: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.7 },
  h2: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow },
});
