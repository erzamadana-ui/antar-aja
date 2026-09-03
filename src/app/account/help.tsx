import React, { useEffect, useState } from 'react';
import { View, Text, Linking } from 'react-native';
import { Screen, Card, Button, ListItem, Divider } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { font } from '@/lib/theme';

const FAQ = [
  ['Bagaimana cara top up AntarPay?', 'Buka AntarPay > Top Up, transfer ke rekening resmi, unggah bukti. Admin memverifikasi maksimal 1×24 jam.'],
  ['Bagaimana tarif dihitung?', 'Tarif = tarif per km × jarak rute (minimal tarif berlaku) + biaya layanan. Rincian selalu tampil sebelum Anda memesan.'],
  ['Bisakah membatalkan pesanan?', 'Bisa selama driver belum memulai perjalanan. Pembayaran AntarPay dikembalikan otomatis ke saldo.'],
  ['Driver membatalkan, bagaimana?', 'Sistem otomatis mencari driver lain tanpa Anda perlu memesan ulang.'],
  ['Bagaimana menjadi mitra driver/merchant?', 'Menu Akun > Daftar jadi Mitra. Lengkapi dokumen, tunggu verifikasi admin.'],
];

export default function Help() {
  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => { supabase.from('app_settings').select('value').eq('key', 'support_phone').maybeSingle().then(({ data }) => setPhone((data?.value as string) ?? null)); }, []);
  return (
    <Screen title="Bantuan" back>
      <Entrance index={0}>
        <Card style={{ gap: 10 }}>
          <Text style={font.label}>Hubungi kami</Text>
          <Text style={font.small}>Tim Antar Aja siap membantu setiap hari 07.00–22.00 WIB.</Text>
          {phone && <Button title={`WhatsApp CS ${phone}`} icon="logo-whatsapp" onPress={() => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`)} />}
        </Card>
      </Entrance>
      <View style={{ height: 16 }} />
      <Entrance index={1}>
        <Card padded={false}>
          <View style={{ paddingHorizontal: 12 }}>
            {FAQ.map(([q, a], i) => (
              <View key={q}>
                {i > 0 && <Divider style={{ marginVertical: 0 }} />}
                <ListItem icon="help-circle-outline" title={q} subtitle={a} />
              </View>
            ))}
          </View>
        </Card>
      </Entrance>
    </Screen>
  );
}
