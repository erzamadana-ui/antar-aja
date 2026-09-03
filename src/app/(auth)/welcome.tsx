import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { colors, radius } from '@/lib/theme';
import { SERVICES } from '@/lib/services';

export default function Welcome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  return (
    <LinearGradient colors={[colors.primaryDark, colors.primary, '#13A29F']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[s.wrap, wide && { flexDirection: 'row', alignItems: 'center', gap: 48, paddingHorizontal: 64 }]}>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={s.logo}><Ionicons name="navigate" size={34} color={colors.primary} /></View>
            <Text style={s.brand}>Antar Aja</Text>
            <Text style={s.tag}>Ojek, mobil, makanan, dan kirim barang.{'\n'}Satu aplikasi untuk semua kebutuhan harian.</Text>
            <View style={s.grid}>
              {SERVICES.filter((x) => x.id !== 'pay').map((sv) => (
                <View key={sv.id} style={s.pill}>
                  <Ionicons name={sv.icon as never} size={16} color="#fff" />
                  <Text style={s.pillText}>{sv.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={[s.card, wide && { width: 380 }]}>
            <Text style={s.cardTitle}>Mulai sekarang</Text>
            <Text style={s.cardSub}>Daftar gratis, pesan dalam hitungan detik.</Text>
            <Button title="Buat Akun" size="lg" onPress={() => router.push('/(auth)/register')} />
            <Button title="Masuk" size="lg" variant="outline" onPress={() => router.push('/(auth)/login')} />
            <Text style={s.foot}>Ingin jadi mitra driver atau merchant? Daftar akun lalu buka menu Akun.</Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'space-between', width: '100%', maxWidth: 1100, alignSelf: 'center' },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  brand: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  tag: { fontSize: 16, color: 'rgba(255,255,255,0.9)', marginTop: 10, lineHeight: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full },
  pillText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: { backgroundColor: '#fff', borderRadius: radius.xl, padding: 22, gap: 12 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  cardSub: { color: colors.textSecondary, marginBottom: 4 },
  foot: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
});
