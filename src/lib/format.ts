import type { OrderStatus, ServiceType, MerchantOrderStatus } from './types';

export const rupiah = (n: number | null | undefined) =>
  'Rp' + Math.round(n ?? 0).toLocaleString('id-ID');

export const km = (n: number | null | undefined) => `${(Number(n) || 0).toFixed(1).replace('.', ',')} km`;

export const minutes = (n: number | null | undefined) => `${Math.max(1, Math.round(n ?? 0))} mnt`;

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

export function formatDate(iso: string, withTime = true): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!withTime) return date;
  return `${date}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export const serviceLabel: Record<ServiceType, string> = {
  ride_motor: 'AntarRide',
  ride_car: 'AntarCar',
  food: 'AntarFood',
  send: 'AntarSend',
  shop: 'AntarShop',
};

export function statusLabel(status: OrderStatus, service: ServiceType, merchantStatus?: MerchantOrderStatus | null): string {
  switch (status) {
    case 'searching': return service === 'food' && merchantStatus === 'pending' ? 'Menunggu merchant & driver' : 'Mencari driver';
    case 'accepted': return service === 'food' ? 'Driver menuju merchant' : service === 'shop' ? 'Driver menuju toko' : 'Driver menuju lokasi jemput';
    case 'arrived': return service === 'food' ? 'Driver di merchant' : service === 'shop' ? 'Driver sedang belanja' : 'Driver sudah tiba';
    case 'in_progress': return service === 'ride_motor' || service === 'ride_car' ? 'Dalam perjalanan' : 'Sedang diantar';
    case 'completed': return 'Selesai';
    case 'cancelled': return 'Dibatalkan';
  }
}

export const merchantStatusLabel: Record<MerchantOrderStatus, string> = {
  pending: 'Menunggu konfirmasi', accepted: 'Sedang disiapkan', ready: 'Siap diambil', rejected: 'Ditolak',
};

export const statusColor = (status: OrderStatus) =>
  status === 'completed' ? '#1FA363' : status === 'cancelled' ? '#E5484D' : status === 'searching' ? '#D97706' : '#2F80ED';

export const initials = (name?: string | null) =>
  (name ?? '?').split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';

export const phoneDisplay = (p?: string | null) => (p ? p.replace(/^\+62/, '0') : '-');
/** Nomor disamarkan (PDP): 0812••••789 — pihak lain tidak melihat nomor lengkap. */
export const phoneMasked = (p?: string | null) => { if (!p) return '—'; const d = p.replace(/^\+62/, '0'); return d.length > 7 ? d.slice(0, 4) + '••••' + d.slice(-3) : '••••'; };
export const extraKindLabel: Record<string, string> = { parking: 'Parkir', toll: 'Tol', waiting: 'Waktu tunggu', other: 'Lainnya' };

// ---- Tahap 4: tiket & keamanan ----
export const ticketStatusLabel: Record<string, string> = { open: 'Terbuka', in_progress: 'Ditangani CS', waiting_user: 'Menunggu Anda', resolved: 'Selesai', closed: 'Ditutup' };
export const ticketStatusColor = (s: string) => s === 'open' ? '#F59E0B' : s === 'in_progress' ? '#3B82F6' : s === 'waiting_user' ? '#8B5CF6' : s === 'resolved' ? '#10B981' : '#94A3B8';
export const ticketPriorityLabel: Record<string, string> = { low: 'Rendah', normal: 'Normal', high: 'Tinggi', urgent: 'Darurat' };
export const ticketPriorityColor = (p: string) => p === 'urgent' ? '#EF4444' : p === 'high' ? '#F97316' : p === 'normal' ? '#3B82F6' : '#94A3B8';
export const ticketCategoryLabel: Record<string, string> = { order: 'Pesanan', payment: 'Pembayaran / Saldo', driver: 'Driver', merchant: 'Merchant', account: 'Akun', app: 'Aplikasi', safety: 'Keamanan', other: 'Lainnya' };
export const roleLabelId: Record<string, string> = { customer: 'Pelanggan', driver: 'Driver', merchant: 'Merchant', admin: 'Admin' };
