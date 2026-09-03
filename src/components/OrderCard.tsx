import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Row, Badge, IconCircle } from '@/components/ui';
import { colors, font } from '@/lib/theme';
import { rupiah, statusLabel, statusColor, formatDate, serviceLabel } from '@/lib/format';
import { serviceDef } from '@/lib/services';
import type { Order } from '@/lib/types';

export function OrderCard({ order, href, compact }: { order: Order; href?: string; compact?: boolean }) {
  const router = useRouter();
  const def = serviceDef(order.service);
  const active = !['completed', 'cancelled'].includes(order.status);
  return (
    <Card onPress={() => router.push((href ?? `/order/${order.id}`) as never)} style={[{ marginBottom: 12 }, active && { borderLeftWidth: 4, borderLeftColor: def.color }]}>
      <Row gap={12}>
        <IconCircle name={def.icon as never} color={def.color} size={42} />
        <View style={{ flex: 1 }}>
          <Row between>
            <Text style={[font.h3, { fontSize: 15 }]}>{serviceLabel[order.service]}</Text>
            <Text style={{ fontWeight: '800', color: colors.text }}>{rupiah(order.total)}</Text>
          </Row>
          <Text style={font.tiny}>{order.code} · {formatDate(order.created_at)}</Text>
        </View>
      </Row>
      {!compact && (
        <View style={{ marginTop: 10, gap: 4 }}>
          <Row gap={8}><View style={[s.dot, { backgroundColor: colors.primary }]} /><Text style={font.small} numberOfLines={1}>{order.merchant?.name ?? order.pickup_address}</Text></Row>
          <Row gap={8}><View style={[s.dot, { backgroundColor: colors.danger }]} /><Text style={font.small} numberOfLines={1}>{order.dropoff_address}</Text></Row>
        </View>
      )}
      <Row between style={{ marginTop: 10 }}>
        <Badge text={statusLabel(order.status, order.service, order.merchant_status)} color={statusColor(order.status)} />
        <Text style={font.tiny}>{order.payment_method === 'wallet' ? 'AntarPay' : 'Tunai'}</Text>
      </Row>
    </Card>
  );
}

const s = StyleSheet.create({ dot: { width: 8, height: 8, borderRadius: 4 } });
