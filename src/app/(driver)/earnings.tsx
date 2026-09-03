import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Row } from '@/components/ui';
import { WalletView } from '@/components/WalletView';
import { BrandGradient } from '@/components/glass';
import { AnimatedNumber, Entrance } from '@/components/motion';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { rpc } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import { rupiah } from '@/lib/format';

export default function DriverEarnings() {
  const [sum, setSum] = useState<{ today: number; today_trips: number; week: number; month: number } | null>(null);
  const load = useCallback(async () => { try { setSum(await rpc('driver_earnings_summary')); } catch { /* noop */ } }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  return (
    <Screen title="Pendapatan" scroll={false} padded={false} ambient="amber">
      <View style={{ padding: 16, paddingBottom: 0, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Entrance index={0} from="zoom">
          <BrandGradient colors={[colors.success, '#047857']} style={[s.hero, shadow.glow(colors.success)]}>
            <View style={s.orb} />
            <Row between style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Row gap={6}><Ionicons name="sunny" size={14} color="rgba(255,255,255,0.85)" /><Text style={s.lbl}>Hari ini</Text></Row>
                <AnimatedNumber value={sum?.today ?? 0} format={rupiah} style={{ color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 }} />
                <Text style={s.lbl}>{sum?.today_trips ?? 0} trip selesai</Text>
              </View>
              <View style={{ gap: 8 }}>
                <View style={s.pill}><Text style={s.lbl}>7 hari</Text><AnimatedNumber value={sum?.week ?? 0} format={rupiah} style={{ fontWeight: '800', color: '#fff' }} /></View>
                <View style={s.pill}><Text style={s.lbl}>Bulan ini</Text><AnimatedNumber value={sum?.month ?? 0} format={rupiah} style={{ fontWeight: '800', color: '#fff' }} /></View>
              </View>
            </Row>
          </BrandGradient>
        </Entrance>
        <Entrance index={1}><Text style={[font.tiny, { marginTop: 10 }]}>Order tunai: potongan platform 20% + biaya layanan dipotong dari saldo. Jaga saldo agar tetap positif (batas minus Rp500.000).</Text></Entrance>
      </View>
      <WalletView allowWithdraw bottomSpace={TAB_BAR_SPACE + 16} />
    </Screen>
  );
}
const s = StyleSheet.create({
  hero: { borderRadius: radius.xxl, padding: 18, overflow: 'hidden' },
  orb: { position: 'absolute', right: -40, top: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: '#fff', opacity: 0.1 },
  lbl: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  pill: { backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6, minWidth: 120 },
});
