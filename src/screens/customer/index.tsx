import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/store/auth';
import { useMyOrders } from '@/hooks/useOrder';
import { useCurrentLocation } from '@/hooks/useLocation';
import { supabase } from '@/lib/supabase';
import { HOME_SERVICES } from '@/lib/services';
import { colors, font, radius, shadow, spacing, glass } from '@/lib/theme';
import { rupiah } from '@/lib/format';
import type { Merchant, Promo, FrequentData } from '@/lib/types';
import { useBooking } from '@/store/booking';
import { serviceDef } from '@/lib/services';
import { HalalBadge } from '@/components/MerchantStatus';
import { PromoCard } from '@/components/PromoCard';
import { Row, Stars, Avatar } from '@/components/ui';
import { AmbientBackground, BrandGradient, Glass } from '@/components/glass';
import { Entrance, PressableScale, AnimatedNumber, Skeleton } from '@/components/motion';
import { ServiceArt, ServiceIllustration } from '@/components/ServiceArt';
import { ActiveOrderBubbles } from '@/components/ActiveOrderBubbles';
import { BrandLogo, Wordmark } from '@/components/Logo';
import { useT } from '@/lib/i18n';
import { useNotifications } from '@/hooks/useNotifications';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';

export default function CustomerHome() {
  const router = useRouter();
  const { profile, wallet, session, refreshWallet } = useAuth();
  const { orders: active, reload } = useMyOrders('customer', session?.user.id, true);
  const { location } = useCurrentLocation();
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [freq, setFreq] = useState<FrequentData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const t = useT();
  const { unread } = useNotifications(session?.user.id);

  const loadExtras = async () => {
    const [{ data: m }, { data: p }, { data: f }] = await Promise.all([
      supabase.rpc('nearby_merchants', { p_lat: location.lat, p_lng: location.lng, p_radius_km: 25 }),
      supabase.from('promos').select('*').eq('is_active', true).order('sort_order').limit(20),
      supabase.rpc('customer_frequent', { p_limit: 6 }),
    ]);
    setMerchants(((m as Merchant[]) ?? []).slice(0, 8));
    setPromos((p as Promo[]) ?? []);
    setFreq((f as FrequentData) ?? null);
  };
  useEffect(() => { loadExtras(); }, [location.lat, location.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const goRoute = (r: FrequentData['routes'][number] | FrequentData['recent'][number]) => {
    const b = useBooking.getState();
    const addr = 'dropoff_address' in r ? r.dropoff_address : r.address;
    const lat = 'dropoff_lat' in r ? r.dropoff_lat : r.lat; const lng = 'dropoff_lng' in r ? r.dropoff_lng : r.lng;
    b.setDropoff({ lat, lng, address: addr, name: addr.split(',')[0] });
    if ('pickup_lat' in r && r.service !== 'shop') b.setPickup({ lat: r.pickup_lat, lng: r.pickup_lng, address: r.pickup_address, name: r.pickup_address.split(',')[0] });
    router.push(serviceDef(r.service).route as never);
  };
  const onRefresh = async () => { setRefreshing(true); await Promise.all([reload(), refreshWallet(), loadExtras()]); setRefreshing(false); };
  const hour = new Date().getHours();
  const greet = hour < 11 ? t('greeting_morning') : hour < 15 ? t('greeting_noon') : hour < 18 ? t('greeting_afternoon') : t('greeting_evening');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AmbientBackground tint="teal" />
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 16 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {/* Band header teal — logo, sapaan, lonceng, saldo ringkas */}
        <View style={s.band}>
          <SafeAreaView edges={['top']}>
            <View style={s.inner}>
              <Entrance index={0}>
                <Row between>
                  <Row gap={10}>
                    <BrandLogo size={40} flat />
                    <View>
                      <Wordmark size={19} dark />
                      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' }}>{greet}, {profile?.full_name?.split(' ')[0] ?? 'Kawan'}</Text>
                    </View>
                  </Row>
                  <Row gap={8}>
                    <PressableScale onPress={() => router.push('/(customer)/pay')} scaleTo={0.94} style={s.balanceChip}>
                      <Ionicons name="wallet-outline" size={14} color="#fff" />
                      <AnimatedNumber value={wallet?.balance ?? 0} format={(n) => rupiah(n)} style={{ color: '#fff', fontSize: 12, fontWeight: '800' }} />
                    </PressableScale>
                    <PressableScale onPress={() => router.push('/inbox' as never)} scaleTo={0.9} style={s.bell}>
                      <Ionicons name={unread > 0 ? 'notifications' : 'notifications-outline'} size={20} color="#fff" />
                      {unread > 0 && <View style={s.bellBadge}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{unread > 9 ? '9+' : unread}</Text></View>}
                    </PressableScale>
                  </Row>
                </Row>
              </Entrance>
              <Entrance index={1}><Text style={s.bandTitle}>{t('home_question')}</Text></Entrance>
            </View>
          </SafeAreaView>
        </View>

        <View style={[s.inner, { marginTop: -40 }]}>
          {/* Kartu pencarian + tempat tersimpan (menumpuk di atas band) */}
          <Entrance index={2}>
            <View style={s.searchCard}>
              <PressableScale onPress={() => router.push('/food')} scaleTo={0.985}>
                <Row gap={10} style={s.searchRow}>
                  <Ionicons name="search" size={18} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, flex: 1, fontSize: 15 }} numberOfLines={1}>{t('search_placeholder')}</Text>
                </Row>
              </PressableScale>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
                {(freq?.recent ?? []).slice(0, 4).map((r, i) => (
                  <PressableScale key={i} onPress={() => goRoute(r)} scaleTo={0.95} style={[s.placeChip, i === 0 && s.placeChipOn]}>
                    <Ionicons name="location" size={13} color={i === 0 ? colors.mint : colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: i === 0 ? '#fff' : colors.text }} numberOfLines={1}>{r.address.split(',')[0]}</Text>
                  </PressableScale>
                ))}
                <PressableScale onPress={() => router.push('/account/places')} scaleTo={0.95} style={s.placeChip}>
                  <Ionicons name="bookmark-outline" size={13} color={colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{t('saved_places')}</Text>
                </PressableScale>
              </ScrollView>
            </View>
          </Entrance>

          {/* Layanan — 8 tile, ikon dalam kotak tint padat */}
          <View style={s.grid}>
            {HOME_SERVICES.map((sv, i) => (
              <Entrance key={sv.id} index={3 + i} from="zoom" style={{ width: '25%', alignItems: 'stretch' }}>
                <PressableScale onPress={() => router.push(sv.route as never)} scaleTo={0.9} style={s.serviceTile}>
                  <View style={[s.serviceIcon, { backgroundColor: sv.color + '14' }]}><ServiceIllustration kind={sv.art} size={44} /></View>
                  <Text style={s.serviceLabel} numberOfLines={1}>{sv.label.replace('Antar', '')}</Text>
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

            {/* Promo — thumbnail bergambar */}
            {promos.length > 0 && (
              <Entrance index={9}>
                <Row between style={{ marginTop: 22, marginBottom: 8 }}>
                  <Text style={font.label}>{t('promo_for_you')}</Text>
                  <Text style={font.tiny}>{promos.length} promo</Text>
                </Row>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingRight: 16 }}>
                  {promos.map((p, i) => <PromoCard key={p.code} promo={p} index={i} width={224} onPress={() => router.push((p.service ? serviceDef(p.service).route : '/food') as never)} />)}
                </ScrollView>
              </Entrance>
            )}

            {/* Sering dipesan — pesan ulang sekali ketuk */}
            {freq && (freq.merchants.length > 0 || freq.routes.length > 0) && (
              <Entrance index={10}>
                <Row between style={{ marginTop: 18, marginBottom: 8 }}>
                  <Text style={font.label}>{t('frequent')}</Text>
                  <Pressable onPress={() => router.push('/(customer)/orders')}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{t('history')}</Text></Pressable>
                </Row>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4, paddingRight: 16 }}>
                  {freq.merchants.map((m) => (
                    <PressableScale key={m.merchant_id} onPress={() => router.push(`/food/${m.merchant_id}` as never)} scaleTo={0.96} style={s.freq}>
                      <Image source={{ uri: m.image_url ?? undefined }} style={s.freqImg} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontWeight: '800', color: colors.text, fontSize: 13 }} numberOfLines={1}>{m.name}</Text>
                        <Row gap={4}><HalalBadge merchant={m} /><Text style={font.tiny}>{m.count}× dipesan</Text></Row>
                      </View>
                      <View style={[s.reorder, { backgroundColor: colors.food }]}><Ionicons name="refresh" size={14} color="#fff" /></View>
                    </PressableScale>
                  ))}
                  {freq.routes.map((r, i) => {
                    const def = serviceDef(r.service);
                    return (
                      <PressableScale key={`${r.service}-${i}`} onPress={() => goRoute(r)} scaleTo={0.96} style={s.freq}>
                        <View style={[s.freqImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: def.color + '14' }]}><ServiceIllustration kind={def.art} size={36} /></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontWeight: '800', color: colors.text, fontSize: 13 }} numberOfLines={1}>{r.service === 'shop' && r.shop_store ? `${r.shop_store} → ` : ''}{r.dropoff_address.split(',')[0]}</Text>
                          <Text style={font.tiny} numberOfLines={1}>{def.label} · {r.count}× · {r.dropoff_address.split(',').slice(1, 3).join(',').trim() || 'ketuk untuk pesan lagi'}</Text>
                        </View>
                        <View style={[s.reorder, { backgroundColor: def.color }]}><Ionicons name="arrow-forward" size={14} color="#fff" /></View>
                      </PressableScale>
                    );
                  })}
                </ScrollView>
                {freq.recent.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8, paddingRight: 16 }}>
                    <Row gap={4} style={{ paddingRight: 2 }}><Ionicons name="time-outline" size={14} color={colors.textMuted} /><Text style={font.tiny}>{t('recent_dest')}:</Text></Row>
                    {freq.recent.map((r, i) => (
                      <PressableScale key={i} onPress={() => goRoute(r)} scaleTo={0.95} style={s.recent}><Ionicons name="location" size={12} color={colors.primary} /><Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }} numberOfLines={1}>{r.address.split(',')[0]}</Text></PressableScale>
                    ))}
                  </ScrollView>
                )}
              </Entrance>
            )}

            {/* Merchant */}
            <Entrance index={11}>
              <Row between style={{ marginTop: 18 }}>
                <Text style={font.label}>{t('trending_food')}</Text>
                <Pressable onPress={() => router.push('/food')}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{t('see_all')}</Text></Pressable>
              </Row>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 12, paddingRight: 16 }}>
                {merchants === null ? [0, 1, 2].map((i) => <Skeleton key={i} width={150} height={150} radius={radius.lg} />) : merchants.map((m) => (
                  <PressableScale key={m.id} onPress={() => router.push(`/food/${m.id}` as never)} scaleTo={0.97}>
                    <Glass variant="strong" radius={radius.lg} style={{ width: 150 }}>
                      <Image source={{ uri: m.image_url ?? undefined }} style={s.merchantImg} />
                      <View style={{ padding: 10, gap: 2 }}>
                        <Row between><Text style={{ fontWeight: '700', color: colors.text, flex: 1 }} numberOfLines={1}>{m.name}</Text><HalalBadge merchant={m} /></Row>
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
    </View>
  );
}

const s = StyleSheet.create({
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.lg },
  band: { backgroundColor: colors.primary, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, paddingTop: 8, paddingBottom: 60, ...shadow.glow(colors.primary) },
  bandTitle: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.4, lineHeight: 30, marginTop: 18 },
  balanceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  bell: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  searchCard: { backgroundColor: '#fff', borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  searchRow: { height: 48, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
  placeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, maxWidth: 170 },
  placeChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  serviceIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20, rowGap: 16 },
  serviceTile: { alignItems: 'center', gap: 8, width: '100%', paddingHorizontal: 2 },
  serviceLabel: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  freq: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 236, padding: 8, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: glass.border },
  freqImg: { width: 52, height: 52, borderRadius: 12, backgroundColor: 'rgba(11,31,42,0.06)' },
  reorder: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: glass.border, maxWidth: 180 },
  merchantImg: { width: '100%', height: 86, backgroundColor: 'rgba(11,31,42,0.06)' },
  glassBorder: { borderColor: glass.border },
});
