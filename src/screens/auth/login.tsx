import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Screen, Input, Button, Icon, toast } from '@/components/ui';
import { Glass } from '@/components/glass';
import { Entrance } from '@/components/motion';
import { LogoLockup } from '@/components/Logo';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/store/auth';
import { colors, font } from '@/lib/theme';
import { APP, APP_NAME, APP_URL } from '@/lib/app';

const DEMO: Record<string, string[]> = {
  pelanggan: ['customer@antaraja.id — pelanggan'],
  mitra: ['driver@antaraja.id — mitra driver (motor)', 'driver2@antaraja.id — mitra travel (Hi-Ace)', 'merchant@antaraja.id — merchant'],
  admin: ['admin@antaraja.id — admin'],
};

export default function Login() {
  const router = useRouter();
  const signIn = useAuth((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = useT();
  const { denied } = useLocalSearchParams<{ denied?: string }>();
  const signOut = useAuth((s) => s.signOut);
  const session = useAuth((s) => s.session);

  const submit = async () => {
    setErr(null);
    if (!email || !password) { setErr('Isi email dan kata sandi'); return; }
    try { await signIn(email, password); router.replace('/'); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <Screen title={t('login')} back maxWidth={480}>
      <Entrance index={0} from="zoom" style={{ alignItems: 'center', marginTop: 8, marginBottom: 6 }}><LogoLockup size={56} /></Entrance>
      <Entrance index={1}><Text style={[font.h1, { marginTop: 8 }]}>{t('welcome_back')}</Text><Text style={font.small}>{APP === 'admin' ? `Masuk ke ${APP_NAME.admin} dengan akun admin.` : APP === 'mitra' ? 'Masuk dengan akun AntarKita Anda untuk mengelola pesanan mitra.' : t('login_sub')}</Text></Entrance>
      {denied ? (
        <Entrance index={1}><View style={{ backgroundColor: colors.dangerLight, padding: 12, borderRadius: 12, marginTop: 12, gap: 8 }}>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>Akun ini bukan admin</Text>
          <Text style={font.small}>{APP_NAME.admin} hanya untuk akun berperan admin. Gunakan aplikasi Pelanggan atau Mitra untuk akun ini.</Text>
          <Button title="Keluar & masuk dengan akun lain" size="sm" variant="outline" onPress={async () => { await signOut(); router.replace('/(auth)/login' as never); }} />
          {session ? <Text style={[font.tiny]}>Aplikasi Pelanggan: {APP_URL.pelanggan}</Text> : null}
        </View></Entrance>
      ) : null}
      <Entrance index={2}><Glass variant="strong" padded style={{ marginTop: 16 }}><View style={{ gap: 14 }}>
        <Input label={t('email')} icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="nama@email.com" textContentType="emailAddress" />
        <Input label={t('password')} icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry={!show} placeholder="••••••••" onSubmitEditing={submit}
          right={<Pressable onPress={() => setShow(!show)} hitSlop={8}><Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} /></Pressable>} />
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
        <Button title={t('login')} size="lg" onPress={submit} />
        <Pressable onPress={() => router.push('/(auth)/register')} style={{ alignItems: 'center', padding: 8 }}>
          <Text style={font.small}>{t('no_account')} <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('register')}</Text></Text>
        </Pressable>
      </View></Glass></Entrance>
      <Entrance index={3}>
        <View style={{ backgroundColor: colors.accentLight, padding: 12, borderRadius: 12, marginTop: 16 }}>
          <Text style={{ fontSize: 12, color: colors.warning, fontWeight: '700', marginBottom: 4 }}>Akun demo (kata sandi: AntarAja#2026)</Text>
          {DEMO[APP].map((t) => (
            <Pressable key={t} onPress={() => { setEmail(t.split(' ')[0]); setPassword('AntarAja#2026'); toast.show('Kredensial demo diisi'); }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, paddingVertical: 2 }}>• {t}</Text>
            </Pressable>
          ))}
        </View>
      </Entrance>
    </Screen>
  );
}
