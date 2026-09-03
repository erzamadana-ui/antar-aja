// Design system Antar Aja
export const colors = {
  primary: '#0E7C7B',
  primaryDark: '#0A5C5B',
  primaryLight: '#E3F3F2',
  accent: '#F5A524',
  accentLight: '#FFF3DD',
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  text: '#0B1F2A',
  textSecondary: '#5B6B76',
  textMuted: '#8B98A2',
  border: '#E5E9EE',
  danger: '#E5484D',
  dangerLight: '#FDECEC',
  success: '#1FA363',
  successLight: '#E4F6EC',
  warning: '#D97706',
  info: '#2F80ED',
  infoLight: '#E8F1FD',
  overlay: 'rgba(11,31,42,0.45)',
  // warna layanan
  ride: '#00A86B',
  car: '#2F80ED',
  food: '#EB5757',
  send: '#7B61FF',
  pay: '#0E7C7B',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 };

export const shadow = {
  card: {
    shadowColor: '#0B1F2A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sheet: {
    shadowColor: '#0B1F2A',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
};

export const font = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textSecondary },
  tiny: { fontSize: 11, color: colors.textMuted },
};
