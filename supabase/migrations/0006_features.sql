-- =====================================================================
-- 0006: AntarShop (belanja), tip & biaya tambahan, sesi harga & harga
--       kompetitor, payment gateway (payments), log panggilan, bahasa.
-- =====================================================================

-- ---------- Kolom baru ----------
alter table profiles add column if not exists locale text not null default 'id';

alter table orders
  add column if not exists shopping_list jsonb,               -- [{name, qty, note}]
  add column if not exists est_budget bigint not null default 0,
  add column if not exists shop_store text,                   -- nama toko (Alfamart/Indomaret/...)
  add column if not exists receipt_url text,
  add column if not exists tip bigint not null default 0,
  add column if not exists extras jsonb not null default '[]'::jsonb,   -- [{id, kind, amount, note, status, created_at}]
  add column if not exists extras_total bigint not null default 0;

-- Tarif belanja (base termasuk jasa belanja)
insert into pricing (service, base_fare, per_km, per_min, min_fare, platform_fee, commission_pct, merchant_commission_pct, surge_multiplier)
values ('shop', 8000, 2500, 0, 10000, 1000, 20, 0, 1)
on conflict (service) do nothing;

-- ---------- Sesi harga (high/middle/low) ----------
create table if not exists pricing_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level text not null check (level in ('low','middle','high')),
  days int[] not null default '{0,1,2,3,4,5,6}',        -- 0 = Minggu
  start_time time not null,
  end_time time not null,
  multiplier numeric(4,2) not null default 1.00,
  driver_bonus_pct numeric(5,2) not null default 0,     -- tambahan porsi driver dari kenaikan
  services service_type[] default null,                 -- null = semua layanan
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger pricing_sessions_updated before update on pricing_sessions for each row execute function set_updated_at();
alter table pricing_sessions enable row level security;
create policy pricing_sessions_read on pricing_sessions for select to authenticated using (true);
create policy pricing_sessions_admin on pricing_sessions for all to authenticated using (is_admin()) with check (is_admin());
grant select on pricing_sessions to authenticated;
grant insert, update, delete on pricing_sessions to authenticated;

insert into pricing_sessions (name, level, days, start_time, end_time, multiplier, driver_bonus_pct, note)
select * from (values
  ('Jam sibuk pagi', 'high', '{1,2,3,4,5}'::int[], '06:30'::time, '09:00'::time, 1.25, 5, 'Berangkat kerja/sekolah'),
  ('Jam sibuk sore', 'high', '{1,2,3,4,5}'::int[], '16:30'::time, '19:30'::time, 1.25, 5, 'Pulang kerja + hujan sering'),
  ('Normal siang', 'middle', '{0,1,2,3,4,5,6}'::int[], '09:00'::time, '16:30'::time, 1.00, 0, null),
  ('Sepi malam', 'low', '{0,1,2,3,4,5,6}'::int[], '22:00'::time, '05:30'::time, 0.90, 0, 'Diskon agar order tetap ada')
) as v(name, level, days, start_time, end_time, multiplier, driver_bonus_pct, note)
where not exists (select 1 from pricing_sessions);

-- Sesi aktif saat ini (WIB)
create or replace function current_pricing_session(p_service service_type default null, p_at timestamptz default now())
returns pricing_sessions language sql stable security definer set search_path = public as $$
  select s.* from pricing_sessions s
  where s.active
    and (s.services is null or p_service is null or p_service = any(s.services))
    and extract(dow from (p_at at time zone 'Asia/Jakarta'))::int = any(s.days)
    and (
      (s.start_time <= s.end_time and (p_at at time zone 'Asia/Jakarta')::time >= s.start_time and (p_at at time zone 'Asia/Jakarta')::time < s.end_time)
      or (s.start_time > s.end_time and ((p_at at time zone 'Asia/Jakarta')::time >= s.start_time or (p_at at time zone 'Asia/Jakarta')::time < s.end_time))
    )
  order by case s.level when 'high' then 0 when 'low' then 1 else 2 end
  limit 1;
$$;

