-- =====================================================================
-- Antar Aja — Tahap 5
--  A. Kota, gudang mitra (warehouse), tarif antar kota (AntarSend antar kota)
--  B. Kelas kendaraan (tahun/kondisi/listrik) & tarif per kelas; AntarBox (mobil box / pick up, pindahan)
--  C. Booking terjadwal (order status 'scheduled' → otomatis dicari driver menjelang jadwal)
--  D. Notifikasi & blast promo satu arah (admin → pelanggan)
--  E. Preferensi metode pembayaran (e-wallet pilihan) + paid_via pada order
--  F. Suspend/aktifkan dengan alasan (tersimpan di log)
--  G. Akses eksekutif (login kedua: PIN, level VP/CEO/CFO/pemegang saham) + laporan eksekutif
--  H. Statistik trafik per kota bulanan untuk dashboard admin
-- =====================================================================

-- ---------- A. Kota & gudang ----------
create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  province text,
  location geography(point, 4326),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities(id) on delete cascade,
  name text not null,
  type text not null default 'small' check (type in ('big','small')),   -- gudang besar / gudang kecil (mitra)
  partner_name text,
  address text,
  location geography(point, 4326),
  phone text,
  open_hours text default '08:00-20:00',
  capacity_note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table warehouses add column if not exists lat double precision generated always as (st_y(location::geometry)) stored;
alter table warehouses add column if not exists lng double precision generated always as (st_x(location::geometry)) stored;
alter table cities add column if not exists lat double precision generated always as (st_y(location::geometry)) stored;
alter table cities add column if not exists lng double precision generated always as (st_x(location::geometry)) stored;
create table if not exists intercity_rates (
  id uuid primary key default gen_random_uuid(),
  from_city uuid not null references cities(id) on delete cascade,
  to_city uuid not null references cities(id) on delete cascade,
  base_fare bigint not null default 15000,
  per_kg bigint not null default 8000,
  eta_days int not null default 2,
  active boolean not null default true,
  unique (from_city, to_city)
);
alter table cities enable row level security; alter table warehouses enable row level security; alter table intercity_rates enable row level security;
create policy cities_select on cities for select to anon, authenticated using (true);
create policy cities_admin on cities for all to authenticated using (is_admin()) with check (is_admin());
create policy wh_select on warehouses for select to anon, authenticated using (active or is_admin());
create policy wh_admin on warehouses for all to authenticated using (is_admin()) with check (is_admin());
create policy icr_select on intercity_rates for select to anon, authenticated using (true);
create policy icr_admin on intercity_rates for all to authenticated using (is_admin()) with check (is_admin());
grant select on cities, warehouses, intercity_rates to anon, authenticated;
grant insert, update, delete on cities, warehouses, intercity_rates to authenticated;

insert into cities (name, province, location) values
  ('Padang', 'Sumatera Barat', st_setsrid(st_makepoint(100.3543, -0.9471), 4326)),
  ('Bukittinggi', 'Sumatera Barat', st_setsrid(st_makepoint(100.3691, -0.3055), 4326)),
  ('Pekanbaru', 'Riau', st_setsrid(st_makepoint(101.4478, 0.5071), 4326)),
  ('Dumai', 'Riau', st_setsrid(st_makepoint(101.4453, 1.6667), 4326)),
  ('Batam', 'Kepulauan Riau', st_setsrid(st_makepoint(104.0305, 1.0456), 4326)),
  ('Jambi', 'Jambi', st_setsrid(st_makepoint(103.6131, -1.6101), 4326)),
  ('Medan', 'Sumatera Utara', st_setsrid(st_makepoint(98.6722, 3.5952), 4326)),
  ('Palembang', 'Sumatera Selatan', st_setsrid(st_makepoint(104.7458, -2.9761), 4326)),
  ('Jakarta', 'DKI Jakarta', st_setsrid(st_makepoint(106.8456, -6.2088), 4326))
on conflict (name) do nothing;
insert into warehouses (city_id, name, type, partner_name, address, location, phone)
select c.id, w.name, w.type, w.partner, w.address, st_setsrid(st_makepoint(w.lng, w.lat), 4326), w.phone from (values
  ('Padang', 'Gudang Besar Antar Aja Padang', 'big', 'Antar Aja Logistik', 'Jl. By Pass KM 12, Padang', 100.4021, -0.9153, '+6281100000001'),
  ('Padang', 'Drop Point Ulak Karang', 'small', 'Toko Sinar Ulak Karang', 'Jl. S. Parman No. 88, Padang', 100.3540, -0.9150, '+6281100000002'),
  ('Bukittinggi', 'Drop Point Aur Kuning', 'small', 'Ekspedisi Aur Kuning', 'Jl. By Pass Aur Kuning, Bukittinggi', 100.3760, -0.3160, '+6281100000003'),
  ('Pekanbaru', 'Gudang Besar Antar Aja Pekanbaru', 'big', 'Antar Aja Logistik', 'Jl. Soekarno-Hatta, Pekanbaru', 101.4210, 0.4790, '+6281100000004'),
  ('Pekanbaru', 'Drop Point Panam', 'small', 'Mitra Panam Express', 'Jl. HR Soebrantas, Panam, Pekanbaru', 101.3720, 0.4650, '+6281100000005'),
  ('Dumai', 'Drop Point Dumai Kota', 'small', 'Toko Berkah Dumai', 'Jl. Sudirman, Dumai', 101.4500, 1.6650, '+6281100000006'),
  ('Batam', 'Gudang Besar Antar Aja Batam', 'big', 'Antar Aja Logistik', 'Batam Centre, Batam', 104.0500, 1.1300, '+6281100000007'),
  ('Jambi', 'Drop Point Jambi', 'small', 'Mitra Jambi Kargo', 'Jl. Sultan Thaha, Jambi', 103.6100, -1.6000, '+6281100000008'),
  ('Medan', 'Gudang Besar Antar Aja Medan', 'big', 'Antar Aja Logistik', 'Jl. Gatot Subroto, Medan', 98.6500, 3.5900, '+6281100000009')
) as w(city, name, type, partner, address, lng, lat, phone) join cities c on c.name = w.city
where not exists (select 1 from warehouses x where x.name = w.name);
insert into intercity_rates (from_city, to_city, base_fare, per_kg, eta_days)
select a.id, b.id,
  case when a.province = b.province then 12000 else 20000 end,
  case when a.province = b.province then 5000 when b.name in ('Jakarta','Medan','Palembang') or a.name in ('Jakarta','Medan','Palembang') then 12000 else 8000 end,
  case when a.province = b.province then 1 when b.name = 'Jakarta' or a.name = 'Jakarta' then 3 else 2 end
