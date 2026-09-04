// AntarShop — belanja dari katalog toko terdekat (Indomaret/Alfamart/apotek/supermarket) atau barang bebas dari toko lain; driver belanjakan.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Row, Button, Badge, Input, Chip, Stepper, Empty, toast } from '@/components/ui';
import { Entrance, PressableScale, Skeleton } from '@/components/motion';
import { PaymentSection, PriceSummary, paidViaOf, handleShortfall, type PayChoice } from '@/components/BookingSheet';
import { usePayPrefs } from '@/store/payprefs';
import { useBooking } from '@/store/booking';
import { useAuth } from '@/store/auth';
import { useCurrentLocation } from '@/hooks/useLocation';
import { getRoute, reverseGeocode, type RouteResult } from '@/lib/geo';
import { rpc } from '@/lib/supabase';
import { colors, font, radius } from '@/lib/theme';
import { rupiah, km, minutes, storeCategoryLabel, productCategoryLabel } from '@/lib/format';
import type { CartLine, Order, Place, ShopProduct, ShopStore, ShoppingEstimate } from '@/lib/types';

const FILTERS: { key: string; label: string; category: string | null }[] = [
  { key: 'all', label: 'Semua', category: null },
  { key: 'indomaret', label: 'Indomaret', category: 'indomaret' },
  { key: 'alfamart', label: 'Alfamart', category: 'alfamart' },
  { key: 'apotek', label: 'Apotek', category: 'apotek' },
  { key: 'supermarket', label: 'Supermarket', category: 'supermarket' },
  { key: 'free', label: 'Toko lain', category: null },
];
const BUDGETS = [50000, 100000, 200000, 300000, 500000];
type FreeItem = { name: string; qty: number; price: number };
type Vehicle = 'motor' | 'car';

