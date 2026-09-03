import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/store/auth';
import { useMyOrders } from '@/hooks/useOrder';
import { useCurrentLocation } from '@/hooks/useLocation';
import { supabase } from '@/lib/supabase';
import { SERVICES } from '@/lib/services';
import { colors, font, radius, shadow, spacing, glass } from '@/lib/theme';
import { rupiah, statusLabel } from '@/lib/format';
import type { Merchant, Promo } from '@/lib/types';
import { Row, Stars, Avatar } from '@/components/ui';
import { AmbientBackground, BrandGradient, Glass } from '@/components/glass';
import { Entrance, PressableScale, AnimatedNumber, LiveDot, Skeleton, ProgressBar } from '@/components/motion';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';

const STATUS_PROGRESS: Record<string, number> = { searching: 0.15, accepted: 0.4, arrived: 0.6, in_progress: 0.85, completed: 1 };

export default function CustomerHome() {
  const router = useRouter();
  const { profile, wallet, session, refreshWallet } = useAuth();
  const { orders: active, reload } = useMyOrders('customer', session?.user.id, true);
  const { location } = useCurrentLocation();
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
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
    <View style={{ flex: 1 }}>
      <AmbientBackground tint="mixed" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 16 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
          <View style={s.inner}>
            {/* Sapaan */}
            <Entrance index={0}>
              <Row between style={{ marginTop: 8 }}>
                <View>
                  <Text style={font.small}>{greet},</Text>
                  <Text style={font.h1}>{profile?.full_name?.split(' ')[0] ?? 'Kawan'} 👋</Text>
                </View>
                <PressableScale onPress={() => router.push('/(customer)/account')} scaleTo={0.9}>
                  <Avatar name={profile?.full_name} url={profile?.avatar_url} size={44} />
                </PressableScale>
              </Row>
            </Entrance>

            {/* Pencarian */}
            <Entrance index={1}>
              <PressableScale onPress={() => router.push('/food')} scaleTo={0.985} style={{ marginTop: 16 }}>
                <Glass variant="strong" radius={radius.lg}>
                  <Row gap={10} style={{ paddingHorizontal: 14, height: 50 }}>
                    <Ionicons name="search" size={18} color={colors.primary} />
                    <Text style={{ color: colors.textMuted, flex: 1, fontSize: 15 }}>Cari makanan, restoran, tempat…</Text>
                    <View style={s.kbd}><Ionicons name="mic-outline" size={16} color={colors.textSecondary} /></View>
                  </Row>
                </Glass>
              </PressableScale>
            </Entrance>

            {/* Kartu AntarPay */}
            <Entrance index={2}>
              <BrandGradient colors={[colors.primary, '#13A29F', '#0E7C7B']} style={s.payCard}>
                <View style={s.payGlow} />
                <Row between>
                  <View>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', letterSpacing: 0.6 }}>SALDO ANTARPAY</Text>
                    <AnimatedNumber value={wallet?.balance ?? 0} format={(n) => rupiah(n)} style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 2, letterSpacing: -0.5 }} />
                  </View>
                  <Row gap={8}>
                    <PayAction icon="add" label="Top Up" onPress={() => router.push('/pay/topup')} />
                    <PayAction icon="time-outline" label="Riwayat" onPress={() => router.push('/(customer)/pay')} />
                  </Row>
                </Row>
              </BrandGradient>
            </Entrance>

            {/* Layanan */}
            <View style={s.grid}>
              {SERVICES.map((sv, i) => (
                <Entrance key={sv.id} index={3 + i} from="zoom" style={{ width: '20%', alignItems: 'center' }}>
                  <PressableScale onPress={() => router.push(sv.route as never)} scaleTo={0.9} style={{ alignItems: 'center', gap: 6 }}>
                    <BrandGradient colors={[sv.color, lighten(sv.color)]} style={[s.serviceIcon, shadow.glow(sv.color)]}>
                      <Ionicons name={sv.icon as never} size={26} color="#fff" />
                    </BrandGradient>
                    <Text style={s.serviceLabel}>{sv.label.replace('Antar', '')}</Text>
                  </PressableScale>
                </Entrance>
              ))}
            </View>

            {/* Order aktif */}
            {active.length > 0 && (
              <Entrance index={8}>
                <Text style={[font.label, { marginTop: 22, marginBottom: 8 }]}>Pesanan berjalan</Text>
                {active.map((o) => (
                  <PressableScale key={o.id} onPress={() => router.push(`/order/${o.id}` as never)} scaleTo={0.985} style={{ marginBottom: 10 }}>
                    <Glass variant="strong" radius={radius.lg}>
                      <View style={{ padding: 14, gap: 10 }}>
                        <Row gap={10}>
                          <LiveDot color={o.status === 'searching' ? colors.accent : colors.success} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '700', color: colors.text }}>{statusLabel(o.status, o.service, o.merchant_status)}</Text>
                            <Text style={font.tiny} numberOfLines={1}>{o.code} · {o.dropoff_address}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                        </Row>
                        <ProgressBar progress={STATUS_PROGRESS[o.status] ?? 0.1} color={o.status === 'searching' ? colors.accent : colors.primary} />
                      </View>
                    </Glass>
                  </PressableScale>
                ))}
              </Entrance>
            )}

            {/* Promo */}
            {promos.length > 0 && (
              <Entrance index={9}>
                <Text style={[font.label, { marginTop: 22, marginBottom: 8 }]}>Promo untukmu</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingRight: 16 }}>
                  {promos.map((p, i) => (
                    <PressableScale key={p.code} scaleTo={0.97} onPress={() => router.push(p.service === 'food' ? '/food' : '/ride' as never)}>
                      <BrandGradient colors={i % 2 ? ['#F5A524', '#F97316'] : [colors.primary, '#13A29F']} style={s.promo}>
                        <View style={s.promoOrb} />
                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 19, letterSpacing: -0.3 }}>{p.code}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12, marginTop: 4 }}>{p.description}</Text>
                      </BrandGradient>
                    </PressableScale>
                  ))}
                </ScrollView>
              </Entrance>
            )}

            {/* Merchant */}
            <Entrance index={10}>
              <Row between style={{ marginTop: 18 }}>
                <Text style={font.label}>Lagi laris di AntarFood</Text>
                <Pressable onPress={() => router.push('/food')}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Lihat semua</Text></Pressable>
              </Row>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 12, paddingRight: 16 }}>
                {merchants === null ? [0, 1, 2].map((i) => <Skeleton key={i} width={170} height={168} radius={radius.lg} />) : merchants.map((m) => (
                  <PressableScale key={m.id} onPress={() => router.push(`/food/${m.id}` as never)} scaleTo={0.97}>
                    <Glass variant="strong" radius={radius.lg} style={{ width: 170 }}>
                      <Image source={{ uri: m.image_url ?? undefined }} style={s.merchantImg} />
                      <View style={{ padding: 10, gap: 2 }}>
                        <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{m.name}</Text>
                        <Row gap={6}><Stars value={m.rating_avg} size={11} /><Text style={font.tiny}>{Number(m.rating_avg).toFixed(1)} · {m.distance_km} km</Text></Row>
                      </View>
                    </Glass>
                  </PressableScale>
                ))}
                {merchants && merchants.length === 0 && <Text style={font.small}>Belum ada merchant di sekitar lokasi Anda.</Text>}
              </ScrollView>
            </Entrance>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function PayAction({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.9} style={s.payAction}>
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{label}</Text>
    </PressableScale>
  );
}
function lighten(hex: string) { const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * 0.25)); return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`; }

const s = StyleSheet.create({
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.lg },
  kbd: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(11,31,42,0.06)', alignItems: 'center', justifyContent: 'center' },
  payCard: { marginTop: 14, borderRadius: radius.xl, padding: 18, overflow: 'hidden', ...shadow.glow(colors.primary) },
  payGlow: { position: 'absolute', right: -40, top: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.14)' },
  payAction: { alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, minWidth: 64 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20, rowGap: 16 },
  serviceIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  serviceLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  promo: { width: 240, borderRadius: radius.lg, padding: 16, minHeight: 96, justifyContent: 'center', overflow: 'hidden' },
  promoOrb: { position: 'absolute', right: -30, bottom: -50, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.16)' },
  merchantImg: { width: '100%', height: 100, backgroundColor: 'rgba(11,31,42,0.06)' },
  glassBorder: { borderColor: glass.border },
});
