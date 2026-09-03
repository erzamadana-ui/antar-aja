-- =====================================================================
-- Antar Aja — kolom turunan, fungsi bisnis (RPC), realtime, dan RLS
-- =====================================================================

-- ---------- Kolom lat/lng turunan agar mudah dibaca klien ----------
alter table drivers
  add column lat double precision generated always as (st_y(location::geometry)) stored,
  add column lng double precision generated always as (st_x(location::geometry)) stored;
alter table merchants
  add column lat double precision generated always as (st_y(location::geometry)) stored,
  add column lng double precision generated always as (st_x(location::geometry)) stored;
alter table orders
  add column pickup_lat double precision generated always as (st_y(pickup_location::geometry)) stored,
  add column pickup_lng double precision generated always as (st_x(pickup_location::geometry)) stored,
  add column dropoff_lat double precision generated always as (st_y(dropoff_location::geometry)) stored,
  add column dropoff_lng double precision generated always as (st_x(dropoff_location::geometry)) stored;

create table withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount bigint not null check (amount >= 20000),
  bank_name text not null,
  bank_account text not null,
  account_name text not null,
  status topup_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index on withdrawal_requests(status, created_at desc);

-- ---------- Helper ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and is_active)
$$;

create or replace function is_approved_driver() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from drivers where id = auth.uid() and status = 'approved')
$$;

create or replace function owns_merchant(p_merchant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from merchants where id = p_merchant and owner_id = auth.uid())
$$;

create or replace function setting_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (value)::text::numeric from app_settings where key = p_key), p_default)
$$;

create or replace function round_to(p bigint, step bigint) returns bigint
language sql immutable as $$ select ((p + step/2) / step) * step $$;

-- Lindungi kolom sensitif profiles dari perubahan user biasa
create or replace function guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('antaraja.bypass', true) = 'on' then return new; end if;
  if not is_admin() then
    if new.role <> old.role or new.is_active <> old.is_active then
      raise exception 'Tidak boleh mengubah role/status akun';
    end if;
  end if;
  return new;
end $$;
create trigger t_guard_profile before update on profiles for each row execute function guard_profile_update();

-- Driver hanya boleh ubah kolom non-sensitif langsung; status lewat admin
create or replace function guard_driver_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('antaraja.bypass', true) = 'on' then return new; end if;
  if not is_admin() then
    if new.status <> old.status or new.rating_avg <> old.rating_avg or new.rating_count <> old.rating_count
       or new.total_trips <> old.total_trips then
      raise exception 'Kolom ini hanya bisa diubah admin';
    end if;
  end if;
  return new;
end $$;
create trigger t_guard_driver before update on drivers for each row execute function guard_driver_update();

create or replace function guard_merchant_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('antaraja.bypass', true) = 'on' then return new; end if;
  if not is_admin() then
    if new.status <> old.status or new.rating_avg <> old.rating_avg or new.rating_count <> old.rating_count
       or new.owner_id is distinct from old.owner_id then
      raise exception 'Kolom ini hanya bisa diubah admin';
    end if;
  end if;
  return new;
end $$;
create trigger t_guard_merchant before update on merchants for each row execute function guard_merchant_update();

