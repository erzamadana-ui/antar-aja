// Design system Antar Aja 2026 — "Light Glass"
// Prinsip: permukaan tembus pandang (glass) di atas latar hidup, gerak yang bermakna, kontras tetap tinggi untuk pemakaian di luar ruangan.
import { Easing } from 'react-native-reanimated';

export const colors = {
  primary: '#0E7C7B',
  primaryDark: '#0A5C5B',
  primaryLight: '#E3F3F2',
  primarySoft: 'rgba(14,124,123,0.10)',
  accent: '#F5A524',
  accentLight: '#FFF3DD',
  bg: '#F3F6F8',
  surface: '#FFFFFF',
  text: '#0B1F2A',
  textSecondary: '#5B6B76',
  textMuted: '#8B98A2',
  border: '#E3E8ED',
  danger: '#E5484D',
  dangerLight: '#FDECEC',
  success: '#1FA363',
  successLight: '#E4F6EC',
  warning: '#D97706',
  info: '#2F80ED',
  infoLight: '#E8F1FD',
  overlay: 'rgba(11,31,42,0.40)',
  // warna layanan
  ride: '#00A86B',
  car: '#2F80ED',
  food: '#EB5757',
  send: '#7B61FF',
  pay: '#0E7C7B',
  shop: '#0EA5E9',
};

/** Permukaan kaca: dipakai bersama BlurView (iOS/web) atau sebagai fallback translusen (Android). */
export const glass = {
  fill: 'rgba(255,255,255,0.62)',
  fillStrong: 'rgba(255,255,255,0.80)',
  fillSoft: 'rgba(255,255,255,0.42)',
  fillDark: 'rgba(11,31,42,0.55)',
  border: 'rgba(255,255,255,0.65)',
  borderDark: 'rgba(255,255,255,0.18)',
  highlight: 'rgba(255,255,255,0.9)',
  tintTeal: 'rgba(14,124,123,0.12)',
  tintAmber: 'rgba(245,165,36,0.14)',
  blur: 28,
  blurStrong: 48,
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, xxl: 36, full: 999 };

export const shadow = {
  card: {
    shadowColor: '#0B1F2A',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  soft: {
    shadowColor: '#0B1F2A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sheet: {
    shadowColor: '#0B1F2A',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  }),
};

export const font = {
  display: { fontSize: 32, fontWeight: '900' as const, color: colors.text, letterSpacing: -0.8 },
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.2 },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textSecondary },
  tiny: { fontSize: 11, color: colors.textMuted, letterSpacing: 0.2 },
  label: { fontSize: 11, fontWeight: '700' as const, color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' as const },
};

/** Token gerak: durasi & easing yang konsisten di seluruh aplikasi. */
export const motion = {
  fast: 160,
  base: 260,
  slow: 420,
  stagger: 55,
  easeOut: Easing.out(Easing.cubic),
  easeInOut: Easing.inOut(Easing.cubic),
  spring: { damping: 18, stiffness: 220, mass: 0.8 },
  springSoft: { damping: 22, stiffness: 160, mass: 1 },
  springBouncy: { damping: 12, stiffness: 240, mass: 0.7 },
};
