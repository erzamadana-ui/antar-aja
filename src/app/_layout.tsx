import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { useI18n, applyDirection } from '@/lib/i18n';
import { IncomingCallOverlay } from '@/components/call/IncomingCall';
import { ToastHost, Loading } from '@/components/ui';
import { AmbientBackground } from '@/components/glass';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const ready = useAuth((s) => s.ready);
  const init = useAuth((s) => s.init);
  const modeLoaded = useMode((s) => s.loaded);
  const loadMode = useMode((s) => s.load);
  const loadLocale = useI18n((s) => s.load);
  const locale = useI18n((s) => s.locale);

  useEffect(() => { init(); loadMode(); loadLocale(); }, [init, loadMode, loadLocale]);
  useEffect(() => { applyDirection(locale); }, [locale]);
  useEffect(() => { if (ready && modeLoaded) SplashScreen.hideAsync().catch(() => {}); }, [ready, modeLoaded]);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Antar Aja';
      const style = document.createElement('style');
      style.textContent = [
        'html,body,#root{height:100%;background:#F3F6F8}',
        'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;-webkit-font-smoothing:antialiased}',
        '*{box-sizing:border-box}',
        '::-webkit-scrollbar{width:8px;height:8px} ::-webkit-scrollbar-thumb{background:rgba(11,31,42,0.18);border-radius:8px}',
        'a,button,[role=button]{transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .2s,opacity .2s}',
        '[role=button]:hover{filter:brightness(1.03)}',
        '@media (prefers-reduced-motion: reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}',
      ].join('\n');
      document.head.appendChild(style);
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <StatusBar style="dark" />
          {!ready || !modeLoaded ? (<><AmbientBackground /><Loading /></>) : (
            <Stack screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: Platform.OS === 'web' ? 'fade' : 'slide_from_right',
              animationDuration: 180,
              gestureEnabled: true,
              fullScreenGestureEnabled: true,
            }}>
              <Stack.Screen name="place-picker" options={{ animation: Platform.OS === 'web' ? 'fade' : 'slide_from_bottom', presentation: 'card' }} />
              <Stack.Screen name="food/checkout" options={{ animation: Platform.OS === 'web' ? 'fade' : 'slide_from_bottom' }} />
              <Stack.Screen name="order/[id]/chat" options={{ animation: Platform.OS === 'web' ? 'fade' : 'slide_from_bottom' }} />
              <Stack.Screen name="call/[id]" options={{ animation: 'fade', presentation: 'fullScreenModal' }} />
              <Stack.Screen name="pay/gateway" options={{ animation: Platform.OS === 'web' ? 'fade' : 'slide_from_bottom' }} />
            </Stack>
          )}
          {ready && <IncomingCallOverlay />}
          <ToastHost />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
