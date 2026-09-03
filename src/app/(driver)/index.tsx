import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Switch, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MapView, MapFab } from '@/components/map';
import type { MapMarker } from '@/components/map';
import { Row, Badge, Button, Empty, toast, Avatar } from '@/components/ui';
import { useDriverSession } from '@/hooks/useDriver';
import { useCurrentLocation } from '@/hooks/useLocation';
import { useAuth } from '@/store/auth';
import { colors, font, radius, shadow } from '@/lib/theme';
import { rupiah, km, timeAgo, serviceLabel, statusLabel } from '@/lib/format';
import { serviceDef } from '@/lib/services';
import type { AvailableOrder } from '@/lib/types';

export default function DriverHome() {
  const router = useRouter();
  const { profile } = useAuth();
  const { driver, online, busy, setOnline, available, active, accept, myPos, setMyPos } = useDriverSession();
  const { location, refresh } = useCurrentLocation();
  const { height, width } = useWindowDimensions();
  const wide = width >= 900;
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Empty icon="hourglass-outline" title={driver.status === 'pending' ? 'Menunggu verifikasi admin' : driver.status === 'suspended' ? 'Akun mitra ditangguhkan' : 'Pendaftaran ditolak'}
          subtitle={driver.status === 'pending' ? 'Data Anda sedang diperiksa. Biasanya kurang dari 1×24 jam.' : 'Hubungi CS Antar Aja untuk informasi lebih lanjut.'}
          action={<Button title="Kembali ke mode pelanggan" variant="secondary" onPress={() => router.replace('/(customer)')} />} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={s.top}>
        <Avatar name={profile?.full_name} url={profile?.avatar_url} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>{profile?.full_name}</Text>
          <Text style={font.tiny}>{driver?.vehicle_plate} · ⭐ {Number(driver?.rating_avg ?? 5).toFixed(1)} · {driver?.total_trips} trip</Text>
        </View>
        <Row gap={8}>
          <Text style={{ fontWeight: '800', color: online ? colors.success : colors.textMuted }}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
          <Switch value={online} onValueChange={toggle} disabled={busy} trackColor={{ true: colors.success, false: colors.border }} thumbColor="#fff" />
        </Row>
      </View>
      <View style={[{ flex: 1 }, wide && { flexDirection: 'row-reverse' }]}>
        <View style={[{ flex: 1 }, wide && { flex: 1.4 }]}>
          <MapView center={pos} zoom={14} markers={markers} fitTo={fitTo} paddingBottom={wide ? 0 : 20} />
          <MapFab icon="locate" style={{ right: 16, top: 16 }} color={colors.info} onPress={async () => { const fix = await refresh(); if (fix) setMyPos({ ...fix, heading: null }); }} />
        </View>
        <View style={[s.sheet, wide ? { width: 420, borderRadius: 0 } : { maxHeight: Math.round(height * 0.5) }]}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}>
            {active && (
              <Pressable onPress={() => router.push(`/driver/order/${active.id}` as never)} style={s.activeCard}>
                <Ionicons name={serviceDef(active.service).icon as never} size={26} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Order aktif · {serviceLabel[active.service]}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{statusLabel(active.status, active.service)} · {active.code}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </Pressable>
            )}
            {!online ? (
              <Empty icon="power-outline" title="Anda sedang offline" subtitle="Aktifkan status online untuk melihat order di sekitar Anda." />
            ) : selected ? (
              <View style={s.offer}>
                <Row between>
                  <Badge text={serviceLabel[selected.service]} color={serviceDef(selected.service).color} />
                  <Pressable onPress={() => setSelected(null)}><Ionicons name="close" size={22} color={colors.textMuted} /></Pressable>
                </Row>
                <Text style={{ fontSize: 26, fontWeight: '900', color: colors.success, marginTop: 6 }}>{rupiah(selected.driver_earning)}</Text>
                <Text style={font.tiny}>Pendapatan bersih · {selected.payment_method === 'cash' ? `Tunai, tagih ${rupiah(selected.total)}` : 'Dibayar AntarPay'}</Text>
                <View style={{ marginTop: 10, gap: 6 }}>
                  <Row gap={8}><Ionicons name="navigate-circle" size={18} color={colors.primary} /><Text style={[font.small, { flex: 1 }]}>{km(selected.distance_to_pickup_km)} ke titik jemput · {selected.merchant_name ?? selected.pickup_address}</Text></Row>
                  <Row gap={8}><Ionicons name="flag" size={18} color={colors.danger} /><Text style={[font.small, { flex: 1 }]}>{km(selected.distance_km)} perjalanan · {selected.dropoff_address}</Text></Row>
                  {selected.service === 'food' && <Row gap={8}><Ionicons name="restaurant" size={18} color={colors.food} /><Text style={font.small}>Beli makanan {rupiah(selected.items_subtotal)}{selected.payment_method === 'cash' ? ' (talangi tunai)' : ' (dibayar AntarPay)'}</Text></Row>}
                </View>
                <Button title="Terima Order" size="lg" color={colors.success} style={{ marginTop: 12 }} onPress={() => doAccept(selected)} />
              </View>
            ) : available.length === 0 ? (
              <Empty icon="radio-outline" title="Mencari order di sekitar…" subtitle="Order baru dalam radius 5 km akan muncul otomatis di sini." />
            ) : (
              <>
                <Text style={font.h3}>{available.length} order tersedia</Text>
                {available.map((o) => (
                  <Pressable key={o.id} onPress={() => setSelected(o)} style={s.orderRow}>
                    <View style={[s.svcIcon, { backgroundColor: serviceDef(o.service).color }]}><Ionicons name={serviceDef(o.service).icon as never} size={20} color="#fff" /></View>
                    <View style={{ flex: 1 }}>
                      <Row between><Text style={{ fontWeight: '700', color: colors.text }}>{serviceLabel[o.service]}</Text><Text style={{ fontWeight: '800', color: colors.success }}>{rupiah(o.driver_earning)}</Text></Row>
                      <Text style={font.small} numberOfLines={1}>{o.merchant_name ?? o.pickup_address}</Text>
                      <Text style={font.tiny}>{km(o.distance_to_pickup_km)} dari Anda · {km(o.distance_km)} · {timeAgo(o.created_at)} · {o.payment_method === 'cash' ? 'Tunai' : 'AntarPay'}</Text>
                    </View>
                  </Pressable>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...shadow.sheet },
  activeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ride, borderRadius: radius.lg, padding: 14 },
  offer: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: 16, borderWidth: 1.5, borderColor: colors.success },
  orderRow: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.bg, borderRadius: radius.lg, padding: 12 },
  svcIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