export default function ShopScreen() {
  const router = useRouter();
  const { pickup, dropoff, setPickup, setDropoff } = useBooking();
  const { location, hasFix } = useCurrentLocation();
  const refreshWallet = useAuth((s) => s.refreshWallet);
  const payPrefs = usePayPrefs((st) => st.prefs);

  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [stores, setStores] = useState<ShopStore[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [store, setStore] = useState<ShopStore | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [freeItems, setFreeItems] = useState<FreeItem[]>([{ name: '', qty: 1, price: 0 }]);
  const [budget, setBudget] = useState(100000);
  const [vehicle, setVehicle] = useState<Vehicle>('motor');
  const vehicleManual = useRef(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [est, setEst] = useState<ShoppingEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [method, setMethod] = useState<PayChoice>('wallet');
  const [promo, setPromo] = useState(''); const [discount, setDiscount] = useState(0); const [notes, setNotes] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [gridW, setGridW] = useState(0);

  const free = filter === 'free';
  const origin: Place | null = free ? pickup : store ? { lat: store.lat, lng: store.lng, address: store.address ?? store.name, name: store.name } : null;

  // alamat antar = lokasi saya (default)
  useEffect(() => {
    if (!dropoff && hasFix) reverseGeocode(location).then((address) => { if (!useBooking.getState().dropoff) setDropoff({ ...location, address, name: 'Lokasi saya' }); });
  }, [hasFix]); // eslint-disable-line react-hooks/exhaustive-deps

  // toko terdekat sesuai filter
  useEffect(() => {
    if (free) return;
    let cancelled = false;
    setLoadingStores(true);
    const f = FILTERS.find((x) => x.key === filter);
    rpc<ShopStore[]>('nearby_stores', { p_lat: location.lat, p_lng: location.lng, p_radius_km: 15, p_category: f?.category ?? null })
      .then((r) => { if (!cancelled) setStores(r ?? []); })
      .catch(() => { if (!cancelled) setStores([]); })
      .finally(() => { if (!cancelled) setLoadingStores(false); });
    return () => { cancelled = true; };
  }, [filter, free, location.lat, location.lng]);

  // katalog toko terpilih
  useEffect(() => {
    if (!store) { setProducts([]); return; }
    let cancelled = false;
    setLoadingProducts(true); setCat('all');
    rpc<ShopProduct[]>('store_products', { p_store: store.id, p_q: null, p_category: null })
      .then((r) => { if (!cancelled) setProducts(r ?? []); })
      .catch((e: Error) => { if (!cancelled) { setProducts([]); toast.error(e.message); } })
      .finally(() => { if (!cancelled) setLoadingProducts(false); });
    return () => { cancelled = true; };
  }, [store?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))), [products]);
  const ql = q.trim().toLowerCase();
  const shownStores = stores.filter((st) => !ql || st.name.toLowerCase().includes(ql) || (st.address ?? '').toLowerCase().includes(ql));
  const shownProducts = products.filter((p) => (cat === 'all' || p.category === cat) && (!ql || p.name.toLowerCase().includes(ql)));

  const qtyOf = (id: string) => cart.find((l) => l.product_id === id)?.qty ?? 0;
  const setQty = (p: ShopProduct, qty: number) => setCart((c) => {
    if (qty <= 0) return c.filter((l) => l.product_id !== p.id);
    if (c.some((l) => l.product_id === p.id)) return c.map((l) => (l.product_id === p.id ? { ...l, qty } : l));
    return [...c, { key: p.id, product_id: p.id, name: p.name, qty, unit: p.unit, price: p.price }];
  });
  const selectStore = (st: ShopStore) => { if (st.id !== store?.id) setCart([]); setStore(st); setQ(''); };

  const cartSubtotal = cart.reduce((a, l) => a + l.price * l.qty, 0);
  const validFree = freeItems.filter((i) => i.name.trim().length > 0);
  const freeSubtotal = validFree.reduce((a, i) => a + i.price * i.qty, 0);
  const subtotal = free ? Math.max(freeSubtotal, budget) : cartSubtotal;

  // rute toko → alamat antar
  useEffect(() => {
    if (!origin || !dropoff) { setRoute(null); return; }
    let cancelled = false;
    getRoute(origin, dropoff).then((r) => { if (!cancelled) setRoute(r); }).catch(() => { if (!cancelled) setRoute(null); });
    return () => { cancelled = true; };
  }, [origin?.lat, origin?.lng, dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // estimasi biaya (debounce saat subtotal/kendaraan berubah)
  useEffect(() => {
    if (!origin || !dropoff) { setEst(null); setEstimating(false); return; }
    let cancelled = false;
    setEstimating(true);
    const t = setTimeout(async () => {
      const r = await rpc<ShoppingEstimate>('shopping_estimate', { p_service: 'shop', p_pickup_lat: origin.lat, p_pickup_lng: origin.lng, p_drop_lat: dropoff.lat, p_drop_lng: dropoff.lng, p_subtotal: Math.round(subtotal), p_vehicle: vehicle, p_route_km: route?.distance_km ?? null }).catch(() => null);
      if (cancelled) return;
      setEst(r); setEstimating(false);
      if (r && !vehicleManual.current) setVehicle(subtotal >= r.car_min_budget ? 'car' : 'motor');
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [origin?.lat, origin?.lng, dropoff?.lat, dropoff?.lng, subtotal, vehicle, route?.distance_km]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = est ? Math.max(0, est.fare + est.platform_fee + est.service_fee - discount) + subtotal : 0;
  const ready = !!dropoff && !!est && (free ? !!pickup && validFree.length > 0 : !!store && cart.length > 0);
  const pickVehicle = (v: Vehicle) => { vehicleManual.current = true; setVehicle(v); };

  const order = async () => {
    if (!dropoff || !est) return;
    const base = {
      service: 'shop', dropoff: { lat: dropoff.lat, lng: dropoff.lng, address: dropoff.address },
      route_km: route?.distance_km, duration_min: route?.duration_min, route_geometry: route?.coords,
      payment_method: method === 'ewallet' ? 'wallet' : method, paid_via: paidViaOf(method, payPrefs?.ewallet), promo_code: promo || null, notes: notes || null, shop_vehicle: vehicle,
    };
    let p: Record<string, unknown>;
    if (free) {
      if (!pickup) { toast.error('Pilih toko lewat peta dulu'); return; }
      if (validFree.length === 0) { toast.error('Isi minimal 1 barang'); return; }
      p = { ...base, pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.address }, shop_store: pickup.name ?? 'Toko lain', shopping_list: validFree.map((i) => ({ name: i.name.trim(), qty: i.qty, price: i.price || null, unit: 'pcs' })), est_budget: budget };
    } else {
      if (!store || cart.length === 0) { toast.error('Keranjang masih kosong'); return; }
      p = { ...base, shop_store_id: store.id, shopping_list: cart.map((l) => ({ product_id: l.product_id, name: l.name, qty: l.qty, note: l.note ?? null })) };
    }
    setOrdering(true);
    try {
      const o = await rpc<Order>('create_order', { p });
      await refreshWallet(); useBooking.getState().reset();
      router.replace(`/order/${o.id}` as never);
    } catch (e) { if (!handleShortfall(e, router, payPrefs?.ewallet)) toast.error((e as Error).message); }
    setOrdering(false);
  };

  const footerTitle = !ready ? (free ? 'Lengkapi toko & daftar belanja' : store ? (cart.length ? 'Menghitung…' : 'Pilih barang dulu') : 'Pilih toko dulu') : estimating ? 'Menghitung…' : `Pesan AntarShop · ${rupiah(total)}`;
  const colW = gridW ? Math.floor((gridW - 16) / 3) : 100;

  return (
    <Screen title="AntarShop" subtitle="Belanja dari toko terdekat · dibelikan driver" band={colors.shop} back ambient={false} bottomSpace={24}
      footer={<Button title={footerTitle} size="lg" color={colors.shop} disabled={!ready || ordering} loading={ordering} onPress={order} />}>
      <View style={{ gap: 14 }}>
        <Entrance index={0}><Input icon="search" placeholder={store ? `Cari barang di ${store.name}` : 'Cari toko atau alamat'} value={q} onChangeText={setQ} /></Entrance>
        <Entrance index={1}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {FILTERS.map((f) => <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => { setFilter(f.key); setStore(null); setCart([]); setQ(''); if (f.key === 'free' && pickup?.name === 'Lokasi saya') setPickup(null); }} color={colors.shop} />)}
          </ScrollView>
        </Entrance>

        {/* Daftar toko */}
        {!free && !store && (
          <Entrance index={2}>
            <View style={{ gap: 8 }}>
              <Row between><Text style={font.label}>Toko terdekat</Text><Text style={font.tiny}>{loadingStores ? 'Mencari…' : `${shownStores.length} toko`}</Text></Row>
              {loadingStores ? [0, 1, 2].map((i) => <View key={i} style={s.storeCard}><Skeleton width={44} height={44} radius={12} /><View style={{ flex: 1, gap: 6 }}><Skeleton width="60%" height={14} /><Skeleton width="40%" height={12} /></View></View>)
                : shownStores.length === 0 ? <Empty icon="storefront-outline" title="Belum ada toko di sekitar" subtitle="Coba filter lain, atau pesan barang bebas lewat Toko lain." action={<Button title="Toko lain" size="sm" variant="secondary" color={colors.shop} onPress={() => setFilter('free')} />} />
                : shownStores.map((st, i) => (
                  <Entrance key={st.id} index={i}>
                    <PressableScale onPress={() => selectStore(st)} scaleTo={0.985} haptic={false} style={s.storeCard}>
                      {st.image_url ? <Image source={{ uri: st.image_url }} style={s.storeIcon} /> : <View style={[s.storeIcon, { backgroundColor: colors.shop + '1A', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name={st.category === 'apotek' ? 'medkit' : 'storefront'} size={20} color={colors.shop} /></View>}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>{st.name}</Text>
                        <Text style={font.tiny} numberOfLines={1}>{storeCategoryLabel[st.category] ?? st.category} · {km(st.distance_km)}{st.open_hours ? ` · ${st.open_hours}` : ''}</Text>
                        {st.product_count != null && <Text style={font.tiny}>{st.product_count} produk</Text>}
                      </View>
                      <Badge text={st.is_open_now === false ? 'Tutup' : 'Buka'} color={st.is_open_now === false ? colors.danger : colors.success} />
                    </PressableScale>
                  </Entrance>
                ))}
            </View>
          </Entrance>
        )}

        {/* Katalog toko terpilih */}
        {!free && store && (
          <Entrance index={2}>
            <View style={{ gap: 10 }}>
              <View style={s.storeCard}>
                <View style={[s.storeIcon, { backgroundColor: colors.shop + '1A', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="storefront" size={20} color={colors.shop} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>{store.name}</Text>
                  <Text style={font.tiny} numberOfLines={1}>{km(store.distance_km)}{store.open_hours ? ` · ${store.open_hours}` : ''}{route ? ` · ${minutes(route.duration_min)} ke alamat` : ''}</Text>
                </View>
                <Button title="Ganti" size="sm" variant="outline" color={colors.shop} onPress={() => { setStore(null); setCart([]); setQ(''); }} />
              </View>
              {categories.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Chip label="Semua" active={cat === 'all'} onPress={() => setCat('all')} color={colors.shop} />
                  {categories.map((c) => <Chip key={c} label={productCategoryLabel[c] ?? c} active={cat === c} onPress={() => setCat(c)} color={colors.shop} />)}
                </ScrollView>
              )}
              <View onLayout={(e) => setGridW(e.nativeEvent.layout.width)} style={s.grid}>
                {loadingProducts ? [0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={[s.tile, { width: colW }]}><Skeleton width="100%" height={56} radius={12} /><Skeleton width="80%" height={12} /><Skeleton width="50%" height={12} /></View>)
                  : shownProducts.length === 0 ? <View style={{ width: '100%' }}><Empty icon="cube-outline" title="Barang tidak ditemukan" subtitle={ql ? `Tidak ada "${q}" di katalog toko ini.` : 'Katalog toko ini masih kosong.'} /></View>
                  : shownProducts.map((p) => <ProductTile key={p.id} p={p} width={colW} qty={qtyOf(p.id)} onChange={(n) => setQty(p, n)} />)}
              </View>
            </View>
          </Entrance>
        )}

        {/* Keranjang */}
        {!free && cart.length > 0 && (
          <Card solid style={{ gap: 10 }}>
            <Row between><Text style={font.h3}>Keranjang</Text><Badge text={`${cart.length} barang`} color={colors.shop} /></Row>
            {cart.map((l) => (
              <Row key={l.key} gap={8}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[font.body, { fontWeight: '600' }]} numberOfLines={1}>{l.name}</Text>
                  <Text style={font.tiny}>{l.unit} · {rupiah(l.price)}</Text>
                </View>
                <Stepper value={l.qty} onChange={(v) => setCart((c) => (v <= 0 ? c.filter((x) => x.key !== l.key) : c.map((x) => (x.key === l.key ? { ...x, qty: v } : x))))} min={0} max={50} />
                <Text style={{ fontWeight: '700', color: colors.text, minWidth: 74, textAlign: 'right', fontSize: 13 }}>{rupiah(l.price * l.qty)}</Text>
                <PressableScale haptic={false} onPress={() => setCart((c) => c.filter((x) => x.key !== l.key))} style={s.del}><Ionicons name="trash-outline" size={16} color={colors.danger} /></PressableScale>
              </Row>
            ))}
            <Row between style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}><Text style={font.small}>Subtotal belanja</Text><Text style={{ fontWeight: '800', color: colors.text }}>{rupiah(cartSubtotal)}</Text></Row>
          </Card>
        )}

        {/* Toko lain / barang bebas */}
        {free && (
          <Entrance index={2}>
            <View style={{ gap: 12 }}>
              <Card solid style={{ gap: 10 }}>
                <Text style={font.label}>Belanja di</Text>
                <PressableScale onPress={() => router.push({ pathname: '/place-picker', params: { target: 'pickup', title: 'Pilih toko' } } as never)} scaleTo={0.98} haptic={false} style={s.addrRow}>
                  <View style={[s.storeIcon, { width: 36, height: 36, backgroundColor: colors.shop + '1A', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="storefront" size={18} color={colors.shop} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{pickup?.name ?? 'Pilih toko'}</Text>
                    <Text style={font.tiny} numberOfLines={1}>{pickup?.address ?? 'Ketuk untuk cari toko atau pasar di peta'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </PressableScale>
              </Card>
              <Card solid style={{ gap: 10 }}>
                <Row between><Text style={font.label}>Daftar belanja</Text><Text style={font.tiny}>{validFree.length} barang</Text></Row>
                {freeItems.map((it, i) => (
                  <View key={i} style={{ gap: 6 }}>
                    <Row gap={8}>
                      <TextInput placeholder={`Barang ${i + 1} (mis. Indomie goreng)`} placeholderTextColor={colors.textMuted} value={it.name} onChangeText={(v) => setFreeItems((arr) => arr.map((x, j) => (j === i ? { ...x, name: v } : x)))} style={[s.input, { flex: 1 }]} />
                      {freeItems.length > 1 && <PressableScale haptic={false} onPress={() => setFreeItems((arr) => arr.filter((_, j) => j !== i))} style={s.del}><Ionicons name="trash-outline" size={16} color={colors.danger} /></PressableScale>}
                    </Row>
                    <Row gap={8}>
                      <Stepper value={it.qty} onChange={(v) => setFreeItems((arr) => arr.map((x, j) => (j === i ? { ...x, qty: Math.min(50, Math.max(1, v)) } : x)))} min={1} max={50} />
                      <TextInput placeholder="Perkiraan harga satuan (Rp)" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={it.price ? String(it.price) : ''} onChangeText={(v) => setFreeItems((arr) => arr.map((x, j) => (j === i ? { ...x, price: Number(v.replace(/\D/g, '')) || 0 } : x)))} style={[s.input, { flex: 1 }]} />
                    </Row>
                  </View>
                ))}
                <Button title="Tambah barang" size="sm" variant="ghost" icon="add" color={colors.shop} onPress={() => setFreeItems((arr) => (arr.length < 30 ? [...arr, { name: '', qty: 1, price: 0 }] : arr))} />
              </Card>
              <Card solid style={{ gap: 10 }}>
                <Text style={font.label}>Perkiraan anggaran belanja</Text>
                <Text style={font.tiny}>Ditahan dari AntarPay saat pesan; selisih dikembalikan atau ditagih sesuai nota. Maks. Rp5.000.000.</Text>
                <Row gap={8} style={{ flexWrap: 'wrap' }}>{BUDGETS.map((b) => <Chip key={b} label={rupiah(b)} active={budget === b} onPress={() => setBudget(b)} color={colors.shop} />)}</Row>
                <Input placeholder="Nominal lain" keyboardType="number-pad" icon="cash-outline" value={BUDGETS.includes(budget) ? '' : String(budget)} onChangeText={(v) => setBudget(Math.min(5000000, Number(v.replace(/\D/g, '')) || 0))} />
                {freeSubtotal > budget && <Text style={[font.tiny, { color: colors.warning }]}>Perkiraan harga barang ({rupiah(freeSubtotal)}) lebih besar dari anggaran; anggaran yang ditahan mengikuti perkiraan barang.</Text>}
              </Card>
            </View>
          </Entrance>
        )}

        {/* Alamat antar */}
        <Card solid style={{ gap: 10 }}>
          <Text style={font.label}>Antar ke</Text>
          <Row gap={10}>
            <View style={[s.storeIcon, { width: 36, height: 36, backgroundColor: colors.danger + '1A', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="location" size={18} color={colors.danger} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{dropoff?.name ?? 'Alamat pengantaran'}</Text>
              <Text style={font.tiny} numberOfLines={2}>{dropoff?.address ?? 'Menentukan lokasi Anda…'}</Text>
            </View>
            <Button title="Ganti" size="sm" variant="outline" color={colors.shop} onPress={() => router.push({ pathname: '/place-picker', params: { target: 'dropoff', title: 'Alamat pengantaran' } } as never)} />
          </Row>
          {route && <Row gap={8}><Badge text={`${km(route.distance_km)} · ${minutes(route.duration_min)}`} color={colors.info} /></Row>}
        </Card>

        {/* Kendaraan */}
        <Card solid style={{ gap: 10 }}>
          <Text style={font.label}>Kendaraan driver</Text>
          <Row gap={8}>
            <Chip label={`Motor · ≤10 kg${est ? ` · ${rupiah(est.fare_motor)}` : ''}`} active={vehicle === 'motor'} onPress={() => pickVehicle('motor')} color={colors.shop} />
            <Chip label={`Mobil · belanja besar${est ? ` · ${rupiah(est.fare_car)}` : ''}`} active={vehicle === 'car'} onPress={() => pickVehicle('car')} color={colors.car} />
          </Row>
          {est && subtotal >= est.car_min_budget && <Text style={[font.tiny, { color: vehicle === 'car' ? colors.textMuted : colors.warning }]}>Belanja di atas {rupiah(est.car_min_budget)} disarankan memakai mobil agar muat dan aman.</Text>}
        </Card>

        {/* Rincian & pembayaran */}
        {origin && dropoff && (
          <Card solid>
            {est ? <PriceSummary rows={[{ label: free ? 'Anggaran belanja (perkiraan)' : 'Belanja', value: subtotal }, { label: 'Jasa belanja', value: est.service_fee }, { label: `Ongkir ${vehicle === 'car' ? 'mobil' : 'motor'} (${km(est.distance_km)})`, value: est.fare }, { label: 'Biaya layanan', value: est.platform_fee }, { label: 'Diskon promo', value: discount, minus: true }]} total={total} />
              : <View style={{ gap: 8 }}><Skeleton width="60%" height={14} /><Skeleton width="40%" height={14} /><Skeleton width="70%" height={14} /></View>}
          </Card>
        )}
        <Card solid>
          <PaymentSection method={method} onMethod={setMethod} promo={promo} onPromo={setPromo} notes={notes} onNotes={setNotes} subtotal={est?.fare ?? 0} service="shop" onDiscount={setDiscount} notesPlaceholder="Catatan (mis. merek pengganti jika kosong)" />
        </Card>
        <Text style={font.tiny}>Driver mengirim foto nota. Barang yang tidak tersedia dikonfirmasi lewat chat/telepon dan tidak ditagihkan.</Text>
      </View>
    </Screen>
  );
}

function ProductTile({ p, width, qty, onChange }: { p: ShopProduct; width: number; qty: number; onChange: (n: number) => void }) {
  const out = !p.in_stock;
  return (
    <View style={[s.tile, { width }, out && { opacity: 0.55 }]}>
      <View style={s.tileArt}>{p.image_url ? <Image source={{ uri: p.image_url }} style={{ width: '100%', height: '100%', borderRadius: 12 }} /> : <Ionicons name="cube-outline" size={22} color={colors.shop} />}</View>
      <Text style={[font.small, { color: colors.text, fontWeight: '600', minHeight: 36 }]} numberOfLines={2}>{p.name}</Text>
      <Text style={font.tiny} numberOfLines={1}>{p.unit}</Text>
      <Text style={{ fontWeight: '800', color: colors.text, fontSize: 13 }} numberOfLines={1}>{rupiah(p.price)}</Text>
      {out ? <Badge text="Habis" color={colors.danger} /> : qty > 0 ? (
        <Row gap={6} style={{ justifyContent: 'center' }}>
          <PressableScale haptic={false} onPress={() => onChange(qty - 1)} style={s.miniBtn}><Ionicons name="remove" size={14} color={colors.shop} /></PressableScale>
          <Text style={{ fontWeight: '800', color: colors.text, minWidth: 16, textAlign: 'center', fontSize: 13 }}>{qty}</Text>
          <PressableScale haptic={false} onPress={() => onChange(Math.min(50, qty + 1))} style={s.miniBtn}><Ionicons name="add" size={14} color={colors.shop} /></PressableScale>
        </Row>
      ) : (
        <PressableScale haptic={false} onPress={() => onChange(1)} style={s.addBtn}><Ionicons name="add" size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Tambah</Text></PressableScale>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  storeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  storeIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.border },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.sm, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { gap: 4, padding: 8, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tileArt: { height: 56, borderRadius: 12, backgroundColor: colors.shop + '12', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 30, borderRadius: radius.full, backgroundColor: colors.shop, marginTop: 2 },
  miniBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.shop, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  input: { height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, color: colors.text },
  del: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
});