-- calc_fare kini memakai multiplier sesi × surge dasar
create or replace function calc_fare(p_service service_type, p_km numeric)
returns table(fare bigint, platform_fee bigint) language plpgsql stable security definer set search_path = public as $$
declare p pricing%rowtype; s pricing_sessions; v_mult numeric := 1;
begin
  select * into p from pricing where service = p_service;
  if not found then raise exception 'Tarif % belum diatur', p_service; end if;
  s := current_pricing_session(p_service);
  if s.id is not null then v_mult := s.multiplier; end if;
  fare := round_to(greatest(p.min_fare, p.base_fare + ceil(p.per_km * p_km))::bigint, 500);
  fare := round_to((fare * p.surge_multiplier * v_mult)::bigint, 500);
  platform_fee := p.platform_fee;
  return next;
end $$;

-- estimate_fare: tambahkan info sesi
create or replace function estimate_fare(
  p_service service_type, p_pickup_lat double precision, p_pickup_lng double precision,
  p_drop_lat double precision, p_drop_lng double precision, p_route_km numeric default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_straight numeric; v_km numeric; v_fare bigint; v_fee bigint; v_ratio numeric; s pricing_sessions;
begin
  v_straight := st_distance(
    st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    st_setsrid(st_makepoint(p_drop_lng, p_drop_lat), 4326)::geography) / 1000.0;
  v_ratio := setting_num('max_route_ratio', 2.5);
  v_km := coalesce(p_route_km, v_straight * 1.3);
  v_km := least(greatest(v_km, v_straight), greatest(v_straight * v_ratio, 0.5));
  v_km := round(v_km, 2);
  select fare, platform_fee into v_fare, v_fee from calc_fare(p_service, v_km);
  s := current_pricing_session(p_service);
  return jsonb_build_object('distance_km', v_km, 'straight_km', round(v_straight, 2),
    'fare', v_fare, 'platform_fee', v_fee, 'total', v_fare + v_fee,
    'duration_min', greatest(3, ceil(v_km / 25.0 * 60)),
    'session', case when s.id is null then null else jsonb_build_object('name', s.name, 'level', s.level, 'multiplier', s.multiplier) end);
end $$;

-- ---------- Harga kompetitor (input admin) ----------
create table if not exists competitor_prices (
  id uuid primary key default gen_random_uuid(),
  competitor text not null,
  service service_type not null,
  base_fare bigint not null default 0,
  per_km bigint not null default 0,
  min_fare bigint not null default 0,
  level text not null default 'middle' check (level in ('low','middle','high')),
  city text default 'Pekanbaru',
  source text,
  captured_at date not null default current_date,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table competitor_prices enable row level security;
create policy competitor_prices_admin on competitor_prices for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on competitor_prices to authenticated;

-- Usulan harga: bandingkan tarif kita vs rata-rata kompetitor per layanan & sesi
create or replace function pricing_suggestions(p_km numeric default 3)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; v jsonb := '[]'::jsonb; v_our bigint; v_comp numeric; v_sugg bigint; v_mult numeric; pr pricing%rowtype;
  v_target numeric; v_driver bigint; v_platform bigint; v_n int;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  for r in select p.service, l.level from pricing p cross join (values ('low'),('middle'),('high')) as l(level) order by p.service, l.level loop
    select * into pr from pricing where service = r.service;
    v_our := round_to(greatest(pr.min_fare, pr.base_fare + ceil(pr.per_km * p_km))::bigint, 500);
    select avg(round_to(greatest(c.min_fare, c.base_fare + ceil(c.per_km * p_km))::bigint, 500)), count(*) into v_comp, v_n
      from competitor_prices c where c.service = r.service and c.level = r.level and c.captured_at >= current_date - 90;
    -- strategi: low = 5% di bawah kompetitor, middle = sama, high = 3% di bawah kompetitor (tetap kompetitif saat sibuk)
    v_target := case r.level when 'low' then 0.95 when 'middle' then 1.00 else 0.97 end;
    if v_comp is null then
      v_mult := case r.level when 'low' then 0.90 when 'middle' then 1.00 else 1.25 end;
      v_sugg := round_to((v_our * v_mult)::bigint, 500);
    else
      v_sugg := round_to((v_comp * v_target)::bigint, 500);
      v_mult := round(greatest(0.7, least(1.6, v_sugg::numeric / nullif(v_our, 0))), 2);
    end if;
    v_driver := v_sugg - floor(v_sugg * pr.commission_pct / 100.0);
    v_platform := floor(v_sugg * pr.commission_pct / 100.0) + pr.platform_fee;
    v := v || jsonb_build_object('service', r.service, 'level', r.level, 'km', p_km,
      'our_fare', v_our, 'competitor_avg', v_comp, 'competitor_n', v_n,
      'suggested_fare', v_sugg, 'suggested_multiplier', v_mult,
      'driver_earning', v_driver, 'platform_revenue', v_platform,
      'driver_now', v_our - floor(v_our * pr.commission_pct / 100.0),
      'platform_now', floor(v_our * pr.commission_pct / 100.0) + pr.platform_fee);
  end loop;
  return v;
end $$;

-- ---------- Payment gateway ----------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  order_id uuid references orders(id),
  purpose text not null default 'topup' check (purpose in ('topup','order')),
  amount bigint not null check (amount > 0),
  method text not null default 'any',                  -- gopay/ovo/dana/shopeepay/qris/bank_transfer/any
  provider text not null default 'simulated',          -- midtrans | simulated
  status text not null default 'pending' check (status in ('pending','settlement','expire','cancel','deny','failure')),
  external_id text unique,
  snap_token text,
  redirect_url text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_user_idx on payments(user_id, created_at desc);
create trigger payments_updated before update on payments for each row execute function set_updated_at();
alter table payments enable row level security;
create policy payments_own_read on payments for select to authenticated using (user_id = auth.uid() or is_admin());
grant select on payments to authenticated;

-- Dipanggil edge function (service_role) saat notifikasi Midtrans / simulasi
create or replace function payment_settle(p_external_id text, p_status text, p_raw jsonb default null)
returns payments language plpgsql security definer set search_path = public as $$
declare p payments%rowtype;
begin
  select * into p from payments where external_id = p_external_id for update;
  if not found then raise exception 'Payment tidak ditemukan'; end if;
  if p.status = 'settlement' then return p; end if;   -- idempoten
  update payments set status = p_status, raw = coalesce(p_raw, raw) where id = p.id returning * into p;
  if p_status = 'settlement' then
    perform wallet_apply(p.user_id, 'topup', p.amount, p.order_id, 'Top up via ' || p.method || ' (' || p.provider || ')', p.external_id);
  end if;
  return p;
end $$;
revoke all on function payment_settle(text, text, jsonb) from public, anon, authenticated;
grant execute on function payment_settle(text, text, jsonb) to service_role;

-- ---------- Log panggilan (audit PDP: nomor tidak pernah dibagikan) ----------
create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  caller_id uuid not null references profiles(id),
  callee_id uuid not null references profiles(id),
  status text not null default 'ringing' check (status in ('ringing','answered','missed','declined','ended')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);
create index if not exists call_logs_callee_idx on call_logs(callee_id, started_at desc);
alter table call_logs enable row level security;
create policy call_logs_participants on call_logs for select to authenticated using (caller_id = auth.uid() or callee_id = auth.uid() or is_admin());
create policy call_logs_insert on call_logs for insert to authenticated with check (caller_id = auth.uid());
create policy call_logs_update on call_logs for update to authenticated using (caller_id = auth.uid() or callee_id = auth.uid()) with check (caller_id = auth.uid() or callee_id = auth.uid());
grant select, insert, update on call_logs to authenticated;
alter publication supabase_realtime add table call_logs;

-- ---------- create_order: dukung 'shop' ----------
create or replace function create_order(p jsonb)
returns orders language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_service service_type := (p->>'service')::service_type;
  v_pay payment_method := coalesce((p->>'payment_method')::payment_method, 'cash');
  v_merchant merchants%rowtype;
  v_pick_lat double precision; v_pick_lng double precision; v_pick_addr text;
  v_drop_lat double precision := (p->'dropoff'->>'lat')::double precision;
  v_drop_lng double precision := (p->'dropoff'->>'lng')::double precision;
  v_est jsonb; v_fare bigint; v_fee bigint; v_sub bigint := 0; v_disc bigint := 0; v_total bigint;
  v_item jsonb; v_menu menu_items%rowtype; v_order orders%rowtype; v_active int; v_bal bigint;
  v_budget bigint := 0;
  pr pricing%rowtype;
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  if not exists (select 1 from profiles where id = v_uid and is_active) then raise exception 'Akun nonaktif'; end if;
  select count(*) into v_active from orders where customer_id = v_uid and status in ('searching','accepted','arrived','in_progress');
  if v_active >= 3 then raise exception 'Maksimal 3 pesanan aktif'; end if;

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
  if v_pick_lat is null or v_drop_lat is null then raise exception 'Lokasi tidak lengkap'; end if;
  if v_service = 'shop' then
    if jsonb_array_length(coalesce(p->'shopping_list', '[]'::jsonb)) = 0 then raise exception 'Daftar belanja kosong'; end if;
    v_budget := greatest(0, coalesce((p->>'est_budget')::bigint, 0));
    if v_budget > 2000000 then raise exception 'Maksimal anggaran belanja Rp2.000.000'; end if;
  end if;

  v_est := estimate_fare(v_service, v_pick_lat, v_pick_lng, v_drop_lat, v_drop_lng, (p->>'route_km')::numeric);
  v_fare := (v_est->>'fare')::bigint; v_fee := (v_est->>'platform_fee')::bigint;
  select * into pr from pricing where service = v_service;

  insert into orders (service, customer_id, merchant_id, status, merchant_status,
    pickup_address, pickup_location, dropoff_address, dropoff_location,
    distance_km, duration_min, route_geometry, fare_delivery, platform_fee, payment_method,
    notes, recipient_name, recipient_phone, package_details, promo_code, shopping_list, est_budget, shop_store)
  values (v_service, v_uid, v_merchant.id, 'searching', case when v_service = 'food' then 'pending'::merchant_order_status else null end,
    v_pick_addr, st_setsrid(st_makepoint(v_pick_lng, v_pick_lat), 4326)::geography,
    p->'dropoff'->>'address', st_setsrid(st_makepoint(v_drop_lng, v_drop_lat), 4326)::geography,
    (v_est->>'distance_km')::numeric, coalesce((p->>'duration_min')::int, (v_est->>'duration_min')::int),
    p->'route_geometry', v_fare, v_fee, v_pay,
    p->>'notes', p->>'recipient_name', p->>'recipient_phone', p->'package_details', nullif(upper(p->>'promo_code'), ''),
    case when v_service = 'shop' then p->'shopping_list' else null end, v_budget, p->>'shop_store')
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
    v_sub := v_budget;   -- estimasi belanja; diperbarui driver setelah belanja (set_shop_total)
  end if;

  v_disc := apply_promo(v_order.promo_code, v_service, v_fare + case when v_service = 'food' then v_sub else 0 end);
  v_total := v_fare + v_fee + v_sub - v_disc;

  update orders set items_subtotal = v_sub, discount = v_disc, total = v_total,
    driver_earning = v_fare - floor(v_fare * pr.commission_pct / 100.0),
    merchant_earning = case when v_service = 'food' then v_sub - floor(v_sub * pr.merchant_commission_pct / 100.0) else 0 end
  where id = v_order.id returning * into v_order;

  if v_pay = 'wallet' then
    select balance into v_bal from wallets where user_id = v_uid for update;
    if coalesce(v_bal, 0) < v_total then raise exception 'Saldo AntarPay tidak cukup (Rp %). Silakan top up.', coalesce(v_bal,0); end if;
    perform wallet_apply(v_uid, 'payment', -v_total, v_order.id, 'Pembayaran ' || v_order.code);
    update orders set payment_status = 'paid' where id = v_order.id returning * into v_order;
  end if;
  if v_order.promo_code is not null then update promos set used_count = used_count + 1 where code = v_order.promo_code; end if;

  insert into order_events (order_id, status, actor_id, note) values (v_order.id, 'searching', v_uid, 'Pesanan dibuat, mencari driver');
  return v_order;
end $$;

-- ---------- Driver terima order: izinkan 'shop' semua kendaraan ----------
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
  update orders set driver_id = d.id, status = 'accepted', accepted_at = now()
  where id = p_order_id and status = 'searching'
    and ((service = 'ride_motor' and d.vehicle_type = 'motor') or (service = 'ride_car' and d.vehicle_type = 'car') or service in ('food','send','shop'))
  returning * into o;
  if not found then raise exception 'Order sudah diambil driver lain'; end if;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'accepted', d.id, 'Driver menerima pesanan');
  return o;
end $$;

create or replace function driver_available_orders()
returns table(id uuid, code text, service service_type, pickup_address text, dropoff_address text,
  pickup_lat double precision, pickup_lng double precision, dropoff_lat double precision, dropoff_lng double precision,
  distance_km numeric, fare_delivery bigint, items_subtotal bigint, total bigint, driver_earning bigint,
  payment_method payment_method, merchant_status merchant_order_status, created_at timestamptz, distance_to_pickup_km numeric, merchant_name text)
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
    round((st_distance(o.pickup_location, d.location) / 1000.0)::numeric, 2), coalesce(m.name, o.shop_store)
  from orders o left join merchants m on m.id = o.merchant_id
  where o.status = 'searching'
    and ((o.service = 'ride_motor' and d.vehicle_type = 'motor') or (o.service = 'ride_car' and d.vehicle_type = 'car') or o.service in ('food','send','shop'))
    and (o.merchant_status is null or o.merchant_status <> 'rejected')
    and d.location is not null
    and st_dwithin(o.pickup_location, d.location, v_radius * 1000)
  order by 18 asc limit 20;
end $$;

-- ---------- Driver: total belanja aktual (AntarShop) ----------
create or replace function set_shop_total(p_order_id uuid, p_amount bigint, p_receipt_url text default null)
returns orders language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_delta bigint; v_bal bigint; v_new_total bigint;
begin
  select * into o from orders where id = p_order_id for update;
  if not found or o.driver_id <> auth.uid() then raise exception 'Bukan order Anda'; end if;
  if o.service <> 'shop' then raise exception 'Bukan order belanja'; end if;
  if o.status not in ('arrived','in_progress') then raise exception 'Input total setelah tiba di toko'; end if;
  if p_amount < 0 or p_amount > greatest(o.est_budget * 1.5, o.est_budget + 100000) then
    raise exception 'Total belanja melebihi batas anggaran pelanggan (Rp %). Konfirmasi ke pelanggan dulu.', o.est_budget;
  end if;
  v_delta := p_amount - o.items_subtotal;
  v_new_total := o.total + v_delta;
  if o.payment_method = 'wallet' and v_delta <> 0 then
    if v_delta > 0 then
      select balance into v_bal from wallets where user_id = o.customer_id for update;
      if coalesce(v_bal, 0) < v_delta then raise exception 'Saldo pelanggan tidak cukup untuk selisih belanja Rp %', v_delta; end if;
      perform wallet_apply(o.customer_id, 'payment', -v_delta, o.id, 'Selisih belanja ' || o.code);
    else
      perform wallet_apply(o.customer_id, 'refund', -v_delta, o.id, 'Kelebihan anggaran belanja ' || o.code);
    end if;
  end if;
  update orders set items_subtotal = p_amount, total = v_new_total, receipt_url = coalesce(p_receipt_url, receipt_url) where id = o.id returning * into o;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'shop_total', auth.uid(), 'Total belanja Rp' || p_amount);
  return o;
