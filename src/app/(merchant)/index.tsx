import React, { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Screen, Card, Row, Badge, Button, Chip, Empty, Loading, toast } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { useMyOrders } from '@/hooks/useOrder';
import { rpc } from '@/lib/supabase';
import { colors, font } from '@/lib/theme';
import { rupiah, formatTime, merchantStatusLabel, statusLabel } from '@/lib/format';
import type { Order, MerchantOrderStatus } from '@/lib/types';

export default function MerchantOrders() {
  const merchant = useAuth((s) => s.merchant);
  const { orders, loading, reload } = useMyOrders('merchant', merchant?.id);
  const [tab, setTab] = useState<'new' | 'process' | 'done'>('new');
  const [refreshing, setRefreshing] = useState(false);

  const isActive = (o: Order) => !['completed', 'cancelled'].includes(o.status);
  const lists = {
    new: orders.filter((o) => isActive(o) && o.merchant_status === 'pending'),
    process: orders.filter((o) => isActive(o) && (o.merchant_status === 'accepted' || o.merchant_status === 'ready')),
    done: orders.filter((o) => !isActive(o)),
  };
  const act = async (o: Order, st: MerchantOrderStatus) => {
    try { await rpc('merchant_update_order', { p_order_id: o.id, p_status: st }); toast.success(st === 'accepted' ? 'Pesanan diterima, mulai siapkan' : st === 'ready' ? 'Pesanan siap, driver akan mengambil' : 'Pesanan ditolak'); reload(); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (merchant && merchant.status !== 'approved') {
    return <Screen title="Pesanan"><Empty icon="hourglass-outline" title="Menunggu verifikasi admin" subtitle="Toko akan tampil di AntarFood setelah disetujui. Anda sudah bisa menyiapkan menu." /></Screen>;
  }
  return (
    <Screen title={merchant?.name ?? 'Pesanan'} scroll={false} padded={false}>
      <Row gap={8} style={{ padding: 16, paddingBottom: 8 }}>
        <Chip label={`Baru (${lists.new.length})`} active={tab === 'new'} onPress={() => setTab('new')} color={colors.food} />
        <Chip label={`Diproses (${lists.process.length})`} active={tab === 'process'} onPress={() => setTab('process')} color={colors.food} />
        <Chip label="Selesai" active={tab === 'done'} onPress={() => setTab('done')} color={colors.food} />
      </Row>
      {loading ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}>
          {lists[tab].length === 0 && <Empty icon="receipt-outline" title={tab === 'new' ? 'Belum ada pesanan baru' : 'Kosong'} subtitle="Pesanan baru akan muncul otomatis." />}
          {lists[tab].map((o) => (
            <Card key={o.id}>
              <Row between>
                <View><Text style={font.h3}>{o.code}</Text><Text style={font.tiny}>{formatTime(o.created_at)} · {o.payment_method === 'cash' ? 'Tunai (driver bayar di kasir)' : 'AntarPay'}</Text></View>
                <Badge text={o.merchant_status ? merchantStatusLabel[o.merchant_status] : statusLabel(o.status, o.service)} color={o.merchant_status === 'ready' ? colors.success : o.status === 'cancelled' ? colors.danger : colors.warning} />
              </Row>
              <View style={{ marginTop: 10, gap: 4 }}>
                {o.order_items?.map((it) => <Row key={it.id} between><Text style={font.body}>{it.qty}× {it.name}{it.notes ? <Text style={font.tiny}>  ({it.notes})</Text> : null}</Text><Text style={{ fontWeight: '600' }}>{rupiah(it.price * it.qty)}</Text></Row>)}
                <Row between style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4 }}><Text style={font.small}>Pendapatan bersih Anda</Text><Text style={{ fontWeight: '800', color: colors.success }}>{rupiah(o.merchant_earning)}</Text></Row>
              </View>
              <Text style={[font.tiny, { marginTop: 6 }]}>Driver: {o.status === 'searching' ? 'belum ada' : o.status === 'accepted' ? 'menuju toko' : o.status === 'arrived' ? 'sudah di toko' : o.status}</Text>
              {o.merchant_status === 'pending' && isActive(o) && (
                <Row gap={8} style={{ marginTop: 12 }}>
                  <Button title="Tolak" variant="outline" color={colors.danger} size="sm" onPress={() => act(o, 'rejected')} />
                  <Button title="Terima & Siapkan" size="sm" color={colors.food} style={{ flex: 1 }} onPress={() => act(o, 'accepted')} />
                </Row>
              )}
              {o.merchant_status === 'accepted' && isActive(o) && <Button title="Pesanan Siap Diambil" size="sm" color={colors.success} style={{ marginTop: 12 }} onPress={() => act(o, 'ready')} />}
            </Card>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
