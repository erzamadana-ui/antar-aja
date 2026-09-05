import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/store/auth';
import { Loading } from '@/components/ui';
import { APP } from '@/lib/app';

/** Membungkus layout yang butuh login (dan peran tertentu). Tujuan pengalihan disesuaikan dengan aplikasi yang sedang berjalan. */
export function RequireAuth({ children, role }: { children: React.ReactNode; role?: 'admin' | 'driver' | 'merchant' | 'vendor' }) {
  const { session, profile, driver, merchant, marketVendor, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (!profile) return <Loading text="Memuat profil…" />;
  if (role === 'admin' && profile.role !== 'admin') return <Redirect href={(APP === 'admin' ? '/(auth)/login?denied=1' : '/') as never} />;
  if (role === 'driver' && !driver) return <Redirect href={(APP === 'mitra' ? '/mitra/onboarding' : '/') as never} />;
  if (role === 'merchant' && !merchant) return <Redirect href={(APP === 'mitra' ? '/mitra/onboarding' : '/') as never} />;
  if (role === 'vendor' && !marketVendor) return <Redirect href={(APP === 'mitra' ? '/mitra/onboarding' : '/') as never} />;
  return <>{children}</>;
}
