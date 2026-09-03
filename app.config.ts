import type { ExpoConfig } from 'expo/config';

// Base URL untuk hosting web di sub-path (GitHub Pages: https://<user>.github.io/antar-aja/)
const baseUrl = process.env.EXPO_PUBLIC_BASE_URL ?? '';

const config: ExpoConfig = {
  name: 'Antar Aja',
  slug: 'antar-aja',
  version: '1.0.0',
  scheme: 'antaraja',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: '#FFFFFF',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'id.antaraja.app',
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'Antar Aja memakai lokasi Anda untuk menentukan titik jemput dan melacak perjalanan.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'Mitra driver membagikan lokasi saat online agar pelanggan bisa melacak pesanan.',
      NSCameraUsageDescription: 'Kamera dipakai untuk foto profil, dokumen mitra, dan bukti pengiriman.',
      NSPhotoLibraryUsageDescription: 'Galeri dipakai untuk mengunggah foto profil, dokumen mitra, dan bukti transfer.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'id.antaraja.app',
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#0E7C7B',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION'],
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
    bundler: 'metro',
    name: 'Antar Aja',
    shortName: 'Antar Aja',
    themeColor: '#0E7C7B',
    backgroundColor: '#FFFFFF',
    description: 'Antar Aja — ojek, mobil, makanan, dan kirim barang dalam satu aplikasi.',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-location', { locationWhenInUsePermission: 'Antar Aja memakai lokasi Anda untuk titik jemput dan pelacakan.' }],
    ['expo-image-picker', { photosPermission: 'Galeri dipakai untuk unggah foto & bukti transfer.' }],
    ['expo-splash-screen', { backgroundColor: '#0E7C7B', image: './assets/images/splash-icon.png', imageWidth: 140 }],
  ],
  experiments: { typedRoutes: false, reactCompiler: true, baseUrl },
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID ?? '' } },
};

export default config;
