import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Linking, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { MapView } from '@/components/map';
import type { MapMarker } from '@/components/map';
import { Button, Row, Badge, Loading, toast, Empty } from '@/components/ui';
import { MapScreen } from '@/components/MapScreen';
import { PressableScale, ProgressBar, AnimatedNumber } from '@/components/motion';
import { AmbientBackground, BrandGradient } from '@/components/glass';
import { PersonCard, RouteBlock, OrderExtras, PriceBlock, Timeline, customerSubtitle } from '@/components/OrderDetails';
import { ExtraRequest } from '@/components/TipExtras';
import { ShopTotalCard } from '@/components/ShopTotal';
import { CallButton } from '@/components/call/IncomingCall';
import { PinPrompt, SafetyRow } from '@/components/Safety';
import { useOrder } from '@/hooks/useOrder';
import { useAuth } from '@/store/auth';
import { useCurrentLocation, useWatchLocation } from '@/hooks/useLocation';
import { rpc } from '@/lib/supabase';
import { colors, font, radius, shadow, glass, motion } from '@/lib/theme';
import { statusLabel, statusColor, rupiah, serviceLabel, merchantStatusLabel } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';

const PROGRESS: Record<string, number> = { accepted: 0.33, arrived: 0.66, in_progress: 0.9, completed: 1, cancelled: 1, searching: 0 };

