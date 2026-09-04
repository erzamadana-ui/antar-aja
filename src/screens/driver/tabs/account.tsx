import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Row, Avatar, ListItem, Divider, Badge, Button } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { colors, font } from '@/lib/theme';
import { openApp } from '@/lib/app';

export default function DriverAccount() {
  const router = useRouter();
  const { profile, driver, merchant, signOut } = useAuth();
  const setMode = useMode((s) => s.setMode);
  return (
    <Screen title="Akun Mitra" ambient="amber" bottomSpace={TAB_BAR_SPACE + 16}>
      <Entrance index={0}><Card>
        <Row gap={14}>
          <Avatar name={profile?.full_name} url={profile?.avatar_url} size={60} />
          <View style={{ flex: 1 }}>
            <Text style={font.h2}>{profile?.full_name}</Text>
            <Text style={font.small}>{driver?.vehicle_brand} · {driver?.vehicle_plate}</Text>
            <Badge text={driver?.status === 'approved' ? 'Mitra aktif' : `Status: ${driver?.status}`} color={driver?.status === 'approved' ? colors.success : colors.warning} style={{ marginTop: 6 }} />
          </View>
        </Row>
        <Row gap={16} style={{ marginTop: 14 }}>
          <View><Text style={font.tiny}>Rating</Text><Text style={font.h3}>⭐ {Number(driver?.rating_avg ?? 5).toFixed(2)}</Text></View>
          <View><Text style={font.tiny}>Ulasan</Text><Text style={font.h3}>{driver?.rating_count}</Text></View>
          <View><Text style={font.tiny}>Total trip</Text><Text style={font.h3}>{driver?.total_trips}</Text></View>
        </Row>
      </Card></Entrance>
      <Entrance index={1}><Card style={{ marginTop: 16 }} padded={false}>
        <View style={{ paddingHorizontal: 12 }}>
          <ListItem icon="person-outline" title="Edit profil" onPress={() => router.push('/account/edit')} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="car-outline" title="Data kendaraan & dokumen" subtitle={driver?.vehicle_class ? `Kelas: ${driver.vehicle_class}` : undefined} onPress={() => router.push('/account/become-driver')} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="bus-outline" iconColor={colors.travel} title="Mitra AntarTravel" subtitle="Jadwal travel antar kota, manifest penumpang" onPress={() => router.push('/driver/travel' as never)} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="shield-checkmark-outline" iconColor={colors.danger} title="Pusat Keamanan" subtitle="SOS, verifikasi wajah, kontak darurat, laporan insiden" onPress={() => router.push('/safety' as never)} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="chatbubbles-outline" iconColor={colors.info} title="Bantuan & tiket aduan" subtitle="CS online" onPress={() => router.push('/support' as never)} />
          <Divider style={{ marginVertical: 0 }} />
          <ListItem icon="language-outline" title="Bahasa / Language" onPress={() => router.push('/account/language')} />
        </View>
      </Card></Entrance>
      <Entrance index={2} style={{ marginTop: 16, gap: 10 }}>
        {merchant ? <Button title="Beralih ke Mode Merchant" variant="secondary" icon="storefront-outline" onPress={async () => { await setMode('merchant'); router.replace('/(merchant)'); }} /> : null}
        <Button title="Buka aplikasi Pelanggan (pesan sebagai pelanggan)" variant="glass" icon="open-outline" onPress={() => openApp('pelanggan')} />
        <Button title="Keluar" variant="outline" color={colors.danger} onPress={async () => { await signOut(); router.replace('/(auth)/welcome'); }} />
      </Entrance>
    </Screen>
  );
}
