import React from 'react';
import { RequireAuth } from '@/components/AuthGate';
import { Tabs, tabIcon, tabScreenOptions } from '@/components/TabBarIcon';
import { colors } from '@/lib/theme';

export default function MerchantLayout() {
  return (
    <RequireAuth role="merchant">
      <Tabs screenOptions={{ ...tabScreenOptions, tabBarActiveTintColor: colors.food }}>
        <Tabs.Screen name="index" options={{ title: 'Pesanan', tabBarIcon: tabIcon('receipt', 'receipt-outline') }} />
        <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: tabIcon('restaurant', 'restaurant-outline') }} />
        <Tabs.Screen name="store" options={{ title: 'Toko', tabBarIcon: tabIcon('storefront', 'storefront-outline') }} />
      </Tabs>
    </RequireAuth>
  );
}
