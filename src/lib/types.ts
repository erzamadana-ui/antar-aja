export type UserRole = 'customer' | 'driver' | 'merchant' | 'admin';
export type VehicleType = 'motor' | 'car' | 'box' | 'pickup';
export type ApprovalStatus = 'pending' | 'approved' | 'suspended' | 'rejected';
export type ServiceType = 'ride_motor' | 'ride_car' | 'food' | 'send' | 'shop' | 'box' | 'travel';
export type Locale = 'id' | 'en' | 'zh' | 'ar';
export interface OrderExtra { id: string; kind: 'parking' | 'toll' | 'waiting' | 'other'; amount: number; note?: string | null; status: 'pending' | 'approved' | 'rejected'; created_at: string; responded_at?: string }
export interface ShoppingItem { name: string; qty: number; note?: string }
export type OrderStatus = 'scheduled' | 'searching' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
export type MerchantOrderStatus = 'pending' | 'accepted' | 'ready' | 'rejected';
export type PaymentMethod = 'cash' | 'wallet';

export interface LatLng { lat: number; lng: number }
export interface Place extends LatLng { address: string; name?: string }

export interface Profile {
  id: string; full_name: string; phone: string | null; email: string | null; avatar_url: string | null;
  role: UserRole; is_active: boolean; created_at: string; locale?: Locale;
  emergency_contact_name?: string | null; emergency_contact_phone?: string | null; status_reason?: string | null;
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
  created_at: string; last_selfie_at?: string | null; last_selfie_url?: string | null;
  vehicle_year?: number | null; vehicle_condition?: 'standar' | 'baik' | 'sangat_baik'; is_electric?: boolean; vehicle_class?: string | null; vehicle_capacity?: string | null; status_reason?: string | null;
  profile?: Profile | null;
}
export interface DriverDocuments { driver_id: string; license_number: string | null; id_card_number: string | null; photo_id_url: string | null; photo_vehicle_url: string | null }
export interface Merchant {
  id: string; owner_id: string | null; name: string; description: string | null; category: string; address: string | null;
  lat: number | null; lng: number | null; image_url: string | null; is_open: boolean; status: ApprovalStatus;
  rating_avg: number; rating_count: number; prep_minutes: number; opening_hours: string | null; created_at: string;
  distance_km?: number; delivery_fee?: number; is_halal?: boolean; halal_verified?: boolean;
}
export interface MerchantDocuments {
  merchant_id: string; owner_phone: string | null; npwp_no: string | null; npwp_url: string | null; license_no: string | null; license_url: string | null;
  halal_cert_no: string | null; halal_cert_url: string | null; owner_id_card_url: string | null; place_photo_url: string | null;
  bank_name: string | null; bank_account: string | null; bank_holder: string | null;
  submitted_at: string; reviewed_at: string | null; reviewed_by: string | null; review_note: string | null;
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
  shopping_list?: ShoppingItem[] | null; est_budget?: number; shop_store?: string | null; receipt_url?: string | null;
  tip?: number; extras?: OrderExtra[]; extras_total?: number; share_token?: string | null;
  city?: string | null; send_scope?: 'in_city' | 'intercity'; dest_city_id?: string | null; warehouse_id?: string | null; origin_warehouse_id?: string | null;
  weight_kg?: number | null; intercity_fare?: number; scheduled_at?: string | null; vehicle_class?: string | null; helpers?: number; purpose?: string | null; paid_via?: string | null;
  cancel_reason: string | null; created_at: string; accepted_at: string | null; arrived_at: string | null; started_at: string | null;
  completed_at: string | null; cancelled_at: string | null;
  // relasi opsional
  driver?: Driver | null; customer?: Profile | null; merchant?: Merchant | null; order_items?: OrderItem[];
}

export interface FareEstimate { distance_km: number; straight_km: number; fare: number; platform_fee: number; total: number; duration_min: number; session?: { name: string; level: 'low' | 'middle' | 'high'; multiplier: number } | null }

export interface Pricing {
  service: ServiceType; base_fare: number; per_km: number; per_min: number; min_fare: number; platform_fee: number;
  commission_pct: number; merchant_commission_pct: number; surge_multiplier: number;
}
export interface Promo {
  code: string; description: string | null; discount_type: 'fixed' | 'percent'; value: number; max_discount: number | null;
  min_total: number; service: ServiceType | null; quota: number | null; used_count: number; valid_from: string | null;
  valid_to: string | null; is_active: boolean; title?: string | null; image_url?: string | null; sort_order?: number;
}
export interface SavedPlace { id: string; user_id: string; label: string; address: string; lat: number; lng: number }

export interface AvailableOrder {
  id: string; code: string; service: ServiceType; pickup_address: string; dropoff_address: string;
  pickup_lat: number; pickup_lng: number; dropoff_lat: number; dropoff_lng: number; distance_km: number;
  fare_delivery: number; items_subtotal: number; total: number; driver_earning: number; payment_method: PaymentMethod;
  merchant_status: MerchantOrderStatus | null; created_at: string; distance_to_pickup_km: number; merchant_name: string | null;
  vehicle_class?: string | null; helpers?: number; scheduled_at?: string | null; send_scope?: string | null;
}

