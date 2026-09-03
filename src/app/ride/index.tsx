import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { MapView } from '@/components/map';
import type { MapMarker } from '@/components/map';
import { Button, Row, Badge, toast } from '@/components/ui';
import { MapScreen, FloatingButton } from '@/components/MapScreen';
import { PressableScale, Skeleton } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { LocationFields } from '@/components/LocationField';
import { PaymentSection, PriceSummary } from '@/components/BookingSheet';
import { useBooking } from '@/store/booking';
import { useAuth } from '@/store/auth';
import { useCurrentLocation } from '@/hooks/useLocation';
import { getRoute, reverseGeocode, type RouteResult } from '@/lib/geo';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font, radius, shadow, motion, glass } from '@/lib/theme';
import { rupiah, minutes, km } from '@/lib/format';
import type { FareEstimate, Order, PaymentMethod, ServiceType } from '@/lib/types';

export default function RideScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ service?: string }>();
  const [service, setService] = useState<ServiceType>(params.service === 'ride_car' ? 'ride_car' : 'ride_motor');
  const { pickup, dropoff, setPickup } = useBooking();
  const { location, hasFix, refresh } = useCurrentLocation();
  const refreshWallet = useAuth((s) => s.refreshWallet);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [est, setEst] = useState<Partial<Record<ServiceType, FareEstimate>>>({});
  const [loadingEst, setLoadingEst] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [promo, setPromo] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [nearby, setNearby] = useState<MapMarker[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!pickup && hasFix) reverseGeocode(location).then((address) => { if (!useBooking.getState().pickup) setPickup({ ...location, address, name: 'Lokasi saya' }); });
  }, [hasFix]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = pickup ?? location;
    supabase.rpc('nearby_drivers', { p_lat: p.lat, p_lng: p.lng, p_vehicle: service === 'ride_car' ? 'car' : 'motor', p_radius_km: 6 })
      .then(({ data }) => setNearby(((data as { id: string; lat: number; lng: number; heading: number | null }[]) ?? []).map((d) => ({ id: d.id, lat: d.lat, lng: d.lng, heading: d.heading, kind: service === 'ride_car' ? 'car' : 'motor' }))));
  }, [pickup?.lat, pickup?.lng, service]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const accent = service === 'ride_car' ? colors.car : colors.ride;
  const header = (
    <Row gap={8}>
      {(['ride_motor', 'ride_car'] as ServiceType[]).map((sv) => {
        const active = service === sv; const c = sv === 'ride_car' ? colors.car : colors.ride;
        return (
          <PressableScale key={sv} onPress={() => setService(sv)} scaleTo={0.96} style={{ flex: 1 }}>
            <Animated.View layout={LinearTransition.springify()} style={[s.vehicle, active && { borderColor: c, backgroundColor: c + '14', ...shadow.glow(c) }]}>
              <View style={[s.vehicleIcon, { backgroundColor: active ? c : 'rgba(11,31,42,0.06)' }]}>
                <Ionicons name={sv === 'ride_car' ? 'car-sport' : 'bicycle'} size={20} color={active ? '#fff' : colors.textSecondary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 14 }} numberOfLines={1}>{sv === 'ride_car' ? 'AntarCar' : 'AntarRide'}</Text>
                {loadingEst && pickup && dropoff ? <Skeleton width={70} height={12} /> : est[sv]
                  ? <Text style={{ fontWeight: '700', color: c, fontSize: 13 }} numberOfLines={1}>{rupiah(est[sv]!.fare + est[sv]!.platform_fee)}</Text>
                  : <Text style={font.tiny} numberOfLines={1}>{sv === 'ride_car' ? 'Mobil, 4 orang' : 'Motor, 1 orang'}</Text>}
              </View>
            </Animated.View>
          </PressableScale>
        );
      })}
    </Row>
  );

  return (
    <MapScreen
      map={<MapView center={pickup ?? location} zoom={15} markers={markers} polyline={route?.coords} fitTo={fitTo} paddingBottom={40} />}
      floatingRight={<FloatingButton icon="locate" color={colors.info} onPress={async () => { const p = await refresh(); if (p) { const a = await reverseGeocode(p); setPickup({ ...p, address: a, name: 'Lokasi saya' }); } }} />}
      header={header}
      minHeight={230}
      maxRatio={0.66}
    >
      <View style={{ gap: 14 }}>
        <LocationFields pickup={pickup} dropoff={dropoff} />
        {!dropoff && <Text style={[font.small, { textAlign: 'center' }]}>Pilih tujuan untuk melihat tarif.</Text>}
        {pickup && dropoff && (
          <Animated.View entering={FadeInDown.duration(motion.base)} style={{ gap: 12 }}>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <Badge text={loadingEst || !route ? 'Menghitung rute…' : `${km(route.distance_km)} · ${minutes(route.duration_min)}${route.estimated ? ' (perkiraan)' : ''}`} color={colors.info} />
              {nearby.length > 0 && <Badge text={`${nearby.length} driver di dekat Anda`} color={colors.success} />}
              {fare?.session && fare.session.multiplier !== 1 && <Badge text={`${fare.session.level === 'high' ? 'Jam sibuk' : 'Jam sepi'} ${fare.session.multiplier}×`} color={fare.session.level === 'high' ? colors.danger : colors.success} />}
            </Row>
            {fare && (
              <PressableScale onPress={() => setShowDetails(!showDetails)} scaleTo={0.99} haptic={false}>
                <Animated.View layout={LinearTransition.springify()} style={s.fareBox}>
                  <Row between>
                    <View>
                      <Text style={font.label}>Estimasi biaya</Text>
                      <Text style={{ fontSize: 26, fontWeight: '900', color: accent, letterSpacing: -0.5 }}>{rupiah(total)}</Text>
                    </View>
                    <View style={s.chev}><Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} /></View>
                  </Row>
                  {showDetails && (
                    <Animated.View entering={FadeInDown.duration(motion.fast)} style={{ marginTop: 10 }}>
                      <PriceSummary rows={[{ label: `Tarif perjalanan (${km(fare.distance_km)})`, value: fare.fare }, { label: 'Biaya layanan', value: fare.platform_fee }, { label: 'Diskon promo', value: discount, minus: true }]} total={total} />
                    </Animated.View>
                  )}
                </Animated.View>
              </PressableScale>
            )}
            <PaymentSection method={method} onMethod={setMethod} promo={promo} onPromo={setPromo} notes={notes} onNotes={setNotes} subtotal={fare?.fare ?? 0} service={service} onDiscount={setDiscount} />
            <Button title={fare ? `Pesan ${service === 'ride_car' ? 'AntarCar' : 'AntarRide'} · ${rupiah(total)}` : 'Menghitung…'} size="lg" disabled={!fare || loadingEst} onPress={order} color={accent} />
          </Animated.View>
        )}
      </View>
    </MapScreen>
  );
}

export { BrandGradient };
const s = StyleSheet.create({
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: 'rgba(11,31,42,0.08)', borderRadius: radius.lg, padding: 10, backgroundColor: 'rgba(255,255,255,0.6)' },
  vehicleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fareBox: { backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: glass.border },
  chev: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(11,31,42,0.06)', alignItems: 'center', justifyContent: 'center' },
});
