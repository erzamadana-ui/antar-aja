import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/store/auth';
import { Loading } from '@/components/ui';

/** Membungkus layout yang butuh login. */
export function RequireAuth({ children, role }: { children: React.ReactNode; role?: 'admin' | 'driver' | 'merchant' }) {
  const { session, profile, driver, merchant, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (!profile) return <Loading text="Memuat profil…" />;
  if (role === 'admin' && profile.role !== 'admin') return <Redirect href="/(customer)" />;
  if (role === 'driver' && !driver) return <Redirect href="/account/become-driver" />;
  if (role === 'merchant' && !merchant) return <Redirect href="/account/become-merchant" />;
  return <>{children}</>;
}