export interface PricingSession { id: string; name: string; level: 'low' | 'middle' | 'high'; days: number[]; start_time: string; end_time: string; multiplier: number; driver_bonus_pct: number; services: ServiceType[] | null; active: boolean; note: string | null }
export interface CompetitorPrice { id: string; competitor: string; service: ServiceType; base_fare: number; per_km: number; min_fare: number; level: 'low' | 'middle' | 'high'; city: string | null; source: string | null; captured_at: string; note: string | null }
export interface Payment { id: string; user_id: string; order_id: string | null; purpose: 'topup' | 'order'; amount: number; method: string; provider: string; status: 'pending' | 'settlement' | 'expire' | 'cancel' | 'deny' | 'failure'; external_id: string | null; snap_token: string | null; redirect_url: string | null; created_at: string }
export interface CallLog { id: string; order_id: string | null; caller_id: string; callee_id: string; status: 'ringing' | 'answered' | 'missed' | 'declined' | 'ended'; started_at: string; answered_at: string | null; ended_at: string | null }

// ---- Tahap 4 ----
export type TicketStatus = 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketCategory = 'order' | 'payment' | 'driver' | 'merchant' | 'account' | 'app' | 'safety' | 'other';
export interface Ticket {
  id: string; code: string; user_id: string; role: UserRole; order_id: string | null; category: TicketCategory; subject: string; description: string | null;
  priority: TicketPriority; status: TicketStatus; assigned_to: string | null; attachments: string[]; last_message_at: string; first_response_at: string | null;
  resolved_at: string | null; closed_at: string | null; rating: number | null; rating_comment: string | null; created_at: string; updated_at: string;
  user?: Profile | null; assignee?: Profile | null; order?: Pick<Order, 'code' | 'service' | 'status'> | null;
}
export interface TicketMessage { id: number; ticket_id: string; sender_id: string | null; sender_role: 'user' | 'cs' | 'system'; body: string; attachment_url: string | null; is_internal: boolean; created_at: string }
export interface AuditLog { id: number; actor_id: string | null; actor_name: string | null; actor_role: UserRole | null; action: string; entity: string; entity_id: string | null; summary: string | null; detail: Record<string, unknown> | null; created_at: string }
export interface SosAlert { id: string; user_id: string; role: UserRole; order_id: string | null; ticket_id: string | null; lat: number | null; lng: number | null; note: string | null; status: 'open' | 'handled' | 'false_alarm'; handled_by: string | null; handled_at: string | null; handle_note: string | null; created_at: string; user?: Profile | null }
export interface FrequentData {
  merchants: { merchant_id: string; name: string; image_url: string | null; category: string; rating_avg: number; is_halal: boolean; halal_verified: boolean; is_open: boolean; count: number; last_at: string }[];
  routes: { service: ServiceType; dropoff_address: string; dropoff_lat: number; dropoff_lng: number; pickup_address: string; pickup_lat: number; pickup_lng: number; shop_store: string | null; count: number; last_at: string }[];
  services: Partial<Record<ServiceType, number>>;
  recent: { address: string; lat: number; lng: number; service: ServiceType }[];
}
export interface SharedOrder {
  code: string; service: ServiceType; status: OrderStatus; created_at: string; started_at: string | null; completed_at: string | null;
  pickup_address: string; pickup_lat: number; pickup_lng: number; dropoff_address: string; dropoff_lat: number; dropoff_lng: number;
  route_geometry: [number, number][] | null; distance_km: number; duration_min: number; customer_name: string;
  driver: { name: string; avatar_url: string | null; plate: string; vehicle_type: VehicleType; vehicle_brand: string | null; vehicle_color: string | null; rating: number; lat: number | null; lng: number | null; heading: number | null } | null;
}

