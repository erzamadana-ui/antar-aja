// Bottom sheet kaca yang bisa ditarik (snap: ringkas ↔ penuh)
import React, { useEffect } from 'react';
import { View, StyleSheet, ScrollView, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { colors, glass, motion, radius, shadow } from '@/lib/theme';

interface SheetProps {
  children: React.ReactNode;
  /** Tinggi saat ringkas & penuh (px). */
  minHeight?: number;
  maxHeight: number;
  /** Bagian yang selalu tampak & jadi pegangan tarik. */
  header?: React.ReactNode;
  initiallyExpanded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Jika true, sheet dirender statis (mis. panel samping di layar lebar). */
  staticPanel?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  expanded?: boolean; // kontrol dari luar (opsional)
  /** Ruang ekstra di bawah isi (mis. saat ada tab bar mengambang). */
  bottomSpace?: number;
}

export function DraggableSheet({ children, minHeight = 220, maxHeight, header, initiallyExpanded = true, style, contentStyle, staticPanel, onExpandedChange, expanded, bottomSpace = 0 }: SheetProps) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const h = useSharedValue(initiallyExpanded ? maxHeight : minHeight);
  const start = useSharedValue(0);
  const isWeb = Platform.OS === 'web';

  useEffect(() => { if (expanded !== undefined) h.value = withSpring(expanded ? maxHeight : minHeight, motion.springSoft); }, [expanded, maxHeight, minHeight, h]);
  useEffect(() => { if (h.value > minHeight) h.value = withSpring(maxHeight, motion.springSoft); }, [maxHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const settle = (target: number) => { h.value = reduce ? target : withSpring(target, motion.springSoft); onExpandedChange?.(target === maxHeight); };
  const pan = Gesture.Pan()
    .onStart(() => { start.value = h.value; })
    .onUpdate((e) => { h.value = Math.min(maxHeight + 20, Math.max(minHeight - 20, start.value - e.translationY)); })
    .onEnd((e) => {
      const mid = (minHeight + maxHeight) / 2;
      const target = e.velocityY < -300 ? maxHeight : e.velocityY > 300 ? minHeight : h.value > mid ? maxHeight : minHeight;
      settle(target);
    })
    .activeOffsetY([-6, 6])
    .runOnJS(true);
  const tap = Gesture.Tap().hitSlop({ horizontal: 40, vertical: 12 }).onEnd(() => { settle(h.value > (minHeight + maxHeight) / 2 ? minHeight : maxHeight); }).runOnJS(true);

  const a = useAnimatedStyle(() => ({ height: h.value }));

  if (staticPanel) {
    return (
      <View style={[s.panel, style]}>
        {header ? <View style={[s.headerWrap, s.panelHeader]}>{header}</View> : null}
        <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: 24 + bottomSpace }, contentStyle]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    );
  }

  return (
    <Animated.View style={[s.sheet, a, style]}>
      {!isWeb && Platform.OS === 'ios' && <BlurView intensity={glass.blurStrong} tint="light" style={StyleSheet.absoluteFill} />}
      {isWeb && <BlurView intensity={glass.blurStrong} tint="light" style={StyleSheet.absoluteFill} />}
      <GestureDetector gesture={pan}>
        <View style={s.grab}>
          <GestureDetector gesture={tap}><View style={s.handleHit}><View style={s.handle} /></View></GestureDetector>
          {header ? <View style={s.headerWrap}>{header}</View> : null}
        </View>
      </GestureDetector>
      <ScrollView contentContainerStyle={[{ padding: 16, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 12) + 12 + bottomSpace }, contentStyle]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.72)', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden', borderTopWidth: 1, borderColor: glass.border, ...shadow.sheet },
  panel: { backgroundColor: colors.bg, borderLeftWidth: 1, borderLeftColor: colors.border },
  panelHeader: { padding: 16, paddingBottom: 10, backgroundColor: 'rgba(255,255,255,0.7)', borderBottomWidth: 1, borderBottomColor: colors.border },
  grab: { paddingTop: 10, paddingHorizontal: 16, paddingBottom: 6, ...(Platform.OS === 'web' ? ({ cursor: 'grab' } as object) : {}) },
  handleHit: { alignSelf: 'center', paddingHorizontal: 40, paddingVertical: 4, marginBottom: 4, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}) },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(11,31,42,0.18)' },
  headerWrap: { paddingBottom: 6 },
});
