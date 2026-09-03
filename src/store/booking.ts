import { create } from 'zustand';
import type { Place } from '@/lib/types';

export type PickerTarget = 'pickup' | 'dropoff' | 'merchant' | 'generic';

interface BookingState {
  pickup: Place | null;
  dropoff: Place | null;
  pickerTarget: PickerTarget;
  pickerResult: { target: PickerTarget; place: Place; nonce: number } | null;
  setPickup: (p: Place | null) => void;
  setDropoff: (p: Place | null) => void;
  openPicker: (target: PickerTarget) => void;
  resolvePicker: (place: Place) => void;
  consumePickerResult: () => { target: PickerTarget; place: Place } | null;
  reset: () => void;
}

export const useBooking = create<BookingState>((set, get) => ({
  pickup: null,
  dropoff: null,
  pickerTarget: 'generic',
  pickerResult: null,
  setPickup: (pickup) => set({ pickup }),
  setDropoff: (dropoff) => set({ dropoff }),
  openPicker: (pickerTarget) => set({ pickerTarget }),
  resolvePicker: (place) => {
    const target = get().pickerTarget;
    if (target === 'pickup') set({ pickup: place });
    if (target === 'dropoff') set({ dropoff: place });
    set({ pickerResult: { target, place, nonce: Date.now() } });
  },
  consumePickerResult: () => {
    const r = get().pickerResult;
    if (r) set({ pickerResult: null });
    return r;
  },
  reset: () => set({ pickup: null, dropoff: null, pickerResult: null }),
}));
