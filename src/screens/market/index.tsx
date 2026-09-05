// AntarMarket — belanja ke pasar tradisional: harga acuan hari ini, driver kirim foto nota & harga riil; pelanggan bayar harga riil + jasa belanja.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Row, Button, Badge, Input, Chip, Empty, toast } from '@/components/ui';
import { Entrance, PressableScale, Skeleton } from '@/components/motion';
import { PaymentSection, PriceSummary, paidViaOf, handleShortfall, type PayChoice } from '@/components/BookingSheet';
import { usePayPrefs } from '@/store/payprefs';
import { useBooking } from '@/store/booking';
import { useAuth } from '@/store/auth';
import { useCurrentLocation } from '@/hooks/useLocation';
import { getRoute, reverseGeocode, type RouteResult } from '@/lib/geo';
import { rpc } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import { ServiceIllustration } from '@/components/ServiceArt';
import { rupiah, km, minutes, marketCategoryLabel } from '@/lib/format';
import type { Market, MarketItem, Order, ShoppingEstimate } from '@/lib/types';

type Vehicle = 'motor' | 'car';
type Line = { qty: number; note: string };

const priceSourceLabel = (source: string, samples?: number) =>
  source === 'pasar' ? 'survei pasar' : source === 'nota_driver' ? `nota driver (${samples ?? 0})` : 'acuan admin';
