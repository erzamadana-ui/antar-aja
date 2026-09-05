import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Input, Button, Row, Chip, Badge, toast } from '@/components/ui';
import { Entrance, PressableScale } from '@/components/motion';
import { ServiceIllustration, type ArtKind } from '@/components/ServiceArt';
import { DocUpload } from '@/components/DocUpload';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import type { DriverDocuments, VehicleType } from '@/lib/types';

const VEHICLES: { key: VehicleType; label: string; sub: string; art: ArtKind; color: string }[] = [
  { key: 'motor', label: 'Motor', sub: 'AntarRide, Food, Send, Shop', art: 'rider', color: colors.ride },
  { key: 'car', label: 'Mobil', sub: 'AntarCar & belanja besar', art: 'car', color: colors.car },
  { key: 'pickup', label: 'Pick Up', sub: 'AntarBox barang besar', art: 'box', color: colors.box },
  { key: 'box', label: 'Mobil Box', sub: 'AntarBox pindahan', art: 'box', color: colors.box },
];

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
  const isCargo = f.vehicle_type === 'pickup' || f.vehicle_type === 'box';
  const current = VEHICLES.find((v) => v.key === f.vehicle_type) ?? VEHICLES[0];

  return (
    <Screen title="Daftar Mitra Driver" back footer={
      driver?.status === 'approved'
        ? <Button title="Buka Mode Driver" size="lg" icon="bicycle-outline" onPress={async () => { await setMode('driver'); router.replace('/(driver)'); }} />
        : <Button title={driver ? 'Kirim Ulang Data' : 'Kirim Pendaftaran'} size="lg" icon="paper-plane-outline" onPress={submit} />
    }>
      <View style={{ gap: 16 }}>
        {/* Ilustrasi dalam lingkaran tint + judul besar */}
        <Entrance index={0} from="zoom">
          <View style={{ alignItems: 'center', marginTop: 4 }}>
            <View style={s.artCircle}><ServiceIllustration kind={current.art} size={80} /></View>
            <Text style={[font.h1, { textAlign: 'center', marginTop: 14 }]}>Penghasilan fleksibel,{'\n'}jam kerja bebas</Text>
            <Text style={[font.small, { textAlign: 'center', marginTop: 6 }]}>Terima 80% tarif perjalanan + tip. Potongan platform 20%. Bonus untuk mitra rajin.</Text>
            {statusInfo && <Badge text={statusInfo[0]} color={statusInfo[1]} style={{ marginTop: 10 }} />}
            {driver?.status_reason && (driver.status === 'suspended' || driver.status === 'rejected') && <Text style={[font.small, { color: colors.danger, textAlign: 'center', marginTop: 6 }]}>Alasan admin: {driver.status_reason}</Text>}
          </View>
        </Entrance>
        {!driver && (
          <Entrance index={1}>
            <PressableScale onPress={() => router.push('/account/become-travel' as never)} scaleTo={0.985} haptic={false} style={s.travelHint}>
              <View style={s.hintIcon}><Ionicons name="bus-outline" size={20} color={colors.primary} /></View>
              <Text style={[font.small, { flex: 1, color: colors.text, fontWeight: '600' }]}>Punya Innova / Hi-Ace? Daftar jadi Mitra AntarTravel (antar kota)</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </PressableScale>
          </Entrance>
        )}

        {/* Kartu pilihan kendaraan (radio bulat) */}
        <Entrance index={2}>
          <Text style={[font.label, { marginBottom: 8 }]}>Jenis kendaraan</Text>
          <View style={s.grid}>
            {VEHICLES.map((v) => {
              const active = f.vehicle_type === v.key;
              return (
                <PressableScale key={v.key} onPress={() => setF({ ...f, vehicle_type: v.key })} scaleTo={0.97} haptic={false} style={[s.option, active && s.optionActive]}>
                  <Row between>
                    <View style={[s.optionArt, { backgroundColor: v.color + '14' }]}><ServiceIllustration kind={v.art} size={34} /></View>
                    <View style={[s.radio, active && { borderColor: colors.primary }]}>{active && <View style={s.radioDot} />}</View>
                  </Row>
                  <Text style={[font.body, { fontWeight: '700', marginTop: 10 }]}>{v.label}</Text>
                  <Text style={font.tiny} numberOfLines={1}>{v.sub}</Text>
                </PressableScale>
              );
            })}
          </View>
          {isCargo && <Text style={[font.tiny, { marginTop: 8 }]}>AntarBox: kirim barang besar, jemput dari rumah, pindahan rumah/kost. Tarif per km lebih tinggi + bonus pembantu angkat.</Text>}
        </Entrance>

        <Entrance index={3}>
          <Card style={{ gap: 12 }}>
            <Text style={font.label}>Data kendaraan</Text>
            <Input label="Merek & tipe" placeholder="Honda Vario 160 / Toyota Avanza" value={f.vehicle_brand} onChangeText={set('vehicle_brand')} />
            <Row gap={10}>
              <Input label="Plat nomor" placeholder="BA 1234 AB" value={f.vehicle_plate} onChangeText={(v) => set('vehicle_plate')(v.toUpperCase())} containerStyle={{ flex: 1 }} autoCapitalize="characters" />
              <Input label="Warna" placeholder="Hitam" value={f.vehicle_color} onChangeText={set('vehicle_color')} containerStyle={{ flex: 1 }} />
            </Row>
            <Row gap={10}>
              <Input label="Tahun kendaraan" placeholder="2021" keyboardType="number-pad" value={f.vehicle_year} onChangeText={(v) => set('vehicle_year')(v.replace(/\D/g, '').slice(0, 4))} containerStyle={{ flex: 1 }} />
              {isCargo && <Input label="Kapasitas (kg / m³)" placeholder="1000 kg" value={f.vehicle_capacity} onChangeText={set('vehicle_capacity')} containerStyle={{ flex: 1 }} />}
            </Row>
            <Text style={s.fieldLabel}>Kondisi kendaraan</Text>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {([['standar', 'Standar'], ['baik', 'Baik'], ['sangat_baik', 'Sangat baik']] as const).map(([k, l]) => <Chip key={k} label={l} active={f.vehicle_condition === k} onPress={() => set('vehicle_condition')(k)} />)}
            </Row>
            <Text style={s.fieldLabel}>Jenis mesin</Text>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <Chip label="Bensin / diesel" active={!f.is_electric} onPress={() => set('is_electric')(false)} />
              <Chip label="Listrik (EV)" active={!!f.is_electric} onPress={() => set('is_electric')(true)} />
            </Row>
            <Row gap={10} style={s.classBox}>
              <View style={s.hintIcon}><Ionicons name="pricetag-outline" size={18} color={colors.primary} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 13 }}>Kelas & tarif Anda: {predictedClass}</Text>
                <Text style={font.tiny}>Kelas ditentukan dari jenis, tahun, kondisi, dan mesin listrik; diverifikasi admin dari foto & STNK. Kelas lebih tinggi = tarif per km lebih tinggi. Driver kelas Premium juga bisa menerima order Standar/Hemat.</Text>
              </View>
            </Row>
          </Card>
        </Entrance>
        <Entrance index={4}>
          <Card style={{ gap: 12 }}>
            <Text style={font.label}>Dokumen</Text>
            <Input label="Nomor SIM" placeholder={f.vehicle_type === 'motor' ? 'SIM C' : f.vehicle_type === 'box' ? 'SIM B1' : 'SIM A'} value={f.license_number} onChangeText={set('license_number')} />
            <Input label="NIK (KTP)" keyboardType="number-pad" value={f.id_card_number} onChangeText={set('id_card_number')} />
            <DocUpload label="Foto KTP" hint="Foto KTP jelas & terbaca" required value={f.photo_id_url} onChange={set('photo_id_url')} />
            <DocUpload label="Foto kendaraan + STNK" hint="Kendaraan tampak samping beserta STNK" required value={f.photo_vehicle_url} onChange={set('photo_vehicle_url')} />
            <Text style={font.tiny}>Data pribadi disimpan terenkripsi dan hanya dapat dilihat admin verifikasi.</Text>
          </Card>
        </Entrance>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  artCircle: { width: 124, height: 124, borderRadius: 62, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primaryLight },
  travelHint: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: colors.border, ...shadow.soft },
  hintIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { width: '48%', flexGrow: 1, padding: 12, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border, ...shadow.soft },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.tint },
  optionArt: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  classBox: { backgroundColor: colors.tint, borderRadius: 14, padding: 12, alignItems: 'flex-start' },
});
