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
import { rupiah, formatSchedule, cityName, tripStatusLabel, travelStatusLabel, travelKindLabel, travelRequestStatusLabel, accommodationLabel } from '@/lib/format';
import type { TravelPartner, TravelRoute, TravelManifestRow, TravelTrip, TravelOpenRequest } from '@/lib/types';

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const TIMES = ['05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '13:00', '15:00', '17:00', '19:00', '21:00', '23:00'];

export default function TravelPartnerHome() {
  const router = useRouter();
  const { session, wallet, travelPartner } = useAuth();
  const uid = session?.user.id;
  const [tab, setTab] = useState<'shared' | 'requests'>('shared');
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

  useEffect(() => { if (uid) supabase.from('travel_partners').select('*').eq('id', uid).maybeSingle().then(({ data }) => setMe((data as TravelPartner) ?? travelPartner ?? null)); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
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
    <Screen title="Mitra AntarTravel" subtitle="Kursi bersama · carter · sopir harian" band={colors.travel} back maxWidth={720}>
      <View style={{ gap: 14 }}>
        <Entrance index={0}><BrandGradient colors={[colors.travel, '#1E3A8A']} style={[s.hero, shadow.glow(colors.travel)]}>
          <Row between>
            <View><Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' }}>{me.company_name ?? 'MITRA TRAVEL'}</Text><Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{me.vehicle_model} · {me.vehicle_plate}</Text><Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{me.seats} kursi{me.is_electric ? ' · ⚡ listrik' : ''} · ⭐ {Number(me.rating_avg).toFixed(1)} · {me.total_trips} trip selesai</Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>Saldo AntarPay</Text><Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{rupiah(wallet?.balance ?? 0)}</Text></View>
          </Row>
        </BrandGradient></Entrance>

        <View style={s.segment}>
          {([['shared', 'Kursi bersama', 'people-outline'], ['requests', 'Carter & sopir harian', 'car-outline']] as const).map(([k, l]) => {
            const active = tab === k;
            return (
              <PressableScale key={k} onPress={() => setTab(k)} scaleTo={0.96} style={[s.segItem, active && { backgroundColor: colors.travel, ...shadow.glow(colors.travel) }]}>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: active ? '#fff' : colors.textSecondary, textAlign: 'center' }} numberOfLines={1}>{l}</Text>
              </PressableScale>
            );
          })}
        </View>

        {tab === 'requests' ? <RequestsTab me={travelPartner ?? me} /> : (
          <>
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
          </>
        )}
      </View>
    </Screen>
  );
}

// ---------- Permintaan carter privat & sopir harian (penawaran mitra) ----------
const reqStatusColor = (st: TravelOpenRequest['status']) => st === 'completed' ? colors.success : st === 'cancelled' || st === 'expired' ? colors.danger : st === 'ongoing' ? colors.info : st === 'offered' ? colors.accent : colors.travel;
const num = (v: string) => Number(v.replace(/\D/g, '')) || 0;

