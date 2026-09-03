import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Switch, ScrollView, Modal, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Row, Input, Button, Empty, toast } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { pickAndUpload } from '@/lib/upload';
import { colors, font, radius } from '@/lib/theme';
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
    <Screen title="Kelola Menu" right={<Pressable onPress={() => setEditing({ ...empty })} style={s.addBtn}><Ionicons name="add" size={20} color="#fff" /></Pressable>}>
      {items.length === 0 ? <Empty icon="restaurant-outline" title="Belum ada menu" subtitle="Tambahkan menu andalan Anda." action={<Button title="Tambah menu" color={colors.food} onPress={() => setEditing({ ...empty })} />} /> : (
        <View style={{ gap: 10 }}>
          {items.map((it) => (
            <Card key={it.id} style={!it.is_available && { opacity: 0.6 }}>
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
            </Card>
          ))}
        </View>
      )}
      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
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
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.food, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  thumb: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: colors.bg },
  modalBg: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 32, maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center' },
});
