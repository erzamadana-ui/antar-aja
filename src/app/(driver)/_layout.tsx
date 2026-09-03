import React from 'react';
import { Tabs } from 'expo-router';
import { RequireAuth } from '@/components/AuthGate';
import { makeGlassTabBar } from '@/components/GlassTabBar';
import { colors } from '@/lib/theme';

const TabBar = makeGlassTabBar({
  index: { label: 'Beranda', icon: 'navigate-outline', iconActive: 'navigate' },
  history: { label: 'Riwayat', icon: 'receipt-outline', iconActive: 'receipt' },
  earnings: { label: 'Pendapatan', icon: 'wallet-outline', iconActive: 'wallet' },
  account: { label: 'Akun', icon: 'person-outline', iconActive: 'person' },
}, colors.ride);

export default function DriverLayout() {
  return (
    <RequireAuth role="driver">
      <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}>
        <Tabs.Screen name="index" options={{ title: 'Beranda' }} />
        <Tabs.Screen name="history" options={{ title: 'Riwayat' }} />
        <Tabs.Screen name="earnings" options={{ title: 'Pendapatan' }} />
        <Tabs.Screen name="account" options={{ title: 'Akun' }} />
      </Tabs>
    </RequireAuth>
  );
}
