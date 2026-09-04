// Preferensi metode pembayaran pelanggan (tunai / AntarPay / e-wallet pilihan) — tersimpan di tabel payment_prefs
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { PaymentPrefs } from '@/lib/types';

interface S { prefs: PaymentPrefs | null; loaded: boolean; load: (uid: string) => Promise<void>; save: (uid: string, p: Partial<PaymentPrefs>) => Promise<void> }
export const usePayPrefs = create<S>((set, get) => ({
  prefs: null, loaded: false,
  load: async (uid) => {
    const { data } = await supabase.from('payment_prefs').select('*').eq('user_id', uid).maybeSingle();
    set({ prefs: (data as PaymentPrefs) ?? { user_id: uid, default_method: 'cash', ewallet: null }, loaded: true });
  },
  save: async (uid, p) => {
    const next = { ...(get().prefs ?? { user_id: uid, default_method: 'cash', ewallet: null }), ...p, user_id: uid } as PaymentPrefs;
    set({ prefs: next });
    await supabase.from('payment_prefs').upsert({ user_id: uid, default_method: next.default_method, ewallet: next.ewallet, updated_at: new Date().toISOString() });
  },
}));

export const EWALLETS = [
  { key: 'gopay', label: 'GoPay', color: '#00AA13', icon: 'wallet' },
  { key: 'ovo', label: 'OVO', color: '#4C2A86', icon: 'wallet' },
  { key: 'dana', label: 'DANA', color: '#118EEA', icon: 'wallet' },
  { key: 'shopeepay', label: 'ShopeePay', color: '#EE4D2D', icon: 'wallet' },
  { key: 'qris', label: 'QRIS', color: '#0B1F2A', icon: 'qr-code' },
  { key: 'bank_transfer', label: 'VA Bank', color: '#2F80ED', icon: 'business' },
] as const;
export type EwalletKey = typeof EWALLETS[number]['key'];
