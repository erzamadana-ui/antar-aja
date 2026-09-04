// AntarShop — titip belanja ke Alfamart/Indomaret/toko lain: pilih toko, daftar belanja, anggaran, bayar.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { MapView } from '@/components/map';
import type { MapMarker } from '@/components/map';
import { Button, Row, Badge, Input, Chip, toast } from '@/components/ui';
import { MapScreen } from '@/components/MapScreen';
import { PressableScale, Skeleton } from '@/components/motion';
import { ServiceArt } from '@/components/ServiceArt';
import { PaymentSection, PriceSummary, paidViaOf, handleShortfall, type PayChoice } from '@/components/BookingSheet';
import { usePayPrefs } from '@/store/payprefs';
import { useBooking } from '@/store/booking';
import { useAuth } from '@/store/auth';
import { useCurrentLocation } from '@/hooks/useLocation';
import { getRoute, reverseGeocode, searchPlaces, type RouteResult } from '@/lib/geo';
import { rpc } from '@/lib/supabase';
import { colors, font, radius, motion, glass, shadow } from '@/lib/theme';
import { rupiah, km, minutes } from '@/lib/format';
import type { FareEstimate, Order, PaymentMethod, Place, ShoppingItem } from '@/lib/types';

const STORES = [
  { key: 'Alfamart', icon: 'storefront', color: '#D7263D' },
  { key: 'Indomaret', icon: 'storefront', color: '#0057A8' },
  { key: 'Alfamidi', icon: 'storefront', color: '#E4572E' },
  { key: 'Apotek', icon: 'medkit', color: '#1FA363' },
  { key: 'Pasar/Toko lain', icon: 'basket', color: colors.shop },
];
const BUDGETS = [50000, 100000, 200000, 300000, 500000];

