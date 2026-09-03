import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Input, Button, Row, Chip, Badge, toast } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { useBooking } from '@/store/booking';
import { rpc } from '@/lib/supabase';
import { pickAndUpload } from '@/lib/upload';
import { colors, font, radius, shadow } from '@/lib/theme';

const CATS = ['Makanan', 'Minuman', 'Jajanan', 'Roti & Kue', 'Sehat'];

export default function BecomeMerchant() {
  const router = useRouter();
  const { merchant, session, loadProfile } = useAuth();
  const setMode = useMode((s) => s.setMode);
  const booking = useBooking();
  const [f, setF] = useState({ name: '', description: '', category: 'Makanan', address: '', lat: 0, lng: 0, image_url: '', prep_minutes: '15', opening_hours: '08:00-22:00' });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const r = booking.consumePickerResult();
    if (r && r.target === 'merchant') setF((p) => ({ ...p, address: r.place.address, lat: r.place.lat, lng: r.place.lng }));
  }, [booking.pickerResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (f.name.trim().length < 3) return toast.error('Nama usaha minimal 3 huruf');
    if (!f.lat) return toast.error('Pilih lokasi usaha di peta');
    try {
      await rpc('register_merchant', { p: { ...f, prep_minutes: Number(f.prep_minutes) || 15 } });
      await loadProfile();
      toast.success('Pendaftaran merchant terkirim, menunggu verifikasi admin');
      router.back();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (merchant) {
    return (
      <Screen title="Merchant Saya" back>
        <Entrance index={0}>
          <Card style={{ gap: 10 }}>
            <Text style={font.h2}>{merchant.name}</Text>
            <Badge text={merchant.status === 'approved' ? 'Aktif' : merchant.status === 'pending' ? 'Menunggu verifikasi admin' : merchant.status} color={merchant.status === 'approved' ? colors.success : colors.warning} />
            <Text style={font.small}>{merchant.address}</Text>
            <Button title="Buka Mode Merchant" color={colors.food} onPress={async () => { await setMode('merchant'); router.replace('/(merchant)'); }} />
          </Card>
        </Entrance>
      </Screen>
    );
  }

  return (
    <Screen title="Daftar Merchant" back footer={<Button title="Kirim Pendaftaran" size="lg" color={colors.food} onPress={submit} />}>
      <View style={{ gap: 16 }}>
        <Entrance index={1}>
          <Card solid style={{ backgroundColor: colors.food, ...shadow.glow(colors.food), overflow: 'hidden' }}><BrandGradient colors={[colors.food, '#EA580C']} style={StyleSheet.absoluteFill} />
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Jualan lebih laris dengan AntarFood</Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>Komisi 15% per pesanan, pencairan ke saldo AntarPay otomatis. Tanpa biaya pendaftaran.</Text>
          </Card>
        </Entrance>
        <Entrance index={2}>
          <Card style={{ gap: 12 }}>
            <Input label="Nama usaha" placeholder="Sate Padang Mak Syukur" value={f.name} onChangeText={set('name')} />
            <Input label="Deskripsi singkat" placeholder="Menu andalan, ciri khas" value={f.description} onChangeText={set('description')} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Kategori</Text>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>{CATS.map((c) => <Chip key={c} label={c} active={f.category === c} onPress={() => set('category')(c)} color={colors.food} />)}</Row>
            <Row gap={10}>
              <Input label="Waktu siap (menit)" keyboardType="number-pad" value={f.prep_minutes} onChangeText={set('prep_minutes')} containerStyle={{ flex: 1 }} />
              <Input label="Jam buka" value={f.opening_hours} onChangeText={set('opening_hours')} containerStyle={{ flex: 1 }} />
            </Row>
          </Card>
        </Entrance>
        <Entrance index={3}>
          <Card style={{ gap: 12 }}>
            <Text style={font.label}>Lokasi & foto</Text>
            <Pressable onPress={() => router.push({ pathname: '/place-picker', params: { target: 'merchant', title: 'Lokasi usaha' } } as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, padding: 12, borderRadius: radius.md }}>
              <Ionicons name="location-outline" size={20} color={colors.food} />
              <Text style={[font.body, { flex: 1 }, !f.address && { color: colors.textMuted }]} numberOfLines={2}>{f.address || 'Pilih lokasi usaha di peta'}</Text>
            </Pressable>
            <Pressable onPress={async () => { if (!session) return; try { const r = await pickAndUpload('merchant-images', session.user.id); if (r) set('image_url')(r.url); } catch (e) { toast.error((e as Error).message); } }}
              style={{ alignItems: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: f.image_url ? colors.success : colors.border, borderRadius: radius.md, padding: 16 }}>
              <Ionicons name={f.image_url ? 'checkmark-circle' : 'image-outline'} size={26} color={f.image_url ? colors.success : colors.textMuted} />
              <Text style={{ fontWeight: '600', color: f.image_url ? colors.success : colors.textSecondary }}>{f.image_url ? 'Foto terunggah' : 'Unggah foto usaha (sampul)'}</Text>
            </Pressable>
          </Card>
        </Entrance>
      </View>
    </Screen>
  );
}
