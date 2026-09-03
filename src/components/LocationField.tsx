import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius } from '@/lib/theme';
import type { Place } from '@/lib/types';

/** Dua baris lokasi (jemput/tujuan) ala Gojek. Menekan baris membuka place-picker. */
export function LocationFields({ pickup, dropoff, pickupLabel = 'Titik jemput', dropoffLabel = 'Tujuan', lockPickup }: { pickup: Place | null; dropoff: Place | null; pickupLabel?: string; dropoffLabel?: string; lockPickup?: boolean }) {
  const router = useRouter();
  const open = (target: 'pickup' | 'dropoff', title: string) => router.push({ pathname: '/place-picker', params: { target, title } } as never);
  return (
    <View style={s.wrap}>
      <View style={s.rail}>
        <View style={[s.dot, { backgroundColor: colors.primary }]} />
        <View style={s.line} />
        <View style={[s.dot, { backgroundColor: colors.danger, borderRadius: 2 }]} />
      </View>
      <View style={{ flex: 1 }}>
        <Pressable disabled={lockPickup} onPress={() => open('pickup', pickupLabel)} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={font.tiny}>{pickupLabel}</Text>
            <Text style={[s.value, !pickup && { color: colors.textMuted }]} numberOfLines={1}>{pickup?.name ?? pickup?.address ?? 'Pilih titik jemput'}</Text>
          </View>
          {!lockPickup && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
        </Pressable>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <Pressable onPress={() => open('dropoff', dropoffLabel)} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={font.tiny}>{dropoffLabel}</Text>
            <Text style={[s.value, !dropoff && { color: colors.textMuted }]} numberOfLines={1}>{dropoff?.name ?? dropoff?.address ?? 'Mau ke mana?'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingLeft: 12 },
  rail: { width: 14, alignItems: 'center', paddingVertical: 22 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, minHeight: 56 },
  value: { fontWeight: '600', color: colors.text, fontSize: 14, marginTop: 2 },
});
