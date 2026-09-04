// Kartu promo bergambar (thumbnail 16:9). Bila promo punya image_url, gambar tampil penuh (teks sudah ada di gambar);
// bila belum, tampil ilustrasi layanan + gradien + judul otomatis.
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '@/components/motion';
import { BrandGradient } from '@/components/glass';
import { ServiceIllustration } from '@/components/ServiceArt';
import { serviceDef } from '@/lib/services';
import { colors, radius, shadow } from '@/lib/theme';
import { rupiah } from '@/lib/format';
import type { Promo } from '@/lib/types';

const PALETTES: [string, string][] = [[colors.primary, '#0E7C7B'], ['#F5A524', '#F97316'], ['#8B5CF6', '#6D28D9'], ['#0EA5E9', '#0369A1'], ['#EC4899', '#BE185D']];

export function promoHeadline(p: Promo) {
  return p.title ?? (p.discount_type === 'percent' ? `Diskon ${p.value}%${p.max_discount ? ` s.d. ${rupiah(p.max_discount)}` : ''}` : `Potongan ${rupiah(p.value)}`);
}

export function PromoCard({ promo, index = 0, onPress, width = 260 }: { promo: Promo; index?: number; onPress?: () => void; width?: number }) {
  const def = promo.service ? serviceDef(promo.service) : null;
  const pal = PALETTES[index % PALETTES.length];
  return (
    <PressableScale onPress={onPress} scaleTo={0.97} style={[s.card, { width }, shadow.card]}>
      {promo.image_url ? (
        <Image source={{ uri: promo.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <BrandGradient colors={def ? [def.color, pal[1]] : pal} style={StyleSheet.absoluteFill} />
      )}
      {!promo.image_url && <View style={s.orb} />}
      {!promo.image_url && <View style={s.art}><ServiceIllustration kind={def?.art ?? 'pay'} size={78} /></View>}
      {!promo.image_url && <BrandGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} angle="vertical" style={s.shade} />}
      {!promo.image_url && <View style={s.body}>
        <View style={s.code}><Ionicons name="pricetag" size={11} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 }}>{promo.code}</Text></View>
        <Text style={s.title} numberOfLines={2}>{promoHeadline(promo)}</Text>
        <Text style={s.desc} numberOfLines={1}>{promo.min_total > 0 ? `Min. ${rupiah(promo.min_total)} · ` : ''}{def ? def.label : 'Semua layanan'}</Text>
      </View>}
    </PressableScale>
  );
}

const s = StyleSheet.create({
  card: { height: 140, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.primary },
  orb: { position: 'absolute', right: -30, top: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.16)' },
  art: { position: 'absolute', right: 10, top: 8 },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 90 },
  body: { position: 'absolute', left: 14, right: 14, bottom: 12, gap: 3 },
  code: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  title: { color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: -0.3, lineHeight: 21, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  desc: { color: 'rgba(255,255,255,0.92)', fontSize: 11, fontWeight: '600' },
});
