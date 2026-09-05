import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Platform, Modal } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { shortMonth } from '@/lib/format';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, useReducedMotion } from 'react-native-reanimated';
import { colors, font, radius, shadow, glass, motion } from '@/lib/theme';
import { Row, Button, Chip, Input } from '@/components/ui';
import { AnimatedNumber, Entrance } from '@/components/motion';

/** Kerangka halaman admin: judul + konten scroll dengan lebar maks. */
export function AdminPage({ title, subtitle, children, right, onRefresh, refreshing }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode; onRefresh?: () => Promise<void> | void; refreshing?: boolean }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 1100, width: '100%', alignSelf: 'center', paddingBottom: 48 }} showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}>
      <Entrance index={0}>
        <Row between style={{ flexWrap: 'wrap', gap: 10 }}>
          <View><Text style={font.h1}>{title}</Text>{subtitle ? <Text style={font.small}>{subtitle}</Text> : null}</View>
          {right}
        </Row>
      </Entrance>
      {children}
    </ScrollView>
  );
}

/** Kartu statistik kaca: angka berjalan, terangkat saat hover (web). */
export function StatCard({ label, value, hint, color = colors.primary, index = 0 }: { label: string; value: string | number; hint?: string; color?: string; index?: number }) {
  const lift = useSharedValue(0);
  const reduce = useReducedMotion();
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: -lift.value * 3 }, { scale: 1 + lift.value * 0.01 }] }));
  const numeric = typeof value === 'number';
  return (
    <Entrance index={index} from="up" style={{ flex: 1, minWidth: 150 }}>
      <Pressable onHoverIn={() => { if (!reduce) lift.value = withSpring(1, motion.spring); }} onHoverOut={() => { lift.value = withSpring(0, motion.springSoft); }}>
        <Animated.View style={[s.stat, a]}>
          <View style={[s.statBar, { backgroundColor: color }]} />
          <View style={[s.statGlow, { backgroundColor: color }]} />
          <Text style={font.tiny}>{label}</Text>
          {numeric ? <AnimatedNumber value={value} format={(n) => String(Math.round(n))} style={s.statValue} /> : <Text style={[s.statValue, String(value).length > 9 && { fontSize: 18 }, String(value).length > 12 && { fontSize: 15 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</Text>}
          {hint ? <Text style={font.tiny}>{hint}</Text> : null}
        </Animated.View>
      </Pressable>
    </Entrance>
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
            <TableRow key={String(r[keyField] ?? i)} zebra={i % 2 === 1} index={i}>
              {columns.map((c) => <View key={c.key} style={{ width: c.width ?? 140, justifyContent: 'center', paddingRight: 8 }}>{c.render ? c.render(r) : <Text style={s.td} numberOfLines={2}>{String(r[c.key] ?? '-')}</Text>}</View>)}
            </TableRow>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
function TableRow({ children, zebra, index }: { children: React.ReactNode; zebra: boolean; index: number }) {
  const o = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => { o.value = reduce ? 1 : withTiming(1, { duration: motion.base }); }, [o, reduce]);
  const hov = useSharedValue(0);
  const a = useAnimatedStyle(() => ({ opacity: o.value, backgroundColor: hov.value ? 'rgba(14,124,123,0.06)' : zebra ? 'rgba(11,31,42,0.025)' : 'transparent' }));
  return (
    <Pressable onHoverIn={() => { hov.value = 1; }} onHoverOut={() => { hov.value = 0; }}>
      <Animated.View style={[s.tr, a, index > 30 ? { opacity: 1 } : null]}>{children}</Animated.View>
    </Pressable>
  );
}

export function FilterBar({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.filter, value === o.key && { backgroundColor: colors.primary, borderColor: colors.primary, ...shadow.glow(colors.primary) }]}>
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
      {data.map((d, i) => (
        <View key={d.label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Text style={font.tiny}>{d.value}</Text>
          <Bar height={Math.max(4, (d.value / max) * 80)} color={color} delay={i * 60} />
          <Text style={font.tiny}>{d.label}</Text>
        </View>
      ))}
    </Row>
  );
}
function Bar({ height, color, delay }: { height: number; color: string; delay: number }) {
  const h = useSharedValue(4);
  const reduce = useReducedMotion();
  useEffect(() => { const t = setTimeout(() => { h.value = reduce ? height : withSpring(height, motion.springSoft); }, delay); return () => clearTimeout(t); }, [height, delay, h, reduce]);
  const a = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[{ width: '100%', backgroundColor: color, borderRadius: 6, opacity: 0.85 }, a]} />;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,31,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: '#fff', borderRadius: radius.xl, padding: 20, gap: 12, ...shadow.card },
  stat: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.xl, padding: 14, paddingLeft: 18, borderWidth: 1, borderColor: glass.border, overflow: 'hidden', ...shadow.card, ...(Platform.OS === 'web' ? ({ cursor: 'default' } as object) : {}) },
  statBar: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 4, borderRadius: 2 },
  statGlow: { position: 'absolute', right: -30, top: -30, width: 90, height: 90, borderRadius: 45, opacity: 0.08 },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 2, letterSpacing: -0.3 },
  table: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: glass.border, ...shadow.card },
  tr: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, minHeight: 48, alignItems: 'center' },
  th: { backgroundColor: colors.primary + '14' },
  thText: { fontSize: 12, fontWeight: '800', color: colors.primaryDark, textTransform: 'uppercase', letterSpacing: 0.6 },
  td: { fontSize: 13, color: colors.text },
  filter: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: glass.border, backgroundColor: 'rgba(255,255,255,0.92)' },
});

