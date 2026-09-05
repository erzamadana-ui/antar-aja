// Usulan / pembaruan data toko & pasar dari pengguna (crowdsourcing) → suggest_place. Aktif otomatis setelah 3 laporan konsisten.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Row, Button, Badge, Input, Chip, toast } from '@/components/ui';
import { Entrance, PressableScale, Skeleton } from '@/components/motion';
import { ServiceIllustration } from '@/components/ServiceArt';
import { useAuth } from '@/store/auth';
import { useBooking } from '@/store/booking';
import { useCurrentLocation } from '@/hooks/useLocation';
import { reverseGeocode } from '@/lib/geo';
import { rpc } from '@/lib/supabase';
import { pickAndUpload } from '@/lib/upload';
import { colors, font, radius, shadow } from '@/lib/theme';
import { formatDateTimeShort, storeBrandLabel, storeCategoryLabel } from '@/lib/format';
import type { PlaceSuggestion } from '@/lib/types';

const BRANDS = ['indomaret', 'alfamart', 'apotek', 'supermarket', 'pasar_swalayan', 'lainnya'] as const;
const BRAND_LABEL: Record<string, string> = { ...storeBrandLabel, pasar_swalayan: 'Pasar swalayan', lainnya: 'Lainnya' };
const CATEGORIES = ['minimarket', 'apotek', 'supermarket', 'lainnya'] as const;
const CATEGORY_LABEL: Record<string, string> = { ...storeCategoryLabel, lainnya: 'Lainnya' };
const brandToCategory: Record<string, string> = { indomaret: 'minimarket', alfamart: 'minimarket', apotek: 'apotek', supermarket: 'supermarket', pasar_swalayan: 'supermarket' };
const NEED = 3;
const fmtCoord = (n: number) => n.toFixed(5).replace('.', ',');

const statusOf = (p: PlaceSuggestion): [string, string] =>
  p.status === 'approved' || p.status === 'merged' ? ['Aktif', colors.success]
    : p.status === 'rejected' ? ['Ditolak', colors.danger]
    : [`Menunggu konfirmasi · ${Math.min(p.reports, NEED)}/${NEED}`, colors.warning];

