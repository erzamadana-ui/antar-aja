import React, { useState } from 'react';
import { View, Text, Switch, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Entrance } from '@/components/motion';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { Screen, Card, Row, Input, Button, Badge, Stars, ListItem, Divider, toast } from '@/components/ui';
import { WalletView } from '@/components/WalletView';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { supabase } from '@/lib/supabase';
import { pickAndUpload } from '@/lib/upload';
import { colors, font, radius } from '@/lib/theme';

export default function MerchantStore() {
  const router = useRouter();
  const { merchant, session, loadProfile, signOut } = useAuth();
  const setMode = useMode((s) => s.setMode);
  const [f, setF] = useState({ name: merchant?.name ?? '', description: merchant?.description ?? '', prep_minutes: String(merchant?.prep_minutes ?? 15), opening_hours: merchant?.opening_hours ?? '' });
  const [tab, setTab] = useState<'profile' | 'wallet'>('profile');

  const save = async (patch?: Record<string, unknown>) => {
    if (!merchant) return;
    const { error } = await supabase.from('merchants').update(patch ?? { ...f, prep_minutes: Number(f.prep_minutes) || 15 }).eq('id', merchant.id);
    if (error) return toast.error(error.message);
    await loadProfile(); if (!patch) toast.success('Profil toko disimpan');
  };

  if (!merchant) return null;
  return (
    <Screen title="Toko Saya" scroll={tab === 'profile'} padded={tab === 'profile'} ambient="amber" bottomSpace={TAB_BAR_SPACE + 16}
      right={<Row gap={6} style={{ marginRight: 8 }}><Button title="Profil" size="sm" variant={tab === 'profile' ? 'primary' : 'ghost'} color={colors.food} onPress={() => setTab('profile')} /><Button title="Saldo" size="sm" variant={tab === 'wallet' ? 'primary' : 'ghost'} color={colors.food} onPress={() => setTab('wallet')} /></Row>}>
      {tab === 'wallet' ? <WalletView allowWithdraw bottomSpace={TAB_BAR_SPACE + 16} /> : (
        <View style={{ gap: 16 }}>
          <Entrance index={0}><Card padded={false}>
            <Image source={{ uri: merchant.image_url ?? undefined }} style={s.cover} />
            <View style={{ padding: 16, gap: 8 }}>
              <Row between>
                <View style={{ flex: 1 }}><Text style={font.h2}>{merchant.name}</Text><Row gap={6}><Stars value={merchant.rating_avg} size={12} /><Text style={font.tiny}>{Number(merchant.rating_avg).toFixed(1)} ({merchant.rating_count})</Text></Row></View>
                <Badge text={merchant.status === 'approved' ? 'Terverifikasi' : merchant.status} color={merchant.status === 'approved' ? colors.success : colors.warning} />
              </Row>
              <Row between style={{ backgroundColor: merchant.is_open ? colors.success + '14' : 'rgba(11,31,42,0.05)', padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: merchant.is_open ? colors.success + '33' : 'rgba(11,31,42,0.06)' }}>
                <View><Text style={font.h3}>{merchant.is_open ? 'Toko BUKA' : 'Toko TUTUP'}</Text><Text style={font.tiny}>Matikan saat libur/stok habis</Text></View>
                <Switch value={merchant.is_open} onValueChange={(v) => save({ is_open: v })} trackColor={{ true: colors.success, false: colors.border }} thumbColor="#fff" />
              </Row>
              <Button title="Ganti foto sampul" variant="secondary" icon="image-outline" size="sm" onPress={async () => { if (!session) return; try { const r = await pickAndUpload('merchant-images', session.user.id); if (r) save({ image_url: r.url }); } catch (e) { toast.error((e as Error).message); } }} />
            </View>
          </Card></Entrance>
          <Entrance index={1}><Card style={{ gap: 12 }}>
            <Text style={font.label}>Profil toko</Text>
            <Input label="Nama" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
            <Input label="Deskripsi" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} />
            <Row gap={10}>
              <Input label="Waktu siap (mnt)" keyboardType="number-pad" value={f.prep_minutes} onChangeText={(v) => setF({ ...f, prep_minutes: v })} containerStyle={{ flex: 1 }} />
              <Input label="Jam buka" value={f.opening_hours} onChangeText={(v) => setF({ ...f, opening_hours: v })} containerStyle={{ flex: 1 }} />
            </Row>
            <Text style={font.tiny}>Alamat: {merchant.address}</Text>
            <Button title="Simpan" color={colors.food} onPress={() => save()} />
          </Card></Entrance>
          <Entrance index={2}><Card padded={false}>
            <View style={{ paddingHorizontal: 12 }}>
              <ListItem icon="person-outline" title="Edit profil pemilik" onPress={() => router.push('/account/edit')} />
              <Divider style={{ marginVertical: 0 }} />
              <ListItem icon="swap-horizontal-outline" title="Beralih ke Mode Pelanggan" onPress={async () => { await setMode('customer'); router.replace('/(customer)'); }} />
              <Divider style={{ marginVertical: 0 }} />
              <ListItem icon="log-out-outline" title="Keluar" danger onPress={async () => { await signOut(); router.replace('/(auth)/welcome'); }} />
            </View>
          </Card></Entrance>
        </View>
      )}
    </Screen>
  );
}
const s = StyleSheet.create({ cover: { width: '100%', height: 140, backgroundColor: 'rgba(11,31,42,0.06)', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg } });
