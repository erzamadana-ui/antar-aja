// Aplikasi Mitra — layar pilih jenis mitra untuk akun yang belum punya peran mitra.
import React from 'react';
import { View, Text, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Row, Avatar, Badge, ListItem, Divider, Button } from '@/components/ui';
import { Entrance, PressableScale } from '@/components/motion';
import { ServiceArt, type ArtKind } from '@/components/ServiceArt';
import { useAuth } from '@/store/auth';
import { colors, font, radius, shadow } from '@/lib/theme';
import { openApp } from '@/lib/app';

const OPTIONS: { key: string; title: string; sub: string; art: ArtKind; color: string; href: string }[] = [
  { key: 'driver', title: 'Driver motor / mobil', sub: 'AntarRide, AntarCar, AntarFood, AntarSend, AntarShop, AntarMarket', art: 'rider', color: colors.ride, href: '/account/become-driver' },
  { key: 'box', title: 'Mobil box / pick up', sub: 'AntarBox: kirim barang, pindahan rumah/kost', art: 'box', color: colors.box, href: '/account/become-driver?vehicle=box' },
  { key: 'travel', title: 'Mitra travel & sopir pribadi', sub: 'Kursi bersama, carter privat, atau sopir harian antar kota', art: 'travel', color: colors.travel, href: '/account/become-travel' },
  { key: 'merchant', title: 'Merchant makanan & minuman', sub: 'Jual ke pelanggan AntarFood, badge halal', art: 'food', color: colors.food, href: '/account/become-merchant' },
];

export default function MitraOnboarding() {
  const router = useRouter();
  const { profile, driver, merchant, travelPartner, signOut } = useAuth();
  const pending = [driver && driver.status !== 'approved' ? `Driver: ${driver.status}` : null, merchant && merchant.status !== 'approved' ? `Merchant: ${merchant.status}` : null, travelPartner && travelPartner.status !== 'approved' ? `Travel: ${travelPartner.status}` : null].filter(Boolean) as string[];
  const confirmSignOut = () => {
    const doIt = async () => { await signOut(); router.replace('/(auth)/welcome'); };
    if (Platform.OS === 'web') { if (confirm('Keluar dari akun?')) doIt(); return; }
    Alert.alert('Keluar', 'Keluar dari akun?', [{ text: 'Batal' }, { text: 'Keluar', style: 'destructive', onPress: doIt }]);
  };
  return (
    <Screen title="Jadi Mitra AntarKita" ambient="amber">
      <Entrance index={0}><Card>
        <Row gap={12}>
          <Avatar name={profile?.full_name} url={profile?.avatar_url} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>{profile?.full_name}</Text>
            <Text style={font.small}>Akun ini belum terdaftar sebagai mitra aktif. Pilih jenis kemitraan di bawah.</Text>
          </View>
        </Row>
        {pending.length > 0 && <Row gap={6} style={{ marginTop: 10, flexWrap: 'wrap' }}>{pending.map((p) => <Badge key={p} text={p} color={colors.warning} />)}</Row>}
      </Card></Entrance>
      <View style={{ gap: 12, marginTop: 16 }}>
        {OPTIONS.map((o, i) => (
          <Entrance key={o.key} index={1 + i}>
            <PressableScale onPress={() => router.push(o.href as never)} style={{ borderRadius: radius.lg }}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: o.color + '1A', alignItems: 'center', justifyContent: 'center' }}><ServiceArt kind={o.art} color={o.color} size={40} glow={false} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[font.h3, { fontSize: 16 }]}>{o.title}</Text>
                  <Text style={font.small}>{o.sub}</Text>
                </View>
              </Card>
            </PressableScale>
          </Entrance>
        ))}
      </View>
      <Entrance index={6}><Card style={{ marginTop: 16 }} padded={false}>
        <View style={{ paddingHorizontal: 12 }}>
          <ListItem icon="open-outline" title="Buka aplikasi Pelanggan" subtitle="Untuk memesan layanan sebagai pelanggan" onPress={() => openApp('pelanggan')} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="chatbubbles-outline" iconColor={colors.info} title="Bantuan & tiket aduan" onPress={() => router.push('/support' as never)} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="log-out-outline" title="Keluar" danger onPress={confirmSignOut} />
        </View>
      </Card></Entrance>
      <Text style={[font.tiny, { textAlign: 'center', marginTop: 20 }]}>Pengajuan diverifikasi admin (dokumen, kendaraan, sertifikasi). Notifikasi masuk di kotak masuk.</Text>
    </Screen>
  );
}
