// Logo Antar Aja — 5 konsep (lihat assets/logo/preview.html). Ganti LOGO_VARIANT untuk memakai konsep lain.
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, useReducedMotion } from 'react-native-reanimated';
import { colors, font, shadow } from '@/lib/theme';

export type LogoVariant = 1 | 2 | 3 | 4 | 5;
export const LOGO_VARIANT: LogoVariant = 3;

export function BrandLogo({ size = 48, variant = LOGO_VARIANT, style }: { size?: number; variant?: LogoVariant; style?: object }) {
  return <View style={[{ width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden' }, shadow.glow(colors.primary), style]}><LogoSvg size={size} variant={variant} /></View>;
}

function LogoSvg({ size, variant }: { size: number; variant: LogoVariant }) {
  const s = size;
  switch (variant) {
    case 1: return (
      <Svg width={s} height={s} viewBox="0 0 256 256">
        <Defs><LinearGradient id="l1" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#14A39F" /><Stop offset="1" stopColor="#0A5C5B" /></LinearGradient><LinearGradient id="l1o" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFB547" /><Stop offset="1" stopColor="#F58A1F" /></LinearGradient></Defs>
        <Rect x="16" y="16" width="224" height="224" rx="64" fill="url(#l1)" />
        <Path d="M128 40 L200 196 L128 164 L56 196 Z" fill="#fff" opacity={0.96} /><Path d="M128 40 L200 196 L128 164 Z" fill="#E6F4F3" />
        <Circle cx="186" cy="70" r="20" fill="url(#l1o)" /><Path d="M60 210 h136" stroke="#fff" strokeOpacity={0.35} strokeWidth="6" strokeLinecap="round" />
      </Svg>
    );
    case 2: return (
      <Svg width={s} height={s} viewBox="0 0 256 256">
        <Defs><LinearGradient id="l2" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#0E7C7B" /><Stop offset="1" stopColor="#0A5C5B" /></LinearGradient><LinearGradient id="l2o" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#FFB547" /><Stop offset="1" stopColor="#F58A1F" /></LinearGradient></Defs>
        <Circle cx="128" cy="128" r="112" fill="url(#l2)" />
        <Path d="M74 190 L128 62 L182 190" fill="none" stroke="#fff" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M98 150 H158" stroke="url(#l2o)" strokeWidth="18" strokeLinecap="round" />
        <Path d="M26 128 H58" stroke="#fff" strokeOpacity={0.6} strokeWidth="10" strokeLinecap="round" /><Path d="M14 152 H50" stroke="#fff" strokeOpacity={0.35} strokeWidth="10" strokeLinecap="round" /><Path d="M38 104 H60" stroke="#fff" strokeOpacity={0.35} strokeWidth="10" strokeLinecap="round" />
      </Svg>
    );
    case 3: return (
      <Svg width={s} height={s} viewBox="0 0 256 256">
        <Defs><LinearGradient id="l3" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#17B3AE" /><Stop offset="1" stopColor="#0E7C7B" /></LinearGradient><LinearGradient id="l3o" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFC15E" /><Stop offset="1" stopColor="#F58A1F" /></LinearGradient></Defs>
        <Rect x="16" y="16" width="224" height="224" rx="72" fill="#F3F6F8" /><Rect x="16" y="16" width="224" height="224" rx="72" fill="none" stroke="#0E7C7B" strokeOpacity={0.18} strokeWidth="4" />
        <Path d="M48 140 a80 80 0 0 1 160 0 v34 a14 14 0 0 1 -14 14 h-132 a14 14 0 0 1 -14 -14 z" fill="url(#l3)" />
        <Path d="M48 140 a80 80 0 0 1 160 0 h-24 a56 56 0 0 0 -112 0 z" fill="#fff" opacity={0.18} />
        <Path d="M66 134 h124 a10 10 0 0 1 10 10 v14 a24 24 0 0 1 -24 24 h-96 a24 24 0 0 1 -24 -24 v-14 a10 10 0 0 1 10 -10 z" fill="url(#l3o)" />
        <Path d="M84 150 h60" stroke="#fff" strokeOpacity={0.7} strokeWidth="8" strokeLinecap="round" />
        <Path d="M104 206 q24 16 48 0" fill="none" stroke="#0E7C7B" strokeWidth="8" strokeLinecap="round" /><Circle cx="200" cy="82" r="8" fill="#F58A1F" />
      </Svg>
    );
    case 4: return (
      <Svg width={s} height={s} viewBox="0 0 256 256">
        <Defs><LinearGradient id="l4" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#0E7C7B" /><Stop offset="1" stopColor="#12938F" /></LinearGradient></Defs>
        <Rect x="16" y="16" width="224" height="224" rx="60" fill="url(#l4)" />
        <Path d="M70 176 C60 120, 120 120, 128 84 C136 120, 196 120, 186 176" fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth="10" strokeLinecap="round" strokeDasharray="2 18" />
        <Path d="M70 200 c-22 -30 -30 -44 -30 -60 a30 30 0 0 1 60 0 c0 16 -8 30 -30 60z" fill="#fff" /><Circle cx="70" cy="140" r="12" fill="#0E7C7B" />
        <Path d="M186 200 c-22 -30 -30 -44 -30 -60 a30 30 0 0 1 60 0 c0 16 -8 30 -30 60z" fill="#F5A524" /><Circle cx="186" cy="140" r="12" fill="#fff" />
        <Path d="M128 60 l14 26 h-28 z" fill="#FFC15E" />
      </Svg>
    );
    default: return (
      <Svg width={s} height={s} viewBox="0 0 256 256">
        <Defs><LinearGradient id="l5" x1="0" y1="1" x2="1" y2="0"><Stop offset="0" stopColor="#0A5C5B" /><Stop offset="1" stopColor="#17B3AE" /></LinearGradient><LinearGradient id="l5o" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFC15E" /><Stop offset="1" stopColor="#F58A1F" /></LinearGradient></Defs>
        <Circle cx="128" cy="128" r="112" fill="url(#l5)" />
        <Path d="M30 118 h58" stroke="#fff" strokeOpacity={0.9} strokeWidth="12" strokeLinecap="round" /><Path d="M44 142 h44" stroke="#fff" strokeOpacity={0.55} strokeWidth="12" strokeLinecap="round" /><Path d="M58 166 h30" stroke="#fff" strokeOpacity={0.3} strokeWidth="12" strokeLinecap="round" />
        <Path d="M158 206 c-30 -40 -42 -58 -42 -80 a42 42 0 0 1 84 0 c0 22 -12 40 -42 80z" fill="#fff" /><Circle cx="158" cy="126" r="20" fill="url(#l5o)" /><Circle cx="158" cy="126" r="7" fill="#fff" />
      </Svg>
    );
  }
}

/** Logo + nama merek (untuk header/welcome). */
export function LogoLockup({ size = 40, dark }: { size?: number; dark?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <BrandLogo size={size} />
      <View>
        <Text style={[font.display, { fontSize: size * 0.5, color: dark ? '#fff' : colors.text, lineHeight: size * 0.58 }]}>Antar Aja</Text>
        <Text style={{ fontSize: size * 0.26, color: dark ? 'rgba(255,255,255,0.8)' : colors.textSecondary, fontWeight: '600', letterSpacing: 0.8 }}>ANTAR APA AJA</Text>
      </View>
    </View>
  );
}

/** Logo berdenyut untuk halaman loading. */
export function LogoPulse({ size = 72, text }: { size?: number; text?: string }) {
  const p = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => { if (!reduce) p.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true); }, [p, reduce]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.5 - p.value * 0.5, transform: [{ scale: 1 + p.value * 0.6 }] }));
  const logo = useAnimatedStyle(() => ({ transform: [{ scale: 1 + p.value * 0.04 }] }));
  return (
    <View style={{ alignItems: 'center', gap: 14 }}>
      <View style={{ width: size * 1.8, height: size * 1.8, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size * 0.28, borderWidth: 2, borderColor: colors.primary }, ring]} />
        <Animated.View style={logo}><BrandLogo size={size} /></Animated.View>
      </View>
      {text ? <Text style={s.text}>{text}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({ text: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 } });
