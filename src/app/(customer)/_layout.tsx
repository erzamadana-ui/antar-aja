import React from 'react';
import { RequireAuth } from '@/components/AuthGate';
import { Tabs, tabIcon, tabScreenOptions } from '@/components/TabBarIcon';

export default function CustomerLayout() {
  return (
    <RequireAuth>
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="index" options={{ title: 'Beranda', tabBarIcon: tabIcon('home', 'home-outline') }} />
        <Tabs.Screen name="orders" options={{ title: 'Pesanan', tabBarIcon: tabIcon('receipt', 'receipt-outline') }} />
        <Tabs.Screen name="pay" options={{ title: 'AntarPay', tabBarIcon: tabIcon('wallet', 'wallet-outline') }} />
        <Tabs.Screen name="account" options={{ title: 'Akun', tabBarIcon: tabIcon('person', 'person-outline') }} />
      </Tabs>
    </RequireAuth>
  );
}
