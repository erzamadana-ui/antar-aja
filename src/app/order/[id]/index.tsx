import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions, Animated, Alert, Platform, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MapView } from '@/components/map';
import type { MapMarker } from '@/components/map';
import { Button, Row, Badge, Loading, Divider, Stars, toast, Card, Empty } from '@/components/ui';
import { PersonCard, RouteBlock, OrderExtras, PriceBlock, Timeline, driverSubtitle } from '@/components/OrderDetails';
import { useOrder } from '@/hooks/useOrder';
import { useAuth } from '@/store/auth';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import { statusLabel, statusColor, rupiah, serviceLabel } from '@/lib/format';
import { serviceDef } from '@/lib/services';

export default function OrderTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { order, driver, events, loading, reload } = useOrder(id);
  const refreshWallet = useAuth((s) => s.refreshWallet);
  const { height, width } = useWindowDimensions();
  const wide = width >= 900;
  const [rated, setRated] = useState<{ driver?: number; merchant?: number }>({});
  const [comment, setComment] = useState('');
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (order?.status !== 'searching') return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true })]));
    loop.start(); return () => loop.stop();
  }, [order?.status, pulse]);

  useEffect(() => {
    if (order?.status === 'completed' || order?.status === 'cancelled') refreshWallet();
    if (order?.status === 'completed' && id) supabase.from('ratings').select('ratee_kind,stars').eq('order_id', id).then(({ data }) => {
      const r: { driver?: number; merchant?: number } = {};
      (data as { ratee_kind: 'driver' | 'merchant'; stars: number }[] | null)?.forEach((x) => { r[x.ratee_kind] = x.stars; });
      setRated(r);
    });
  }, [order?.status, id, refreshWallet]);

  const markers = useMemo<MapMarker[]>(() => {
    if (!order) return [];
    const m: MapMarker[] = [
      { id: 'pickup', lat: order.pickup_lat, lng: order.pickup_lng, kind: order.service === 'food' ? 'merchant' : 'pickup' },
      { id: 'dropoff', lat: order.dropoff_lat, lng: order.dropoff_lng, kind: 'dropoff' },
    ];
    if (driver?.lat && driver.lng && ['accepted', 'arrived', 'in_progress'].includes(order.status)) m.push({ id: 'driver', lat: driver.lat, lng: driver.lng, kind: driver.vehicle_type === 'car' ? 'car' : 'motor', heading: driver.heading });
    return m;
  }, [order, driver]);
  const fitTo = useMemo(() => {
    if (!order) return null;
    const pk = { lat: order.pickup_lat, lng: order.pickup_lng }, dp = { lat: order.dropoff_lat, lng: order.dropoff_lng };
    const dr = driver?.lat && driver.lng ? { lat: driver.lat, lng: driver.lng } : null;
    if ((order.status === 'accepted' || order.status === 'arrived') && dr) return [dr, pk];
    if (order.status === 'in_progress' && dr) return [dr, dp];
    return [pk, dp];
  }, [order, driver?.lat, driver?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = () => {
    const doIt = async (reason: string) => { try { await rpc('cancel_order', { p_order_id: id, p_reason: reason }); toast.show('Pesanan dibatalkan'); reload(); } catch (e) { toast.error((e as Error).message); } };
    if (Platform.OS === 'web') { const r = prompt('Alasan pembatalan (opsional):'); if (r !== null) doIt(r || 'Dibatalkan pelanggan'); return; }
    Alert.alert('Batalkan pesanan?', 'Pesanan yang sudah dibayar AntarPay akan dikembalikan ke saldo.', [{ text: 'Tidak' }, { text: 'Ya, batalkan', style: 'destructive', onPress: () => doIt('Dibatalkan pelanggan') }]);
  };
  const rate = async (kind: 'driver' | 'merchant', stars: number) => {
    try { await rpc('rate_order', { p_order_id: id, p_kind: kind, p_stars: stars, p_comment: comment || null }); setRated((r) => ({ ...r, [kind]: stars })); toast.success('Terima kasih atas penilaian Anda'); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (loading) return <SafeAreaView style={{ flex: 1 }}><Loading text="Memuat pesanan…" /></SafeAreaView>;
  if (!order) return <SafeAreaView style={{ flex: 1 }}><Empty icon="alert-circle-outline" title="Pesanan tidak ditemukan" subtitle="Pesanan tidak ada atau Anda tidak memiliki akses." action={<Button title="Kembali" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />} /></SafeAreaView>;
  const def = serviceDef(order.service);
  const active = !['completed', 'cancelled'].includes(order.status);
  const canCancel = ['searching', 'accepted', 'arrived'].includes(order.status);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={[{ flex: 1 }, wide && { flexDirection: 'row-reverse' }]}>
        <View style={[{ flex: 1 }, wide && { flex: 1.4 }]}>
          <MapView center={{ lat: order.pickup_lat, lng: order.pickup_lng }} markers={markers} polyline={order.route_geometry} fitTo={fitTo} paddingBottom={wide ? 0 : 20} />
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(customer)/orders'))} style={s.back}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
          <View style={s.codeTag}><Text style={{ fontWeight: '700', fontSize: 12, color: colors.text }}>{order.code}</Text></View>
        </View>
        <View style={[s.sheet, wide ? { width: 440, borderRadius: 0 } : { maxHeight: Math.round(height * 0.6) }]}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 28 }}>
            <Row gap={12}>
              {order.status === 'searching' ? (
                <Animated.View style={[s.pulseWrap, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }]}><Ionicons name="radio" size={22} color={colors.warning} /></Animated.View>
              ) : <View style={[s.pulseWrap, { backgroundColor: statusColor(order.status) + '1A' }]}><Ionicons name={order.status === 'completed' ? 'checkmark-circle' : order.status === 'cancelled' ? 'close-circle' : def.icon as never} size={22} color={statusColor(order.status)} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{statusLabel(order.status, order.service, order.merchant_status)}</Text>
                <Text style={font.tiny}>{serviceLabel[order.service]} · {order.status === 'searching' ? 'Kami sedang mencarikan driver terdekat' : order.status === 'accepted' ? 'Driver sedang menuju lokasi' : order.status === 'in_progress' ? `Perkiraan ${order.duration_min} menit` : order.status === 'completed' ? 'Terima kasih sudah memakai Antar Aja' : order.cancel_reason ?? ''}</Text>
              </View>
              <Text style={{ fontWeight: '800', fontSize: 16 }}>{rupiah(order.total)}</Text>
            </Row>

            {driver && active && (
              <PersonCard name={driver.profile?.full_name} subtitle={driverSubtitle(driver)} phone={driver.profile?.phone} avatar={driver.profile?.avatar_url} rating={driver.rating_avg} ratingCount={driver.rating_count}
                onChat={() => router.push(`/order/${id}/chat` as never)} />
            )}
            {order.status === 'completed' && driver && (
              <Card style={{ backgroundColor: colors.bg }}>
                <Text style={font.h3}>Beri penilaian</Text>
                <Row between style={{ marginTop: 8 }}><Text style={font.small}>Driver {driver.profile?.full_name}</Text><Stars value={rated.driver ?? 0} size={22} onChange={(v) => rate('driver', v)} /></Row>
                {order.merchant && <Row between style={{ marginTop: 8 }}><Text style={font.small}>{order.merchant.name}</Text><Stars value={rated.merchant ?? 0} size={22} onChange={(v) => rate('merchant', v)} /></Row>}
                <TextInput placeholder="Tulis ulasan (opsional)" placeholderTextColor={colors.textMuted} value={comment} onChangeText={setComment} style={s.comment} />
              </Card>
            )}

            <RouteBlock order={order} />
            <OrderExtras order={order} />
            <Divider />
            <PriceBlock order={order} />
            {order.payment_status === 'refunded' && <Badge text="Dana dikembalikan ke AntarPay" color={colors.info} />}
            <Divider />
            <Timeline events={events} />
            {canCancel && <Button title="Batalkan pesanan" variant="outline" color={colors.danger} onPress={cancel} />}
            {!active && <Button title="Pesan lagi" variant="secondary" onPress={() => router.replace(def.route as never)} />}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  back: { position: 'absolute', left: 16, top: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.card, zIndex: 6 },
  codeTag: { position: 'absolute', right: 16, top: 24, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, ...shadow.card, zIndex: 6 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...shadow.sheet },
  pulseWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  comment: { marginTop: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 42, color: colors.text },
});
