// Layar panggilan suara (keluar/masuk) — WebRTC, nomor HP tidak pernah tampil.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Avatar, Button } from '@/components/ui';
import { AmbientBackground } from '@/components/glass';
import { PressableScale, Radar, LiveDot } from '@/components/motion';
import { roleLabel } from '@/components/call/IncomingCall';
import { useCall } from '@/lib/call';
import { useT } from '@/lib/i18n';
import { colors, font, radius, shadow, motion } from '@/lib/theme';

export default function CallScreen() {
  const router = useRouter();
  const t = useT();
  const { phase, peer, muted, speaker, startedAt, endReason, hangup, toggleMute, toggleSpeaker, reset } = useCall();
  const [tick, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { if (phase === 'idle') { router.canGoBack() ? router.back() : router.replace('/'); } }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const dur = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
  const mm = String(Math.floor(dur / 60)).padStart(2, '0'), ss = String(dur % 60).padStart(2, '0');
  const status = phase === 'outgoing' ? t('calling') : phase === 'connecting' ? t('connecting') : phase === 'active' ? `${mm}:${ss}` : phase === 'ended' ? (endReason ?? t('call_ended')) : t('incoming_call');
  const close = () => { reset(); };
  void tick;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AmbientBackground tint={phase === 'active' ? 'teal' : 'mixed'} />
      <SafeAreaView style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(motion.slow)} style={s.wrap}>
          <View style={{ alignItems: 'center', gap: 12 }}>
            {phase === 'active' ? (
              <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}><Avatar name={peer?.name} url={peer?.avatar} size={110} /><View style={s.live}><LiveDot color={colors.success} size={8} /></View></View>
            ) : (
              <Radar color={phase === 'ended' ? colors.textMuted : colors.primary} size={170}><Avatar name={peer?.name} url={peer?.avatar} size={66} /></Radar>
            )}
            <Text style={font.display}>{peer?.name ?? '—'}</Text>
            <Text style={font.small}>{roleLabel(peer?.role)}</Text>
            <Animated.Text key={status} entering={FadeIn.duration(motion.base)} style={[font.h2, { color: phase === 'active' ? colors.success : colors.textSecondary }]}>{status}</Animated.Text>
            <Text style={[font.tiny, { textAlign: 'center', maxWidth: 300 }]}>{t('call_privacy')}</Text>
          </View>

          <Animated.View entering={FadeInDown.delay(150).duration(motion.slow)} style={{ alignItems: 'center', gap: 22 }}>
            {phase !== 'ended' ? (
              <>
                <View style={{ flexDirection: 'row', gap: 22 }}>
                  <Ctrl icon={muted ? 'mic-off' : 'mic'} label={t('mute')} active={muted} onPress={toggleMute} />
                  <Ctrl icon="volume-high" label={t('speaker')} active={speaker} onPress={toggleSpeaker} />
                </View>
                <PressableScale onPress={() => hangup()} scaleTo={0.88} style={[s.end, shadow.glow(colors.danger)]}>
                  <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                </PressableScale>
                <Text style={font.tiny}>{t('end_call')}</Text>
              </>
            ) : (
              <Button title={t('close')} size="lg" variant="secondary" style={{ minWidth: 200 }} onPress={close} />
            )}
          </Animated.View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

function Ctrl({ icon, label, active, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; active?: boolean; onPress: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <PressableScale onPress={onPress} scaleTo={0.9} style={[s.ctrl, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        <Ionicons name={icon} size={24} color={active ? '#fff' : colors.text} />
      </PressableScale>
      <Text style={font.tiny}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly', padding: 24 },
  live: { position: 'absolute', bottom: 22, right: 22, backgroundColor: '#fff', borderRadius: 12, padding: 3 },
  ctrl: { width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center', ...shadow.soft },
  end: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.xl },
});
