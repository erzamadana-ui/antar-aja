import React, { useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing, useReducedMotion } from 'react-native-reanimated';
import { Button } from '@/components/ui';
import { AmbientBackground, BrandGradient, Glass } from '@/components/glass';
import { Entrance, PressableScale } from '@/components/motion';
import { BrandLogo } from '@/components/Logo';
import { ServiceArt } from '@/components/ServiceArt';
import { useT } from '@/lib/i18n';
import { colors, radius, font, shadow } from '@/lib/theme';
import { LanguageRow } from '@/components/LanguagePicker';
import { SERVICES } from '@/lib/services';

export default function Welcome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const t = useT();
  return (
    <View style={{ flex: 1 }}>
      <AmbientBackground tint="mixed" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[s.wrap, wide && { flexDirection: 'row', alignItems: 'center', gap: 56, paddingHorizontal: 64 }]}>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Entrance index={0} from="zoom">
              <Floating>
                <BrandLogo size={88} />
              </Floating>
            </Entrance>
            <Entrance index={1}><Text style={[font.display, { fontSize: wide ? 56 : 42, marginTop: 20 }]}>Antar Aja</Text></Entrance>
            <Entrance index={2}><Text style={s.tag}>{t('welcome_tag')}</Text></Entrance>
            <View style={s.pills}>
              {SERVICES.filter((x) => x.id !== 'pay').map((sv, i) => (
                <Entrance key={sv.id} index={3 + i} from="zoom">
                  <Glass variant="strong" radius={radius.full} shadowed={false}>
                    <View style={s.pill}>
                      <ServiceArt kind={sv.art} color={sv.color} size={30} glow={false} />
                      <Text style={s.pillText}>{sv.label}</Text>
                    </View>
                  </Glass>
                </Entrance>
              ))}
            </View>
          </View>
          <Entrance index={5} style={wide ? { width: 400 } : undefined}>
            <Glass variant="strong" radius={radius.xl} padded>
              <View style={{ gap: 12, padding: 4 }}>
                <Text style={font.h2}>{t('start_now')}</Text>
                <Text style={font.small}>{t('start_sub')}</Text>
                <Button title={t('create_account')} size="lg" onPress={() => router.push('/(auth)/register')} />
                <Button title={t('login')} size="lg" variant="glass" onPress={() => router.push('/(auth)/login')} />
                <Text style={[font.tiny, { textAlign: 'center' }]}>{t('partner_hint')}</Text>
                <LanguageRow />
              </View>
            </Glass>
          </Entrance>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Melayang naik-turun perlahan (dimatikan saat reduce motion). */
function Floating({ children }: { children: React.ReactNode }) {
  const y = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => { if (!reduce) y.value = withDelay(400, withRepeat(withTiming(-8, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true)); }, [y, reduce]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[a, { alignSelf: 'flex-start' }]}>{children}</Animated.View>;
}

export { PressableScale, BrandGradient, Ionicons, shadow };

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'space-between', width: '100%', maxWidth: 1100, alignSelf: 'center' },
  logo: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tag: { fontSize: 16, color: colors.textSecondary, marginTop: 10, lineHeight: 24 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 12, paddingVertical: 5 },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { color: colors.text, fontWeight: '700', fontSize: 13 },
});
