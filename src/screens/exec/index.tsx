// Portal Eksekutif — login kedua (PIN) untuk level VP / CEO / CFO / pemegang saham; laporan manajemen & investor
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Screen, Card, Row, Badge, Button, Chip, Empty, IconCircle, toast } from '@/components/ui';
import { Entrance, useShake } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { StatCard, TrendChart, CITY_COLORS } from '@/components/admin';
import { BrandLogo } from '@/components/Logo';
import { useAuth } from '@/store/auth';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font, radius, shadow, glass, motion } from '@/lib/theme';
import { rupiah, serviceLabel, shortMonth, execLevelLabel, formatDate } from '@/lib/format';
import type { ExecAccess, ExecReport, ReportRun, Recommendation } from '@/lib/types';

const PRIO: Record<Recommendation['priority'], { color: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  high: { color: colors.danger, label: 'Prioritas tinggi', icon: 'alert-circle' }, med: { color: colors.accent, label: 'Prioritas sedang', icon: 'warning' }, low: { color: colors.primary, label: 'Prioritas rendah', icon: 'information-circle' },
};
const pct = (n?: number | null) => `${(Number(n) || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

let SESSION: { token: string; level: string; expires_at: string } | null = null;   // hanya di memori (tidak disimpan di perangkat)

export default function ExecPortal() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const [access, setAccess] = useState<ExecAccess | null | undefined>(undefined);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [sess, setSess] = useState(SESSION);
  const [months, setMonths] = useState(6);
  const [report, setReport] = useState<ExecReport | null>(null);
  const [runs, setRuns] = useState<ReportRun[] | null>(null);
  const { style: shake, shake: doShake } = useShake();

  useEffect(() => { if (session) supabase.from('exec_access').select('user_id, level, active, last_login_at').eq('user_id', session.user.id).maybeSingle().then(({ data }) => setAccess((data as ExecAccess) ?? null)); }, [session]);
  useEffect(() => {
    if (!sess) return;
    rpc<ExecReport>('exec_report', { p_token: sess.token, p_months: months }).then(setReport).catch((e) => { if (String((e as Error).message).includes('EXEC_SESSION')) { SESSION = null; setSess(null); toast.error('Sesi eksekutif berakhir, masuk lagi'); } else toast.error((e as Error).message); });
  }, [sess, months]);
  useEffect(() => { if (sess) rpc<ReportRun[]>('report_runs_list', { p_limit: 10 }).then((r) => setRuns(r ?? [])).catch(() => setRuns([])); }, [sess]);

  const login = async () => {
    if (pin.length < 6) return doShake();
    setBusy(true);
    try { const r = await rpc<{ token: string; level: string; expires_at: string }>('exec_login', { p_pin: pin }); SESSION = r; setSess(r); setPin(''); toast.success(`Selamat datang, ${execLevelLabel[r.level] ?? r.level}`); }
    catch (e) { doShake(); toast.error((e as Error).message); setPin(''); } finally { setBusy(false); }
  };
  const logout = () => { SESSION = null; setSess(null); setReport(null); };
  const exportCsv = () => {
    if (!report || typeof document === 'undefined') return;
    const rows = [['Bulan', 'GMV', 'Pesanan', 'Selesai', 'Pendapatan platform', 'Promo', 'Payout driver', 'Top up', 'Penarikan', 'Pengguna baru', 'Driver baru'], ...report.monthly.map((m) => [m.month, m.gmv, m.orders, m.completed, m.revenue, m.promo ?? 0, m.driver_payout ?? 0, m.topups ?? 0, m.withdrawals ?? 0, m.new_users, m.new_drivers])];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `laporan-eksekutif-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  if (!session) return <Screen title="Portal Eksekutif" back><Empty icon="lock-closed-outline" title="Masuk dulu" subtitle="Portal eksekutif memerlukan akun AntarKita + PIN eksekutif." action={<Button title="Masuk" onPress={() => router.replace('/login' as never)} />} /></Screen>;
  if (access === undefined) return <Screen title="Portal Eksekutif" back><Text style={font.small}>Memeriksa akses…</Text></Screen>;
  if (!access || !access.active) return <Screen title="Portal Eksekutif" back><Empty icon="shield-outline" title="Akses terbatas" subtitle="Halaman ini hanya untuk level Vice President ke atas dan pemegang saham. Minta admin memberi akses eksekutif pada akun Anda." action={<Button title="Kembali" variant="secondary" onPress={() => router.back()} />} /></Screen>;

  if (!sess) return (
    <Screen title="Portal Eksekutif" back>
      <Entrance index={0}>
        <Animated.View style={[s.login, shake]}>
          <BrandLogo size={64} />
          <Text style={[font.h2, { marginTop: 10 }]}>Verifikasi kedua</Text>
          <Text style={[font.small, { textAlign: 'center' }]}>{profile?.full_name} · {execLevelLabel[access.level]}. Masukkan PIN eksekutif (6 digit) — bukan kata sandi akun.</Text>
          <TextInput value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus style={s.pin} placeholder="••••••" placeholderTextColor={colors.textMuted} onSubmitEditing={login} />
          <Button title="Masuk portal" size="lg" color="#0B1F2A" loading={busy} disabled={pin.length < 6} onPress={login} style={{ alignSelf: 'stretch' }} />
          <Text style={font.tiny}>Sesi berlaku 30 menit. Setiap percobaan login dicatat di log keamanan.{access.last_login_at ? ` Login terakhir ${formatDate(access.last_login_at)}.` : ''}</Text>
        </Animated.View>
      </Entrance>
    </Screen>
  );

  const r = report;
  const growth = r && r.prev_gmv > 0 ? Math.round(((r.summary.gmv - r.prev_gmv) / r.prev_gmv) * 100) : null;
  const takeRate = r && r.summary.gmv > 0 ? (r.summary.revenue / r.summary.gmv) * 100 : 0;
  return (
    <Screen title="Laporan Eksekutif" back maxWidth={1100} right={<Row gap={6} style={{ marginRight: 8 }}><Button size="sm" variant="ghost" title="Keluar portal" icon="lock-closed-outline" onPress={logout} /></Row>}>
      <View style={{ gap: 16 }}>
        <BrandGradient colors={['#0B1F2A', '#1F3A4A']} style={[s.hero, shadow.card]}>
          <Row between style={{ flexWrap: 'wrap', gap: 8 }}>
            <View><Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>LAPORAN MANAJEMEN & PEMEGANG SAHAM · {execLevelLabel[sess.level].toUpperCase()}</Text><Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>AntarKita — {months} bulan terakhir</Text><Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Dibuat {r ? formatDate(r.generated_at) : '…'} · sesi s.d. {new Date(sess.expires_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</Text></View>
            <Row gap={6}>{[3, 6, 12].map((m) => <Chip key={m} label={`${m} bln`} active={months === m} onPress={() => setMonths(m)} color={colors.accent} />)}{Platform.OS === 'web' && <Button size="sm" title="CSV" icon="download-outline" color="#fff" variant="glass" onPress={exportCsv} />}</Row>
          </Row>
        </BrandGradient>
        {!r ? <Text style={font.small}>Menyusun laporan…</Text> : (
          <Animated.View entering={FadeInDown.duration(motion.base)} style={{ gap: 16 }}>
            <Row gap={12} style={{ flexWrap: 'wrap' }}>
              <StatCard index={0} label="GMV (transaksi selesai)" value={rupiah(r.summary.gmv)} hint={growth != null ? `${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth)}% vs periode sebelumnya` : 'periode sebelumnya belum ada'} color={growth != null && growth < 0 ? colors.danger : colors.success} />
              <StatCard index={1} label="Pendapatan platform" value={rupiah(r.summary.revenue)} hint={`take rate ${takeRate.toFixed(1)}%`} color={colors.accent} />
              <StatCard index={2} label="Pesanan" value={r.summary.orders} hint={`${r.summary.completed} selesai · ${r.summary.cancelled} batal (${r.quality.cancel_rate}%)`} color={colors.primary} />
              <StatCard index={3} label="Rata-rata nilai pesanan" value={rupiah(r.summary.avg_ticket)} color={colors.info} />
              <StatCard index={4} label="Pelanggan bertransaksi" value={r.summary.customers} hint={`${r.summary.cities} kota`} color={colors.ride} />
              <StatCard index={5} label="Payout mitra" value={rupiah(r.summary.driver_payout + r.summary.merchant_payout)} hint={`driver ${rupiah(r.summary.driver_payout)} · merchant ${rupiah(r.summary.merchant_payout)}`} color={colors.food} />
            </Row>
            {r.finance ? (<>
              <Text style={[font.h3, { marginTop: 4 }]}>Keuangan</Text>
              <Row gap={12} style={{ flexWrap: 'wrap' }}>
                <StatCard index={0} label="Take rate" value={pct(r.finance.take_rate_pct)} hint="pendapatan platform / GMV" color={colors.accent} />
                <StatCard index={1} label="Pendapatan bersih" value={rupiah(r.finance.net_revenue)} hint="setelah promo & biaya gateway" color={r.finance.net_revenue >= 0 ? colors.success : colors.danger} />
                <StatCard index={2} label="Margin kontribusi" value={pct(r.finance.contribution_margin_pct)} hint="pendapatan bersih / GMV" color={r.finance.contribution_margin_pct >= 10 ? colors.success : colors.warning} />
                <StatCard index={3} label="Promo" value={pct(r.finance.promo_pct_gmv)} hint={`${rupiah(r.finance.promo_discount)} dari GMV`} color={r.finance.promo_pct_gmv > 5 ? colors.danger : colors.info} />
                <StatCard index={4} label="Pesanan tunai" value={pct(r.finance.cash_orders_pct)} hint="dari pesanan selesai" color={colors.primary} />
                <StatCard index={5} label="Liabilitas saldo" value={rupiah(r.finance.wallet_liability)} hint="saldo AntarPay pengguna (utang ke pengguna)" color={colors.ride} />
                <StatCard index={6} label="Piutang saldo minus" value={rupiah(r.finance.receivable_negative)} hint="saldo minus mitra (order tunai)" color={r.finance.receivable_negative > 1000000 ? colors.danger : colors.warning} />
                <StatCard index={7} label="Top up via gateway" value={rupiah(r.finance.topups_gateway)} hint={`estimasi biaya gateway ${rupiah(r.finance.gateway_fee_est)} (${pct(r.finance.gateway_fee_pct)})`} color={colors.shop} />
                <StatCard index={8} label="Penarikan tertunda" value={rupiah(r.finance.withdrawals_pending)} hint={`top up tertunda ${rupiah(r.finance.topups_pending)}`} color={colors.food} />
              </Row>
              <Card padded={false}>
                <View style={{ padding: 14 }}><Text style={font.label}>Laba rugi bulanan (P&L)</Text><Text style={font.tiny}>Pendapatan = biaya layanan + komisi; payout driver termasuk porsi jasa belanja; top up & penarikan = arus kas dompet.</Text></View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={{ minWidth: 820 }}>
                  <Row gap={8} style={s.th}>{['Bulan', 'GMV', 'Pendapatan', 'Promo', 'Payout driver', 'Top up', 'Penarikan'].map((h, i) => <Text key={h} style={[font.label, { width: i === 0 ? 90 : 120, textAlign: i === 0 ? 'left' : 'right' }]}>{h}</Text>)}</Row>
                  {r.monthly.map((m) => <Row key={m.month} gap={8} style={s.tr}><Text style={{ width: 90, fontWeight: '700' }}>{shortMonth(m.month)}</Text><Text style={s.num2}>{rupiah(m.gmv)}</Text><Text style={[s.num2, { color: colors.success, fontWeight: '700' }]}>{rupiah(m.revenue)}</Text><Text style={[s.num2, { color: colors.danger }]}>{rupiah(m.promo ?? 0)}</Text><Text style={s.num2}>{rupiah(m.driver_payout ?? 0)}</Text><Text style={s.num2}>{rupiah(m.topups ?? 0)}</Text><Text style={s.num2}>{rupiah(m.withdrawals ?? 0)}</Text></Row>)}
                  <Row gap={8} style={[s.tr, { backgroundColor: 'rgba(11,31,42,0.03)' }]}><Text style={{ width: 90, fontWeight: '800' }}>Total</Text><Text style={[s.num2, { fontWeight: '800' }]}>{rupiah(r.finance.gmv)}</Text><Text style={[s.num2, { color: colors.success, fontWeight: '800' }]}>{rupiah(r.finance.revenue)}</Text><Text style={[s.num2, { color: colors.danger, fontWeight: '800' }]}>{rupiah(r.finance.promo_discount)}</Text><Text style={[s.num2, { fontWeight: '800' }]}>{rupiah(r.summary.driver_payout)}</Text><Text style={[s.num2, { fontWeight: '800' }]}>{rupiah(r.finance.topups)}</Text><Text style={[s.num2, { fontWeight: '800' }]}>{rupiah(r.finance.withdrawals)}</Text></Row>
                </View></ScrollView>
              </Card>
            </>) : null}

            {r.recommendations && r.recommendations.length > 0 ? (<>
              <Text style={[font.h3, { marginTop: 4 }]}>Rekomendasi</Text>
              <Row gap={12} style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
                {r.recommendations.map((rc, i) => <RecoCard key={i} rc={rc} index={i} />)}
              </Row>
            </>) : null}

            <Card>
              <Text style={font.label}>Tren bulanan — GMV vs pendapatan platform</Text>
              <View style={{ marginTop: 10 }}><TrendChart months={r.monthly.map((m) => m.month)} series={[{ label: 'GMV (ribu Rp)', values: r.monthly.map((m) => Math.round(m.gmv / 1000)), color: colors.success }, { label: 'Pendapatan (ribu Rp)', values: r.monthly.map((m) => Math.round(m.revenue / 1000)), color: colors.accent }]} /></View>
              <View style={{ marginTop: 10 }}><TrendChart months={r.monthly.map((m) => m.month)} series={[{ label: 'Pesanan', values: r.monthly.map((m) => m.orders), color: colors.primary }, { label: 'Pengguna baru', values: r.monthly.map((m) => m.new_users), color: colors.info }, { label: 'Driver baru', values: r.monthly.map((m) => m.new_drivers), color: colors.ride }]} height={150} /></View>
            </Card>
            <Row gap={16} style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
              <Card style={{ flex: 1, minWidth: 280, gap: 8 }}>
                <Text style={font.label}>Per layanan</Text>
                {r.by_service.map((x, i) => <Row key={x.service} between><Row gap={6}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: CITY_COLORS[i % CITY_COLORS.length] }} /><Text style={font.small}>{serviceLabel[x.service as keyof typeof serviceLabel] ?? x.service}</Text></Row><Text style={font.tiny}>{x.orders} pesanan · {rupiah(x.gmv)}{x.revenue != null ? ` · pendapatan ${rupiah(x.revenue)}` : ''}</Text></Row>)}
              </Card>
              <Card style={{ flex: 1, minWidth: 280, gap: 8 }}>
                <Text style={font.label}>Per kota</Text>
                {r.by_city.map((x) => <Row key={x.city} between><Text style={font.small}>{x.city}</Text><Text style={font.tiny}>{x.orders} pesanan · {x.customers} pelanggan · {rupiah(x.gmv)}</Text></Row>)}
              </Card>
              <Card style={{ flex: 1, minWidth: 280, gap: 8 }}>
                <Text style={font.label}>Merchant teratas</Text>
                {r.top_merchants.length === 0 && <Text style={font.tiny}>Belum ada.</Text>}
                {r.top_merchants.map((x, i) => <Row key={x.name} between><Text style={font.small}>{i + 1}. {x.name}</Text><Text style={font.tiny}>{x.orders} · {rupiah(x.gmv)}</Text></Row>)}
              </Card>
            </Row>
            <Row gap={16} style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
              <Card style={{ flex: 1, minWidth: 280, gap: 6 }}>
                <Text style={font.label}>Pasokan & likuiditas</Text>
                <KV k="Driver aktif / online" v={`${r.supply.drivers_total} / ${r.supply.drivers_online}`} /><KV k="Driver menunggu verifikasi" v={String(r.supply.drivers_pending)} />
                <KV k="Merchant aktif / menunggu" v={`${r.supply.merchants_total} / ${r.supply.merchants_pending}`} /><KV k="Pengguna aktif" v={String(r.supply.users_total)} />
                {r.supply.vendors_total != null ? <KV k="Pedagang pasar aktif / menunggu" v={`${r.supply.vendors_total} / ${r.supply.vendors_pending ?? 0}`} /> : null}{r.supply.travel_partners != null ? <KV k="Mitra travel aktif" v={String(r.supply.travel_partners)} /> : null}
                <KV k="Saldo AntarPay pengguna (float)" v={rupiah(r.supply.wallet_float)} /><KV k="Saldo minus driver (piutang)" v={rupiah(r.supply.wallet_negative)} danger={r.supply.wallet_negative < 0} />
              </Card>
              <Card style={{ flex: 1, minWidth: 280, gap: 6 }}>
                <Text style={font.label}>Kualitas layanan</Text>
                <KV k="Tingkat pembatalan" v={`${r.quality.cancel_rate}%`} danger={r.quality.cancel_rate > 15} /><KV k="Rating driver rata-rata" v={r.quality.avg_driver_rating != null ? `${r.quality.avg_driver_rating} / 5` : '—'} />
                <KV k="Tiket CS (periode) / terbuka" v={`${r.quality.tickets} / ${r.quality.tickets_open}`} /><KV k="Respons pertama CS" v={r.quality.avg_first_response_min != null ? `${r.quality.avg_first_response_min} menit` : '—'} />
                <KV k="Kepuasan CS" v={r.quality.cs_rating != null ? `${r.quality.cs_rating} / 5` : '—'} /><KV k="Insiden SOS" v={String(r.quality.sos)} danger={r.quality.sos > 0} />
              </Card>
            </Row>
            {r.automation || r.fraud ? (<>
              <Text style={[font.h3, { marginTop: 4 }]}>Otomasi & keamanan</Text>
              <Row gap={16} style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
                {r.automation ? <Card style={{ flex: 1, minWidth: 280, gap: 6 }}>
                  <Text style={font.label}>Otomasi (periode)</Text>
                  <KV k="Mitra diverifikasi otomatis" v={String(r.automation.auto_verified)} /><KV k="Pencairan otomatis" v={String(r.automation.auto_payouts)} />
                  <KV k="Usulan tempat dari pelanggan" v={String(r.automation.place_suggestions)} /><KV k="Tempat aktif otomatis" v={String(r.automation.place_auto_approved)} />
                </Card> : null}
                {r.fraud ? <Card style={{ flex: 1, minWidth: 280, gap: 6 }}>
                  <Text style={font.label}>Anti-fraud (saat ini)</Text>
                  <KV k="Flag terbuka" v={String(r.fraud.open)} danger={r.fraud.open > 0} /><KV k="Prioritas tinggi" v={String(r.fraud.open_high)} danger={r.fraud.open_high > 0} /><KV k="Akun ditangguhkan otomatis" v={String(r.fraud.auto_suspended)} danger={r.fraud.auto_suspended > 0} />
                  <Text style={font.tiny}>Peninjauan flag dilakukan admin di Panel Admin → Pusat Keamanan.</Text>
                </Card> : null}
              </Row>
            </>) : null}

            <Text style={[font.h3, { marginTop: 4 }]}>Laporan otomatis</Text>
            {runs === null ? <Text style={font.small}>Memuat arsip laporan…</Text> : runs.length === 0 ? <Card><Empty icon="document-text-outline" title="Belum ada laporan terjadwal" subtitle="Admin dapat menambah jadwal laporan di Panel Admin → Otomasi." /></Card> : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
                {runs.map((x) => { const top = x.recommendations?.[0]; const pc = top ? PRIO[top.priority] ?? PRIO.low : null; return (
                  <Card key={x.id} style={{ width: 300, gap: 6 }}>
                    <Row between><Badge text={x.period} color={colors.info} /><Text style={font.tiny}>{formatDate(x.created_at, false)}</Text></Row>
                    <Text style={[font.body, { fontWeight: '800' }]} numberOfLines={1}>{x.name}</Text>
                    <KV k="GMV" v={rupiah(Number(x.summary?.gmv) || 0)} /><KV k="Pendapatan" v={rupiah(Number(x.finance?.revenue ?? x.summary?.revenue) || 0)} /><KV k="Take rate" v={pct(x.finance?.take_rate_pct)} />
                    {top && pc ? <Row gap={6} style={{ alignItems: 'flex-start', marginTop: 4 }}><Ionicons name={pc.icon} size={14} color={pc.color} style={{ marginTop: 1 }} /><Text style={[font.tiny, { flex: 1, color: pc.color, fontWeight: '700' }]} numberOfLines={2}>{top.title}</Text></Row> : null}
                  </Card>); })}
              </ScrollView>
            )}

            <Card padded={false}>
              <View style={{ padding: 14 }}><Text style={font.label}>Rincian bulanan</Text></View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={{ minWidth: 720 }}>
                <Row gap={8} style={s.th}>{['Bulan', 'GMV', 'Pesanan', 'Selesai', 'Pendapatan', 'Pengguna baru', 'Driver baru'].map((h, i) => <Text key={h} style={[font.label, { width: i === 0 ? 90 : 105, textAlign: i === 0 ? 'left' : 'right' }]}>{h}</Text>)}</Row>
                {r.monthly.map((m) => <Row key={m.month} gap={8} style={s.tr}><Text style={{ width: 90, fontWeight: '700' }}>{shortMonth(m.month)}</Text><Text style={s.num}>{rupiah(m.gmv)}</Text><Text style={s.num}>{m.orders}</Text><Text style={s.num}>{m.completed}</Text><Text style={s.num}>{rupiah(m.revenue)}</Text><Text style={s.num}>{m.new_users}</Text><Text style={s.num}>{m.new_drivers}</Text></Row>)}
              </View></ScrollView>
            </Card>
            <Text style={[font.tiny, { textAlign: 'center' }]}>Keterbatasan data: GMV = total pesanan berstatus selesai; pendapatan platform = biaya layanan + komisi driver + komisi merchant (belum dikurangi biaya operasional, promo/diskon dicatat sebagai pengurang GMV). Data travel & tiket CS dihitung terpisah dari pesanan.</Text>
          </Animated.View>
        )}
      </View>
    </Screen>
  );
}
function RecoCard({ rc, index }: { rc: Recommendation; index: number }) {
  const p = PRIO[rc.priority] ?? PRIO.low;
  return (
    <Entrance index={index} style={{ flex: 1, minWidth: 280 }}>
      <View style={[s.reco, { borderColor: p.color + '55', backgroundColor: p.color + '0F' }]}>
        <Row gap={10} style={{ alignItems: 'flex-start' }}>
          <IconCircle name={p.icon} color={p.color} size={36} />
          <View style={{ flex: 1, gap: 4 }}>
            <Row gap={6} style={{ flexWrap: 'wrap' }}><Badge text={p.label} color={p.color} /><Badge text={rc.area} color={colors.textSecondary} /></Row>
            <Text style={[font.body, { fontWeight: '800', color: colors.text }]}>{rc.title}</Text>
            <Text style={font.small}>{rc.detail}</Text>
            <Row gap={6} style={{ alignItems: 'flex-start', marginTop: 2 }}><Ionicons name="arrow-forward-circle" size={16} color={p.color} style={{ marginTop: 1 }} /><Text style={[font.small, { flex: 1, color: colors.text, fontWeight: '600' }]}>{rc.action}</Text></Row>
          </View>
        </Row>
      </View>
    </Entrance>
  );
}
function KV({ k, v, danger }: { k: string; v: string; danger?: boolean }) { return <Row between><Text style={font.small}>{k}</Text><Text style={{ fontWeight: '800', color: danger ? colors.danger : colors.text }}>{v}</Text></Row>; }
const s = StyleSheet.create({
  login: { alignItems: 'center', gap: 12, padding: 24, borderRadius: radius.xl, backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: glass.border, maxWidth: 420, alignSelf: 'center', width: '100%' },
  pin: { fontSize: 30, fontWeight: '800', letterSpacing: 14, textAlign: 'center', color: colors.text, borderBottomWidth: 2, borderBottomColor: '#0B1F2A', paddingVertical: 8, width: 220 },
  hero: { borderRadius: radius.xl, padding: 18, overflow: 'hidden' },
  th: { paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: 'rgba(11,31,42,0.03)' },
  tr: { paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  num: { width: 105, textAlign: 'right', color: colors.text, fontSize: 13 },
  num2: { width: 120, textAlign: 'right', color: colors.text, fontSize: 13 },
  reco: { flex: 1, padding: 14, borderRadius: radius.xl, borderWidth: 1 },
});
