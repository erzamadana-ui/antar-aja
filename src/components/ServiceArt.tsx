// Ilustrasi kartun per layanan (SVG) — pemotor berhelm, mobil, kurir makanan, paket, belanja, dompet.
// Dibingkai lingkaran gradasi senada warna layanan + border kaca.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect, Ellipse, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import { shadow } from '@/lib/theme';

export type ArtKind = 'rider' | 'car' | 'food' | 'send' | 'shop' | 'pay';

/** Hanya gambar (tanpa bingkai). */
export function ServiceIllustration({ kind, size = 56 }: { kind: ArtKind; size?: number }) {
  const s = size;
  switch (kind) {
    case 'rider': return (
      <Svg width={s} height={s} viewBox="0 0 64 64">
        <Defs><LinearGradient id="helm" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFD166" /><Stop offset="1" stopColor="#F58A1F" /></LinearGradient></Defs>
        {/* roda */}
        <Circle cx="16" cy="48" r="8" fill="#0B1F2A" /><Circle cx="16" cy="48" r="3.5" fill="#E3E8ED" />
        <Circle cx="50" cy="48" r="8" fill="#0B1F2A" /><Circle cx="50" cy="48" r="3.5" fill="#E3E8ED" />
        {/* bodi motor */}
        <Path d="M12 44 L26 32 L40 32 L48 40 L44 46 L22 46 Z" fill="#00A86B" />
        <Path d="M40 32 L52 30 L56 40 L48 40 Z" fill="#0E7C7B" />
        <Rect x="24" y="28" width="10" height="5" rx="2" fill="#0B1F2A" />
        <Circle cx="55" cy="35" r="2.6" fill="#FFF3DD" />
        {/* tubuh pengendara */}
        <Path d="M30 30 C30 22 40 22 40 30 L40 36 L30 36 Z" fill="#2F80ED" />
        <Path d="M40 30 L47 34 L45 37 L38 34 Z" fill="#2F80ED" />
        <Path d="M31 36 L28 41 L33 42 L36 36 Z" fill="#0B1F2A" />
        {/* helm */}
        <Circle cx="35" cy="19" r="9" fill="url(#helm)" />
        <Path d="M26 20 a9 9 0 0 1 18 0 Z" fill="#fff" opacity="0.25" />
        <Path d="M28 21 h14 a2 2 0 0 1 2 2 v1 a4 4 0 0 1 -4 4 h-10 a4 4 0 0 1 -4 -4 v-1 a2 2 0 0 1 2 -2 z" fill="#0B1F2A" />
        <Path d="M31 24 h6" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
        <Path d="M38 27.5 q1.5 1.2 3 0" stroke="#0B1F2A" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        {/* garis kecepatan */}
        <Path d="M4 30 h8 M2 36 h6 M6 24 h5" stroke="#00A86B" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </Svg>
    );
    case 'car': return (
      <Svg width={s} height={s} viewBox="0 0 64 64">
        <Defs><LinearGradient id="carg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#5AA2F5" /><Stop offset="1" stopColor="#2F80ED" /></LinearGradient></Defs>
        <Path d="M8 42 L12 30 C13 27 15 26 18 26 H44 C47 26 49 27 51 30 L57 42 Z" fill="url(#carg)" />
        <Path d="M14 40 L17 31 H30 V40 Z" fill="#DCEBFF" /><Path d="M33 31 H43 L47 40 H33 Z" fill="#DCEBFF" />
        <Rect x="6" y="40" width="52" height="10" rx="4" fill="#1F6FD6" />
        <Circle cx="18" cy="50" r="6.5" fill="#0B1F2A" /><Circle cx="18" cy="50" r="2.6" fill="#E3E8ED" />
        <Circle cx="46" cy="50" r="6.5" fill="#0B1F2A" /><Circle cx="46" cy="50" r="2.6" fill="#E3E8ED" />
        <Rect x="7" y="43" width="6" height="3" rx="1.5" fill="#FFD166" /><Rect x="51" y="43" width="6" height="3" rx="1.5" fill="#FF6B6B" />
        {/* pengemudi tersenyum */}
        <Circle cx="24" cy="34" r="3.2" fill="#FFD9B8" /><Path d="M22.5 35.5 q1.5 1.2 3 0" stroke="#0B1F2A" strokeWidth="0.9" fill="none" />
        <Path d="M20 30 a4 4 0 0 1 8 0 Z" fill="#0B1F2A" />
        <Path d="M2 46 h6 M3 40 h5" stroke="#2F80ED" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </Svg>
    );
    case 'food': return (
      <Svg width={s} height={s} viewBox="0 0 64 64">
        <Defs><LinearGradient id="bowl" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FF7B7B" /><Stop offset="1" stopColor="#EB5757" /></LinearGradient></Defs>
        {/* uap */}
        <Path d="M26 14 c-2 3 2 5 0 8 M32 12 c-2 3 2 5 0 8 M38 14 c-2 3 2 5 0 8" stroke="#F5A524" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8" />
        {/* mangkuk */}
        <Path d="M10 30 H54 C54 44 46 52 32 52 C18 52 10 44 10 30 Z" fill="url(#bowl)" />
        <Rect x="8" y="27" width="48" height="6" rx="3" fill="#fff" />
        <Path d="M16 33 c4 6 8 6 12 0 c4 6 8 6 12 0 c3 4 6 5 8 0" stroke="#FFD166" strokeWidth="3" fill="none" strokeLinecap="round" />
        <Circle cx="24" cy="24" r="4" fill="#00A86B" /><Circle cx="40" cy="23" r="4.5" fill="#FF9F43" /><Circle cx="32" cy="22" r="3.5" fill="#FFF3DD" />
        {/* sumpit */}
        <Path d="M46 10 L58 34" stroke="#8B5E34" strokeWidth="3" strokeLinecap="round" /><Path d="M52 8 L60 30" stroke="#A8744A" strokeWidth="3" strokeLinecap="round" />
        {/* wajah mangkuk */}
        <Circle cx="27" cy="41" r="1.6" fill="#0B1F2A" /><Circle cx="37" cy="41" r="1.6" fill="#0B1F2A" /><Path d="M29 45 q3 2.5 6 0" stroke="#0B1F2A" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </Svg>
    );
    case 'send': return (
      <Svg width={s} height={s} viewBox="0 0 64 64">
        <Defs><LinearGradient id="box" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#9A86FF" /><Stop offset="1" stopColor="#7B61FF" /></LinearGradient></Defs>
        <Path d="M12 24 L32 14 L52 24 L32 34 Z" fill="#B9ADFF" />
        <Path d="M12 24 L32 34 V54 L12 44 Z" fill="url(#box)" />
        <Path d="M52 24 L32 34 V54 L52 44 Z" fill="#5B43D6" />
        <Path d="M22 19 L42 29 V37 L38 35 V31 L20 22 Z" fill="#FFD166" />
        {/* wajah */}
        <Circle cx="20" cy="40" r="1.6" fill="#fff" /><Circle cx="27" cy="43" r="1.6" fill="#fff" /><Path d="M21 46 q3 3 6 1" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        {/* kilat kecepatan */}
        <Path d="M4 30 h6 M2 36 h5 M4 42 h6" stroke="#7B61FF" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <Path d="M56 12 l-4 8 h5 l-4 8" stroke="#F5A524" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
    case 'shop': return (
      <Svg width={s} height={s} viewBox="0 0 64 64">
        <Defs><LinearGradient id="bag" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#38BDF8" /><Stop offset="1" stopColor="#0EA5E9" /></LinearGradient></Defs>
        {/* keranjang belanja */}
        <Path d="M8 26 H56 L50 50 a4 4 0 0 1 -4 3 H18 a4 4 0 0 1 -4 -3 Z" fill="url(#bag)" />
        <Path d="M14 26 L22 12 M50 26 L42 12" stroke="#0369A1" strokeWidth="3" strokeLinecap="round" />
        <Path d="M20 32 v14 M28 32 v14 M36 32 v14 M44 32 v14" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
        {/* isi belanjaan */}
        <Rect x="24" y="10" width="8" height="14" rx="2" fill="#FF6B6B" /><Circle cx="38" cy="18" r="6" fill="#FFD166" /><Rect x="16" y="14" width="7" height="10" rx="2" fill="#00A86B" />
        {/* wajah keranjang */}
        <Circle cx="27" cy="40" r="1.6" fill="#0B1F2A" /><Circle cx="37" cy="40" r="1.6" fill="#0B1F2A" /><Path d="M29 44 q3 2.5 6 0" stroke="#0B1F2A" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <Circle cx="20" cy="58" r="3.5" fill="#0B1F2A" /><Circle cx="44" cy="58" r="3.5" fill="#0B1F2A" />
      </Svg>
    );
    case 'pay': return (
      <Svg width={s} height={s} viewBox="0 0 64 64">
        <Defs><LinearGradient id="wal" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#14A39F" /><Stop offset="1" stopColor="#0A5C5B" /></LinearGradient></Defs>
        <Rect x="8" y="18" width="44" height="32" rx="7" fill="url(#wal)" />
        <Path d="M12 18 L40 10 a3 3 0 0 1 4 3 v5" fill="#0E7C7B" />
        <Rect x="36" y="28" width="22" height="14" rx="5" fill="#FFD166" />
        <Circle cx="46" cy="35" r="3" fill="#0B1F2A" />
        <Path d="M14 26 h12 M14 32 h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        {/* koin melayang */}
        <Circle cx="14" cy="12" r="5" fill="#F5A524" /><Circle cx="14" cy="12" r="2" fill="#FFF3DD" />
        <Circle cx="56" cy="16" r="3.5" fill="#F5A524" />
        {/* wajah dompet */}
        <Circle cx="20" cy="42" r="1.5" fill="#fff" /><Circle cx="28" cy="42" r="1.5" fill="#fff" /><Path d="M21 45.5 q3 2.5 6 0" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </Svg>
    );
  }
}

/** Gambar dalam bingkai lingkaran: gradasi tipis warna layanan + border senada + glow. */
export function ServiceArt({ kind, color, size = 64, glow = true }: { kind: ArtKind; color: string; size?: number; glow?: boolean }) {
  const r = size / 2;
  return (
    <View style={[{ width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '14', borderWidth: 1.5, borderColor: color + '55' }, glow && shadow.glow(color)]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: 'hidden' }]}>
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs><LinearGradient id={`bg-${kind}`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#fff" stopOpacity="0.9" /><Stop offset="1" stopColor={color} stopOpacity="0.25" /></LinearGradient></Defs>
          <Circle cx="32" cy="32" r="32" fill={`url(#bg-${kind})`} />
          <G opacity="0.35"><Ellipse cx="22" cy="18" rx="12" ry="7" fill="#fff" /></G>
        </Svg>
      </View>
      <ServiceIllustration kind={kind} size={Math.round(size * 0.72)} />
    </View>
  );
}