end $$;

-- ---------- Tip dari pelanggan ----------
create or replace function add_tip(p_order_id uuid, p_amount bigint)
returns orders language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_bal bigint;
begin
  if p_amount < 1000 or p_amount > 500000 then raise exception 'Tip antara Rp1.000 – Rp500.000'; end if;
  select * into o from orders where id = p_order_id for update;
  if not found or o.customer_id <> auth.uid() then raise exception 'Bukan pesanan Anda'; end if;
  if o.driver_id is null or o.status = 'cancelled' then raise exception 'Belum ada driver'; end if;
  select balance into v_bal from wallets where user_id = o.customer_id for update;
  if coalesce(v_bal, 0) < p_amount then raise exception 'Saldo AntarPay tidak cukup untuk tip'; end if;
  perform wallet_apply(o.customer_id, 'payment', -p_amount, o.id, 'Tip driver ' || o.code);
  if o.status = 'completed' then
    perform wallet_apply(o.driver_id, 'earning', p_amount, o.id, 'Tip dari pelanggan ' || o.code);
    update orders set tip = tip + p_amount, driver_earning = driver_earning + p_amount where id = o.id returning * into o;
  else
    update orders set tip = tip + p_amount where id = o.id returning * into o;   -- dibayar ke driver saat selesai
  end if;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'tip', auth.uid(), 'Tip Rp' || p_amount);
  return o;
