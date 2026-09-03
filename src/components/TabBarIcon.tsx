import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, type ColorValue } from 'react-native';
import { colors } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => <Ionicons name={focused ? active : inactive} size={23} color={color as string} />;
}

export const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    height: Platform.OS === 'ios' ? 84 : 64,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 26 : 8,
  },
  sceneStyle: { backgroundColor: colors.bg },
};

export { Tabs };
