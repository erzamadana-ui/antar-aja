import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, RefreshControl, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Card, Empty, Row, IconCircle, Badge } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { colors, font, radius } from '@/lib/theme';
import { rupiah, formatDate } from '@/lib/format';
import type { WalletTx, TopupRequest, WithdrawalRequest } from '@/lib/types';

const txMeta: Record<WalletTx['type'], { label: string; icon: string; color: string }> = {
  topup: { label: 'Top up', icon: 'arrow-down-circle', color: colors.success },
  payment: { label: 'Pembayaran', icon: 'cart', color: colors.danger },
  earning: { label: 'Pendapatan', icon: 'cash', color: colors.success },
  refund: { label: 'Refund', icon: 'refresh-circle', color: colors.info },
  withdrawal: { label: 'Penarikan', icon: 'arrow-up-circle', color: colors.warning },
  fee: { label: 'Potongan platform', icon: 'remove-circle', color: colors.danger },
  adjustment: { label: 'Penyesuaian', icon: 'construct', color: colors.textSecondary },
};

/** Tampilan dompet yang dipakai customer & driver/merchant. */
export function WalletView({ allowWithdraw }: { allowWithdraw?: boolean }) {
  const router = useRouter();
  const { wallet, refreshWallet, session } = useAuth();
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [pending, setPending] = useState<(TopupRequest | WithdrawalRequest)[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const uid = session?.user.id;

  const load = useCallback(async () => {
    if (!uid) return;
    const [{ data: t }, { data: tp }, { data: wd }] = await Promise.all([
      supabase.from('wallet_transactions').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(50),
      supabase.from('topup_requests').select('*').eq('user_id', uid).eq('status', 'pending'),
      supabase.from('withdrawal_requests').select('*').eq('user_id', uid).eq('status', 'pending'),
    ]);
    setTxs((t as WalletTx[]) ?? []);
    setPending([...((tp as TopupRequest[]) ?? []), ...((wd as WithdrawalRequest[]) ?? [])]);
    await refreshWallet();
  }, [uid, refreshWallet]);
  useEffect(() => { load(); }, [load]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={{ borderRadius: radius.xl, padding: 20 }}>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Saldo AntarPay</Text>
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900', marginVertical: 6 }}>{rupiah(wallet?.balance ?? 0)}</Text>
        <Row gap={10} style={{ marginTop: 8 }}>
          <Button title="Top Up" icon="add" size="sm" style={{ backgroundColor: '#fff', flex: 1 }} color="#fff" onPress={() => router.push('/pay/topup')} />
          {allowWithdraw && <Button title="Tarik Saldo" icon="arrow-up" size="sm" variant="outline" color="#fff" style={{ flex: 1 }} onPress={() => router.push('/pay/withdraw')} />}
        </Row>
      </LinearGradient>

      {pending.length > 0 && (
        <Card style={{ marginTop: 16, backgroundColor: colors.accentLight }}>
          <Text style={{ fontWeight: '700', color: colors.warning }}>Menunggu verifikasi admin</Text>
          {pending.map((p) => (
            <Row key={p.id} between style={{ marginTop: 6 }}>
              <Text style={font.small}>{'bank_name' in p ? 'Penarikan' : 'Top up'} · {formatDate(p.created_at)}</Text>
              <Text style={{ fontWeight: '700' }}>{rupiah(p.amount)}</Text>
            </Row>
          ))}
        </Card>
      )}

      <Text style={[font.h3, { marginTop: 20, marginBottom: 8 }]}>Riwayat transaksi</Text>
      {txs.length === 0 ? <Empty icon="wallet-outline" title="Belum ada transaksi" /> : (
        <Card padded={false}>
          {txs.map((t, i) => {
            const m = txMeta[t.type];
            return (
              <Row key={t.id} gap={12} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <IconCircle name={m.icon as never} color={m.color} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{t.note ?? m.label}</Text>
                  <Text style={font.tiny}>{formatDate(t.created_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: '800', color: t.amount >= 0 ? colors.success : colors.text }}>{t.amount >= 0 ? '+' : '-'}{rupiah(Math.abs(t.amount))}</Text>
                  <Text style={font.tiny}>Saldo {rupiah(t.balance_after)}</Text>
                </View>
              </Row>
            );
          })}
        </Card>
      )}
      <View style={{ marginTop: 16 }}>
        <Badge text="Top up manual via transfer bank, diverifikasi admin ≤ 1×24 jam" color={colors.textSecondary} />
      </View>
    </ScrollView>
  );
}
