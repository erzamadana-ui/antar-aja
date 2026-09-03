import React from 'react';
import { RequireAuth } from '@/components/AuthGate';
import { Tabs, tabIcon, tabScreenOptions } from '@/components/TabBarIcon';
import { colors } from '@/lib/theme';

export default function DriverLayout() {
  return (
    <RequireAuth role="driver">
      <Tabs screenOptions={{ ...tabScreenOptions, tabBarActiveTintColor: colors.ride }}>
        <Tabs.Screen name="index" options={{ title: 'Beranda', tabBarIcon: tabIcon('navigate', 'navigate-outline') }} />
        <Tabs.Screen name="history" options={{ title: 'Riwayat', tabBarIcon: tabIcon('receipt', 'receipt-outline') }} />
        <Tabs.Screen name="earnings" options={{ title: 'Pendapatan', tabBarIcon: tabIcon('wallet', 'wallet-outline') }} />
        <Tabs.Screen name="account" options={{ title: 'Akun', tabBarIcon: tabIcon('person', 'person-outline') }} />
      </Tabs>
    </RequireAuth>
  );
}
