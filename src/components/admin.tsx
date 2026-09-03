import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { colors, font, radius, shadow } from '@/lib/theme';
import { Row } from '@/components/ui';

/** Kerangka halaman admin: judul + konten scroll dengan lebar maks. */
export function AdminPage({ title, subtitle, children, right, onRefresh, refreshing }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode; onRefresh?: () => Promise<void> | void; refreshing?: boolean }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 1100, width: '100%', alignSelf: 'center', paddingBottom: 48 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}>
      <Row between style={{ flexWrap: 'wrap', gap: 10 }}>
        <View><Text style={font.h1}>{title}</Text>{subtitle ? <Text style={font.small}>{subtitle}</Text> : null}</View>
        {right}
      </Row>
      {children}
    </ScrollView>
  );
}

export function StatCard({ label, value, hint, color = colors.primary }: { label: string; value: string | number; hint?: string; color?: string }) {
  return (
    <View style={[s.stat, { borderTopColor: color }]}>
      <Text style={font.tiny}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: '900', color: colors.text, marginTop: 2 }}>{value}</Text>
      {hint ? <Text style={font.tiny}>{hint}</Text> : null}
    </View>
  );
}

/** Tabel sederhana yang responsif (scroll horizontal). */
export function Table({ columns, rows, keyField = 'id', emptyText = 'Tidak ada data' }: { columns: { key: string; label: string; width?: number; render?: (row: Record<string, unknown>) => React.ReactNode }[]; rows: Record<string, unknown>[]; keyField?: string; emptyText?: string }) {
  return (
    <View style={s.table}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%' }}>
        <View style={{ minWidth: '100%' }}>
          <View style={[s.tr, s.th]}>{columns.map((c) => <Text key={c.key} style={[s.thText, { width: c.width ?? 140 }]}>{c.label}</Text>)}</View>
          {rows.length === 0 && <Text style={[font.small, { padding: 16 }]}>{emptyText}</Text>}
          {rows.map((r, i) => (
            <View key={String(r[keyField] ?? i)} style={[s.tr, i % 2 ? { backgroundColor: colors.bg } : null]}>
              {columns.map((c) => <View key={c.key} style={{ width: c.width ?? 140, justifyContent: 'center', paddingRight: 8 }}>{c.render ? c.render(r) : <Text style={s.td} numberOfLines={2}>{String(r[c.key] ?? '-')}</Text>}</View>)}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function FilterBar({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.filter, value === o.key && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          <Text style={{ color: value === o.key ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function MiniBars({ data, color = colors.primary }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <Row gap={8} style={{ alignItems: 'flex-end', height: 120 }}>
      {data.map((d) => (
        <View key={d.label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Text style={font.tiny}>{d.value}</Text>
          <View style={{ width: '100%', height: Math.max(4, (d.value / max) * 80), backgroundColor: color, borderRadius: 4, opacity: 0.85 }} />
          <Text style={font.tiny}>{d.label}</Text>
        </View>
      ))}
    </Row>
  );
}

const s = StyleSheet.create({
  stat: { flex: 1, minWidth: 150, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderTopWidth: 3, ...shadow.card },
  table: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  tr: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, minHeight: 48, alignItems: 'center' },
  th: { backgroundColor: colors.primaryLight },
  thText: { fontSize: 12, fontWeight: '800', color: colors.primaryDark, textTransform: 'uppercase' },
  td: { fontSize: 13, color: colors.text },
  filter: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
