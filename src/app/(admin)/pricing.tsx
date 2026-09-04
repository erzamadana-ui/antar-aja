import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Switch } from 'react-native';
import { AdminPage } from '@/components/admin';
import { Card, Row, Input, Button, Badge, toast } from '@/components/ui';
import { PromoCard } from '@/components/PromoCard';
import { pickAndUpload } from '@/lib/upload';
import { useAuth } from '@/store/auth';
import { ScrollView } from 'react-native';
import { Entrance } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { colors, font } from '@/lib/theme';
import { serviceLabel } from '@/lib/format';
import type { Pricing, Promo, ServiceType } from '@/lib/types';

const numFields: (keyof Pricing)[] = ['base_fare', 'per_km', 'min_fare', 'platform_fee', 'commission_pct', 'merchant_commission_pct', 'surge_multiplier'];
const labels: Record<string, string> = { base_fare: 'Tarif dasar', per_km: 'Per km', min_fare: 'Tarif minimal', platform_fee: 'Biaya layanan', commission_pct: 'Komisi driver %', merchant_commission_pct: 'Komisi merchant %', surge_multiplier: 'Pengali surge' };
const emptyPromo = { code: '', title: '', description: '', discount_type: 'fixed', value: '', max_discount: '', min_total: '0', service: '', quota: '', image_url: '' };