// ---- Tahap 5 ----
/** Prompt alasan (suspend/tolak/nonaktif) — alasan tersimpan di log aktivitas & terlihat oleh mitra. */
export function ReasonPrompt({ visible, title, subtitle, onCancel, onSubmit, confirmLabel = 'Simpan', color = colors.danger, optional, quick }: { visible: boolean; title: string; subtitle?: string; onCancel: () => void; onSubmit: (reason: string) => Promise<void> | void; confirmLabel?: string; color?: string; optional?: boolean; quick?: string[] }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setReason(''); }, [visible]);
  const QUICK = quick ?? ['Rating rendah & banyak keluhan pelanggan', 'Dokumen tidak valid / kedaluwarsa', 'Pelanggaran SOP keselamatan', 'Penipuan / manipulasi order', 'Permintaan mitra sendiri', 'Sudah diperbaiki, diaktifkan kembali'];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={s.backdrop}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 480 }}>
          <View style={s.dialog}>
            <Text style={font.h2}>{title}</Text>
            {!!subtitle && <Text style={font.small}>{subtitle}</Text>}
            <Row gap={6} style={{ flexWrap: 'wrap' }}>{QUICK.map((q) => <Chip key={q} label={q} active={reason === q} onPress={() => setReason(q)} color={color} />)}</Row>
            <Input placeholder={optional ? 'Alasan (opsional)' : 'Tulis alasan (min. 5 huruf) — tersimpan di log & terlihat oleh mitra'} value={reason} onChangeText={setReason} multiline style={{ minHeight: 70 }} />
            <Row gap={8}>
              <Button title="Batal" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
              <Button title={confirmLabel} color={color} loading={busy} disabled={!optional && reason.trim().length < 5} onPress={async () => { setBusy(true); try { await onSubmit(reason.trim()); } finally { setBusy(false); } }} style={{ flex: 2 }} />
            </Row>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Grafik garis multi-seri sederhana (tren bulanan per kota). */
export function TrendChart({ months, series, height = 180 }: { months: string[]; series: { label: string; values: number[]; color: string }[]; height?: number }) {
  const [w, setW] = useState(0);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const padL = 30, padB = 22, padT = 8;
  const innerW = Math.max(0, w - padL - 8), innerH = height - padB - padT;
  const x = (i: number) => padL + (months.length <= 1 ? innerW / 2 : (i / (months.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {[0, 0.5, 1].map((f) => <Line key={f} x1={padL} x2={w - 8} y1={y(max * f)} y2={y(max * f)} stroke="rgba(11,31,42,0.08)" strokeWidth={1} />)}
          {[0, 0.5, 1].map((f) => <SvgText key={`t${f}`} x={padL - 4} y={y(max * f) + 4} fontSize={9} fill={colors.textMuted} textAnchor="end">{Math.round(max * f)}</SvgText>)}
          {months.map((m, i) => <SvgText key={m} x={x(i)} y={height - 6} fontSize={9} fill={colors.textMuted} textAnchor="middle">{shortMonth(m)}</SvgText>)}
          {series.map((sr) => (
            <React.Fragment key={sr.label}>
              <Polyline points={sr.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={sr.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {sr.values.map((v, i) => <Circle key={i} cx={x(i)} cy={y(v)} r={3} fill="#fff" stroke={sr.color} strokeWidth={2} />)}
            </React.Fragment>
          ))}
        </Svg>
      )}
      <Row gap={10} style={{ flexWrap: 'wrap', marginTop: 4 }}>
        {series.map((sr) => <Row key={sr.label} gap={5}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: sr.color }} /><Text style={font.tiny}>{sr.label}</Text></Row>)}
      </Row>
    </View>
  );
}
export const CITY_COLORS = ['#0E7C7B', '#F5A524', '#2F80ED', '#EB5757', '#7B61FF', '#0EA5E9', '#1FA363', '#D97706', '#8B5CF6', '#94A3B8'];
