import React from 'react';
import { Screen } from '@/components/ui';
import { WalletView } from '@/components/WalletView';

export default function CustomerPay() {
  return (
    <Screen title="AntarPay" scroll={false} padded={false}>
      <WalletView />
    </Screen>
  );
}
