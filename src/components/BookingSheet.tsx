import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Row, Input, Button, toast } from '@/components/ui';
import { PressableScale } from '@/components/motion';
import { useAuth } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { colors, font, radius, glass, shadow } from '@/lib/theme';
import { rupiah } from '@/lib/format';
import type { PaymentMethod, ServiceType } from '@/lib/types';

/** Pilihan metode bayar + promo + catatan — dipakai ride, food, send. */
export function PaymentSection({ method, onMethod, promo, onPromo, notes, onNotes, subtotal, service, onDiscount, notesPlaceholder }: {
  method: PaymentMethod; onMethod: (m: PaymentMethod) => void; promo: string; onPromo: (v: string) => void;
  notes: string; onNotes: (v: string) => void; subtotal: number; service: ServiceType; onDiscount: (d: number) => void; notesPlaceholder?: string;
}) {
  const wallet = useAuth((s) => s.wallet);
  const [checking, setChecking] = useState(false);
  const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const checkPromo = async () => {
    if (!promo.trim()) { onDiscount(0); setPromoMsg(null); return; }
    setChecking(true);
    const { data, error } = await supabase.rpc('apply_promo', { p_code: promo.trim(), p_service: service, p_subtotal: subtotal });
    setChecking(false);
    if (error) { onDiscount(0); setPromoMsg({ ok: false, text: error.message.replace(/^.*?:\s*/, '') }); return; }
    onDiscount(Number(data)); setPromoMsg({ ok: true, text: `Hemat ${rupiah(Number(data))}` }); toast.success('Promo diterapkan');
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={font.label}>Pembayaran</Text>
      <Row gap={10}>
        <PayOption active={method === 'cash'} onPress={() => onMethod('cash')} icon="cash-outline" title="Tunai" subtitle="Bayar ke driver" />
        <PayOption active={method === 'wallet'} onPress={() => onMethod('wallet')} icon="wallet-outline" title="AntarPay" subtitle={`Saldo ${rupiah(wallet?.balance ?? 0)}`} />
      </Row>
      <Row gap={8}>
        <View style={{ flex: 1 }}>
          <Input placeholder="Kode promo" value={promo} onChangeText={(v) => { onPromo(v.toUpperCase()); setPromoMsg(null); }} autoCapitalize="characters" icon="pricetag-outline" />
        </View>
        <Button title="Pakai" size="md" variant="secondary" loading={checking} onPress={checkPromo} />
      </Row>
      {promoMsg && <Text style={{ color: promoMsg.ok ? colors.success : colors.danger, fontSize: 12, marginTop: -6 }}>{promoMsg.text}</Text>}
      <View style={s.notes}>
        <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.textMuted} />
        <TextInput placeholder={notesPlaceholder ?? 'Catatan untuk driver (opsional)'} placeholderTextColor={colors.textMuted} value={notes} onChangeText={onNotes} style={s.notesInput} />
      </View>
    </View>
  );
}

function PayOption({ active, onPress, icon, title, subtitle }: { active: boolean; onPress: () => void; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle: string }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.97} style={[s.pay, active && { borderColor: colors.primary, backgroundColor: colors.primary + '14', ...shadow.glow(colors.primary) }]}>
      <View style={[s.payIcon, active && { backgroundColor: colors.primary }]}><Ionicons name={icon} size={20} color={active ? '#fff' : colors.textSecondary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: colors.text }}>{title}</Text>
        <Text style={font.tiny} numberOfLines={1}>{subtitle}</Text>
      </View>
      {active && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
    </PressableScale>
  );
}

export function PriceSummary({ rows, total }: { rows: { label: string; value: number; minus?: boolean }[]; total: number }) {
  return (
    <View style={{ gap: 6 }}>
      {rows.filter((r) => r.value !== 0).map((r) => (
        <Row key={r.label} between>
          <Text style={font.small}>{r.label}</Text>
          <Text style={{ color: r.minus ? colors.success : colors.text, fontWeight: '600' }}>{r.minus ? '-' : ''}{rupiah(r.value)}</Text>
        </Row>
      ))}
      <Row between style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 2 }}>
        <Text style={font.h3}>Total</Text>
        <Text style={[font.h2, { color: colors.primary }]}>{rupiah(total)}</Text>
      </Row>
    </View>
  );
}

const s = StyleSheet.create({
  pay: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: 'rgba(11,31,42,0.08)', borderRadius: radius.lg, padding: 10, backgroundColor: 'rgba(255,255,255,0.6)' },
  payIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(11,31,42,0.06)', alignItems: 'center', justifyContent: 'center' },
  notes: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: glass.border, borderRadius: radius.md, paddingHorizontal: 12 },
  notesInput: { flex: 1, height: 44, color: colors.text, fontSize: 14 },
});
