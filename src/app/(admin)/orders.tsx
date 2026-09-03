import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { CallButton } from '@/components/call/IncomingCall';
import { AdminPage, Table, FilterBar } from '@/components/admin';
import { Row, Badge, Button, toast, Input } from '@/components/ui';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font } from '@/lib/theme';
import { formatDate, rupiah, serviceLabel, statusLabel, statusColor } from '@/lib/format';
import type { Order, Profile } from '@/lib/types';

type Row_ = Order & { customer_name?: string; driver_name?: string };

export default function AdminOrders() {
  const router = useRouter();
  const [rows, setRows] = useState<Row_[]>([]);
  const [filter, setFilter] = useState('active');
  const [q, setQ] = useState('');
  const load = useCallback(async () => {
    let query = supabase.from('orders').select('*, merchant:merchants(name)').order('created_at', { ascending: false }).limit(300);
    if (filter === 'active') query = query.in('status', ['searching', 'accepted', 'arrived', 'in_progress']);
    else if (filter !== 'all') query = query.eq('status', filter);
    const { data } = await query;
    const os = (data as unknown as Order[]) ?? [];
    const ids = Array.from(new Set(os.flatMap((o) => [o.customer_id, o.driver_id]).filter(Boolean))) as string[];
    const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,full_name').in('id', ids) : { data: [] };
    const pm = new Map(((profiles as Pick<Profile, 'id' | 'full_name'>[]) ?? []).map((p) => [p.id, p.full_name]));
    setRows(os.map((o) => ({ ...o, customer_name: pm.get(o.customer_id), driver_name: o.driver_id ? pm.get(o.driver_id) : undefined })));
  }, [filter]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const cancel = (o: Order) => {
    const run = async () => { try { await rpc('cancel_order', { p_order_id: o.id, p_reason: 'Dibatalkan admin' }); toast.success('Order dibatalkan'); load(); } catch (e) { toast.error((e as Error).message); } };
    if (Platform.OS === 'web') { if (confirm(`Batalkan order ${o.code}? Pembayaran AntarPay akan direfund.`)) run(); return; }
    Alert.alert('Batalkan order?', o.code, [{ text: 'Tidak' }, { text: 'Batalkan', style: 'destructive', onPress: run }]);
  };
  const shown = rows.filter((r) => !q || r.code.toLowerCase().includes(q.toLowerCase()) || (r.customer_name ?? '').toLowerCase().includes(q.toLowerCase()));

  return (
    <AdminPage title="Pesanan" subtitle="Pantau & intervensi pesanan" onRefresh={load}>
      <Row gap={10} style={{ flexWrap: 'wrap' }}>
        <FilterBar value={filter} onChange={setFilter} options={[{ key: 'active', label: 'Berjalan' }, { key: 'searching', label: 'Mencari driver' }, { key: 'completed', label: 'Selesai' }, { key: 'cancelled', label: 'Batal' }, { key: 'all', label: 'Semua' }]} />
        <Input placeholder="Cari kode / pelanggan" value={q} onChangeText={setQ} icon="search" containerStyle={{ minWidth: 220 }} />
      </Row>
      <Table rows={shown as unknown as Record<string, unknown>[]} columns={[
        { key: 'code', label: 'Order', width: 170, render: (r) => { const o = r as unknown as Row_; return <View><Text style={{ fontWeight: '700' }}>{o.code}</Text><Text style={font.tiny}>{formatDate(o.created_at)}</Text></View>; } },
        { key: 'service', label: 'Layanan', width: 110, render: (r) => <Text style={font.small}>{serviceLabel[(r as unknown as Row_).service]}</Text> },
        { key: 'people', label: 'Pelanggan / Driver', width: 230, render: (r) => { const o = r as unknown as Row_; return (
          <View style={{ gap: 4 }}>
            <Row gap={6}><Text style={[font.small, { flex: 1 }]} numberOfLines={1}>{o.customer_name ?? '-'}</Text><CallButton peer={{ id: o.customer_id, name: o.customer_name ?? 'Pelanggan', role: 'customer' }} orderId={o.id} size={26} color={colors.info} /></Row>
            <Row gap={6}><Text style={[font.tiny, { flex: 1 }]} numberOfLines={1}>🛵 {o.driver_name ?? 'belum ada'}</Text>{o.driver_id && <CallButton peer={{ id: o.driver_id, name: o.driver_name ?? 'Driver', role: 'driver' }} orderId={o.id} size={26} color={colors.ride} />}</Row>
          </View>); } },
        { key: 'route', label: 'Rute', width: 260, render: (r) => { const o = r as unknown as Row_; return <View><Text style={font.tiny} numberOfLines={1}>▲ {o.merchant?.name ?? o.pickup_address}</Text><Text style={font.tiny} numberOfLines={1}>▼ {o.dropoff_address}</Text></View>; } },
        { key: 'total', label: 'Total', width: 110, render: (r) => { const o = r as unknown as Row_; return <View><Text style={{ fontWeight: '700' }}>{rupiah(o.total)}</Text><Text style={font.tiny}>{o.payment_method === 'wallet' ? 'AntarPay' : 'Tunai'} · {o.payment_status}</Text></View>; } },
        { key: 'status', label: 'Status', width: 170, render: (r) => { const o = r as unknown as Row_; return <Badge text={statusLabel(o.status, o.service, o.merchant_status)} color={statusColor(o.status)} />; } },
        { key: 'actions', label: 'Aksi', width: 190, render: (r) => { const o = r as unknown as Row_; return (
          <Row gap={6}>
            <Button size="sm" title="Detail" variant="secondary" onPress={() => router.push(`/order/${o.id}` as never)} />
            {!['completed', 'cancelled'].includes(o.status) && <Button size="sm" title="Batalkan" variant="outline" color={colors.danger} onPress={() => cancel(o)} />}
          </Row>); } },
      ]} />
    </AdminPage>
  );
}
