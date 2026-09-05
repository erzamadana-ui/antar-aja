// Helper bersama layar pedagang pasar: muat barang + harga acuan, rincian skor kualitas (cermin market_vendor_quality di SQL)
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { MarketVendor, MarketVendorItem, VendorGrade } from '@/lib/types';

export const COEF_MIN = 0.6;
export const COEF_MAX = 1.25;
export const COEF_HARD = 1.6;
export const FRESH_DAYS = 3;
export const QUALITY_MIN = 60;

export const GRADE_INFO: Record<VendorGrade, { label: string; color: string; desc: string }> = {
  A: { label: 'Grade A', color: colors.success, desc: 'Paling segar / pilihan terbaik, ukuran seragam' },
  B: { label: 'Grade B', color: colors.primary, desc: 'Kualitas standar pasar, layak konsumsi harian' },
  C: { label: 'Grade C', color: colors.textMuted, desc: 'Ekonomis: ukuran kecil / campur, harga lebih murah' },
};

export const isFresh = (iso: string) => Date.now() - new Date(iso).getTime() < FRESH_DAYS * 86400000;
export const inBand = (it: MarketVendorItem) => it.item_id == null || it.ref_price == null || !it.ref_price || (it.price >= it.ref_price * COEF_MIN && it.price <= it.ref_price * COEF_MAX);

/** Barang pedagang (aktif) + ref_price dari market_items. */
export async function loadVendorItems(uid: string): Promise<MarketVendorItem[]> {
  const { data, error } = await supabase.from('market_vendor_items').select('*').eq('vendor_id', uid).eq('active', true).order('category').order('name');
  if (error) throw new Error(error.message);
  const items = (data as MarketVendorItem[]) ?? [];
  const ids = Array.from(new Set(items.map((i) => i.item_id).filter(Boolean))) as string[];
  if (ids.length === 0) return items;
  const { data: refs } = await supabase.from('market_items').select('id, ref_price').in('id', ids);
  const map = new Map<string, number>((refs ?? []).map((r: { id: string; ref_price: number }) => [r.id, r.ref_price]));
  return items.map((i) => ({ ...i, ref_price: i.item_id ? map.get(i.item_id) ?? null : null }));
}

export type ScorePart = { key: string; label: string; got: number; max: number; hint: string };
export function scoreBreakdown(v: MarketVendor, items: MarketVendorItem[]): ScorePart[] {
  const n = items.length;
  const photo = items.filter((i) => !!i.photo_url).length;
  const fresh = items.filter((i) => isFresh(i.updated_at)).length;
  const band = items.filter(inBand).length;
  const ratio = (x: number) => (n > 0 ? x / n : 0);
  return [
    { key: 'photo', label: 'Foto lapak', got: v.photo_url ? 15 : 0, max: 15, hint: 'Unggah foto lapak tampak depan' },
    { key: 'ktp', label: 'KTP pemilik', got: v.id_card_url ? 10 : 0, max: 10, hint: 'Unggah foto KTP' },
    { key: 'card', label: 'Kartu pedagang', got: v.market_card_url ? 5 : 0, max: 5, hint: 'Unggah kartu pedagang / bukti sewa lapak' },
    { key: 'phone', label: 'Nomor telepon', got: v.phone ? 5 : 0, max: 5, hint: 'Isi nomor telepon aktif' },
    { key: 'iphoto', label: 'Foto barang', got: Math.round(20 * ratio(photo) * 10) / 10, max: 20, hint: n ? `${photo}/${n} barang berfoto` : 'Tambahkan barang berfoto' },
    { key: 'fresh', label: `Harga diperbarui ≤${FRESH_DAYS} hari`, got: Math.round(20 * ratio(fresh) * 10) / 10, max: 20, hint: n ? `${fresh}/${n} barang segar harganya` : 'Tambahkan barang & perbarui rutin' },
    { key: 'band', label: 'Harga dalam batas wajar', got: Math.round(15 * ratio(band) * 10) / 10, max: 15, hint: n ? `${band}/${n} barang ≤${COEF_MAX}× acuan` : 'Ikuti harga acuan pasar' },
    { key: 'rating', label: 'Rating pelanggan', got: v.rating_count > 0 ? Math.min(10, Math.round(Number(v.rating_avg) * 20) / 10) : 5, max: 10, hint: v.rating_count > 0 ? `${Number(v.rating_avg).toFixed(1)} dari ${v.rating_count} ulasan` : 'Nilai awal 5, naik seiring ulasan' },
  ];
}

export const qualityColor = (n: number) => (n >= 85 ? colors.success : n >= QUALITY_MIN ? colors.primary : colors.warning);
