import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import type { LatLng } from '@/lib/types';
import { DEFAULT_CENTER } from '@/lib/services';

let lastKnown: LatLng | null = null;

/** Lokasi pengguna saat ini (sekali ambil), dengan fallback ke pusat kota. */
export function useCurrentLocation(auto = true) {
  const [location, setLocation] = useState<LatLng | null>(lastKnown);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setGranted(status === 'granted');
      if (status !== 'granted') { setLocation((l) => l ?? DEFAULT_CENTER); return null; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      lastKnown = p; setLocation(p); return p;
    } catch {
      setLocation((l) => l ?? DEFAULT_CENTER); return null;
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (auto) refresh(); }, [auto, refresh]);
  return { location: location ?? DEFAULT_CENTER, hasFix: !!location, granted, loading, refresh };
}

/** Pantau lokasi terus-menerus (untuk driver online). */
export function useWatchLocation(active: boolean, onUpdate: (p: LatLng & { heading: number | null }) => void, intervalMs = 5000) {
  const cb = useRef(onUpdate);
  cb.current = onUpdate;
  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: intervalMs, distanceInterval: Platform.OS === 'web' ? 0 : 15 },
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading ?? null };
          lastKnown = p; cb.current(p);
        },
      );
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [active, intervalMs]);
}