from cities a cross join cities b where a.id <> b.id
on conflict do nothing;

create or replace function nearest_city(p_lat double precision, p_lng double precision, p_max_km numeric default 60)
returns uuid language sql stable security definer set search_path = public as $$
  select id from cities where active and location is not null
    and st_dwithin(location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_max_km * 1000)
  order by st_distance(location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) limit 1
$$;

alter table orders
  add column if not exists city_id uuid references cities(id) on delete set null,
  add column if not exists city text,
  add column if not exists send_scope text not null default 'in_city' check (send_scope in ('in_city','intercity')),
  add column if not exists dest_city_id uuid references cities(id) on delete set null,
  add column if not exists warehouse_id uuid references warehouses(id) on delete set null,
  add column if not exists origin_warehouse_id uuid references warehouses(id) on delete set null,
  add column if not exists weight_kg numeric(6,2),
  add column if not exists intercity_fare bigint not null default 0,
  add column if not exists scheduled_at timestamptz,
  add column if not exists vehicle_class text,
  add column if not exists helpers int not null default 0,
  add column if not exists purpose text,
  add column if not exists paid_via text;
update orders o set city_id = nearest_city(o.pickup_lat, o.pickup_lng) where city_id is null;
update orders o set city = c.name from cities c where c.id = o.city_id and o.city is null;
create index if not exists orders_city_month_idx on orders (city, created_at);
create index if not exists orders_scheduled_idx on orders (scheduled_at) where status = 'scheduled';

create or replace function set_order_city() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.city_id is null then new.city_id := nearest_city(st_y(new.pickup_location::geometry), st_x(new.pickup_location::geometry)); end if;
  if new.city is null and new.city_id is not null then select name into new.city from cities where id = new.city_id; end if;
  return new;
end $$;
drop trigger if exists t_order_city on orders;
create trigger t_order_city before insert on orders for each row execute function set_order_city();

-- ---------- B. Kelas kendaraan & AntarBox ----------
alter table drivers
  add column if not exists vehicle_year int,
  add column if not exists vehicle_condition text not null default 'baik' check (vehicle_condition in ('standar','baik','sangat_baik')),
  add column if not exists is_electric boolean not null default false,
  add column if not exists vehicle_class text,
  add column if not exists vehicle_capacity text,
  add column if not exists status_reason text;
alter table profiles add column if not exists status_reason text;

create table if not exists vehicle_classes (
  code text primary key,
  vehicle vehicle_type not null,
  service service_type not null,
  label text not null,
  description text,
  multiplier numeric(4,2) not null default 1.00,
  rank int not null default 1,
  is_ev boolean not null default false,
  seats int,
  sort int not null default 0,
  active boolean not null default true
);
alter table vehicle_classes enable row level security;
create policy vc_select on vehicle_classes for select to anon, authenticated using (true);
create policy vc_admin on vehicle_classes for all to authenticated using (is_admin()) with check (is_admin());
grant select on vehicle_classes to anon, authenticated; grant update, insert, delete on vehicle_classes to authenticated;
insert into vehicle_classes (code, vehicle, service, label, description, multiplier, rank, is_ev, seats, sort) values
  ('motor_economy', 'motor', 'ride_motor', 'Ride Hemat', 'Motor tahun lama, harga paling hemat', 0.90, 1, false, 1, 1),
  ('motor_standard', 'motor', 'ride_motor', 'Ride Standar', 'Motor ≥2019 kondisi baik', 1.00, 2, false, 1, 2),
  ('motor_ev', 'motor', 'ride_motor', 'Ride Listrik', 'Motor listrik, senyap & ramah lingkungan', 1.00, 2, true, 1, 3),
  ('car_economy', 'car', 'ride_car', 'Car Hemat', 'LCGC / mobil tahun lama, 4 penumpang', 0.90, 1, false, 4, 1),
  ('car_standard', 'car', 'ride_car', 'Car Standar', 'Mobil ≥2016 kondisi baik, AC dingin', 1.00, 2, false, 4, 2),
  ('car_premium', 'car', 'ride_car', 'Car Premium', 'Mobil ≥2022 kondisi sangat baik, kabin lega', 1.35, 3, false, 4, 3),
  ('car_ev', 'car', 'ride_car', 'Car Listrik', 'Mobil listrik standar, senyap', 1.10, 2, true, 4, 4),
  ('car_ev_premium', 'car', 'ride_car', 'Car Listrik Premium', 'Mobil listrik premium ≥2022', 1.45, 3, true, 4, 5),
  ('box_pickup', 'pickup', 'box', 'Pick Up', 'Bak terbuka ±1 ton, barang besar & pindahan ringan', 1.00, 1, false, 2, 1),
  ('box_van', 'box', 'box', 'Mobil Box', 'Box tertutup ±2 ton, aman dari hujan, pindahan rumah/kost', 1.40, 2, false, 2, 2)
on conflict (code) do update set label = excluded.label, description = excluded.description, multiplier = excluded.multiplier, rank = excluded.rank, is_ev = excluded.is_ev, seats = excluded.seats, sort = excluded.sort;

insert into pricing (service, base_fare, per_km, per_min, min_fare, platform_fee, commission_pct, merchant_commission_pct, surge_multiplier)
values ('box', 30000, 6000, 0, 50000, 2000, 20, 0, 1) on conflict (service) do nothing;
insert into app_settings (key, value) values ('helper_fee', '50000'), ('schedule_release_min', '20') on conflict (key) do nothing;

create or replace function derive_vehicle_class(p_type vehicle_type, p_year int, p_condition text, p_electric boolean)
returns text language sql immutable as $$
  select case
    when p_type = 'pickup' then 'box_pickup'
    when p_type = 'box' then 'box_van'
    when p_type = 'motor' then case when p_electric then 'motor_ev' when coalesce(p_year, 0) >= 2019 and coalesce(p_condition, 'baik') <> 'standar' then 'motor_standard' else 'motor_economy' end
    else case
      when p_electric then case when coalesce(p_year, 0) >= 2022 and p_condition = 'sangat_baik' then 'car_ev_premium' else 'car_ev' end
      when coalesce(p_year, 0) >= 2022 and p_condition = 'sangat_baik' then 'car_premium'
      when coalesce(p_year, 0) >= 2016 and coalesce(p_condition, 'baik') <> 'standar' then 'car_standard'
      else 'car_economy' end
  end
