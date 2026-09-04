// Tab Pembayaran: metode bayar (tunai / AntarPay / e-wallet / e-money) + riwayat saldo AntarPay
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen, Row, Button } from '@/components/ui';
import { WalletView } from '@/components/WalletView';
import { PaymentMethodsPanel } from '@/components/PaymentMethods';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { colors } from '@/lib/theme';
import { useT } from '@/lib/i18n';

export default function CustomerPay() {
  const [tab, setTab] = useState<'methods' | 'wallet'>('methods');
  const t = useT();
  return (
    <Screen title={t('payment_methods')} scroll={tab === 'methods'} padded={tab === 'methods'} bottomSpace={TAB_BAR_SPACE + 16}
      right={<Row gap={6} style={{ marginRight: 8 }}><Button title="Metode" size="sm" variant={tab === 'methods' ? 'primary' : 'ghost'} onPress={() => setTab('methods')} /><Button title="Saldo" size="sm" variant={tab === 'wallet' ? 'primary' : 'ghost'} color={colors.primary} onPress={() => setTab('wallet')} /></Row>}>
      {tab === 'methods' ? <View><PaymentMethodsPanel /></View> : <WalletView bottomSpace={TAB_BAR_SPACE + 16} />}
    </Screen>
  );
}
