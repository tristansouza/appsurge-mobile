import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Appsurge startup error:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <View style={styles.screen}><Text style={styles.logo}>appsurge</Text><Text style={styles.title}>The app hit a snag.</Text><Text style={styles.body}>{this.state.error.message || 'Unknown startup error'}</Text><Pressable onPress={() => this.setState({ error: null })} style={styles.button}><Text style={styles.buttonText}>Try again</Text></Pressable></View>;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, justifyContent: 'center', padding: spacing.xl },
  logo: { color: colors.accent, fontSize: 20, fontWeight: '900', marginBottom: spacing.xl },
  title: { color: colors.ink, fontSize: 27, fontWeight: '800', marginBottom: spacing.sm },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: spacing.xl },
  button: { alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 13 },
  buttonText: { color: colors.surface, fontWeight: '800' },
});