-- ---------- Wallet (internal, dipanggil fungsi lain) ----------
create or replace function wallet_apply(p_user uuid, p_type wallet_tx_type, p_amount bigint, p_order uuid, p_note text, p_ref text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_bal bigint;
begin
  perform 1 from wallets where user_id = p_user for update;
  if not found then insert into wallets(user_id) values (p_user); end if;
  update wallets set balance = balance + p_amount where user_id = p_user returning balance into v_bal;
  insert into wallet_transactions(user_id, type, amount, balance_after, order_id, note, ref)
  values (p_user, p_type, p_amount, v_bal, p_order, p_note, p_ref);
  return v_bal;
end $$;
revoke all on function wallet_apply from public, anon, authenticated;

-- ---------- Estimasi tarif ----------
create or replace function calc_fare(p_service service_type, p_km numeric)
returns table(fare bigint, platform_fee bigint) language plpgsql stable security definer set search_path = public as $$
declare p pricing%rowtype;
begin
  select * into p from pricing where service = p_service;
  if not found then raise exception 'Tarif % belum diatur', p_service; end if;
  fare := round_to(greatest(p.min_fare, p.base_fare + ceil(p.per_km * p_km))::bigint, 500);
  fare := round_to((fare * p.surge_multiplier)::bigint, 500);
  platform_fee := p.platform_fee;
  return next;
end $$;

create or replace function estimate_fare(
  p_service service_type, p_pickup_lat double precision, p_pickup_lng double precision,
  p_drop_lat double precision, p_drop_lng double precision, p_route_km numeric default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_straight numeric; v_km numeric; v_fare bigint; v_fee bigint; v_ratio numeric;
begin
  v_straight := st_distance(
    st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    st_setsrid(st_makepoint(p_drop_lng, p_drop_lat), 4326)::geography) / 1000.0;
  v_ratio := setting_num('max_route_ratio', 2.5);
  v_km := coalesce(p_route_km, v_straight * 1.3);
  v_km := least(greatest(v_km, v_straight), greatest(v_straight * v_ratio, 0.5));
  v_km := round(v_km, 2);
  select fare, platform_fee into v_fare, v_fee from calc_fare(p_service, v_km);
  return jsonb_build_object('distance_km', v_km, 'straight_km', round(v_straight, 2),
    'fare', v_fare, 'platform_fee', v_fee, 'total', v_fare + v_fee,
    'duration_min', greatest(3, ceil(v_km / 25.0 * 60)));
end $$;

-- ---------- Promo ----------
create or replace function apply_promo(p_code text, p_service service_type, p_subtotal bigint)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare pr promos%rowtype; v_disc bigint;
begin
  if p_code is null or p_code = '' then return 0; end if;
  select * into pr from promos where code = upper(p_code) and is_active
    and (valid_from is null or valid_from <= now()) and (valid_to is null or valid_to >= now())
    and (service is null or service = p_service) and (quota is null or used_count < quota);
  if not found then raise exception 'Kode promo tidak valid / kedaluwarsa'; end if;
  if p_subtotal < pr.min_total then raise exception 'Minimal transaksi promo Rp %', pr.min_total; end if;
  if pr.discount_type = 'percent' then v_disc := floor(p_subtotal * pr.value / 100.0); else v_disc := pr.value; end if;
  if pr.max_discount is not null then v_disc := least(v_disc, pr.max_discount); end if;
  return least(v_disc, p_subtotal);
end $$;

-- ---------- Buat order ----------
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

  v_est := estimate_fare(v_service, v_pick_lat, v_pick_lng, v_drop_lat, v_drop_lng, (p->>'route_km')::numeric);
  v_fare := (v_est->>'fare')::bigint; v_fee := (v_est->>'platform_fee')::bigint;
  select * into pr from pricing where service = v_service;

  insert into orders (service, customer_id, merchant_id, status, merchant_status,
    pickup_address, pickup_location, dropoff_address, dropoff_location,
    distance_km, duration_min, route_geometry, fare_delivery, platform_fee, payment_method,
    notes, recipient_name, recipient_phone, package_details, promo_code)
  values (v_service, v_uid, v_merchant.id, 'searching', case when v_service = 'food' then 'pending'::merchant_order_status else null end,
    v_pick_addr, st_setsrid(st_makepoint(v_pick_lng, v_pick_lat), 4326)::geography,
    p->'dropoff'->>'address', st_setsrid(st_makepoint(v_drop_lng, v_drop_lat), 4326)::geography,
    (v_est->>'distance_km')::numeric, coalesce((p->>'duration_min')::int, (v_est->>'duration_min')::int),
    p->'route_geometry', v_fare, v_fee, v_pay,
    p->>'notes', p->>'recipient_name', p->>'recipient_phone', p->'package_details', nullif(upper(p->>'promo_code'), ''))
  returning * into v_order;

  if v_service = 'food' then
    for v_item in select * from jsonb_array_elements(p->'items') loop
      select * into v_menu from menu_items where id = (v_item->>'menu_item_id')::uuid and merchant_id = v_merchant.id and is_available;
      if not found then raise exception 'Menu tidak tersedia'; end if;
      insert into order_items (order_id, menu_item_id, name, price, qty, notes)
      values (v_order.id, v_menu.id, v_menu.name, v_menu.price, greatest(1, (v_item->>'qty')::int), v_item->>'notes');
      v_sub := v_sub + v_menu.price * greatest(1, (v_item->>'qty')::int);
    end loop;
  end if;

  v_disc := apply_promo(v_order.promo_code, v_service, v_fare + v_sub);
  v_total := v_fare + v_fee + v_sub - v_disc;

  update orders set items_subtotal = v_sub, discount = v_disc, total = v_total,
    driver_earning = v_fare - floor(v_fare * pr.commission_pct / 100.0),
    merchant_earning = v_sub - floor(v_sub * pr.merchant_commission_pct / 100.0)
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

-- ---------- Batalkan order ----------
create or replace function cancel_order(p_order_id uuid, p_reason text default null)
returns orders language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); o orders%rowtype; v_admin boolean := is_admin();
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;
  if o.status in ('completed','cancelled') then raise exception 'Order sudah selesai/batal'; end if;

  if o.driver_id = v_uid and not v_admin then
    -- Driver membatalkan: order kembali dicari driver lain
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
  if o.payment_status = 'refunded' then
    perform wallet_apply(o.customer_id, 'refund', o.total, o.id, 'Refund pembatalan ' || o.code);
  end if;
  if o.promo_code is not null then update promos set used_count = greatest(0, used_count - 1) where code = o.promo_code; end if;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'cancelled', v_uid, p_reason);
  return o;