// ---- Tahap 5 ----
export interface VehicleClass { code: string; vehicle: VehicleType; service: ServiceType; label: string; description: string | null; multiplier: number; rank: number; is_ev: boolean; seats: number | null; sort: number; active: boolean }
export interface FareOption { code: string; label: string; description: string | null; is_ev: boolean; seats: number | null; rank: number; multiplier: number; fare: number; total: number; drivers_nearby: number }
export interface FareOptions extends FareEstimate { helpers_fee: number; classes: FareOption[] }
export interface City { id: string; name: string; province: string | null; lat: number | null; lng: number | null; active: boolean }
export interface Warehouse { id: string; city_id: string; name: string; type: 'big' | 'small'; partner_name: string | null; address: string | null; lat: number | null; lng: number | null; phone: string | null; open_hours: string | null; capacity_note: string | null; active: boolean }
export interface IntercityRate { id: string; from_city: string; to_city: string; base_fare: number; per_kg: number; eta_days: number; active: boolean }
export interface IntercityEstimate { base_fare: number; per_kg: number; eta_days: number; weight_kg: number; fare: number }
export interface AppNotification { id: number; user_id: string; kind: 'promo' | 'system' | 'order'; title: string; body: string | null; image_url: string | null; promo_code: string | null; merchant_id: string | null; data: Record<string, unknown> | null; read_at: string | null; created_at: string }
export interface Blast { id: string; admin_id: string | null; title: string; body: string | null; image_url: string | null; promo_code: string | null; merchant_id: string | null; target: 'all' | 'city' | 'active30' | 'customers'; city_id: string | null; sent_count: number; created_at: string }
export interface PaymentPrefs { user_id: string; default_method: 'cash' | 'wallet' | 'ewallet'; ewallet: 'gopay' | 'ovo' | 'dana' | 'shopeepay' | 'qris' | 'bank_transfer' | null }
export interface ExecAccess { user_id: string; level: 'vp' | 'ceo' | 'cfo' | 'shareholder'; active: boolean; last_login_at: string | null }
export interface TrafficStats { months: string[]; cities: { city: string; total: number; series: number[] }[]; services: { service: ServiceType; orders: number; gmv: number; share: number }[]; this_month: { orders: number; gmv: number }; last_month: { orders: number; gmv: number } }
export interface ExecReport {
  level: string; generated_at: string; from: string;
  summary: { gmv: number; orders: number; completed: number; cancelled: number; revenue: number; driver_payout: number; merchant_payout: number; avg_ticket: number; customers: number; cities: number };
  prev_gmv: number;
  monthly: { month: string; gmv: number; orders: number; completed: number; revenue: number; new_users: number; new_drivers: number }[];
  by_service: { service: ServiceType; orders: number; gmv: number }[];
  by_city: { city: string; orders: number; gmv: number; customers: number }[];
  top_merchants: { name: string; orders: number; gmv: number }[];
  supply: { drivers_total: number; drivers_online: number; drivers_pending: number; merchants_total: number; merchants_pending: number; users_total: number; wallet_float: number; wallet_negative: number };
  quality: { cancel_rate: number; avg_driver_rating: number | null; tickets: number; tickets_open: number; avg_first_response_min: number | null; cs_rating: number | null; sos: number };
}
// ---- AntarTravel ----
export interface TravelRoute { id: string; from_city: string; to_city: string; distance_km: number; duration_h: number; seat_price: number; private_price: number; private_price_large: number | null; min_pax: number; active: boolean }
export interface TravelPartner { id: string; company_name: string | null; vehicle_model: string; vehicle_plate: string; vehicle_year: number | null; seats: number; is_electric: boolean; photo_url: string | null; license_url: string | null; permit_url: string | null; status: ApprovalStatus; status_reason: string | null; rating_avg: number; rating_count: number; total_trips: number; created_at: string; profile?: Profile | null }
export type TravelTripStatus = 'open' | 'confirmed' | 'full' | 'departed' | 'arrived' | 'cancelled';
export interface TravelTrip { id: string; partner_id: string; route_id: string; depart_at: string; seats_total: number; seats_booked: number; min_pax: number; seat_price: number; private_price: number; allow_private: boolean; is_private: boolean; status: TravelTripStatus; notes: string | null; created_at: string; route?: TravelRoute | null }
export interface TravelSearchTrip { id: string; depart_at: string; seats_total: number; seats_booked: number; seats_left: number; min_pax: number; seat_price: number; private_price: number; allow_private: boolean; status: TravelTripStatus; notes: string | null; partner: { id: string; company: string | null; model: string; plate: string; seats: number; is_electric: boolean; photo_url: string | null; rating: number; rating_count: number; total_trips: number; name: string; avatar_url: string | null } }
export interface TravelSearch { route: TravelRoute | null; trips: TravelSearchTrip[] }
export type TravelBookingStatus = 'booked' | 'confirmed' | 'picked_up' | 'completed' | 'cancelled';
export interface TravelBooking { id: string; code: string; trip_id: string; customer_id: string; pax: number; is_private: boolean; pickup_address: string; pickup_lat: number | null; pickup_lng: number | null; dropoff_address: string | null; passengers: { name: string; phone?: string }[]; price: number; platform_fee: number; partner_earning: number; payment_method: PaymentMethod; paid_via: string | null; payment_status: 'unpaid' | 'paid' | 'refunded'; status: TravelBookingStatus; notes: string | null; rating: number | null; created_at: string; trip?: TravelTrip | null }
export interface TravelManifestRow { id: string; code: string; pax: number; is_private: boolean; pickup_address: string; pickup_lat: number | null; pickup_lng: number | null; dropoff_address: string | null; passengers: { name: string }[]; price: number; payment_method: PaymentMethod; payment_status: string; status: TravelBookingStatus; notes: string | null; customer: { id: string; name: string; avatar_url: string | null } }
