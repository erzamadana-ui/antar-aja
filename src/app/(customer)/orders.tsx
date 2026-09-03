import React, { useState } from 'react';
import { View, RefreshControl, ScrollView } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Screen, Chip, Empty, Row } from '@/components/ui';
import { OrderCard } from '@/components/OrderCard';
import { Entrance, Skeleton } from '@/components/motion';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { useAuth } from '@/store/auth';
import { useMyOrders } from '@/hooks/useOrder';
import { motion } from '@/lib/theme';

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
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: TAB_BAR_SPACE + 16, width: '100%', maxWidth: 720, alignSelf: 'center' }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}>
        {loading ? [0, 1, 2].map((i) => <View key={i} style={{ marginBottom: 12, gap: 10, padding: 14, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 20 }}><Skeleton width="40%" height={16} /><Skeleton width="90%" height={12} /><Skeleton width="70%" height={12} /></View>) : (
          <Animated.View key={tab} entering={FadeIn.duration(motion.base)} exiting={FadeOut.duration(motion.fast)} layout={LinearTransition}>
            {list.length === 0 ? (
              <Empty icon="receipt-outline" title={tab === 'active' ? 'Belum ada pesanan berjalan' : 'Belum ada riwayat'} subtitle="Pesan AntarRide, AntarFood, atau AntarSend dari Beranda." />
            ) : list.map((o, i) => <Entrance key={o.id} index={Math.min(i, 6)} from="up"><OrderCard order={o} /></Entrance>)}
          </Animated.View>
        )}
      </ScrollView>
    </Screen>
  );
}