end $$;

-- ---------- Biaya tambahan (parkir/tol/tunggu) diajukan driver, disetujui pelanggan ----------
create or replace function request_extra(p_order_id uuid, p_kind text, p_amount bigint, p_note text default null)
returns orders language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_extra jsonb;
begin
  if p_kind not in ('parking','toll','waiting','other') then raise exception 'Jenis biaya tidak dikenal'; end if;
  if p_amount < 1000 or p_amount > 200000 then raise exception 'Nominal antara Rp1.000 – Rp200.000'; end if;
  select * into o from orders where id = p_order_id for update;
  if not found or o.driver_id <> auth.uid() then raise exception 'Bukan order Anda'; end if;
  if o.status not in ('accepted','arrived','in_progress') then raise exception 'Order tidak aktif'; end if;
  if (select count(*) from jsonb_array_elements(o.extras) e where e->>'status' = 'pending') >= 3 then raise exception 'Tunggu persetujuan biaya sebelumnya'; end if;
  v_extra := jsonb_build_object('id', gen_random_uuid(), 'kind', p_kind, 'amount', p_amount, 'note', p_note, 'status', 'pending', 'created_at', now());
  update orders set extras = extras || v_extra where id = o.id returning * into o;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'extra_requested', auth.uid(), p_kind || ' Rp' || p_amount);
  return o;
