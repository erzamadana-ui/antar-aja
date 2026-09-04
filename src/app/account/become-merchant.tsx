import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Input, Button, Row, Chip, Badge, toast } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { DocUpload } from '@/components/DocUpload';
import { MerchantStatusCard } from '@/components/MerchantStatus';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { useBooking } from '@/store/booking';
import { rpc } from '@/lib/supabase';
import { pickAndUpload } from '@/lib/upload';
import { colors, font, radius, shadow } from '@/lib/theme';

const CATS = ['Makanan', 'Minuman', 'Jajanan', 'Roti & Kue', 'Sehat'];
const BANKS = ['BCA', 'BRI', 'Mandiri', 'BNI', 'BSI', 'Bank Nagari', 'Bank Riau Kepri', 'Lainnya'];

export default function BecomeMerchant() {
  const router = useRouter();
  const { merchant, session, loadProfile } = useAuth();
  const setMode = useMode((s) => s.setMode);
  const booking = useBooking();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: '', description: '', category: 'Makanan', address: '', lat: 0, lng: 0, image_url: '', prep_minutes: '15', opening_hours: '08:00-22:00',
    owner_phone: '', is_halal: true, halal_cert_no: '', halal_cert_url: '', npwp_no: '', npwp_url: '', license_no: '', license_url: '',
    owner_id_card_url: '', place_photo_url: '', bank_name: 'BCA', bank_account: '', bank_holder: '',
  });
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const r = booking.consumePickerResult();
    if (r && r.target === 'merchant') setF((p) => ({ ...p, address: r.place.address, lat: r.place.lat, lng: r.place.lng }));
  }, [booking.pickerResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (f.name.trim().length < 3) return toast.error('Nama usaha minimal 3 huruf');
    if (!f.lat) return toast.error('Pilih lokasi usaha di peta');
    if (f.npwp_no.replace(/\D/g, '').length < 8) return toast.error('Isi nomor NPWP / NPWPD yang valid');
    if (!f.owner_id_card_url) return toast.error('Unggah foto KTP pemilik');
    if (!f.place_photo_url) return toast.error('Unggah foto tempat usaha');
    if (f.is_halal && f.halal_cert_no && !f.halal_cert_url) return toast.error('Unggah scan sertifikat halal, atau kosongkan nomornya');
    setBusy(true);
    try {
      await rpc('register_merchant', { p: { ...f, prep_minutes: Number(f.prep_minutes) || 15 } });
      await loadProfile();
      toast.success('Pengajuan merchant terkirim, menunggu verifikasi admin');
      router.back();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  if (merchant) {
    return (
      <Screen title="Merchant Saya" back>
        <Entrance index={0}><MerchantStatusCard merchant={merchant} /></Entrance>
        <Entrance index={1} style={{ marginTop: 14, gap: 10 }}>
          <Button title="Sertifikasi & dokumen usaha" variant="secondary" icon="document-text-outline" color={colors.food} onPress={() => router.push('/merchant/documents' as never)} />
          {merchant.status === 'approved' && <Button title="Buka Mode Merchant" color={colors.food} icon="storefront-outline" onPress={async () => { await setMode('merchant'); router.replace('/(merchant)'); }} />}
        </Entrance>
      </Screen>
    );
  }

  return (
    <Screen title="Daftar Merchant" back footer={<Button title="Kirim Pengajuan" size="lg" color={colors.food} loading={busy} onPress={submit} />}>
      <View style={{ gap: 16 }}>
        <Entrance index={1}>
          <Card solid style={{ backgroundColor: colors.food, ...shadow.glow(colors.food), overflow: 'hidden' }}><BrandGradient colors={[colors.food, '#EA580C']} style={StyleSheet.absoluteFill} />
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Jualan lebih laris dengan AntarFood</Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>Komisi 15% per pesanan, pencairan ke saldo AntarPay otomatis. Tanpa biaya pendaftaran. Pengajuan ditinjau admin maks. 1×24 jam kerja.</Text>
          </Card>
        </Entrance>
        <Entrance index={2}>
          <Card style={{ gap: 12 }}>
            <Text style={font.label}>1 · Profil usaha</Text>
            <Input label="Nama usaha" placeholder="Sate Padang Mak Syukur" value={f.name} onChangeText={set('name')} />
            <Input label="Deskripsi singkat" placeholder="Menu andalan, ciri khas" value={f.description} onChangeText={set('description')} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Kategori</Text>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>{CATS.map((c) => <Chip key={c} label={c} active={f.category === c} onPress={() => set('category')(c)} color={colors.food} />)}</Row>
            <Row gap={10}>
              <Input label="Waktu siap (menit)" keyboardType="number-pad" value={f.prep_minutes} onChangeText={set('prep_minutes')} containerStyle={{ flex: 1 }} />
              <Input label="Jam buka" value={f.opening_hours} onChangeText={set('opening_hours')} containerStyle={{ flex: 1 }} />
            </Row>
            <Input label="No. HP pemilik (untuk verifikasi admin)" keyboardType="phone-pad" placeholder="08xxxxxxxxxx" value={f.owner_phone} onChangeText={set('owner_phone')} />
          </Card>
        </Entrance>
        <Entrance index={3}>
          <Card style={{ gap: 12 }}>
            <Text style={font.label}>2 · Lokasi & foto</Text>
            <Pressable onPress={() => router.push({ pathname: '/place-picker', params: { target: 'merchant', title: 'Lokasi usaha' } } as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, padding: 12, borderRadius: radius.md }}>
              <Ionicons name="location-outline" size={20} color={colors.food} />
              <Text style={[font.body, { flex: 1 }, !f.address && { color: colors.textMuted }]} numberOfLines={2}>{f.address || 'Pilih lokasi usaha di peta'}</Text>
            </Pressable>
            <Pressable onPress={async () => { if (!session) return; try { const r = await pickAndUpload('merchant-images', session.user.id); if (r) set('image_url')(r.url); } catch (e) { toast.error((e as Error).message); } }}
              style={{ alignItems: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: f.image_url ? colors.success : colors.border, borderRadius: radius.md, padding: 16 }}>
              <Ionicons name={f.image_url ? 'checkmark-circle' : 'image-outline'} size={26} color={f.image_url ? colors.success : colors.textMuted} />
              <Text style={{ fontWeight: '600', color: f.image_url ? colors.success : colors.textSecondary }}>{f.image_url ? 'Foto sampul terunggah' : 'Unggah foto sampul (tampil ke pelanggan)'}</Text>
            </Pressable>
            <DocUpload label="Foto tempat usaha" hint="Tampak depan lapak/toko (bukti lokasi nyata)" required value={f.place_photo_url} onChange={set('place_photo_url')} color={colors.food} />
          </Card>
        </Entrance>
        <Entrance index={4}>
          <Card style={{ gap: 12 }}>
            <Text style={font.label}>3 · Sertifikasi & legalitas usaha</Text>
            <Text style={font.tiny}>Minimal: NPWP/NPWPD dan KTP pemilik. Izin usaha (NIB) dan sertifikat halal opsional — merchant bersertifikat halal mendapat label “Halal ✓” di aplikasi pelanggan.</Text>
            <Input label="NPWP / NPWPD" placeholder="00.000.000.0-000.000" value={f.npwp_no} onChangeText={set('npwp_no')} />
            <DocUpload label="Scan NPWP / NPWPD" hint="Foto atau PDF (opsional, mempercepat verifikasi)" value={f.npwp_url} onChange={set('npwp_url')} color={colors.food} />
            <DocUpload label="KTP pemilik" hint="Foto KTP jelas & terbaca" required value={f.owner_id_card_url} onChange={set('owner_id_card_url')} color={colors.food} />
            <Input label="Izin usaha / NIB (opsional)" placeholder="Nomor NIB / SIUP / IUMK" value={f.license_no} onChangeText={set('license_no')} />
            <DocUpload label="Scan izin usaha (opsional)" value={f.license_url} onChange={set('license_url')} color={colors.food} />
          </Card>
        </Entrance>
        <Entrance index={5}>
          <Card style={{ gap: 12 }}>
            <Text style={font.label}>4 · Status halal</Text>
            <Row gap={8}>
              <Chip label="🕌 Halal" active={f.is_halal} onPress={() => set('is_halal')(true)} color={colors.success} />
              <Chip label="Non-halal" active={!f.is_halal} onPress={() => set('is_halal')(false)} color={colors.textSecondary} />
            </Row>
            {f.is_halal ? (
              <>
                <Text style={font.tiny}>Klaim halal tampil sebagai “Halal” ke pelanggan. Lampirkan sertifikat halal (BPJPH/MUI) agar admin bisa memberi tanda “Halal terverifikasi ✓”.</Text>
                <Input label="No. sertifikat halal (opsional)" placeholder="ID00110000123456789" value={f.halal_cert_no} onChangeText={set('halal_cert_no')} />
                <DocUpload label="Scan sertifikat halal (opsional)" value={f.halal_cert_url} onChange={set('halal_cert_url')} color={colors.success} />
              </>
            ) : <Text style={font.tiny}>Merchant non-halal tetap bisa berjualan; pelanggan dapat memfilter “Halal” / “Non-halal” di AntarFood.</Text>}
          </Card>
        </Entrance>
        <Entrance index={6}>
          <Card style={{ gap: 12 }}>
            <Text style={font.label}>5 · Rekening pencairan (opsional)</Text>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>{BANKS.map((b) => <Chip key={b} label={b} active={f.bank_name === b} onPress={() => set('bank_name')(b)} color={colors.food} />)}</Row>
            <Row gap={10}>
              <Input label="No. rekening" keyboardType="number-pad" value={f.bank_account} onChangeText={set('bank_account')} containerStyle={{ flex: 1 }} />
              <Input label="Atas nama" value={f.bank_holder} onChangeText={set('bank_holder')} containerStyle={{ flex: 1 }} />
            </Row>
            <Badge text="Data dokumen tersimpan privat, hanya dilihat admin verifikator (UU PDP)" color={colors.info} />
          </Card>
        </Entrance>
      </View>
    </Screen>
  );
}