export default function ShopScreen() {
  const router = useRouter();
  const { pickup: store, dropoff, setPickup: setStore, setDropoff } = useBooking();
  const { location, hasFix } = useCurrentLocation();
  const refreshWallet = useAuth((s) => s.refreshWallet);
  const [storeType, setStoreType] = useState('Alfamart');
  const [finding, setFinding] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [fare, setFare] = useState<FareEstimate | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([{ name: '', qty: 1 }]);
  const [budget, setBudget] = useState(100000);
  const [method, setMethod] = useState<PayChoice>('wallet');
  const payPrefs = usePayPrefs((st) => st.prefs);
  const [promo, setPromo] = useState(''); const [discount, setDiscount] = useState(0); const [notes, setNotes] = useState('');

  // alamat antar = lokasi saya (default)
  useEffect(() => {
    if (!dropoff && hasFix) reverseGeocode(location).then((address) => { if (!useBooking.getState().dropoff) setDropoff({ ...location, address, name: 'Lokasi saya' }); });
  }, [hasFix]); // eslint-disable-line react-hooks/exhaustive-deps

  // cari toko terdekat sesuai jenis
  const findStore = async (type: string) => {
    setStoreType(type); setFinding(true);
    try {
      const q = type === 'Pasar/Toko lain' ? 'pasar' : type;
      const res = await searchPlaces(q, dropoff ?? location);
      const best = res[0];
      if (best) setStore({ ...best, name: best.name ?? type }); else toast.show(`Tidak menemukan ${type} di sekitar — pilih manual lewat peta`);
    } catch { toast.show('Gagal mencari toko, pilih manual'); }
    setFinding(false);
  };
  useEffect(() => { if (!store && hasFix) findStore('Alfamart'); }, [hasFix]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!store || !dropoff) { setRoute(null); setFare(null); return; }
    let cancelled = false;
    (async () => {
      const r = await getRoute(store, dropoff); if (cancelled) return; setRoute(r);
      const f = await rpc<FareEstimate>('estimate_fare', { p_service: 'shop', p_pickup_lat: store.lat, p_pickup_lng: store.lng, p_drop_lat: dropoff.lat, p_drop_lng: dropoff.lng, p_route_km: r.distance_km }).catch(() => null);
      if (!cancelled) setFare(f);
    })();
    return () => { cancelled = true; };
  }, [store?.lat, store?.lng, dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const validItems = items.filter((i) => i.name.trim().length > 0);
  const total = fare ? Math.max(0, fare.fare + fare.platform_fee - discount) + budget : budget;
  const markers = useMemo<MapMarker[]>(() => [
    ...(store ? [{ id: 'store', lat: store.lat, lng: store.lng, kind: 'merchant' as const, label: store.name ?? storeType }] : []),
    ...(dropoff ? [{ id: 'drop', lat: dropoff.lat, lng: dropoff.lng, kind: 'dropoff' as const, label: 'Antar' }] : []),
  ], [store, dropoff, storeType]);
  const fitTo = useMemo(() => (store && dropoff ? [store, dropoff] : store ? [store] : null), [store?.lat, store?.lng, dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const order = async () => {
    if (!store || !dropoff || !fare) return;
    if (validItems.length === 0) { toast.error('Isi minimal 1 barang'); return; }
    try {
      const o = await rpc<Order>('create_order', { p: {
        service: 'shop', pickup: { lat: store.lat, lng: store.lng, address: store.address }, dropoff: { lat: dropoff.lat, lng: dropoff.lng, address: dropoff.address },
        route_km: route?.distance_km, duration_min: route?.duration_min, route_geometry: route?.coords, payment_method: method === 'ewallet' ? 'wallet' : method, paid_via: paidViaOf(method, payPrefs?.ewallet), promo_code: promo || null, notes: notes || null,
        shopping_list: validItems, est_budget: budget, shop_store: store.name ?? storeType,
      } });
      await refreshWallet(); useBooking.getState().reset();
      router.replace(`/order/${o.id}` as never);
    } catch (e) { if (!handleShortfall(e, router, payPrefs?.ewallet)) toast.error((e as Error).message); }
  };

  const header = (
    <Row gap={12}>
      <ServiceArt kind="shop" color={colors.shop} size={48} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={font.h3}>AntarShop</Text>
        <Text style={font.tiny} numberOfLines={1}>Driver belanjakan, Anda tinggal terima</Text>
      </View>
      {fare ? <Badge text={`Jasa ${rupiah(fare.fare + fare.platform_fee)}`} color={colors.shop} /> : store && dropoff ? <Skeleton width={70} height={14} /> : null}
    </Row>
  );

  return (
    <MapScreen
      map={<MapView center={store ?? location} zoom={15} markers={markers} polyline={route?.coords} fitTo={fitTo} paddingBottom={40} />}
      header={header} minHeight={240} maxRatio={0.72}
    >
      <View style={{ gap: 14 }}>
        {/* Toko */}
        <View style={s.group}>
          <Text style={font.label}>Belanja di</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {STORES.map((st) => <Chip key={st.key} label={st.key} active={storeType === st.key} onPress={() => findStore(st.key)} color={st.color} />)}
          </ScrollView>
          <PressableScale onPress={() => router.push({ pathname: '/place-picker', params: { target: 'pickup', title: 'Pilih toko' } } as never)} scaleTo={0.98} haptic={false} style={s.storeRow}>
            <View style={[s.storeIcon, { backgroundColor: colors.shop + '1A' }]}><Ionicons name="storefront" size={18} color={colors.shop} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {finding ? <Skeleton width="70%" height={14} /> : <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{store?.name ?? 'Pilih toko'}</Text>}
              <Text style={font.tiny} numberOfLines={1}>{store?.address ?? 'Ketuk untuk cari toko di peta'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </PressableScale>
          <PressableScale onPress={() => router.push({ pathname: '/place-picker', params: { target: 'dropoff', title: 'Alamat pengantaran' } } as never)} scaleTo={0.98} haptic={false} style={s.storeRow}>
            <View style={[s.storeIcon, { backgroundColor: colors.danger + '1A' }]}><Ionicons name="location" size={18} color={colors.danger} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{dropoff?.name ?? 'Antar ke'}</Text>
              <Text style={font.tiny} numberOfLines={1}>{dropoff?.address ?? 'Pilih alamat pengantaran'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </PressableScale>
          {route && <Row gap={8}><Badge text={`${km(route.distance_km)} · ${minutes(route.duration_min)}`} color={colors.info} /></Row>}
        </View>

        {/* Daftar belanja */}
        <View style={s.group}>
          <Row between><Text style={font.label}>Daftar belanja</Text><Text style={font.tiny}>{validItems.length} barang</Text></Row>
          {items.map((it, i) => (
            <Animated.View key={i} entering={FadeInDown.duration(motion.fast)} exiting={FadeOut.duration(motion.fast)} layout={LinearTransition.springify().stiffness(280).damping(20)}>
              <Row gap={8}>
                <TextInput placeholder={`Barang ${i + 1} (mis. Indomie goreng)`} placeholderTextColor={colors.textMuted} value={it.name} onChangeText={(v) => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, name: v } : x)))} style={[s.input, { flex: 1 }]} />
                <View style={s.qty}>
                  <PressableScale haptic={false} onPress={() => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} style={s.qtyBtn}><Ionicons name="remove" size={16} color={colors.text} /></PressableScale>
                  <Text style={{ fontWeight: '800', minWidth: 18, textAlign: 'center' }}>{it.qty}</Text>
                  <PressableScale haptic={false} onPress={() => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, qty: Math.min(50, x.qty + 1) } : x)))} style={s.qtyBtn}><Ionicons name="add" size={16} color={colors.text} /></PressableScale>
                </View>
                {items.length > 1 && <PressableScale haptic={false} onPress={() => setItems((arr) => arr.filter((_, j) => j !== i))} style={s.del}><Ionicons name="trash-outline" size={16} color={colors.danger} /></PressableScale>}
              </Row>
            </Animated.View>
          ))}
          <Button title="Tambah barang" size="sm" variant="ghost" icon="add" color={colors.shop} onPress={() => setItems((arr) => (arr.length < 30 ? [...arr, { name: '', qty: 1 }] : arr))} />
        </View>

        {/* Anggaran */}
        <View style={s.group}>
          <Text style={font.label}>Perkiraan anggaran belanja</Text>
          <Text style={font.tiny}>Ditahan dari AntarPay saat pesan; selisih dikembalikan/ditagih sesuai struk. Maks. Rp2.000.000.</Text>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>{BUDGETS.map((b) => <Chip key={b} label={rupiah(b)} active={budget === b} onPress={() => setBudget(b)} color={colors.shop} />)}</Row>
          <Input placeholder="Nominal lain" keyboardType="number-pad" icon="cash-outline" value={BUDGETS.includes(budget) ? '' : String(budget)} onChangeText={(v) => setBudget(Math.min(2000000, Number(v.replace(/\D/g, '')) || 0))} />
        </View>

        {fare && (
          <View style={s.group}>
            <PriceSummary rows={[{ label: 'Anggaran belanja (estimasi)', value: budget }, { label: `Jasa belanja & antar (${km(fare.distance_km)})`, value: fare.fare }, { label: 'Biaya layanan', value: fare.platform_fee }, { label: 'Diskon promo', value: discount, minus: true }]} total={total} />
          </View>
        )}
        <PaymentSection method={method} onMethod={setMethod} promo={promo} onPromo={setPromo} notes={notes} onNotes={setNotes} subtotal={fare?.fare ?? 0} service="shop" onDiscount={setDiscount} notesPlaceholder="Catatan (mis. merek pengganti jika kosong)" />
        <Text style={font.tiny}>Driver akan mengirim foto struk. Barang yang tidak tersedia akan dikonfirmasi lewat chat/telepon.</Text>
        <Button title={fare ? `Pesan AntarShop · ${rupiah(total)}` : 'Menghitung…'} size="lg" color={colors.shop} disabled={!fare || !store || !dropoff || validItems.length === 0} onPress={order} />
      </View>
    </MapScreen>
  );
}

const s = StyleSheet.create({
  group: { gap: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: glass.border },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: glass.border },
  storeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input: { height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: glass.border, backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 12, color: colors.text },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: radius.md, borderWidth: 1, borderColor: glass.border, paddingHorizontal: 4, height: 44 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(11,31,42,0.06)', alignItems: 'center', justifyContent: 'center' },
  del: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  x: { ...shadow.soft },
});