export default function DriverOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { order, customer, events, loading, reload } = useOrder(id);
  const { driver, refreshWallet } = useAuth();
  const { location } = useCurrentLocation();
  const [live, setLive] = useState<{ lat: number; lng: number; heading: number | null } | null>(null);
  const [pinAsk, setPinAsk] = useState(false);
  useWatchLocation(true, (p) => setLive(p));
  const me = live ?? (driver?.lat && driver.lng ? { lat: driver.lat, lng: driver.lng } : location);

  const markers = useMemo<MapMarker[]>(() => order ? [
    { id: 'me', lat: me.lat, lng: me.lng, kind: driver?.vehicle_type === 'car' ? 'car' : 'motor', heading: live?.heading ?? driver?.heading },
    { id: 'pickup', lat: order.pickup_lat, lng: order.pickup_lng, kind: order.service === 'food' || order.service === 'shop' ? 'merchant' : 'pickup', label: order.service === 'food' ? 'Merchant' : order.service === 'shop' ? 'Toko' : 'Jemput' },
    { id: 'dropoff', lat: order.dropoff_lat, lng: order.dropoff_lng, kind: 'dropoff', label: 'Tujuan' },
  ] : [], [order, me.lat, me.lng, driver, live?.heading]);
  const fitTo = useMemo(() => {
    if (!order) return null;
    const pk = { lat: order.pickup_lat, lng: order.pickup_lng }, dp = { lat: order.dropoff_lat, lng: order.dropoff_lng };
    return order.status === 'in_progress' ? [me, dp] : order.status === 'completed' || order.status === 'cancelled' ? [pk, dp] : [me, pk];
  }, [order?.status, me.lat, me.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (status: OrderStatus, pin?: string) => {
    try { await rpc('driver_update_order_status', { p_order_id: id, p_status: status, p_pin: pin ?? null }); setPinAsk(false); await reload(); if (status === 'completed') { await refreshWallet(); toast.success('Order selesai. Pendapatan masuk ke saldo.'); } }
    catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('PIN_REQUIRED')) { if (pin) throw new Error('PIN salah. Minta PIN 4 digit dari pelanggan.'); setPinAsk(true); return; }
      if (pin) throw e; toast.error(msg);
    }
  };
  const complete = () => {
    if (!order) return;
    const msg = order.payment_method === 'cash' ? `Pastikan Anda sudah menerima tunai ${rupiah(order.total)} dari pelanggan.` : 'Pesanan dibayar AntarPay. Selesaikan order?';
    if (Platform.OS === 'web') { if (confirm(msg)) update('completed'); return; }
    Alert.alert('Selesaikan order?', msg, [{ text: 'Belum' }, { text: 'Selesai', onPress: () => update('completed') }]);
  };
  const cancel = () => {
    const doIt = async () => { try { await rpc('cancel_order', { p_order_id: id, p_reason: 'Driver berhalangan' }); toast.show('Order dilepas, dicarikan driver lain'); router.replace('/(driver)'); } catch (e) { toast.error((e as Error).message); } };
    if (Platform.OS === 'web') { if (confirm('Lepas order ini? Terlalu sering membatalkan dapat menurunkan prioritas Anda.')) doIt(); return; }
    Alert.alert('Lepas order?', 'Terlalu sering membatalkan dapat menurunkan prioritas Anda.', [{ text: 'Tidak' }, { text: 'Lepas', style: 'destructive', onPress: doIt }]);
  };
  const navigate = (lat: number, lng: number) => Linking.openURL(Platform.OS === 'ios' ? `maps://?daddr=${lat},${lng}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);

  if (loading) return <View style={{ flex: 1 }}><AmbientBackground /><SafeAreaView style={{ flex: 1 }}><Loading /></SafeAreaView></View>;
  if (!order) return <View style={{ flex: 1 }}><AmbientBackground /><SafeAreaView style={{ flex: 1 }}><Empty icon="alert-circle-outline" title="Order tidak ditemukan" subtitle="Order sudah dilepas atau tidak tersedia." action={<Button title="Kembali" onPress={() => router.replace('/(driver)')} />} /></SafeAreaView></View>;
  const active = ['accepted', 'arrived', 'in_progress'].includes(order.status);
  const navTarget = order.status === 'in_progress' ? { lat: order.dropoff_lat, lng: order.dropoff_lng } : { lat: order.pickup_lat, lng: order.pickup_lng };
  const foodNotReady = order.service === 'food' && order.merchant_status !== 'ready';
  const shopNotTotaled = order.service === 'shop' && !order.receipt_url && order.items_subtotal === (order.est_budget ?? 0) && !(events ?? []).some((e) => e.status === 'shop_total');
  const sc = statusColor(order.status);

  const header = (
    <View style={{ gap: 10 }}>
      <Row between>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Animated.Text key={order.status} entering={FadeIn.duration(motion.base)} style={font.h3} numberOfLines={1}>{statusLabel(order.status, order.service)}</Animated.Text>
          <Text style={font.tiny}>{serviceLabel[order.service]} · {order.code}</Text>
        </View>
        <Badge text={order.status.replace('_', ' ').toUpperCase()} color={sc} />
      </Row>
      {order.status !== 'cancelled' && <ProgressBar progress={PROGRESS[order.status] ?? 0} color={sc} height={5} />}
    </View>
  );

  const navButton = active ? (
    <PressableScale onPress={() => navigate(navTarget.lat, navTarget.lng)} scaleTo={0.92} style={[s.navBtn, shadow.glow(colors.info)]}>
      <BrandGradient colors={[colors.info, '#1D4ED8']} style={StyleSheet.absoluteFill} />
      <Ionicons name="navigate" size={18} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800' }}>Navigasi</Text>
    </PressableScale>
  ) : null;

  return (
    <MapScreen
      map={<MapView center={me} markers={markers} polyline={order.route_geometry} fitTo={fitTo} paddingBottom={20} />}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(driver)'))}
      floatingRight={navButton}
      header={header}
      minHeight={230}
      maxRatio={0.66}
    >
      <Animated.View layout={LinearTransition.springify().stiffness(280).damping(18)} style={{ gap: 14 }}>
        <Animated.View entering={ZoomIn.duration(motion.base)} style={[s.earnCard, shadow.glow(colors.success)]}>
          <BrandGradient colors={[colors.success, '#047857']} angle="horizontal" style={StyleSheet.absoluteFill} />
          <Row between>
            <View><Text style={s.earnLabel}>Pendapatan Anda</Text><AnimatedNumber value={order.driver_earning} format={rupiah} style={{ color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }} duration={600} /></View>
            <View style={{ alignItems: 'flex-end' }}><Text style={s.earnLabel}>{order.payment_method === 'cash' ? 'Tagih tunai' : 'Dibayar AntarPay'}</Text><Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{order.payment_method === 'cash' ? rupiah(order.total) : '✓ Lunas'}</Text></View>
          </Row>
          {order.service === 'food' && order.payment_method === 'cash' && <Text style={[s.earnLabel, { marginTop: 6 }]}>Bayar ke merchant {rupiah(order.items_subtotal)} tunai, tagih total ke pelanggan.</Text>}
        </Animated.View>

        <PinPrompt visible={pinAsk} onCancel={() => setPinAsk(false)} onSubmit={(pin) => update('in_progress', pin)} />
        <SafetyRow order={order} forDriver />
        {customer && <Animated.View entering={FadeInDown.delay(80).duration(motion.slow)}><PersonCard name={customer.full_name} subtitle={customerSubtitle(customer)} avatar={customer.avatar_url} onChat={active ? () => router.push(`/order/${id}/chat` as never) : undefined} badge="Pelanggan" callPeer={active ? { id: customer.id, name: customer.full_name, avatar: customer.avatar_url, role: 'customer' } : null} orderId={order.id} /></Animated.View>}
        {order.service === 'food' && order.merchant_status && (
          <Row gap={8} style={s.block}><Ionicons name="restaurant" size={18} color={colors.food} /><Text style={[font.small, { flex: 1 }]}>Merchant: <Text style={{ fontWeight: '700' }}>{order.merchant?.name}</Text></Text><Badge text={merchantStatusLabel[order.merchant_status]} color={order.merchant_status === 'ready' ? colors.success : colors.warning} />{active && order.merchant?.owner_id && <CallButton peer={{ id: order.merchant.owner_id, name: order.merchant.name, role: 'merchant' }} orderId={order.id} size={36} color={colors.food} />}</Row>
        )}
        {order.service === 'shop' && (order.status === 'arrived' || order.status === 'in_progress') && <ShopTotalCard order={order} onDone={reload} />}
        {active && <ExtraRequest order={order} onDone={reload} />}
        <View style={s.block}>
          <RouteBlock order={order} />
          <OrderExtras order={order} />
        </View>
        {order.service === 'send' && active && order.recipient_phone && <Button title={`Hubungi penerima (${order.recipient_name})`} variant="secondary" icon="call-outline" onPress={() => Linking.openURL(`tel:${order.recipient_phone}`)} />}

        <Animated.View key={`act-${order.status}-${order.merchant_status ?? ''}`} entering={FadeInDown.duration(motion.base)} style={{ gap: 8 }}>
          {order.status === 'accepted' && <Button title={order.service === 'food' ? 'Sudah tiba di merchant' : order.service === 'shop' ? 'Sudah tiba di toko' : 'Sudah tiba di titik jemput'} size="lg" color={colors.ride} onPress={() => update('arrived')} />}
          {order.status === 'arrived' && <Button title={order.service === 'food' ? (foodNotReady ? 'Menunggu pesanan siap…' : 'Pesanan diambil, antar sekarang') : order.service === 'send' ? 'Paket diterima, antar sekarang' : order.service === 'shop' ? (shopNotTotaled ? 'Masukkan total belanja dulu' : 'Belanja selesai, antar sekarang') : 'Penumpang naik, mulai perjalanan'} size="lg" color={colors.ride} disabled={foodNotReady || shopNotTotaled} onPress={() => update('in_progress')} />}
          {order.status === 'in_progress' && <Button title={order.service === 'ride_motor' || order.service === 'ride_car' ? 'Penumpang sampai, selesaikan' : 'Sudah diterima, selesaikan'} size="lg" color={colors.success} onPress={complete} />}
          {(order.status === 'accepted' || order.status === 'arrived') && <Button title="Lepas order" variant="ghost" color={colors.danger} onPress={cancel} />}
          {active && <Button title="Laporkan masalah / insiden" variant="ghost" color={colors.textSecondary} icon="flag-outline" onPress={() => router.push({ pathname: '/support/new', params: { order_id: order.id, category: 'order' } } as never)} />}
        </Animated.View>
        <View style={s.block}><PriceBlock order={order} forDriver /></View>
        <View style={s.block}><Timeline events={events} /></View>
      </Animated.View>
    </MapScreen>
  );
}

const s = StyleSheet.create({
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 44, borderRadius: 22, overflow: 'hidden' },
  earnCard: { borderRadius: radius.xl, padding: 16, overflow: 'hidden' },
  earnLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  block: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: glass.border, gap: 12 },
});
