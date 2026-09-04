// Design system AntarKita 2026 — "Solid Motion" (Arah A, disetujui Erza 4 Sep 2026)
// Prinsip: permukaan padat (kaca hanya di header band, tab bar, dan panel di atas peta — transparansi terkendali),
// tipografi Plus Jakarta Sans skala 4-pt (tidak ada teks < 12), warna dari logo C29, gerak singkat & bermakna,
// tema selalu terang (pengaturan dark mode OS diabaikan).
import { Easing } from 'react-native-reanimated';
import { Platform } from 'react-native';

export const colors = {
  primary: '#0E9488',
  primaryDark: '#0B6E64',
  primaryLight: '#E6F6F3',
  primarySoft: 'rgba(14,148,136,0.10)',
  mint: '#BFF3EA',
  ink: '#0F2A28',
  accent: '#F5A524',
  accentLight: '#FFF3DD',
  bg: '#F4F7F8',
  surface: '#FFFFFF',
  text: '#0F2A28',
  textSecondary: '#4F6663',
  textMuted: '#7A8F8C',
  border: '#E4EBEC',
  danger: '#E5484D',
  dangerLight: '#FDECEC',
  success: '#1FA363',
  successLight: '#E4F6EC',
  warning: '#D97706',
  info: '#2F80ED',
  infoLight: '#E8F1FD',
  overlay: 'rgba(15,42,40,0.42)',
  // warna layanan
  ride: '#0E9488',
  car: '#2F80ED',
  food: '#E5484D',
  send: '#7B61FF',
  pay: '#0E9488',
  shop: '#0EA5E9',
  market: '#1FA363',
  box: '#D97706',
  travel: '#1D4ED8',
};

/** Permukaan kaca — transparansi terkendali: kartu ≈ padat, blur hanya untuk bar/panel mengambang. */
export const glass = {
  fill: 'rgba(255,255,255,0.94)',
  fillStrong: 'rgba(255,255,255,0.97)',
  fillSoft: 'rgba(255,255,255,0.86)',
  fillDark: 'rgba(15,42,40,0.82)',
  border: 'rgba(228,235,236,1)',
  borderDark: 'rgba(255,255,255,0.14)',
  highlight: 'rgba(255,255,255,0.9)',
  tintTeal: 'rgba(14,148,136,0.10)',
  tintAmber: 'rgba(245,165,36,0.14)',
  blur: 18,
  blurStrong: 28,
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 12, md: 16, lg: 20, xl: 28, xxl: 32, full: 999 };

export const shadow = {
  card: {
    shadowColor: '#0F2A28',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  soft: {
    shadowColor: '#0F2A28',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sheet: {
    shadowColor: '#0F2A28',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 14,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  }),
};

/** Keluarga font per bobot (Plus Jakarta Sans, dimuat di RootLayout). Di luar bobot ini memakai font sistem. */
export const FONT_FAMILY = {
  500: 'PlusJakartaSans-500',
  600: 'PlusJakartaSans-600',
  700: 'PlusJakartaSans-700',
  800: 'PlusJakartaSans-800',
} as const;
export const FONT_ASSETS = {
  'PlusJakartaSans-500': require('../../assets/fonts/PlusJakartaSans-500.ttf'),
  'PlusJakartaSans-600': require('../../assets/fonts/PlusJakartaSans-600.ttf'),
  'PlusJakartaSans-700': require('../../assets/fonts/PlusJakartaSans-700.ttf'),
  'PlusJakartaSans-800': require('../../assets/fonts/PlusJakartaSans-800.ttf'),
};
/** Style keluarga font untuk bobot tertentu (fontWeight tetap ikut agar fallback sistem benar). */
export const fam = (w: 500 | 600 | 700 | 800) => ({ fontFamily: FONT_FAMILY[w], fontWeight: String(w) as '500' | '600' | '700' | '800' });
const W = fam;

export const font = {
  // Skala tipografi 4-pt: 28 / 24 / 20 / 17 / 15 / 13 / 12 / label 11
  display: { fontSize: 28, ...W(800), color: colors.text, letterSpacing: -0.5, lineHeight: 34 },
  h1: { fontSize: 24, ...W(800), color: colors.text, letterSpacing: -0.3, lineHeight: 30 },
  h2: { fontSize: 20, ...W(800), color: colors.text, letterSpacing: -0.2, lineHeight: 26 },
  h3: { fontSize: 17, ...W(700), color: colors.text, lineHeight: 22 },
  body: { fontSize: 15, ...W(500), color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, ...W(500), color: colors.textSecondary, lineHeight: 18 },
  tiny: { fontSize: 12, ...W(500), color: colors.textMuted, lineHeight: 16 },
  label: { fontSize: 11, ...W(700), color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' as const },
};

/** Token gerak: singkat & bermakna — aplikasi harus terasa gesit. */
export const motion = {
  fast: 100,
  base: 160,
  slow: 240,
  stagger: 30,
  easeOut: Easing.out(Easing.cubic),
  easeInOut: Easing.inOut(Easing.cubic),
  spring: { damping: 20, stiffness: 320, mass: 0.7 },
  springSoft: { damping: 24, stiffness: 240, mass: 0.9 },
  springBouncy: { damping: 15, stiffness: 340, mass: 0.6 },
};

/** Blur hanya tersedia di iOS/web; Android memakai fill padat (lebih ringan). */
export const canBlur = Platform.OS !== 'android';
