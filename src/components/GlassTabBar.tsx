// Tab bar kaca mengambang dengan indikator "pil" yang meluncur antar tab
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { colors, glass, motion, radius, shadow } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type TabSpec = Record<string, { label: string; icon: IconName; iconActive: IconName }>;

export function makeGlassTabBar(spec: TabSpec, accent = colors.primary) {
  return function GlassTabBar({ state, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const reduce = useReducedMotion();
    const routes = state.routes.filter((r) => spec[r.name]);
    const barWidth = Math.min(width - 32, 520);
    const tabW = (barWidth - 12) / routes.length;
    const activeIdx = Math.max(0, routes.findIndex((r) => r.key === state.routes[state.index].key));
    const x = useSharedValue(activeIdx * tabW);
    useEffect(() => { x.value = reduce ? activeIdx * tabW : withSpring(activeIdx * tabW, motion.spring); }, [activeIdx, tabW, reduce, x]);
    const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
    return (
      <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[s.bar, { width: barWidth }]}>
          {Platform.OS !== 'android' && <BlurView intensity={glass.blurStrong} tint="light" style={StyleSheet.absoluteFill} />}
          <Animated.View style={[s.pill, { width: tabW, backgroundColor: accent + '1F' }, pill]} />
          {routes.map((r) => {
            const focused = state.routes[state.index].key === r.key;
            const sp = spec[r.name];
            return (
              <Pressable key={r.key} accessibilityRole="button" accessibilityState={focused ? { selected: true } : {}}
                onPress={() => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true }); if (!focused && !e.defaultPrevented) navigation.navigate(r.name); }}
                style={[s.tab, { width: tabW }]}>
                <Ionicons name={focused ? sp.iconActive : sp.icon} size={22} color={focused ? accent : colors.textMuted} />
                <Text style={[s.label, { color: focused ? accent : colors.textMuted }]}>{sp.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 16 },
  bar: { flexDirection: 'row', padding: 6, borderRadius: radius.xxl, backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.68)', borderWidth: 1, borderColor: glass.border, overflow: 'hidden', ...shadow.card },
  pill: { position: 'absolute', top: 6, bottom: 6, left: 6, borderRadius: radius.xxl },
  tab: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 2 },
  label: { fontSize: 11, fontWeight: '700' },
});

/** Ruang bawah agar konten tidak tertutup tab bar mengambang. */
export const TAB_BAR_SPACE = 96;
