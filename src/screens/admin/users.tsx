import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import { AdminPage, Table, FilterBar, ReasonPrompt } from '@/components/admin';
import { Row, Badge, Button, toast, Input, Chip } from '@/components/ui';
import { execLevelLabel } from '@/lib/format';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font } from '@/lib/theme';
import { formatDate, phoneDisplay, rupiah } from '@/lib/format';
import type { Profile, UserRole, Wallet } from '@/lib/types';

type Row_ = Profile & { balance: number };

export default function AdminUsers() {
  const [rows, setRows] = useState<Row_[]>([]);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const load = useCallback(async () => {
    const [{ data: p }, { data: w }] = await Promise.all([supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500), supabase.from('wallets').select('*')]);
    const wm = new Map(((w as Wallet[]) ?? []).map((x) => [x.user_id, x.balance]));
    setRows(((p as Profile[]) ?? []).map((x) => ({ ...x, balance: wm.get(x.id) ?? 0 })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const [ask, setAsk] = useState<{ id: string; name: string } | null>(null);
  const [execFor, setExecFor] = useState<Row_ | null>(null);
  const [execLevel, setExecLevel] = useState('vp'); const [execPin, setExecPin] = useState('');
  const grantExec = async (active: boolean) => {
    if (!execFor) return;
    if (active && execPin && execPin.length < 6) return toast.error('PIN minimal 6 digit');
    try { await rpc('admin_set_exec', { p_user: execFor.id, p_level: execLevel, p_pin: execPin || null, p_active: active }); toast.success(active ? `Akses eksekutif ${execLevelLabel[execLevel]} diberikan` : 'Akses eksekutif dicabut'); setExecFor(null); setExecPin(''); }
    catch (e) { toast.error((e as Error).message); }
  };
  const setUser = async (id: string, patch: { role?: UserRole; active?: boolean; reason?: string }) => {
    if (patch.active === false && patch.reason === undefined) { setAsk({ id, name: rows.find((r) => r.id === id)?.full_name ?? 'pengguna' }); return; }
    try { await rpc('admin_set_user', { p_user: id, p_role: patch.role ?? null, p_active: patch.active ?? null, p_reason: patch.reason ?? null }); toast.success('Diperbarui & tercatat di log'); setAsk(null); load(); } catch (e) { toast.error((e as Error).message); }
  };
  const [adjusting, setAdjusting] = useState<Row_ | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const adjust = (u: Row_) => { setAdjusting(u); setAmount(''); setNote(''); };
  const runAdjust = async () => {
    const n = Number(amount.replace(/[^\d-]/g, ''));
    if (!adjusting || !n) return toast.error('Masukkan nominal (negatif untuk mengurangi)');
    try { await rpc('admin_adjust_wallet', { p_user: adjusting.id, p_amount: n, p_note: note || 'Penyesuaian admin' }); toast.success('Saldo disesuaikan'); setAdjusting(null); load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const shown = rows.filter((r) => (filter === 'all' || r.role === filter) && (!q || r.full_name.toLowerCase().includes(q.toLowerCase()) || (r.email ?? '').toLowerCase().includes(q.toLowerCase()) || (r.phone ?? '').includes(q)));
  const roleColor: Record<UserRole, string> = { customer: colors.info, driver: colors.ride, merchant: colors.food, admin: colors.accent };

  return (
    <AdminPage title="Pengguna" subtitle={`${rows.length} akun`} onRefresh={load}>
      <ReasonPrompt visible={!!ask} title={`Nonaktifkan akun ${ask?.name}?`} subtitle="Akun tidak bisa memesan/menerima order. Alasan tersimpan di Log Aktivitas." onCancel={() => setAsk(null)} onSubmit={(r) => setUser(ask!.id, { active: false, reason: r })} confirmLabel="Nonaktifkan" />
      <Row gap={10} style={{ flexWrap: 'wrap' }}>
        <FilterBar value={filter} onChange={setFilter} options={[{ key: 'all', label: 'Semua' }, { key: 'customer', label: 'Pelanggan' }, { key: 'driver', label: 'Driver' }, { key: 'merchant', label: 'Merchant' }, { key: 'admin', label: 'Admin' }]} />
        <Input placeholder="Cari nama / email / HP" value={q} onChangeText={setQ} icon="search" containerStyle={{ minWidth: 240 }} />
      </Row>
      <Table rows={shown as unknown as Record<string, unknown>[]} columns={[
        { key: 'name', label: 'Pengguna', width: 220, render: (r) => { const u = r as unknown as Row_; return <View><Text style={{ fontWeight: '700' }}>{u.full_name}</Text><Text style={font.tiny}>{u.email} · {phoneDisplay(u.phone)}</Text></View>; } },
        { key: 'role', label: 'Peran', width: 110, render: (r) => <Badge text={String(r.role)} color={roleColor[r.role as UserRole]} /> },
        { key: 'balance', label: 'Saldo', width: 120, render: (r) => <Text style={{ fontWeight: '700' }}>{rupiah(Number(r.balance))}</Text> },
        { key: 'is_active', label: 'Status', width: 150, render: (r) => <View><Badge text={r.is_active ? 'Aktif' : 'Nonaktif'} color={r.is_active ? colors.success : colors.danger} />{!r.is_active && r.status_reason ? <Text style={font.tiny} numberOfLines={2}>{String(r.status_reason)}</Text> : null}</View> },
        { key: 'created_at', label: 'Daftar', width: 120, render: (r) => <Text style={font.tiny}>{formatDate(String(r.created_at), false)}</Text> },
        { key: 'actions', label: 'Aksi', width: 320, render: (r) => { const u = r as unknown as Row_; return (
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Button size="sm" title="Saldo ±" variant="secondary" onPress={() => adjust(u)} />
            {u.is_active ? <Button size="sm" title="Nonaktifkan" variant="outline" color={colors.danger} onPress={() => setUser(u.id, { active: false })} /> : <Button size="sm" title="Aktifkan" color={colors.success} onPress={() => setUser(u.id, { active: true, reason: 'Diaktifkan kembali oleh admin' })} />}
            {u.role !== 'admin' ? <Button size="sm" title="Jadikan admin" variant="ghost" onPress={() => setUser(u.id, { role: 'admin' })} /> : <Button size="sm" title="Cabut admin" variant="ghost" color={colors.danger} onPress={() => setUser(u.id, { role: 'customer' })} />}
            <Button size="sm" title="Eksekutif" variant="ghost" color="#0B1F2A" icon="shield-half-outline" onPress={() => { setExecFor(u); setExecPin(''); }} />
          </Row>); } },
      ]} />
      <Modal visible={!!execFor} transparent animationType="fade" onRequestClose={() => setExecFor(null)}>
        <View style={st.bg}>
          <View style={st.box}>
            <Text style={font.h3}>Akses Portal Eksekutif · {execFor?.full_name}</Text>
            <Text style={font.small}>Portal eksekutif (/exec) butuh login kedua dengan PIN 6 digit. Hanya level Vice President ke atas & pemegang saham. Setiap login tercatat di log.</Text>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>{Object.entries(execLevelLabel).map(([k, l]) => <Chip key={k} label={l} active={execLevel === k} onPress={() => setExecLevel(k)} color="#0B1F2A" />)}</Row>
            <Input label="PIN eksekutif (6 digit) — kosongkan bila tidak diubah" keyboardType="number-pad" secureTextEntry value={execPin} onChangeText={(v) => setExecPin(v.replace(/\D/g, '').slice(0, 8))} placeholder="••••••" />
            <Row gap={8} style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button title="Batal" variant="ghost" onPress={() => setExecFor(null)} />
              <Button title="Cabut akses" variant="outline" color={colors.danger} onPress={() => grantExec(false)} />
              <Button title="Beri / perbarui akses" color="#0B1F2A" onPress={() => grantExec(true)} />
            </Row>
          </View>
        </View>
      </Modal>
      <Modal visible={!!adjusting} transparent animationType="fade" onRequestClose={() => setAdjusting(null)}>
        <View style={st.bg}>
          <View style={st.box}>
            <Text style={font.h3}>Penyesuaian saldo · {adjusting?.full_name}</Text>
            <Text style={font.small}>Saldo saat ini {rupiah(adjusting?.balance ?? 0)}. Nominal negatif untuk mengurangi.</Text>
            <Input label="Nominal (Rp)" keyboardType="numbers-and-punctuation" value={amount} onChangeText={setAmount} placeholder="50000 atau -25000" />
            <Input label="Catatan" value={note} onChangeText={setNote} placeholder="Alasan penyesuaian" />
            <Row gap={8} style={{ justifyContent: 'flex-end' }}>
              <Button title="Batal" variant="ghost" onPress={() => setAdjusting(null)} />
              <Button title="Terapkan" onPress={runAdjust} />
            </Row>
          </View>
        </View>
      </Modal>
    </AdminPage>
  );
}
const st = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 20 },
  box: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, gap: 12, width: '100%', maxWidth: 440 },
});
