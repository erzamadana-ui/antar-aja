// Detail permintaan carter privat / sopir harian — ringkasan, penawaran mitra, terima & bayar, batal, rating
import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Row, Badge, Button, Avatar, Stars, Input, Loading, Empty, toast } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { CallButton } from '@/components/call/IncomingCall';
import { handleShortfall } from '@/components/BookingSheet';
import { useTravelRequest } from '@/hooks/useTravel';
import { useAuth } from '@/store/auth';
import { usePayPrefs } from '@/store/payprefs';
import { rpc } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import { rupiah, formatSchedule, travelRequestStatusLabel, travelKindLabel, accommodationLabel, paidViaLabel } from '@/lib/format';
import type { TravelOffer, TravelRequest } from '@/lib/types';

const statusColor = (st: TravelRequest['status']) => st === 'completed' ? colors.success : st === 'cancelled' || st === 'expired' ? colors.danger : st === 'offered' ? colors.accent : colors.travel;
const confirmAsk = (title: string, msg: string, onYes: () => void, yes = 'Ya') => {
  if (Platform.OS === 'web') { if (confirm(`${title}\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Tidak' }, { text: yes, style: 'destructive', onPress: onYes }]);
};

export default function TravelRequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refreshWallet } = useAuth();
  const payPrefs = usePayPrefs((st) => st.prefs);
  const { request: r, reload } = useTravelRequest(id);
  const [busyOffer, setBusyOffer] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(false);

  if (r === undefined) return <Screen title="Permintaan travel" band={colors.travel} back><Loading /></Screen>;
  if (!r) return <Screen title="Permintaan travel" band={colors.travel} back><Empty icon="alert-circle-outline" title="Permintaan tidak ditemukan" subtitle="Mungkin sudah dihapus atau Anda tidak memiliki akses." /></Screen>;

  const offers = (r.offers ?? []).filter((o) => o.status !== 'withdrawn');
  const accepted = offers.find((o) => o.id === r.accepted_offer_id) ?? offers.find((o) => o.status === 'accepted') ?? null;
  const canAccept = r.status === 'open' || r.status === 'offered';
  const canCancel = ['open', 'offered', 'accepted', 'paid'].includes(r.status);
  const isActive = ['accepted', 'paid', 'ongoing'].includes(r.status);
  const hoursLeft = (new Date(r.depart_at).getTime() - Date.now()) / 3600e3;
  const fullRefund = hoursLeft >= 12;
  const nights = Math.max(0, r.days - 1);

  const accept = (o: TravelOffer) => {
    const doIt = async () => {
      setBusyOffer(o.id);
      try {
        await rpc('travel_offer_accept', { p_offer: o.id });
        await refreshWallet();
        toast.success(r.payment_method === 'cash' ? 'Penawaran diterima — bayar tunai ke sopir' : `Penawaran diterima, ${rupiah(o.price)} dipotong dari AntarPay`);
        reload();
      } catch (e) { if (!handleShortfall(e, router, payPrefs?.ewallet)) toast.error((e as Error).message); }
      finally { setBusyOffer(null); }
    };
    confirmAsk('Terima penawaran?', `${rupiah(o.price)} dari ${o.partner?.company_name ?? o.partner?.name ?? 'mitra'}. ${r.payment_method === 'cash' ? 'Anda membayar tunai ke sopir saat berangkat.' : 'Saldo AntarPay dipotong sekarang dan diteruskan ke mitra setelah perjalanan selesai.'}`, doIt, 'Terima');
  };
  const cancel = async () => {
    try {
      await rpc('travel_request_set_status', { p_request: r.id, p_status: 'cancelled', p_note: cancelNote || 'Dibatalkan pelanggan' });
      await refreshWallet(); toast.show('Permintaan dibatalkan'); setShowCancel(false); reload();
    } catch (e) { toast.error((e as Error).message); }
  };
  const rate = async () => {
    if (!stars) return toast.error('Pilih jumlah bintang');
    setRating(true);
    try { await rpc('travel_request_rate', { p_request: r.id, p_rating: stars, p_comment: comment || null }); toast.success('Terima kasih atas penilaian Anda'); reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setRating(false); }
  };

  const partnerPeer = accepted?.partner ? { id: accepted.partner.id, name: accepted.partner.company_name ?? accepted.partner.name, role: 'driver' as const } : null;

  return (
    <Screen title={`Permintaan ${r.code}`} subtitle={travelKindLabel[r.kind]} band={colors.travel} back maxWidth={640}>
      <View style={{ gap: 14 }}>
        <Entrance index={0}>
          <BrandGradient colors={[colors.travel, '#1E3A8A']} style={[s.hero, shadow.glow(colors.travel)]}>
            <Row between>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', flex: 1 }} numberOfLines={2}>{r.kind === 'daily' ? `Sopir harian · ${r.days} hari` : 'Carter privat'}</Text>
              <Badge text={travelRequestStatusLabel[r.status]} color="#fff" bg="rgba(255,255,255,0.2)" />
            </Row>
            <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>Berangkat {formatSchedule(r.depart_at)}{r.return_at ? ` · kembali ${formatSchedule(r.return_at)}` : ''}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>{r.pax} penumpang{r.luggage ? ` · bagasi ${r.luggage}` : ''}{r.vehicle_pref ? ` · ${r.vehicle_pref}` : ''}{r.price > 0 ? ` · ${rupiah(r.price)} (${paidViaLabel(r.paid_via)})` : ''}</Text>
          </BrandGradient>
        </Entrance>

        <Entrance index={1}><Card style={{ gap: 8 }}>
          <Row gap={8} style={[s.line, { backgroundColor: colors.primary + '10' }]}><Ionicons name="home" size={16} color={colors.primary} /><Text style={[font.small, { flex: 1 }]}>Jemput: {r.pickup_address}{r.from_city_name ? ` (${r.from_city_name})` : ''}</Text></Row>
          <Row gap={8} style={[s.line, { backgroundColor: colors.danger + '10' }]}><Ionicons name="flag" size={16} color={colors.danger} /><Text style={[font.small, { flex: 1 }]}>{r.kind === 'daily' ? 'Rute' : 'Tujuan'}: {r.dropoff_address ?? 'Keliling / ditentukan bersama sopir'}{r.to_city_name ? ` (${r.to_city_name})` : ''}</Text></Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Badge text={accommodationLabel[r.accommodation]} color={r.accommodation === 'self' ? colors.accent : colors.info} />
            <Badge text={r.fuel === 'partner' ? 'BBM/tol/parkir termasuk' : 'BBM/tol/parkir ditanggung pelanggan'} color={colors.textSecondary} />
            {r.budget ? <Badge text={`Anggaran ${rupiah(r.budget)}`} color={colors.textMuted} /> : null}
          </Row>
          {r.notes ? <Text style={font.tiny}>Catatan: {r.notes}</Text> : null}
        </Card></Entrance>

        {accepted && (
          <Entrance index={2}><Card style={{ gap: 10, borderColor: colors.travel, borderWidth: 1.5 }}>
            <Text style={font.label}>Mitra Anda</Text>
            <Row gap={12}>
              <Avatar name={accepted.partner?.company_name ?? accepted.partner?.name} url={accepted.partner?.photo_url ?? accepted.partner?.avatar_url} size={50} />
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{accepted.partner?.company_name ?? accepted.partner?.name}</Text>
                <Text style={font.small}>{accepted.partner?.driver_name ? `Sopir ${accepted.partner.driver_name} · ` : ''}{accepted.partner?.vehicle_model}{accepted.partner?.vehicle_plate ? ` · ${accepted.partner.vehicle_plate}` : ''}</Text>
                <Text style={font.tiny}>Rating {Number(accepted.partner?.rating_avg ?? 0).toFixed(1)} · {accepted.partner?.total_trips ?? 0} trip · {rupiah(accepted.price)}</Text>
              </View>
              {isActive && partnerPeer && <CallButton peer={partnerPeer} size={40} color={colors.travel} />}
            </Row>
            {isActive && partnerPeer && <Row gap={8}><CallButton peer={partnerPeer} size={36} color={colors.travel} label="Telepon sopir" /><Text style={[font.tiny, { flex: 1 }]}>Nomor tersamar, telepon lewat aplikasi. Sopir menghubungi Anda ±1 jam sebelum jemput.</Text></Row>}
            {r.status === 'accepted' && r.payment_method === 'cash' && <Text style={font.tiny}>Bayar tunai {rupiah(r.price)} ke sopir saat berangkat.</Text>}
          </Card></Entrance>
        )}

        {!accepted && (
          <View style={{ gap: 8 }}>
            <Text style={font.label}>Penawaran mitra ({offers.length})</Text>
            {offers.length === 0 && <Card><Text style={font.small}>{canAccept ? 'Belum ada penawaran. Mitra yang cocok akan mengirim harga; Anda akan diberi tahu lewat notifikasi.' : 'Tidak ada penawaran.'}</Text></Card>}
            {offers.map((o, i) => {
              const b = o.breakdown ?? {}; const p = o.partner;
              return (
                <Entrance key={o.id} index={Math.min(i + 2, 6)}><Card style={{ gap: 8 }}>
                  <Row gap={10}>
                    <Avatar name={p?.company_name ?? p?.name} url={p?.photo_url ?? p?.avatar_url} size={44} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontWeight: '800', color: colors.text }} numberOfLines={1}>{p?.company_name ?? p?.name ?? 'Mitra travel'}</Text>
                      <Text style={font.tiny}>{p?.partner_type === 'agency' ? 'Agen travel' : 'Mobil pribadi'} · {p?.vehicle_model}{p?.vehicle_year ? ` ${p.vehicle_year}` : ''} · {p?.seats} kursi{p?.is_electric ? ' · listrik' : ''}</Text>
                      <Text style={font.tiny}>Rating {Number(p?.rating_avg ?? 0).toFixed(1)} ({p?.rating_count ?? 0}) · {p?.total_trips ?? 0} trip</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}><Text style={{ fontWeight: '800', color: colors.travel, fontSize: 18 }}>{rupiah(o.price)}</Text><Badge text={o.status === 'rejected' ? 'Ditolak' : 'Penawaran'} color={o.status === 'rejected' ? colors.danger : colors.accent} /></View>
                  </Row>
                  {(b.daily_rate || b.accommodation_fee || b.fuel_est) ? (
                    <View style={s.breakdown}>
                      {b.daily_rate ? <Row between><Text style={font.tiny}>{rupiah(b.daily_rate)}/hari × {b.days ?? r.days} hari</Text><Text style={font.tiny}>{rupiah(b.daily_rate * (b.days ?? r.days))}</Text></Row> : null}
                      {b.accommodation_fee && b.accommodation_nights ? <Row between><Text style={font.tiny}>Akomodasi mandiri {rupiah(b.accommodation_fee)} × {b.accommodation_nights} malam</Text><Text style={font.tiny}>{rupiah(b.accommodation_fee * b.accommodation_nights)}</Text></Row> : null}
                      {b.fuel_est ? <Row between><Text style={font.tiny}>Estimasi BBM/tol/parkir</Text><Text style={font.tiny}>{rupiah(b.fuel_est)}</Text></Row> : null}
                      {b.overtime_rate ? <Row between><Text style={font.tiny}>Overtime di luar 12 jam</Text><Text style={font.tiny}>{rupiah(b.overtime_rate)}/jam</Text></Row> : null}
                      {b.notes ? <Text style={font.tiny}>{b.notes}</Text> : null}
                    </View>
                  ) : null}
                  {o.message ? <Text style={font.small}>“{o.message}”</Text> : null}
                  {canAccept && o.status === 'offered' && <Button title={`Terima & bayar ${rupiah(o.price)}`} color={colors.travel} icon="checkmark-circle-outline" loading={busyOffer === o.id} onPress={() => accept(o)} />}
                </Card></Entrance>
              );
            })}
          </View>
        )}

        {r.status === 'completed' && (
          <Entrance index={3}><Card style={{ gap: 10 }}>
            {r.rating ? (
              <>
                <Text style={font.label}>Penilaian Anda</Text>
                <Stars value={r.rating} size={22} />
                {r.rating_comment ? <Text style={font.small}>{r.rating_comment}</Text> : null}
              </>
            ) : (
              <>
                <Text style={font.label}>Bagaimana perjalanan Anda?</Text>
                <Stars value={stars} size={30} onChange={setStars} />
                <Input placeholder="Komentar untuk mitra (opsional)" value={comment} onChangeText={setComment} multiline />
                <Button title="Kirim penilaian" color={colors.travel} icon="star-outline" loading={rating} onPress={rate} />
              </>
            )}
          </Card></Entrance>
        )}

        {canCancel && (
          <Entrance index={4}><Card style={{ gap: 10 }}>
            {!showCancel ? (
              <Button title="Batalkan permintaan" variant="outline" color={colors.danger} icon="close-circle-outline" onPress={() => setShowCancel(true)} />
            ) : (
              <>
                <Text style={font.label}>Batalkan permintaan?</Text>
                <Text style={font.small}>{r.payment_status === 'paid' ? (fullRefund ? `Dana ${rupiah(r.price)} dikembalikan penuh ke AntarPay karena masih ≥12 jam sebelum berangkat.` : `Kurang dari 12 jam sebelum berangkat: dikembalikan 70% (${rupiah(Math.round(r.price * 0.7))}), sisanya kompensasi mitra.`) : 'Belum ada dana ditahan. Refund penuh bila dibatalkan ≥12 jam sebelum berangkat, 70% jika kurang dari itu (setelah pembayaran).'}</Text>
                <Input placeholder="Alasan pembatalan (opsional)" value={cancelNote} onChangeText={setCancelNote} />
                <Row gap={8}><Button title="Kembali" variant="secondary" style={{ flex: 1 }} onPress={() => setShowCancel(false)} /><Button title="Ya, batalkan" variant="danger" style={{ flex: 1 }} onPress={() => confirmAsk('Konfirmasi', 'Permintaan akan dibatalkan.', cancel, 'Batalkan')} /></Row>
              </>
            )}
          </Card></Entrance>
        )}
        <Text style={[font.tiny, { textAlign: 'center' }]}>Dana AntarPay ditahan platform dan diteruskan ke mitra setelah perjalanan selesai. Overtime dibayar langsung ke sopir sesuai tarif penawaran.</Text>
      </View>
    </Screen>
  );
}
const s = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 16, overflow: 'hidden' },
  line: { padding: 10, borderRadius: radius.md },
  breakdown: { gap: 4, padding: 10, borderRadius: radius.md, backgroundColor: colors.bg },
});