end $$;

create or replace function respond_extra(p_order_id uuid, p_extra_id uuid, p_approve boolean)
returns orders language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_extra jsonb; v_amount bigint; v_bal bigint; v_new jsonb := '[]'::jsonb; e jsonb;
begin
  select * into o from orders where id = p_order_id for update;
  if not found or o.customer_id <> auth.uid() then raise exception 'Bukan pesanan Anda'; end if;
  select x into v_extra from jsonb_array_elements(o.extras) x where (x->>'id')::uuid = p_extra_id and x->>'status' = 'pending';
  if v_extra is null then raise exception 'Permintaan biaya tidak ditemukan'; end if;
  v_amount := (v_extra->>'amount')::bigint;
  if p_approve and o.payment_method = 'wallet' then
    select balance into v_bal from wallets where user_id = o.customer_id for update;
    if coalesce(v_bal, 0) < v_amount then raise exception 'Saldo AntarPay tidak cukup (Rp %)', coalesce(v_bal, 0); end if;
    perform wallet_apply(o.customer_id, 'payment', -v_amount, o.id, 'Biaya tambahan ' || (v_extra->>'kind') || ' ' || o.code);
  end if;
  for e in select x from jsonb_array_elements(o.extras) x loop
    if (e->>'id')::uuid = p_extra_id then e := e || jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end, 'responded_at', now()); end if;
    v_new := v_new || e;
  end loop;
  update orders set extras = v_new,
    extras_total = extras_total + case when p_approve then v_amount else 0 end,
    total = total + case when p_approve then v_amount else 0 end
  where id = o.id returning * into o;
  insert into order_events (order_id, status, actor_id, note) values (o.id, case when p_approve then 'extra_approved' else 'extra_rejected' end, auth.uid(), (v_extra->>'kind') || ' Rp' || v_amount);
  return o;
