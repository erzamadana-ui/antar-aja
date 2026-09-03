import React, { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Input, Button, Avatar, toast } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { pickAndUpload } from '@/lib/upload';
import { colors } from '@/lib/theme';

export default function EditProfile() {
  const router = useRouter();
  const { profile, updateProfile, session } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? null);

  const changePhoto = async () => {
    if (!session) return;
    try { const r = await pickAndUpload('avatars', session.user.id); if (r) setAvatar(r.url); } catch (e) { toast.error((e as Error).message); }
  };
  const save = async () => {
    if (name.trim().length < 3) return toast.error('Nama minimal 3 huruf');
    try { await updateProfile({ full_name: name.trim(), phone: phone.trim(), avatar_url: avatar }); toast.success('Profil disimpan'); router.back(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Screen title="Edit Profil" back footer={<Button title="Simpan" size="lg" onPress={save} />}>
      <Card style={{ gap: 14, alignItems: 'center' }}>
        <Pressable onPress={changePhoto} style={{ alignItems: 'center', gap: 6 }}>
          <Avatar name={name} url={avatar} size={88} />
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Ganti foto</Text>
        </Pressable>
        <View style={{ width: '100%', gap: 12 }}>
          <Input label="Nama lengkap" value={name} onChangeText={setName} icon="person-outline" />
          <Input label="Nomor HP" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" />
          <Input label="Email" value={profile?.email ?? ''} editable={false} icon="mail-outline" />
        </View>
      </Card>
    </Screen>
  );
}
