import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { AdminPage, StatCard, MiniBars } from '@/components/admin';
import { Card, Row, Button, Badge } from '@/components/ui';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font } from '@/lib/theme';
import { rupiah, formatTime, serviceLabel, statusLabel, statusColor } from '@/lib/format';
import type { Order } from '@/lib/types';

interface Stats { users: number; drivers_total: number; drivers_pending: number; drivers_online: number; merchants_total: number; merchants_pending: number; orders_today: number; orders_active: number; gmv_today: number; gmv_month: number; revenue_month: number; topups_pending: number; withdrawals_pending: number; orders_by_service: Record<string, number>; orders_last7: { day: string; count: number }[] }

export default function AdminDashboard() {
  const router = useRouter();
  const [st, setSt] = useState<Stats | null>(null);
  const [live, setLive] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const [s, { data }] = await Promise.all([rpc<Stats>('admin_dashboard_stats').catch(() => null), supabase.from('orders').select('*').in('status', ['searching', 'accepted', 'arrived', 'in_progress']).order('created_at', { ascending: false }).limit(10)]);
    if (s) setSt(s); setLive((data as Order[]) ?? []);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  return (
    <AdminPage title="Dashboard" subtitle="Ringkasan operasional hari ini" onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} refreshing={refreshing}>
      <Row gap={12} style={{ flexWrap: 'wrap' }}>
        <StatCard label="Pesanan hari ini" value={st?.orders_today ?? '…'} hint={`${st?.orders_active ?? 0} sedang berjalan`} />
        <StatCard label="GMV hari ini" value={rupiah(st?.gmv_today ?? 0)} hint={`Bulan ini ${rupiah(st?.gmv_month ?? 0)}`} color={colors.success} />
        <StatCard label="Pendapatan platform (bulan)" value={rupiah(st?.revenue_month ?? 0)} hint="Komisi + biaya layanan" color={colors.accent} />
        <StatCard label="Driver online" value={`${st?.drivers_online ?? 0}/${st?.drivers_total ?? 0}`} hint={`${st?.drivers_pending ?? 0} menunggu verifikasi`} color={colors.ride} />
        <StatCard label="Merchant" value={st?.merchants_total ?? '…'} hint={`${st?.merchants_pending ?? 0} menunggu verifikasi`} color={colors.food} />
        <StatCard label="Pengguna" value={st?.users ?? '…'} color={colors.info} />
      </Row>
      {((st?.topups_pending ?? 0) > 0 || (st?.withdrawals_pending ?? 0) > 0 || (st?.drivers_pending ?? 0) > 0 || (st?.merchants_pending ?? 0) > 0) && (
        <Card style={{ backgroundColor: colors.accentLight }}>
          <Text style={[font.h3, { color: colors.warning }]}>Perlu tindakan</Text>
          <Row gap={8} style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {(st?.topups_pending ?? 0) > 0 && <Button size="sm" title={`${st!.topups_pending} top up`} onPress={() => router.replace('/(admin)/finance')} />}
            {(st?.withdrawals_pending ?? 0) > 0 && <Button size="sm" title={`${st!.withdrawals_pending} penarikan`} onPress={() => router.replace('/(admin)/finance')} />}
            {(st?.drivers_pending ?? 0) > 0 && <Button size="sm" title={`${st!.drivers_pending} driver baru`} color={colors.ride} onPress={() => router.replace('/(admin)/drivers')} />}
            {(st?.merchants_pending ?? 0) > 0 && <Button size="sm" title={`${st!.merchants_pending} merchant baru`} color={colors.food} onPress={() => router.replace('/(admin)/merchants')} />}
          </Row>
        </Card>
      )}
      <Row gap={16} style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
        <Card style={{ flex: 1, minWidth: 300 }}>
          <Text style={font.h3}>Pesanan 7 hari terakhir</Text>
          <View style={{ marginTop: 12 }}><MiniBars data={(st?.orders_last7 ?? []).map((d) => ({ label: new Date(d.day).toLocaleDateString('id-ID', { weekday: 'short' }), value: d.count }))} /></View>
        </Card>
        <Card style={{ flex: 1, minWidth: 300 }}>
          <Text style={font.h3}>Komposisi layanan (30 hari)</Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {Object.entries(st?.orders_by_service ?? {}).map(([k, v]) => (
              <Row key={k} between><Text style={font.body}>{serviceLabel[k as keyof typeof serviceLabel] ?? k}</Text><Badge text={String(v)} /></Row>
            ))}
            {!st || Object.keys(st.orders_by_service).length === 0 ? <Text style={font.small}>Belum ada data.</Text> : null}
          </View>
        </Card>
      </Row>
      <Card>
        <Row between><Text style={font.h3}>Pesanan berjalan</Text><Button size="sm" variant="ghost" title="Lihat semua" onPress={() => router.replace('/(admin)/orders')} /></Row>
        <View style={{ marginTop: 8 }}>
          {live.length === 0 && <Text style={font.small}>Tidak ada pesanan berjalan.</Text>}
          {live.map((o) => (
            <Row key={o.id} between style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '700' }}>{o.code} · {serviceLabel[o.service]}</Text><Text style={font.tiny} numberOfLines={1}>{formatTime(o.created_at)} · {o.dropoff_address}</Text></View>
              <Badge text={statusLabel(o.status, o.service, o.merchant_status)} color={statusColor(o.status)} />
            </Row>
          ))}
        </View>
      </Card>
    </AdminPage>
  );
}
