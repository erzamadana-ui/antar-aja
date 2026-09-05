// Sertifikasi & dokumen usaha merchant — lihat status pengajuan, lengkapi/ubah dokumen, ajukan ulang
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Input, Button, Row, Chip, Badge, toast } from '@/components/ui';
import { Entrance } from '@/components/motion';
import { DocUpload } from '@/components/DocUpload';
import { MerchantStatusCard, useMerchantDocs } from '@/components/MerchantStatus';
import { useAuth } from '@/store/auth';
import { rpc } from '@/lib/supabase';
import { colors, font } from '@/lib/theme';

const BANKS = ['BCA', 'BRI', 'Mandiri', 'BNI', 'BSI', 'Bank Nagari', 'Bank Riau Kepri', 'Lainnya'];

export default function MerchantDocuments() {
  const router = useRouter();
  const { merchant, loadProfile } = useAuth();
  const { docs, reload } = useMerchantDocs(merchant?.id);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ is_halal: merchant?.is_halal ?? false, owner_phone: '', npwp_no: '', npwp_url: '', license_no: '', license_url: '', halal_cert_no: '', halal_cert_url: '', owner_id_card_url: '', place_photo_url: '', bank_name: 'BCA', bank_account: '', bank_holder: '' });
  useEffect(() => { if (docs) setF((p) => ({ ...p, owner_phone: docs.owner_phone ?? '', npwp_no: docs.npwp_no ?? '', npwp_url: docs.npwp_url ?? '', license_no: docs.license_no ?? '', license_url: docs.license_url ?? '', halal_cert_no: docs.halal_cert_no ?? '', halal_cert_url: docs.halal_cert_url ?? '', owner_id_card_url: docs.owner_id_card_url ?? '', place_photo_url: docs.place_photo_url ?? '', bank_name: docs.bank_name ?? 'BCA', bank_account: docs.bank_account ?? '', bank_holder: docs.bank_holder ?? '' })); }, [docs]);
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  if (!merchant) return <Screen title="Dokumen usaha" back><Text style={font.small}>Anda belum terdaftar sebagai merchant.</Text></Screen>;

  const save = async () => {
    if (f.npwp_no.replace(/\D/g, '').length < 8) return toast.error('Isi nomor NPWP / NPWPD yang valid');
    if (!f.owner_id_card_url) return toast.error('Unggah foto KTP pemilik');
    setBusy(true);
    try {
      await rpc('merchant_save_documents', { p: f });
      await Promise.all([reload(), loadProfile()]);
      toast.success(merchant.status === 'rejected' ? 'Pengajuan ulang terkirim, menunggu verifikasi admin' : 'Dokumen tersimpan');
      if (merchant.status === 'rejected') router.back();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Screen title="Sertifikasi & dokumen" back footer={<Button title={merchant.status === 'rejected' ? 'Ajukan ulang' : 'Simpan dokumen'} size="lg" color={colors.food} loading={busy} onPress={save} />}>
      <View style={{ gap: 16 }}>
        <Entrance index={0}><MerchantStatusCard merchant={merchant} /></Entrance>
        <Entrance index={1}><Card style={{ gap: 12 }}>
          <Text style={font.label}>Legalitas usaha</Text>
          <Input label="NPWP / NPWPD (wajib)" placeholder="00.000.000.0-000.000" value={f.npwp_no} onChangeText={set('npwp_no')} />
          <DocUpload label="Scan NPWP / NPWPD" value={f.npwp_url} onChange={set('npwp_url')} color={colors.food} />
          <DocUpload label="KTP pemilik" required value={f.owner_id_card_url} onChange={set('owner_id_card_url')} color={colors.food} />
          <DocUpload label="Foto tempat usaha" required value={f.place_photo_url} onChange={set('place_photo_url')} color={colors.food} />
          <Input label="Izin usaha / NIB (opsional)" placeholder="Nomor NIB / SIUP / IUMK" value={f.license_no} onChangeText={set('license_no')} />
          <DocUpload label="Scan izin usaha (opsional)" value={f.license_url} onChange={set('license_url')} color={colors.food} />
          <Input label="No. HP pemilik" keyboardType="phone-pad" value={f.owner_phone} onChangeText={set('owner_phone')} />
        </Card></Entrance>
        <Entrance index={2}><Card style={{ gap: 12 }}>
          <Row between><Text style={font.label}>Status halal</Text>{!!merchant.halal_verified && <Badge text="Terverifikasi admin ✓" color={colors.success} />}</Row>
          <Row gap={8}>
            <Chip label="🕌 Halal" active={f.is_halal} onPress={() => set('is_halal')(true)} color={colors.success} />
            <Chip label="Non-halal" active={!f.is_halal} onPress={() => set('is_halal')(false)} color={colors.textSecondary} />
          </Row>
          {f.is_halal && (
            <>
              <Input label="No. sertifikat halal (opsional)" placeholder="ID00110000123456789" value={f.halal_cert_no} onChangeText={set('halal_cert_no')} />
              <DocUpload label="Scan sertifikat halal" value={f.halal_cert_url} onChange={set('halal_cert_url')} color={colors.success} />
            </>
          )}
          <Text style={font.tiny}>Mengubah status halal akan mencabut tanda “terverifikasi” sampai admin memeriksa ulang.</Text>
        </Card></Entrance>
        <Entrance index={3}><Card style={{ gap: 12 }}>
          <Text style={font.label}>Rekening pencairan</Text>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>{BANKS.map((b) => <Chip key={b} label={b} active={f.bank_name === b} onPress={() => set('bank_name')(b)} color={colors.food} />)}</Row>
          <Row gap={10}>
            <Input label="No. rekening" keyboardType="number-pad" value={f.bank_account} onChangeText={set('bank_account')} containerStyle={{ flex: 1 }} />
            <Input label="Atas nama" value={f.bank_holder} onChangeText={set('bank_holder')} containerStyle={{ flex: 1 }} />
          </Row>
        </Card></Entrance>
      </View>
    </Screen>
  );
}
