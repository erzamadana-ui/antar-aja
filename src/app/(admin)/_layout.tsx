import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RequireAuth } from '@/components/AuthGate';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { colors, font } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/(admin)', label: 'Dashboard', icon: 'grid-outline' },
  { href: '/(admin)/orders', label: 'Pesanan', icon: 'receipt-outline' },
  { href: '/(admin)/drivers', label: 'Driver', icon: 'bicycle-outline' },
  { href: '/(admin)/merchants', label: 'Merchant', icon: 'storefront-outline' },
  { href: '/(admin)/users', label: 'Pengguna', icon: 'people-outline' },
  { href: '/(admin)/finance', label: 'Keuangan', icon: 'cash-outline' },
  { href: '/(admin)/pricing', label: 'Tarif & Promo', icon: 'pricetags-outline' },
  { href: '/(admin)/settings', label: 'Pengaturan', icon: 'settings-outline' },
];

export default function AdminLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const setMode = useMode((s) => s.setMode);
  const isActive = (href: string) => { const p = href.replace('/(admin)', '') || '/'; return pathname === p || (p !== '/' && pathname.startsWith(p)); };

  const items = NAV.map((n) => {
    const active = isActive(n.href);
    return (
      <Pressable key={n.href} onPress={() => router.replace(n.href as never)} style={[wide ? s.side : s.chip, active && (wide ? s.sideActive : s.chipActive)]}>
        <Ionicons name={n.icon} size={18} color={active ? (wide ? '#fff' : colors.primary) : wide ? 'rgba(255,255,255,0.7)' : colors.textSecondary} />
        <Text style={{ color: active ? (wide ? '#fff' : colors.primary) : wide ? 'rgba(255,255,255,0.75)' : colors.textSecondary, fontWeight: '600', fontSize: 14 }}>{n.label}</Text>
      </Pressable>
    );
  });

  return (
    <RequireAuth role="admin">
      <SafeAreaView style={{ flex: 1, backgroundColor: wide ? colors.primaryDark : colors.surface }} edges={['top']}>
        <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: colors.bg }}>
          {wide ? (
            <View style={s.sidebar}>
              <View style={{ paddingHorizontal: 16, paddingVertical: 20 }}>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>Antar Aja</Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Panel Admin</Text>
              </View>
              {items}
              <View style={{ flex: 1 }} />
              <View style={{ padding: 16, gap: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{profile?.full_name}</Text>
                <Pressable onPress={async () => { await setMode('customer'); router.replace('/(customer)'); }}><Text style={{ color: 'rgba(255,255,255,0.7)' }}>↔ Mode pelanggan</Text></Pressable>
                <Pressable onPress={async () => { await signOut(); router.replace('/(auth)/welcome'); }}><Text style={{ color: '#FCA5A5' }}>Keluar</Text></Pressable>
              </View>
            </View>
          ) : (
            <View style={s.topbar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6 }}>
                <Text style={[font.h3, { flex: 1 }]}>Panel Admin</Text>
                <Pressable onPress={async () => { await setMode('customer'); router.replace('/(customer)'); }}><Ionicons name="swap-horizontal" size={22} color={colors.primary} /></Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, padding: 10 }}>{items}</ScrollView>
            </View>
          )}
          <View style={{ flex: 1 }}><Slot /></View>
        </View>
      </SafeAreaView>
    </RequireAuth>
  );
}

const s = StyleSheet.create({
  sidebar: { width: 230, backgroundColor: colors.primaryDark },
  side: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
  sideActive: { backgroundColor: 'rgba(255,255,255,0.14)', borderLeftWidth: 3, borderLeftColor: colors.accent },
  topbar: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.bg },
  chipActive: { backgroundColor: colors.primaryLight },
});
