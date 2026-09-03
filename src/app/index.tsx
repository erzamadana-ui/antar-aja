import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/store/auth';
import { useMode, modeHome } from '@/store/mode';
import { Loading } from '@/components/ui';

export default function Index() {
  const { session, profile, driver, merchant, ready } = useAuth();
  const mode = useMode((s) => s.mode);
  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (!profile) return <Loading text="Memuat profil…" />;

  // Tentukan mode yang diizinkan
  let target = mode;
  if (target === 'admin' && profile.role !== 'admin') target = 'customer';
  if (target === 'driver' && !driver) target = 'customer';
  if (target === 'merchant' && !merchant) target = 'customer';
  if (mode === 'customer' && profile.role === 'admin') target = 'admin';
  return <Redirect href={modeHome[target] as never} />;
}
