import React, { useState } from 'react';
import { View, RefreshControl, ScrollView } from 'react-native';
import { Screen, Chip, Empty, Loading, Row } from '@/components/ui';
import { OrderCard } from '@/components/OrderCard';
import { useAuth } from '@/store/auth';
import { useMyOrders } from '@/hooks/useOrder';

export default function CustomerOrders() {
  const uid = useAuth((s) => s.session?.user.id);
  const { orders, loading, reload } = useMyOrders('customer', uid);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [refreshing, setRefreshing] = useState(false);
  const active = orders.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const history = orders.filter((o) => ['completed', 'cancelled'].includes(o.status));
  const list = tab === 'active' ? active : history;

  return (
    <Screen title="Pesanan Saya" scroll={false} padded={false}>
      <Row gap={8} style={{ padding: 16, paddingBottom: 8 }}>
        <Chip label={`Berjalan (${active.length})`} active={tab === 'active'} onPress={() => setTab('active')} />
        <Chip label="Riwayat" active={tab === 'history'} onPress={() => setTab('history')} />
      </Row>
      {loading ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}>
          {list.length === 0 ? (
            <Empty icon="receipt-outline" title={tab === 'active' ? 'Belum ada pesanan berjalan' : 'Belum ada riwayat'} subtitle="Pesan AntarRide, AntarFood, atau AntarSend dari Beranda." />
          ) : list.map((o) => <OrderCard key={o.id} order={o} />)}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </Screen>
  );
}
