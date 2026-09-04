// AntarTravel — travel antar kota: pilih rute, tanggal, jumlah penumpang / private 1 keluarga, jemput di rumah
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Screen, Button, Row, Badge, Input, Chip, Stepper, Avatar, Empty, toast } from '@/components/ui';
import { PressableScale, Skeleton } from '@/components/motion';
import { LocationFields } from '@/components/LocationField';
import { PaymentSection, PriceSummary, paidViaOf, handleShortfall, type PayChoice } from '@/components/BookingSheet';
import { ServiceArt } from '@/components/ServiceArt';
import { useCities, useTravelSearch, useMyTravelBookings } from '@/hooks/useTravel';
import { usePayPrefs } from '@/store/payprefs';
import { useBooking } from '@/store/booking';
import { useAuth } from '@/store/auth';
import { useCurrentLocation } from '@/hooks/useLocation';
import { reverseGeocode } from '@/lib/geo';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font, radius, motion, glass, shadow } from '@/lib/theme';
import { rupiah, formatSchedule, formatDate, travelStatusLabel, tripStatusLabel, cityName } from '@/lib/format';
import type { TravelBooking, TravelSearchTrip } from '@/lib/types';

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function TravelScreen() {
  const router = useRouter();
  const cities = useCities();
  const { session, profile, refreshWallet } = useAuth();
  const { pickup, setPickup } = useBooking();
  const { location, hasFix } = useCurrentLocation();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 10 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); return d; }), []);
  const [day, setDay] = useState<Date | null>(null);
  const { result, loading, reload } = useTravelSearch(from, to, day ? ymd(day) : null);
  const [trip, setTrip] = useState<TravelSearchTrip | null>(null);
  const [pax, setPax] = useState(1);
  const [priv, setPriv] = useState(false);
  const [dropAddr, setDropAddr] = useState('');
  const [names, setNames] = useState('');
  const [method, setMethod] = useState<PayChoice>('cash');
  const payPrefs = usePayPrefs((st) => st.prefs);
  const [promo, setPromo] = useState(''); const [discount, setDiscount] = useState(0); const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const { bookings } = useMyTravelBookings(session?.user.id);

  useEffect(() => {
    if (!pickup && hasFix) reverseGeocode(location).then((address) => { if (!useBooking.getState().pickup) setPickup({ ...location, address, name: 'Lokasi saya' }); });
  }, [hasFix]); // eslint-disable-line react-hooks/exhaustive-deps
  // kota asal default = kota terdekat
  useEffect(() => {
    if (from || cities.length === 0) return;
    supabase.rpc('nearest_city', { p_lat: location.lat, p_lng: location.lng, p_max_km: 80 }).then(({ data }) => { if (data) setFrom(data as string); });
  }, [cities, location.lat, location.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTrip(null); setPriv(false); }, [from, to, day]);

  const route = result?.route ?? null;
  const price = trip ? (priv ? trip.private_price : trip.seat_price * pax) : 0;
  const fee = 5000;
  const total = trip ? Math.max(0, price + fee - discount) : 0;
  const fromCity = cities.find((c) => c.id === from), toCity = cities.find((c) => c.id === to);

  const book = async () => {
    if (!trip || !pickup) return toast.error('Isi alamat jemput');
    setBusy(true);
    try {
      const passengers = names.split(/[,\n]/).map((n) => n.trim()).filter(Boolean).map((name) => ({ name }));
      const b = await rpc<TravelBooking>('travel_book', { p: { trip_id: trip.id, pax: priv ? pax : pax, is_private: priv, pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng, dropoff_address: dropAddr || null, passengers: passengers.length ? passengers : [{ name: profile?.full_name ?? 'Penumpang' }], paid_via: paidViaOf(method, payPrefs?.ewallet), notes: notes || null } });
      await refreshWallet(); useBooking.getState().reset();
      toast.success(`Booking ${b.code} berhasil`);
      router.replace(`/travel/${b.id}` as never);
    } catch (e) { if (!handleShortfall(e, router, payPrefs?.ewallet)) toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Screen title="AntarTravel" back maxWidth={640} footer={trip ? <Button title={`${priv ? 'Carter private' : `Pesan ${pax} kursi`} · ${rupiah(total)}`} size="lg" color={colors.travel} loading={busy} onPress={book} /> : undefined}>
      <View style={{ gap: 14 }}>
        <Row gap={12} style={s.hero}>
          <ServiceArt kind="travel" color={colors.travel} size={54} glow={false} />
          <View style={{ flex: 1 }}><Text style={font.h3}>Travel antar kota</Text><Text style={font.tiny}>Innova / Hi-Ace mitra resmi · jemput di rumah · bisa private 1 keluarga · booking tanggal</Text></View>
        </Row>

        <View style={s.group}>
          <Text style={font.label}>Dari kota</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{cities.map((c) => <Chip key={c.id} label={c.name} active={from === c.id} onPress={() => setFrom(c.id)} color={colors.travel} />)}</ScrollView>
          <Text style={font.label}>Ke kota</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{cities.filter((c) => c.id !== from).map((c) => <Chip key={c.id} label={c.name} active={to === c.id} onPress={() => setTo(c.id)} color={colors.travel} />)}</ScrollView>
          <Text style={font.label}>Tanggal berangkat</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Pressable onPress={() => setDay(null)} style={[s.day, !day && { backgroundColor: colors.travel, borderColor: colors.travel }]}><Text style={{ fontSize: 11, fontWeight: '700', color: !day ? '#fff' : colors.textMuted }}>Semua</Text><Text style={{ fontSize: 16, fontWeight: '900', color: !day ? '#fff' : colors.text }}>10 hr</Text></Pressable>
            {days.map((d, i) => { const active = day && d.getTime() === day.getTime(); return (
              <Pressable key={i} onPress={() => setDay(d)} style={[s.day, active && { backgroundColor: colors.travel, borderColor: colors.travel }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#fff' : colors.textMuted }}>{i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : DAY_NAMES[d.getDay()]}</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: active ? '#fff' : colors.text }}>{d.getDate()}</Text>
              </Pressable>); })}
          </ScrollView>
          {route && <Row gap={6} style={{ flexWrap: 'wrap' }}><Badge text={`${route.distance_km} km · ±${route.duration_h} jam`} color={colors.info} /><Badge text={`Kursi ${rupiah(route.seat_price)}/orang`} color={colors.travel} /><Badge text={`Private mulai ${rupiah(route.private_price)}`} color={colors.accent} /><Badge text={`Min. ${route.min_pax} penumpang berangkat`} color={colors.textMuted} /></Row>}
        </View>

        {from && to && (loading ? <Skeleton height={90} radius={radius.lg} /> : !result?.route ? <Empty icon="bus-outline" title="Rute belum tersedia" subtitle="Belum ada mitra travel untuk rute ini. Coba rute lain." /> : result.trips.length === 0 ? (
          <Empty icon="calendar-outline" title="Belum ada jadwal" subtitle={`Belum ada keberangkatan ${fromCity?.name} → ${toCity?.name}${day ? ' pada tanggal ini' : ''}. Coba tanggal lain.`} />
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={font.label}>Jadwal keberangkatan {fromCity?.name} → {toCity?.name}</Text>
            {result.trips.map((t) => {
              const active = trip?.id === t.id; const p = t.partner;
              return (
                <PressableScale key={t.id} onPress={() => { setTrip(t); if (t.seats_left < pax) setPax(Math.max(1, t.seats_left)); }} scaleTo={0.985} style={[s.trip, active && { borderColor: colors.travel, backgroundColor: colors.travel + '0D', ...shadow.glow(colors.travel) }]}>
                  <Row gap={10}>
                    <Avatar name={p.company ?? p.name} url={p.photo_url ?? p.avatar_url} size={44} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Row between><Text style={{ fontWeight: '900', color: colors.text, fontSize: 16 }}>{new Date(t.depart_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</Text><Text style={{ fontWeight: '900', color: colors.travel }}>{rupiah(t.seat_price)}<Text style={font.tiny}>/kursi</Text></Text></Row>
                      <Text style={font.tiny}>{new Date(t.depart_at).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })} · {p.company ?? p.name}</Text>
                      <Row gap={6} style={{ flexWrap: 'wrap', marginTop: 4 }}>
                        <Badge text={`${p.model} · ${p.plate}`} color={colors.textSecondary} />
                        {p.is_electric && <Badge text="⚡ Listrik" color={colors.success} />}
                        <Badge text={`${t.seats_left} kursi tersisa`} color={t.seats_left <= 2 ? colors.warning : colors.info} />
                        <Badge text={tripStatusLabel[t.status]} color={t.status === 'confirmed' ? colors.success : colors.textMuted} />
                      </Row>
                      <Text style={font.tiny}>⭐ {Number(p.rating).toFixed(1)} ({p.rating_count}) · {p.total_trips} trip{t.allow_private ? ` · private ${rupiah(t.private_price)}` : ''}</Text>
                    </View>
                  </Row>
                </PressableScale>
              );
            })}
          </View>
        ))}

        {trip && (
          <Animated.View entering={FadeInDown.duration(motion.base)} layout={LinearTransition.springify().stiffness(300).damping(22)} style={{ gap: 14 }}>
            <View style={s.group}>
              <Row gap={8}>
                <Chip label="Bersama (per kursi)" active={!priv} onPress={() => setPriv(false)} color={colors.travel} />
                {trip.allow_private && <Chip label={`Private 1 keluarga · ${rupiah(trip.private_price)}`} active={priv} onPress={() => setPriv(true)} color={colors.accent} />}
              </Row>
              <Row between>
                <View><Text style={{ fontWeight: '800', color: colors.text }}>Jumlah penumpang</Text><Text style={font.tiny}>{priv ? `Maks. ${trip.seats_total} orang (sekeluarga)` : `Kursi tersisa ${trip.seats_left}`}</Text></View>
                <Stepper value={pax} onChange={setPax} min={1} max={priv ? trip.seats_total : trip.seats_left} />
              </Row>
              <Input placeholder="Nama penumpang (pisahkan koma)" icon="people-outline" value={names} onChangeText={setNames} />
            </View>
            <LocationFields pickup={pickup} dropoff={null} pickupLabel="Jemput di (rumah/kantor)" dropoffLabel="—" lockDropoff accent={colors.travel} />
            <Input placeholder={`Alamat tujuan di ${toCity?.name ?? 'kota tujuan'} (diantar sampai alamat)`} icon="flag-outline" value={dropAddr} onChangeText={setDropAddr} />
            <View style={s.group}><PriceSummary rows={[{ label: priv ? `Carter private (${trip.partner.model})` : `${pax} kursi × ${rupiah(trip.seat_price)}`, value: price }, { label: 'Biaya layanan', value: fee }, { label: 'Diskon promo', value: discount, minus: true }]} total={total} /></View>
            <PaymentSection method={method} onMethod={setMethod} promo={promo} onPromo={setPromo} notes={notes} onNotes={setNotes} subtotal={price} service="ride_car" onDiscount={setDiscount} notesPlaceholder="Catatan untuk mitra travel (bawaan, jam jemput)" />
            <Text style={font.tiny}>Mobil berangkat bila minimal {trip.min_pax} penumpang terkumpul (kecuali private). Pembatalan gratis s.d. 3 jam sebelum berangkat. Penumpang dijemput di alamat masing-masing ±1 jam sebelum jadwal.</Text>
          </Animated.View>
        )}

        {bookings.length > 0 && !trip && (
          <View style={{ gap: 8 }}>
            <Text style={font.label}>Booking travel saya</Text>
            {bookings.slice(0, 5).map((b) => (
              <PressableScale key={b.id} onPress={() => router.push(`/travel/${b.id}` as never)} scaleTo={0.985} style={s.trip}>
                <Row between>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>{cityName(cities, b.trip.route.from_city)} → {cityName(cities, b.trip.route.to_city)}</Text>
                    <Text style={font.tiny}>{formatSchedule(b.trip.depart_at)} · {b.pax} pax{b.is_private ? ' · private' : ''} · {b.code}</Text>
                  </View>
                  <Badge text={travelStatusLabel[b.status]} color={b.status === 'completed' ? colors.success : b.status === 'cancelled' ? colors.danger : colors.travel} />
                </Row>
              </PressableScale>
            ))}
          </View>
        )}
        <Text style={[font.tiny, { textAlign: 'center' }]}>Dibuat {formatDate(new Date().toISOString(), false)} · harga acuan operator travel Sumatra 2026</Text>
      </View>
    </Screen>
  );
}
const s = StyleSheet.create({
  hero: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: glass.border },
  group: { gap: 10, backgroundColor: 'rgba(255,255,255,0.62)', borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: glass.border },
  day: { width: 58, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: glass.border, backgroundColor: 'rgba(255,255,255,0.8)' },
  trip: { padding: 12, borderRadius: radius.lg, borderWidth: 1.5, borderColor: glass.border, backgroundColor: 'rgba(255,255,255,0.7)' },
});
