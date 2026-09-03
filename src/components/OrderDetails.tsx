import React from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Row, Avatar, Stars, Badge, Divider } from '@/components/ui';
import { PriceSummary } from '@/components/BookingSheet';
import { colors, font, radius } from '@/lib/theme';
import { rupiah, km, formatTime, merchantStatusLabel, phoneDisplay } from '@/lib/format';
import type { Driver, Order, OrderEvent, Profile } from '@/lib/types';

/** Kartu driver (untuk customer) atau kartu customer (untuk driver). */
export function PersonCard({ name, subtitle, phone, avatar, rating, ratingCount, onChat, badge }: { name?: string | null; subtitle?: string; phone?: string | null; avatar?: string | null; rating?: number; ratingCount?: number; onChat?: () => void; badge?: string }) {
  return (
    <View style={s.person}>
      <Avatar name={name} url={avatar} size={50} />
      <View style={{ flex: 1 }}>
        <Text style={font.h3}>{name ?? '—'}</Text>
        {subtitle ? <Text style={font.small}>{subtitle}</Text> : null}
        {rating != null && <Row gap={4}><Stars value={rating} size={11} /><Text style={font.tiny}>{Number(rating).toFixed(1)} · {ratingCount ?? 0} ulasan</Text></Row>}
        {badge ? <Badge text={badge} style={{ marginTop: 4 }} /> : null}
      </View>
      <Row gap={8}>
        {onChat && <Pressable onPress={onChat} style={s.circle}><Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} /></Pressable>}
        {phone && <Pressable onPress={() => Linking.openURL(`tel:${phone}`)} style={[s.circle, { backgroundColor: colors.successLight }]}><Ionicons name="call" size={20} color={colors.success} /></Pressable>}
      </Row>
    </View>
  );
}

export function RouteBlock({ order }: { order: Order }) {
  return (
    <View style={{ gap: 8 }}>
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <View style={[s.dot, { backgroundColor: colors.primary, marginTop: 4 }]} />
        <View style={{ flex: 1 }}><Text style={font.tiny}>{order.service === 'food' ? 'Merchant' : order.service === 'send' ? 'Ambil dari' : 'Jemput'}</Text><Text style={s.addr}>{order.merchant?.name ?? order.pickup_address}</Text>{order.merchant?.address && <Text style={font.small}>{order.merchant.address}</Text>}</View>
      </Row>
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <View style={[s.dot, { backgroundColor: colors.danger, borderRadius: 2, marginTop: 4 }]} />
        <View style={{ flex: 1 }}><Text style={font.tiny}>{order.service === 'send' ? 'Antar ke' : 'Tujuan'}</Text><Text style={s.addr}>{order.dropoff_address}</Text></View>
      </Row>
      <Row gap={8}><Badge text={km(order.distance_km)} color={colors.info} /><Badge text={`±${order.duration_min} mnt`} color={colors.info} /><Badge text={order.payment_method === 'wallet' ? 'AntarPay' : 'Tunai'} color={colors.textSecondary} /></Row>
    </View>
  );
}

export function OrderExtras({ order }: { order: Order }) {
  return (
    <View style={{ gap: 10 }}>
      {order.service === 'food' && order.order_items && (
        <View style={{ gap: 6 }}>
          <Row between><Text style={font.h3}>Pesanan</Text>{order.merchant_status && <Badge text={merchantStatusLabel[order.merchant_status]} color={order.merchant_status === 'ready' ? colors.success : order.merchant_status === 'rejected' ? colors.danger : colors.warning} />}</Row>
          {order.order_items.map((it) => (
            <Row key={it.id} between>
              <Text style={font.body}>{it.qty}× {it.name}{it.notes ? <Text style={font.tiny}>  ({it.notes})</Text> : null}</Text>
              <Text style={{ fontWeight: '600' }}>{rupiah(it.price * it.qty)}</Text>
            </Row>
          ))}
        </View>
      )}
      {order.service === 'send' && (
        <View style={{ gap: 4 }}>
          <Text style={font.h3}>Detail paket</Text>
          <Text style={font.body}>Penerima: <Text style={{ fontWeight: '700' }}>{order.recipient_name}</Text> · {phoneDisplay(order.recipient_phone)}</Text>
          <Text style={font.small}>{order.package_details?.type} · {order.package_details?.weight}{order.package_details?.description ? ` · ${order.package_details.description}` : ''}</Text>
        </View>
      )}
      {order.notes ? <View style={s.note}><Ionicons name="chatbox-ellipses-outline" size={16} color={colors.warning} /><Text style={[font.small, { flex: 1, color: colors.text }]}>{order.notes}</Text></View> : null}
    </View>
  );
}

