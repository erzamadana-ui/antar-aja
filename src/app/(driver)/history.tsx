import React from 'react';
import { ScrollView } from 'react-native';
import { Screen, Empty, Loading } from '@/components/ui';
import { OrderCard } from '@/components/OrderCard';
import { useAuth } from '@/store/auth';
import { useMyOrders } from '@/hooks/useOrder';

export default function DriverHistory() {
  const uid = useAuth((s) => s.session?.user.id);
  const { orders, loading } = useMyOrders('driver', uid);
  return (
    <Screen title="Riwayat Order" scroll={false} padded={false}>
      {loading ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {orders.length === 0 ? <Empty icon="receipt-outline" title="Belum ada order" subtitle="Order yang Anda terima akan tampil di sini." /> : orders.map((o) => <OrderCard key={o.id} order={o} href={`/driver/order/${o.id}`} />)}
        </ScrollView>
      )}
    </Screen>
  );
}
