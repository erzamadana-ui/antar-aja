import type { ExpoConfig } from 'expo/config';

// Satu basis kode → 3 aplikasi berbeda. Pilih lewat env APP=pelanggan|mitra|admin (default: pelanggan).
//   APP=mitra npx expo export --platform web   → web aplikasi Mitra
//   APP=mitra npx expo prebuild -p android     → proyek Android aplikasi Mitra
// Rute tiap aplikasi ada di apps/<app>/app, layar bersama di src/screens, komponen di src/.
type AppKind = 'pelanggan' | 'mitra' | 'admin';
const APP = ((process.env.APP || process.env.EXPO_PUBLIC_APP || 'pelanggan') as AppKind);
process.env.EXPO_PUBLIC_APP = APP;

// Base URL untuk hosting web di sub-path (GitHub Pages: https://<user>.github.io/antarkita/[mitra|admin])
const baseUrl = process.env.EXPO_PUBLIC_BASE_URL ?? '';

const META: Record<AppKind, { name: string; slug: string; scheme: string; id: string; bg: string; desc: string }> = {
  pelanggan: { name: 'AntarKita', slug: 'antarkita', scheme: 'antarkita', id: 'id.antarkita.app', bg: '#0E9488', desc: 'AntarKita — ojek, mobil, makanan, belanja, kirim barang, dan travel antar kota dalam satu aplikasi.' },
  mitra: { name: 'AntarKita Mitra', slug: 'antarkita-mitra', scheme: 'antarkitamitra', id: 'id.antarkita.mitra', bg: '#0F2A28', desc: 'AntarKita Mitra — aplikasi driver, merchant, mitra travel, dan mobil box.' },
  admin: { name: 'AntarKita Admin', slug: 'antarkita-admin', scheme: 'antarkitaadmin', id: 'id.antarkita.admin', bg: '#1F3A38', desc: 'AntarKita Admin — panel operasional, CS, keuangan, dan portal eksekutif.' },
};
const m = META[APP];
const assets = `./apps/${APP}/assets`;

const config: ExpoConfig = {
  name: m.name,
  slug: m.slug,
  version: '3.0.0',
  scheme: m.scheme,
  orientation: 'portrait',
  icon: `${assets}/icon.png`,
  userInterfaceStyle: 'light',
  backgroundColor: '#F4F7F8',
  ios: {
    supportsTablet: APP === 'admin',
    bundleIdentifier: m.id,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: `${m.name} memakai lokasi Anda untuk menentukan titik jemput dan melacak perjalanan.`,
      NSLocationAlwaysAndWhenInUseUsageDescription: 'Mitra driver membagikan lokasi saat online agar pelanggan bisa melacak pesanan.',
      NSCameraUsageDescription: 'Kamera dipakai untuk foto profil, dokumen mitra, selfie keamanan, dan bukti pengiriman.',
      NSPhotoLibraryUsageDescription: 'Galeri dipakai untuk mengunggah foto profil, dokumen mitra, dan bukti transfer.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: m.id,
    adaptiveIcon: { foregroundImage: `${assets}/adaptive-icon.png`, backgroundColor: m.bg },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION'],
  },
  web: {
    output: 'single',
    favicon: `${assets}/favicon.png`,
    bundler: 'metro',
    name: m.name,
    shortName: m.name,
    themeColor: m.bg,
    backgroundColor: '#F4F7F8',
    description: m.desc,
  },
  plugins: [
    ['expo-router', { root: `./apps/${APP}/app` }],
    'expo-secure-store',
    ['expo-location', { locationWhenInUsePermission: `${m.name} memakai lokasi Anda untuk titik jemput dan pelacakan.` }],
    ['expo-image-picker', { photosPermission: 'Galeri dipakai untuk unggah foto & bukti transfer.' }],
    ['expo-splash-screen', { backgroundColor: m.bg, image: `${assets}/splash-icon.png`, imageWidth: 140 }],
    ['@config-plugins/react-native-webrtc', { cameraPermission: 'Kamera tidak dipakai untuk panggilan suara.', microphonePermission: 'Mikrofon dipakai untuk panggilan suara dalam aplikasi.' }],
    'expo-localization',
  ],
  experiments: { typedRoutes: false, reactCompiler: true, baseUrl },
  extra: { app: APP, eas: { projectId: process.env.EAS_PROJECT_ID ?? '' } },
};

export default config;
