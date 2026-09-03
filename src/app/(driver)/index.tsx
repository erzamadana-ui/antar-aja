import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { MapView } from '@/components/map';
import type { MapMarker } from '@/components/map';
import { Row, Badge, Button, Empty, toast, Avatar } from '@/components/ui';
import { MapScreen, FloatingButton } from '@/components/MapScreen';
import { Entrance, LiveDot, PressableScale, Radar, AnimatedNumber } from '@/components/motion';
import { AmbientBackground, BrandGradient } from '@/components/glass';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { useDriverSession } from '@/hooks/useDriver';
import { useCurrentLocation } from '@/hooks/useLocation';
import { useAuth } from '@/store/auth';
import { colors, font, radius, shadow, glass, motion } from '@/lib/theme';
import { rupiah, km, timeAgo, serviceLabel, statusLabel } from '@/lib/format';
import { serviceDef } from '@/lib/services';
import type { AvailableOrder } from '@/lib/types';

export default function DriverHome() {
  const router = useRouter();
  const { profile } = useAuth();
  const { driver, online, busy, setOnline, available, active, accept, myPos, setMyPos } = useDriverSession();
  const { location, refresh } = useCurrentLocation();
  const [selected, setSelected] = useState<AvailableOrder | null>(null);
  const pos = myPos ?? (driver?.lat && driver.lng ? { lat: driver.lat, lng: driver.lng } : location);

  const toggle = async (v: boolean) => {
    try {
      let p: { lat: number; lng: number } | undefined;
      if (v) { const fix = await refresh(); if (!fix) { toast.error('Lokasi tidak tersedia. Izinkan akses GPS lalu coba lagi.'); return; } p = fix; setMyPos({ ...fix, heading: null }); }
      await setOnline(v, p);
      toast.show(v ? 'Anda online — siap menerima order' : 'Anda offline');
    } catch (e) { toast.error((e as Error).message); }
  };

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [{ id: 'me', lat: pos.lat, lng: pos.lng, kind: driver?.vehicle_type === 'car' ? 'car' : 'motor', heading: myPos?.heading ?? driver?.heading }];
    (selected ? [selected] : available).forEach((o) => m.push({ id: `p-${o.id}`, lat: o.pickup_lat, lng: o.pickup_lng, kind: o.service === 'food' ? 'merchant' : 'pickup', label: selected ? 'Jemput' : undefined }));
    if (selected) m.push({ id: 'd', lat: selected.dropoff_lat, lng: selected.dropoff_lng, kind: 'dropoff', label: 'Tujuan' });
    return m;
  }, [pos.lat, pos.lng, driver, available, selected, myPos?.heading]);
  const fitTo = useMemo(() => selected ? [pos, { lat: selected.pickup_lat, lng: selected.pickup_lng }, { lat: selected.dropoff_lat, lng: selected.dropoff_lng }] : [pos], [pos.lat, pos.lng, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const doAccept = async (o: AvailableOrder) => {
    try { const ord = await accept(o.id); setSelected(null); toast.success('Order diterima!'); router.push(`/driver/order/${ord.id}` as never); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (driver && driver.status !== 'approved') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AmbientBackground tint="amber" />
        <SafeAreaView style={{ flex: 1 }}>
          <Empty icon="hourglass-outline" title={driver.status === 'pending' ? 'Menunggu verifikasi admin' : driver.status === 'suspended' ? 'Akun mitra ditangguhkan' : 'Pendaftaran ditolak'}
            subtitle={driver.status === 'pending' ? 'Data Anda sedang diperiksa. Biasanya kurang dari 1×24 jam.' : 'Hubungi CS Antar Aja untuk informasi lebih lanjut.'}
            action={<Button title="Kembali ke mode pelanggan" variant="secondary" onPress={() => router.replace('/(customer)')} />} />
        </SafeAreaView>
      </View>
    );
  }

  // Kartu profil + saklar online (kiri atas peta, kaca)
  const topLeft = (
    <View style={[s.profileCard, shadow.card]}>
      {Platform.OS !== 'android' && <BlurView intensity={glass.blur} tint="light" style={StyleSheet.absoluteFill} />}
      <Avatar name={profile?.full_name} url={profile?.avatar_url} size={36} />
      <View style={{ minWidth: 0, maxWidth: 150 }}>
        <Text style={{ fontWeight: '800', color: colors.text, fontSize: 13 }} numberOfLines={1}>{profile?.full_name}</Text>
        <Row gap={4}>
          <LiveDot color={online ? colors.success : colors.textMuted} size={6} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: online ? colors.success : colors.textMuted }}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
        </Row>
      </View>
      <Switch value={online} onValueChange={toggle} disabled={busy} trackColor={{ true: colors.success, false: 'rgba(11,31,42,0.2)' }} thumbColor="#fff" style={Platform.OS === 'ios' ? { transform: [{ scale: 0.8 }] } : undefined} />
    </View>
  );

  const header = (
    <Row between>
      <View>
        <Text style={font.label}>{online ? (selected ? 'Detail order' : `${available.length} order tersedia`) : 'Anda offline'}</Text>
        <Text style={font.tiny}>{driver?.vehicle_plate} · ⭐ {Number(driver?.rating_avg ?? 5).toFixed(1)} · {driver?.total_trips} trip</Text>
      </View>
      {online && !selected && available.length > 0 && <Badge text="Baru" color={colors.success} />}
    </Row>
  );

  return (
    <MapScreen
      map={<MapView center={pos} zoom={14} markers={markers} fitTo={fitTo} paddingBottom={20} />}
      back={false}
      topLeft={topLeft}
      floatingRight={<FloatingButton icon="locate" color={colors.info} onPress={async () => { const fix = await refresh(); if (fix) setMyPos({ ...fix, heading: null }); }} />}
      header={header}
      minHeight={170 + TAB_BAR_SPACE}
      maxRatio={0.58}
      bottomSpace={TAB_BAR_SPACE - 24}
      initiallyExpanded={!!selected || !!active}
    >
      <Animated.View layout={LinearTransition.springify().damping(18)} style={{ gap: 12 }}>
        {active && (
          <Entrance index={0}>
            <PressableScale onPress={() => router.push(`/driver/order/${active.id}` as never)} scaleTo={0.97} style={[{ borderRadius: radius.lg, overflow: 'hidden' }, shadow.glow(colors.ride)]}>
              <BrandGradient colors={[colors.ride, '#0F766E']} angle="horizontal" style={s.activeCard}>
                <Ionicons name={serviceDef(active.service).icon as never} size={26} color="#fff" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }} numberOfLines={1}>Order aktif · {serviceLabel[active.service]}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }} numberOfLines={1}>{statusLabel(active.status, active.service)} · {active.code}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </BrandGradient>
            </PressableScale>
          </Entrance>
        )}
        {!online ? (
          <Animated.View entering={FadeIn.duration(motion.base)} exiting={FadeOut.duration(motion.fast)}>
            <Empty icon="power-outline" title="Anda sedang offline" subtitle="Aktifkan saklar online di kiri atas untuk melihat order di sekitar Anda." />
          </Animated.View>
        ) : selected ? (
          <Animated.View key={selected.id} entering={ZoomIn.duration(motion.base)} exiting={FadeOut.duration(motion.fast)} style={[s.offer, shadow.glow(colors.success)]}>
            <Row between>
              <Badge text={serviceLabel[selected.service]} color={serviceDef(selected.service).color} />
              <PressableScale onPress={() => setSelected(null)} scaleTo={0.9} style={s.closeBtn}><Ionicons name="close" size={20} color={colors.textSecondary} /></PressableScale>
            </Row>
            <AnimatedNumber value={selected.driver_earning} format={rupiah} style={{ fontSize: 30, fontWeight: '900', color: colors.success, marginTop: 6, letterSpacing: -0.5 }} duration={500} />
            <Text style={font.tiny}>Pendapatan bersih · {selected.payment_method === 'cash' ? `Tunai, tagih ${rupiah(selected.total)}` : 'Dibayar AntarPay'}</Text>
            <View style={{ marginTop: 12, gap: 8 }}>
              <Row gap={8}><View style={[s.dotIcon, { backgroundColor: colors.primary + '1A' }]}><Ionicons name="navigate" size={14} color={colors.primary} /></View><Text style={[font.small, { flex: 1 }]}>{km(selected.distance_to_pickup_km)} ke titik jemput · {selected.merchant_name ?? selected.pickup_address}</Text></Row>
              <Row gap={8}><View style={[s.dotIcon, { backgroundColor: colors.danger + '1A' }]}><Ionicons name="flag" size={14} color={colors.danger} /></View><Text style={[font.small, { flex: 1 }]}>{km(selected.distance_km)} perjalanan · {selected.dropoff_address}</Text></Row>
              {selected.service === 'shop' && <Row gap={8}><View style={[s.dotIcon, { backgroundColor: colors.shop + '1A' }]}><Ionicons name="basket" size={14} color={colors.shop} /></View><Text style={[font.small, { flex: 1 }]}>Belanjakan ±{rupiah(selected.items_subtotal)}{selected.payment_method === 'cash' ? ' (talangi tunai, tagih ke pelanggan)' : ' (diganti ke saldo Anda saat selesai)'}</Text></Row>}
              {selected.service === 'food' && <Row gap={8}><View style={[s.dotIcon, { backgroundColor: colors.food + '1A' }]}><Ionicons name="restaurant" size={14} color={colors.food} /></View><Text style={[font.small, { flex: 1 }]}>Beli makanan {rupiah(selected.items_subtotal)}{selected.payment_method === 'cash' ? ' (talangi tunai)' : ' (dibayar AntarPay)'}</Text></Row>}
            </View>
            <Button title="Terima Order" size="lg" color={colors.success} style={{ marginTop: 14 }} onPress={() => doAccept(selected)} />
          </Animated.View>
        ) : available.length === 0 ? (
          <Animated.View entering={FadeIn.duration(motion.slow)} exiting={FadeOut.duration(motion.fast)} style={s.radarBox}>
            <Radar color={colors.ride} size={130}><Ionicons name="bicycle" size={24} color={colors.ride} /></Radar>
            <Text style={[font.h3, { marginTop: 4 }]}>Mencari order di sekitar…</Text>
            <Text style={[font.small, { textAlign: 'center' }]}>Order baru dalam radius 5 km akan muncul otomatis di sini.</Text>
          </Animated.View>
        ) : (
          available.map((o, i) => (
            <Animated.View key={o.id} entering={FadeInDown.delay(i * motion.stagger).duration(motion.base)} exiting={FadeOut.duration(motion.fast)} layout={LinearTransition.springify()}>
              <PressableScale onPress={() => setSelected(o)} scaleTo={0.98} style={s.orderRow}>
                <BrandGradient colors={[serviceDef(o.service).color, serviceDef(o.service).color + 'BB']} style={s.svcIcon}><Ionicons name={serviceDef(o.service).icon as never} size={20} color="#fff" /></BrandGradient>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Row between><Text style={{ fontWeight: '700', color: colors.text }}>{serviceLabel[o.service]}</Text><Text style={{ fontWeight: '900', color: colors.success }}>{rupiah(o.driver_earning)}</Text></Row>
                  <Text style={font.small} numberOfLines={1}>{o.merchant_name ?? o.pickup_address}</Text>
                  <Text style={font.tiny} numberOfLines={1}>{km(o.distance_to_pickup_km)} dari Anda · {km(o.distance_km)} · {timeAgo(o.created_at)} · {o.payment_method === 'cash' ? 'Tunai' : 'AntarPay'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </PressableScale>
            </Animated.View>
          ))
        )}
      </Animated.View>
    </MapScreen>
  );
}

const s = StyleSheet.create({
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 6, paddingVertical: 5, borderRadius: radius.full, backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.68)', borderWidth: 1, borderColor: glass.border, overflow: 'hidden' },
  activeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.lg, padding: 14 },
  offer: { backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: radius.xl, padding: 16, borderWidth: 1.5, borderColor: colors.success + '66' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(11,31,42,0.06)', alignItems: 'center', justifyContent: 'center' },
  dotIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  radarBox: { alignItems: 'center', gap: 4, padding: 14, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: radius.xl, borderWidth: 1, borderColor: glass.border },
  orderRow: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: glass.border },
  svcIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