export default function SuggestPlace() {
  const router = useRouter();
  const { kind: kindParam, target, name: nameParam } = useLocalSearchParams<{ kind?: string; target?: string; name?: string }>();
  const kind: 'store' | 'market' = kindParam === 'market' ? 'market' : 'store';
  const isStore = kind === 'store';
  const session = useAuth((s) => s.session);
  const booking = useBooking();
  const { location, hasFix, refresh, loading: locating } = useCurrentLocation();

  const [f, setF] = useState({ name: nameParam ?? '', brand: 'lainnya', category: 'lainnya', address: '', open_hours: '', phone: '', notes: '', photo_url: '' });
  const [point, setPoint] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mine, setMine] = useState<PlaceSuggestion[] | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const useMyLocation = useCallback(async () => {
    const p = (await refresh()) ?? location;
    setPoint({ ...p, label: 'Lokasi saya saat ini' });
    if (!f.address) reverseGeocode(p).then((a) => setF((x) => (x.address ? x : { ...x, address: a }))).catch(() => {});
  }, [refresh, location, f.address]);
  useEffect(() => { if (hasFix && !point) useMyLocation(); }, [hasFix]); // eslint-disable-line react-hooks/exhaustive-deps

  // hasil dari place-picker (target generic)
  useEffect(() => {
    const r = booking.consumePickerResult();
    if (r && r.target === 'generic') { setPoint({ lat: r.place.lat, lng: r.place.lng, label: r.place.name ?? 'Titik dari peta' }); if (r.place.address) set('address')(r.place.address); }
  }, [booking.pickerResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMine = useCallback(() => { rpc<PlaceSuggestion[]>('my_place_suggestions').then((r) => setMine(r ?? [])).catch(() => setMine([])); }, []);
  useEffect(() => { loadMine(); }, [loadMine]);

  const upload = async () => {
    if (!session) return;
    setUploading(true);
    try { const r = await pickAndUpload('merchant-images', session.user.id); if (r) set('photo_url')(r.url); }
    catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); }
  };
  const submit = async () => {
    if (f.name.trim().length < 3) return toast.error(isStore ? 'Isi nama toko (minimal 3 huruf)' : 'Isi nama pasar (minimal 3 huruf)');
    if (!point) return toast.error('Tentukan titik lokasi dulu');
    setBusy(true);
    try {
      await rpc('suggest_place', { p: {
        kind, target_id: target || null, name: f.name.trim(), brand: isStore ? f.brand : null, category: isStore ? f.category : null,
        address: f.address.trim() || null, lat: point.lat, lng: point.lng, open_hours: f.open_hours.trim() || null, phone: f.phone.trim() || null, notes: f.notes.trim() || null, photo_url: f.photo_url || null,
      } });
      toast.success(`Terima kasih! Usulan aktif otomatis setelah ${NEED} pengguna mengonfirmasi`);
      if (router.canGoBack()) router.back(); else router.replace('/' as never);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const title = target ? (isStore ? 'Perbarui data toko' : 'Perbarui data pasar') : isStore ? 'Tambah toko' : 'Tambah pasar';
  return (
    <Screen title={title} subtitle={target ? 'Laporkan perubahan yang Anda temukan' : 'Bantu pengguna lain menemukan tempat ini'} band={isStore ? colors.shop : colors.market} back
      footer={<Button title="Kirim usulan" size="lg" icon="paper-plane-outline" loading={busy} onPress={submit} />}>
      <View style={{ gap: 14 }}>
        <Entrance index={0}>
          <View style={s.info}>
            <View style={s.infoIcon}><ServiceIllustration kind={isStore ? 'shop' : 'market'} size={30} /></View>
            <Text style={[font.small, { flex: 1, color: colors.text }]}>Data dicek silang dengan usulan pengguna lain. Setelah {NEED} laporan yang konsisten, {isStore ? 'toko' : 'pasar'} langsung aktif di aplikasi.</Text>
          </View>
        </Entrance>

        <Entrance index={1}><Card style={{ gap: 12 }}>
          <Text style={font.label}>{isStore ? 'Toko' : 'Pasar'}</Text>
          <Input label={isStore ? 'Nama toko' : 'Nama pasar'} placeholder={isStore ? 'Indomaret Sudirman' : 'Pasar Raya'} icon="storefront-outline" value={f.name} onChangeText={set('name')} />
          {isStore && (
            <>
              <Text style={font.tiny}>Merek / jenis</Text>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>{BRANDS.map((b) => <Chip key={b} label={BRAND_LABEL[b]} active={f.brand === b} onPress={() => setF((p) => ({ ...p, brand: b, category: brandToCategory[b] ?? p.category }))} />)}</Row>
              <Text style={font.tiny}>Kategori</Text>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>{CATEGORIES.map((c) => <Chip key={c} label={CATEGORY_LABEL[c]} active={f.category === c} onPress={() => set('category')(c)} />)}</Row>
            </>
          )}
          <Input label="Alamat" placeholder="Jalan, nomor, kelurahan" icon="location-outline" value={f.address} onChangeText={set('address')} />
          <Row gap={10}>
            <Input label="Jam buka" placeholder="07.00–22.00" icon="time-outline" value={f.open_hours} onChangeText={set('open_hours')} containerStyle={{ flex: 1 }} />
            <Input label="Telepon" placeholder="08xx" icon="call-outline" keyboardType="phone-pad" value={f.phone} onChangeText={set('phone')} containerStyle={{ flex: 1 }} />
          </Row>
          <Input label="Catatan" placeholder={target ? 'Apa yang berubah? (mis. sudah tutup permanen, pindah, jam buka baru)' : 'Info tambahan (mis. di dalam ruko, sebelah masjid)'} value={f.notes} onChangeText={set('notes')} multiline />
        </Card></Entrance>

        <Entrance index={2}><Card style={{ gap: 12 }}>
          <Text style={font.label}>Titik lokasi</Text>
          <Row gap={10}>
            <View style={[s.infoIcon, { backgroundColor: colors.tint }]}><Ionicons name={point ? 'location' : 'location-outline'} size={20} color={colors.primary} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{point ? point.label : locating ? 'Mencari lokasi Anda…' : 'Belum ada titik'}</Text>
              <Text style={font.tiny} numberOfLines={1}>{point ? `${fmtCoord(point.lat)}, ${fmtCoord(point.lng)}` : 'Berdiri di depan tempatnya lalu ketuk "Pakai lokasi saya"'}</Text>
            </View>
          </Row>
          <Row gap={8}>
            <Button title="Pakai lokasi saya" size="sm" variant="secondary" icon="navigate-outline" loading={locating} onPress={useMyLocation} style={{ flex: 1 }} />
            <Button title="Pilih di peta" size="sm" variant="outline" icon="map-outline" onPress={() => router.push({ pathname: '/place-picker', params: { target: 'generic', title: isStore ? 'Lokasi toko' : 'Lokasi pasar' } } as never)} style={{ flex: 1 }} />
          </Row>
        </Card></Entrance>

        <Entrance index={3}><Card style={{ gap: 12 }}>
          <Text style={font.label}>Foto (opsional)</Text>
          <PressableScale onPress={upload} scaleTo={0.985} haptic={false} style={[s.photoBox, f.photo_url && { borderColor: colors.success, borderStyle: 'solid' }]}>
            {f.photo_url ? <Image source={{ uri: f.photo_url }} style={s.photo} /> : <View style={s.infoIcon}><Ionicons name="image-outline" size={20} color={colors.primary} /></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{f.photo_url ? 'Foto terunggah · ketuk untuk ganti' : uploading ? 'Mengunggah…' : 'Unggah foto tampak depan'}</Text>
              <Text style={font.tiny}>Foto membantu usulan lebih cepat dikonfirmasi.</Text>
            </View>
          </PressableScale>
        </Card></Entrance>

        <Entrance index={4}>
          <View style={{ gap: 8 }}>
            <Row between><Text style={font.h3}>Usulan saya</Text>{mine && <Text style={font.tiny}>{mine.length} usulan</Text>}</Row>
            {mine === null ? <View style={s.row}><Skeleton width={44} height={44} radius={22} /><View style={{ flex: 1, gap: 6 }}><Skeleton width="60%" height={14} /><Skeleton width="40%" height={12} /></View></View>
              : mine.length === 0 ? <Text style={font.small}>Belum ada usulan. Usulan yang Anda kirim atau dukung akan tampil di sini.</Text>
              : mine.map((p) => {
                const [label, color] = statusOf(p);
                return (
                  <View key={p.id} style={s.row}>
                    <View style={[s.infoIcon, { backgroundColor: colors.tint }]}><Ionicons name={p.kind === 'store' ? 'storefront-outline' : 'basket-outline'} size={20} color={colors.primary} /></View>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>{p.name}{p.target_id ? ' · pembaruan' : ''}</Text>
                      <Text style={font.tiny} numberOfLines={1}>{p.kind === 'store' ? 'Toko' : 'Pasar'} · {formatDateTimeShort(p.created_at)}{p.address ? ` · ${p.address}` : ''}</Text>
                      <Badge text={label} color={color} />
                      {p.review_note ? <Text style={[font.tiny, { color: p.status === 'rejected' ? colors.danger : colors.textSecondary }]}>{p.review_note}</Text> : null}
                    </View>
                  </View>
                );
              })}
          </View>
        </Entrance>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  info: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.primaryLight },
  infoIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  photoBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.bgSoft },
  photo: { width: 64, height: 64, borderRadius: 14, backgroundColor: colors.tint },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, ...shadow.soft },
});
