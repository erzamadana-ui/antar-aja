import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Input, Button, Icon, toast } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { colors, font } from '@/lib/theme';

export default function Login() {
  const router = useRouter();
  const signIn = useAuth((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!email || !password) { setErr('Isi email dan kata sandi'); return; }
    try { await signIn(email, password); router.replace('/'); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <Screen title="Masuk" back maxWidth={480}>
      <View style={{ gap: 16, paddingTop: 8 }}>
        <Text style={font.h1}>Selamat datang kembali</Text>
        <Text style={font.small}>Masuk untuk mulai memesan.</Text>
        <Input label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="nama@email.com" textContentType="emailAddress" />
        <Input label="Kata sandi" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry={!show} placeholder="••••••••" onSubmitEditing={submit}
          right={<Pressable onPress={() => setShow(!show)} hitSlop={8}><Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} /></Pressable>} />
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
        <Button title="Masuk" size="lg" onPress={submit} />
        <Pressable onPress={() => router.push('/(auth)/register')} style={{ alignItems: 'center', padding: 8 }}>
          <Text style={font.small}>Belum punya akun? <Text style={{ color: colors.primary, fontWeight: '700' }}>Daftar</Text></Text>
        </Pressable>
        <View style={{ backgroundColor: colors.accentLight, padding: 12, borderRadius: 12, marginTop: 8 }}>
          <Text style={{ fontSize: 12, color: colors.warning, fontWeight: '700', marginBottom: 4 }}>Akun demo (kata sandi: AntarAja#2026)</Text>
          {['customer@antaraja.id — pelanggan', 'driver@antaraja.id — mitra driver (motor)', 'driver2@antaraja.id — mitra driver (mobil)', 'merchant@antaraja.id — merchant', 'admin@antaraja.id — admin'].map((t) => (
            <Pressable key={t} onPress={() => { setEmail(t.split(' ')[0]); setPassword('AntarAja#2026'); toast.show('Kredensial demo diisi'); }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, paddingVertical: 2 }}>• {t}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
