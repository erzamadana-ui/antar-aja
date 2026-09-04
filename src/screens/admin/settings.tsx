import React, { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { AdminPage } from '@/components/admin';
import { Card, Input, Button, toast } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { font } from '@/lib/theme';

export default function AdminSettings() {
  const [bank, setBank] = useState({ bank: '', number: '', name: '' });
  const [support, setSupport] = useState('');
  const [radius, setRadius] = useState('5');
  const [ratio, setRatio] = useState('2.5');
  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('*');
    (data as { key: string; value: unknown }[] | null)?.forEach((r) => {
      if (r.key === 'bank_account') setBank(r.value as typeof bank);
      if (r.key === 'support_phone') setSupport(String(r.value));
      if (r.key === 'search_radius_km') setRadius(String(r.value));
      if (r.key === 'max_route_ratio') setRatio(String(r.value));
    });
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    const rows = [
      { key: 'bank_account', value: bank }, { key: 'support_phone', value: support },
      { key: 'search_radius_km', value: Number(radius) || 5 }, { key: 'max_route_ratio', value: Number(ratio) || 2.5 },
    ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('app_settings').upsert(rows);
    if (error) return toast.error(error.message);
    toast.success('Pengaturan disimpan');
  };
  return (
    <AdminPage title="Pengaturan" subtitle="Konfigurasi umum aplikasi">
      <Entrance index={0}>
        <Card style={{ gap: 12, maxWidth: 560 }}>
          <Text style={font.label}>Rekening top up</Text>
          <Input label="Bank" value={bank.bank} onChangeText={(v) => setBank({ ...bank, bank: v })} />
          <Input label="Nomor rekening" value={bank.number} onChangeText={(v) => setBank({ ...bank, number: v })} keyboardType="number-pad" />
          <Input label="Atas nama" value={bank.name} onChangeText={(v) => setBank({ ...bank, name: v })} />
          <Text style={[font.h3, { marginTop: 8 }]}>Operasional</Text>
          <Input label="Nomor WhatsApp CS" value={support} onChangeText={setSupport} keyboardType="phone-pad" />
          <Input label="Radius pencarian driver (km)" value={radius} onChangeText={setRadius} keyboardType="decimal-pad" />
          <Input label="Batas rasio rute vs garis lurus (anti-manipulasi jarak)" value={ratio} onChangeText={setRatio} keyboardType="decimal-pad" />
          <Button title="Simpan pengaturan" onPress={save} />
        </Card>
      </Entrance>
      <Entrance index={1}>
        <Card style={{ maxWidth: 560 }}>
          <Text style={font.label}>Integrasi (opsional)</Text>
          <Text style={font.small}>Google Maps: isi EXPO_PUBLIC_GOOGLE_MAPS_KEY di .env lalu build ulang — pencarian & rute otomatis beralih ke Google.{'\n'}Pembayaran otomatis (Midtrans/Xendit): lihat docs/INTEGRASI.md di repositori.</Text>
        </Card>
      </Entrance>
    </AdminPage>
  );
}
