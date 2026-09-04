import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { AdminPage, StatCard, MiniBars, TrendChart, CITY_COLORS } from '@/components/admin';
import { Chip } from '@/components/ui';
import type { TrafficStats } from '@/lib/types';
import { Card, Row, Button, Badge } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font } from '@/lib/theme';
import { rupiah, formatTime, serviceLabel, statusLabel, statusColor } from '@/lib/format';
import type { Order } from '@/lib/types';

interface Stats { users: number; drivers_total: number; drivers_pending: number; drivers_online: number; merchants_total: number; merchants_pending: number; orders_today: number; orders_active: number; gmv_today: number; gmv_month: number; revenue_month: number; topups_pending: number; withdrawals_pending: number; orders_by_service: Record<string, number>; orders_last7: { day: string; count: number }[] }

export default function AdminDashboard() {
  const router = useRouter();
  const [st, setSt] = useState<Stats | null>(null);
  const [live, setLive] = useState<Order[]>([]);
  const [traffic, setTraffic] = useState<TrafficStats | null>(null);
  const [months, setMonths] = useState(6);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const [s, { data }] = await Promise.all([rpc<Stats>('admin_dashboard_stats').catch(() => null), supabase.from('orders').select('*').in('status', ['searching', 'accepted', 'arrived', 'in_progress']).order('created_at', { ascending: false }).limit(10)]);
    if (s) setSt(s); setLive((data as Order[]) ?? []);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => { rpc<TrafficStats>('admin_traffic_stats', { p_months: months }).then(setTraffic).catch(() => null); }, [months]);

  return (
    <AdminPage title="Dashboard" subtitle="Ringkasan operasional hari ini" onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} refreshing={refreshing}>
      <Row gap={12} style={{ flexWrap: 'wrap' }}>
        <StatCard index={1} label="Pesanan hari ini" value={st?.orders_today ?? '…'} hint={`${st?.orders_active ?? 0} sedang berjalan`} />
        <StatCard index={2} label="GMV hari ini" value={rupiah(st?.gmv_today ?? 0)} hint={`Bulan ini ${rupiah(st?.gmv_month ?? 0)}`} color={colors.success} />
        <StatCard index={3} label="Pendapatan platform (bulan)" value={rupiah(st?.revenue_month ?? 0)} hint="Komisi + biaya layanan" color={colors.accent} />
        <StatCard index={4} label="Driver online" value={`${st?.drivers_online ?? 0}/${st?.drivers_total ?? 0}`} hint={`${st?.drivers_pending ?? 0} menunggu verifikasi`} color={colors.ride} />
        <StatCard index={5} label="Merchant" value={st?.merchants_total ?? '…'} hint={`${st?.merchants_pending ?? 0} menunggu verifikasi`} color={colors.food} />
        <StatCard index={6} label="Pengguna" value={st?.users ?? '…'} color={colors.info} />
      </Row>
      {((st?.topups_pending ?? 0) > 0 || (st?.withdrawals_pending ?? 0) > 0 || (st?.drivers_pending ?? 0) > 0 || (st?.merchants_pending ?? 0) > 0) && (
        <Card style={{ backgroundColor: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.3)' }}>
          <Text style={[font.h3, { color: colors.warning }]}>Perlu tindakan</Text>
          <Row gap={8} style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {(st?.topups_pending ?? 0) > 0 && <Button size="sm" title={`${st!.topups_pending} top up`} onPress={() => router.replace('/(admin)/finance')} />}
            {(st?.withdrawals_pending ?? 0) > 0 && <Button size="sm" title={`${st!.withdrawals_pending} penarikan`} onPress={() => router.replace('/(admin)/finance')} />}
            {(st?.drivers_pending ?? 0) > 0 && <Button size="sm" title={`${st!.drivers_pending} driver baru`} color={colors.ride} onPress={() => router.replace('/(admin)/drivers')} />}
            {(st?.merchants_pending ?? 0) > 0 && <Button size="sm" title={`${st!.merchants_pending} merchant baru`} color={colors.food} onPress={() => router.replace('/(admin)/merchants')} />}
          </Row>
        </Card>
      )}
      <Card>
        <Row between style={{ flexWrap: 'wrap', gap: 8 }}>
          <View><Text style={font.label}>Tren trafik per kota (bulanan)</Text><Text style={font.tiny}>{traffic ? `Bulan ini ${traffic.this_month.orders} pesanan · ${rupiah(traffic.this_month.gmv)} (bulan lalu ${traffic.last_month.orders} · ${rupiah(traffic.last_month.gmv)})` : 'Memuat…'}</Text></View>
          <Row gap={6}>{[3, 6, 12].map((m) => <Chip key={m} label={`${m} bln`} active={months === m} onPress={() => setMonths(m)} />)}</Row>
        </Row>
        <View style={{ marginTop: 12 }}>
          {traffic && traffic.cities.length > 0 ? <TrendChart months={traffic.months} series={traffic.cities.slice(0, 6).map((c, i) => ({ label: `${c.city} (${c.total})`, values: c.series, color: CITY_COLORS[i % CITY_COLORS.length] }))} /> : <Text style={font.small}>Belum ada data.</Text>}
        </View>
        <Row gap={16} style={{ flexWrap: 'wrap', marginTop: 14 }}>
          <View style={{ flex: 1, minWidth: 260, gap: 6 }}>
            <Text style={font.label}>Layanan yang menonjol</Text>
            {(traffic?.services ?? []).map((sv, i) => (
              <View key={sv.service} style={{ gap: 3 }}>
                <Row between><Text style={font.small}>{i === 0 ? '🏆 ' : ''}{serviceLabel[sv.service] ?? sv.service}</Text><Text style={font.tiny}>{sv.orders} pesanan · {sv.share}% · {rupiah(sv.gmv)}</Text></Row>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(11,31,42,0.06)' }}><View style={{ width: `${Math.max(2, sv.share)}%`, height: 6, borderRadius: 3, backgroundColor: CITY_COLORS[i % CITY_COLORS.length] }} /></View>
              </View>
            ))}
          </View>
          <View style={{ flex: 1, minWidth: 260, gap: 6 }}>
            <Text style={font.label}>Kota teratas</Text>
            {(traffic?.cities ?? []).slice(0, 8).map((c, i) => <Row key={c.city} between><Row gap={6}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: CITY_COLORS[i % CITY_COLORS.length] }} /><Text style={font.small}>{c.city}</Text></Row><Badge text={`${c.total} pesanan`} /></Row>)}
          </View>
        </Row>
      </Card>
      <Row gap={16} style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
        <Card style={{ flex: 1, minWidth: 300 }}>
          <Text style={font.label}>Pesanan 7 hari terakhir</Text>
          <View style={{ marginTop: 12 }}><MiniBars data={(st?.orders_last7 ?? []).map((d) => ({ label: new Date(d.day).toLocaleDateString('id-ID', { weekday: 'short' }), value: d.count }))} /></View>
        </Card>
        <Card style={{ flex: 1, minWidth: 300 }}>
          <Text style={font.label}>Komposisi layanan (30 hari)</Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {Object.entries(st?.orders_by_service ?? {}).map(([k, v]) => (
              <Row key={k} between><Text style={font.body}>{serviceLabel[k as keyof typeof serviceLabel] ?? k}</Text><Badge text={String(v)} /></Row>
            ))}
            {!st || Object.keys(st.orders_by_service ?? {}).length === 0 ? <Text style={font.small}>Belum ada data.</Text> : null}
          </View>
        </Card>
      </Row>
      <Entrance index={0}>
        <Card>
          <Row between><Text style={font.label}>Pesanan berjalan</Text><Button size="sm" variant="ghost" title="Lihat semua" onPress={() => router.replace('/(admin)/orders')} /></Row>
          <View style={{ marginTop: 8 }}>
            {live.length === 0 && <Text style={font.small}>Tidak ada pesanan berjalan.</Text>}
            {live.map((o) => (
              <Row key={o.id} between style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(11,31,42,0.07)' }}>
                <View style={{ flex: 1 }}><Text style={{ fontWeight: '700' }}>{o.code} · {serviceLabel[o.service]}</Text><Text style={font.tiny} numberOfLines={1}>{formatTime(o.created_at)} · {o.dropoff_address}</Text></View>
                <Badge text={statusLabel(o.status, o.service, o.merchant_status)} color={statusColor(o.status)} />
              </Row>
            ))}
          </View>
        </Card>
      </Entrance>
    </AdminPage>
  );
}
