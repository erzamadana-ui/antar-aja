import React from 'react';
import { View, Text, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Row, Avatar, ListItem, Divider, Badge } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { colors, font } from '@/lib/theme';
import { phoneDisplay } from '@/lib/format';

export default function Account() {
  const router = useRouter();
  const { profile, driver, merchant, signOut } = useAuth();
  const setMode = useMode((s) => s.setMode);

  const confirmSignOut = () => {
    const doIt = async () => { await signOut(); router.replace('/(auth)/welcome'); };
    if (Platform.OS === 'web') { if (confirm('Keluar dari akun?')) doIt(); return; }
    Alert.alert('Keluar', 'Keluar dari akun Antar Aja?', [{ text: 'Batal' }, { text: 'Keluar', style: 'destructive', onPress: doIt }]);
  };

  return (
    <Screen title="Akun">
      <Card>
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
      </Card>

      <Card style={{ marginTop: 16 }} padded={false}>
        <View style={{ paddingHorizontal: 12 }}>
          <ListItem icon="person-outline" title="Edit profil" subtitle="Nama, nomor HP, foto" onPress={() => router.push('/account/edit')} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="bookmark-outline" title="Alamat tersimpan" subtitle="Rumah, kantor, dan lainnya" onPress={() => router.push('/account/places')} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="wallet-outline" title="AntarPay" subtitle="Saldo & riwayat" onPress={() => router.push('/(customer)/pay')} />
        </View>
      </Card>

      <Text style={[font.h3, { marginTop: 24, marginBottom: 8 }]}>Mode & Kemitraan</Text>
      <Card padded={false}>
        <View style={{ paddingHorizontal: 12 }}>
          {driver ? (
            <ListItem icon="bicycle-outline" iconColor={colors.ride} title="Beralih ke Mode Driver" subtitle={driver.status === 'approved' ? 'Akun mitra aktif' : driver.status === 'pending' ? 'Menunggu verifikasi admin' : 'Akun ' + driver.status}
              onPress={async () => { await setMode('driver'); router.replace('/(driver)'); }} />
          ) : (
            <ListItem icon="bicycle-outline" iconColor={colors.ride} title="Daftar jadi Mitra Driver" subtitle="Motor atau mobil, penghasilan fleksibel" onPress={() => router.push('/account/become-driver')} />
          )}
          <Divider style={{ marginVertical: 0 }} />
          {merchant ? (
            <ListItem icon="storefront-outline" iconColor={colors.food} title="Beralih ke Mode Merchant" subtitle={merchant.status === 'approved' ? merchant.name : 'Menunggu verifikasi admin'} onPress={async () => { await setMode('merchant'); router.replace('/(merchant)'); }} />
          ) : (
            <ListItem icon="storefront-outline" iconColor={colors.food} title="Daftar jadi Merchant AntarFood" subtitle="Jual makanan & minuman ke ribuan pelanggan" onPress={() => router.push('/account/become-merchant')} />
          )}
          {profile?.role === 'admin' && (<>
            <Divider style={{ marginVertical: 0 }} />
            <ListItem icon="shield-checkmark-outline" iconColor={colors.info} title="Panel Admin" subtitle="Kelola driver, merchant, tarif, top up" onPress={async () => { await setMode('admin'); router.replace('/(admin)'); }} />
          </>)}
        </View>
      </Card>

      <Text style={[font.h3, { marginTop: 24, marginBottom: 8 }]}>Lainnya</Text>
      <Card padded={false}>
        <View style={{ paddingHorizontal: 12 }}>
          <ListItem icon="help-circle-outline" title="Bantuan & FAQ" onPress={() => router.push('/account/help')} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="log-out-outline" title="Keluar" danger onPress={confirmSignOut} />
        </View>
      </Card>
      <Text style={[font.tiny, { textAlign: 'center', marginTop: 24 }]}>Antar Aja v1.0.0</Text>
    </Screen>
  );
}
