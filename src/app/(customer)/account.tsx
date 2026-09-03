import React from 'react';
import { View, Text, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Row, Avatar, ListItem, Divider, Badge } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { useT, useI18n, LOCALES } from '@/lib/i18n';
import { colors, font } from '@/lib/theme';
import { phoneDisplay } from '@/lib/format';

export default function Account() {
  const router = useRouter();
  const { profile, driver, merchant, signOut } = useAuth();
  const setMode = useMode((s) => s.setMode);
  const t = useT();
  const locale = useI18n((s) => s.locale);

  const confirmSignOut = () => {
    const doIt = async () => { await signOut(); router.replace('/(auth)/welcome'); };
    if (Platform.OS === 'web') { if (confirm('Keluar dari akun?')) doIt(); return; }
    Alert.alert('Keluar', 'Keluar dari akun Antar Aja?', [{ text: 'Batal' }, { text: 'Keluar', style: 'destructive', onPress: doIt }]);
  };

  return (
    <Screen title={t('account')} bottomSpace={TAB_BAR_SPACE + 16}>
      <Entrance index={0}><Card>
        <Row gap={14}>
          <Avatar name={profile?.full_name} url={profile?.avatar_url} size={60} />
          <View style={{ flex: 1 }}>
            <Text style={font.h2}>{profile?.full_name}</Text>
            <Text style={font.small}>{phoneDisplay(profile?.phone)} · {profile?.email}</Text>
            <Row gap={6} style={{ marginTop: 6 }}>
              <Badge text={profile?.role === 'admin' ? 'Admin' : profile?.role === 'driver' ? 'Mitra Driver' : profile?.role === 'merchant' ? 'Merchant' : 'Pelanggan'} />
            </Row>
          </View>
        </Row>
      </Card></Entrance>

      <Entrance index={1}><Card style={{ marginTop: 16 }} padded={false}>
        <View style={{ paddingHorizontal: 12 }}>
          <ListItem icon="person-outline" title={t('edit_profile')} subtitle="Nama, nomor HP, foto" onPress={() => router.push('/account/edit')} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="bookmark-outline" title={t('saved_places')} subtitle="Rumah, kantor, dan lainnya" onPress={() => router.push('/account/places')} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="wallet-outline" title="AntarPay" subtitle="Saldo & riwayat" onPress={() => router.push('/(customer)/pay')} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="language-outline" title={t('language')} subtitle={LOCALES.find((l) => l.code === locale)?.native} onPress={() => router.push('/account/language')} />
        </View>
      </Card></Entrance>

      <Entrance index={2}><Text style={[font.label, { marginTop: 24, marginBottom: 8 }]}>{t('mode_partner')}</Text>
      <Card padded={false}>
        <View style={{ paddingHorizontal: 12 }}>
          {driver ? (
            <ListItem icon="bicycle-outline" iconColor={colors.ride} title={t('switch_driver')} subtitle={driver.status === 'approved' ? 'Akun mitra aktif' : driver.status === 'pending' ? 'Menunggu verifikasi admin' : 'Akun ' + driver.status}
              onPress={async () => { await setMode('driver'); router.replace('/(driver)'); }} />
          ) : (
            <ListItem icon="bicycle-outline" iconColor={colors.ride} title={t('become_driver')} subtitle="Motor atau mobil, penghasilan fleksibel" onPress={() => router.push('/account/become-driver')} />
          )}
          <Divider style={{ marginVertical: 0 }} />
          {merchant ? (
            <ListItem icon="storefront-outline" iconColor={colors.food} title={t('switch_merchant')} subtitle={merchant.status === 'approved' ? merchant.name : 'Menunggu verifikasi admin'} onPress={async () => { await setMode('merchant'); router.replace('/(merchant)'); }} />
          ) : (
            <ListItem icon="storefront-outline" iconColor={colors.food} title={t('become_merchant')} subtitle="Jual makanan & minuman ke ribuan pelanggan" onPress={() => router.push('/account/become-merchant')} />
          )}
          {profile?.role === 'admin' && (<>
            <Divider style={{ marginVertical: 0 }} />
            <ListItem icon="shield-checkmark-outline" iconColor={colors.info} title={t('admin_panel')} subtitle="Kelola driver, merchant, tarif, top up" onPress={async () => { await setMode('admin'); router.replace('/(admin)'); }} />
          </>)}
        </View>
      </Card></Entrance>

      <Entrance index={3}><Text style={[font.label, { marginTop: 24, marginBottom: 8 }]}>{t('others')}</Text>
      <Card padded={false}>
        <View style={{ paddingHorizontal: 12 }}>
          <ListItem icon="help-circle-outline" title={t('help')} onPress={() => router.push('/account/help')} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="log-out-outline" title={t('logout')} danger onPress={confirmSignOut} />
        </View>
      </Card></Entrance>
      <Text style={[font.tiny, { textAlign: 'center', marginTop: 24 }]}>Antar Aja v2.0 · Desain 2026</Text>
    </Screen>
  );
}
