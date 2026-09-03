import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Input, Button } from '@/components/ui';
import { Glass } from '@/components/glass';
import { Entrance } from '@/components/motion';
import { LogoLockup } from '@/components/Logo';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/store/auth';
import { colors, font } from '@/lib/theme';

export default function Register() {
  const router = useRouter();
  const signUp = useAuth((s) => s.signUp);
  const [f, setF] = useState({ full_name: '', phone: '', email: '', password: '', confirm: '' });
  const [err, setErr] = useState<string | null>(null);
  const t = useT();
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setErr(null);
    if (f.full_name.trim().length < 3) return setErr('Nama lengkap minimal 3 huruf');
    if (!/^(\+62|0)8\d{7,12}$/.test(f.phone.replace(/\s|-/g, ''))) return setErr('Nomor HP tidak valid (contoh: 08123456789)');
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Email tidak valid');
    if (f.password.length < 6) return setErr('Kata sandi minimal 6 karakter');
    if (f.password !== f.confirm) return setErr('Konfirmasi kata sandi tidak sama');
    try { await signUp(f); router.replace('/'); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <Screen title={t('create_account')} back maxWidth={480}>
      <Entrance index={0} from="zoom" style={{ alignItems: 'center', marginTop: 8, marginBottom: 6 }}><LogoLockup size={56} /></Entrance>
      <Entrance index={1}><Text style={[font.h1, { marginTop: 8 }]}>{t('register')} Antar Aja</Text><Text style={font.small}>{t('start_sub')}</Text></Entrance>
      <Entrance index={2}><Glass variant="strong" padded style={{ marginTop: 16 }}><View style={{ gap: 14 }}>
        <Input label={t('full_name')} icon="person-outline" value={f.full_name} onChangeText={set('full_name')} placeholder="Nama sesuai KTP" />
        <Input label={t('phone')} icon="call-outline" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="08123456789" />
        <Input label={t('email')} icon="mail-outline" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" placeholder="nama@email.com" />
        <Input label={t('password')} icon="lock-closed-outline" value={f.password} onChangeText={set('password')} secureTextEntry placeholder="Minimal 6 karakter" />
        <Input label="Ulangi kata sandi" icon="lock-closed-outline" value={f.confirm} onChangeText={set('confirm')} secureTextEntry placeholder="Ulangi kata sandi" onSubmitEditing={submit} />
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
        <Button title={t('register')} size="lg" onPress={submit} />
        <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>Dengan mendaftar Anda menyetujui Syarat & Ketentuan serta Kebijakan Privasi Antar Aja.</Text>
        <Pressable onPress={() => router.replace('/(auth)/login')} style={{ alignItems: 'center', padding: 8 }}>
          <Text style={font.small}>{t('have_account')} <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('login')}</Text></Text>
        </Pressable>
      </View></Glass></Entrance>
    </Screen>
  );
}
