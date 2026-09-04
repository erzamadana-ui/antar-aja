import React from 'react';
import { Text, View } from 'react-native';
import { Screen, Card } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { LanguageList } from '@/components/LanguagePicker';
import { useT } from '@/lib/i18n';
import { font } from '@/lib/theme';

export default function LanguageScreen() {
  const t = useT();
  return (
    <Screen title={t('language')} back maxWidth={560}>
      <Entrance index={0}><Text style={[font.h2, { marginBottom: 4 }]}>{t('choose_language')}</Text><Text style={[font.small, { marginBottom: 14 }]}>{t('rtl_note')}</Text></Entrance>
      <Entrance index={1}><Card><View><LanguageList /></View></Card></Entrance>
    </Screen>
  );
}