export default function AdminPricing() {
  const [pricing, setPricing] = useState<Record<string, Record<string, string>>>({});
  const [promos, setPromos] = useState<Promo[]>([]);
  const [np, setNp] = useState({ ...emptyPromo });
  const session = useAuth((s) => s.session);
  const load = useCallback(async () => {
    const [{ data: p }, { data: pr }] = await Promise.all([supabase.from('pricing').select('*'), supabase.from('promos').select('*').order('code')]);
    const map: Record<string, Record<string, string>> = {};
    ((p as Pricing[]) ?? []).forEach((row) => { map[row.service] = Object.fromEntries(numFields.map((k) => [k, String(row[k])])); });
    setPricing(map); setPromos((pr as Promo[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const savePricing = async (service: string) => {
    const v = pricing[service];
    const payload = Object.fromEntries(numFields.map((k) => [k, Number(v[k])]));
    const { error } = await supabase.from('pricing').update({ ...payload, updated_at: new Date().toISOString() }).eq('service', service);
    if (error) return toast.error(error.message);
    toast.success(`Tarif ${serviceLabel[service as ServiceType]} disimpan`);
  };
  const savePromo = async () => {
    if (!np.code || !np.value) return toast.error('Kode dan nilai wajib diisi');
    const { error } = await supabase.from('promos').upsert({ code: np.code.toUpperCase(), title: np.title || null, image_url: np.image_url || null, description: np.description || null, discount_type: np.discount_type, value: Number(np.value), max_discount: np.max_discount ? Number(np.max_discount) : null, min_total: Number(np.min_total) || 0, service: np.service || null, quota: np.quota ? Number(np.quota) : null, is_active: true });
    if (error) return toast.error(error.message);
    setNp({ ...emptyPromo }); toast.success('Promo disimpan'); load();
  };
  const togglePromo = async (p: Promo) => { await supabase.from('promos').update({ is_active: !p.is_active }).eq('code', p.code); load(); };

  return (
    <AdminPage title="Tarif & Promo" subtitle="Perubahan langsung berlaku untuk pesanan baru" onRefresh={load}>
      <Row gap={16} style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {Object.entries(pricing).map(([service, v]) => (
          <Card key={service} style={{ flex: 1, minWidth: 260, gap: 8 }}>
            <Text style={font.h3}>{serviceLabel[service as ServiceType]}</Text>
            {numFields.map((k) => (
              <Row key={k} between gap={10}>
                <Text style={[font.small, { flex: 1 }]}>{labels[k]}</Text>
                <Input value={v[k]} keyboardType="decimal-pad" onChangeText={(t) => setPricing((p) => ({ ...p, [service]: { ...p[service], [k]: t } }))} containerStyle={{ width: 110 }} style={{ textAlign: 'right' }} />
              </Row>
            ))}
            <Button title="Simpan" size="sm" onPress={() => savePricing(service)} />
          </Card>
        ))}
      </Row>
      <Entrance index={0}>
        <Card style={{ gap: 10 }}>
          <Text style={font.label}>Promo · thumbnail di beranda pelanggan</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            {promos.filter((p) => p.is_active).map((p, i) => <PromoCard key={p.code} promo={p} index={i} width={220} onPress={() => setNp({ code: p.code, title: p.title ?? '', description: p.description ?? '', discount_type: p.discount_type, value: String(p.value), max_discount: p.max_discount ? String(p.max_discount) : '', min_total: String(p.min_total), service: p.service ?? '', quota: p.quota ? String(p.quota) : '', image_url: p.image_url ?? '' })} />)}
          </ScrollView>
          {promos.map((p) => (
            <Row key={p.code} between style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Row gap={8}><Text style={{ fontWeight: '800' }}>{p.code}</Text><Badge text={p.discount_type === 'percent' ? `${p.value}%${p.max_discount ? ` maks ${p.max_discount}` : ''}` : `Rp${p.value}`} />{p.service && <Badge text={serviceLabel[p.service]} color={colors.info} />}</Row>
                <Text style={font.tiny}>{p.description} · min Rp{p.min_total} · dipakai {p.used_count}{p.quota ? `/${p.quota}` : ''}</Text>
              </View>
              <Switch value={p.is_active} onValueChange={() => togglePromo(p)} trackColor={{ true: colors.success, false: colors.border }} thumbColor="#fff" />
            </Row>
          ))}
          <Text style={[font.h3, { marginTop: 8 }]}>Tambah / ubah promo</Text>
          <Row gap={10} style={{ flexWrap: 'wrap' }}>
            <Input placeholder="KODE" value={np.code} onChangeText={(v) => setNp({ ...np, code: v.toUpperCase() })} containerStyle={{ minWidth: 140, flex: 1 }} autoCapitalize="characters" />
            <Input placeholder="Judul di kartu (mis. Diskon 50% Pengguna Baru)" value={np.title} onChangeText={(v) => setNp({ ...np, title: v })} containerStyle={{ minWidth: 220, flex: 2 }} />
          </Row>
          <Row gap={10} style={{ flexWrap: 'wrap' }}>
            <Input placeholder="Deskripsi syarat" value={np.description} onChangeText={(v) => setNp({ ...np, description: v })} containerStyle={{ minWidth: 220, flex: 2 }} />
            <Button size="sm" variant="outline" icon="image-outline" title={np.image_url ? 'Ganti gambar' : 'Unggah gambar (16:9)'} onPress={async () => { if (!session) return; try { const r = await pickAndUpload('promo-images', session.user.id); if (r) setNp({ ...np, image_url: r.url }); } catch (e) { toast.error((e as Error).message); } }} />
            {np.image_url ? <Button size="sm" variant="ghost" color={colors.danger} title="Hapus gambar" onPress={() => setNp({ ...np, image_url: '' })} /> : null}
          </Row>
          <Row gap={10} style={{ flexWrap: 'wrap' }}>
            <Row gap={6}><Button size="sm" title="Nominal" variant={np.discount_type === 'fixed' ? 'primary' : 'outline'} onPress={() => setNp({ ...np, discount_type: 'fixed' })} /><Button size="sm" title="Persen" variant={np.discount_type === 'percent' ? 'primary' : 'outline'} onPress={() => setNp({ ...np, discount_type: 'percent' })} /></Row>
            <Input placeholder={np.discount_type === 'percent' ? 'Nilai %' : 'Nilai Rp'} keyboardType="number-pad" value={np.value} onChangeText={(v) => setNp({ ...np, value: v })} containerStyle={{ width: 110 }} />
            <Input placeholder="Maks diskon" keyboardType="number-pad" value={np.max_discount} onChangeText={(v) => setNp({ ...np, max_discount: v })} containerStyle={{ width: 120 }} />
            <Input placeholder="Min transaksi" keyboardType="number-pad" value={np.min_total} onChangeText={(v) => setNp({ ...np, min_total: v })} containerStyle={{ width: 120 }} />
            <Input placeholder="Kuota" keyboardType="number-pad" value={np.quota} onChangeText={(v) => setNp({ ...np, quota: v })} containerStyle={{ width: 90 }} />
          </Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {[['', 'Semua layanan'], ['ride_motor', 'AntarRide'], ['ride_car', 'AntarCar'], ['food', 'AntarFood'], ['send', 'AntarSend'], ['shop', 'AntarShop']].map(([k, l]) => <Button key={k} size="sm" title={l} variant={np.service === k ? 'primary' : 'outline'} onPress={() => setNp({ ...np, service: k })} />)}
          </Row>
          <Button title="Simpan promo" onPress={savePromo} />
        </Card>
      </Entrance>
    </AdminPage>
  );
}