function RequestsTab({ me }: { me: TravelPartner | null }) {
  const [rows, setRows] = useState<TravelOpenRequest[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = async () => { try { setRows(await rpc<TravelOpenRequest[]>('travel_partner_open_requests')); } catch (e) { setRows([]); toast.error((e as Error).message); } };
  useEffect(() => {
    load();
    const ch = supabase.channel('tp-open-requests').on('postgres_changes', { event: '*', schema: 'public', table: 'travel_requests' }, load).on('postgres_changes', { event: '*', schema: 'public', table: 'travel_offers' }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  if (rows === null) return <Text style={font.small}>Memuat permintaan…</Text>;
  const mine = rows.filter((r) => ['accepted', 'paid', 'ongoing'].includes(r.status));
  const openReqs = rows.filter((r) => ['open', 'offered'].includes(r.status));
  const done = rows.filter((r) => ['completed', 'cancelled', 'expired'].includes(r.status));
  // fungsi render biasa (bukan komponen) agar state form penawaran tidak hilang saat data di-refresh
  const section = (title: string, list: TravelOpenRequest[], hint?: string) => (
    <View style={{ gap: 8 }}>
      <Text style={font.label}>{title} ({list.length})</Text>
      {list.length === 0 && hint && <Text style={font.small}>{hint}</Text>}
      {list.map((r) => <RequestCard key={r.id} r={r} me={me} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onDone={load} />)}
    </View>
  );
  return (
    <View style={{ gap: 14 }}>
      {!me?.offers_charter && !me?.offers_daily && <Card><Text style={font.small}>Anda belum menandai layanan carter privat / sopir harian di data mitra. Perbarui di menu Akun → Mitra AntarTravel agar permintaan yang cocok tampil di sini.</Text></Card>}
      {section('Perjalanan Anda', mine, 'Belum ada permintaan yang diterima pelanggan.')}
      {section('Permintaan terbuka', openReqs, 'Belum ada permintaan carter/harian di sekitar Anda. Permintaan baru muncul otomatis.')}
      {done.length > 0 && section('Riwayat', done.slice(0, 10))}
    </View>
  );
}

function RequestCard({ r, me, open, onToggle, onDone }: { r: TravelOpenRequest; me: TravelPartner | null; open: boolean; onToggle: () => void; onDone: () => void }) {
  const nights = Math.max(0, r.days - 1);
  const selfAcc = r.accommodation === 'self';
  const [rate, setRate] = useState(String(me?.daily_rate ?? ''));
  const [accFee, setAccFee] = useState(String(me?.accommodation_fee || 150000));
  const [fuelEst, setFuelEst] = useState('');
  const [overtime, setOvertime] = useState(String(me?.overtime_rate ?? ''));
  const [price, setPrice] = useState('');
  const [manual, setManual] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const calc = num(rate) * r.days + (selfAcc ? num(accFee) * nights : 0) + (r.fuel === 'partner' ? num(fuelEst) : 0);
  const total = manual ? num(price) : calc;
  const active = ['accepted', 'paid', 'ongoing'].includes(r.status);
  const canOffer = ['open', 'offered'].includes(r.status) && !r.my_offer;

  const send = async () => {
    if (total <= 0) return toast.error('Isi harga penawaran');
    setBusy(true);
    try {
      const breakdown = { daily_rate: num(rate) || undefined, days: r.days, accommodation_nights: selfAcc ? nights : 0, accommodation_fee: selfAcc ? num(accFee) : 0, fuel_est: r.fuel === 'partner' ? num(fuelEst) : 0, overtime_rate: num(overtime) || undefined };
      await rpc('travel_offer_create', { p_request: r.id, p_price: total, p_breakdown: breakdown, p_message: message || null });
      toast.success('Penawaran terkirim'); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const setSt = (st: 'ongoing' | 'completed') => {
    const msg = st === 'ongoing' ? 'Mulai perjalanan? Pastikan penumpang sudah dijemput.' : 'Tandai selesai? Pendapatan akan diteruskan ke AntarPay Anda.';
    const doIt = async () => { try { await rpc('travel_request_set_status', { p_request: r.id, p_status: st, p_note: null }); toast.success('Status diperbarui'); onDone(); } catch (e) { toast.error((e as Error).message); } };
    if (Platform.OS === 'web') { if (confirm(msg)) doIt(); return; }
    Alert.alert('Konfirmasi', msg, [{ text: 'Batal' }, { text: 'Ya', onPress: doIt }]);
  };

  return (
    <Animated.View layout={LinearTransition.springify().stiffness(300).damping(22)} style={[s.trip, active && { borderColor: colors.travel }]}>
      <PressableScale onPress={onToggle} scaleTo={0.99} haptic={false}>
        <Row between>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={font.h3} numberOfLines={1}>{travelKindLabel[r.kind]} · {r.customer_name}</Text>
            <Text style={font.small} numberOfLines={1}>{r.pickup_address} → {r.dropoff_address ?? (r.kind === 'daily' ? 'keliling / rute bebas' : '—')}</Text>
            <Text style={font.tiny}>{formatSchedule(r.depart_at)}{r.return_at ? ` · kembali ${formatSchedule(r.return_at)}` : ''} · {r.days} hari · {r.pax} pax</Text>
            <Row gap={6} style={{ marginTop: 4, flexWrap: 'wrap' }}>
              <Badge text={travelRequestStatusLabel[r.status]} color={reqStatusColor(r.status)} />
              <Badge text={selfAcc ? 'Akomodasi mandiri' : 'Akomodasi ditanggung pelanggan'} color={selfAcc ? colors.accent : colors.info} />
              <Badge text={r.fuel === 'partner' ? 'BBM termasuk harga' : 'BBM ditanggung pelanggan'} color={colors.textSecondary} />
              {r.budget ? <Badge text={`Anggaran ${rupiah(r.budget)}`} color={colors.textMuted} /> : null}
              <Badge text={`${r.offers_count} penawaran`} color={colors.travel} />
              {r.my_offer && <Badge text={`Tawaran Anda ${rupiah(r.my_offer.price)}`} color={r.my_offer.status === 'accepted' ? colors.success : r.my_offer.status === 'rejected' ? colors.danger : colors.accent} />}
            </Row>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Row>
      </PressableScale>
      {open && (
        <Animated.View entering={FadeInDown.duration(motion.base)} style={{ gap: 10, marginTop: 10 }}>
          {r.luggage || r.vehicle_pref || r.notes ? <Text style={font.tiny}>{[r.luggage ? `Bagasi ${r.luggage}` : null, r.vehicle_pref ? `Mobil ${r.vehicle_pref}` : null, r.notes ? `Catatan: ${r.notes}` : null].filter(Boolean).join(' · ')}</Text> : null}
          <Text style={font.tiny}>{accommodationLabel[r.accommodation]}{selfAcc && nights > 0 ? ` — masukkan kompensasi ${nights} malam ke harga.` : ''}{r.fuel === 'customer' ? ' BBM/tol/parkir dibayar pelanggan langsung, jangan masukkan ke harga.' : ' Masukkan estimasi BBM/tol/parkir ke harga (all-in).'}</Text>

          {active && (
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {r.status !== 'ongoing' && <Button size="sm" title="Mulai perjalanan" color={colors.success} icon="play" onPress={() => setSt('ongoing')} />}
              {r.status === 'ongoing' && <Button size="sm" title="Selesai" color={colors.success} icon="flag" onPress={() => setSt('completed')} />}
              {r.my_offer && <Text style={font.tiny}>Harga disepakati {rupiah(r.my_offer.price)}{r.status === 'accepted' ? ' · tagih tunai saat berangkat' : ' · dibayar AntarPay'}</Text>}
            </Row>
          )}

          {canOffer && (
            <View style={{ gap: 8 }}>
              <Text style={font.label}>Kalkulator penawaran</Text>
              <Row gap={8}>
                <Input label="Harga/hari (12 jam)" keyboardType="number-pad" value={rate} onChangeText={(v) => setRate(v.replace(/\D/g, ''))} containerStyle={{ flex: 1 }} />
                <Input label="Overtime/jam" keyboardType="number-pad" value={overtime} onChangeText={(v) => setOvertime(v.replace(/\D/g, ''))} containerStyle={{ flex: 1 }} />
              </Row>
              {selfAcc && nights > 0 && <Input label={`Akomodasi mandiri per malam (× ${nights} malam)`} keyboardType="number-pad" value={accFee} onChangeText={(v) => setAccFee(v.replace(/\D/g, ''))} />}
              {r.fuel === 'partner' && <Input label="Estimasi BBM/tol/parkir" keyboardType="number-pad" value={fuelEst} onChangeText={(v) => setFuelEst(v.replace(/\D/g, ''))} />}
              <View style={s.calc}>
                <Row between><Text style={font.tiny}>{rupiah(num(rate))} × {r.days} hari</Text><Text style={font.tiny}>{rupiah(num(rate) * r.days)}</Text></Row>
                {selfAcc && nights > 0 && <Row between><Text style={font.tiny}>Akomodasi {rupiah(num(accFee))} × {nights} malam</Text><Text style={font.tiny}>{rupiah(num(accFee) * nights)}</Text></Row>}
                {r.fuel === 'partner' && <Row between><Text style={font.tiny}>Estimasi BBM/tol/parkir</Text><Text style={font.tiny}>{rupiah(num(fuelEst))}</Text></Row>}
                <Row between><Text style={{ fontWeight: '800', color: colors.text }}>Total penawaran</Text><Text style={{ fontWeight: '800', color: colors.travel, fontSize: 16 }}>{rupiah(total)}</Text></Row>
              </View>
              <Row gap={8}><Chip label="Pakai kalkulator" active={!manual} onPress={() => setManual(false)} color={colors.travel} /><Chip label="Harga total manual" active={manual} onPress={() => setManual(true)} color={colors.travel} /></Row>
              {manual && <Input label="Harga total" keyboardType="number-pad" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} />}
              <Input placeholder="Pesan untuk pelanggan (mobil, sopir, syarat)" value={message} onChangeText={setMessage} />
              <Button title={`Kirim penawaran ${rupiah(total)}`} color={colors.travel} icon="paper-plane-outline" loading={busy} onPress={send} />
              <Text style={font.tiny}>Komisi platform dipotong dari harga setelah perjalanan selesai. Pelanggan bebas memilih penawaran.</Text>
            </View>
          )}
          {r.my_offer && !active && <Text style={font.small}>Tawaran Anda {rupiah(r.my_offer.price)} · {r.my_offer.status === 'offered' ? 'menunggu keputusan pelanggan' : r.my_offer.status}</Text>}
        </Animated.View>
      )}
    </Animated.View>
  );
}
const s = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 16, overflow: 'hidden' },
  day: { width: 58, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: glass.border, backgroundColor: 'rgba(255,255,255,0.8)' },
  trip: { padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: glass.border, backgroundColor: 'rgba(255,255,255,0.92)' },
  pax: { padding: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: glass.border },
  segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: glass.border, ...shadow.soft },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: radius.sm },
  calc: { gap: 4, padding: 10, borderRadius: radius.md, backgroundColor: colors.bg },
});
