import React from 'react';
import { Tabs } from 'expo-router';
import { RequireAuth } from '@/components/AuthGate';
import { makeGlassTabBar } from '@/components/GlassTabBar';
import { colors } from '@/lib/theme';

const TabBar = makeGlassTabBar({
  index: { label: 'Beranda', icon: 'home-outline', iconActive: 'home' },
  orders: { label: 'Pesanan', icon: 'receipt-outline', iconActive: 'receipt' },
  pay: { label: 'AntarPay', icon: 'wallet-outline', iconActive: 'wallet' },
  account: { label: 'Akun', icon: 'person-outline', iconActive: 'person' },
}, colors.primary);

export default function CustomerLayout() {
  return (
    <RequireAuth>
      <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}>
        <Tabs.Screen name="index" options={{ title: 'Beranda' }} />
        <Tabs.Screen name="orders" options={{ title: 'Pesanan' }} />
        <Tabs.Screen name="pay" options={{ title: 'AntarPay' }} />
        <Tabs.Screen name="account" options={{ title: 'Akun' }} />
      </Tabs>
    </RequireAuth>
  );
}