const fmtQty = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export default function MarketScreen() {
  const router = useRouter();
  const { dropoff, setDropoff } = useBooking();
  const { location, hasFix } = useCurrentLocation();
  const refreshWallet = useAuth((s) => s.refreshWallet);
  const payPrefs = usePayPrefs((st) => st.prefs);

  const [markets, setMarkets] = useState<Market[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [market, setMarket] = useState<Market | null>(null);
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [gridW, setGridW] = useState(0);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle>('motor');
  const vehicleManual = useRef(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [est, setEst] = useState<ShoppingEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [method, setMethod] = useState<PayChoice>('wallet');
  const [promo, setPromo] = useState(''); const [discount, setDiscount] = useState(0); const [notes, setNotes] = useState('');
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    if (!dropoff && hasFix) reverseGeocode(location).then((address) => { if (!useBooking.getState().dropoff) setDropoff({ ...location, address, name: 'Lokasi saya' }); });
  }, [hasFix]); // eslint-disable-line react-hooks/exhaustive-deps

  // pasar terdekat
  useEffect(() => {
    let cancelled = false;
    setLoadingMarkets(true);
    rpc<Market[]>('nearby_markets', { p_lat: location.lat, p_lng: location.lng, p_radius_km: 25 })
      .then((r) => { if (cancelled) return; const list = r ?? []; setMarkets(list); setMarket((m) => m ?? list[0] ?? null); })
      .catch(() => { if (!cancelled) setMarkets([]); })
      .finally(() => { if (!cancelled) setLoadingMarkets(false); });
    return () => { cancelled = true; };
  }, [location.lat, location.lng]);

  // katalog bahan pasar terpilih
  useEffect(() => {
    if (!market) { setItems([]); return; }
    let cancelled = false;
    setLoadingItems(true);
    rpc<MarketItem[]>('market_catalog', { p_market: market.id })
      .then((r) => { if (!cancelled) setItems(r ?? []); })
      .catch((e: Error) => { if (!cancelled) { setItems([]); toast.error(e.message); } })
      .finally(() => { if (!cancelled) setLoadingItems(false); });
    return () => { cancelled = true; };
  }, [market?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))), [items]);
  const ql = q.trim().toLowerCase();
  const shown = items.filter((i) => (cat === 'all' || i.category === cat) && (!ql || i.name.toLowerCase().includes(ql)));
  const chosen = items.filter((i) => (lines[i.id]?.qty ?? 0) > 0);
  const subtotal = chosen.reduce((a, i) => a + i.price * (lines[i.id]?.qty ?? 0), 0);
  const setQty = (id: string, qty: number) => setLines((l) => {
    const v = Math.max(0, Math.min(50, Math.round(qty * 2) / 2));
    if (v <= 0) { const { [id]: _drop, ...rest } = l; return rest; }
    return { ...l, [id]: { qty: v, note: l[id]?.note ?? '' } };
  });
  const setNote = (id: string, note: string) => setLines((l) => (l[id] ? { ...l, [id]: { ...l[id], note } } : l));

  useEffect(() => {
    if (!market || !dropoff) { setRoute(null); return; }
    let cancelled = false;
    getRoute(market, dropoff).then((r) => { if (!cancelled) setRoute(r); }).catch(() => { if (!cancelled) setRoute(null); });
    return () => { cancelled = true; };
  }, [market?.lat, market?.lng, dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!market || !dropoff) { setEst(null); setEstimating(false); return; }
    let cancelled = false;
    setEstimating(true);
    const t = setTimeout(async () => {
      const r = await rpc<ShoppingEstimate>('shopping_estimate', { p_service: 'market', p_pickup_lat: market.lat, p_pickup_lng: market.lng, p_drop_lat: dropoff.lat, p_drop_lng: dropoff.lng, p_subtotal: Math.round(subtotal), p_vehicle: vehicle, p_route_km: route?.distance_km ?? null }).catch(() => null);
      if (cancelled) return;
      setEst(r); setEstimating(false);
      if (r && !vehicleManual.current) setVehicle(subtotal >= r.car_min_budget ? 'car' : 'motor');
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [market?.lat, market?.lng, dropoff?.lat, dropoff?.lng, subtotal, vehicle, route?.distance_km]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = est ? Math.max(0, est.fare + est.platform_fee + est.service_fee - discount) + subtotal : 0;
  const ready = !!market && !!dropoff && !!est && chosen.length > 0;
  const pickVehicle = (v: Vehicle) => { vehicleManual.current = true; setVehicle(v); };

  const order = async () => {
    if (!market || !dropoff || !est || chosen.length === 0) return;
    setOrdering(true);
    try {
      const o = await rpc<Order>('create_order', { p: {
        service: 'market', market_id: market.id, dropoff: { lat: dropoff.lat, lng: dropoff.lng, address: dropoff.address },
        route_km: route?.distance_km, duration_min: route?.duration_min, route_geometry: route?.coords,
        payment_method: method === 'ewallet' ? 'wallet' : method, paid_via: paidViaOf(method, payPrefs?.ewallet), promo_code: promo || null, notes: notes || null, shop_vehicle: vehicle,
        shopping_list: chosen.map((i) => ({ item_id: i.id, name: i.name, qty: lines[i.id]?.qty ?? 1, note: lines[i.id]?.note?.trim() || null })),
      } });
      await refreshWallet(); useBooking.getState().reset();
      router.replace(`/order/${o.id}` as never);
    } catch (e) { if (!handleShortfall(e, router, payPrefs?.ewallet)) toast.error((e as Error).message); }
    setOrdering(false);
  };

  const colW = gridW ? Math.floor((gridW - 12) / 2) : 160;
  const footer = (
    <View style={{ gap: 8 }}>
      <Row between>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={font.tiny}>Perkiraan total · disesuaikan nota</Text>
          <Text style={[font.h1, { color: colors.primary }]}>{ready && !estimating ? rupiah(total) : chosen.length ? 'Menghitung…' : rupiah(0)}</Text>
        </View>
        <Badge text="Dana ditahan · sisa dikembalikan" color={colors.primary} />
      </Row>
      <Button title={chosen.length === 0 ? 'Pilih bahan belanja dulu' : 'Pesan ke pasar'} size="lg" disabled={!ready || ordering} loading={ordering} onPress={order} />
    </View>
  );

  return (
    <Screen title="AntarMarket" subtitle="Pasar tradisional · harga riil saat dibeli" band={colors.market} back ambient={false} bottomSpace={24} footer={footer}>
      <View style={{ gap: 14 }}>
        <Entrance index={0}>
          <View style={{ gap: 8 }}>
            <Row between><Text style={font.h3}>{market ? 'Pasar dipilih' : 'Pasar terdekat'}</Text>{!loadingMarkets && !market && <Text style={font.tiny}>{markets.length} pasar</Text>}</Row>
            {loadingMarkets ? [0, 1].map((i) => <View key={i} style={s.marketRow}><Skeleton width={64} height={64} radius={16} /><View style={{ flex: 1, gap: 6 }}><Skeleton width="60%" height={14} /><Skeleton width="40%" height={12} /></View></View>)
              : markets.length === 0 ? <Text style={font.small}>Belum ada pasar mitra di sekitar lokasi Anda.</Text>
              : (market ? [market] : markets).map((m, i) => {
                const active = market?.id === m.id;
                return (
                  <Entrance key={m.id} index={i}>
                    <PressableScale onPress={() => { if (active) { setMarket(null); setLines({}); setCat('all'); } else { setMarket(m); setLines({}); setCat('all'); } }} scaleTo={0.985} haptic={false} style={[s.marketRow, active && { borderColor: colors.primary }]}>
                      {m.image_url ? <Image source={{ uri: m.image_url }} style={s.marketImg} /> : <View style={[s.marketImg, { alignItems: 'center', justifyContent: 'center' }]}><ServiceIllustration kind="market" size={40} /></View>}
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Row gap={6}><Text style={[font.body, { fontWeight: '700', flexShrink: 1 }]} numberOfLines={1}>{m.name}</Text><Badge text={m.is_open_now === false ? 'Tutup' : 'Buka'} color={m.is_open_now === false ? colors.danger : colors.success} /></Row>
                        <Row gap={4}><Ionicons name="location-outline" size={12} color={colors.textMuted} /><Text style={font.tiny} numberOfLines={1}>{km(m.distance_km)}{m.address ? ` · ${m.address}` : ''}</Text></Row>
                        {active ? <Text style={font.tiny} numberOfLines={1}>{m.open_hours ? `${m.open_hours}` : 'Jam buka menyesuaikan pasar'}{route ? ` · ${minutes(route.duration_min)} ke alamat` : ''}</Text> : null}
                      </View>
                      {active ? <Button title="Ganti" size="sm" variant="secondary" onPress={() => { setMarket(null); setLines({}); setCat('all'); }} /> : <View style={s.rowArrow}><Ionicons name="arrow-forward" size={16} color={colors.primary} /></View>}
                    </PressableScale>
                  </Entrance>
                );
              })}
          </View>
        </Entrance>

        <Entrance index={1}>
          <View style={s.info}>
            <View style={s.infoIcon}><Ionicons name="information-circle-outline" size={20} color={colors.primary} /></View>
            <Text style={[font.small, { flex: 1, color: colors.text }]}>Harga di bawah adalah acuan hari ini. Driver mengirim foto nota & harga riil; kamu hanya bayar harga riil + jasa belanja.</Text>
          </View>
        </Entrance>

        <Entrance index={2}><Input icon="search" placeholder="Cari bahan (mis. cabai, ayam, bawang)" value={q} onChangeText={setQ} /></Entrance>
        {categories.length > 1 && (
          <Entrance index={3}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="Semua" active={cat === 'all'} onPress={() => setCat('all')} />
              {categories.map((c) => <Chip key={c} label={marketCategoryLabel[c] ?? c} active={cat === c} onPress={() => setCat(c)} />)}
            </ScrollView>
          </Entrance>
        )}

        {/* Daftar bahan — grid 2 kolom */}
        <View style={{ gap: 10 }}>
          <Row between><Text style={font.h3}>Bahan belanja</Text>{chosen.length > 0 && <Badge text={`${chosen.length} dipilih`} color={colors.primary} />}</Row>
          <View onLayout={(e) => setGridW(e.nativeEvent.layout.width)} style={s.grid}>
            {loadingItems ? [0, 1, 2, 3].map((i) => <View key={i} style={[s.tile, { width: colW }]}><Skeleton width="100%" height={100} radius={18} /><Skeleton width="70%" height={14} /><Skeleton width="50%" height={12} /></View>)
              : !market ? <View style={{ width: '100%' }}><Empty icon="basket-outline" title="Pilih pasar dulu" subtitle="Katalog bahan mengikuti pasar yang dipilih." /></View>
              : shown.length === 0 ? <View style={{ width: '100%' }}><Empty icon="leaf-outline" title="Bahan tidak ditemukan" subtitle={ql ? `Tidak ada "${q}" di katalog pasar ini.` : 'Katalog pasar ini masih kosong.'} /></View>
              : shown.map((it) => {
                const line = lines[it.id];
                const qty = line?.qty ?? 0;
                const isKg = it.unit.toLowerCase() === 'kg';
                return (
                  <View key={it.id} style={[s.tile, { width: colW }, qty > 0 && { borderColor: colors.primary }]}>
                    <View style={s.tileArt}>
                      {it.image_url ? <Image source={{ uri: it.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <ServiceIllustration kind="market" size={52} />}
                      {qty > 0 && <View style={s.qtyPill}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{fmtQty(qty)} {it.unit}</Text></View>}
                    </View>
                    <View style={{ paddingHorizontal: 4, gap: 2 }}>
                      <Text style={[font.small, { color: colors.text, fontWeight: '700', minHeight: 36 }]} numberOfLines={2}>{it.name}</Text>
                      <Text style={font.tiny} numberOfLines={1}>per {it.unit} · {priceSourceLabel(it.price_source, it.samples)}</Text>
                      <Row between style={{ marginTop: 4 }}>
                        <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 15, flexShrink: 1 }} numberOfLines={1}>±{rupiah(it.price)}</Text>
                        {qty === 0 && <PressableScale haptic={false} onPress={() => setQty(it.id, qty + 1)} scaleTo={0.88} style={s.addBtn} accessibilityRole="button" accessibilityLabel="Tambah"><Ionicons name="add" size={20} color="#fff" /></PressableScale>}
                      </Row>
                      {qty > 0 && (
                        <Row between style={{ marginTop: 6 }}>
                          <Row gap={6}>
                            <PressableScale haptic={false} onPress={() => setQty(it.id, qty - 1)} style={s.miniBtn}><Ionicons name="remove" size={14} color={colors.primary} /></PressableScale>
                            <Text style={{ fontWeight: '800', color: colors.text, minWidth: 24, textAlign: 'center', fontSize: 13 }}>{fmtQty(qty)}</Text>
                            <PressableScale haptic={false} onPress={() => setQty(it.id, qty + 1)} style={[s.miniBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]} accessibilityRole="button" accessibilityLabel="Tambah satu"><Ionicons name="add" size={14} color="#fff" /></PressableScale>
                            {isKg && <PressableScale haptic={false} onPress={() => setQty(it.id, qty + 0.5)} style={s.halfBtn}><Text style={{ fontWeight: '800', color: colors.primary, fontSize: 12 }}>+½</Text></PressableScale>}
                          </Row>
                          <PressableScale haptic={false} hitSlop={6} onPress={() => setNoteOpen((n) => (n === it.id ? null : it.id))}><Ionicons name={line?.note ? 'chatbox-ellipses' : 'chatbox-ellipses-outline'} size={18} color={line?.note ? colors.primary : colors.textMuted} /></PressableScale>
                        </Row>
                      )}
                      {qty > 0 && <Text style={[font.tiny, { color: colors.text, fontWeight: '700' }]}>Subtotal ±{rupiah(it.price * qty)}</Text>}
                      {qty > 0 && noteOpen === it.id && (
                        <TextInput placeholder="Catatan (mis. yang merah)" placeholderTextColor={colors.textMuted} value={line?.note ?? ''} onChangeText={(v) => setNote(it.id, v)} style={s.noteInput} />
                      )}
                    </View>
                  </View>
                );
              })}
          </View>
        </View>

        {/* Alamat antar */}
        <Card solid style={{ gap: 10 }}>
          <Text style={font.label}>Antar ke</Text>
          <Row gap={10}>
            <View style={[s.infoIcon, { backgroundColor: colors.dangerLight }]}><Ionicons name="location-outline" size={20} color={colors.danger} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{dropoff?.name ?? 'Alamat pengantaran'}</Text>
              <Text style={font.tiny} numberOfLines={2}>{dropoff?.address ?? 'Menentukan lokasi Anda…'}</Text>
            </View>
            <Button title="Ganti" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/place-picker', params: { target: 'dropoff', title: 'Alamat pengantaran' } } as never)} />
          </Row>
          {route && <Row gap={8}><Badge text={`${km(route.distance_km)} · ${minutes(route.duration_min)}`} color={colors.info} /></Row>}
        </Card>

        {/* Kendaraan */}
        <Card solid style={{ gap: 10 }}>
          <Text style={font.label}>Kendaraan driver</Text>
          <Row gap={8}>
            <Chip label={`Motor${est ? ` · ${rupiah(est.fare_motor)}` : ' · ≤10 kg'}`} active={vehicle === 'motor'} onPress={() => pickVehicle('motor')} />
            <Chip label={`Mobil${est ? ` · ${rupiah(est.fare_car)}` : ' · belanja besar'}`} active={vehicle === 'car'} onPress={() => pickVehicle('car')} />
          </Row>
          {est && subtotal >= est.car_min_budget && <Text style={[font.tiny, { color: vehicle === 'car' ? colors.textMuted : colors.warning }]}>Belanja di atas {rupiah(est.car_min_budget)} disarankan memakai mobil agar muat dan aman.</Text>}
        </Card>

        {/* Rincian & pembayaran */}
        {market && dropoff && (
          <Card solid style={{ gap: 8 }}>
            {est ? <PriceSummary rows={[{ label: 'Belanja (acuan)', value: subtotal }, { label: 'Jasa belanja driver', value: est.service_fee }, { label: `Ongkir ${vehicle === 'car' ? 'mobil' : 'motor'} (${km(est.distance_km)})`, value: est.fare }, { label: 'Biaya layanan', value: est.platform_fee }, { label: 'Diskon promo', value: discount, minus: true }]} total={total} />
              : <View style={{ gap: 8 }}><Skeleton width="60%" height={14} /><Skeleton width="40%" height={14} /><Skeleton width="70%" height={14} /></View>}
            <Text style={font.tiny}>Dana yang ditahan = acuan + cadangan 10%. Setelah driver mengirim nota, total disesuaikan dengan harga riil dan sisanya dikembalikan ke AntarPay.</Text>
          </Card>
        )}
        <Card solid>
          <PaymentSection method={method} onMethod={setMethod} promo={promo} onPromo={setPromo} notes={notes} onNotes={setNotes} subtotal={est?.fare ?? 0} service="market" onDiscount={setDiscount} notesPlaceholder="Catatan untuk driver (mis. pilih yang segar, lapak langganan)" />
        </Card>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  marketRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, ...shadow.soft },
  marketImg: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.tint },
  rowArrow: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint },
  info: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.primaryLight },
  infoIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { gap: 8, padding: 8, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, ...shadow.soft },
  tileArt: { height: 100, borderRadius: 18, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  qtyPill: { position: 'absolute', left: 8, top: 8, backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  miniBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  halfBtn: { height: 28, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  noteInput: { height: 40, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSoft, paddingHorizontal: 12, color: colors.text, fontSize: 13, marginTop: 6 },
});
