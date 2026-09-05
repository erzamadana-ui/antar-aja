// Kotak masuk pelanggan — promo dari admin (satu arah), info pesanan & sistem
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Row, Badge, Button, Empty, IconCircle } from '@/components/ui';
import { Entrance, PressableScale, Skeleton } from '@/components/motion';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/store/auth';
import { colors, font, radius, shadow } from '@/lib/theme';
import { timeAgo } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { APP } from '@/lib/app';

export default function Inbox() {
  const router = useRouter();
  const uid = useAuth((s) => s.session?.user.id);
  const { items, loading, unread, markRead } = useNotifications(uid);
  const t = useT();
  useEffect(() => { if (unread > 0) { const tm = setTimeout(() => markRead(), 1500); return () => clearTimeout(tm); } }, [unread, markRead]);
  return (
    <Screen title={t('notifications')} back right={unread > 0 ? <Button size="sm" variant="ghost" title="Tandai dibaca" onPress={() => markRead()} /> : undefined}>
      {loading ? <View style={{ gap: 10 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={84} radius={radius.lg} />)}</View> : items.length === 0 ? (
        <Empty icon="notifications-off-outline" title="Belum ada notifikasi" subtitle="Promo dan info pesanan akan muncul di sini." />
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((n, i) => (
            <Entrance key={n.id} index={Math.min(i, 6)} from="up">
              <PressableScale onPress={() => {
                if (!n.read_at) markRead([n.id]);
                const d = n.data ?? {};
                if (typeof d.travel_request_id === 'string') router.push((APP === 'mitra' ? '/driver/travel' : `/travel/request/${d.travel_request_id}`) as never);
                else if (d.payment_id) router.push((APP === 'mitra' ? '/(driver)/earnings' : '/(customer)/pay') as never);
                else if (n.merchant_id) router.push(`/food/${n.merchant_id}` as never);
                else if (n.promo_code) router.push('/food' as never);
              }} scaleTo={0.985} haptic={false} style={[s.card, !n.read_at && { borderColor: colors.primary }]}>
                {n.image_url && <Image source={{ uri: n.image_url }} style={s.img} />}
                <Row gap={12} style={{ padding: 12, alignItems: 'flex-start' }}>
                  <IconCircle name={n.kind === 'promo' ? 'pricetag-outline' : n.kind === 'order' ? 'receipt-outline' : 'information-circle-outline'} size={42} bg={n.kind === 'promo' ? colors.accentLight : colors.tint} color={n.kind === 'promo' ? colors.warning : colors.primary} />
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Row between>
                    <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15, flex: 1 }} numberOfLines={2}>{n.title}</Text>
                    {!n.read_at && <View style={s.dot} />}
                  </Row>
                  {n.body && <Text style={font.small}>{n.body}</Text>}
                  <Row gap={8} style={{ flexWrap: 'wrap' }}>
                    {n.promo_code && <Badge text={`Kode: ${n.promo_code}`} color={colors.accent} />}
                    {n.merchant_id && <Badge text="Lihat merchant" color={colors.primary} />}
                    {typeof n.data?.travel_request_id === 'string' && <Badge text="Lihat permintaan travel" color={colors.primary} />}
                    {!!n.data?.payment_id && !n.data?.travel_request_id && <Badge text="Lihat AntarPay" color={colors.primary} />}
                    <Text style={font.tiny}>{timeAgo(n.created_at)}</Text>
                  </Row>
                  </View>
                </Row>
              </PressableScale>
            </Entrance>
          ))}
        </View>
      )}
    </Screen>
  );
}
const s = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, ...shadow.soft },
  img: { width: '100%', height: 130, backgroundColor: colors.bgSoft },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginTop: 4 },
});
