import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Input, Button, Row, Chip, Badge, toast } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { rpc, supabase } from '@/lib/supabase';
import { pickAndUpload } from '@/lib/upload';
import { colors, font, radius } from '@/lib/theme';
import type { DriverDocuments, VehicleType } from '@/lib/types';

export default function BecomeDriver() {
  const router = useRouter();
  const { driver, session, loadProfile } = useAuth();
  const setMode = useMode((s) => s.setMode);
  const [f, setF] = useState({
    vehicle_type: (driver?.vehicle_type ?? 'motor') as VehicleType, vehicle_brand: driver?.vehicle_brand ?? '', vehicle_plate: driver?.vehicle_plate ?? '',
    vehicle_color: driver?.vehicle_color ?? '', license_number: '', id_card_number: '', photo_id_url: '', photo_vehicle_url: '',
  });
  useEffect(() => {
    if (!driver) return;
    supabase.from('driver_documents').select('*').eq('driver_id', driver.id).maybeSingle().then(({ data }) => {
      const d = data as DriverDocuments | null;
      if (d) setF((p) => ({ ...p, license_number: d.license_number ?? '', id_card_number: d.id_card_number ?? '', photo_id_url: d.photo_id_url ?? '', photo_vehicle_url: d.photo_vehicle_url ?? '' }));
    });
  }, [driver]);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const upload = async (k: 'photo_id_url' | 'photo_vehicle_url') => {
    if (!session) return;
    try { const r = await pickAndUpload('documents', session.user.id); if (r) { set(k)(r.path); toast.success('Foto terunggah'); } } catch (e) { toast.error((e as Error).message); }
  };
  const submit = async () => {
    if (!/^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3}$/i.test(f.vehicle_plate.trim())) return toast.error('Format plat nomor tidak valid (contoh: BA 1234 AB)');
    if (!f.license_number || !f.id_card_number) return toast.error('Nomor SIM dan NIK wajib diisi');
    try {
      await rpc('register_driver', { p: f });
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
        <Card style={{ backgroundColor: colors.ride }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Penghasilan fleksibel, jam kerja bebas</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>Terima 80% tarif perjalanan + tip. Potongan platform 20%. Bonus untuk mitra rajin.</Text>
        </Card>
        <Card style={{ gap: 12 }}>
          <Text style={font.h3}>Kendaraan</Text>
          <Row gap={8}>
            <Chip label="🏍️ Motor" active={f.vehicle_type === 'motor'} onPress={() => setF({ ...f, vehicle_type: 'motor' })} color={colors.ride} />
            <Chip label="🚗 Mobil" active={f.vehicle_type === 'car'} onPress={() => setF({ ...f, vehicle_type: 'car' })} color={colors.car} />
          </Row>
          <Input label="Merek & tipe" placeholder="Honda Vario 160 / Toyota Avanza" value={f.vehicle_brand} onChangeText={set('vehicle_brand')} />
          <Row gap={10}>
            <Input label="Plat nomor" placeholder="BA 1234 AB" value={f.vehicle_plate} onChangeText={(v) => set('vehicle_plate')(v.toUpperCase())} containerStyle={{ flex: 1 }} autoCapitalize="characters" />
            <Input label="Warna" placeholder="Hitam" value={f.vehicle_color} onChangeText={set('vehicle_color')} containerStyle={{ flex: 1 }} />
          </Row>
        </Card>
        <Card style={{ gap: 12 }}>
          <Text style={font.h3}>Dokumen</Text>
          <Input label="Nomor SIM" placeholder={f.vehicle_type === 'car' ? 'SIM A' : 'SIM C'} value={f.license_number} onChangeText={set('license_number')} />
          <Input label="NIK (KTP)" keyboardType="number-pad" value={f.id_card_number} onChangeText={set('id_card_number')} />
          <Row gap={10}>
            <UploadBox label="Foto KTP" done={!!f.photo_id_url} onPress={() => upload('photo_id_url')} />
            <UploadBox label="Foto kendaraan + STNK" done={!!f.photo_vehicle_url} onPress={() => upload('photo_vehicle_url')} />
          </Row>
          <Text style={font.tiny}>Data pribadi disimpan terenkripsi dan hanya dapat dilihat admin verifikasi.</Text>
        </Card>
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
