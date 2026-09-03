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
};

export function statusLabel(status: OrderStatus, service: ServiceType, merchantStatus?: MerchantOrderStatus | null): string {
  switch (status) {
    case 'searching': return service === 'food' && merchantStatus === 'pending' ? 'Menunggu merchant & driver' : 'Mencari driver';
    case 'accepted': return service === 'food' ? 'Driver menuju merchant' : 'Driver menuju lokasi jemput';
    case 'arrived': return service === 'food' ? 'Driver di merchant' : 'Driver sudah tiba';
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
