export type UserRole = 'customer' | 'driver' | 'merchant' | 'admin';
export type VehicleType = 'motor' | 'car';
export type ApprovalStatus = 'pending' | 'approved' | 'suspended' | 'rejected';
export type ServiceType = 'ride_motor' | 'ride_car' | 'food' | 'send';
export type OrderStatus = 'searching' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
export type MerchantOrderStatus = 'pending' | 'accepted' | 'ready' | 'rejected';
export type PaymentMethod = 'cash' | 'wallet';

export interface LatLng { lat: number; lng: number }
export interface Place extends LatLng { address: string; name?: string }

export interface Profile {
  id: string; full_name: string; phone: string | null; email: string | null; avatar_url: string | null;
  role: UserRole; is_active: boolean; created_at: string;
}
export interface Wallet { user_id: string; balance: number; updated_at: string }
export interface WalletTx {
  id: string; user_id: string; type: 'topup' | 'payment' | 'earning' | 'refund' | 'withdrawal' | 'fee' | 'adjustment';
  amount: number; balance_after: number; order_id: string | null; note: string | null; created_at: string;
}
export interface TopupRequest {
  id: string; user_id: string; amount: number; method: string; proof_url: string | null; sender_note: string | null;
  status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string; reviewed_at: string | null;
}
export interface WithdrawalRequest {
  id: string; user_id: string; amount: number; bank_name: string; bank_account: string; account_name: string;
  status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string;
}
export interface Driver {
  id: string; vehicle_type: VehicleType; vehicle_brand: string | null; vehicle_plate: string; vehicle_color: string | null;
  status: ApprovalStatus; is_online: boolean; lat: number | null; lng: number | null;
  heading: number | null; last_seen_at: string | null; rating_avg: number; rating_count: number; total_trips: number;
  created_at: string;
  profile?: Profile | null;
}
export interface DriverDocuments { driver_id: string; license_number: string | null; id_card_number: string | null; photo_id_url: string | null; photo_vehicle_url: string | null }
export interface Merchant {
  id: string; owner_id: string | null; name: string; description: string | null; category: string; address: string | null;
  lat: number | null; lng: number | null; image_url: string | null; is_open: boolean; status: ApprovalStatus;
  rating_avg: number; rating_count: number; prep_minutes: number; opening_hours: string | null; created_at: string;
  distance_km?: number; delivery_fee?: number;
}
export interface MenuItem {
  id: string; merchant_id: string; name: string; description: string | null; price: number; image_url: string | null;
  category: string | null; is_available: boolean; sort_order: number;
}
export interface OrderItem { id: string; order_id: string; menu_item_id: string | null; name: string; price: number; qty: number; notes: string | null }
export interface OrderEvent { id: number; order_id: string; status: string; actor_id: string | null; note: string | null; created_at: string }
export interface OrderMessage { id: number; order_id: string; sender_id: string; body: string; created_at: string }

export interface Order {
  id: string; code: string; service: ServiceType; customer_id: string; driver_id: string | null; merchant_id: string | null;
  status: OrderStatus; merchant_status: MerchantOrderStatus | null;
  pickup_address: string; pickup_lat: number; pickup_lng: number; dropoff_address: string; dropoff_lat: number; dropoff_lng: number;
  distance_km: number; duration_min: number; route_geometry: [number, number][] | null;
  fare_delivery: number; items_subtotal: number; platform_fee: number; discount: number; promo_code: string | null; total: number;
  driver_earning: number; merchant_earning: number; payment_method: PaymentMethod; payment_status: 'unpaid' | 'paid' | 'refunded';
  notes: string | null; recipient_name: string | null; recipient_phone: string | null;
  package_details: { type?: string; weight?: string; description?: string } | null;
  cancel_reason: string | null; created_at: string; accepted_at: string | null; arrived_at: string | null; started_at: string | null;
  completed_at: string | null; cancelled_at: string | null;
  // relasi opsional
  driver?: Driver | null; customer?: Profile | null; merchant?: Merchant | null; order_items?: OrderItem[];
}

export interface FareEstimate { distance_km: number; straight_km: number; fare: number; platform_fee: number; total: number; duration_min: number }

export interface Pricing {
  service: ServiceType; base_fare: number; per_km: number; per_min: number; min_fare: number; platform_fee: number;
  commission_pct: number; merchant_commission_pct: number; surge_multiplier: number;
}
export interface Promo {
  code: string; description: string | null; discount_type: 'fixed' | 'percent'; value: number; max_discount: number | null;
  min_total: number; service: ServiceType | null; quota: number | null; used_count: number; valid_from: string | null;
  valid_to: string | null; is_active: boolean;
}
export interface SavedPlace { id: string; user_id: string; label: string; address: string; lat: number; lng: number }

export interface AvailableOrder {
  id: string; code: string; service: ServiceType; pickup_address: string; dropoff_address: string;
  pickup_lat: number; pickup_lng: number; dropoff_lat: number; dropoff_lng: number; distance_km: number;
  fare_delivery: number; items_subtotal: number; total: number; driver_earning: number; payment_method: PaymentMethod;
  merchant_status: MerchantOrderStatus | null; created_at: string; distance_to_pickup_km: number; merchant_name: string | null;
}
