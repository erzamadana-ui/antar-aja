// Admin · Usulan Data: usulan toko/pasar dari pelanggan (crowdsourcing) + moderasi otomatis
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Linking, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminPage, FilterBar, StatCard, ReasonPrompt } from '@/components/admin';
import { Card, Row, Button, Badge, Empty, IconCircle, toast } from '@/components/ui';
import { Entrance, Skeleton } from '@/components/motion';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font, radius } from '@/lib/theme';
import { formatDate, storeBrandLabel, storeCategoryLabel } from '@/lib/format';
import type { PlaceSuggestion } from '@/lib/types';

const TABS = [{ key: 'pending', label: 'Menunggu' }, { key: 'approved', label: 'Aktif' }, { key: 'rejected', label: 'Ditolak' }, { key: 'all', label: 'Semua' }];
const STATUS_LABEL: Record<string, string> = { pending: 'Menunggu', approved: 'Aktif', rejected: 'Ditolak', merged: 'Digabung' };
const STATUS_COLOR: Record<string, string> = { pending: colors.warning, approved: colors.success, rejected: colors.danger, merged: colors.info };
const osm = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;

export default function AdminPlaces() {
  const [tab, setTab] = useState('pending');
  const [rows, setRows] = useState<PlaceSuggestion[] | null>(null);
  const [rule, setRule] = useState({ reports: 3, radius: 50 });
  const [reject, setReject] = useState<PlaceSuggestion | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, { data: st }] = await Promise.all([
        rpc<PlaceSuggestion[]>('admin_place_suggestions', { p_status: tab }),
        supabase.from('app_settings').select('key,value').in('key', ['place_auto_approve_reports', 'place_dedup_radius_m']),
      ]);
      setRows(list ?? []);
      const m = Object.fromEntries(((st as { key: string; value: unknown }[]) ?? []).map((r) => [r.key, Number(r.value)]));
      setRule({ reports: m.place_auto_approve_reports || 3, radius: m.place_dedup_radius_m || 50 });
    } catch (e) { toast.error((e as Error).message); setRows([]); }
  }, [tab]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const review = async (s: PlaceSuggestion, approve: boolean, note?: string) => {
    setBusyId(s.id);
    try {
      await rpc('admin_review_place_suggestion', { p_id: s.id, p_approve: approve, p_note: note ?? null });
      toast.success(approve ? `"${s.name}" disetujui & aktif untuk pelanggan` : `Usulan "${s.name}" ditolak`);
      setReject(null); load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusyId(null); }
  };

  const pending = rows?.filter((r) => r.status === 'pending').length ?? 0;
  const conflicts = rows?.filter((r) => (r.nearby_conflicts ?? 0) > 0 && r.status === 'pending').length ?? 0;
  const autoN = rows?.filter((r) => r.auto).length ?? 0;

  return (
    <AdminPage title="Usulan Data" subtitle="Toko & pasar yang diusulkan pelanggan dari titik lokasinya" onRefresh={load}>
      <ReasonPrompt visible={!!reject} title={`Tolak usulan "${reject?.name}"?`} subtitle="Alasan dikirim ke pengusul sebagai notifikasi." confirmLabel="Tolak usulan" optional quick={['Tempat tidak ditemukan di lokasi', 'Duplikat data yang sudah ada', 'Informasi tidak lengkap / tidak jelas', 'Sudah tutup permanen']} onCancel={() => setReject(null)} onSubmit={(r) => review(reject!, false, r || undefined)} />
      <Row gap={12} style={{ flexWrap: 'wrap' }}>
        <StatCard index={0} label="Menunggu (tab ini)" value={pending} color={colors.warning} />
        <StatCard index={1} label="Berpotensi duplikat" value={conflicts} hint={`usulan lain dalam ${rule.radius} m`} color={colors.danger} />
        <StatCard index={2} label="Disetujui otomatis" value={autoN} hint={`ambang ${rule.reports} laporan konsisten`} color={colors.success} />
      </Row>
      <Entrance index={1}>
        <Card style={{ backgroundColor: colors.tint, borderColor: colors.primary + '30', gap: 4 }}>
          <Row gap={8}><Ionicons name="sparkles-outline" size={16} color={colors.primary} /><Text style={[font.small, { color: colors.text, fontWeight: '700' }]}>Moderasi otomatis</Text></Row>
          <Text style={font.small}>Usulan yang sama (nama mirip dalam radius {rule.radius} m) digabung menjadi satu dan menambah hitungan laporan. Saat mencapai {rule.reports} laporan dari pengguna berbeda, tempat aktif otomatis tanpa tinjauan admin (ditandai "Otomatis"). Usulan pembaruan data toko/pasar yang sudah ada memperbarui kolom yang diisi saja. Ambang & radius diubah di halaman Otomasi.</Text>
        </Card>
      </Entrance>
      <FilterBar value={tab} onChange={setTab} options={TABS} />
      {rows === null ? <View style={{ gap: 12 }}><Skeleton height={140} radius={20} /><Skeleton height={140} radius={20} /></View>
        : rows.length === 0 ? <Card><Empty icon="map-outline" title="Tidak ada usulan" subtitle={tab === 'pending' ? 'Semua usulan sudah ditinjau.' : 'Belum ada data pada filter ini.'} /></Card>
        : rows.map((s, i) => (
          <Entrance key={s.id} index={Math.min(i, 8) + 2}>
            <Card style={{ gap: 12 }}>
              <Row gap={12} style={{ alignItems: 'flex-start' }}>
                {s.photo_url ? <Pressable onPress={() => Linking.openURL(s.photo_url!)}><Image source={{ uri: s.photo_url }} style={st.photo} /></Pressable> : <IconCircle name={s.kind === 'store' ? 'storefront-outline' : 'basket-outline'} size={64} color={s.kind === 'store' ? colors.shop : colors.market} />}
                <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Badge text={s.kind === 'store' ? 'Toko' : 'Pasar'} color={s.kind === 'store' ? colors.shop : colors.market} />
                    <Badge text={STATUS_LABEL[s.status] ?? s.status} color={STATUS_COLOR[s.status] ?? colors.textMuted} />
                    <Badge text={`${s.reports}/${rule.reports} laporan`} color={s.reports >= rule.reports ? colors.success : colors.info} />
                    {s.auto ? <Badge text="Otomatis" color={colors.success} /> : null}
                    {s.target_id && s.existing_name ? <Badge text={`memperbarui: ${s.existing_name}`} color={colors.info} /> : null}
                  </Row>
                  <Text style={[font.h3, { fontSize: 17 }]}>{s.name}</Text>
                  <Text style={font.small}>{[s.brand ? (storeBrandLabel[s.brand] ?? s.brand) : null, s.category ? (storeCategoryLabel[s.category] ?? s.category) : null].filter(Boolean).join(' · ') || 'Tanpa brand/kategori'}</Text>
                  {s.address ? <Row gap={6} style={{ alignItems: 'flex-start' }}><Ionicons name="location-outline" size={14} color={colors.textMuted} style={{ marginTop: 2 }} /><Text style={[font.small, { flex: 1 }]}>{s.address}</Text></Row> : null}
                  <Row gap={14} style={{ flexWrap: 'wrap' }}>
                    {s.open_hours ? <Row gap={4}><Ionicons name="time-outline" size={14} color={colors.textMuted} /><Text style={font.tiny}>{s.open_hours}</Text></Row> : null}
                    {s.phone ? <Row gap={4}><Ionicons name="call-outline" size={14} color={colors.textMuted} /><Text style={font.tiny}>{s.phone}</Text></Row> : null}
                    <Pressable onPress={() => Linking.openURL(osm(s.lat, s.lng))}><Row gap={4}><Ionicons name="navigate-outline" size={14} color={colors.primary} /><Text style={[font.tiny, { color: colors.primary, fontWeight: '700' }]}>{s.lat.toFixed(5)}, {s.lng.toFixed(5)} · buka peta</Text></Row></Pressable>
                  </Row>
                  {s.notes ? <Text style={[font.tiny, { fontStyle: 'italic' }]}>"{s.notes}"</Text> : null}
                  <Text style={font.tiny}>Pengusul {s.submitter ?? '-'} · {formatDate(s.created_at)}{s.reviewed_at ? ` · ditinjau ${formatDate(s.reviewed_at)}` : ''}{s.review_note ? ` · ${s.review_note}` : ''}</Text>
                  {(s.nearby_conflicts ?? 0) > 0 ? (
                    <View style={st.warn}><Ionicons name="warning-outline" size={16} color={colors.warning} /><Text style={[font.small, { color: colors.warning, fontWeight: '700', flex: 1 }]}>{s.nearby_conflicts} usulan lain dengan nama berbeda dalam radius {rule.radius} m — periksa duplikat sebelum menyetujui.</Text></View>
                  ) : null}
                </View>
              </Row>
              {s.status === 'pending' ? (
                <Row gap={8} style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Button size="sm" title="Tolak" variant="outline" color={colors.danger} onPress={() => setReject(s)} />
                  <Button size="sm" title={s.target_id ? 'Setujui pembaruan' : 'Setujui & aktifkan'} color={colors.success} icon="checkmark" loading={busyId === s.id} onPress={() => review(s, true)} />
                </Row>
              ) : null}
            </Card>
          </Entrance>
        ))}
    </AdminPage>
  );
}

const st = StyleSheet.create({
  photo: { width: 96, height: 96, borderRadius: radius.lg, backgroundColor: colors.bgSoft },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.warning + '44' },
});
