import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { AdminPage, Table, FilterBar } from '@/components/admin';
import { Row, Badge, Button, toast, Input } from '@/components/ui';
import { rpc, supabase } from '@/lib/supabase';
import { signedUrl } from '@/lib/upload';
import { colors, font } from '@/lib/theme';
import { formatDate, phoneDisplay } from '@/lib/format';
import type { ApprovalStatus, Driver, Profile } from '@/lib/types';

type Row_ = Driver & { profile: Profile | null };
const statusColor: Record<ApprovalStatus, string> = { pending: colors.warning, approved: colors.success, suspended: colors.danger, rejected: colors.textMuted };

export default function AdminDrivers() {
  const [rows, setRows] = useState<Row_[]>([]);
  const [filter, setFilter] = useState('pending');
  const [q, setQ] = useState('');
  const load = useCallback(async () => {
    const { data } = await supabase.from('drivers').select('*').order('created_at', { ascending: false }).limit(300);
    const drivers = (data as Driver[]) ?? [];
    const ids = drivers.map((d) => d.id);
    const { data: profiles } = ids.length ? await supabase.from('profiles').select('*').in('id', ids) : { data: [] };
    const pm = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));
    setRows(drivers.map((d) => ({ ...d, profile: pm.get(d.id) ?? null })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: ApprovalStatus) => {
    try { await rpc('admin_set_driver_status', { p_driver: id, p_status: status }); toast.success('Status driver diperbarui'); load(); } catch (e) { toast.error((e as Error).message); }
  };
  const openDoc = async (path: string | null | undefined) => { if (!path) return toast.error('Dokumen belum diunggah'); const u = await signedUrl('documents', path); if (u) Linking.openURL(u); };
  const shown = rows.filter((r) => (filter === 'all' || r.status === filter) && (!q || (r.profile?.full_name ?? '').toLowerCase().includes(q.toLowerCase()) || r.vehicle_plate.toLowerCase().includes(q.toLowerCase())));

  return (
    <AdminPage title="Mitra Driver" subtitle={`${rows.length} terdaftar · ${rows.filter((r) => r.status === 'pending').length} menunggu`} onRefresh={load}>
      <Row gap={10} style={{ flexWrap: 'wrap' }}>
        <FilterBar value={filter} onChange={setFilter} options={[{ key: 'pending', label: 'Menunggu' }, { key: 'approved', label: 'Aktif' }, { key: 'suspended', label: 'Ditangguhkan' }, { key: 'rejected', label: 'Ditolak' }, { key: 'all', label: 'Semua' }]} />
        <Input placeholder="Cari nama / plat" value={q} onChangeText={setQ} icon="search" containerStyle={{ minWidth: 220 }} />
      </Row>
      <Table rows={shown as unknown as Record<string, unknown>[]} columns={[
        { key: 'name', label: 'Driver', width: 200, render: (r) => { const d = r as unknown as Row_; return <View><Text style={{ fontWeight: '700' }}>{d.profile?.full_name}</Text><Text style={font.tiny}>{phoneDisplay(d.profile?.phone)} · {d.profile?.email}</Text></View>; } },
        { key: 'vehicle', label: 'Kendaraan', width: 170, render: (r) => { const d = r as unknown as Row_; return <View><Text style={font.small}>{d.vehicle_type === 'car' ? '🚗' : '🏍️'} {d.vehicle_brand}</Text><Text style={{ fontWeight: '700' }}>{d.vehicle_plate}</Text></View>; } },
        { key: 'docs', label: 'Dokumen', width: 190, render: (r) => { const d = r as unknown as Row_; return <View><Text style={font.tiny}>SIM {d.license_number ?? '-'} · NIK {d.id_card_number ?? '-'}</Text><Row gap={8}><Pressable onPress={() => openDoc(d.photo_id_url)}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>KTP</Text></Pressable><Pressable onPress={() => openDoc(d.photo_vehicle_url)}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Kendaraan</Text></Pressable></Row></View>; } },
        { key: 'stats', label: 'Performa', width: 130, render: (r) => { const d = r as unknown as Row_; return <Text style={font.small}>⭐ {Number(d.rating_avg).toFixed(1)} · {d.total_trips} trip{d.is_online ? ' · 🟢 online' : ''}</Text>; } },
        { key: 'status', label: 'Status', width: 120, render: (r) => { const d = r as unknown as Row_; return <Badge text={d.status} color={statusColor[d.status]} />; } },
        { key: 'created_at', label: 'Daftar', width: 130, render: (r) => <Text style={font.tiny}>{formatDate(String(r.created_at), false)}</Text> },
        { key: 'actions', label: 'Aksi', width: 220, render: (r) => { const d = r as unknown as Row_; return (
          <Row gap={6}>
            {d.status !== 'approved' && <Button size="sm" title="Setujui" color={colors.success} onPress={() => setStatus(d.id, 'approved')} />}
            {d.status === 'pending' && <Button size="sm" title="Tolak" variant="outline" color={colors.danger} onPress={() => setStatus(d.id, 'rejected')} />}
            {d.status === 'approved' && <Button size="sm" title="Tangguhkan" variant="outline" color={colors.danger} onPress={() => setStatus(d.id, 'suspended')} />}
          </Row>); } },
      ]} />
    </AdminPage>
  );
}
