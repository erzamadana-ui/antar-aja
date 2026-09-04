import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { View, Text, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Row, Avatar, ListItem, Divider, Badge } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { useAuth } from '@/store/auth';
import { useT, useI18n, LOCALES } from '@/lib/i18n';
import { colors, font } from '@/lib/theme';
import { phoneDisplay } from '@/lib/format';
import { openApp, APP_URL } from '@/lib/app';

export default function Account() {
  const router = useRouter();
  const [hasExec, setHasExec] = useState(false);
  const uid = useAuth((st) => st.session?.user.id);
  useEffect(() => { if (uid) supabase.from('exec_access').select('user_id').eq('user_id', uid).eq('active', true).maybeSingle().then(({ data }) => setHasExec(!!data)); }, [uid]);
  const { profile, driver, merchant, signOut } = useAuth();
  const t = useT();
  const locale = useI18n((s) => s.locale);

  const confirmSignOut = () => {
    const doIt = async () => { await signOut(); router.replace('/(auth)/welcome'); };
    if (Platform.OS === 'web') { if (confirm('Keluar dari akun?')) doIt(); return; }
    Alert.alert('Keluar', 'Keluar dari akun AntarKita?', [{ text: 'Batal' }, { text: 'Keluar', style: 'destructive', onPress: doIt }]);
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
          <ListItem icon="language-outline" title={t('language')} subtitle={LOCALES.find((l) => l.code === locale)?.native} onPress={() => router.push('/account/language')} />
        </View>
      </Card></Entrance>

      <Entrance index={2}><Text style={[font.label, { marginTop: 24, marginBottom: 8 }]}>{t('mode_partner')}</Text>
      <Card padded={false}>
        <View style={{ paddingHorizontal: 12 }}>
          <ListItem icon="bicycle-outline" iconColor={colors.ride} title={driver || merchant ? 'Buka aplikasi AntarKita Mitra' : 'Jadi Mitra AntarKita'} subtitle={driver || merchant ? 'Pesanan mitra dikelola di aplikasi Mitra (terpisah)' : 'Driver motor/mobil/box, merchant, atau mitra travel — di aplikasi Mitra'} onPress={() => openApp('mitra')} />
          {hasExec && (<>
            <Divider style={{ marginVertical: 0 }} />
            <ListItem icon="shield-half-outline" iconColor="#0B1F2A" title="Portal Eksekutif" subtitle="Laporan manajemen & pemegang saham (di aplikasi Admin)" onPress={() => openApp('admin')} />
          </>)}
          {profile?.role === 'admin' && (<>
            <Divider style={{ marginVertical: 0 }} />
            <ListItem icon="shield-checkmark-outline" iconColor={colors.info} title={t('admin_panel')} subtitle={APP_URL.admin} onPress={() => openApp('admin')} />
          </>)}
        </View>
      </Card></Entrance>

      <Entrance index={3}><Text style={[font.label, { marginTop: 24, marginBottom: 8 }]}>{t('others')}</Text>
      <Card padded={false}>
        <View style={{ paddingHorizontal: 12 }}>
          <ListItem icon="shield-checkmark-outline" iconColor={colors.danger} title="Pusat Keamanan" subtitle="Kontak darurat, bagikan perjalanan, SOS" onPress={() => router.push('/safety' as never)} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="chatbubbles-outline" iconColor={colors.info} title={t('help')} subtitle={t('help_sub')} onPress={() => router.push('/support' as never)} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="log-out-outline" title={t('logout')} danger onPress={confirmSignOut} />
        </View>
      </Card></Entrance>
      <Text style={[font.tiny, { textAlign: 'center', marginTop: 24 }]}>AntarKita v3.0</Text>
    </Screen>
  );
}