export function PriceBlock({ order, forDriver }: { order: Order; forDriver?: boolean }) {
  if (forDriver) {
    return (
      <PriceSummary rows={[{ label: 'Tarif perjalanan', value: order.fare_delivery }, { label: 'Potongan platform', value: order.fare_delivery - order.driver_earning, minus: true }]} total={order.driver_earning} />
    );
  }
  return (
    <PriceSummary rows={[{ label: 'Harga makanan', value: order.items_subtotal }, { label: order.service === 'food' || order.service === 'send' ? 'Ongkos kirim' : 'Tarif perjalanan', value: order.fare_delivery }, { label: 'Biaya layanan', value: order.platform_fee }, { label: `Diskon${order.promo_code ? ` (${order.promo_code})` : ''}`, value: order.discount, minus: true }]} total={order.total} />
  );
}

const eventLabel: Record<string, string> = {
  searching: 'Pesanan dibuat, mencari driver', accepted: 'Driver menerima pesanan', arrived: 'Driver tiba di titik jemput', in_progress: 'Perjalanan dimulai',
  completed: 'Pesanan selesai', cancelled: 'Pesanan dibatalkan', driver_cancelled: 'Driver membatalkan, mencari driver lain',
  merchant_accepted: 'Merchant menyiapkan pesanan', merchant_ready: 'Pesanan siap diambil', merchant_rejected: 'Merchant menolak pesanan',
};
export function Timeline({ events }: { events: OrderEvent[] }) {
  if (!events.length) return null;
  return (
    <View>
      <Text style={[font.h3, { marginBottom: 8 }]}>Riwayat status</Text>
      {events.map((e, i) => (
        <Row key={e.id} gap={10} style={{ alignItems: 'flex-start', marginBottom: 8 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={[s.tdot, i === events.length - 1 && { backgroundColor: colors.primary }]} />
            {i < events.length - 1 && <View style={s.tline} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[font.body, { fontSize: 14 }]}>{eventLabel[e.status] ?? e.status}</Text>
            <Text style={font.tiny}>{formatTime(e.created_at)}{e.note && e.status !== 'searching' ? ` · ${e.note}` : ''}</Text>
          </View>
        </Row>
      ))}
    </View>
  );
}

export function driverSubtitle(d: Driver | null) {
  if (!d) return '';
  return `${d.vehicle_brand ?? (d.vehicle_type === 'car' ? 'Mobil' : 'Motor')} · ${d.vehicle_plate}${d.vehicle_color ? ` · ${d.vehicle_color}` : ''}`;
}
export function customerSubtitle(p: Profile | null) { return p ? phoneDisplay(p.phone) : ''; }

export { Divider };
const s = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bg, borderRadius: radius.lg, padding: 12 },
  circle: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  addr: { fontWeight: '600', color: colors.text, fontSize: 14 },
  note: { flexDirection: 'row', gap: 8, backgroundColor: colors.accentLight, padding: 10, borderRadius: radius.md, alignItems: 'center' },
  tdot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border, marginTop: 4 },
  tline: { width: 2, flex: 1, minHeight: 14, backgroundColor: colors.border, marginVertical: 2 },
});
