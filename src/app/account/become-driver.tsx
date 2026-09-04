import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Input, Button, Row, Chip, Badge, toast } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { rpc, supabase } from '@/lib/supabase';
import { pickAndUpload } from '@/lib/upload';
import { colors, font, radius, shadow } from '@/lib/theme';
import type { DriverDocuments, VehicleType } from '@/lib/types';

export default function BecomeDriver() {
  const router = useRouter();
  const { driver, session, loadProfile } = useAuth();
  const setMode = useMode((s) => s.setMode);
  const [f, setF] = useState({
    vehicle_type: (driver?.vehicle_type ?? 'motor') as VehicleType, vehicle_brand: driver?.vehicle_brand ?? '', vehicle_plate: driver?.vehicle_plate ?? '',
    vehicle_color: driver?.vehicle_color ?? '', license_number: '', id_card_number: '', photo_id_url: '', photo_vehicle_url: '',
    vehicle_year: driver?.vehicle_year ? String(driver.vehicle_year) : '', vehicle_condition: (driver?.vehicle_condition ?? 'baik') as 'standar' | 'baik' | 'sangat_baik', is_electric: driver?.is_electric ?? false, vehicle_capacity: driver?.vehicle_capacity ?? '',
  });
  useEffect(() => {
    if (!driver) return;
    supabase.from('driver_documents').select('*').eq('driver_id', driver.id).maybeSingle().then(({ data }) => {
      const d = data as DriverDocuments | null;
      if (d) setF((p) => ({ ...p, license_number: d.license_number ?? '', id_card_number: d.id_card_number ?? '', photo_id_url: d.photo_id_url ?? '', photo_vehicle_url: d.photo_vehicle_url ?? '' }));
    });
  }, [driver]);
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const yr = Number(f.vehicle_year) || 0;
  const predictedClass = f.vehicle_type === 'pickup' ? 'Pick Up' : f.vehicle_type === 'box' ? 'Mobil Box' : f.vehicle_type === 'motor' ? (f.is_electric ? 'Ride Listrik' : yr >= 2019 && f.vehicle_condition !== 'standar' ? 'Ride Standar' : 'Ride Hemat (tarif -10%)') : f.is_electric ? (yr >= 2022 && f.vehicle_condition === 'sangat_baik' ? 'Car Listrik Premium (+45%)' : 'Car Listrik (+10%)') : yr >= 2022 && f.vehicle_condition === 'sangat_baik' ? 'Car Premium (+35%)' : yr >= 2016 && f.vehicle_condition !== 'standar' ? 'Car Standar' : 'Car Hemat (tarif -10%)';
  const upload = async (k: 'photo_id_url' | 'photo_vehicle_url') => {
    if (!session) return;
    try { const r = await pickAndUpload('documents', session.user.id); if (r) { set(k)(r.path); toast.success('Foto terunggah'); } } catch (e) { toast.error((e as Error).message); }
  };
  const submit = async () => {
    if (!/^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3}$/i.test(f.vehicle_plate.trim())) return toast.error('Format plat nomor tidak valid (contoh: BA 1234 AB)');
    if (!f.license_number || !f.id_card_number) return toast.error('Nomor SIM dan NIK wajib diisi');
    if (!yr || yr < 1990 || yr > new Date().getFullYear() + 1) return toast.error('Isi tahun kendaraan yang valid');
    try {
      await rpc('register_driver', { p: { ...f, vehicle_year: yr } });
      await loadProfile();
      toast.success('Pendaftaran terkirim, menunggu verifikasi admin');
      router.back();
    } catch (e) { toast.error((e as Error).message); }
  };

  const statusInfo = driver ? { pending: ['Menunggu verifikasi', colors.warning], approved: ['Akun mitra aktif', colors.success], suspended: ['Akun ditangguhkan', colors.danger], rejected: ['Ditolak — perbaiki data lalu kirim ulang', colors.danger] }[driver.status] : null;

  return (
    <Screen title="Daftar Mitra Driver" back footer={
      driver?.status === 'approved'
        ? <Button title="Buka Mode Driver" size="lg" color={colors.ride} onPress={async () => { await setMode('driver'); router.replace('/(driver)'); }} />
        : <Button title={driver ? 'Kirim Ulang Data' : 'Kirim Pendaftaran'} size="lg" color={colors.ride} onPress={submit} />
    }>
      <View style={{ gap: 16 }}>
        {statusInfo && <Badge text={statusInfo[0]} color={statusInfo[1]} />}
        {driver?.status_reason && (driver.status === 'suspended' || driver.status === 'rejected') && <Text style={[font.small, { color: colors.danger }]}>Alasan admin: {driver.status_reason}</Text>}
        {!driver && <Pressable onPress={() => router.push('/account/become-travel' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.travel + '12', borderRadius: radius.md, padding: 12 }}><Ionicons name="bus" size={20} color={colors.travel} /><Text style={[font.small, { flex: 1, color: colors.travel, fontWeight: '700' }]}>Punya Innova / Hi-Ace? Daftar jadi Mitra AntarTravel (antar kota) →</Text></Pressable>}
        <Entrance index={0}>
          <Card solid style={{ backgroundColor: colors.ride, ...shadow.glow(colors.ride), overflow: 'hidden' }}><BrandGradient colors={[colors.ride, '#0F766E']} style={StyleSheet.absoluteFill} />
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Penghasilan fleksibel, jam kerja bebas</Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>Terima 80% tarif perjalanan + tip. Potongan platform 20%. Bonus untuk mitra rajin.</Text>
          </Card>
        </Entrance>
        <Entrance index={1}>
          <Card style={{ gap: 12 }}>
            <Text style={font.label}>Kendaraan</Text>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <Chip label="🏍️ Motor" active={f.vehicle_type === 'motor'} onPress={() => setF({ ...f, vehicle_type: 'motor' })} color={colors.ride} />
              <Chip label="🚗 Mobil" active={f.vehicle_type === 'car'} onPress={() => setF({ ...f, vehicle_type: 'car' })} color={colors.car} />
              <Chip label="🛻 Pick Up" active={f.vehicle_type === 'pickup'} onPress={() => setF({ ...f, vehicle_type: 'pickup' })} color={colors.box} />
              <Chip label="🚚 Mobil Box" active={f.vehicle_type === 'box'} onPress={() => setF({ ...f, vehicle_type: 'box' })} color={colors.box} />
            </Row>
            {(f.vehicle_type === 'pickup' || f.vehicle_type === 'box') && <Text style={font.tiny}>AntarBox: kirim barang besar, jemput dari rumah, pindahan rumah/kost. Tarif per km lebih tinggi + bonus pembantu angkat.</Text>}
            <Input label="Merek & tipe" placeholder="Honda Vario 160 / Toyota Avanza" value={f.vehicle_brand} onChangeText={set('vehicle_brand')} />
            <Row gap={10}>
              <Input label="Plat nomor" placeholder="BA 1234 AB" value={f.vehicle_plate} onChangeText={(v) => set('vehicle_plate')(v.toUpperCase())} containerStyle={{ flex: 1 }} autoCapitalize="characters" />
              <Input label="Warna" placeholder="Hitam" value={f.vehicle_color} onChangeText={set('vehicle_color')} containerStyle={{ flex: 1 }} />
            </Row>
            <Row gap={10}>
              <Input label="Tahun kendaraan" placeholder="2021" keyboardType="number-pad" value={f.vehicle_year} onChangeText={(v) => set('vehicle_year')(v.replace(/\D/g, '').slice(0, 4))} containerStyle={{ flex: 1 }} />
              {(f.vehicle_type === 'pickup' || f.vehicle_type === 'box') && <Input label="Kapasitas (kg / m³)" placeholder="1000 kg" value={f.vehicle_capacity} onChangeText={set('vehicle_capacity')} containerStyle={{ flex: 1 }} />}
            </Row>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Kondisi kendaraan</Text>
            <Row gap={8}>
              {([['standar', 'Standar'], ['baik', 'Baik'], ['sangat_baik', 'Sangat baik']] as const).map(([k, l]) => <Chip key={k} label={l} active={f.vehicle_condition === k} onPress={() => set('vehicle_condition')(k)} color={colors.ride} />)}
            </Row>
            <Row gap={8}>
              <Chip label="⛽ Bensin / diesel" active={!f.is_electric} onPress={() => set('is_electric')(false)} color={colors.textSecondary} />
              <Chip label="⚡ Listrik (EV)" active={!!f.is_electric} onPress={() => set('is_electric')(true)} color={colors.success} />
            </Row>
            <View style={{ backgroundColor: colors.info + '12', borderRadius: radius.md, padding: 10, gap: 2 }}>
              <Text style={{ fontWeight: '800', color: colors.info, fontSize: 13 }}>Kelas & tarif Anda: {predictedClass}</Text>
              <Text style={font.tiny}>Kelas ditentukan dari jenis, tahun, kondisi, dan mesin listrik; diverifikasi admin dari foto & STNK. Kelas lebih tinggi = tarif per km lebih tinggi. Driver kelas Premium juga bisa menerima order Standar/Hemat.</Text>
            </View>
          </Card>
        </Entrance>
        <Entrance index={2}>
          <Card style={{ gap: 12 }}>
            <Text style={font.label}>Dokumen</Text>
            <Input label="Nomor SIM" placeholder={f.vehicle_type === 'motor' ? 'SIM C' : f.vehicle_type === 'box' ? 'SIM B1' : 'SIM A'} value={f.license_number} onChangeText={set('license_number')} />
            <Input label="NIK (KTP)" keyboardType="number-pad" value={f.id_card_number} onChangeText={set('id_card_number')} />
            <Row gap={10}>
              <UploadBox label="Foto KTP" done={!!f.photo_id_url} onPress={() => upload('photo_id_url')} />
              <UploadBox label="Foto kendaraan + STNK" done={!!f.photo_vehicle_url} onPress={() => upload('photo_vehicle_url')} />
            </Row>
            <Text style={font.tiny}>Data pribadi disimpan terenkripsi dan hanya dapat dilihat admin verifikasi.</Text>
          </Card>
        </Entrance>
      </View>
    </Screen>
  );
}

function UploadBox({ label, done, onPress }: { label: string; done: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: done ? colors.success : colors.border, borderRadius: radius.md, padding: 14 }}>
      <Ionicons name={done ? 'checkmark-circle' : 'camera-outline'} size={26} color={done ? colors.success : colors.textMuted} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: done ? colors.success : colors.textSecondary, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}
