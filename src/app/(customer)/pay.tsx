import React from 'react';
import { Screen } from '@/components/ui';
import { WalletView } from '@/components/WalletView';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';

export default function CustomerPay() {
  return (
    <Screen title="AntarPay" scroll={false} padded={false}>
      <WalletView bottomSpace={TAB_BAR_SPACE + 16} />
    </Screen>
  );
}
