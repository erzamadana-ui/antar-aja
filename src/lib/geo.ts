// Layanan geo tanpa API key (Photon/Nominatim untuk pencarian, OSRM untuk rute).
// Jika EXPO_PUBLIC_GOOGLE_MAPS_KEY diisi, pencarian & rute otomatis memakai Google.
import type { LatLng, Place } from './types';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';
const UA = 'AntarAja/1.0 (support@antaraja.id)';

const cache = new Map<string, unknown>();
async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json', 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as T;
    cache.set(url, json);
    return json;
  } finally {
    clearTimeout(t);
  }
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x = Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ---------- Pencarian tempat ----------
export async function searchPlaces(q: string, near?: LatLng): Promise<Place[]> {
  const query = q.trim();
  if (query.length < 3) return [];
  if (GOOGLE_KEY) { try { return await googleSearch(query, near); } catch { /* CORS di web → fallback OSM */ } }
  try {
    return await photonSearch(query, near);
  } catch {
    try { return await nominatimSearch(query, near); } catch { return []; }
  }
}

async function photonSearch(q: string, near?: LatLng): Promise<Place[]> {
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : '';
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en${bias}`;
  const json = await getJson<{ features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] }>(url);
  const out = json.features
    .filter((f) => !f.properties.countrycode || f.properties.countrycode === 'ID')
    .map((f) => {
      const p = f.properties;
      const parts = [p.street && p.housenumber ? `${p.street} ${p.housenumber}` : p.street, p.district, p.city || p.county, p.state].filter(Boolean);
      const name = p.name || parts[0] || q;
      return { name, address: uniq([name, ...parts]).join(', '), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
    });
  if (out.length === 0) throw new Error('empty');
  return out;
}

async function nominatimSearch(q: string, near?: LatLng): Promise<Place[]> {
  const vb = near ? `&viewbox=${near.lng - 0.5},${near.lat + 0.5},${near.lng + 0.5},${near.lat - 0.5}` : '';
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&countrycodes=id&limit=8&addressdetails=1${vb}`;
  const json = await getJson<{ display_name: string; lat: string; lon: string; name?: string }[]>(url);
  return json.map((r) => ({ name: r.name || r.display_name.split(',')[0], address: shortAddress(r.display_name), lat: +r.lat, lng: +r.lon }));
}

async function googleSearch(q: string, near?: LatLng): Promise<Place[]> {
  const loc = near ? `&location=${near.lat},${near.lng}&radius=30000` : '';
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&region=id&language=id${loc}&key=${GOOGLE_KEY}`;
  const json = await getJson<{ results: { name: string; formatted_address: string; geometry: { location: { lat: number; lng: number } } }[] }>(url);
  return json.results.slice(0, 8).map((r) => ({ name: r.name, address: r.formatted_address, lat: r.geometry.location.lat, lng: r.geometry.location.lng }));
}

// ---------- Reverse geocode ----------
export async function reverseGeocode(p: LatLng): Promise<string> {
  try {
    if (GOOGLE_KEY) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${p.lat},${p.lng}&language=id&key=${GOOGLE_KEY}`;
      const json = await getJson<{ results: { formatted_address: string }[] }>(url);
      return json.results[0]?.formatted_address ?? fallbackLabel(p);
    }
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${p.lat}&lon=${p.lng}&format=jsonv2&zoom=18&addressdetails=1`;
    const json = await getJson<{ display_name?: string; name?: string; address?: Record<string, string> }>(url);
    const a = json.address ?? {};
    const parts = uniq([json.name, a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}` : '', a.neighbourhood || a.suburb || a.village, a.city_district, a.city || a.town || a.county].filter(Boolean) as string[]);
    return parts.length ? parts.join(', ') : json.display_name ? shortAddress(json.display_name) : fallbackLabel(p);
  } catch {
    return fallbackLabel(p);
  }
}

// ---------- Rute ----------
export interface RouteResult { distance_km: number; duration_min: number; coords: [number, number][]; estimated: boolean }

export async function getRoute(a: LatLng, b: LatLng): Promise<RouteResult> {
  try {
    if (GOOGLE_KEY) return await googleRoute(a, b);
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const json = await getJson<{ routes: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] }>(url, 7000);
    const r = json.routes[0];
    if (!r) throw new Error('no route');
    return {
      distance_km: Math.round((r.distance / 1000) * 100) / 100,
      duration_min: Math.max(2, Math.round(r.duration / 60 * 1.15)), // koreksi lalu lintas kota
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      estimated: false,
    };
  } catch {
    const d = haversineKm(a, b) * 1.3;
    return { distance_km: Math.round(d * 100) / 100, duration_min: Math.max(3, Math.round((d / 25) * 60)), coords: [[a.lat, a.lng], [b.lat, b.lng]], estimated: true };
  }
}

async function googleRoute(a: LatLng, b: LatLng): Promise<RouteResult> {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&mode=driving&key=${GOOGLE_KEY}`;
  const json = await getJson<{ routes: { legs: { distance: { value: number }; duration: { value: number } }[]; overview_polyline: { points: string } }[] }>(url);
  const r = json.routes[0];
  if (!r) throw new Error('no route');
  const leg = r.legs[0];
  return { distance_km: Math.round((leg.distance.value / 1000) * 100) / 100, duration_min: Math.round(leg.duration.value / 60), coords: decodePolyline(r.overview_polyline.points), estimated: false };
}

function decodePolyline(str: string): [number, number][] {
  let index = 0, lat = 0, lng = 0; const out: [number, number][] = [];
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1; shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

const uniq = (arr: (string | undefined)[]) => Array.from(new Set(arr.filter(Boolean) as string[]));
const shortAddress = (s: string) => s.split(',').map((x) => x.trim()).filter((x) => !/^\d{5}$/.test(x) && x !== 'Indonesia').slice(0, 4).join(', ');
const fallbackLabel = (p: LatLng) => `Titik peta (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`;
