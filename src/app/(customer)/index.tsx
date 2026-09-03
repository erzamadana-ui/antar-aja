import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/store/auth';
import { useMyOrders } from '@/hooks/useOrder';
import { useCurrentLocation } from '@/hooks/useLocation';
import { supabase } from '@/lib/supabase';
import { SERVICES } from '@/lib/services';
import { colors, font, radius, shadow, spacing } from '@/lib/theme';
import { rupiah, statusLabel } from '@/lib/format';
import type { Merchant, Promo } from '@/lib/types';
import { Row, Stars } from '@/components/ui';

export default function CustomerHome() {
  const router = useRouter();
  const { profile, wallet, session, refreshWallet } = useAuth();
  const { orders: active, reload } = useMyOrders('customer', session?.user.id, true);
  const { location } = useCurrentLocation();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadExtras = async () => {
    const [{ data: m }, { data: p }] = await Promise.all([
      supabase.rpc('nearby_merchants', { p_lat: location.lat, p_lng: location.lng, p_radius_km: 25 }),
      supabase.from('promos').select('*').eq('is_active', true).limit(5),
    ]);
    setMerchants(((m as Merchant[]) ?? []).slice(0, 8));
    setPromos((p as Promo[]) ?? []);
  };
  useEffect(() => { loadExtras(); }, [location.lat, location.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = async () => { setRefreshing(true); await Promise.all([reload(), refreshWallet(), loadExtras()]); setRefreshing(false); };
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }} edges={['top']}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={s.hero}>
          <View style={s.inner}>
            <Row between>
              <View>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{greet},</Text>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{profile?.full_name?.split(' ')[0] ?? 'Kawan'} 👋</Text>
              </View>
              <Pressable onPress={() => router.push('/(customer)/account')} style={s.avatarBtn}>
                <Ionicons name="person" size={20} color={colors.primary} />
              </Pressable>
            </Row>
            <Pressable onPress={() => router.push('/food')} style={s.search}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, flex: 1 }}>Cari makanan, restoran, tempat…</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={[s.inner, { marginTop: -28 }]}>
          {/* Kartu AntarPay */}
          <View style={s.payCard}>
            <Row between>
              <View>
                <Text style={font.tiny}>Saldo AntarPay</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{rupiah(wallet?.balance ?? 0)}</Text>
              </View>
              <Row gap={16}>
                <PayAction icon="add-circle" label="Top Up" onPress={() => router.push('/pay/topup')} />
                <PayAction icon="time" label="Riwayat" onPress={() => router.push('/(customer)/pay')} />
              </Row>
            </Row>
          </View>

          {/* Layanan */}
          <View style={s.grid}>
            {SERVICES.map((sv) => (
              <Pressable key={sv.id} onPress={() => router.push(sv.route as never)} style={({ pressed }) => [s.service, pressed && { opacity: 0.8 }]}>
                <View style={[s.serviceIcon, { backgroundColor: sv.color }]}>
                  <Ionicons name={sv.icon as never} size={26} color="#fff" />
                </View>
                <Text style={s.serviceLabel}>{sv.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Order aktif */}
          {active.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={font.h3}>Pesanan berjalan</Text>
              {active.map((o) => (
                <Pressable key={o.id} onPress={() => router.push(`/order/${o.id}` as never)} style={s.activeCard}>
                  <View style={s.pulse} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{statusLabel(o.status, o.service, o.merchant_status)}</Text>
                    <Text style={font.small} numberOfLines={1}>{o.code} · {o.dropoff_address}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          )}

          {/* Promo */}
          {promos.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <Text style={font.h3}>Promo untukmu</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 12 }}>
                {promos.map((p, i) => (
                  <LinearGradient key={p.code} colors={i % 2 ? ['#F5A524', '#F97316'] : [colors.primary, '#13A29F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.promo}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>{p.code}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12, marginTop: 4 }}>{p.description}</Text>
                  </LinearGradient>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Rekomendasi merchant */}
          <View style={{ marginTop: 12 }}>
            <Row between>
              <Text style={font.h3}>Lagi laris di AntarFood</Text>
              <Pressable onPress={() => router.push('/food')}><Text style={{ color: colors.primary, fontWeight: '700' }}>Lihat semua</Text></Pressable>
            </Row>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 12 }}>
              {merchants.map((m) => (
                <Pressable key={m.id} onPress={() => router.push(`/food/${m.id}` as never)} style={s.merchant}>
                  <Image source={{ uri: m.image_url ?? undefined }} style={s.merchantImg} />
                  <View style={{ padding: 10, gap: 2 }}>
                    <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{m.name}</Text>
                    <Row gap={6}><Stars value={m.rating_avg} size={11} /><Text style={font.tiny}>{Number(m.rating_avg).toFixed(1)} · {m.distance_km} km</Text></Row>
                  </View>
                </Pressable>
              ))}
              {merchants.length === 0 && <Text style={font.small}>Belum ada merchant di sekitar lokasi Anda.</Text>}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PayAction({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 2 }}>
      <Ionicons name={icon} size={26} color={colors.primary} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  hero: { paddingTop: 12, paddingBottom: 44 },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.lg },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: radius.md, paddingHorizontal: 14, height: 46, marginTop: 16 },
  payCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, ...shadow.card },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18, rowGap: 16 },
  service: { width: '25%', alignItems: 'center', gap: 6 },
  serviceIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  serviceLabel: { fontSize: 12, fontWeight: '600', color: colors.text },
  activeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginTop: 10, ...shadow.card, borderLeftWidth: 4, borderLeftColor: colors.accent },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  promo: { width: 240, borderRadius: radius.lg, padding: 16, minHeight: 92, justifyContent: 'center' },
  merchant: { width: 170, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  merchantImg: { width: '100%', height: 100, backgroundColor: colors.border },
});
