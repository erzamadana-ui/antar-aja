// Ekspor CSV dari panel admin: dicatat ke log keamanan (admin.export) lalu diunduh (web) — di native hanya pemberitahuan
import { Platform } from 'react-native';
import { rpc } from '@/lib/supabase';
import { toast } from '@/components/ui';

const cell = (v: unknown) => {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}

/** Catat ekspor ke security_events lalu unduh. `what` = nama data (users/finance/orders). */
export async function adminExportCsv(what: string, filename: string, headers: string[], rows: unknown[][]): Promise<void> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') { toast.show('Ekspor tersedia di versi web'); return; }
  if (!rows.length) { toast.error('Tidak ada data untuk diekspor'); return; }
  try { await rpc('admin_log_event', { p_kind: 'admin.export', p_detail: { what, rows: rows.length, filename } }); }
  catch (e) { toast.error((e as Error).message); return; }
  const blob = new Blob(['﻿' + toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast.success(`${rows.length} baris diekspor · tercatat di log keamanan`);
}
