import React from 'react';
import { Tabs } from 'expo-router';
import { RequireAuth } from '@/components/AuthGate';
import { makeGlassTabBar } from '@/components/GlassTabBar';
import { colors } from '@/lib/theme';

const TabBar = makeGlassTabBar({
  index: { label: 'Pesanan', tk: 'orders', icon: 'receipt-outline', iconActive: 'receipt' },
  menu: { label: 'Menu', tk: 'menu', icon: 'restaurant-outline', iconActive: 'restaurant' },
  store: { label: 'Toko', tk: 'store', icon: 'storefront-outline', iconActive: 'storefront' },
}, colors.food);

export default function MerchantLayout() {
  return (
    <RequireAuth role="merchant">
      <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}>
        <Tabs.Screen name="index" options={{ title: 'Pesanan' }} />
        <Tabs.Screen name="menu" options={{ title: 'Menu' }} />
        <Tabs.Screen name="store" options={{ title: 'Toko' }} />
      </Tabs>
    </RequireAuth>
  );
}
