import { create } from 'zustand';
import type { MenuItem, Merchant } from '@/lib/types';

export interface CartLine { item: MenuItem; qty: number; notes?: string }

interface CartState {
  merchant: Merchant | null;
  lines: CartLine[];
  add: (merchant: Merchant, item: MenuItem) => boolean; // false jika beda merchant (perlu konfirmasi)
  setQty: (itemId: string, qty: number) => void;
  setNotes: (itemId: string, notes: string) => void;
  clear: () => void;
  replaceWith: (merchant: Merchant, item: MenuItem) => void;
  subtotal: () => number;
  count: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  merchant: null,
  lines: [],
  add: (merchant, item) => {
    const s = get();
    if (s.merchant && s.merchant.id !== merchant.id && s.lines.length > 0) return false;
    const existing = s.lines.find((l) => l.item.id === item.id);
    const lines = existing
      ? s.lines.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l))
      : [...s.lines, { item, qty: 1 }];
    set({ merchant, lines });
    return true;
  },
  replaceWith: (merchant, item) => set({ merchant, lines: [{ item, qty: 1 }] }),
  setQty: (itemId, qty) => {
    const lines = get().lines.map((l) => (l.item.id === itemId ? { ...l, qty } : l)).filter((l) => l.qty > 0);
    set({ lines, merchant: lines.length ? get().merchant : null });
  },
  setNotes: (itemId, notes) => set({ lines: get().lines.map((l) => (l.item.id === itemId ? { ...l, notes } : l)) }),
  clear: () => set({ merchant: null, lines: [] }),
  subtotal: () => get().lines.reduce((a, l) => a + l.item.price * l.qty, 0),
  count: () => get().lines.reduce((a, l) => a + l.qty, 0),
}));
