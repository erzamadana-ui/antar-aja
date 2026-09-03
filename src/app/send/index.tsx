import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { MapView } from '@/components/map';
import type { MapMarker } from '@/components/map';
import { Button, Row, Badge, Input, Chip, toast } from '@/components/ui';
import { MapScreen } from '@/components/MapScreen';
import { BrandGradient } from '@/components/glass';
import { Skeleton } from '@/components/motion';
import { LocationFields } from '@/components/LocationField';
import { PaymentSection, PriceSummary } from '@/components/BookingSheet';
import { useBooking } from '@/store/booking';
import { useAuth } from '@/store/auth';
import { useCurrentLocation } from '@/hooks/useLocation';
import { getRoute, reverseGeocode, type RouteResult } from '@/lib/geo';
import { rpc } from '@/lib/supabase';
import { colors, font, radius, motion, glass, shadow } from '@/lib/theme';
import { rupiah, km, minutes } from '@/lib/format';
import type { FareEstimate, Order, PaymentMethod } from '@/lib/types';

const TYPES = ['Dokumen', 'Makanan', 'Pakaian', 'Elektronik', 'Lainnya'];
const WEIGHTS = ['< 1 kg', '1–5 kg', '5–10 kg', '10–20 kg'];

export default function SendScreen() {
  const router = useRouter();
  const { pickup, dropoff, setPickup } = useBooking();
  const { location, hasFix } = useCurrentLocation();
  const refreshWallet = useAuth((s) => s.refreshWallet);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [fare, setFare] = useState<FareEstimate | null>(null);
  const [loadingEst, setLoadingEst] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [promo, setPromo] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [recipient, setRecipient] = useState({ name: '', phone: '' });
  const [type, setType] = useState('Dokumen');
  const [weight, setWeight] = useState('< 1 kg');
  const [desc, setDesc] = useState('');

  useEffect(() => {
    if (!pickup && hasFix) reverseGeocode(location).then((address) => { if (!useBooking.getState().pickup) setPickup({ ...location, address, name: 'Lokasi saya' }); });
  }, [hasFix]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pickup || !dropoff) { setRoute(null); setFare(null); return; }
    let cancelled = false;
    (async () => {
      setLoadingEst(true);
      const r = await getRoute(pickup, dropoff);
      if (cancelled) return;
      setRoute(r);
      const f = await rpc<FareEstimate>('estimate_fare', { p_service: 'send', p_pickup_lat: pickup.lat, p_pickup_lng: pickup.lng, p_drop_lat: dropoff.lat, p_drop_lng: dropoff.lng, p_route_km: r.distance_km }).catch(() => null);
      if (!cancelled) { setFare(f); setLoadingEst(false); }
    })();
    return () => { cancelled = true; };
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = fare ? Math.max(0, fare.fare + fare.platform_fee - discount) : 0;
  const markers = useMemo<MapMarker[]>(() => [
    ...(pickup ? [{ id: 'pickup', lat: pickup.lat, lng: pickup.lng, kind: 'pickup' as const, label: 'Ambil' }] : []),
    ...(dropoff ? [{ id: 'dropoff', lat: dropoff.lat, lng: dropoff.lng, kind: 'dropoff' as const, label: 'Antar' }] : []),
  ], [pickup, dropoff]);
  const fitTo = useMemo(() => (pickup && dropoff ? [pickup, dropoff] : pickup ? [pickup] : null), [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const valid = pickup && dropoff && fare && recipient.name.trim().length >= 2 && /^(\+62|0)8\d{7,12}$/.test(recipient.phone.replace(/\s|-/g, ''));

  const order = async () => {
    if (!valid || !pickup || !dropoff) return;
    try {
      const o = await rpc<Order>('create_order', { p: {
        service: 'send', pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.address }, dropoff: { lat: dropoff.lat, lng: dropoff.lng, address: dropoff.address },
        route_km: route?.distance_km, duration_min: route?.duration_min, route_geometry: route?.coords, payment_method: method, promo_code: promo || null, notes: notes || null,
        recipient_name: recipient.name.trim(), recipient_phone: recipient.phone.trim(), package_details: { type, weight, description: desc },
      } });
      await refreshWallet();
      useBooking.getState().reset();
      router.replace(`/order/${o.id}` as never);
    } catch (e) { toast.error((e as Error).message); }
  };

  const header = (
    <Row gap={12}>
      <BrandGradient colors={[colors.send, '#4C1D95']} style={[s.iconBox, shadow.glow(colors.send)]}><Ionicons name="cube" size={22} color="#fff" /></BrandGradient>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={font.h3}>AntarSend</Text>
        <Text style={font.tiny} numberOfLines={1}>Kirim paket dalam kota, sampai hari ini</Text>
      </View>
      {pickup && dropoff ? (
        <Animated.View layout={LinearTransition.springify()} style={s.farePill}>
          {loadingEst || !fare ? <Skeleton width={64} height={14} /> : <Text style={{ fontWeight: '900', color: colors.send, fontSize: 15 }}>{rupiah(fare.fare + fare.platform_fee)}</Text>}
        </Animated.View>
      ) : null}
    </Row>
  );

  return (
    <MapScreen
      map={<MapView center={pickup ?? location} zoom={15} markers={markers} polyline={route?.coords} fitTo={fitTo} paddingBottom={40} />}
      header={header}
      minHeight={230}
      maxRatio={0.7}
    >
      <View style={{ gap: 14 }}>
        <LocationFields pickup={pickup} dropoff={dropoff} pickupLabel="Ambil dari" dropoffLabel="Antar ke" />
        {!dropoff && <Text style={[font.small, { textAlign: 'center' }]}>Pilih alamat tujuan untuk melihat ongkir.</Text>}
        {pickup && dropoff && (
          <Animated.View entering={FadeInDown.duration(motion.base)} style={{ gap: 14 }}>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <Badge text={!route ? 'Menghitung rute…' : `${km(route.distance_km)} · ${minutes(route.duration_min)}`} color={colors.info} />
              {fare && <Badge text={`Ongkir ${rupiah(fare.fare + fare.platform_fee)}`} color={colors.send} />}
            </Row>
            <View style={s.group}>
              <Text style={font.label}>Penerima</Text>
              <Input placeholder="Nama penerima" icon="person-outline" value={recipient.name} onChangeText={(v) => setRecipient({ ...recipient, name: v })} />
              <Input placeholder="Nomor HP penerima" icon="call-outline" keyboardType="phone-pad" value={recipient.phone} onChangeText={(v) => setRecipient({ ...recipient, phone: v })} />
            </View>
            <View style={s.group}>
              <Text style={font.label}>Detail paket</Text>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>{TYPES.map((t) => <Chip key={t} label={t} active={type === t} onPress={() => setType(t)} color={colors.send} />)}</Row>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>{WEIGHTS.map((w) => <Chip key={w} label={w} active={weight === w} onPress={() => setWeight(w)} color={colors.send} />)}</Row>
              <Input placeholder="Deskripsi isi paket (opsional)" icon="document-text-outline" value={desc} onChangeText={setDesc} />
            </View>
            {fare && <View style={s.group}><PriceSummary rows={[{ label: `Ongkos kirim (${km(fare.distance_km)})`, value: fare.fare }, { label: 'Biaya layanan', value: fare.platform_fee }, { label: 'Diskon promo', value: discount, minus: true }]} total={total} /></View>}
            <PaymentSection method={method} onMethod={setMethod} promo={promo} onPromo={setPromo} notes={notes} onNotes={setNotes} subtotal={fare?.fare ?? 0} service="send" onDiscount={setDiscount} notesPlaceholder="Catatan (mis. titip di satpam)" />
            <Text style={font.tiny}>Barang terlarang: narkoba, senjata, hewan hidup, barang mudah terbakar. Maks. nilai barang Rp2.000.000.</Text>
            <Button title={`Kirim Sekarang · ${rupiah(total)}`} size="lg" color={colors.send} disabled={!valid} onPress={order} />
          </Animated.View>
        )}
      </View>
    </MapScreen>
  );
}

const s = StyleSheet.create({
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  farePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.send + '14', borderWidth: 1, borderColor: colors.send + '33' },
  group: { gap: 10, backgroundColor: 'rgba(255,255,255,0.62)', borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: glass.border },
});
