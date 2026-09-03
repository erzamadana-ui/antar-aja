import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppMode = 'customer' | 'driver' | 'merchant' | 'admin';
const KEY = 'antaraja.mode';

interface ModeState { mode: AppMode; loaded: boolean; load: () => Promise<void>; setMode: (m: AppMode) => Promise<void> }

export const useMode = create<ModeState>((set) => ({
  mode: 'customer', loaded: false,
  load: async () => {
    try { const v = (await AsyncStorage.getItem(KEY)) as AppMode | null; if (v) set({ mode: v }); } catch { /* noop */ }
    set({ loaded: true });
  },
  setMode: async (mode) => { set({ mode }); try { await AsyncStorage.setItem(KEY, mode); } catch { /* noop */ } },
}));

export const modeHome: Record<AppMode, string> = { customer: '/(customer)', driver: '/(driver)', merchant: '/(merchant)', admin: '/(admin)' };
