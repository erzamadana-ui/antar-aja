import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY belum diisi di .env');
}

export const supabase = createClient(url ?? 'https://invalid.supabase.co', anonKey ?? 'anon', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

// Refresh token hanya saat app di foreground (rekomendasi Supabase untuk RN)
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Panggil RPC dan lempar error dalam bahasa yang ramah. */
export async function rpc<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, params as never);
  if (error) throw new Error(friendlyError(error.message));
  return data as T;
}

export function friendlyError(msg: string): string {
  if (!msg) return 'Terjadi kesalahan';
  if (msg.includes('Invalid login credentials')) return 'Email atau kata sandi salah';
  if (msg.includes('User already registered')) return 'Email sudah terdaftar, silakan masuk';
  if (msg.includes('Password should be')) return 'Kata sandi minimal 6 karakter';
  if (msg.includes('Email not confirmed')) return 'Email belum dikonfirmasi';
  if (msg.includes('Failed to fetch') || msg.includes('Network request failed')) return 'Tidak bisa terhubung ke server. Periksa koneksi internet.';
  if (msg.includes('JWT expired')) return 'Sesi berakhir, silakan masuk kembali';
  return msg.replace(/^.*?:\s*/, (m) => (m.length > 40 ? '' : m));
}