end $$;

-- ---------- Driver: status online & lokasi ----------
create or replace function driver_set_online(p_online boolean, p_lat double precision default null, p_lng double precision default null)
returns drivers language plpgsql security definer set search_path = public as $$
declare d drivers%rowtype;
begin
  select * into d from drivers where id = auth.uid();
  if not found then raise exception 'Belum terdaftar sebagai driver'; end if;
  if d.status <> 'approved' and p_online then raise exception 'Akun driver belum disetujui admin'; end if;
  update drivers set is_online = p_online, last_seen_at = now(),
    location = case when p_lat is not null then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography else location end
  where id = d.id returning * into d;
  return d;
end $$;

create or replace function driver_update_location(p_lat double precision, p_lng double precision, p_heading real default null)
returns void language sql security definer set search_path = public as $$
  update drivers set location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    heading = coalesce(p_heading, heading), last_seen_at = now()
  where id = auth.uid();
$$;

-- Driver di sekitar (untuk peta customer) — hanya posisi, tanpa data pribadi
create or replace function nearby_drivers(p_lat double precision, p_lng double precision, p_vehicle vehicle_type default null, p_radius_km numeric default 5)
returns table(id uuid, lat double precision, lng double precision, heading real, vehicle_type vehicle_type, distance_km numeric)
language sql stable security definer set search_path = public as $$
  select d.id, d.lat, d.lng, d.heading, d.vehicle_type,
    round((st_distance(d.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0)::numeric, 2)
  from drivers d
  where d.is_online and d.status = 'approved' and d.location is not null
    and d.last_seen_at > now() - interval '5 minutes'
    and (p_vehicle is null or d.vehicle_type = p_vehicle)
    and st_dwithin(d.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
  order by 6 limit 30
$$;

-- Order yang bisa diambil driver (dalam radius, sesuai kendaraan)
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
    round((st_distance(o.pickup_location, d.location) / 1000.0)::numeric, 2), m.name
  from orders o left join merchants m on m.id = o.merchant_id
  where o.status = 'searching'
    and ((o.service = 'ride_motor' and d.vehicle_type = 'motor') or (o.service = 'ride_car' and d.vehicle_type = 'car') or o.service in ('food','send'))
    and (o.merchant_status is null or o.merchant_status <> 'rejected')
    and d.location is not null
    and st_dwithin(o.pickup_location, d.location, v_radius * 1000)
  order by 18 asc limit 20;
end $$;

-- ---------- Driver terima order (atomik, anti rebutan) ----------
create or replace function driver_accept_order(p_order_id uuid)
returns orders language plpgsql security definer set search_path = public as $$
declare d drivers%rowtype; o orders%rowtype; v_active int;
begin
  select * into d from drivers where id = auth.uid();
  if not found or d.status <> 'approved' then raise exception 'Akun driver belum aktif'; end if;
  if not d.is_online then raise exception 'Aktifkan status online dulu'; end if;
  select count(*) into v_active from orders where driver_id = d.id and status in ('accepted','arrived','in_progress');
  if v_active > 0 then raise exception 'Selesaikan order aktif dulu'; end if;

  update orders set driver_id = d.id, status = 'accepted', accepted_at = now()
  where id = p_order_id and status = 'searching'
    and ((service = 'ride_motor' and d.vehicle_type = 'motor') or (service = 'ride_car' and d.vehicle_type = 'car') or service in ('food','send'))
  returning * into o;
  if not found then raise exception 'Order sudah diambil driver lain'; end if;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'accepted', d.id, 'Driver menerima pesanan');
  return o;
end $$;

-- ---------- Driver update progres ----------
create or replace function driver_update_order_status(p_order_id uuid, p_status order_status)
returns orders language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; pr pricing%rowtype; v_fee bigint; v_comm bigint; v_owner uuid;
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
    if o.payment_method = 'wallet' then
      perform wallet_apply(o.driver_id, 'earning', o.driver_earning, o.id, 'Pendapatan ' || o.code);
      if o.merchant_id is not null then
        select owner_id into v_owner from merchants where id = o.merchant_id;
        if v_owner is not null and o.merchant_earning > 0 then
          perform wallet_apply(v_owner, 'earning', o.merchant_earning, o.id, 'Penjualan ' || o.code);
        end if;
      end if;
    else
      -- Cash: driver terima tunai dari customer; potongan platform (komisi + biaya layanan) didebet dari saldo driver
      v_fee := v_comm + o.platform_fee;
      if v_fee > 0 then perform wallet_apply(o.driver_id, 'fee', -v_fee, o.id, 'Potongan platform ' || o.code); end if;
    end if;
    perform set_config('antaraja.bypass', 'on', true);
    update drivers set total_trips = total_trips + 1 where id = o.driver_id;
    perform set_config('antaraja.bypass', 'off', true);
  end if;
  return o;
end $$;

-- ---------- Merchant: proses pesanan ----------
create or replace function merchant_update_order(p_order_id uuid, p_status merchant_order_status)
returns orders language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order_id for update;
  if not found or not owns_merchant(o.merchant_id) then raise exception 'Bukan pesanan merchant Anda'; end if;
  if o.status in ('completed','cancelled') then raise exception 'Order sudah selesai/batal'; end if;
  if not ((o.merchant_status = 'pending' and p_status in ('accepted','rejected')) or (o.merchant_status = 'accepted' and p_status = 'ready')) then
    raise exception 'Transisi % -> % tidak valid', o.merchant_status, p_status;
  end if;
  update orders set merchant_status = p_status where id = o.id returning * into o;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'merchant_' || p_status::text, auth.uid(), null);
  if p_status = 'rejected' then
    update orders set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'Merchant menolak pesanan',
      payment_status = case when payment_status = 'paid' then 'refunded' else payment_status end
    where id = o.id returning * into o;
    if o.payment_status = 'refunded' then perform wallet_apply(o.customer_id, 'refund', o.total, o.id, 'Refund ' || o.code); end if;
    insert into order_events (order_id, status, actor_id, note) values (o.id, 'cancelled', auth.uid(), 'Merchant menolak');
  end if;
  return o;
