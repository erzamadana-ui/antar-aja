import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MapView, MapFab } from '@/components/map';
import { Button, Row, Badge, toast } from '@/components/ui';
import { LocationFields } from '@/components/LocationField';
import { PaymentSection, PriceSummary } from '@/components/BookingSheet';
import { useBooking } from '@/store/booking';
import { useAuth } from '@/store/auth';
import { useCurrentLocation } from '@/hooks/useLocation';
import { getRoute, reverseGeocode, type RouteResult } from '@/lib/geo';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import { rupiah, minutes, km } from '@/lib/format';
import type { FareEstimate, Order, PaymentMethod, ServiceType } from '@/lib/types';
import type { MapMarker } from '@/components/map';

export default function RideScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ service?: string }>();
  const [service, setService] = useState<ServiceType>(params.service === 'ride_car' ? 'ride_car' : 'ride_motor');
  const { pickup, dropoff, setPickup } = useBooking();
  const { location, hasFix, refresh } = useCurrentLocation();
  const refreshWallet = useAuth((s) => s.refreshWallet);
  const { height, width } = useWindowDimensions();
  const wide = width >= 900;
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [est, setEst] = useState<Partial<Record<ServiceType, FareEstimate>>>({});
  const [loadingEst, setLoadingEst] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [promo, setPromo] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [nearby, setNearby] = useState<MapMarker[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  // Titik jemput default = lokasi saya
  useEffect(() => {
    if (!pickup && hasFix) reverseGeocode(location).then((address) => { if (!useBooking.getState().pickup) setPickup({ ...location, address, name: 'Lokasi saya' }); });
  }, [hasFix]); // eslint-disable-line react-hooks/exhaustive-deps

  // Driver di sekitar (dekorasi peta)
  useEffect(() => {
    const p = pickup ?? location;
    supabase.rpc('nearby_drivers', { p_lat: p.lat, p_lng: p.lng, p_vehicle: service === 'ride_car' ? 'car' : 'motor', p_radius_km: 6 })
      .then(({ data }) => setNearby(((data as { id: string; lat: number; lng: number; heading: number | null }[]) ?? []).map((d) => ({ id: d.id, lat: d.lat, lng: d.lng, heading: d.heading, kind: service === 'ride_car' ? 'car' : 'motor' }))));
  }, [pickup?.lat, pickup?.lng, service]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rute + estimasi tarif untuk kedua jenis kendaraan
  useEffect(() => {
    if (!pickup || !dropoff) { setRoute(null); setEst({}); return; }
    let cancelled = false;
    (async () => {
      setLoadingEst(true);
      const r = await getRoute(pickup, dropoff);
      if (cancelled) return;
      setRoute(r);
      const [m, c] = await Promise.all((['ride_motor', 'ride_car'] as ServiceType[]).map((sv) =>
        rpc<FareEstimate>('estimate_fare', { p_service: sv, p_pickup_lat: pickup.lat, p_pickup_lng: pickup.lng, p_drop_lat: dropoff.lat, p_drop_lng: dropoff.lng, p_route_km: r.distance_km }).catch(() => null)));
      if (cancelled) return;
      setEst({ ride_motor: m ?? undefined, ride_car: c ?? undefined });
      setLoadingEst(false);
    })();
    return () => { cancelled = true; };
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const fare = est[service];
  const total = fare ? Math.max(0, fare.fare + fare.platform_fee - discount) : 0;
  const markers = useMemo<MapMarker[]>(() => [
    ...nearby,
    ...(pickup ? [{ id: 'pickup', lat: pickup.lat, lng: pickup.lng, kind: 'pickup' as const }] : []),
    ...(dropoff ? [{ id: 'dropoff', lat: dropoff.lat, lng: dropoff.lng, kind: 'dropoff' as const }] : []),
    ...(!pickup && hasFix ? [{ id: 'me', lat: location.lat, lng: location.lng, kind: 'me' as const }] : []),
  ], [nearby, pickup, dropoff, hasFix, location]);
  const fitTo = useMemo(() => (pickup && dropoff ? [pickup, dropoff] : pickup ? [pickup] : null), [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const order = async () => {
    if (!pickup || !dropoff || !fare) return;
    try {
      const o = await rpc<Order>('create_order', { p: {
        service, pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.address }, dropoff: { lat: dropoff.lat, lng: dropoff.lng, address: dropoff.address },
        route_km: route?.distance_km, duration_min: route?.duration_min, route_geometry: route?.coords, payment_method: method, promo_code: promo || null, notes: notes || null,
      } });
      await refreshWallet();
      useBooking.getState().reset();
      router.replace(`/order/${o.id}` as never);
    } catch (e) { toast.error((e as Error).message); }
  };

  const sheetMax = wide ? undefined : Math.round(height * 0.62);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={[{ flex: 1 }, wide && { flexDirection: 'row-reverse' }]}>
        <View style={[{ flex: 1 }, wide && { flex: 1.4 }]}>
          <MapView center={pickup ?? location} zoom={15} markers={markers} polyline={route?.coords} fitTo={fitTo} paddingBottom={wide ? 0 : 40} />
          <Pressable onPress={() => router.back()} style={s.back}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
          <MapFab icon="locate" style={{ right: 16, top: 16 }} color={colors.info} onPress={async () => { const p = await refresh(); if (p) { const a = await reverseGeocode(p); setPickup({ ...p, address: a, name: 'Lokasi saya' }); } }} />
        </View>
        <View style={[s.sheet, wide ? { width: 420, borderRadius: 0 } : { maxHeight: sheetMax }]}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Row gap={8}>
              {(['ride_motor', 'ride_car'] as ServiceType[]).map((sv) => {
                const active = service === sv;
                return (
                  <Pressable key={sv} onPress={() => setService(sv)} style={[s.vehicle, active && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}>
                    <Ionicons name={sv === 'ride_car' ? 'car-sport' : 'bicycle'} size={22} color={sv === 'ride_car' ? colors.car : colors.ride} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: colors.text }}>{sv === 'ride_car' ? 'AntarCar' : 'AntarRide'}</Text>
                      <Text style={font.tiny}>{sv === 'ride_car' ? 'Mobil, s.d. 4 orang' : 'Motor, 1 orang'}</Text>
                    </View>
                    {est[sv] ? <Text style={{ fontWeight: '800', color: colors.text }}>{rupiah(est[sv]!.fare + est[sv]!.platform_fee)}</Text> : null}
                  </Pressable>
                );
              })}
            </Row>

            <LocationFields pickup={pickup} dropoff={dropoff} />

            {!dropoff && <Text style={[font.small, { textAlign: 'center' }]}>Pilih tujuan untuk melihat tarif.</Text>}
            {pickup && dropoff && (
              <View style={{ gap: 12 }}>
                <Row gap={8}>
                  <Badge text={loadingEst || !route ? 'Menghitung rute…' : `${km(route.distance_km)} · ${minutes(route.duration_min)}${route.estimated ? ' (perkiraan)' : ''}`} color={colors.info} />
                  {nearby.length > 0 && <Badge text={`${nearby.length} driver di dekat Anda`} color={colors.success} />}
                </Row>
                {fare && (
                  <Pressable onPress={() => setShowDetails(!showDetails)} style={s.fareBox}>
                    <Row between>
                      <View>
                        <Text style={font.tiny}>Estimasi biaya {service === 'ride_car' ? 'AntarCar' : 'AntarRide'}</Text>
                        <Text style={{ fontSize: 24, fontWeight: '900', color: colors.primary }}>{rupiah(total)}</Text>
                      </View>
                      <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
                    </Row>
                    {showDetails && (
                      <View style={{ marginTop: 10 }}>
                        <PriceSummary rows={[{ label: `Tarif perjalanan (${km(fare.distance_km)})`, value: fare.fare }, { label: 'Biaya layanan', value: fare.platform_fee }, { label: 'Diskon promo', value: discount, minus: true }]} total={total} />
                      </View>
                    )}
                  </Pressable>
                )}
                <PaymentSection method={method} onMethod={setMethod} promo={promo} onPromo={setPromo} notes={notes} onNotes={setNotes} subtotal={fare?.fare ?? 0} service={service} onDiscount={setDiscount} />
                <Button title={fare ? `Pesan ${service === 'ride_car' ? 'AntarCar' : 'AntarRide'} · ${rupiah(total)}` : 'Menghitung…'} size="lg" disabled={!fare || loadingEst} onPress={order} color={service === 'ride_car' ? colors.car : colors.ride} />
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
  vehicle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: 10 },
  fareBox: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: 14 },
});
