import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { colors, warmShadowColor } from '../theme';
import { HomeScreen } from '../screens/HomeScreen';
import { QueueScreen } from '../screens/QueueScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const tabs: Record<string, React.ComponentProps<typeof Icon>['name']> = { Home: 'home-outline', Queue: 'sparkles-outline', Analytics: 'stats-chart-outline', Settings: 'settings-outline' };

export function MainTabs() {
  const insets = useSafeAreaInsets();
  // Android: clear the gesture nav bar. iOS: native bottom inset already
  // includes the home indicator — adding a fixed pad would double it.
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 18) : insets.bottom;
  const baseHeight = Platform.OS === 'ios' ? 84 : 74;
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
        tabBarIcon: ({ color, size }) => <Icon name={tabs[route.name]} color={color} size={size} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Queue" component={QueueScreen} options={{ tabBarBadge: 2, tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.surface, fontSize: 9 } }} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