$$;
update drivers set vehicle_class = derive_vehicle_class(vehicle_type, vehicle_year, vehicle_condition, is_electric) where vehicle_class is null;

create or replace function register_driver(p jsonb)
returns drivers language plpgsql security definer set search_path = public as $$
declare d drivers%rowtype; v_type vehicle_type := coalesce((p->>'vehicle_type')::vehicle_type, 'motor');
  v_year int := nullif(p->>'vehicle_year', '')::int; v_cond text := coalesce(nullif(p->>'vehicle_condition', ''), 'baik'); v_ev boolean := coalesce((p->>'is_electric')::boolean, false);
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if v_year is not null and (v_year < 1990 or v_year > extract(year from now())::int + 1) then raise exception 'Tahun kendaraan tidak valid'; end if;
  perform set_config('antaraja.bypass', 'on', true);
  insert into drivers (id, vehicle_type, vehicle_brand, vehicle_plate, vehicle_color, vehicle_year, vehicle_condition, is_electric, vehicle_capacity, vehicle_class)
  values (auth.uid(), v_type, p->>'vehicle_brand', upper(p->>'vehicle_plate'), p->>'vehicle_color', v_year, v_cond, v_ev, p->>'vehicle_capacity', derive_vehicle_class(v_type, v_year, v_cond, v_ev))
  on conflict (id) do update set vehicle_type = excluded.vehicle_type, vehicle_brand = excluded.vehicle_brand,
    vehicle_plate = excluded.vehicle_plate, vehicle_color = excluded.vehicle_color, vehicle_year = excluded.vehicle_year,
    vehicle_condition = excluded.vehicle_condition, is_electric = excluded.is_electric, vehicle_capacity = excluded.vehicle_capacity,
    vehicle_class = excluded.vehicle_class,
    status = case when drivers.status in ('suspended','approved') then drivers.status else 'pending' end
  returning * into d;
  insert into driver_documents (driver_id, license_number, id_card_number, photo_id_url, photo_vehicle_url)
  values (auth.uid(), p->>'license_number', p->>'id_card_number', p->>'photo_id_url', p->>'photo_vehicle_url')
  on conflict (driver_id) do update set license_number = excluded.license_number, id_card_number = excluded.id_card_number,
    photo_id_url = coalesce(excluded.photo_id_url, driver_documents.photo_id_url),
    photo_vehicle_url = coalesce(excluded.photo_vehicle_url, driver_documents.photo_vehicle_url), updated_at = now();
  update profiles set role = 'driver' where id = auth.uid() and role = 'customer';
  perform set_config('antaraja.bypass', 'off', true);
  return d;
end $$;

