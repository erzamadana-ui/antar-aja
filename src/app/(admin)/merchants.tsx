import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { AdminPage, Table, FilterBar } from '@/components/admin';
import { Row, Badge, Button, toast, Input } from '@/components/ui';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font } from '@/lib/theme';
import { formatDate } from '@/lib/format';
import type { ApprovalStatus, Merchant, Profile } from '@/lib/types';

type Row_ = Merchant & { owner: Profile | null; menu_count: number };
const statusColor: Record<ApprovalStatus, string> = { pending: colors.warning, approved: colors.success, suspended: colors.danger, rejected: colors.textMuted };

export default function AdminMerchants() {
  const [rows, setRows] = useState<Row_[]>([]);
  const [filter, setFilter] = useState('pending');
  const [q, setQ] = useState('');
  const load = useCallback(async () => {
    const { data } = await supabase.from('merchants').select('*, menu_items(count)').order('created_at', { ascending: false }).limit(300);
    const ms = ((data as (Merchant & { menu_items: { count: number }[] })[]) ?? []);
    const ownerIds = ms.map((m) => m.owner_id).filter(Boolean) as string[];
    const { data: profiles } = ownerIds.length ? await supabase.from('profiles').select('*').in('id', ownerIds) : { data: [] };
    const pm = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));
    setRows(ms.map((m) => ({ ...m, owner: m.owner_id ? pm.get(m.owner_id) ?? null : null, menu_count: m.menu_items?.[0]?.count ?? 0 })));
  }, []);
  useEffect(() => { load(); }, [load]);
  const setStatus = async (id: string, status: ApprovalStatus) => { try { await rpc('admin_set_merchant_status', { p_merchant: id, p_status: status }); toast.success('Status merchant diperbarui'); load(); } catch (e) { toast.error((e as Error).message); } };
  const shown = rows.filter((r) => (filter === 'all' || r.status === filter) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));

  return (
    <AdminPage title="Merchant AntarFood" subtitle={`${rows.length} terdaftar · ${rows.filter((r) => r.status === 'pending').length} menunggu`} onRefresh={load}>
      <Row gap={10} style={{ flexWrap: 'wrap' }}>
        <FilterBar value={filter} onChange={setFilter} options={[{ key: 'pending', label: 'Menunggu' }, { key: 'approved', label: 'Aktif' }, { key: 'suspended', label: 'Ditangguhkan' }, { key: 'all', label: 'Semua' }]} />
        <Input placeholder="Cari nama" value={q} onChangeText={setQ} icon="search" containerStyle={{ minWidth: 220 }} />
      </Row>
      <Table rows={shown as unknown as Record<string, unknown>[]} columns={[
        { key: 'name', label: 'Merchant', width: 220, render: (r) => { const m = r as unknown as Row_; return <View><Text style={{ fontWeight: '700' }}>{m.name}</Text><Text style={font.tiny}>{m.category} · {m.address}</Text></View>; } },
        { key: 'owner', label: 'Pemilik', width: 170, render: (r) => { const m = r as unknown as Row_; return <Text style={font.small}>{m.owner ? `${m.owner.full_name}\n${m.owner.email ?? ''}` : '— (seed)'}</Text>; } },
        { key: 'menu', label: 'Menu', width: 80, render: (r) => <Text style={font.small}>{String((r as unknown as Row_).menu_count)}</Text> },
        { key: 'rating', label: 'Rating', width: 110, render: (r) => { const m = r as unknown as Row_; return <Text style={font.small}>⭐ {Number(m.rating_avg).toFixed(1)} ({m.rating_count})</Text>; } },
        { key: 'open', label: 'Buka', width: 80, render: (r) => <Badge text={(r as unknown as Row_).is_open ? 'Buka' : 'Tutup'} color={(r as unknown as Row_).is_open ? colors.success : colors.textMuted} /> },
        { key: 'status', label: 'Status', width: 120, render: (r) => <Badge text={String(r.status)} color={statusColor[r.status as ApprovalStatus]} /> },
        { key: 'created_at', label: 'Daftar', width: 120, render: (r) => <Text style={font.tiny}>{formatDate(String(r.created_at), false)}</Text> },
        { key: 'actions', label: 'Aksi', width: 220, render: (r) => { const m = r as unknown as Row_; return (
          <Row gap={6}>
            {m.status !== 'approved' && <Button size="sm" title="Setujui" color={colors.success} onPress={() => setStatus(m.id, 'approved')} />}
            {m.status === 'pending' && <Button size="sm" title="Tolak" variant="outline" color={colors.danger} onPress={() => setStatus(m.id, 'rejected')} />}
            {m.status === 'approved' && <Button size="sm" title="Tangguhkan" variant="outline" color={colors.danger} onPress={() => setStatus(m.id, 'suspended')} />}
          </Row>); } },
      ]} />
    </AdminPage>
  );
}
