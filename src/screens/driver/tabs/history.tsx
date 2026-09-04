import React from 'react';
import { ScrollView, View } from 'react-native';
import { Screen, Empty } from '@/components/ui';
import { OrderCard } from '@/components/OrderCard';
import { Entrance, Skeleton } from '@/components/motion';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { useAuth } from '@/store/auth';
import { useMyOrders } from '@/hooks/useOrder';

export default function DriverHistory() {
  const uid = useAuth((s) => s.session?.user.id);
  const { orders, loading } = useMyOrders('driver', uid);
  return (
    <Screen title="Riwayat Order" scroll={false} padded={false} ambient="amber">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SPACE + 16, width: '100%', maxWidth: 720, alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
        {loading ? [0, 1, 2].map((i) => <View key={i} style={{ marginBottom: 12, gap: 10, padding: 14, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 20 }}><Skeleton width="40%" height={16} /><Skeleton width="90%" height={12} /><Skeleton width="70%" height={12} /></View>)
          : orders.length === 0 ? <Empty icon="receipt-outline" title="Belum ada order" subtitle="Order yang Anda terima akan tampil di sini." />
          : orders.map((o, i) => <Entrance key={o.id} index={Math.min(i, 6)} from="up"><OrderCard order={o} href={`/driver/order/${o.id}`} /></Entrance>)}
      </ScrollView>
    </Screen>
  );
}
