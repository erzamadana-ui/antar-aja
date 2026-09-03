import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MapView } from '@/components/map';
import type { MapMarker } from '@/components/map';
import { Button, Row, Badge, Input, Chip, toast } from '@/components/ui';
import { LocationFields } from '@/components/LocationField';
import { PaymentSection, PriceSummary } from '@/components/BookingSheet';
import { useBooking } from '@/store/booking';
import { useAuth } from '@/store/auth';
import { useCurrentLocation } from '@/hooks/useLocation';
import { getRoute, reverseGeocode, type RouteResult } from '@/lib/geo';
import { rpc } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import { rupiah, km, minutes } from '@/lib/format';
import type { FareEstimate, Order, PaymentMethod } from '@/lib/types';

const TYPES = ['Dokumen', 'Makanan', 'Pakaian', 'Elektronik', 'Lainnya'];
const WEIGHTS = ['< 1 kg', '1–5 kg', '5–10 kg', '10–20 kg'];

export default function SendScreen() {
  const router = useRouter();
  const { pickup, dropoff, setPickup } = useBooking();
  const { location, hasFix } = useCurrentLocation();
  const refreshWallet = useAuth((s) => s.refreshWallet);
  const { height, width } = useWindowDimensions();
  const wide = width >= 900;
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [fare, setFare] = useState<FareEstimate | null>(null);
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
      const r = await getRoute(pickup, dropoff);
      if (cancelled) return;
      setRoute(r);
      const f = await rpc<FareEstimate>('estimate_fare', { p_service: 'send', p_pickup_lat: pickup.lat, p_pickup_lng: pickup.lng, p_drop_lat: dropoff.lat, p_drop_lng: dropoff.lng, p_route_km: r.distance_km }).catch(() => null);
      if (!cancelled) setFare(f);
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={[{ flex: 1 }, wide && { flexDirection: 'row-reverse' }]}>
        <View style={[{ flex: 1 }, wide && { flex: 1.4 }]}>
          <MapView center={pickup ?? location} zoom={15} markers={markers} polyline={route?.coords} fitTo={fitTo} paddingBottom={wide ? 0 : 40} />
          <Pressable onPress={() => router.back()} style={s.back}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        </View>
        <View style={[s.sheet, wide ? { width: 420, borderRadius: 0 } : { maxHeight: Math.round(height * 0.66) }]}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Row gap={10}>
              <View style={[s.iconBox, { backgroundColor: colors.send }]}><Ionicons name="cube" size={22} color="#fff" /></View>
              <View style={{ flex: 1 }}><Text style={font.h3}>AntarSend</Text><Text style={font.tiny}>Kirim paket dalam kota, sampai hari ini</Text></View>
            </Row>
            <LocationFields pickup={pickup} dropoff={dropoff} pickupLabel="Ambil dari" dropoffLabel="Antar ke" />
            {pickup && dropoff && (
              <View style={{ gap: 14 }}>
                <Row gap={8}>{route && <Badge text={`${km(route.distance_km)} · ${minutes(route.duration_min)}`} color={colors.info} />}{fare && <Badge text={`Ongkir ${rupiah(fare.fare + fare.platform_fee)}`} color={colors.send} />}</Row>
                <Text style={font.h3}>Penerima</Text>
                <Input placeholder="Nama penerima" icon="person-outline" value={recipient.name} onChangeText={(v) => setRecipient({ ...recipient, name: v })} />
                <Input placeholder="Nomor HP penerima" icon="call-outline" keyboardType="phone-pad" value={recipient.phone} onChangeText={(v) => setRecipient({ ...recipient, phone: v })} />
                <Text style={font.h3}>Detail paket</Text>
                <Row gap={8} style={{ flexWrap: 'wrap' }}>{TYPES.map((t) => <Chip key={t} label={t} active={type === t} onPress={() => setType(t)} color={colors.send} />)}</Row>
                <Row gap={8} style={{ flexWrap: 'wrap' }}>{WEIGHTS.map((w) => <Chip key={w} label={w} active={weight === w} onPress={() => setWeight(w)} color={colors.send} />)}</Row>
                <Input placeholder="Deskripsi isi paket (opsional)" icon="document-text-outline" value={desc} onChangeText={setDesc} />
                {fare && <PriceSummary rows={[{ label: `Ongkos kirim (${km(fare.distance_km)})`, value: fare.fare }, { label: 'Biaya layanan', value: fare.platform_fee }, { label: 'Diskon promo', value: discount, minus: true }]} total={total} />}
                <PaymentSection method={method} onMethod={setMethod} promo={promo} onPromo={setPromo} notes={notes} onNotes={setNotes} subtotal={fare?.fare ?? 0} service="send" onDiscount={setDiscount} notesPlaceholder="Catatan (mis. titip di satpam)" />
                <Text style={font.tiny}>Barang terlarang: narkoba, senjata, hewan hidup, barang mudah terbakar. Maks. nilai barang Rp2.000.000.</Text>
                <Button title={`Kirim Sekarang · ${rupiah(total)}`} size="lg" color={colors.send} disabled={!valid} onPress={order} />
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  back: { position: 'absolute', left: 16, top: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.card, zIndex: 6 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...shadow.sheet },
  iconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