end $$;

-- ---------- Rating ----------
create or replace function rate_order(p_order_id uuid, p_kind text, p_stars int, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_ratee uuid;
begin
  select * into o from orders where id = p_order_id;
  if not found or o.customer_id <> auth.uid() then raise exception 'Bukan order Anda'; end if;
  if o.status <> 'completed' then raise exception 'Order belum selesai'; end if;
  v_ratee := case when p_kind = 'driver' then o.driver_id else o.merchant_id end;
  if v_ratee is null then raise exception 'Tidak ada yang dinilai'; end if;
  insert into ratings (order_id, rater_id, ratee_id, ratee_kind, stars, comment)
  values (o.id, auth.uid(), v_ratee, p_kind, p_stars, p_comment)
  on conflict (order_id, rater_id, ratee_kind) do update set stars = excluded.stars, comment = excluded.comment;
  perform set_config('antaraja.bypass', 'on', true);
  if p_kind = 'driver' then
    update drivers set rating_avg = s.avg, rating_count = s.cnt from
      (select round(avg(stars)::numeric, 2) as avg, count(*) as cnt from ratings where ratee_id = v_ratee and ratee_kind = 'driver') s
    where id = v_ratee;
  else
    update merchants set rating_avg = s.avg, rating_count = s.cnt from
      (select round(avg(stars)::numeric, 2) as avg, count(*) as cnt from ratings where ratee_id = v_ratee and ratee_kind = 'merchant') s
    where id = v_ratee;
  end if;
  perform set_config('antaraja.bypass', 'off', true);
end $$;

-- ---------- Pendaftaran mitra ----------
create or replace function register_driver(p jsonb)
returns drivers language plpgsql security definer set search_path = public as $$
declare d drivers%rowtype;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  insert into drivers (id, vehicle_type, vehicle_brand, vehicle_plate, vehicle_color, license_number, id_card_number, photo_id_url, photo_vehicle_url)
  values (auth.uid(), coalesce((p->>'vehicle_type')::vehicle_type, 'motor'), p->>'vehicle_brand', upper(p->>'vehicle_plate'),
    p->>'vehicle_color', p->>'license_number', p->>'id_card_number', p->>'photo_id_url', p->>'photo_vehicle_url')
  on conflict (id) do update set vehicle_type = excluded.vehicle_type, vehicle_brand = excluded.vehicle_brand,
    vehicle_plate = excluded.vehicle_plate, vehicle_color = excluded.vehicle_color, license_number = excluded.license_number,
    id_card_number = excluded.id_card_number, photo_id_url = excluded.photo_id_url, photo_vehicle_url = excluded.photo_vehicle_url,
    status = case when drivers.status = 'suspended' then 'suspended' else 'pending' end
  returning * into d;
  perform set_config('antaraja.bypass', 'on', true);
  update profiles set role = 'driver' where id = auth.uid() and role = 'customer';
  perform set_config('antaraja.bypass', 'off', true);
  return d;
end $$;

create or replace function register_merchant(p jsonb)
returns merchants language plpgsql security definer set search_path = public as $$
declare m merchants%rowtype;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if exists (select 1 from merchants where owner_id = auth.uid()) then raise exception 'Anda sudah punya merchant'; end if;
  insert into merchants (owner_id, name, description, category, address, location, image_url, prep_minutes, opening_hours)
  values (auth.uid(), p->>'name', p->>'description', coalesce(p->>'category', 'Makanan'), p->>'address',
    st_setsrid(st_makepoint((p->>'lng')::double precision, (p->>'lat')::double precision), 4326)::geography,
    p->>'image_url', coalesce((p->>'prep_minutes')::int, 15), coalesce(p->>'opening_hours', '08:00-22:00'))
  returning * into m;
  perform set_config('antaraja.bypass', 'on', true);
  update profiles set role = 'merchant' where id = auth.uid() and role = 'customer';
  perform set_config('antaraja.bypass', 'off', true);
  return m;
end $$;

create or replace function merchant_set_location(p_lat double precision, p_lng double precision, p_address text default null)
returns void language sql security definer set search_path = public as $$
  update merchants set location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, address = coalesce(p_address, address)
  where owner_id = auth.uid();
$$;

-- Merchant di sekitar customer
create or replace function nearby_merchants(p_lat double precision, p_lng double precision, p_radius_km numeric default 15, p_q text default null)
returns table(id uuid, name text, description text, category text, address text, image_url text, is_open boolean,
  rating_avg numeric, rating_count int, prep_minutes int, lat double precision, lng double precision, distance_km numeric, delivery_fee bigint)
language sql stable security definer set search_path = public as $$
  select m.id, m.name, m.description, m.category, m.address, m.image_url, m.is_open, m.rating_avg, m.rating_count, m.prep_minutes,
    m.lat, m.lng,
    round((st_distance(m.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0)::numeric, 2),
    (select fare from calc_fare('food'::service_type, (greatest(0.5, st_distance(m.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0 * 1.3))::numeric))
  from merchants m
  where m.status = 'approved' and m.location is not null
    and st_dwithin(m.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
    and (p_q is null or p_q = '' or m.name ilike '%' || p_q || '%' or m.category ilike '%' || p_q || '%'
         or exists (select 1 from menu_items mi where mi.merchant_id = m.id and mi.name ilike '%' || p_q || '%'))
  order by 13 limit 50
$$;

-- ---------- Wallet: top up & tarik saldo ----------
create or replace function request_topup(p_amount bigint, p_method text default 'bank_transfer', p_proof_url text default null, p_note text default null)
returns topup_requests language plpgsql security definer set search_path = public as $$
declare t topup_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if (select count(*) from topup_requests where user_id = auth.uid() and status = 'pending') >= 3 then
    raise exception 'Masih ada permintaan top up yang menunggu verifikasi';
  end if;
  insert into topup_requests (user_id, amount, method, proof_url, sender_note) values (auth.uid(), p_amount, p_method, p_proof_url, p_note) returning * into t;
  return t;
end $$;

create or replace function request_withdrawal(p_amount bigint, p_bank text, p_account text, p_name text)
returns withdrawal_requests language plpgsql security definer set search_path = public as $$
declare w withdrawal_requests%rowtype; v_bal bigint;
begin
  select balance into v_bal from wallets where user_id = auth.uid() for update;
  if coalesce(v_bal,0) < p_amount then raise exception 'Saldo tidak cukup'; end if;
  perform wallet_apply(auth.uid(), 'withdrawal', -p_amount, null, 'Penarikan saldo (menunggu proses)');
  insert into withdrawal_requests (user_id, amount, bank_name, bank_account, account_name) values (auth.uid(), p_amount, p_bank, p_account, p_name) returning * into w;
  return w;
end $$;

-- ---------- Admin ----------
create or replace function admin_review_topup(p_id uuid, p_approve boolean, p_note text default null)
returns topup_requests language plpgsql security definer set search_path = public as $$
declare t topup_requests%rowtype;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  select * into t from topup_requests where id = p_id for update;
  if not found or t.status <> 'pending' then raise exception 'Permintaan tidak valid'; end if;
  update topup_requests set status = case when p_approve then 'approved' else 'rejected' end::topup_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_id returning * into t;
  if p_approve then perform wallet_apply(t.user_id, 'topup', t.amount, null, 'Top up AntarPay', t.id::text); end if;
  return t;
end $$;

create or replace function admin_review_withdrawal(p_id uuid, p_approve boolean, p_note text default null)
returns withdrawal_requests language plpgsql security definer set search_path = public as $$
declare w withdrawal_requests%rowtype;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  select * into w from withdrawal_requests where id = p_id for update;
  if not found or w.status <> 'pending' then raise exception 'Permintaan tidak valid'; end if;
  update withdrawal_requests set status = case when p_approve then 'approved' else 'rejected' end::topup_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_id returning * into w;
  if not p_approve then perform wallet_apply(w.user_id, 'refund', w.amount, null, 'Penarikan ditolak, saldo dikembalikan', w.id::text); end if;
  return w;
end $$;

create or replace function admin_set_driver_status(p_driver uuid, p_status approval_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  perform set_config('antaraja.bypass', 'on', true);
  update drivers set status = p_status, is_online = case when p_status = 'approved' then is_online else false end where id = p_driver;
  perform set_config('antaraja.bypass', 'off', true);
end $$;

create or replace function admin_set_merchant_status(p_merchant uuid, p_status approval_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  perform set_config('antaraja.bypass', 'on', true);
  update merchants set status = p_status where id = p_merchant;
  perform set_config('antaraja.bypass', 'off', true);
end $$;

create or replace function admin_set_user(p_user uuid, p_role user_role default null, p_active boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  perform set_config('antaraja.bypass', 'on', true);
  update profiles set role = coalesce(p_role, role), is_active = coalesce(p_active, is_active) where id = p_user;
  perform set_config('antaraja.bypass', 'off', true);
end $$;

create or replace function admin_adjust_wallet(p_user uuid, p_amount bigint, p_note text)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  return wallet_apply(p_user, 'adjustment', p_amount, null, coalesce(p_note, 'Penyesuaian admin'));
end $$;

create or replace function admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  return jsonb_build_object(
    'users', (select count(*) from profiles),
    'drivers_total', (select count(*) from drivers),
    'drivers_pending', (select count(*) from drivers where status = 'pending'),
    'drivers_online', (select count(*) from drivers where is_online and status = 'approved'),
    'merchants_total', (select count(*) from merchants),
    'merchants_pending', (select count(*) from merchants where status = 'pending'),
    'orders_today', (select count(*) from orders where created_at::date = current_date),
    'orders_active', (select count(*) from orders where status in ('searching','accepted','arrived','in_progress')),
    'gmv_today', (select coalesce(sum(total),0) from orders where status = 'completed' and completed_at::date = current_date),
    'gmv_month', (select coalesce(sum(total),0) from orders where status = 'completed' and date_trunc('month', completed_at) = date_trunc('month', now())),
    'revenue_month', (select coalesce(sum(platform_fee + (fare_delivery - driver_earning) + (items_subtotal - merchant_earning)),0) from orders where status = 'completed' and date_trunc('month', completed_at) = date_trunc('month', now())),
    'topups_pending', (select count(*) from topup_requests where status = 'pending'),
    'withdrawals_pending', (select count(*) from withdrawal_requests where status = 'pending'),
    'orders_by_service', (select coalesce(jsonb_object_agg(service, c), '{}'::jsonb) from (select service, count(*) c from orders where created_at > now() - interval '30 days' group by 1) s),
    'orders_last7', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'count', (select count(*) from orders where created_at::date = d::date))), '[]'::jsonb)
                     from generate_series(current_date - 6, current_date, interval '1 day') d)
  );
end $$;

-- ---------- Ringkasan pendapatan driver ----------
create or replace function driver_earnings_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', (select coalesce(sum(driver_earning),0) from orders where driver_id = auth.uid() and status = 'completed' and completed_at::date = current_date),
    'today_trips', (select count(*) from orders where driver_id = auth.uid() and status = 'completed' and completed_at::date = current_date),
    'week', (select coalesce(sum(driver_earning),0) from orders where driver_id = auth.uid() and status = 'completed' and completed_at > now() - interval '7 days'),
    'month', (select coalesce(sum(driver_earning),0) from orders where driver_id = auth.uid() and status = 'completed' and date_trunc('month', completed_at) = date_trunc('month', now())),
    'balance', (select balance from wallets where user_id = auth.uid())
  )
$$;

-- ---------- Realtime ----------
alter publication supabase_realtime add table orders, order_events, order_messages, drivers;
alter table orders replica identity full;
alter table drivers replica identity full;

-- =====================================================================
-- RLS
-- =====================================================================
alter table profiles enable row level security;
alter table wallets enable row level security;
alter table wallet_transactions enable row level security;
alter table topup_requests enable row level security;
alter table withdrawal_requests enable row level security;
alter table drivers enable row level security;
alter table merchants enable row level security;
alter table menu_items enable row level security;
alter table pricing enable row level security;
alter table promos enable row level security;
alter table app_settings enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_events enable row level security;
alter table order_messages enable row level security;
alter table ratings enable row level security;
alter table saved_places enable row level security;

-- profiles: diri sendiri, admin, atau lawan transaksi (driver <-> customer) dan pemilik merchant dari order
create policy profiles_select on profiles for select to authenticated using (
  id = auth.uid() or is_admin()
  or exists (select 1 from orders o where (o.customer_id = auth.uid() and o.driver_id = profiles.id)
                                       or (o.driver_id = auth.uid() and o.customer_id = profiles.id)
                                       or (o.customer_id = profiles.id and owns_merchant(o.merchant_id)))
);
create policy profiles_update_own on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- wallets & transaksi: hanya milik sendiri + admin (mutasi lewat RPC)
create policy wallets_select on wallets for select to authenticated using (user_id = auth.uid() or is_admin());
create policy wtx_select on wallet_transactions for select to authenticated using (user_id = auth.uid() or is_admin());
create policy topup_select on topup_requests for select to authenticated using (user_id = auth.uid() or is_admin());
create policy wd_select on withdrawal_requests for select to authenticated using (user_id = auth.uid() or is_admin());

-- drivers: diri sendiri, admin, atau driver dari order milik customer (untuk tracking)
create policy drivers_select on drivers for select to authenticated using (
  id = auth.uid() or is_admin()
  or exists (select 1 from orders o where o.driver_id = drivers.id and (o.customer_id = auth.uid() or owns_merchant(o.merchant_id))
             and o.status in ('accepted','arrived','in_progress','completed'))
);
create policy drivers_update_own on drivers for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- merchants: yang disetujui publik (termasuk anon untuk web landing), pemilik & admin semua
create policy merchants_select on merchants for select to anon, authenticated using (status = 'approved' or owner_id = auth.uid() or is_admin());
create policy merchants_update_own on merchants for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy menu_select on menu_items for select to anon, authenticated using (
  exists (select 1 from merchants m where m.id = menu_items.merchant_id and (m.status = 'approved' or m.owner_id = auth.uid())) or is_admin());
create policy menu_insert on menu_items for insert to authenticated with check (owns_merchant(merchant_id));
create policy menu_update on menu_items for update to authenticated using (owns_merchant(merchant_id)) with check (owns_merchant(merchant_id));
create policy menu_delete on menu_items for delete to authenticated using (owns_merchant(merchant_id));

create policy pricing_select on pricing for select to anon, authenticated using (true);
create policy pricing_admin on pricing for all to authenticated using (is_admin()) with check (is_admin());
create policy promos_select on promos for select to authenticated using (is_active or is_admin());
create policy promos_admin on promos for all to authenticated using (is_admin()) with check (is_admin());
create policy settings_select on app_settings for select to anon, authenticated using (true);
create policy settings_admin on app_settings for all to authenticated using (is_admin()) with check (is_admin());

-- orders: customer, driver yang ditugaskan, merchant terkait, admin; order 'searching' terlihat oleh driver approved
create policy orders_select on orders for select to authenticated using (
  customer_id = auth.uid() or driver_id = auth.uid() or is_admin()
  or (merchant_id is not null and owns_merchant(merchant_id))
  or (status = 'searching' and is_approved_driver())
);
create policy order_items_select on order_items for select to authenticated using (
  exists (select 1 from orders o where o.id = order_items.order_id and (
    o.customer_id = auth.uid() or o.driver_id = auth.uid() or is_admin() or owns_merchant(o.merchant_id)
    or (o.status = 'searching' and is_approved_driver()))));
create policy order_events_select on order_events for select to authenticated using (
  exists (select 1 from orders o where o.id = order_events.order_id and (
    o.customer_id = auth.uid() or o.driver_id = auth.uid() or is_admin() or owns_merchant(o.merchant_id))));

-- chat: peserta order
create policy msg_select on order_messages for select to authenticated using (
  exists (select 1 from orders o where o.id = order_messages.order_id and (o.customer_id = auth.uid() or o.driver_id = auth.uid() or is_admin())));
create policy msg_insert on order_messages for insert to authenticated with check (
  sender_id = auth.uid() and exists (select 1 from orders o where o.id = order_messages.order_id
    and (o.customer_id = auth.uid() or o.driver_id = auth.uid()) and o.status in ('accepted','arrived','in_progress')));

create policy ratings_select on ratings for select to authenticated using (rater_id = auth.uid() or ratee_id = auth.uid() or is_admin() or owns_merchant(ratee_id));

create policy places_all on saved_places for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Storage buckets ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp']),
       ('merchant-images', 'merchant-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
       ('documents', 'documents', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
       ('proofs', 'proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars own write" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own update" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "merchant images public read" on storage.objects for select using (bucket_id = 'merchant-images');
create policy "merchant images own write" on storage.objects for insert to authenticated with check (bucket_id = 'merchant-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "merchant images own update" on storage.objects for update to authenticated using (bucket_id = 'merchant-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documents own" on storage.objects for select to authenticated using (bucket_id = 'documents' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
create policy "documents own write" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "proofs own" on storage.objects for select to authenticated using (bucket_id = 'proofs' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
create policy "proofs own write" on storage.objects for insert to authenticated with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
