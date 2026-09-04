// Driver memasukkan total belanja aktual (AntarShop) + foto struk
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Row, Button, Badge, toast } from '@/components/ui';
import { rpc } from '@/lib/supabase';
import { pickAndUpload } from '@/lib/upload';
import { useAuth } from '@/store/auth';
import { colors, font, radius, glass } from '@/lib/theme';
import { rupiah } from '@/lib/format';
import type { Order } from '@/lib/types';

export function ShopTotalCard({ order, onDone }: { order: Order; onDone: () => void }) {
  const session = useAuth((s) => s.session);
  const [amount, setAmount] = useState(String(order.receipt_url ? order.items_subtotal : ''));
  const [receipt, setReceipt] = useState<string | null>(order.receipt_url ?? null);
  const [busy, setBusy] = useState(false);
  const budget = order.est_budget ?? 0;
  const limit = Math.max(budget * 1.5, budget + 100000);
  const upload = async () => { if (!session) return; try { const r = await pickAndUpload('proofs', session.user.id); if (r) setReceipt(r.url); } catch (e) { toast.error((e as Error).message); } };
  const save = async () => {
    const v = Number(amount.replace(/\D/g, ''));
    if (!v) { toast.error('Masukkan total belanja'); return; }
    setBusy(true);
    try { await rpc('set_shop_total', { p_order_id: order.id, p_amount: v, p_receipt_url: receipt }); toast.success('Total belanja disimpan'); onDone(); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  return (
    <View style={s.card}>
      <Row gap={8}><Ionicons name="basket" size={18} color={colors.shop} /><Text style={font.h3}>Total belanja aktual</Text><Badge text={`Anggaran ${rupiah(budget)}`} color={colors.shop} /></Row>
      <Text style={font.tiny}>Sesuai struk. Batas maksimal {rupiah(limit)} — jika lebih, konfirmasi ke pelanggan lewat chat/telepon.{order.payment_method === 'wallet' ? ' Selisih otomatis disesuaikan dari AntarPay pelanggan; penggantian belanja masuk ke saldo Anda saat order selesai.' : ' Pesanan tunai: tagih total ke pelanggan saat serah terima.'}</Text>
      <Row gap={8}>
        <TextInput placeholder="Total sesuai struk (Rp)" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ''))} style={s.input} />
        <Button title={receipt ? 'Struk ✓' : 'Foto struk'} size="md" variant="secondary" icon="camera-outline" onPress={upload} />
      </Row>
      <Button title="Simpan total belanja" size="md" color={colors.shop} loading={busy} onPress={save} />
    </View>
  );
}
const s = StyleSheet.create({
  card: { gap: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.shop + '55' },
  input: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: glass.border, backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 12, color: colors.text },
});