-- admin: ubah kelas kendaraan driver (override) + status dengan alasan
create or replace function admin_set_driver_class(p_driver uuid, p_class text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if not exists (select 1 from vehicle_classes where code = p_class) then raise exception 'Kelas tidak dikenal'; end if;
  perform set_config('antaraja.bypass', 'on', true);
  update drivers set vehicle_class = p_class where id = p_driver;
  perform set_config('antaraja.bypass', 'off', true);
  perform log_activity('driver.class', 'drivers', p_driver::text, 'Kelas kendaraan driver diubah → ' || p_class, jsonb_build_object('class', p_class));
end $$;

drop function if exists admin_set_driver_status(uuid, approval_status);
create or replace function admin_set_driver_status(p_driver uuid, p_status approval_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_status in ('suspended','rejected') and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Tulis alasan (min. 5 huruf)'; end if;
  perform set_config('antaraja.bypass', 'on', true);
  update drivers set status = p_status, status_reason = p_reason, is_online = case when p_status = 'approved' then is_online else false end where id = p_driver;
  perform set_config('antaraja.bypass', 'off', true);
  perform log_activity('driver.status_reason', 'drivers', p_driver::text, 'Driver → ' || p_status || coalesce(' · alasan: ' || p_reason, ''), jsonb_build_object('status', p_status, 'reason', p_reason));
end $$;

drop function if exists admin_set_merchant_status(uuid, approval_status);
create or replace function admin_set_merchant_status(p_merchant uuid, p_status approval_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status in ('suspended','rejected') and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Tulis alasan (min. 5 huruf)'; end if;
  perform admin_review_merchant(p_merchant, p_status, p_reason, null);
  perform log_activity('merchant.status_reason', 'merchants', p_merchant::text, 'Merchant → ' || p_status || coalesce(' · alasan: ' || p_reason, ''), jsonb_build_object('status', p_status, 'reason', p_reason));
end $$;

drop function if exists admin_set_user(uuid, user_role, boolean);
create or replace function admin_set_user(p_user uuid, p_role user_role default null, p_active boolean default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_active = false and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Tulis alasan penonaktifan (min. 5 huruf)'; end if;
  perform set_config('antaraja.bypass', 'on', true);
  update profiles set role = coalesce(p_role, role), is_active = coalesce(p_active, is_active), status_reason = case when p_active is not null then p_reason else status_reason end where id = p_user;
  perform set_config('antaraja.bypass', 'off', true);
  perform log_activity('user.status_reason', 'profiles', p_user::text, 'Akun ' || case when p_active is false then 'dinonaktifkan' when p_active then 'diaktifkan' else 'diubah' end || coalesce(' · alasan: ' || p_reason, '') || coalesce(' · role ' || p_role::text, ''), jsonb_build_object('role', p_role, 'active', p_active, 'reason', p_reason));
end $$;

-- estimasi tarif per kelas + pembantu (AntarBox)
create or replace function fare_options(p_service service_type, p_pickup_lat double precision, p_pickup_lng double precision,
  p_drop_lat double precision, p_drop_lng double precision, p_route_km numeric default null, p_helpers int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_est jsonb; v_helper bigint := setting_num('helper_fee', 50000)::bigint;
begin
  v_est := estimate_fare(p_service, p_pickup_lat, p_pickup_lng, p_drop_lat, p_drop_lng, p_route_km);
  return v_est || jsonb_build_object('helpers_fee', greatest(0, p_helpers) * v_helper, 'classes', coalesce((
    select jsonb_agg(jsonb_build_object('code', c.code, 'label', c.label, 'description', c.description, 'is_ev', c.is_ev, 'seats', c.seats, 'rank', c.rank,
      'multiplier', c.multiplier,
      'fare', round_to(((v_est->>'fare')::numeric * c.multiplier)::bigint, 500) + greatest(0, p_helpers) * v_helper,
      'total', round_to(((v_est->>'fare')::numeric * c.multiplier)::bigint, 500) + greatest(0, p_helpers) * v_helper + (v_est->>'platform_fee')::bigint,
      'drivers_nearby', (select count(*) from drivers d where d.is_online and d.status = 'approved' and d.vehicle_type = c.vehicle and d.location is not null
        and (select rank from vehicle_classes where code = d.vehicle_class) >= c.rank and (not c.is_ev or d.is_electric)
        and st_dwithin(d.location, st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography, 6000))
    ) order by c.sort) from vehicle_classes c where c.service = p_service and c.active), '[]'::jsonb));
end $$;

-- estimasi antar kota
create or replace function estimate_intercity(p_from_city uuid, p_to_city uuid, p_weight_kg numeric)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('base_fare', r.base_fare, 'per_kg', r.per_kg, 'eta_days', r.eta_days, 'weight_kg', greatest(1, ceil(coalesce(p_weight_kg, 1))),
    'fare', r.base_fare + r.per_kg * greatest(1, ceil(coalesce(p_weight_kg, 1)))::bigint)
  from intercity_rates r where r.from_city = p_from_city and r.to_city = p_to_city and r.active
$$;

-- ---------- C. Booking terjadwal + create_order lengkap ----------
create or replace function create_order(p jsonb)
returns orders language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_service service_type := (p->>'service')::service_type;
  v_paid_via text := coalesce(nullif(p->>'paid_via', ''), coalesce(p->>'payment_method', 'cash'));
  v_pay payment_method := case when v_paid_via = 'cash' then 'cash'::payment_method else 'wallet'::payment_method end;
  v_merchant merchants%rowtype;
  v_pick_lat double precision; v_pick_lng double precision; v_pick_addr text;
  v_drop_lat double precision := (p->'dropoff'->>'lat')::double precision;
  v_drop_lng double precision := (p->'dropoff'->>'lng')::double precision;
  v_drop_addr text := p->'dropoff'->>'address';
  v_est jsonb; v_fare bigint; v_fee bigint; v_sub bigint := 0; v_disc bigint := 0; v_total bigint;
  v_item jsonb; v_menu menu_items%rowtype; v_order orders%rowtype; v_active int; v_bal bigint;
  v_budget bigint := 0;
  pr pricing%rowtype;
  v_class vehicle_classes%rowtype; v_helpers int := greatest(0, least(3, coalesce((p->>'helpers')::int, 0))); v_helper_fee bigint := setting_num('helper_fee', 50000)::bigint;
  v_sched timestamptz := nullif(p->>'scheduled_at', '')::timestamptz;
  v_scope text := coalesce(nullif(p->>'send_scope', ''), 'in_city');
  v_dest_city uuid := nullif(p->>'dest_city_id', '')::uuid; v_wh uuid := nullif(p->>'warehouse_id', '')::uuid; v_origin_wh warehouses%rowtype;
  v_weight numeric := nullif(p->>'weight_kg', '')::numeric; v_ic jsonb; v_ic_fare bigint := 0; v_origin_city uuid;
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  if not exists (select 1 from profiles where id = v_uid and is_active) then raise exception 'Akun nonaktif'; end if;
  select count(*) into v_active from orders where customer_id = v_uid and status in ('searching','accepted','arrived','in_progress');
  if v_active >= 3 then raise exception 'Maksimal 3 pesanan aktif'; end if;
  if v_sched is not null then
    if v_sched < now() + interval '25 minutes' then raise exception 'Jadwal minimal 30 menit dari sekarang'; end if;
    if v_sched > now() + interval '7 days' then raise exception 'Jadwal maksimal 7 hari ke depan'; end if;
    if v_service in ('food','shop') then raise exception 'Booking terjadwal tersedia untuk Ride, Car, Send, dan Box'; end if;
  end if;

  if v_service = 'food' then
    select * into v_merchant from merchants where id = (p->>'merchant_id')::uuid;
    if not found or v_merchant.status <> 'approved' then raise exception 'Merchant tidak tersedia'; end if;
    if not v_merchant.is_open then raise exception 'Merchant sedang tutup'; end if;
    v_pick_lat := v_merchant.lat; v_pick_lng := v_merchant.lng; v_pick_addr := coalesce(v_merchant.address, v_merchant.name);
    if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then raise exception 'Keranjang kosong'; end if;
  else
    v_pick_lat := (p->'pickup'->>'lat')::double precision;
    v_pick_lng := (p->'pickup'->>'lng')::double precision;
    v_pick_addr := p->'pickup'->>'address';
  end if;
  if v_pick_lat is null then raise exception 'Lokasi jemput tidak lengkap'; end if;

  -- AntarSend antar kota: driver mengantar ke gudang asal terdekat; paket diteruskan ke drop point kota tujuan
  if v_service = 'send' and v_scope = 'intercity' then
    if v_dest_city is null or v_wh is null then raise exception 'Pilih kota & drop point tujuan'; end if;
    v_origin_city := nearest_city(v_pick_lat, v_pick_lng);
    if v_origin_city is null then raise exception 'Kota asal belum terlayani antar kota'; end if;
    select * into v_origin_wh from warehouses w where w.city_id = v_origin_city and w.active
      order by (w.type = 'big') desc, st_distance(w.location, st_setsrid(st_makepoint(v_pick_lng, v_pick_lat), 4326)::geography) limit 1;
    if not found then raise exception 'Belum ada gudang di kota asal'; end if;
    v_ic := estimate_intercity(v_origin_city, v_dest_city, v_weight);
    if v_ic is null then raise exception 'Rute antar kota belum tersedia'; end if;
    v_ic_fare := (v_ic->>'fare')::bigint;
    v_drop_lat := v_origin_wh.lat; v_drop_lng := v_origin_wh.lng; v_drop_addr := v_origin_wh.name || ' · ' || coalesce(v_origin_wh.address, '');
  end if;
  if v_drop_lat is null then raise exception 'Lokasi tujuan tidak lengkap'; end if;

  if v_service = 'shop' then
    if jsonb_array_length(coalesce(p->'shopping_list', '[]'::jsonb)) = 0 then raise exception 'Daftar belanja kosong'; end if;
    v_budget := greatest(0, coalesce((p->>'est_budget')::bigint, 0));
    if v_budget > 2000000 then raise exception 'Maksimal anggaran belanja Rp2.000.000'; end if;
  end if;

  v_est := estimate_fare(v_service, v_pick_lat, v_pick_lng, v_drop_lat, v_drop_lng, (p->>'route_km')::numeric);
  v_fare := (v_est->>'fare')::bigint; v_fee := (v_est->>'platform_fee')::bigint;
  -- kelas kendaraan (ride/car/box)
  if v_service in ('ride_motor','ride_car','box') then
    select * into v_class from vehicle_classes where code = nullif(p->>'vehicle_class', '') and service = v_service and active;
    if not found then select * into v_class from vehicle_classes where service = v_service and active order by (rank = 2) desc, sort limit 1; end if;
    v_fare := round_to((v_fare::numeric * v_class.multiplier)::bigint, 500);
    if v_service = 'box' then v_fare := v_fare + v_helpers * v_helper_fee; else v_helpers := 0; end if;
  else v_helpers := 0; end if;
  select * into pr from pricing where service = v_service;

  insert into orders (service, customer_id, merchant_id, status, merchant_status,
    pickup_address, pickup_location, dropoff_address, dropoff_location,
    distance_km, duration_min, route_geometry, fare_delivery, platform_fee, payment_method, paid_via,
    notes, recipient_name, recipient_phone, package_details, promo_code, shopping_list, est_budget, shop_store,
    send_scope, dest_city_id, warehouse_id, origin_warehouse_id, weight_kg, intercity_fare, scheduled_at, vehicle_class, helpers, purpose)
  values (v_service, v_uid, v_merchant.id, case when v_sched is not null then 'scheduled'::order_status else 'searching'::order_status end,
    case when v_service = 'food' then 'pending'::merchant_order_status else null end,
    v_pick_addr, st_setsrid(st_makepoint(v_pick_lng, v_pick_lat), 4326)::geography,
    v_drop_addr, st_setsrid(st_makepoint(v_drop_lng, v_drop_lat), 4326)::geography,
    (v_est->>'distance_km')::numeric, coalesce((p->>'duration_min')::int, (v_est->>'duration_min')::int),
    p->'route_geometry', v_fare, v_fee, v_pay, v_paid_via,
    p->>'notes', p->>'recipient_name', p->>'recipient_phone', p->'package_details', nullif(upper(p->>'promo_code'), ''),
    case when v_service = 'shop' then p->'shopping_list' else null end, v_budget, p->>'shop_store',
    case when v_service = 'send' then v_scope else 'in_city' end, v_dest_city, v_wh, v_origin_wh.id, v_weight, v_ic_fare, v_sched, v_class.code, v_helpers, p->>'purpose')
  returning * into v_order;

  if v_service = 'food' then
    for v_item in select * from jsonb_array_elements(p->'items') loop
      select * into v_menu from menu_items where id = (v_item->>'menu_item_id')::uuid and merchant_id = v_merchant.id and is_available;
      if not found then raise exception 'Menu tidak tersedia'; end if;
      insert into order_items (order_id, menu_item_id, name, price, qty, notes)
      values (v_order.id, v_menu.id, v_menu.name, v_menu.price, greatest(1, (v_item->>'qty')::int), v_item->>'notes');
      v_sub := v_sub + v_menu.price * greatest(1, (v_item->>'qty')::int);
    end loop;
  elsif v_service = 'shop' then
    v_sub := v_budget;
  end if;

  v_disc := apply_promo(v_order.promo_code, v_service, v_fare + case when v_service = 'food' then v_sub else 0 end);
  v_total := v_fare + v_fee + v_sub + v_ic_fare - v_disc;

  update orders set items_subtotal = v_sub, discount = v_disc, total = v_total,
    driver_earning = v_fare - floor(v_fare * pr.commission_pct / 100.0),
    merchant_earning = case when v_service = 'food' then v_sub - floor(v_sub * pr.merchant_commission_pct / 100.0) else 0 end
  where id = v_order.id returning * into v_order;

  if v_pay = 'wallet' then
    select balance into v_bal from wallets where user_id = v_uid for update;
    if coalesce(v_bal, 0) < v_total then raise exception 'SALDO_KURANG:%', v_total - coalesce(v_bal, 0); end if;
    perform wallet_apply(v_uid, 'payment', -v_total, v_order.id, 'Pembayaran ' || v_order.code || case when v_paid_via not in ('wallet','cash') then ' via ' || v_paid_via else '' end);
    update orders set payment_status = 'paid' where id = v_order.id returning * into v_order;
  end if;
  if v_order.promo_code is not null then update promos set used_count = used_count + 1 where code = v_order.promo_code; end if;

  insert into order_events (order_id, status, actor_id, note) values (v_order.id, v_order.status::text, v_uid,
    case when v_sched is not null then 'Booking terjadwal ' || to_char(v_sched at time zone 'Asia/Jakarta', 'DD Mon HH24:MI') || ' WIB — driver dicarikan otomatis menjelang jadwal'
         when v_ic_fare > 0 then 'Pesanan antar kota dibuat, driver mengantar ke gudang asal'
         else 'Pesanan dibuat, mencari driver' end);
  return v_order;
end $$;

-- rilis booking terjadwal → mulai cari driver N menit sebelum jadwal (dijadwalkan pg_cron tiap menit; juga bisa dipanggil aplikasi)
create or replace function release_scheduled_orders()
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_min numeric := setting_num('schedule_release_min', 20);
begin
  with r as (
    update orders set status = 'searching' where status = 'scheduled' and scheduled_at <= now() + (v_min || ' minutes')::interval returning id
  ) insert into order_events (order_id, status, note) select id, 'searching', 'Jadwal tiba — mencari driver' from r;
  get diagnostics n = row_count;
  return n;
end $$;
do $$ begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron: %', sqlerrm; end $$;
do $$ begin perform cron.unschedule('release-scheduled-orders'); exception when others then null; end $$;
-- catatan: cron.schedule harus dijalankan di transaksi terpisah setelah ekstensi aktif:
--   select cron.schedule('release-scheduled-orders', '* * * * *', 'select public.release_scheduled_orders()');
do $$ begin perform cron.schedule('release-scheduled-orders', '* * * * *', 'select public.release_scheduled_orders()'); exception when others then raise notice 'pg_cron tidak tersedia: %', sqlerrm; end $$;
do $$ begin create extension if not exists pgcrypto with schema extensions; exception when others then null; end $$;

-- batalkan booking terjadwal (pelanggan) — refund penuh bila sudah dibayar
create or replace function cancel_order(p_order_id uuid, p_reason text default null)
returns orders language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); o orders%rowtype; v_admin boolean := is_admin();
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;
  if o.status in ('completed','cancelled') then raise exception 'Order sudah selesai/batal'; end if;
  if o.driver_id = v_uid and not v_admin then
    if o.status = 'in_progress' then raise exception 'Perjalanan sudah dimulai, tidak bisa dibatalkan'; end if;
    update orders set driver_id = null, status = 'searching', accepted_at = null, arrived_at = null where id = o.id returning * into o;
    insert into order_events (order_id, status, actor_id, note) values (o.id, 'driver_cancelled', v_uid, coalesce(p_reason, 'Driver membatalkan, mencari driver lain'));
    return o;
  end if;
  if o.customer_id <> v_uid and not v_admin then raise exception 'Tidak berhak'; end if;
  if o.status = 'in_progress' and not v_admin then raise exception 'Perjalanan sedang berlangsung, hubungi CS untuk pembatalan'; end if;
  update orders set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid, cancel_reason = p_reason,
    payment_status = case when payment_status = 'paid' then 'refunded' else payment_status end
  where id = o.id returning * into o;
  if o.payment_status = 'refunded' then perform wallet_apply(o.customer_id, 'refund', o.total, o.id, 'Refund pembatalan ' || o.code); end if;
  if o.promo_code is not null then update promos set used_count = greatest(0, used_count - 1) where code = o.promo_code; end if;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'cancelled', v_uid, p_reason);
  return o;
end $$;

-- kecocokan kelas driver ↔ order
create or replace function driver_can_take(d drivers, o orders) returns boolean language sql stable as $$
  select case
    when o.service = 'ride_motor' then d.vehicle_type = 'motor'
    when o.service = 'ride_car' then d.vehicle_type = 'car'
    when o.service = 'box' then d.vehicle_type in ('box','pickup')
    else d.vehicle_type in ('motor','car')
  end
  and (o.vehicle_class is null or exists (
    select 1 from vehicle_classes oc join vehicle_classes dc on dc.code = coalesce(d.vehicle_class, derive_vehicle_class(d.vehicle_type, d.vehicle_year, d.vehicle_condition, d.is_electric))
    where oc.code = o.vehicle_class and dc.rank >= oc.rank and (not oc.is_ev or d.is_electric)))
$$;

drop function if exists driver_available_orders();
create or replace function driver_available_orders()
returns table(id uuid, code text, service service_type, pickup_address text, dropoff_address text,
  pickup_lat double precision, pickup_lng double precision, dropoff_lat double precision, dropoff_lng double precision,
  distance_km numeric, fare_delivery bigint, items_subtotal bigint, total bigint, driver_earning bigint,
  payment_method payment_method, merchant_status merchant_order_status, created_at timestamptz, distance_to_pickup_km numeric, merchant_name text,
  vehicle_class text, helpers int, scheduled_at timestamptz, send_scope text)
language plpgsql stable security definer set search_path = public as $$
declare d drivers%rowtype; v_radius numeric := setting_num('search_radius_km', 5);
begin
  select * into d from drivers where drivers.id = auth.uid();
  if not found or d.status <> 'approved' then return; end if;
  return query
  select o.id, o.code, o.service, o.pickup_address, o.dropoff_address,
    o.pickup_lat, o.pickup_lng, o.dropoff_lat, o.dropoff_lng,
    o.distance_km, o.fare_delivery, o.items_subtotal, o.total, o.driver_earning,
    o.payment_method, o.merchant_status, o.created_at,
    round((st_distance(o.pickup_location, d.location) / 1000.0)::numeric, 2), coalesce(m.name, o.shop_store),
    o.vehicle_class, o.helpers, o.scheduled_at, o.send_scope
  from orders o left join merchants m on m.id = o.merchant_id
  where o.status = 'searching'
    and driver_can_take(d, o)
    and (o.merchant_status is null or o.merchant_status <> 'rejected')
    and d.location is not null
    and st_dwithin(o.pickup_location, d.location, v_radius * 1000)
  order by 18 asc limit 20;
end $$;

create or replace function driver_accept_order(p_order_id uuid)
returns orders language plpgsql security definer set search_path = public as $$
declare d drivers%rowtype; o orders%rowtype; v_active int; v_bal bigint;
begin
  select * into d from drivers where id = auth.uid();
  if not found or d.status <> 'approved' then raise exception 'Akun driver belum aktif'; end if;
  if not d.is_online then raise exception 'Aktifkan status online dulu'; end if;
  select balance into v_bal from wallets where user_id = d.id;
  if coalesce(v_bal, 0) < -500000 then raise exception 'Saldo minus melebihi batas. Top up dulu untuk menerima order.'; end if;
  select count(*) into v_active from orders where driver_id = d.id and status in ('accepted','arrived','in_progress');
  if v_active > 0 then raise exception 'Selesaikan order aktif dulu'; end if;
  select * into o from orders where id = p_order_id and status = 'searching';
  if not found or not driver_can_take(d, o) then raise exception 'Order sudah diambil driver lain atau tidak cocok dengan kendaraan Anda'; end if;
  update orders set driver_id = d.id, status = 'accepted', accepted_at = now() where id = p_order_id and status = 'searching' returning * into o;
  if not found then raise exception 'Order sudah diambil driver lain'; end if;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'accepted', d.id, 'Driver menerima pesanan');
  return o;
end $$;

-- ---------- D. Notifikasi & blast promo ----------
create table if not exists notifications (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'promo' check (kind in ('promo','system','order')),
  title text not null,
  body text,
  image_url text,
  promo_code text,
  merchant_id uuid references merchants(id) on delete set null,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notif_user_idx on notifications (user_id, created_at desc);
alter table notifications enable row level security;
create policy notif_select on notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, update on notifications to authenticated;
alter publication supabase_realtime add table notifications;

create table if not exists blasts (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references profiles(id) on delete set null,
  title text not null, body text, image_url text, promo_code text,
  merchant_id uuid references merchants(id) on delete set null,
  target text not null default 'all' check (target in ('all','city','active30','customers')),
  city_id uuid references cities(id) on delete set null,
  sent_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table blasts enable row level security;
create policy blasts_admin on blasts for select to authenticated using (is_admin());
grant select on blasts to authenticated;

create or replace function admin_blast_promo(p jsonb)
returns blasts language plpgsql security definer set search_path = public as $$
declare b blasts%rowtype; n int; v_target text := coalesce(p->>'target', 'all'); v_city uuid := nullif(p->>'city_id', '')::uuid;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if length(trim(coalesce(p->>'title', ''))) < 4 then raise exception 'Judul minimal 4 huruf'; end if;
  insert into blasts (admin_id, title, body, image_url, promo_code, merchant_id, target, city_id)
  values (auth.uid(), trim(p->>'title'), p->>'body', p->>'image_url', nullif(upper(p->>'promo_code'), ''), nullif(p->>'merchant_id', '')::uuid, v_target, v_city)
  returning * into b;
  insert into notifications (user_id, kind, title, body, image_url, promo_code, merchant_id, data)
  select pr.id, 'promo', b.title, b.body, b.image_url, b.promo_code, b.merchant_id, jsonb_build_object('blast_id', b.id)
  from profiles pr
  where pr.is_active and pr.role <> 'admin'
    and (v_target <> 'customers' or pr.role = 'customer')
    and (v_target <> 'active30' or exists (select 1 from orders o where o.customer_id = pr.id and o.created_at > now() - interval '30 days'))
    and (v_target <> 'city' or exists (select 1 from orders o where o.customer_id = pr.id and o.city_id = v_city));
  get diagnostics n = row_count;
  update blasts set sent_count = n where id = b.id returning * into b;
  perform log_activity('promo.blast', 'blasts', b.id::text, 'Blast promo "' || b.title || '" ke ' || n || ' pengguna', jsonb_build_object('target', v_target, 'promo_code', b.promo_code, 'count', n));
  return b;
end $$;

create or replace function notifications_mark_read(p_ids bigint[] default null)
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
$$;

-- ---------- E. Preferensi pembayaran ----------
create table if not exists payment_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  default_method text not null default 'cash' check (default_method in ('cash','wallet','ewallet')),
  ewallet text check (ewallet in ('gopay','ovo','dana','shopeepay','qris','bank_transfer')),
  updated_at timestamptz not null default now()
);
alter table payment_prefs enable row level security;
create policy pp_all on payment_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on payment_prefs to authenticated;

-- ---------- F/G. Akses eksekutif ----------
create table if not exists exec_access (
  user_id uuid primary key references profiles(id) on delete cascade,
  level text not null check (level in ('vp','ceo','cfo','shareholder')),
  pin_hash text not null,
  active boolean not null default true,
  last_login_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists exec_sessions (
  token text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  level text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table exec_access enable row level security; alter table exec_sessions enable row level security;
create policy exec_access_select on exec_access for select to authenticated using (user_id = auth.uid() or is_admin());
grant select on exec_access to authenticated;

create or replace function admin_set_exec(p_user uuid, p_level text, p_pin text default null, p_active boolean default true)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_pin is not null and length(p_pin) < 6 then raise exception 'PIN minimal 6 digit'; end if;
  insert into exec_access (user_id, level, pin_hash, active, created_by)
  values (p_user, p_level, crypt(coalesce(p_pin, '000000'), gen_salt('bf')), p_active, auth.uid())
  on conflict (user_id) do update set level = excluded.level, active = excluded.active,
    pin_hash = case when p_pin is not null then excluded.pin_hash else exec_access.pin_hash end;
  perform log_activity('exec.access', 'exec_access', p_user::text, 'Akses eksekutif ' || p_level || case when p_active then ' aktif' else ' nonaktif' end, jsonb_build_object('level', p_level, 'active', p_active, 'pin_changed', p_pin is not null));
end $$;

create or replace function exec_login(p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a exec_access%rowtype; v_token text;
begin
  select * into a from exec_access where user_id = auth.uid() and active;
  if not found then raise exception 'Akun Anda tidak memiliki akses eksekutif'; end if;
  if a.pin_hash <> crypt(p_pin, a.pin_hash) then
    perform log_activity('exec.login_failed', 'exec_access', auth.uid()::text, 'Percobaan login eksekutif gagal', null);
    raise exception 'PIN eksekutif salah';
  end if;
  delete from exec_sessions where expires_at < now();
  v_token := md5(random()::text || clock_timestamp()::text || auth.uid()::text);
  insert into exec_sessions (token, user_id, level, expires_at) values (v_token, auth.uid(), a.level, now() + interval '30 minutes');
  update exec_access set last_login_at = now() where user_id = auth.uid();
  perform log_activity('exec.login', 'exec_access', auth.uid()::text, 'Login portal eksekutif (' || a.level || ')', null);
  return jsonb_build_object('token', v_token, 'level', a.level, 'expires_at', now() + interval '30 minutes');
end $$;

create or replace function exec_valid(p_token text) returns exec_sessions language sql stable security definer set search_path = public as $$
  select * from exec_sessions where token = p_token and user_id = auth.uid() and expires_at > now()
$$;

create or replace function exec_report(p_token text, p_months int default 6)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s exec_sessions; v_from timestamptz := date_trunc('month', now()) - ((greatest(1, p_months) - 1) || ' months')::interval;
begin
  s := exec_valid(p_token);
  if s.token is null then raise exception 'EXEC_SESSION_EXPIRED'; end if;
  return jsonb_build_object(
    'level', s.level, 'generated_at', now(), 'from', v_from,
    'summary', (select jsonb_build_object(
        'gmv', coalesce(sum(total) filter (where status = 'completed'), 0),
        'orders', count(*), 'completed', count(*) filter (where status = 'completed'), 'cancelled', count(*) filter (where status = 'cancelled'),
        'revenue', coalesce(sum(platform_fee + (fare_delivery - driver_earning) + (items_subtotal - merchant_earning) * (merchant_id is not null)::int) filter (where status = 'completed'), 0),
        'driver_payout', coalesce(sum(driver_earning) filter (where status = 'completed'), 0),
        'merchant_payout', coalesce(sum(merchant_earning) filter (where status = 'completed'), 0),
        'avg_ticket', coalesce(round(avg(total) filter (where status = 'completed')), 0),
        'customers', count(distinct customer_id), 'cities', count(distinct city))
      from orders where created_at >= v_from),
    'prev_gmv', (select coalesce(sum(total) filter (where status = 'completed'), 0) from orders where created_at >= v_from - (greatest(1, p_months) || ' months')::interval and created_at < v_from),
    'monthly', (select coalesce(jsonb_agg(x order by x->>'month'), '[]') from (
        select jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'gmv', coalesce((select sum(total) from orders o where o.status = 'completed' and date_trunc('month', o.created_at) = m), 0),
          'orders', (select count(*) from orders o where date_trunc('month', o.created_at) = m),
          'completed', (select count(*) from orders o where o.status = 'completed' and date_trunc('month', o.created_at) = m),
          'revenue', coalesce((select sum(platform_fee + (fare_delivery - driver_earning)) from orders o where o.status = 'completed' and date_trunc('month', o.created_at) = m), 0),
          'new_users', (select count(*) from profiles p where date_trunc('month', p.created_at) = m),
          'new_drivers', (select count(*) from drivers d where date_trunc('month', d.created_at) = m)) x
        from generate_series(v_from, date_trunc('month', now()), interval '1 month') m) q),
    'by_service', (select coalesce(jsonb_agg(jsonb_build_object('service', service, 'orders', n, 'gmv', gmv) order by gmv desc), '[]') from (
        select service, count(*) n, coalesce(sum(total) filter (where status = 'completed'), 0) gmv from orders where created_at >= v_from group by service) q),
    'by_city', (select coalesce(jsonb_agg(jsonb_build_object('city', coalesce(city, 'Lainnya'), 'orders', n, 'gmv', gmv, 'customers', c) order by gmv desc), '[]') from (
        select city, count(*) n, coalesce(sum(total) filter (where status = 'completed'), 0) gmv, count(distinct customer_id) c from orders where created_at >= v_from group by city) q),
    'top_merchants', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'orders', n, 'gmv', gmv) order by gmv desc), '[]') from (
        select m.name, count(*) n, coalesce(sum(o.items_subtotal), 0) gmv from orders o join merchants m on m.id = o.merchant_id where o.status = 'completed' and o.created_at >= v_from group by m.name order by gmv desc limit 5) q),
    'supply', jsonb_build_object(
        'drivers_total', (select count(*) from drivers where status = 'approved'), 'drivers_online', (select count(*) from drivers where is_online),
        'drivers_pending', (select count(*) from drivers where status = 'pending'),
        'merchants_total', (select count(*) from merchants where status = 'approved'), 'merchants_pending', (select count(*) from merchants where status = 'pending'),
        'users_total', (select count(*) from profiles where is_active),
        'wallet_float', (select coalesce(sum(balance), 0) from wallets where balance > 0),
        'wallet_negative', (select coalesce(sum(balance), 0) from wallets where balance < 0)),
    'quality', jsonb_build_object(
        'cancel_rate', (select round(100.0 * count(*) filter (where status = 'cancelled') / greatest(1, count(*)), 1) from orders where created_at >= v_from),
        'avg_driver_rating', (select round(avg(rating_avg)::numeric, 2) from drivers where rating_count > 0),
        'tickets', (select count(*) from tickets where created_at >= v_from),
        'tickets_open', (select count(*) from tickets where status not in ('resolved','closed')),
        'avg_first_response_min', (select round(avg(extract(epoch from (first_response_at - created_at)) / 60)::numeric, 1) from tickets where first_response_at is not null and created_at >= v_from),
        'cs_rating', (select round(avg(rating)::numeric, 2) from tickets where rating is not null),
        'sos', (select count(*) from sos_alerts where created_at >= v_from))
  );
end $$;

-- ---------- H. Trafik per kota (dashboard admin) ----------
create or replace function admin_traffic_stats(p_months int default 6)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := date_trunc('month', now()) - ((greatest(1, p_months) - 1) || ' months')::interval;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  return jsonb_build_object(
    'months', (select jsonb_agg(to_char(m, 'YYYY-MM') order by m) from generate_series(v_from, date_trunc('month', now()), interval '1 month') m),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('city', city, 'total', total, 'series', series) order by total desc), '[]') from (
        select coalesce(o.city, 'Lainnya') city, count(*) total,
          (select jsonb_agg(coalesce((select count(*) from orders x where coalesce(x.city, 'Lainnya') = coalesce(o.city, 'Lainnya') and date_trunc('month', x.created_at) = m), 0) order by m)
             from generate_series(v_from, date_trunc('month', now()), interval '1 month') m) series
        from orders o where o.created_at >= v_from group by o.city) q),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('service', service, 'orders', n, 'gmv', gmv, 'share', round(100.0 * n / greatest(1, (select count(*) from orders where created_at >= v_from)), 1)) order by n desc), '[]') from (
        select service, count(*) n, coalesce(sum(total) filter (where status = 'completed'), 0) gmv from orders where created_at >= v_from group by service) q),
    'this_month', (select jsonb_build_object('orders', count(*), 'gmv', coalesce(sum(total) filter (where status = 'completed'), 0)) from orders where created_at >= date_trunc('month', now())),
    'last_month', (select jsonb_build_object('orders', count(*), 'gmv', coalesce(sum(total) filter (where status = 'completed'), 0)) from orders where created_at >= date_trunc('month', now()) - interval '1 month' and created_at < date_trunc('month', now()))
  );
