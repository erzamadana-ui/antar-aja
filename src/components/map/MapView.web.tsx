// Peta untuk Web: react-leaflet + tile CARTO (tanpa API key).
import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MARKER_JS_BODY, TILE_ATTR, TILE_URL, type MapProps, type MarkerHtmlFn } from './shared';
import { colors } from '@/lib/theme';

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const markerHtml = new Function('kind', 'heading', 'label', MARKER_JS_BODY) as MarkerHtmlFn;
const iconCache = new Map<string, L.DivIcon>();
function iconFor(kind: string, heading?: number | null, label?: string) {
  const key = `${kind}|${Math.round((heading ?? 0) / 5) * 5}|${label ?? ''}`;
  let ic = iconCache.get(key);
  if (!ic) {
    const spec = markerHtml(kind as never, heading, label);
    ic = L.divIcon({ html: spec.html, className: '', iconSize: spec.size, iconAnchor: spec.anchor });
    iconCache.set(key, ic);
  }
  return ic;
}

function Controller({ center, zoom, fitTo, paddingBottom, onCenterChange, onPress, interactive }: MapProps) {
  const map = useMap();
  const programmatic = useRef(false);
  const lastCenter = useRef(center);
  const applyFit = useRef<() => void>(() => {});

  useEffect(() => {
    applyFit.current = () => {
      programmatic.current = true;
      if (fitTo && fitTo.length > 0) {
        const b = L.latLngBounds(fitTo.map((p) => [p.lat, p.lng] as [number, number]));
        if (fitTo.length === 1) map.setView(b.getCenter(), zoom ?? 16);
        else map.fitBounds(b, { paddingTopLeft: [40, 80], paddingBottomRight: [40, (paddingBottom ?? 0) + 40], maxZoom: 17 });
      }
      setTimeout(() => { programmatic.current = false; }, 300);
    };
    if (fitTo && fitTo.length > 0) applyFit.current();
    else if (center.lat !== lastCenter.current.lat || center.lng !== lastCenter.current.lng) {
      programmatic.current = true;
      map.setView([center.lat, center.lng], zoom ?? map.getZoom());
      setTimeout(() => { programmatic.current = false; }, 300);
    }
    lastCenter.current = center;
  }, [map, center, zoom, fitTo, paddingBottom]);

  useEffect(() => {
    const on = interactive !== false;
    const handlers = [map.dragging, map.touchZoom, map.doubleClickZoom, map.scrollWheelZoom, map.boxZoom, map.keyboard];
    handlers.forEach((h) => (on ? h.enable() : h.disable()));
  }, [map, interactive]);

  useEffect(() => {
    const t = setTimeout(() => { map.invalidateSize(); applyFit.current(); }, 100);
    let lastW = 0, lastH = 0;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect; if (!r) return;
      const grew = (lastW === 0 || lastH === 0) && r.width > 0 && r.height > 0;
      lastW = r.width; lastH = r.height;
      map.invalidateSize();
      if (grew) applyFit.current();  // container tadinya tersembunyi (0x0) → terapkan ulang fitBounds
    });
    ro.observe(map.getContainer());
    return () => { clearTimeout(t); ro.disconnect(); };
  }, [map]);

  useMapEvents({
    moveend: () => { if (programmatic.current) return; const c = map.getCenter(); onCenterChange?.({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }); },
    click: (e) => onPress?.({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

/** Marker yang meluncur halus ke posisi baru (driver/kendaraan), bukan melompat. */
function GlideMarker({ id, lat, lng, kind, heading, label }: { id: string; lat: number; lng: number; kind: string; heading?: number | null; label?: string }) {
  const map = useMap();
  const ref = useRef<L.Marker | null>(null);
  const raf = useRef<number | null>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const mk = L.marker([lat, lng], { icon: iconFor(kind, heading, label), interactive: false }).addTo(map);
    ref.current = mk;
    return () => { if (raf.current) cancelAnimationFrame(raf.current); map.removeLayer(mk); ref.current = null; };
  }, [map, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ref.current?.setIcon(iconFor(kind, heading, label)); }, [kind, heading, label]);
  useEffect(() => {
    const mk = ref.current; if (!mk) return;
    const from = mk.getLatLng(); const to = { lat, lng };
    if (reduce || (from.lat === to.lat && from.lng === to.lng)) { mk.setLatLng([lat, lng]); return; }
    if (raf.current) cancelAnimationFrame(raf.current);
    let t0: number | null = null; const dur = 900;
    const step = (ts: number) => {
      if (t0 === null) t0 = ts;
      const k = Math.min(1, (ts - t0) / dur); const e = 1 - Math.pow(1 - k, 3);
      mk.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e]);
      if (k < 1) raf.current = requestAnimationFrame(step); else raf.current = null;
    };
    raf.current = requestAnimationFrame(step);
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const GLIDE_KINDS = new Set(['motor', 'car', 'driver', 'me']);

export default function MapView(props: MapProps) {
  const { center, zoom = 15, markers = [], polyline, style } = props;
  const initial = useMemo(() => [center.lat, center.lng] as [number, number], []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={[styles.wrap, style]}>
      <MapContainer center={initial} zoom={zoom} zoomControl={false} attributionControl style={{ width: '100%', height: '100%' }}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={19} />
        <Controller {...props} />
        {polyline && polyline.length > 1 && <Polyline positions={polyline} pathOptions={{ color: colors.primary, weight: 5, opacity: 0.9, lineJoin: 'round' }} />}
        {markers.map((m) => GLIDE_KINDS.has(m.kind)
          ? <GlideMarker key={m.id} id={m.id} lat={m.lat} lng={m.lng} kind={m.kind} heading={m.heading} label={m.label} />
          : <Marker key={m.id} position={[m.lat, m.lng]} icon={iconFor(m.kind, m.heading, m.label)} interactive={false} />)}
      </MapContainer>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1, overflow: 'hidden', backgroundColor: colors.border } });
