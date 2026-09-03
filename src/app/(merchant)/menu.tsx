import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Switch, ScrollView, Modal, StyleSheet, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Entrance, PressableScale } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { Screen, Card, Row, Input, Button, Empty, toast } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { pickAndUpload } from '@/lib/upload';
import { colors, font, radius, glass, shadow, motion } from '@/lib/theme';
import { rupiah } from '@/lib/format';
import type { MenuItem } from '@/lib/types';

const empty = { name: '', description: '', price: '', category: 'Menu', image_url: '' };

export default function MerchantMenu() {
  const { merchant, session } = useAuth();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [editing, setEditing] = useState<(typeof empty & { id?: string }) | null>(null);

  const load = useCallback(async () => { if (!merchant) return; const { data } = await supabase.from('menu_items').select('*').eq('merchant_id', merchant.id).order('sort_order').order('created_at'); setItems((data as MenuItem[]) ?? []); }, [merchant]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!merchant || !editing) return;
    const price = Number(editing.price.replace(/\D/g, ''));
    if (editing.name.trim().length < 2) return toast.error('Nama menu wajib diisi');
    if (!price) return toast.error('Harga wajib diisi');
    const payload = { merchant_id: merchant.id, name: editing.name.trim(), description: editing.description || null, price, category: editing.category || 'Menu', image_url: editing.image_url || null };
    const { error } = editing.id ? await supabase.from('menu_items').update(payload).eq('id', editing.id) : await supabase.from('menu_items').insert(payload);
    if (error) return toast.error(error.message);
    setEditing(null); toast.success('Menu disimpan'); load();
  };
  const toggle = async (it: MenuItem) => { await supabase.from('menu_items').update({ is_available: !it.is_available }).eq('id', it.id); load(); };
  const remove = async (it: MenuItem) => { const { error } = await supabase.from('menu_items').delete().eq('id', it.id); if (error) toast.error('Menu pernah dipesan, nonaktifkan saja'); else load(); };
  const upload = async () => { if (!session) return; try { const r = await pickAndUpload('merchant-images', session.user.id); if (r && editing) setEditing({ ...editing, image_url: r.url }); } catch (e) { toast.error((e as Error).message); } };

  return (
    <Screen title="Kelola Menu" ambient="amber" bottomSpace={TAB_BAR_SPACE + 16} right={<PressableScale onPress={() => setEditing({ ...empty })} scaleTo={0.88} style={[s.addBtn, shadow.glow(colors.food)]}><BrandGradient colors={[colors.food, '#EA580C']} style={StyleSheet.absoluteFill} /><Ionicons name="add" size={22} color="#fff" /></PressableScale>}>
      {items.length === 0 ? <Empty icon="restaurant-outline" title="Belum ada menu" subtitle="Tambahkan menu andalan Anda." action={<Button title="Tambah menu" color={colors.food} onPress={() => setEditing({ ...empty })} />} /> : (
        <View style={{ gap: 10 }}>
          {items.map((it, i) => (
            <Entrance key={it.id} index={Math.min(i, 8)} from="up"><Animated.View layout={LinearTransition.springify()}><Card style={!it.is_available && { opacity: 0.6 }}>
              <Row gap={12}>
                {it.image_url ? <Image source={{ uri: it.image_url }} style={s.thumb} /> : <View style={[s.thumb, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="fast-food-outline" size={22} color={colors.textMuted} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={font.h3}>{it.name}</Text>
                  <Text style={font.tiny}>{it.category}</Text>
                  <Text style={{ fontWeight: '800', color: colors.food }}>{rupiah(it.price)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Switch value={it.is_available} onValueChange={() => toggle(it)} trackColor={{ true: colors.success, false: colors.border }} thumbColor="#fff" />
                  <Row gap={12}>
                    <Pressable onPress={() => setEditing({ id: it.id, name: it.name, description: it.description ?? '', price: String(it.price), category: it.category ?? 'Menu', image_url: it.image_url ?? '' })}><Ionicons name="create-outline" size={20} color={colors.primary} /></Pressable>
                    <Pressable onPress={() => remove(it)}><Ionicons name="trash-outline" size={20} color={colors.danger} /></Pressable>
                  </Row>
                </View>
              </Row>
            </Card></Animated.View></Entrance>
          ))}
        </View>
      )}
      <Modal visible={!!editing} animationType="fade" transparent onRequestClose={() => setEditing(null)}>
        <View style={s.modalBg}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(null)} />
          <Animated.View entering={FadeInDown.springify().damping(18)} style={s.modal}>
            {Platform.OS !== 'android' && <BlurView intensity={glass.blurStrong} tint="light" style={StyleSheet.absoluteFill} />}
            <View style={s.handle} />
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              <Row between><Text style={font.h2}>{editing?.id ? 'Edit menu' : 'Tambah menu'}</Text><Pressable onPress={() => setEditing(null)}><Ionicons name="close" size={24} color={colors.text} /></Pressable></Row>
              <Input label="Nama menu" value={editing?.name ?? ''} onChangeText={(v) => setEditing((e) => e && { ...e, name: v })} />
              <Input label="Deskripsi" value={editing?.description ?? ''} onChangeText={(v) => setEditing((e) => e && { ...e, description: v })} />
              <Row gap={10}>
                <Input label="Harga (Rp)" keyboardType="number-pad" value={editing?.price ?? ''} onChangeText={(v) => setEditing((e) => e && { ...e, price: v.replace(/\D/g, '') })} containerStyle={{ flex: 1 }} />
                <Input label="Kategori" value={editing?.category ?? ''} onChangeText={(v) => setEditing((e) => e && { ...e, category: v })} containerStyle={{ flex: 1 }} placeholder="Nasi / Minuman" />
              </Row>
              <Button title={editing?.image_url ? 'Ganti foto menu' : 'Unggah foto menu'} variant="secondary" icon="image-outline" onPress={upload} />
              <Button title="Simpan" color={colors.food} onPress={save} />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 8, overflow: 'hidden' },
  thumb: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: 'rgba(11,31,42,0.06)' },
  modalBg: { flex: 1, backgroundColor: 'rgba(11,31,42,0.35)', justifyContent: 'flex-end' },
  modal: { backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.8)', borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: 20, paddingBottom: 32, maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center', overflow: 'hidden', borderTopWidth: 1, borderColor: glass.border },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(11,31,42,0.18)', alignSelf: 'center', marginBottom: 12 },
});
