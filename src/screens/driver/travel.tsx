// Dasbor Mitra AntarTravel — buat jadwal, lihat manifest penumpang & alamat jemput, berangkat/tiba, pendapatan
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Screen, Card, Row, Badge, Button, Chip, Input, Avatar, Empty, toast } from '@/components/ui';
import { Entrance, PressableScale } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { CallButton } from '@/components/call/IncomingCall';
import { useCities, usePartnerTrips } from '@/hooks/useTravel';
import { useAuth } from '@/store/auth';
import { supabase, rpc } from '@/lib/supabase';
import { colors, font, radius, glass, shadow, motion } from '@/lib/theme';
import { rupiah, formatSchedule, cityName, tripStatusLabel, travelStatusLabel } from '@/lib/format';
import type { TravelPartner, TravelRoute, TravelManifestRow, TravelTrip } from '@/lib/types';

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const TIMES = ['05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '13:00', '15:00', '17:00', '19:00', '21:00', '23:00'];

export default function TravelPartnerHome() {
  const router = useRouter();
  const { session, wallet } = useAuth();
  const uid = session?.user.id;
  const cities = useCities();
  const [me, setMe] = useState<TravelPartner | null | undefined>(undefined);
  const [routes, setRoutes] = useState<TravelRoute[]>([]);
  const { trips, reload } = usePartnerTrips(uid);
  const [creating, setCreating] = useState(false);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [day, setDay] = useState(1); const [time, setTime] = useState('08:00');
  const [allowPrivate, setAllowPrivate] = useState(true);
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Record<string, TravelManifestRow[]>>({});

  useEffect(() => { if (uid) supabase.from('travel_partners').select('*').eq('id', uid).maybeSingle().then(({ data }) => setMe((data as TravelPartner) ?? null)); }, [uid]);
  useEffect(() => { supabase.from('travel_routes').select('*').eq('active', true).then(({ data }) => setRoutes((data as TravelRoute[]) ?? [])); }, []);
  const loadManifest = async (tripId: string) => { const m = await rpc<TravelManifestRow[]>('travel_trip_manifest', { p_trip: tripId }); setManifest((p) => ({ ...p, [tripId]: m })); };
  useEffect(() => { if (open) loadManifest(open); }, [open, trips]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => Array.from({ length: 10 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); return d; }), []);
  const create = async () => {
    if (!routeId) return toast.error('Pilih rute');
    const d = new Date(days[day]); const [h, m] = time.split(':').map(Number); d.setHours(h, m, 0, 0);
    setCreating(true);
    try { await rpc('travel_trip_create', { p: { route_id: routeId, depart_at: d.toISOString(), allow_private: allowPrivate, notes: notes || null } }); toast.success('Jadwal dibuat'); setNotes(''); reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setCreating(false); }
  };
  const setStatus = (t: TravelTrip, st: 'departed' | 'arrived' | 'cancelled') => {
    const msg = st === 'departed' ? 'Tandai berangkat? Pastikan semua penumpang sudah dijemput.' : st === 'arrived' ? 'Tandai tiba? Pendapatan akan masuk ke AntarPay.' : 'Batalkan jadwal? Penumpang akan di-refund & diberi tahu.';
    const doIt = async () => { try { await rpc('travel_trip_set_status', { p_trip: t.id, p_status: st, p_note: st === 'cancelled' ? 'Dibatalkan mitra travel' : null }); toast.success('Status diperbarui'); reload(); } catch (e) { toast.error((e as Error).message); } };
    if (Platform.OS === 'web') { if (confirm(msg)) doIt(); return; }
    Alert.alert('Konfirmasi', msg, [{ text: 'Batal' }, { text: 'Ya', onPress: doIt }]);
  };

  if (me === undefined) return <Screen title="Mitra Travel" back><Text style={font.small}>Memuat…</Text></Screen>;
  if (!me) return <Screen title="Mitra Travel" back><Empty icon="bus-outline" title="Belum terdaftar" subtitle="Daftar sebagai mitra AntarTravel dengan mobil kapasitas besar." action={<Button title="Daftar Mitra Travel" color={colors.travel} onPress={() => router.push('/account/become-travel' as never)} />} /></Screen>;
  if (me.status !== 'approved') return <Screen title="Mitra Travel" back><Empty icon="hourglass-outline" title={me.status === 'pending' ? 'Menunggu verifikasi admin' : 'Akun mitra ' + me.status} subtitle={me.status_reason ?? 'Data Anda sedang diperiksa.'} action={<Button title="Lihat / ubah data" variant="secondary" onPress={() => router.push('/account/become-travel' as never)} />} /></Screen>;

  const upcoming = trips.filter((t) => ['open', 'confirmed', 'full', 'departed'].includes(t.status));
  const past = trips.filter((t) => ['arrived', 'cancelled'].includes(t.status));
  const earnings = past.filter((t) => t.status === 'arrived').length;

  return (
    <Screen title="Mitra AntarTravel" back maxWidth={720}>
      <View style={{ gap: 14 }}>
        <Entrance index={0}><BrandGradient colors={[colors.travel, '#1E3A8A']} style={[s.hero, shadow.glow(colors.travel)]}>
          <Row between>
            <View><Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' }}>{me.company_name ?? 'MITRA TRAVEL'}</Text><Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{me.vehicle_model} · {me.vehicle_plate}</Text><Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{me.seats} kursi{me.is_electric ? ' · ⚡ listrik' : ''} · ⭐ {Number(me.rating_avg).toFixed(1)} · {me.total_trips} trip selesai</Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>Saldo AntarPay</Text><Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{rupiah(wallet?.balance ?? 0)}</Text></View>
          </Row>
        </BrandGradient></Entrance>

        <Entrance index={1}><Card style={{ gap: 10 }}>
          <Text style={font.label}>Buat jadwal keberangkatan</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {routes.map((r) => <Chip key={r.id} label={`${cityName(cities, r.from_city)} → ${cityName(cities, r.to_city)} · ${rupiah(r.seat_price)}`} active={routeId === r.id} onPress={() => setRouteId(r.id)} color={colors.travel} />)}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d, i) => <Pressable key={i} onPress={() => setDay(i)} style={[s.day, day === i && { backgroundColor: colors.travel, borderColor: colors.travel }]}><Text style={{ fontSize: 12, fontWeight: '700', color: day === i ? '#fff' : colors.textMuted }}>{i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : DAY_NAMES[d.getDay()]}</Text><Text style={{ fontSize: 18, fontWeight: '800', color: day === i ? '#fff' : colors.text }}>{d.getDate()}</Text></Pressable>)}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{TIMES.map((t) => <Chip key={t} label={t} active={time === t} onPress={() => setTime(t)} color={colors.travel} />)}</ScrollView>
          <Row gap={8}><Chip label={allowPrivate ? '✓ Terima carter private' : 'Tanpa carter private'} active={allowPrivate} onPress={() => setAllowPrivate(!allowPrivate)} color={colors.accent} /></Row>
          <Input placeholder="Catatan (mis. berangkat dari pool, bagasi maks. 1 koper)" value={notes} onChangeText={setNotes} />
          <Button title="Buat jadwal" color={colors.travel} icon="add-circle-outline" loading={creating} onPress={create} />
        </Card></Entrance>

        <Text style={font.label}>Jadwal aktif ({upcoming.length})</Text>
        {upcoming.length === 0 && <Text style={font.small}>Belum ada jadwal. Buat jadwal di atas agar tampil di pencarian pelanggan.</Text>}
        {upcoming.map((t) => (
          <Animated.View key={t.id} layout={LinearTransition.springify().stiffness(300).damping(22)} style={s.trip}>
            <PressableScale onPress={() => setOpen(open === t.id ? null : t.id)} scaleTo={0.99} haptic={false}>
              <Row between>
                <View style={{ flex: 1 }}>
                  <Text style={font.h3}>{cityName(cities, t.route.from_city)} → {cityName(cities, t.route.to_city)}</Text>
                  <Text style={font.small}>{formatSchedule(t.depart_at)}</Text>
                  <Row gap={6} style={{ marginTop: 4, flexWrap: 'wrap' }}>
                    <Badge text={tripStatusLabel[t.status]} color={t.status === 'confirmed' || t.status === 'full' ? colors.success : t.status === 'departed' ? colors.info : colors.warning} />
                    <Badge text={`${t.seats_booked}/${t.seats_total} kursi`} color={colors.travel} />
                    {t.is_private && <Badge text="Private" color={colors.accent} />}
                    {t.status === 'open' && t.seats_booked < t.min_pax && <Text style={font.tiny}>butuh {t.min_pax - t.seats_booked} lagi agar pasti berangkat</Text>}
                  </Row>
                </View>
                <Ionicons name={open === t.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </Row>
            </PressableScale>
            {open === t.id && (
              <Animated.View entering={FadeInDown.duration(motion.base)} style={{ gap: 8, marginTop: 10 }}>
                <Text style={font.label}>Manifest penumpang & alamat jemput</Text>
                {(manifest[t.id] ?? []).length === 0 && <Text style={font.tiny}>Belum ada penumpang.</Text>}
                {(manifest[t.id] ?? []).map((b) => (
                  <View key={b.id} style={s.pax}>
                    <Row gap={10}>
                      <Avatar name={b.customer.name} url={b.customer.avatar_url} size={36} />
                      <View style={{ flex: 1 }}>
                        <Row between><Text style={{ fontWeight: '800', color: colors.text }}>{b.customer.name} · {b.pax} pax{b.is_private ? ' (private)' : ''}</Text><Badge text={travelStatusLabel[b.status]} color={colors.travel} /></Row>
                        <Text style={font.tiny}>{b.code} · {b.payment_method === 'cash' ? `Tunai ${rupiah(b.price)} (tagih saat jemput)` : 'Dibayar AntarPay'}{b.passengers?.length ? ` · ${b.passengers.map((x) => x.name).join(', ')}` : ''}</Text>
                        <Text style={font.small}>📍 {b.pickup_address}</Text>
                        {b.dropoff_address && <Text style={font.tiny}>🏁 {b.dropoff_address}</Text>}
                      </View>
                    </Row>
                    <Row gap={6} style={{ marginTop: 6 }}>
                      {b.pickup_lat && <Button size="sm" variant="outline" color={colors.info} icon="navigate" title="Navigasi" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${b.pickup_lat},${b.pickup_lng}`)} />}
                      <CallButton peer={{ id: b.customer.id, name: b.customer.name, role: 'customer' }} size={36} color={colors.travel} label="Telepon" />
                    </Row>
                  </View>
                ))}
                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  {t.status !== 'departed' && <Button size="sm" title="Berangkat" color={colors.success} icon="play" onPress={() => setStatus(t, 'departed')} />}
                  {t.status === 'departed' && <Button size="sm" title="Tiba di tujuan" color={colors.success} icon="flag" onPress={() => setStatus(t, 'arrived')} />}
                  {t.status !== 'departed' && <Button size="sm" title="Batalkan jadwal" variant="outline" color={colors.danger} onPress={() => setStatus(t, 'cancelled')} />}
                </Row>
              </Animated.View>
            )}
          </Animated.View>
        ))}
        {past.length > 0 && <Text style={font.label}>Riwayat ({past.length}) · {earnings} trip selesai</Text>}
        {past.slice(0, 10).map((t) => (
          <View key={t.id} style={[s.trip, { opacity: 0.8 }]}>
            <Row between><Text style={font.small}>{cityName(cities, t.route.from_city)} → {cityName(cities, t.route.to_city)} · {formatSchedule(t.depart_at)}</Text><Badge text={tripStatusLabel[t.status]} color={t.status === 'arrived' ? colors.success : colors.textMuted} /></Row>
          </View>
        ))}
      </View>
    </Screen>
  );
}
const s = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 16, overflow: 'hidden' },
  day: { width: 58, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: glass.border, backgroundColor: 'rgba(255,255,255,0.8)' },
  trip: { padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: glass.border, backgroundColor: 'rgba(255,255,255,0.92)' },
  pax: { padding: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: glass.border },
});
