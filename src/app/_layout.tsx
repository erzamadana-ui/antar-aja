import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from '@/store/auth';
import { useMode } from '@/store/mode';
import { ToastHost, Loading } from '@/components/ui';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const ready = useAuth((s) => s.ready);
  const init = useAuth((s) => s.init);
  const modeLoaded = useMode((s) => s.loaded);
  const loadMode = useMode((s) => s.load);

  useEffect(() => { init(); loadMode(); }, [init, loadMode]);
  useEffect(() => { if (ready && modeLoaded) SplashScreen.hideAsync().catch(() => {}); }, [ready, modeLoaded]);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Antar Aja';
      const style = document.createElement('style');
      style.textContent = 'html,body,#root{height:100%;background:#F6F7F9} body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif} *{box-sizing:border-box} ::-webkit-scrollbar{width:8px;height:8px} ::-webkit-scrollbar-thumb{background:#cfd6dc;border-radius:8px}';
      document.head.appendChild(style);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="dark" />
        {!ready || !modeLoaded ? <Loading /> : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: Platform.OS === 'web' ? 'none' : 'default' }} />
        )}
        <ToastHost />
      </View>
    </SafeAreaProvider>
  );
}
