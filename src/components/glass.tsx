// Permukaan kaca (transparansi terkendali) & latar ambien statis — Solid Motion
import React from 'react';
import { View, StyleSheet, Platform, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, glass, radius, shadow } from '@/lib/theme';

interface GlassProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  /** 'light' (default) | 'strong' (lebih pekat, untuk teks panjang) | 'soft' (lebih transparan) | 'dark' */
  variant?: 'light' | 'strong' | 'soft' | 'dark';
  radius?: number;
  padded?: boolean;
  shadowed?: boolean;
  border?: boolean;
}

const canBlur = Platform.OS !== 'android';

/** Kartu kaca: blur di iOS/web, translusen di Android (tanpa blur agar ringan). */
export function Glass({ children, style, intensity, variant = 'light', radius: r = radius.lg, padded, shadowed = true, border = true }: GlassProps) {
  const fill = variant === 'strong' ? glass.fillStrong : variant === 'soft' ? glass.fillSoft : variant === 'dark' ? glass.fillDark : glass.fill;
  const borderColor = variant === 'dark' ? glass.borderDark : glass.border;
  const tint = variant === 'dark' ? 'dark' : 'light';
  const base: ViewStyle = { borderRadius: r, overflow: 'hidden', backgroundColor: canBlur ? fill : opaque(fill), borderWidth: border ? StyleSheet.hairlineWidth * 1.5 : 0, borderColor };
  return (
    <View style={[shadowed && shadow.card, { borderRadius: r }, style]}>
      <View style={[base, padded && { padding: 16 }]}>
        {canBlur && <BlurView intensity={intensity ?? (variant === 'strong' ? glass.blurStrong : glass.blur)} tint={tint} style={StyleSheet.absoluteFill} />}
        {variant !== 'dark' && <View pointerEvents="none" style={styles.highlight} />}
        <View style={{ position: 'relative' }}>{children}</View>
      </View>
    </View>
  );
}

/** Android tanpa blur: naikkan opasitas agar tetap terbaca di atas peta. */
function opaque(rgba: string) {
  const m = rgba.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
  if (!m) return rgba;
  const a = Math.min(1, Number(m[4]) + 0.28);
  return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
}

/** Latar ambien "Solid Motion": gradien lembut statis + dua gumpalan warna yang diam (ringan, tanpa animasi). */
export function AmbientBackground({ tint = 'teal', style }: { tint?: 'teal' | 'amber' | 'mixed'; style?: StyleProp<ViewStyle> }) {
  const a = tint === 'amber' ? 'rgba(245,165,36,0.16)' : 'rgba(14,148,136,0.14)';
  const b = tint === 'teal' ? 'rgba(191,243,234,0.35)' : 'rgba(245,165,36,0.12)';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: colors.bg }, style]}>
      <LinearGradient colors={['#F7FAFA', '#F1F6F6', '#F4F7F8']} style={StyleSheet.absoluteFill} />
      <View style={[styles.blob, { backgroundColor: a, top: -160, right: -120, width: 380, height: 380 }]} />
      <View style={[styles.blob, { backgroundColor: b, bottom: -200, left: -100, width: 420, height: 420 }]} />
    </View>
  );
}

/** Gradien brand untuk tombol/hero. */
export function BrandGradient({ children, style, colors: cs, angle = 'diag' }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; colors?: [string, string, ...string[]]; angle?: 'diag' | 'vertical' | 'horizontal' }) {
  const end = angle === 'vertical' ? { x: 0, y: 1 } : angle === 'horizontal' ? { x: 1, y: 0 } : { x: 1, y: 1 };
  return <LinearGradient colors={cs ?? [colors.primary, '#12B3A4']} start={{ x: 0, y: 0 }} end={end} style={style}>{children}</LinearGradient>;
}

const styles = StyleSheet.create({
  highlight: { position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: glass.highlight, opacity: 0.9 },
  blob: { position: 'absolute', borderRadius: 999, ...(Platform.OS === 'web' ? ({ filter: 'blur(80px)' } as object) : { opacity: 0.6 }) },
});
