import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions, Linking, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MapView } from '@/components/map';
import type { MapMarker } from '@/components/map';
import { Button, Row, Badge, Loading, Divider, toast, Card } from '@/components/ui';
import { PersonCard, RouteBlock, OrderExtras, PriceBlock, Timeline, customerSubtitle } from '@/components/OrderDetails';
import { useOrder } from '@/hooks/useOrder';
import { useAuth } from '@/store/auth';
import { useCurrentLocation } from '@/hooks/useLocation';
import { rpc } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import { statusLabel, statusColor, rupiah, serviceLabel, merchantStatusLabel } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';

export default function DriverOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { order, customer, events, loading, reload } = useOrder(id);
  const { driver, refreshWallet } = useAuth();
  const { location } = useCurrentLocation();
  const { height, width } = useWindowDimensions();
  const wide = width >= 900;
  const me = driver?.lat && driver.lng ? { lat: driver.lat, lng: driver.lng } : location;

  const markers = useMemo<MapMarker[]>(() => order ? [
    { id: 'me', lat: me.lat, lng: me.lng, kind: driver?.vehicle_type === 'car' ? 'car' : 'motor', heading: driver?.heading },
    { id: 'pickup', lat: order.pickup_lat, lng: order.pickup_lng, kind: order.service === 'food' ? 'merchant' : 'pickup', label: order.service === 'food' ? 'Merchant' : 'Jemput' },
    { id: 'dropoff', lat: order.dropoff_lat, lng: order.dropoff_lng, kind: 'dropoff', label: 'Tujuan' },
  ] : [], [order, me.lat, me.lng, driver]);
  const fitTo = useMemo(() => {
    if (!order) return null;
    const pk = { lat: order.pickup_lat, lng: order.pickup_lng }, dp = { lat: order.dropoff_lat, lng: order.dropoff_lng };
    return order.status === 'in_progress' ? [me, dp] : order.status === 'completed' || order.status === 'cancelled' ? [pk, dp] : [me, pk];
  }, [order?.status, me.lat, me.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (status: OrderStatus) => {
    try { await rpc('driver_update_order_status', { p_order_id: id, p_status: status }); await reload(); if (status === 'completed') { await refreshWallet(); toast.success('Order selesai. Pendapatan masuk ke saldo.'); } }
    catch (e) { toast.error((e as Error).message); }
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

  if (loading || !order) return <SafeAreaView style={{ flex: 1 }}><Loading /></SafeAreaView>;
  const active = ['accepted', 'arrived', 'in_progress'].includes(order.status);
  const navTarget = order.status === 'in_progress' ? { lat: order.dropoff_lat, lng: order.dropoff_lng } : { lat: order.pickup_lat, lng: order.pickup_lng };
  const foodNotReady = order.service === 'food' && order.merchant_status !== 'ready';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={[{ flex: 1 }, wide && { flexDirection: 'row-reverse' }]}>
        <View style={[{ flex: 1 }, wide && { flex: 1.4 }]}>
          <MapView center={me} markers={markers} polyline={order.route_geometry} fitTo={fitTo} paddingBottom={wide ? 0 : 20} />
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(driver)'))} style={s.back}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
          {active && <Pressable onPress={() => navigate(navTarget.lat, navTarget.lng)} style={s.navBtn}><Ionicons name="navigate" size={18} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700' }}>Navigasi</Text></Pressable>}
        </View>
        <View style={[s.sheet, wide ? { width: 440, borderRadius: 0 } : { maxHeight: Math.round(height * 0.62) }]}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 28 }}>
            <Row between>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{statusLabel(order.status, order.service)}</Text>
                <Text style={font.tiny}>{serviceLabel[order.service]} · {order.code}</Text>
              </View>
              <Badge text={order.status.toUpperCase()} color={statusColor(order.status)} />
            </Row>
            <Card style={{ backgroundColor: colors.successLight, paddingVertical: 12 }}>
              <Row between>
                <View><Text style={font.tiny}>Pendapatan Anda</Text><Text style={[font.h2, { color: colors.success }]}>{rupiah(order.driver_earning)}</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={font.tiny}>{order.payment_method === 'cash' ? 'Tagih tunai' : 'Dibayar AntarPay'}</Text><Text style={font.h3}>{order.payment_method === 'cash' ? rupiah(order.total) : '✓ Lunas'}</Text></View>
              </Row>
              {order.service === 'food' && order.payment_method === 'cash' && <Text style={[font.tiny, { marginTop: 4 }]}>Bayar ke merchant {rupiah(order.items_subtotal)} tunai, tagih total ke pelanggan.</Text>}
            </Card>
            {customer && <PersonCard name={customer.full_name} subtitle={customerSubtitle(customer)} phone={customer.phone} avatar={customer.avatar_url} onChat={active ? () => router.push(`/order/${id}/chat` as never) : undefined} badge="Pelanggan" />}
            {order.service === 'food' && order.merchant_status && (
              <Row gap={8}><Ionicons name="restaurant" size={18} color={colors.food} /><Text style={font.small}>Merchant: </Text><Badge text={merchantStatusLabel[order.merchant_status]} color={order.merchant_status === 'ready' ? colors.success : colors.warning} /></Row>
            )}
            <RouteBlock order={order} />
            <OrderExtras order={order} />
            {order.service === 'send' && active && order.recipient_phone && <Button title={`Hubungi penerima (${order.recipient_name})`} variant="secondary" icon="call-outline" onPress={() => Linking.openURL(`tel:${order.recipient_phone}`)} />}

            {order.status === 'accepted' && <Button title={order.service === 'food' ? 'Sudah tiba di merchant' : 'Sudah tiba di titik jemput'} size="lg" color={colors.ride} onPress={() => update('arrived')} />}
            {order.status === 'arrived' && <Button title={order.service === 'food' ? (foodNotReady ? 'Menunggu pesanan siap…' : 'Pesanan diambil, antar sekarang') : order.service === 'send' ? 'Paket diterima, antar sekarang' : 'Penumpang naik, mulai perjalanan'} size="lg" color={colors.ride} disabled={foodNotReady} onPress={() => update('in_progress')} />}
            {order.status === 'in_progress' && <Button title={order.service === 'ride_motor' || order.service === 'ride_car' ? 'Penumpang sampai, selesaikan' : 'Sudah diterima, selesaikan'} size="lg" color={colors.success} onPress={complete} />}
            {(order.status === 'accepted' || order.status === 'arrived') && <Button title="Lepas order" variant="ghost" color={colors.danger} onPress={cancel} />}
            <Divider />
            <PriceBlock order={order} forDriver />
            <Divider />
            <Timeline events={events} />
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  back: { position: 'absolute', left: 16, top: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.card, zIndex: 6 },
  navBtn: { position: 'absolute', right: 16, top: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.info, paddingHorizontal: 14, height: 44, borderRadius: 22, ...shadow.card, zIndex: 6 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...shadow.sheet },
});
