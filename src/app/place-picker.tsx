import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MapView, CenterPin, MapFab } from '@/components/map';
import { Input, Button, Row, IconCircle } from '@/components/ui';
import { useBooking } from '@/store/booking';
import { useAuth } from '@/store/auth';
import { useCurrentLocation } from '@/hooks/useLocation';
import { searchPlaces, reverseGeocode } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { colors, font, radius, shadow } from '@/lib/theme';
import type { LatLng, Place, SavedPlace } from '@/lib/types';

export default function PlacePicker() {
  const router = useRouter();
  const { title, target } = useLocalSearchParams<{ title?: string; target?: string }>();
  const booking = useBooking();
  const uid = useAuth((s) => s.session?.user.id);
  const { location, refresh } = useCurrentLocation();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [center, setCenter] = useState<LatLng>(location);
  const [address, setAddress] = useState<string>('');
  const [resolving, setResolving] = useState(false);
  const [mode, setMode] = useState<'search' | 'map'>('search');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef<LatLng>((target === 'pickup' && booking.pickup) || (target === 'dropoff' && booking.dropoff) || location);
  const [mapCenter, setMapCenter] = useState<LatLng>(initial.current);

  useEffect(() => { if (target) booking.openPicker(target as never); }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (uid) supabase.from('saved_places').select('*').eq('user_id', uid).then(({ data }) => setSaved((data as SavedPlace[]) ?? [])); }, [uid]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 3) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchPlaces(q, location)); } catch { setResults([]); }
      setSearching(false);
    }, 400);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q, location]);

  const onCenterChange = async (c: LatLng) => {
    setCenter(c); setResolving(true);
    const a = await reverseGeocode(c);
    setAddress(a); setResolving(false);
  };
  useEffect(() => { if (mode === 'map' && !address) onCenterChange(initial.current); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (p: Place) => { booking.resolvePicker(p); router.back(); };
  const useMyLocation = async () => {
    const p = (await refresh()) ?? location;
    const a = await reverseGeocode(p);
    choose({ ...p, address: a, name: 'Lokasi saya' });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 6 }}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <Text style={[font.h3, { flex: 1 }]}>{title ?? 'Pilih lokasi'}</Text>
        <Pressable onPress={() => setMode(mode === 'search' ? 'map' : 'search')} style={s.modeBtn}>
          <Ionicons name={mode === 'search' ? 'map-outline' : 'search-outline'} size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{mode === 'search' ? 'Pilih di peta' : 'Cari alamat'}</Text>
        </Pressable>
      </View>

      {mode === 'search' ? (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ padding: 16, backgroundColor: colors.surface }}>
            <Input icon="search" placeholder="Cari nama jalan, tempat, gedung…" value={q} onChangeText={setQ} autoFocus={Platform.OS !== 'web'}
              right={searching ? <ActivityIndicator size="small" color={colors.primary} /> : q ? <Pressable onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable> : null} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 8 }}>
            <PlaceRow icon="locate" color={colors.info} title="Gunakan lokasi saya saat ini" subtitle="GPS perangkat" onPress={useMyLocation} />
            <PlaceRow icon="map" color={colors.primary} title="Pilih titik di peta" subtitle="Geser peta ke lokasi yang tepat" onPress={() => setMode('map')} />
            {results.length > 0 && <Text style={[font.tiny, { marginTop: 8 }]}>HASIL PENCARIAN</Text>}
            {results.map((r, i) => <PlaceRow key={i} icon="location-outline" color={colors.danger} title={r.name ?? r.address} subtitle={r.address} onPress={() => choose(r)} />)}
            {q.length >= 3 && !searching && results.length === 0 && <Text style={[font.small, { padding: 8 }]}>Tidak ditemukan. Coba kata lain atau pilih di peta.</Text>}
            {saved.length > 0 && q.length < 3 && (<>
              <Text style={[font.tiny, { marginTop: 8 }]}>ALAMAT TERSIMPAN</Text>
              {saved.map((sp) => <PlaceRow key={sp.id} icon={sp.label.toLowerCase().includes('rumah') ? 'home' : sp.label.toLowerCase().includes('kantor') ? 'business' : 'bookmark'} color={colors.accent} title={sp.label} subtitle={sp.address} onPress={() => choose({ lat: sp.lat, lng: sp.lng, address: sp.address, name: sp.label })} />)}
            </>)}
          </ScrollView>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <MapView center={mapCenter} zoom={16} onCenterChange={onCenterChange} />
          <CenterPin lifted={resolving} />
          <MapFab icon="locate" onPress={async () => { const p = (await refresh()) ?? location; setMapCenter({ ...p }); onCenterChange(p); }} style={{ right: 16, top: 16 }} color={colors.info} />
          <View style={s.sheet}>
            <Row gap={10}>
              <IconCircle name="location" color={colors.primary} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={font.tiny}>Lokasi terpilih</Text>
                {resolving ? <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} /> : <Text style={{ fontWeight: '600', color: colors.text }} numberOfLines={2}>{address || 'Geser peta…'}</Text>}
              </View>
            </Row>
            <Button title="Pilih lokasi ini" size="lg" style={{ marginTop: 14 }} disabled={resolving || !address} onPress={() => choose({ ...center, address })} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function PlaceRow({ icon, color, title, subtitle, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; title: string; subtitle?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.primaryLight }]}>
      <IconCircle name={icon} color={color} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', color: colors.text }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={font.small} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, height: 52 },
  modeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 28, ...shadow.sheet },
});
