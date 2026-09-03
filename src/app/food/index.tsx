import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Input, Chip, Row, Stars, Empty } from '@/components/ui';
import { CartBar } from '@/components/CartBar';
import { useCurrentLocation } from '@/hooks/useLocation';
import { supabase } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
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
    <Screen title="AntarFood" back scroll={false} padded={false} footer={<CartBar />}>
      <View style={{ padding: 16, paddingBottom: 8, gap: 12, backgroundColor: colors.surface }}>
        <Input icon="search" placeholder="Cari resto atau menu…" value={q} onChangeText={setQ} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CATS.map((c) => <Chip key={c} label={c} active={cat === c} onPress={() => setCat(c)} color={colors.food} />)}
        </ScrollView>
      </View>
      {loading ? <ActivityIndicator color={colors.food} style={{ marginTop: 32 }} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}>
          {shown.length === 0 && <Empty icon="restaurant-outline" title="Belum ada merchant" subtitle="Coba kata kunci lain atau perluas lokasi." />}
          {shown.map((m) => (
            <Pressable key={m.id} onPress={() => router.push(`/food/${m.id}` as never)} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}>
              <Image source={{ uri: m.image_url ?? undefined }} style={s.img} />
              <View style={{ flex: 1, padding: 12, gap: 3 }}>
                <Row between>
                  <Text style={[font.h3, { flex: 1 }]} numberOfLines={1}>{m.name}</Text>
                  {!m.is_open && <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>TUTUP</Text>}
                </Row>
                <Text style={font.small} numberOfLines={1}>{m.category} · {m.description}</Text>
                <Row gap={6} style={{ marginTop: 4 }}>
                  <Stars value={m.rating_avg} size={12} />
                  <Text style={font.tiny}>{Number(m.rating_avg).toFixed(1)} ({m.rating_count})</Text>
                  <Text style={font.tiny}>· {m.distance_km} km · {m.prep_minutes + 15} mnt</Text>
                </Row>
                <Row gap={4} style={{ marginTop: 2 }}>
                  <Ionicons name="bicycle" size={13} color={colors.food} />
                  <Text style={{ fontSize: 12, color: colors.food, fontWeight: '700' }}>Ongkir {rupiah(m.delivery_fee)}</Text>
                </Row>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  img: { width: 110, height: 110, backgroundColor: colors.border },
});
