import React, { useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { colors, radius, shadow, spacing } from '../theme';

type IconName = React.ComponentProps<typeof Icon>['name'];

type Slide = {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  title: string;
  body: string;
  comparison?: boolean;
  bullets?: string[];
};

const SLIDES: Slide[] = [
  {
    icon: 'sparkles',
    iconColor: colors.lavender,
    iconBg: colors.lavenderSoft,
    title: 'Meet Appsurge',
    body: 'Your AI content engine. Appsurge plans, writes, and schedules posts for TikTok, Instagram, YouTube, X, and Threads — every week, on autopilot.',
  },
  {
    icon: 'phone-portrait-outline',
    iconColor: colors.accent,
    iconBg: colors.accentSoft,
    title: 'Built for app developers',
    body: 'You ship apps, not social calendars. Appsurge keeps your product\u2019s socials alive and growing while you build — no marketing team required.',
  },
  {
    icon: 'trending-up',
    iconColor: colors.green,
    iconBg: colors.greenSoft,
    title: 'Your results, before and after',
    body: 'Same app. Same week. Completely different trajectory.',
    comparison: true,
  },
  {
    icon: 'shield-checkmark-outline',
    iconColor: colors.yellow,
    iconBg: colors.yellowSoft,
    title: 'Why Appsurge, not anyone else',
    body: 'Other tools hand you a dashboard. Appsurge runs the whole engine:',
    bullets: [
      'Autopilot — the desktop app posts for you, on schedule',
      'Review anywhere — approve or tweak the weekly plan from your phone',
      'Made for apps — content tuned to sell your product',
      'One plan, five platforms — TikTok, IG, YouTube, X, Threads',
    ],
  },
];

function BeforeAfter() {
  return (
    <View style={styles.compare}>
      <View style={styles.compareCard}>
        <View style={[styles.compareBadge, { backgroundColor: colors.dangerSoft }]}>
          <Text style={[styles.compareBadgeText, { color: colors.danger }]}>BEFORE</Text>
        </View>
        <Text style={styles.compareText}>0–1 posts a week, hours lost to captions and editing, followers stuck.</Text>
      </View>
      <View style={[styles.compareCard, styles.compareCardAfter]}>
        <View style={[styles.compareBadge, { backgroundColor: colors.greenSoft }]}>
          <Text style={[styles.compareBadgeText, { color: colors.green }]}>WITH APPSURGE</Text>
        </View>
        <Text style={styles.compareText}>7+ posts a week, hands-free — hooks, captions and images done, followers climbing.</Text>
      </View>
    </View>
  );
}

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const isLast = page === SLIDES.length - 1;

  const handleScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next >= 0 && next < SLIDES.length) setPage(next);
  };

  const go = () => {
    if (isLast) {
      onDone();
      return;
    }
    scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <View style={[styles.safe, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <Image source={require('../../appsurgeicon.png')} style={styles.brandIcon} />
          <Text style={styles.brandText}>appsurge</Text>
        </View>
        <Pressable onPress={onDone} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
      >
        {SLIDES.map((slide, index) => (
          <View key={String(index)} style={[styles.slide, { width }]}>
            <View style={[styles.iconBubble, { backgroundColor: slide.iconBg }]}>
              <Icon name={slide.icon} size={30} color={slide.iconColor} />
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
            {slide.comparison ? <BeforeAfter /> : null}
            {slide.bullets ? (
              <View style={styles.bullets}>
                {slide.bullets.map((bullet, i) => (
                  <View key={String(i)} style={styles.bullet}>
                    <Icon name="checkmark-circle" size={18} color={colors.accent} />
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={String(i)} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        <Pressable onPress={go} style={styles.cta}>
          <Text style={styles.ctaText}>{isLast ? 'Get started' : 'Next'}</Text>
          <Icon name="arrow-forward" size={18} color={colors.surface} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandIcon: { width: 26, height: 26, borderRadius: 8 },
  brandText: { color: colors.ink, fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
  skip: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  iconBubble: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center', marginBottom: 12 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 300 },
  compare: { width: '100%', gap: 10, marginTop: 22 },
  compareCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, ...shadow },
  compareCardAfter: { borderWidth: 1.5, borderColor: colors.accent },
  compareBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginBottom: 6 },
  compareBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  compareText: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  bullets: { width: '100%', gap: 12, marginTop: 22 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletText: { color: colors.ink, fontSize: 13.5, lineHeight: 19, flex: 1 },
  footer: { paddingHorizontal: spacing.xl, gap: 18 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.accent, width: 20 },
  cta: { height: 56, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12 },
  ctaText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
});
