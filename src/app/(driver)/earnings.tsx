import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, Card, Row } from '@/components/ui';
import { WalletView } from '@/components/WalletView';
import { rpc } from '@/lib/supabase';
import { colors, font, radius } from '@/lib/theme';
import { rupiah } from '@/lib/format';

export default function DriverEarnings() {
  const [sum, setSum] = useState<{ today: number; today_trips: number; week: number; month: number } | null>(null);
  const load = useCallback(async () => { try { setSum(await rpc('driver_earnings_summary')); } catch { /* noop */ } }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  return (
    <Screen title="Pendapatan" scroll={false} padded={false}>
      <View style={{ padding: 16, paddingBottom: 0, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Card>
          <Row between>
            <View><Text style={font.tiny}>Hari ini</Text><Text style={[font.h1, { color: colors.success }]}>{rupiah(sum?.today ?? 0)}</Text><Text style={font.small}>{sum?.today_trips ?? 0} trip selesai</Text></View>
            <View style={{ gap: 8 }}>
              <View style={s.pill}><Text style={font.tiny}>7 hari</Text><Text style={{ fontWeight: '800' }}>{rupiah(sum?.week ?? 0)}</Text></View>
              <View style={s.pill}><Text style={font.tiny}>Bulan ini</Text><Text style={{ fontWeight: '800' }}>{rupiah(sum?.month ?? 0)}</Text></View>
            </View>
          </Row>
        </Card>
        <Text style={[font.tiny, { marginTop: 8 }]}>Order tunai: potongan platform 20% + biaya layanan dipotong dari saldo. Jaga saldo agar tetap positif (batas minus Rp500.000).</Text>
      </View>
      <WalletView allowWithdraw />
    </Screen>
  );
}
const s = StyleSheet.create({ pill: { backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6, minWidth: 120 } });