end $$;

-- ---------- Penyelesaian order: tip + biaya tambahan + reimburse belanja ----------
create or replace function driver_update_order_status(p_order_id uuid, p_status order_status)
returns orders language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; pr pricing%rowtype; v_fee bigint; v_comm bigint; v_owner uuid; v_extra_driver bigint; v_session pricing_sessions; v_bonus bigint := 0;
begin
  select * into o from orders where id = p_order_id for update;
  if not found or o.driver_id <> auth.uid() then raise exception 'Bukan order Anda'; end if;
  if not ((o.status = 'accepted' and p_status = 'arrived') or (o.status = 'arrived' and p_status = 'in_progress')
       or (o.status = 'in_progress' and p_status = 'completed')) then
    raise exception 'Transisi status % -> % tidak valid', o.status, p_status;
  end if;
  if p_status = 'in_progress' and o.service = 'food' and o.merchant_status not in ('ready') then
    raise exception 'Tunggu merchant menandai pesanan siap';
  end if;

  update orders set status = p_status,
    arrived_at = case when p_status = 'arrived' then now() else arrived_at end,
    started_at = case when p_status = 'in_progress' then now() else started_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    payment_status = case when p_status = 'completed' then 'paid' else payment_status end
  where id = o.id returning * into o;
  insert into order_events (order_id, status, actor_id) values (o.id, p_status::text, auth.uid());

  if p_status = 'completed' then
    select * into pr from pricing where service = o.service;
    v_comm := o.fare_delivery - o.driver_earning;      -- komisi platform dari tarif
    v_extra_driver := o.tip + o.extras_total;          -- 100% ke driver
    -- bonus sesi sibuk (porsi tambahan driver dari kenaikan tarif) — dari komisi platform
    v_session := current_pricing_session(o.service, o.created_at);
    if v_session.id is not null and v_session.driver_bonus_pct > 0 then
      v_bonus := least(v_comm, floor(o.fare_delivery * v_session.driver_bonus_pct / 100.0));
      v_comm := v_comm - v_bonus;
    end if;
    update orders set driver_earning = driver_earning + v_extra_driver + v_bonus where id = o.id returning * into o;
    if o.payment_method = 'wallet' then
      perform wallet_apply(o.driver_id, 'earning', o.driver_earning, o.id, 'Pendapatan ' || o.code);
      if o.service = 'shop' and o.items_subtotal > 0 then
        perform wallet_apply(o.driver_id, 'earning', o.items_subtotal, o.id, 'Penggantian belanja ' || o.code);
      end if;
      if o.merchant_id is not null then
        select owner_id into v_owner from merchants where id = o.merchant_id;
        if v_owner is not null and o.merchant_earning > 0 then
          perform wallet_apply(v_owner, 'earning', o.merchant_earning, o.id, 'Penjualan ' || o.code);
        end if;
      end if;
    else
      -- Cash: driver terima tunai (termasuk tip/biaya tambahan/belanja); potongan platform didebet dari saldo driver
      v_fee := v_comm + o.platform_fee;
      if v_fee > 0 then perform wallet_apply(o.driver_id, 'fee', -v_fee, o.id, 'Potongan platform ' || o.code); end if;
      if o.tip > 0 then
        -- tip pesanan tunai dibayar via wallet pelanggan (sudah didebet saat add_tip) → teruskan ke driver
        perform wallet_apply(o.driver_id, 'earning', o.tip, o.id, 'Tip dari pelanggan ' || o.code);
      end if;
    end if;
    perform set_config('antaraja.bypass', 'on', true);
    update drivers set total_trips = total_trips + 1 where id = o.driver_id;
    perform set_config('antaraja.bypass', 'off', true);
  end if;
  return o;
