import React, { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Entrance, LiveDot, Skeleton } from '@/components/motion';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { CallButton } from '@/components/call/IncomingCall';
import { Screen, Card, Row, Badge, Button, Chip, Empty, toast } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { useMyOrders } from '@/hooks/useOrder';
import { rpc } from '@/lib/supabase';
import { colors, font, motion } from '@/lib/theme';
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
    return <Screen title="Pesanan" ambient="amber"><Empty icon="hourglass-outline" title="Menunggu verifikasi admin" subtitle="Toko akan tampil di AntarFood setelah disetujui. Anda sudah bisa menyiapkan menu." /></Screen>;
  }
  return (
    <Screen title={merchant?.name ?? 'Pesanan'} scroll={false} padded={false} ambient="amber">
      <Row gap={8} style={{ padding: 16, paddingBottom: 8 }}>
        <Chip label={`Baru (${lists.new.length})`} active={tab === 'new'} onPress={() => setTab('new')} color={colors.food} />
        <Chip label={`Diproses (${lists.process.length})`} active={tab === 'process'} onPress={() => setTab('process')} color={colors.food} />
        <Chip label="Selesai" active={tab === 'done'} onPress={() => setTab('done')} color={colors.food} />
      </Row>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: TAB_BAR_SPACE + 16, width: '100%', maxWidth: 720, alignSelf: 'center' }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}>
        {loading ? [0, 1].map((i) => <View key={i} style={{ gap: 10, padding: 14, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20 }}><Skeleton width="40%" height={16} /><Skeleton width="90%" height={12} /><Skeleton width="70%" height={12} /></View>) : (
        <Animated.View key={tab} entering={FadeIn.duration(motion.base)} exiting={FadeOut.duration(motion.fast)} layout={LinearTransition} style={{ gap: 12 }}>
          {lists[tab].length === 0 && <Empty icon="receipt-outline" title={tab === 'new' ? 'Belum ada pesanan baru' : 'Kosong'} subtitle="Pesanan baru akan muncul otomatis." />}
          {lists[tab].map((o, i) => (
            <Entrance key={o.id} index={Math.min(i, 6)} from="up"><Card style={o.merchant_status === 'pending' && isActive(o) ? { borderColor: colors.food + '66' } : undefined}>
              <Row between>
                <View><Row gap={6}>{isActive(o) && o.merchant_status === 'pending' && <LiveDot color={colors.food} size={7} />}<Text style={font.h3}>{o.code}</Text></Row><Text style={font.tiny}>{formatTime(o.created_at)} · {o.payment_method === 'cash' ? 'Tunai (driver bayar di kasir)' : 'AntarPay'}</Text></View>
                <Badge text={o.merchant_status ? merchantStatusLabel[o.merchant_status] : statusLabel(o.status, o.service)} color={o.merchant_status === 'ready' ? colors.success : o.status === 'cancelled' ? colors.danger : colors.warning} />
              </Row>
              <View style={{ marginTop: 10, gap: 4 }}>
                {o.order_items?.map((it) => <Row key={it.id} between><Text style={font.body}>{it.qty}× {it.name}{it.notes ? <Text style={font.tiny}>  ({it.notes})</Text> : null}</Text><Text style={{ fontWeight: '600' }}>{rupiah(it.price * it.qty)}</Text></Row>)}
                <Row between style={{ borderTopWidth: 1, borderTopColor: 'rgba(11,31,42,0.07)', paddingTop: 6, marginTop: 4 }}><Text style={font.small}>Pendapatan bersih Anda</Text><Text style={{ fontWeight: '800', color: colors.success }}>{rupiah(o.merchant_earning)}</Text></Row>
              </View>
              <Row between style={{ marginTop: 8 }}>
                <Text style={font.tiny}>Driver: {o.status === 'searching' ? 'belum ada' : o.status === 'accepted' ? 'menuju toko' : o.status === 'arrived' ? 'sudah di toko' : o.status}</Text>
                {isActive(o) && (
                  <Row gap={8}>
                    {o.driver_id && <CallButton peer={{ id: o.driver_id, name: 'Driver', role: 'driver' }} orderId={o.id} size={34} color={colors.ride} />}
                    <CallButton peer={{ id: o.customer_id, name: 'Pelanggan', role: 'customer' }} orderId={o.id} size={34} color={colors.info} />
                  </Row>
                )}
              </Row>
              {o.merchant_status === 'pending' && isActive(o) && (
                <Row gap={8} style={{ marginTop: 12 }}>
                  <Button title="Tolak" variant="outline" color={colors.danger} size="sm" onPress={() => act(o, 'rejected')} />
                  <Button title="Terima & Siapkan" size="sm" color={colors.food} style={{ flex: 1 }} onPress={() => act(o, 'accepted')} />
                </Row>
              )}
              {o.merchant_status === 'accepted' && isActive(o) && <Button title="Pesanan Siap Diambil" size="sm" color={colors.success} style={{ marginTop: 12 }} onPress={() => act(o, 'ready')} />}
            </Card></Entrance>
          ))}
        </Animated.View>
        )}
      </ScrollView>
    </Screen>
  );
}
