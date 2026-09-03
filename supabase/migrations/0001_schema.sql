-- =====================================================================
-- Antar Aja — Skema inti (Supabase / Postgres 17 + PostGIS)
-- =====================================================================
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------- ENUM ----------
create type user_role as enum ('customer', 'driver', 'merchant', 'admin');
create type vehicle_type as enum ('motor', 'car');
create type approval_status as enum ('pending', 'approved', 'suspended', 'rejected');
create type service_type as enum ('ride_motor', 'ride_car', 'food', 'send');
create type order_status as enum (
  'searching',      -- mencari driver
  'accepted',       -- driver ditemukan, menuju titik jemput
  'arrived',        -- driver sampai di titik jemput / merchant
  'in_progress',    -- perjalanan / pengantaran berlangsung
  'completed',
  'cancelled'
);
create type merchant_order_status as enum ('pending', 'accepted', 'ready', 'rejected');
create type payment_method as enum ('cash', 'wallet');
create type payment_status as enum ('unpaid', 'paid', 'refunded');
create type wallet_tx_type as enum ('topup', 'payment', 'earning', 'refund', 'withdrawal', 'fee', 'adjustment');
create type topup_status as enum ('pending', 'approved', 'rejected');

-- ---------- PROFILES ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  email text,
  avatar_url text,
  role user_role not null default 'customer',
  is_active boolean not null default true,
  push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- WALLETS ----------
create table wallets (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= -500000), -- driver boleh minus (deposit) s.d. -500rb
  updated_at timestamptz not null default now()
);

create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type wallet_tx_type not null,
  amount bigint not null,            -- positif = masuk, negatif = keluar
  balance_after bigint not null,
  order_id uuid,
  ref text,
  note text,
  created_at timestamptz not null default now()
);
create index on wallet_transactions(user_id, created_at desc);

create table topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount bigint not null check (amount >= 10000 and amount <= 10000000),
  method text not null default 'bank_transfer',
  proof_url text,
  sender_note text,
  status topup_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index on topup_requests(status, created_at desc);

-- ---------- DRIVERS ----------
create table drivers (
  id uuid primary key references profiles(id) on delete cascade,
  vehicle_type vehicle_type not null default 'motor',
  vehicle_brand text,
  vehicle_plate text not null,
  vehicle_color text,
  license_number text,          -- nomor SIM
  id_card_number text,          -- NIK (hanya admin yang bisa lihat via RLS)
  photo_id_url text,
  photo_vehicle_url text,
  status approval_status not null default 'pending',
  is_online boolean not null default false,
  location geography(point, 4326),
  heading real,
  last_seen_at timestamptz,
  rating_avg numeric(3,2) not null default 5.00,
  rating_count int not null default 0,
  total_trips int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index drivers_location_idx on drivers using gist(location);
create index drivers_online_idx on drivers(is_online, status);

-- ---------- MERCHANTS ----------
create table merchants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  name text not null,
  description text,
  category text not null default 'Makanan',
  address text,
  location geography(point, 4326),
  image_url text,
  is_open boolean not null default true,
  status approval_status not null default 'pending',
  rating_avg numeric(3,2) not null default 5.00,
  rating_count int not null default 0,
  prep_minutes int not null default 15,
  opening_hours text default '08:00-22:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index merchants_location_idx on merchants using gist(location);
create index merchants_owner_idx on merchants(owner_id);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name text not null,
  description text,
  price bigint not null check (price >= 0),
  image_url text,
  category text default 'Menu',
  is_available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index menu_items_merchant_idx on menu_items(merchant_id);

-- ---------- PRICING ----------
create table pricing (
  service service_type primary key,
  base_fare bigint not null default 0,
  per_km bigint not null,
  per_min bigint not null default 0,
  min_fare bigint not null,
  platform_fee bigint not null default 1000,
  commission_pct numeric(5,2) not null default 20.00,  -- potongan platform dari tarif driver
  merchant_commission_pct numeric(5,2) not null default 15.00,
  surge_multiplier numeric(4,2) not null default 1.00,
  updated_at timestamptz not null default now()
);

create table promos (
  code text primary key,
  description text,
  discount_type text not null default 'fixed' check (discount_type in ('fixed','percent')),
  value bigint not null,
  max_discount bigint,
  min_total bigint not null default 0,
  service service_type,
  quota int,
  used_count int not null default 0,
  valid_from timestamptz default now(),
  valid_to timestamptz,
  is_active boolean not null default true
);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- ORDERS ----------
create sequence order_code_seq;

create table orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('AA' || to_char(now(), 'YYMMDD') || lpad(nextval('order_code_seq')::text, 5, '0')),
  service service_type not null,
  customer_id uuid not null references profiles(id),
  driver_id uuid references drivers(id),
  merchant_id uuid references merchants(id),
  status order_status not null default 'searching',
  merchant_status merchant_order_status,
  pickup_address text not null,
  pickup_location geography(point, 4326) not null,
  dropoff_address text not null,
  dropoff_location geography(point, 4326) not null,
  distance_km numeric(8,2) not null default 0,
  duration_min int not null default 0,
  route_geometry jsonb,                 -- array [[lat,lng],...]
  fare_delivery bigint not null default 0,   -- tarif perjalanan/antar (bagian driver)
  items_subtotal bigint not null default 0,  -- makanan
  platform_fee bigint not null default 0,
  discount bigint not null default 0,
  promo_code text,
  total bigint not null default 0,
  driver_earning bigint not null default 0,
  merchant_earning bigint not null default 0,
  payment_method payment_method not null default 'cash',
  payment_status payment_status not null default 'unpaid',
  notes text,
  recipient_name text,
  recipient_phone text,
  package_details jsonb,                -- {type, weight, description}
  cancel_reason text,
  cancelled_by uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on orders(customer_id, created_at desc);
create index orders_driver_idx on orders(driver_id, created_at desc);
create index orders_merchant_idx on orders(merchant_id, created_at desc);
create index orders_status_idx on orders(status) where status in ('searching','accepted','arrived','in_progress');
create index orders_pickup_idx on orders using gist(pickup_location);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id),
  name text not null,
  price bigint not null,
  qty int not null check (qty > 0),
  notes text
);
create index order_items_order_idx on order_items(order_id);

