import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '@/store/cart';
import { colors, radius } from '@/lib/theme';
import { rupiah } from '@/lib/format';

/** Bar keranjang melayang ala GoFood. */
export function CartBar() {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const merchant = useCart((s) => s.merchant);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.item.price, 0);
  if (count === 0) return null;
  return (
    <Pressable onPress={() => router.push('/food/checkout')} style={s.bar}>
      <View style={s.count}><Text style={{ color: colors.food, fontWeight: '800' }}>{count}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1}>Lihat keranjang · {merchant?.name}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>{rupiah(subtotal)}</Text>
      </View>
      <Ionicons name="cart" size={22} color="#fff" />
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.food, borderRadius: radius.lg, padding: 14 },
  count: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
