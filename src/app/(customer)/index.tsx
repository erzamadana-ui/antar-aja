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
import { rupiah } from '@/lib/format';
import type { Merchant, Promo } from '@/lib/types';
import { Row, Stars, Avatar } from '@/components/ui';
import { AmbientBackground, BrandGradient, Glass } from '@/components/glass';
import { Entrance, PressableScale, AnimatedNumber, Skeleton } from '@/components/motion';
import { ServiceArt } from '@/components/ServiceArt';
import { ActiveOrderBubbles } from '@/components/ActiveOrderBubbles';
import { BrandLogo } from '@/components/Logo';
import { useT } from '@/lib/i18n';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';

export default function CustomerHome() {
  const router = useRouter();
  const { profile, wallet, session, refreshWallet } = useAuth();
  const { orders: active, reload } = useMyOrders('customer', session?.user.id, true);
  const { location } = useCurrentLocation();
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const t = useT();

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
  const greet = hour < 11 ? t('greeting_morning') : hour < 15 ? t('greeting_noon') : hour < 18 ? t('greeting_afternoon') : t('greeting_evening');

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
                <Row gap={10}>
                  <BrandLogo size={40} />
                  <View>
                    <Text style={font.small}>{greet},</Text>
                    <Text style={[font.h1, { fontSize: 22 }]}>{profile?.full_name?.split(' ')[0] ?? 'Kawan'} 👋</Text>
                  </View>
                </Row>
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
                    <Text style={{ color: colors.textMuted, flex: 1, fontSize: 15 }}>{t('search_placeholder')}</Text>
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
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', letterSpacing: 0.6 }}>{t('balance').toUpperCase()}</Text>
                    <AnimatedNumber value={wallet?.balance ?? 0} format={(n) => rupiah(n)} style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 2, letterSpacing: -0.5 }} />
                  </View>
                  <Row gap={8}>
                    <PayAction icon="add" label={t('topup')} onPress={() => router.push('/pay/topup')} />
                    <PayAction icon="time-outline" label={t('history')} onPress={() => router.push('/(customer)/pay')} />
                  </Row>
                </Row>
              </BrandGradient>
            </Entrance>

            {/* Layanan — ilustrasi kartun berbingkai warna layanan */}
            <View style={s.grid}>
              {SERVICES.map((sv, i) => (
                <Entrance key={sv.id} index={3 + i} from="zoom" style={{ width: '33.33%', alignItems: 'stretch' }}>
                  <PressableScale onPress={() => router.push(sv.route as never)} scaleTo={0.9} style={s.serviceTile}>
                    <ServiceArt kind={sv.art} color={sv.color} size={66} />
                    <Text style={s.serviceLabel}>{sv.label.replace('Antar', '')}</Text>
                    <Text style={s.serviceTag} numberOfLines={2}>{t(`tag_${sv.id}` as never)}</Text>
                  </PressableScale>
                </Entrance>
              ))}
            </View>

            {/* Order aktif → bubble */}
            {active.length > 0 && (
              <Entrance index={8}>
                <Row between style={{ marginTop: 22, marginBottom: 8 }}>
                  <Text style={font.label}>{t('active_orders')}</Text>
                  <Text style={font.tiny}>{active.length} · {t('tap_detail')}</Text>
                </Row>
                <ActiveOrderBubbles orders={active} />
              </Entrance>
            )}

            {/* Promo */}
            {promos.length > 0 && (
              <Entrance index={9}>
                <Text style={[font.label, { marginTop: 22, marginBottom: 8 }]}>{t('promo_for_you')}</Text>
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
                <Text style={font.label}>{t('trending_food')}</Text>
                <Pressable onPress={() => router.push('/food')}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{t('see_all')}</Text></Pressable>
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

const s = StyleSheet.create({
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.lg },
  kbd: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(11,31,42,0.06)', alignItems: 'center', justifyContent: 'center' },
  payCard: { marginTop: 14, borderRadius: radius.xl, padding: 18, overflow: 'hidden', ...shadow.glow(colors.primary) },
  payGlow: { position: 'absolute', right: -40, top: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.14)' },
  payAction: { alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, minWidth: 64 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18, rowGap: 12 },
  serviceTile: { alignItems: 'center', gap: 4, width: '100%', paddingHorizontal: 4, paddingVertical: 8 },
  serviceLabel: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 4 },
  serviceTag: { fontSize: 10, color: colors.textMuted, textAlign: 'center', lineHeight: 13, minHeight: 26 },
  promo: { width: 240, borderRadius: radius.lg, padding: 16, minHeight: 96, justifyContent: 'center', overflow: 'hidden' },
  promoOrb: { position: 'absolute', right: -30, bottom: -50, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.16)' },
  merchantImg: { width: '100%', height: 100, backgroundColor: 'rgba(11,31,42,0.06)' },
  glassBorder: { borderColor: glass.border },
});