end $$;

-- ---------- Bahasa pengguna ----------
create or replace function set_locale(p_locale text)
returns void language sql security definer set search_path = public as $$
  update profiles set locale = case when p_locale in ('id','en','zh','ar') then p_locale else 'id' end where id = auth.uid();
$$;

-- ---------- Grant fungsi baru (default privilege sudah mencabut public/anon) ----------
grant execute on function current_pricing_session(service_type, timestamptz) to authenticated, anon;
grant execute on function pricing_suggestions(numeric) to authenticated;
grant execute on function set_shop_total(uuid, bigint, text) to authenticated;
grant execute on function add_tip(uuid, bigint) to authenticated;
grant execute on function request_extra(uuid, text, bigint, text) to authenticated;
grant execute on function respond_extra(uuid, uuid, boolean) to authenticated;
grant execute on function set_locale(text) to authenticated;
grant execute on function calc_fare(service_type, numeric) to anon, authenticated;
grant execute on function estimate_fare(service_type, double precision, double precision, double precision, double precision, numeric) to anon, authenticated;
grant execute on function create_order(jsonb) to authenticated;
grant execute on function driver_accept_order(uuid) to authenticated;
grant execute on function driver_available_orders() to authenticated;
grant execute on function driver_update_order_status(uuid, order_status) to authenticated;
