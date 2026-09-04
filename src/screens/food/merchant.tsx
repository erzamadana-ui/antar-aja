import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert, Platform } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Row, Stars, Stepper, Loading, Badge, toast } from '@/components/ui';
import { CartBar } from '@/components/CartBar';
import { Entrance, PressableScale, Skeleton } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { useCart } from '@/store/cart';
import { supabase } from '@/lib/supabase';
import { colors, font, radius, shadow, glass, motion } from '@/lib/theme';
import { rupiah } from '@/lib/format';
import type { Merchant, MenuItem } from '@/lib/types';
import { HalalBadge } from '@/components/MerchantStatus';

export default function MerchantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cart = useCart();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: m }, { data: it }] = await Promise.all([
        supabase.from('merchants').select('*').eq('id', id).maybeSingle(),
        supabase.from('menu_items').select('*').eq('merchant_id', id).order('sort_order'),
      ]);
      setMerchant(m as Merchant); setItems((it as MenuItem[]) ?? []); setLoading(false);
    })();
  }, [id]);

  const groups = useMemo(() => {
    const g = new Map<string, MenuItem[]>();
    items.forEach((i) => { const k = i.category || 'Menu'; g.set(k, [...(g.get(k) ?? []), i]); });
    return Array.from(g.entries());
  }, [items]);

  const qtyOf = (itemId: string) => cart.lines.find((l) => l.item.id === itemId)?.qty ?? 0;
  const add = (item: MenuItem) => {
    if (!merchant) return;
    if (!merchant.is_open) { toast.error('Merchant sedang tutup'); return; }
    if (!cart.add(merchant, item)) {
      const replace = () => { cart.replaceWith(merchant, item); toast.show('Keranjang diganti'); };
      if (Platform.OS === 'web') { if (confirm(`Keranjang berisi pesanan dari ${cart.merchant?.name}. Ganti dengan ${merchant.name}?`)) replace(); return; }
      Alert.alert('Ganti keranjang?', `Keranjang berisi pesanan dari ${cart.merchant?.name}. Ganti dengan ${merchant.name}?`, [{ text: 'Batal' }, { text: 'Ganti', onPress: replace }]);
    }
  };

  if (loading || !merchant) return (
    <Screen title="Merchant" back scroll={false} padded={false} ambient="amber">
      <Skeleton width="100%" height={200} radius={0} />
      <View style={{ padding: 16, gap: 10 }}><Skeleton width="60%" height={22} /><Skeleton width="90%" height={14} /><Skeleton width="40%" height={14} /></View>
      {loading ? null : <Loading />}
    </Screen>
  );
  return (
    <Screen back title={merchant.name} scroll={false} padded={false} footer={<CartBar />} ambient="amber">
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(motion.slow)}>
          <Image source={{ uri: merchant.image_url ?? undefined }} style={s.hero} />
          <BrandGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']} angle="vertical" style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Entrance index={0} style={s.info}>
          <Text style={font.h2}>{merchant.name}</Text>
          <Text style={font.small}>{merchant.category} · {merchant.address}</Text>
          <Row gap={8} style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <Row gap={4}><Stars value={merchant.rating_avg} size={13} /><Text style={font.small}>{Number(merchant.rating_avg).toFixed(1)} ({merchant.rating_count} ulasan)</Text></Row>
            <HalalBadge merchant={merchant} size="md" />
            <Badge text={merchant.is_open ? `Buka · ${merchant.opening_hours}` : 'Tutup'} color={merchant.is_open ? colors.success : colors.danger} />
            <Badge text={`Siap ±${merchant.prep_minutes} mnt`} color={colors.info} />
          </Row>
          {merchant.description ? <Text style={[font.small, { marginTop: 8 }]}>{merchant.description}</Text> : null}
        </Entrance>
        {groups.map(([cat, list], gi) => (
          <View key={cat} style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <Entrance index={gi + 1}><Text style={[font.label, { marginBottom: 8 }]}>{cat}</Text></Entrance>
            {list.map((item, ii) => {
              const q = qtyOf(item.id);
              return (
                <Entrance key={item.id} index={Math.min(gi + ii + 1, 8)} from="up">
                <Animated.View layout={LinearTransition.springify().stiffness(280).damping(20)} style={[s.item, !item.is_available && { opacity: 0.5 }, q > 0 && { borderColor: colors.food + '66', backgroundColor: colors.food + '0D' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{item.name}</Text>
                    {item.description ? <Text style={font.small} numberOfLines={2}>{item.description}</Text> : null}
                    <Text style={{ fontWeight: '800', color: colors.food, marginTop: 4 }}>{rupiah(item.price)}</Text>
                  </View>
                  {item.image_url ? <Image source={{ uri: item.image_url }} style={s.thumb} /> : null}
                  <View style={{ justifyContent: 'center' }}>
                    {!item.is_available ? <Text style={font.tiny}>Habis</Text> : q === 0 ? (
                      <PressableScale onPress={() => add(item)} scaleTo={0.92} style={[s.addBtn, shadow.glow(colors.food)]}><BrandGradient colors={[colors.food, '#EA580C']} style={StyleSheet.absoluteFill} /><Ionicons name="add" size={18} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Tambah</Text></PressableScale>
                    ) : <Stepper value={q} onChange={(v) => (v > q ? add(item) : cart.setQty(item.id, v))} />}
                  </View>
                </Animated.View>
                </Entrance>
              );
            })}
          </View>
        ))}
        {items.length === 0 && <Text style={[font.small, { padding: 24, textAlign: 'center' }]}>Merchant belum menambahkan menu.</Text>}
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { width: '100%', height: 200, backgroundColor: 'rgba(11,31,42,0.06)' },
  info: { backgroundColor: 'rgba(255,255,255,0.78)', padding: 16, marginHorizontal: 16, marginTop: -28, borderRadius: radius.xl, borderWidth: 1, borderColor: glass.border, ...shadow.card },
  item: { flexDirection: 'row', gap: 12, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.lg, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: glass.border, ...shadow.soft },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: 'rgba(11,31,42,0.06)' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, overflow: 'hidden' },
});