end $$;

-- ---------- Grants ----------
grant execute on function nearest_city(double precision, double precision, numeric) to anon, authenticated;
grant execute on function derive_vehicle_class(vehicle_type, int, text, boolean) to anon, authenticated;
grant execute on function register_driver(jsonb) to authenticated;
grant execute on function admin_set_driver_class(uuid, text) to authenticated;
grant execute on function admin_set_driver_status(uuid, approval_status, text) to authenticated;
grant execute on function admin_set_merchant_status(uuid, approval_status, text) to authenticated;
grant execute on function admin_set_user(uuid, user_role, boolean, text) to authenticated;
grant execute on function fare_options(service_type, double precision, double precision, double precision, double precision, numeric, int) to anon, authenticated;
grant execute on function estimate_intercity(uuid, uuid, numeric) to anon, authenticated;
grant execute on function create_order(jsonb) to authenticated;
grant execute on function release_scheduled_orders() to authenticated;
grant execute on function cancel_order(uuid, text) to authenticated;
revoke all on function driver_can_take(drivers, orders) from anon, public;
grant execute on function driver_can_take(drivers, orders) to authenticated;
grant execute on function driver_available_orders() to authenticated;
grant execute on function driver_accept_order(uuid) to authenticated;
grant execute on function admin_blast_promo(jsonb) to authenticated;
grant execute on function notifications_mark_read(bigint[]) to authenticated;
grant execute on function admin_set_exec(uuid, text, text, boolean) to authenticated;
grant execute on function exec_login(text) to authenticated;
revoke all on function exec_valid(text) from anon, public; grant execute on function exec_valid(text) to authenticated;
grant execute on function exec_report(text, int) to authenticated;
grant execute on function admin_traffic_stats(int) to authenticated;
revoke all on function set_order_city() from anon, public, authenticated;
