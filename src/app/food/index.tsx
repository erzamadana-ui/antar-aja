import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Screen, Input, Chip, Row, Stars, Empty, Badge } from '@/components/ui';
import { CartBar } from '@/components/CartBar';
import { Entrance, PressableScale, Skeleton } from '@/components/motion';
import { useCurrentLocation } from '@/hooks/useLocation';
import { supabase } from '@/lib/supabase';
import { colors, font, radius, shadow, glass } from '@/lib/theme';
import { rupiah } from '@/lib/format';
import type { Merchant } from '@/lib/types';

const CATS = ['Semua', 'Makanan', 'Minuman', 'Jajanan'];

export default function FoodHome() {
  const router = useRouter();
  const { location } = useCurrentLocation();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Semua');
  const [list, setList] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase.rpc('nearby_merchants', { p_lat: location.lat, p_lng: location.lng, p_radius_km: 30, p_q: q || null });
      setList((data as Merchant[]) ?? []);
      setLoading(false);
    }, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q, location.lat, location.lng]);

  const shown = list.filter((m) => cat === 'Semua' || m.category === cat);

  return (
    <Screen title="AntarFood" back scroll={false} padded={false} footer={<CartBar />} ambient="amber">
      <View style={{ padding: 16, paddingBottom: 8, gap: 12 }}>
        <Entrance index={0}><Input icon="search" placeholder="Cari resto atau menu…" value={q} onChangeText={setQ} /></Entrance>
        <Entrance index={1}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {CATS.map((c) => <Chip key={c} label={c} active={cat === c} onPress={() => setCat(c)} color={colors.food} />)}
          </ScrollView>
        </Entrance>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {loading ? [0, 1, 2].map((i) => (
          <View key={i} style={[s.card, { padding: 0 }]}>
            <Skeleton width={110} height={110} radius={0} />
            <View style={{ flex: 1, padding: 12, gap: 8 }}><Skeleton width="70%" height={16} /><Skeleton width="90%" height={12} /><Skeleton width="50%" height={12} /></View>
          </View>
        )) : (
          <>
            {shown.length === 0 && <Empty icon="restaurant-outline" title="Belum ada merchant" subtitle="Coba kata kunci lain atau perluas lokasi." />}
            {shown.map((m, i) => (
              <Entrance key={m.id} index={Math.min(i, 6)} from="up">
                <Animated.View layout={LinearTransition.springify()}>
                  <PressableScale onPress={() => router.push(`/food/${m.id}` as never)} scaleTo={0.98} style={s.card}>
                    <View>
                      <Image source={{ uri: m.image_url ?? undefined }} style={s.img} />
                      {!m.is_open && <View style={s.closed}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>TUTUP</Text></View>}
                    </View>
                    <View style={{ flex: 1, padding: 12, gap: 3, minWidth: 0 }}>
                      <Text style={font.h3} numberOfLines={1}>{m.name}</Text>
                      <Text style={font.small} numberOfLines={1}>{m.category} · {m.description}</Text>
                      <Row gap={6} style={{ marginTop: 4 }}>
                        <Stars value={m.rating_avg} size={12} />
                        <Text style={font.tiny}>{Number(m.rating_avg).toFixed(1)} ({m.rating_count})</Text>
                        <Text style={font.tiny}>· {m.distance_km} km · {m.prep_minutes + 15} mnt</Text>
                      </Row>
                      <Row gap={6} style={{ marginTop: 4 }}>
                        <Badge text={`Ongkir ${rupiah(m.delivery_fee)}`} color={colors.food} />
                        {m.delivery_fee === 0 && <Ionicons name="flash" size={13} color={colors.food} />}
                      </Row>
                    </View>
                  </PressableScale>
                </Animated.View>
              </Entrance>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: glass.border, ...shadow.card },
  img: { width: 110, height: 110, backgroundColor: 'rgba(11,31,42,0.06)' },
  closed: { position: 'absolute', left: 8, top: 8, backgroundColor: 'rgba(11,31,42,0.7)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
});
