import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image, Alert, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Row, Stars, Stepper, Loading, Badge, toast } from '@/components/ui';
import { CartBar } from '@/components/CartBar';
import { useCart } from '@/store/cart';
import { supabase } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import { rupiah } from '@/lib/format';
import type { Merchant, MenuItem } from '@/lib/types';

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

  if (loading || !merchant) return <Screen title="Merchant" back><Loading /></Screen>;
  return (
    <Screen back title={merchant.name} scroll={false} padded={false} footer={<CartBar />}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <Image source={{ uri: merchant.image_url ?? undefined }} style={s.hero} />
        <View style={s.info}>
          <Text style={font.h2}>{merchant.name}</Text>
          <Text style={font.small}>{merchant.category} · {merchant.address}</Text>
          <Row gap={8} style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <Row gap={4}><Stars value={merchant.rating_avg} size={13} /><Text style={font.small}>{Number(merchant.rating_avg).toFixed(1)} ({merchant.rating_count} ulasan)</Text></Row>
            <Badge text={merchant.is_open ? `Buka · ${merchant.opening_hours}` : 'Tutup'} color={merchant.is_open ? colors.success : colors.danger} />
            <Badge text={`Siap ±${merchant.prep_minutes} mnt`} color={colors.info} />
          </Row>
          {merchant.description ? <Text style={[font.small, { marginTop: 8 }]}>{merchant.description}</Text> : null}
        </View>
        {groups.map(([cat, list]) => (
          <View key={cat} style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <Text style={[font.h3, { marginBottom: 8 }]}>{cat}</Text>
            {list.map((item) => {
              const q = qtyOf(item.id);
              return (
                <View key={item.id} style={[s.item, !item.is_available && { opacity: 0.5 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{item.name}</Text>
                    {item.description ? <Text style={font.small} numberOfLines={2}>{item.description}</Text> : null}
                    <Text style={{ fontWeight: '800', color: colors.food, marginTop: 4 }}>{rupiah(item.price)}</Text>
                  </View>
                  {item.image_url ? <Image source={{ uri: item.image_url }} style={s.thumb} /> : null}
                  <View style={{ justifyContent: 'center' }}>
                    {!item.is_available ? <Text style={font.tiny}>Habis</Text> : q === 0 ? (
                      <Pressable onPress={() => add(item)} style={s.addBtn}><Ionicons name="add" size={18} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Tambah</Text></Pressable>
                    ) : <Stepper value={q} onChange={(v) => (v > q ? add(item) : cart.setQty(item.id, v))} />}
                  </View>
                </View>
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
  hero: { width: '100%', height: 180, backgroundColor: colors.border },
  info: { backgroundColor: colors.surface, padding: 16, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, ...shadow.card },
  item: { flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, marginBottom: 10, ...shadow.card },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.border },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.food, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full },
});
