import type { ServiceType } from './types';
import { colors } from './theme';

export interface ServiceDef {
  id: ServiceType | 'pay';
  label: string;
  tagline: string;
  icon: string; // nama ikon Ionicons
  color: string;
  route: string;
}

export const SERVICES: ServiceDef[] = [
  { id: 'ride_motor', label: 'AntarRide', tagline: 'Ojek motor cepat & hemat', icon: 'bicycle', color: colors.ride, route: '/ride?service=ride_motor' },
  { id: 'ride_car', label: 'AntarCar', tagline: 'Mobil nyaman untuk keluarga', icon: 'car-sport', color: colors.car, route: '/ride?service=ride_car' },
  { id: 'food', label: 'AntarFood', tagline: 'Makanan favorit diantar', icon: 'restaurant', color: colors.food, route: '/food' },
  { id: 'send', label: 'AntarSend', tagline: 'Kirim paket dalam kota', icon: 'cube', color: colors.send, route: '/send' },
  { id: 'pay', label: 'AntarPay', tagline: 'Saldo & top up', icon: 'wallet', color: colors.pay, route: '/(customer)/pay' },
];

export const serviceDef = (id: ServiceType) => SERVICES.find((s) => s.id === id)!;

// Pusat kota default saat GPS belum tersedia (Padang, Sumatera Barat)
export const DEFAULT_CENTER = { lat: -0.9471, lng: 100.4172 };
