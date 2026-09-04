// Daftar Mitra AntarTravel — mobil kapasitas besar (Innova, Hi-Ace, dsb.), bensin/diesel atau listrik
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Input, Button, Row, Chip, Badge, toast } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { DocUpload } from '@/components/DocUpload';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { rpc, supabase } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import type { TravelPartner } from '@/lib/types';

const MODELS = [['Toyota Innova Reborn', 6], ['Toyota Hi-Ace Commuter', 14], ['Isuzu Elf Long', 15], ['Hyundai H-1', 8], ['Mitsubishi Xpander', 6], ['BYD M6 (EV)', 6], ['Lainnya', 6]] as const;

export default function BecomeTravel() {
  const router = useRouter();
  const { session, loadProfile } = useAuth();
  const setMode = useMode((s) => s.setMode);
  const [me, setMe] = useState<TravelPartner | null | undefined>(undefined);
  const [f, setF] = useState({ company_name: '', vehicle_model: 'Toyota Innova Reborn', vehicle_plate: '', vehicle_year: '', seats: '6', is_electric: false, photo_url: '', license_url: '', permit_url: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (session) supabase.from('travel_partners').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => { const p = data as TravelPartner | null; setMe(p); if (p) setF({ company_name: p.company_name ?? '', vehicle_model: p.vehicle_model, vehicle_plate: p.vehicle_plate, vehicle_year: p.vehicle_year ? String(p.vehicle_year) : '', seats: String(p.seats), is_electric: p.is_electric, photo_url: p.photo_url ?? '', license_url: p.license_url ?? '', permit_url: p.permit_url ?? '' }); }); }, [session]);
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    if (!/^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3}$/i.test(f.vehicle_plate.trim())) return toast.error('Format plat nomor tidak valid');
    if (Number(f.seats) < 6) return toast.error('Minimal 6 kursi penumpang (Innova/Hi-Ace)');
    if (!f.license_url) return toast.error('Unggah foto SIM A/B1');
    setBusy(true);
    try { await rpc('travel_partner_register', { p: { ...f, seats: Number(f.seats), vehicle_year: Number(f.vehicle_year) || null } }); await loadProfile(); toast.success(me ? 'Data mitra travel diperbarui' : 'Pendaftaran mitra travel terkirim, menunggu verifikasi admin'); router.back(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const st = me ? ({ pending: ['Menunggu verifikasi admin', colors.warning], approved: ['Mitra travel aktif', colors.success], suspended: ['Ditangguhkan', colors.danger], rejected: ['Ditolak', colors.danger] } as Record<string, [string, string]>)[me.status] : null;
  return (
    <Screen title="Mitra AntarTravel" back footer={me?.status === 'approved' ? <Button title="Buka Dasbor Mitra Travel" size="lg" color={colors.travel} onPress={async () => { await setMode('driver'); router.replace('/driver/travel' as never); }} /> : <Button title={me ? 'Kirim ulang data' : 'Daftar Mitra Travel'} size="lg" color={colors.travel} loading={busy} onPress={submit} />}>
      <View style={{ gap: 16 }}>
        {st && <Badge text={st[0]} color={st[1]} />}
        {me?.status_reason && me.status !== 'approved' && <Text style={[font.small, { color: colors.danger }]}>Alasan admin: {me.status_reason}</Text>}
        <Entrance index={0}><Card solid style={{ backgroundColor: colors.travel, ...shadow.glow(colors.travel), overflow: 'hidden' }}><BrandGradient colors={[colors.travel, '#1E3A8A']} style={StyleSheet.absoluteFill} />
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Isi kursi travel Anda lewat aplikasi</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>Buat jadwal keberangkatan antar kota, penumpang dijemput di rumah. Komisi 10% + biaya layanan; pencairan ke AntarPay setelah tiba. Bisa menerima carter private 1 keluarga.</Text>
        </Card></Entrance>
        <Entrance index={1}><Card style={{ gap: 12 }}>
          <Text style={font.label}>Armada (kapasitas besar)</Text>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>{MODELS.map(([m, seats]) => <Chip key={m} label={m} active={f.vehicle_model === m} onPress={() => setF({ ...f, vehicle_model: m, seats: String(seats), is_electric: m.includes('EV') || f.is_electric })} color={colors.travel} />)}</Row>
          {f.vehicle_model === 'Lainnya' && <Input label="Tipe mobil" placeholder="Merek & tipe" value="" onChangeText={(v) => set('vehicle_model')(v || 'Lainnya')} />}
          <Input label="Nama usaha travel (opsional)" placeholder="Minang Jaya Travel" value={f.company_name} onChangeText={set('company_name')} />
          <Row gap={10}>
            <Input label="Plat nomor" placeholder="BA 7777 TV" value={f.vehicle_plate} onChangeText={(v) => set('vehicle_plate')(v.toUpperCase())} containerStyle={{ flex: 1 }} autoCapitalize="characters" />
            <Input label="Tahun" placeholder="2023" keyboardType="number-pad" value={f.vehicle_year} onChangeText={(v) => set('vehicle_year')(v.replace(/\D/g, '').slice(0, 4))} containerStyle={{ width: 100 }} />
            <Input label="Kursi" keyboardType="number-pad" value={f.seats} onChangeText={(v) => set('seats')(v.replace(/\D/g, '').slice(0, 2))} containerStyle={{ width: 80 }} />
          </Row>
          <Row gap={8}>
            <Chip label="⛽ Bensin / diesel" active={!f.is_electric} onPress={() => set('is_electric')(false)} color={colors.textSecondary} />
            <Chip label="⚡ Listrik (EV)" active={f.is_electric} onPress={() => set('is_electric')(true)} color={colors.success} />
          </Row>
          <Text style={font.tiny}>Carter private otomatis memakai harga mobil besar bila kursi ≥ 10 (Hi-Ace/Elf). Mobil listrik ditandai ⚡ di pencarian pelanggan.</Text>
        </Card></Entrance>
        <Entrance index={2}><Card style={{ gap: 12 }}>
          <Text style={font.label}>Dokumen</Text>
          <DocUpload label="Foto mobil (tampak samping)" value={f.photo_url} onChange={set('photo_url')} color={colors.travel} bucket="merchant-images" />
          <DocUpload label="SIM A / B1 pengemudi" required value={f.license_url} onChange={set('license_url')} color={colors.travel} />
          <DocUpload label="Izin angkutan / KIR (opsional)" value={f.permit_url} onChange={set('permit_url')} color={colors.travel} />
        </Card></Entrance>
      </View>
    </Screen>
  );
}
