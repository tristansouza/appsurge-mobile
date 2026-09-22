import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TabView, { SceneMap } from 'react-native-bottom-tabs';
import { Icon } from '../components/Icon';
import { colors, warmShadowColor } from '../theme';
import { trackTabViewed } from '../lib/analytics';
import { HomeScreen } from '../screens/HomeScreen';
import { QueueScreen } from '../screens/QueueScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const tabs = {
  Home: 'home-outline',
  Queue: 'sparkles-outline',
  Analytics: 'stats-chart-outline',
  Settings: 'settings-outline',
} as const;

// SF Symbol equivalents for the native SwiftUI tab bar (iOS only).
const sfSymbols = {
  Home: { focusedIcon: { sfSymbol: 'house.fill' }, unfocusedIcon: { sfSymbol: 'house' } },
  Queue: { focusedIcon: { sfSymbol: 'sparkles' }, unfocusedIcon: { sfSymbol: 'sparkles' } },
  Analytics: { focusedIcon: { sfSymbol: 'chart.bar.fill' }, unfocusedIcon: { sfSymbol: 'chart.bar' } },
  Settings: { focusedIcon: { sfSymbol: 'gearshape.fill' }, unfocusedIcon: { sfSymbol: 'gearshape' } },
} as const;

const scenes = SceneMap({
  Home: () => <HomeScreen />,
  Queue: () => <QueueScreen />,
  Analytics: () => <AnalyticsScreen />,
  Settings: () => <SettingsScreen />,
});

const routes = [
  { key: 'Home', title: 'Home', ...sfSymbols.Home },
  { key: 'Queue', title: 'Queue', badge: '2', badgeBackgroundColor: colors.accent, badgeTextColor: colors.surface, ...sfSymbols.Queue },
  { key: 'Analytics', title: 'Analytics', ...sfSymbols.Analytics },
  { key: 'Settings', title: 'Settings', ...sfSymbols.Settings },
];

/**
 * iOS: renders Apple's real SwiftUI TabView (react-native-bottom-tabs) —
 * native blur, SF Symbols, iOS 26 Liquid Glass, system haptics. No custom
 * styling: the point is that Apple draws it.
 * Android: keeps the existing React Navigation material tabs, untouched.
 */
export function MainTabs() {
  if (Platform.OS !== 'ios') return <AndroidTabs />;
  return <IosSwiftUiTabs />;
}

function IosSwiftUiTabs() {
  const [index, setIndex] = React.useState(0);
  return (
    <TabView
      navigationState={{ index, routes }}
      renderScene={scenes}
      onIndexChange={(i) => {
        setIndex(i);
        trackTabViewed(routes[i].key);
      }}
      tabBarActiveTintColor={colors.accent}
      labeled
      hapticFeedbackEnabled
      disablePageAnimations
      minimizeBehavior="never"
      scrollEdgeAppearance="default"
    />
  );
}

function AndroidTabs() {
  const insets = useSafeAreaInsets();
  // Android: clear the gesture nav bar. iOS: native bottom inset already
  // includes the home indicator — adding a fixed pad would double it.
  const bottomInset = Math.max(insets.bottom, 18);
  const baseHeight = 74;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', paddingBottom: 3 },
        tabBarStyle: {
          height: baseHeight + bottomInset,
          paddingTop: 9,
          paddingBottom: bottomInset,
          borderTopWidth: 0,
          backgroundColor: colors.surface,
          shadowColor: warmShadowColor,
          shadowOpacity: 0.08,
          shadowRadius: 15,
          shadowOffset: { width: 0, height: -3 },
          elevation: 8,
        },
        tabBarIcon: ({ color, size }) => (
          <Icon name={tabs[route.name as keyof typeof tabs]} color={color} size={size} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Queue" component={QueueScreen} options={{ tabBarBadge: 2, tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.surface, fontSize: 9 } }} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
