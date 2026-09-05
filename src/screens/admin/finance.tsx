import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, Platform } from 'react-native';
import { AdminPage, Table, FilterBar } from '@/components/admin';
import { Row, Badge, Button, toast, Card } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { rpc, supabase } from '@/lib/supabase';
import { signedUrl } from '@/lib/upload';
import { adminExportCsv } from '@/lib/csv';
import { handleAdminError, useAdminSecurity } from '@/store/adminSecurity';
import { colors, font } from '@/lib/theme';
import { formatDate, rupiah } from '@/lib/format';
import type { Profile, TopupRequest, WithdrawalRequest } from '@/lib/types';

type T = TopupRequest & { user?: Profile | null };
type W = WithdrawalRequest & { user?: Profile | null; auto?: boolean; bank_verified?: boolean };
const sc = { pending: colors.warning, approved: colors.success, rejected: colors.danger };
const sl: Record<string, string> = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };

export default function AdminFinance() {
  const [topups, setTopups] = useState<T[]>([]);
  const [wds, setWds] = useState<W[]>([]);
  const [filter, setFilter] = useState('pending');
  const load = useCallback(async () => {
    const [{ data: t }, { data: w }] = await Promise.all([
      supabase.from('topup_requests').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('withdrawal_requests').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    const ts = (t as TopupRequest[]) ?? [], ws = (w as WithdrawalRequest[]) ?? [];
    const ids = Array.from(new Set([...ts, ...ws].map((x) => x.user_id)));
    const [{ data: profiles }, { data: banks }] = ids.length ? await Promise.all([supabase.from('profiles').select('*').in('id', ids), supabase.from('bank_accounts').select('user_id,verified').in('user_id', ids)]) : [{ data: [] }, { data: [] }];
    const pm = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));
    const bv = new Map(((banks as { user_id: string; verified: boolean }[]) ?? []).map((b) => [b.user_id, b.verified]));
    setTopups(ts.map((x) => ({ ...x, user: pm.get(x.user_id) }))); setWds(ws.map((x) => ({ ...x, user: pm.get(x.user_id), bank_verified: bv.get(x.user_id) ?? false })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const reviewTopup = async (id: string, ok: boolean) => { try { await rpc('admin_review_topup', { p_id: id, p_approve: ok, p_note: ok ? 'Transfer diverifikasi' : 'Bukti tidak valid' }); toast.success(ok ? 'Top up disetujui, saldo ditambahkan' : 'Top up ditolak'); load(); } catch (e) { toast.error((e as Error).message); } };
  const reviewWd = async (id: string, ok: boolean) => {
    if (!(await useAdminSecurity.getState().ensureUnlocked())) return;
    try { await rpc('admin_review_withdrawal', { p_id: id, p_approve: ok, p_note: ok ? 'Dana sudah ditransfer' : 'Data rekening tidak valid' }); toast.success(ok ? 'Penarikan disetujui (pastikan dana sudah ditransfer) · rekening ditandai terverifikasi' : 'Penarikan ditolak, saldo dikembalikan'); load(); } catch (e) { handleAdminError(e); }
  };
  const setBankVerified = async (userId: string, verified: boolean) => { try { await rpc('admin_set_bank_verified', { p_user: userId, p_verified: verified }); toast.success(verified ? 'Rekening ditandai terverifikasi (pencairan otomatis aktif)' : 'Verifikasi rekening dicabut'); load(); } catch (e) { toast.error((e as Error).message); } };
  const exportCsv = () => {
    const day = new Date().toISOString().slice(0, 10);
    const rows: unknown[][] = [
      ...f(topups).map((x) => ['topup', x.id, x.user?.full_name ?? '', x.user?.email ?? '', x.amount, x.status, '', x.created_at, x.review_note ?? '']),
      ...f(wds).map((x) => ['withdrawal', x.id, x.user?.full_name ?? '', x.user?.email ?? '', x.amount, x.status, `${x.bank_name} ${x.bank_account} a.n. ${x.account_name}`, x.created_at, x.review_note ?? '']),
    ];
    return adminExportCsv('finance', `keuangan-${filter}-${day}.csv`, ['Jenis', 'ID', 'Pengguna', 'Email', 'Nominal', 'Status', 'Rekening', 'Waktu', 'Catatan'], rows);
  };
  const openProof = async (path: string | null) => { if (!path) return toast.error('Tidak ada bukti'); const u = await signedUrl('proofs', path); if (u) Linking.openURL(u); };
  const f = <X extends { status: string }>(xs: X[]) => xs.filter((x) => filter === 'all' || x.status === filter);

  return (
    <AdminPage title="Keuangan" subtitle="Verifikasi top up & penarikan saldo · persetujuan penarikan butuh PIN panel" onRefresh={load} right={Platform.OS === 'web' ? <Button size="sm" title="Ekspor CSV" icon="download-outline" variant="secondary" onPress={exportCsv} /> : undefined}>
      <FilterBar value={filter} onChange={setFilter} options={[{ key: 'pending', label: 'Menunggu' }, { key: 'approved', label: 'Disetujui' }, { key: 'rejected', label: 'Ditolak' }, { key: 'all', label: 'Semua' }]} />
      <Entrance index={0}>
        <Card style={{ padding: 0 }} padded={false}>
          <Text style={[font.h3, { padding: 14 }]}>Top up ({f(topups).length})</Text>
          <Table rows={f(topups) as unknown as Record<string, unknown>[]} columns={[
            { key: 'user', label: 'Pengguna', width: 200, render: (r) => { const x = r as unknown as T; return <View><Text style={{ fontWeight: '700' }}>{x.user?.full_name}</Text><Text style={font.tiny}>{x.user?.email}</Text></View>; } },
            { key: 'amount', label: 'Nominal', width: 120, render: (r) => <Text style={{ fontWeight: '800' }}>{rupiah(Number(r.amount))}</Text> },
            { key: 'note', label: 'Catatan / bukti', width: 220, render: (r) => { const x = r as unknown as T; return <View><Text style={font.tiny}>{x.sender_note ?? '-'}</Text>{x.proof_url ? <Pressable onPress={() => openProof(x.proof_url)}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Lihat bukti transfer</Text></Pressable> : <Text style={[font.tiny, { color: colors.danger }]}>Tanpa bukti</Text>}</View>; } },
            { key: 'created_at', label: 'Waktu', width: 140, render: (r) => <Text style={font.tiny}>{formatDate(String(r.created_at))}</Text> },
            { key: 'status', label: 'Status', width: 110, render: (r) => <Badge text={sl[String(r.status)] ?? String(r.status)} color={sc[r.status as keyof typeof sc]} /> },
            { key: 'actions', label: 'Aksi', width: 180, render: (r) => r.status === 'pending' ? <Row gap={6}><Button size="sm" title="Setujui" color={colors.success} onPress={() => reviewTopup(String(r.id), true)} /><Button size="sm" title="Tolak" variant="outline" color={colors.danger} onPress={() => reviewTopup(String(r.id), false)} /></Row> : <Text style={font.tiny}>{String(r.review_note ?? '')}</Text> },
          ]} />
        </Card>
      </Entrance>
      <Entrance index={1}>
        <Card padded={false}>
          <Text style={[font.h3, { padding: 14 }]}>Penarikan saldo ({f(wds).length})</Text>
          <Table rows={f(wds) as unknown as Record<string, unknown>[]} columns={[
            { key: 'user', label: 'Pengguna', width: 200, render: (r) => { const x = r as unknown as W; return <View><Text style={{ fontWeight: '700' }}>{x.user?.full_name}</Text><Text style={font.tiny}>{x.user?.email}</Text></View>; } },
            { key: 'amount', label: 'Nominal', width: 120, render: (r) => <Text style={{ fontWeight: '800' }}>{rupiah(Number(r.amount))}</Text> },
            { key: 'bank', label: 'Rekening tujuan', width: 260, render: (r) => { const x = r as unknown as W; return <View style={{ gap: 4 }}><Text style={font.small}>{x.bank_name} {x.bank_account}{'\n'}a.n. {x.account_name}</Text><Row gap={6}><Badge text={x.bank_verified ? 'Rekening terverifikasi' : 'Belum terverifikasi'} color={x.bank_verified ? colors.success : colors.textMuted} /><Pressable onPress={() => setBankVerified(x.user_id, !x.bank_verified)} hitSlop={6}><Text style={{ color: x.bank_verified ? colors.danger : colors.primary, fontWeight: '700', fontSize: 12 }}>{x.bank_verified ? 'Cabut' : 'Verifikasi'}</Text></Pressable></Row></View>; } },
            { key: 'created_at', label: 'Waktu', width: 140, render: (r) => <Text style={font.tiny}>{formatDate(String(r.created_at))}</Text> },
            { key: 'status', label: 'Status', width: 130, render: (r) => <View style={{ gap: 4 }}><Badge text={sl[String(r.status)] ?? String(r.status)} color={sc[r.status as keyof typeof sc]} />{r.auto ? <Badge text="Otomatis" color={colors.info} /> : null}</View> },
            { key: 'actions', label: 'Aksi', width: 200, render: (r) => r.status === 'pending' ? <Row gap={6}><Button size="sm" title="Sudah ditransfer" color={colors.success} onPress={() => reviewWd(String(r.id), true)} /><Button size="sm" title="Tolak" variant="outline" color={colors.danger} onPress={() => reviewWd(String(r.id), false)} /></Row> : <Text style={font.tiny}>{String(r.review_note ?? '')}</Text> },
          ]} />
        </Card>
      </Entrance>
    </AdminPage>
  );
}
