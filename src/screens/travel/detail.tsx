// Detail booking travel pelanggan — status, mitra, jemput, batal, nilai
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Row, Badge, Button, Avatar, Stars, Loading, toast } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { CallButton } from '@/components/call/IncomingCall';
import { SosButton } from '@/components/Safety';
import { useCities } from '@/hooks/useTravel';
import { supabase, rpc } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import { rupiah, formatSchedule, paidViaLabel, travelStatusLabel, tripStatusLabel, cityName } from '@/lib/format';
import type { TravelBooking, TravelTrip, TravelRoute, TravelPartner, Profile } from '@/lib/types';

type Full = TravelBooking & { trip: TravelTrip & { route: TravelRoute; partner: TravelPartner & { profile: Profile } } };

export default function TravelBookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const cities = useCities();
  const [b, setB] = useState<Full | null | undefined>(undefined);
  const load = async () => { const { data } = await supabase.from('travel_bookings').select('*, trip:travel_trips(*, route:travel_routes(*), partner:travel_partners(*, profile:profiles(*)))').eq('id', id).maybeSingle(); setB((data as Full) ?? null); };
  useEffect(() => { load(); const ch = supabase.channel(`tbk:${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'travel_bookings', filter: `id=eq.${id}` }, load).on('postgres_changes', { event: '*', schema: 'public', table: 'travel_trips' }, load).subscribe(); return () => { supabase.removeChannel(ch); }; }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (b === undefined) return <Screen title="Booking travel" back><Loading /></Screen>;
  if (!b) return <Screen title="Booking travel" back><Text style={font.small}>Booking tidak ditemukan.</Text></Screen>;
  const t = b.trip; const p = t.partner;
  const canCancel = ['booked', 'confirmed'].includes(b.status) && new Date(t.depart_at).getTime() - Date.now() > 3 * 3600e3;
  const cancel = () => {
    const doIt = async () => { try { await rpc('travel_booking_cancel', { p_id: b.id, p_reason: 'Dibatalkan pelanggan' }); toast.show('Booking dibatalkan'); load(); } catch (e) { toast.error((e as Error).message); } };
    if (Platform.OS === 'web') { if (confirm('Batalkan booking travel ini?')) doIt(); return; }
    Alert.alert('Batalkan booking?', 'Dana dikembalikan ke AntarPay bila sudah dibayar.', [{ text: 'Tidak' }, { text: 'Ya, batalkan', style: 'destructive', onPress: doIt }]);
  };
  const rate = async (v: number) => { try { await rpc('travel_rate', { p_booking: b.id, p_stars: v }); toast.success('Terima kasih atas penilaian Anda'); load(); } catch (e) { toast.error((e as Error).message); } };
  const sc = b.status === 'completed' ? colors.success : b.status === 'cancelled' ? colors.danger : colors.travel;
  const active = ['booked', 'confirmed', 'picked_up'].includes(b.status);

  return (
    <Screen title={`Travel ${b.code}`} back maxWidth={640}>
      <View style={{ gap: 14 }}>
        <Entrance index={0}>
          <BrandGradient colors={[colors.travel, '#1E3A8A']} style={[s.hero, shadow.glow(colors.travel)]}>
            <Row between><Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{cityName(cities, t.route.from_city)} → {cityName(cities, t.route.to_city)}</Text><Badge text={travelStatusLabel[b.status]} color="#fff" bg="rgba(255,255,255,0.2)" /></Row>
            <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>Berangkat {formatSchedule(t.depart_at)} · {b.pax} penumpang{b.is_private ? ' · private 1 keluarga' : ''}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>Status mobil: {tripStatusLabel[t.status]} · {t.seats_booked}/{t.seats_total} kursi terisi{t.status === 'open' ? ` (min. ${t.min_pax} agar berangkat)` : ''}</Text>
          </BrandGradient>
        </Entrance>
        <Entrance index={1}><Card style={{ gap: 10 }}>
          <Row gap={12}>
            <Avatar name={p.company_name ?? p.profile?.full_name} url={p.photo_url ?? p.profile?.avatar_url} size={50} />
            <View style={{ flex: 1 }}><Text style={font.h3}>{p.company_name ?? p.profile?.full_name}</Text><Text style={font.small}>{p.vehicle_model} · {p.vehicle_plate}{p.is_electric ? ' · ⚡ listrik' : ''} · ⭐ {Number(p.rating_avg).toFixed(1)}</Text></View>
            {active && p.profile && <CallButton peer={{ id: p.id, name: p.company_name ?? p.profile.full_name, role: 'driver' }} size={40} color={colors.travel} />}
          </Row>
          <Row gap={8} style={[s.line, { backgroundColor: colors.primary + '10' }]}><Ionicons name="home" size={16} color={colors.primary} /><Text style={[font.small, { flex: 1 }]}>Jemput: {b.pickup_address}</Text></Row>
          {b.dropoff_address && <Row gap={8} style={[s.line, { backgroundColor: colors.danger + '10' }]}><Ionicons name="flag" size={16} color={colors.danger} /><Text style={[font.small, { flex: 1 }]}>Tujuan: {b.dropoff_address}</Text></Row>}
          {b.passengers?.length > 0 && <Text style={font.tiny}>Penumpang: {b.passengers.map((x) => x.name).join(', ')}</Text>}
          {active && <Row gap={10} style={{ marginTop: 4 }}><SosButton compact /><Text style={[font.tiny, { flex: 1 }]}>Tombol SOS & nomor tersamar aktif selama perjalanan. Mitra akan menghubungi Anda ±1 jam sebelum jemput.</Text></Row>}
        </Card></Entrance>
        <Entrance index={2}><Card style={{ gap: 6 }}>
          <Row between><Text style={font.small}>{b.is_private ? 'Carter private' : `${b.pax} kursi`}</Text><Text style={font.body}>{rupiah(b.price - b.platform_fee)}</Text></Row>
          <Row between><Text style={font.small}>Biaya layanan</Text><Text style={font.body}>{rupiah(b.platform_fee)}</Text></Row>
          <Row between><Text style={font.h3}>Total</Text><Text style={[font.h3, { color: sc }]}>{rupiah(b.price)}</Text></Row>
          <Text style={font.tiny}>Pembayaran {paidViaLabel(b.paid_via)} · {b.payment_status === 'paid' ? 'Lunas' : b.payment_status === 'refunded' ? 'Dikembalikan' : 'Bayar tunai ke mitra saat dijemput'}</Text>
        </Card></Entrance>
        {b.status === 'completed' && <Entrance index={3}><Card><Row between><Text style={font.h3}>Nilai perjalanan</Text><Stars value={b.rating ?? 0} size={24} onChange={b.rating ? undefined : rate} /></Row></Card></Entrance>}
        {canCancel && <Button title="Batalkan booking" variant="outline" color={colors.danger} onPress={cancel} />}
        <Button title="Ada kendala? Hubungi CS" variant="ghost" color={colors.textSecondary} icon="help-circle-outline" onPress={() => router.push({ pathname: '/support/new', params: { category: 'order', subject: `Travel ${b.code}` } } as never)} />
      </View>
    </Screen>
  );
}
const s = StyleSheet.create({ hero: { borderRadius: radius.xl, padding: 16, overflow: 'hidden' }, line: { padding: 10, borderRadius: radius.md } });
