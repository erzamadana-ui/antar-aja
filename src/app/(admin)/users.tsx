import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Platform, Alert } from 'react-native';
import { AdminPage, Table, FilterBar } from '@/components/admin';
import { Row, Badge, Button, toast, Input } from '@/components/ui';
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

  const setUser = async (id: string, patch: { role?: UserRole; active?: boolean }) => { try { await rpc('admin_set_user', { p_user: id, p_role: patch.role ?? null, p_active: patch.active ?? null }); toast.success('Diperbarui'); load(); } catch (e) { toast.error((e as Error).message); } };
  const adjust = (u: Row_) => {
    const run = async (v: string | null) => { const n = Number(v); if (!v || !n) return; try { await rpc('admin_adjust_wallet', { p_user: u.id, p_amount: n, p_note: 'Penyesuaian admin' }); toast.success('Saldo disesuaikan'); load(); } catch (e) { toast.error((e as Error).message); } };
    if (Platform.OS === 'web') return run(prompt(`Penyesuaian saldo ${u.full_name} (angka, negatif untuk mengurangi):`));
    Alert.prompt?.('Penyesuaian saldo', 'Masukkan nominal (negatif untuk mengurangi)', run, 'plain-text', '', 'numeric');
  };
  const shown = rows.filter((r) => (filter === 'all' || r.role === filter) && (!q || r.full_name.toLowerCase().includes(q.toLowerCase()) || (r.email ?? '').toLowerCase().includes(q.toLowerCase()) || (r.phone ?? '').includes(q)));
  const roleColor: Record<UserRole, string> = { customer: colors.info, driver: colors.ride, merchant: colors.food, admin: colors.accent };

  return (
    <AdminPage title="Pengguna" subtitle={`${rows.length} akun`} onRefresh={load}>
      <Row gap={10} style={{ flexWrap: 'wrap' }}>
        <FilterBar value={filter} onChange={setFilter} options={[{ key: 'all', label: 'Semua' }, { key: 'customer', label: 'Pelanggan' }, { key: 'driver', label: 'Driver' }, { key: 'merchant', label: 'Merchant' }, { key: 'admin', label: 'Admin' }]} />
        <Input placeholder="Cari nama / email / HP" value={q} onChangeText={setQ} icon="search" containerStyle={{ minWidth: 240 }} />
      </Row>
      <Table rows={shown as unknown as Record<string, unknown>[]} columns={[
        { key: 'name', label: 'Pengguna', width: 220, render: (r) => { const u = r as unknown as Row_; return <View><Text style={{ fontWeight: '700' }}>{u.full_name}</Text><Text style={font.tiny}>{u.email} · {phoneDisplay(u.phone)}</Text></View>; } },
        { key: 'role', label: 'Peran', width: 110, render: (r) => <Badge text={String(r.role)} color={roleColor[r.role as UserRole]} /> },
        { key: 'balance', label: 'Saldo', width: 120, render: (r) => <Text style={{ fontWeight: '700' }}>{rupiah(Number(r.balance))}</Text> },
        { key: 'is_active', label: 'Status', width: 100, render: (r) => <Badge text={r.is_active ? 'Aktif' : 'Nonaktif'} color={r.is_active ? colors.success : colors.danger} /> },
        { key: 'created_at', label: 'Daftar', width: 120, render: (r) => <Text style={font.tiny}>{formatDate(String(r.created_at), false)}</Text> },
        { key: 'actions', label: 'Aksi', width: 320, render: (r) => { const u = r as unknown as Row_; return (
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Button size="sm" title="Saldo ±" variant="secondary" onPress={() => adjust(u)} />
            {u.is_active ? <Button size="sm" title="Nonaktifkan" variant="outline" color={colors.danger} onPress={() => setUser(u.id, { active: false })} /> : <Button size="sm" title="Aktifkan" color={colors.success} onPress={() => setUser(u.id, { active: true })} />}
            {u.role !== 'admin' ? <Button size="sm" title="Jadikan admin" variant="ghost" onPress={() => setUser(u.id, { role: 'admin' })} /> : <Button size="sm" title="Cabut admin" variant="ghost" color={colors.danger} onPress={() => setUser(u.id, { role: 'customer' })} />}
          </Row>); } },
      ]} />
    </AdminPage>
  );
}
