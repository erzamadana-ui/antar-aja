// Kotak masuk pelanggan — promo dari admin (satu arah), info pesanan & sistem
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Row, Badge, Button, Empty } from '@/components/ui';
import { Entrance, PressableScale, Skeleton } from '@/components/motion';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/store/auth';
import { colors, font, radius, glass } from '@/lib/theme';
import { timeAgo } from '@/lib/format';
import { useT } from '@/lib/i18n';

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
              <PressableScale onPress={() => { if (!n.read_at) markRead([n.id]); if (n.merchant_id) router.push(`/food/${n.merchant_id}` as never); else if (n.promo_code) router.push('/food' as never); }} scaleTo={0.985} style={[s.card, !n.read_at && { borderColor: colors.primary + '66', backgroundColor: colors.primary + '08' }]}>
                {n.image_url && <Image source={{ uri: n.image_url }} style={s.img} />}
                <View style={{ padding: 12, gap: 4 }}>
                  <Row between>
                    <Row gap={6}><Ionicons name={n.kind === 'promo' ? 'pricetag' : n.kind === 'order' ? 'receipt' : 'information-circle'} size={14} color={n.kind === 'promo' ? colors.accent : colors.info} /><Text style={{ fontWeight: '800', color: colors.text, fontSize: 14.5, flex: 1 }} numberOfLines={2}>{n.title}</Text></Row>
                    {!n.read_at && <View style={s.dot} />}
                  </Row>
                  {n.body && <Text style={font.small}>{n.body}</Text>}
                  <Row gap={8} style={{ flexWrap: 'wrap' }}>
                    {n.promo_code && <Badge text={`Kode: ${n.promo_code}`} color={colors.accent} />}
                    {n.merchant_id && <Badge text="Lihat merchant →" color={colors.food} />}
                    <Text style={font.tiny}>{timeAgo(n.created_at)}</Text>
                  </Row>
                </View>
              </PressableScale>
            </Entrance>
          ))}
        </View>
      )}
    </Screen>
  );
}
const s = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: glass.border },
  img: { width: '100%', height: 120, backgroundColor: 'rgba(11,31,42,0.06)' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
});