create table order_events (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on order_events(order_id, created_at);

create table order_messages (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index order_messages_order_idx on order_messages(order_id, created_at);

create table ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  rater_id uuid not null references profiles(id),
  ratee_id uuid not null,               -- driver id atau merchant id
  ratee_kind text not null check (ratee_kind in ('driver','merchant')),
  stars int not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (order_id, rater_id, ratee_kind)
);

create table saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);
create index saved_places_user_idx on saved_places(user_id);

-- ---------- updated_at trigger ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_profiles_upd before update on profiles for each row execute function set_updated_at();
create trigger t_drivers_upd before update on drivers for each row execute function set_updated_at();
create trigger t_merchants_upd before update on merchants for each row execute function set_updated_at();
create trigger t_orders_upd before update on orders for each row execute function set_updated_at();
create trigger t_wallets_upd before update on wallets for each row execute function set_updated_at();

-- ---------- Auto profile + wallet saat user daftar ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
    new.raw_user_meta_data->>'phone',
    new.email
  );
  insert into public.wallets (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Auto-konfirmasi email (MVP: tanpa SMTP). Matikan trigger ini jika sudah pakai verifikasi email sungguhan.
create or replace function auto_confirm_email() returns trigger
language plpgsql security definer as $$
begin
  if new.email_confirmed_at is null then new.email_confirmed_at = now(); end if;
  return new;
end $$;
create trigger on_auth_user_autoconfirm before insert on auth.users
  for each row execute function auto_confirm_email();

-- ---------- Seed tarif (acuan Zona I Sumatra: Kepmenhub KP 667/2022 + praktik Gojek 2026) ----------
insert into pricing (service, base_fare, per_km, per_min, min_fare, platform_fee, commission_pct, merchant_commission_pct) values
  ('ride_motor', 0, 2300, 0, 9000, 1000, 20, 0),
  ('ride_car',   0, 4500, 0, 12000, 4000, 20, 0),
  ('food',       0, 2300, 0, 9000, 1000, 20, 15),
  ('send',       0, 2300, 0, 9000, 1000, 20, 0);

insert into app_settings (key, value) values
  ('search_radius_km', '5'),
  ('max_route_ratio', '2.5'),
  ('bank_account', '{"bank":"BCA","number":"1234567890","name":"PT Antar Aja Indonesia"}'),
  ('app_name', '"Antar Aja"'),
  ('support_phone', '"+6281234567890"');
