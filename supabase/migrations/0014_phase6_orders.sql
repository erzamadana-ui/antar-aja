-- ============================================================================
-- Tahap 6 (b): alur pesanan AntarShop katalog & AntarMarket
--   • create_order: shop (katalog harga toko, motor/mobil) & market (harga acuan, driver isi harga riil)
--   • driver_can_take: belanja besar (mobil) hanya driver mobil
--   • set_shop_total → set_shopping_actual: total riil + item + foto nota, log harga pasar, selisih ke dompet, jasa belanja dihitung ulang
--   • driver_update_order_status: payout bagian driver dari jasa belanja + penggantian belanja (shop & market)
-- ============================================================================

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
  -- tahap 6: belanja
  v_store shop_stores%rowtype; v_market markets%rowtype; v_vehicle text := coalesce(nullif(p->>'shop_vehicle', ''), 'motor');
  v_list jsonb := '[]'::jsonb; v_prod shop_products%rowtype; v_mi record; v_qty numeric; v_service_fee bigint := 0; v_driver_share bigint := 0;
  v_shop_store text := p->>'shop_store';
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  if not exists (select 1 from profiles where id = v_uid and is_active) then raise exception 'Akun nonaktif'; end if;
  select count(*) into v_active from orders where customer_id = v_uid and status in ('searching','accepted','arrived','in_progress');
  if v_active >= 3 then raise exception 'Maksimal 3 pesanan aktif'; end if;
  if v_sched is not null then
    if v_sched < now() + interval '25 minutes' then raise exception 'Jadwal minimal 30 menit dari sekarang'; end if;
    if v_sched > now() + interval '7 days' then raise exception 'Jadwal maksimal 7 hari ke depan'; end if;
    if v_service in ('food','shop','market') then raise exception 'Booking terjadwal tersedia untuk Ride, Car, Send, dan Box'; end if;
  end if;
  if v_vehicle not in ('motor','car') then v_vehicle := 'motor'; end if;

  if v_service = 'food' then
    select * into v_merchant from merchants where id = (p->>'merchant_id')::uuid;
    if not found or v_merchant.status <> 'approved' then raise exception 'Merchant tidak tersedia'; end if;
    if not v_merchant.is_open then raise exception 'Merchant sedang tutup'; end if;
    v_pick_lat := v_merchant.lat; v_pick_lng := v_merchant.lng; v_pick_addr := coalesce(v_merchant.address, v_merchant.name);
    if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then raise exception 'Keranjang kosong'; end if;
  elsif v_service = 'shop' and nullif(p->>'shop_store_id', '') is not null then
    -- toko dari katalog: titik jemput = lokasi toko, harga dari katalog
    select * into v_store from shop_stores where id = (p->>'shop_store_id')::uuid and active;
    if not found then raise exception 'Toko tidak tersedia'; end if;
    v_pick_lat := v_store.lat; v_pick_lng := v_store.lng; v_pick_addr := v_store.name || coalesce(' · ' || v_store.address, ''); v_shop_store := v_store.name;
  elsif v_service = 'market' then
    select * into v_market from markets where id = nullif(p->>'market_id', '')::uuid and active;
    if not found then raise exception 'Pilih pasar tujuan belanja'; end if;
    v_pick_lat := v_market.lat; v_pick_lng := v_market.lng; v_pick_addr := v_market.name || coalesce(' · ' || v_market.address, ''); v_shop_store := v_market.name;
  else
    v_pick_lat := (p->'pickup'->>'lat')::double precision;
    v_pick_lng := (p->'pickup'->>'lng')::double precision;
    v_pick_addr := p->'pickup'->>'address';
  end if;
  if v_pick_lat is null then raise exception 'Lokasi jemput tidak lengkap'; end if;

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

  -- ---------- daftar belanja: shop (katalog/bebas) & market (acuan) ----------
  if v_service in ('shop','market') then
    if jsonb_array_length(coalesce(p->'shopping_list', '[]'::jsonb)) = 0 then raise exception 'Daftar belanja kosong'; end if;
    for v_item in select * from jsonb_array_elements(p->'shopping_list') loop
      v_qty := greatest(0.1, coalesce((v_item->>'qty')::numeric, 1));
      if v_service = 'shop' and nullif(v_item->>'product_id', '') is not null then
        select * into v_prod from shop_products where id = (v_item->>'product_id')::uuid and active;
        if not found then raise exception 'Produk tidak tersedia: %', v_item->>'name'; end if;
        if v_store.id is not null and v_prod.store_id <> v_store.id then raise exception 'Produk bukan dari toko yang dipilih'; end if;
        if not v_prod.in_stock then raise exception 'Stok habis: %', v_prod.name; end if;
        v_list := v_list || jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name, 'qty', v_qty, 'unit', v_prod.unit, 'price', v_prod.price, 'note', v_item->>'note');
        v_budget := v_budget + (v_prod.price * v_qty)::bigint;
      elsif v_service = 'market' and nullif(v_item->>'item_id', '') is not null then
        select c.* into v_mi from market_catalog(v_market.id) c where c.id = (v_item->>'item_id')::uuid;
        if not found then raise exception 'Bahan tidak tersedia: %', v_item->>'name'; end if;
        v_list := v_list || jsonb_build_object('item_id', v_mi.id, 'name', v_mi.name, 'qty', v_qty, 'unit', v_mi.unit, 'price', v_mi.price, 'ref_price', v_mi.price, 'note', v_item->>'note');
        v_budget := v_budget + (v_mi.price * v_qty)::bigint;
      else
        -- item bebas (tanpa katalog): harga perkiraan dari pelanggan / est_budget
        v_list := v_list || jsonb_build_object('name', v_item->>'name', 'qty', v_qty, 'unit', coalesce(v_item->>'unit', 'pcs'), 'price', coalesce((v_item->>'price')::bigint, 0), 'note', v_item->>'note');
        v_budget := v_budget + coalesce((v_item->>'price')::bigint, 0) * v_qty::bigint;
      end if;
    end loop;
    -- anggaran: hasil katalog + buffer, atau est_budget pelanggan bila lebih besar (item bebas)
    v_budget := greatest(v_budget + floor(v_budget * setting_num('shop_budget_buffer_pct', 10) / 100.0)::bigint, coalesce((p->>'est_budget')::bigint, 0));
    if v_budget <= 0 then raise exception 'Perkiraan belanja belum diisi'; end if;
    if v_budget > 5000000 then raise exception 'Maksimal anggaran belanja Rp5.000.000'; end if;
    v_service_fee := shopping_service_fee(v_service, v_budget);
    v_driver_share := shopping_driver_share(v_service, v_service_fee);
  end if;

  v_est := estimate_fare(v_service, v_pick_lat, v_pick_lng, v_drop_lat, v_drop_lng, (p->>'route_km')::numeric);
  v_fare := (v_est->>'fare')::bigint; v_fee := (v_est->>'platform_fee')::bigint;
  if v_service in ('ride_motor','ride_car','box') then
    select * into v_class from vehicle_classes where code = nullif(p->>'vehicle_class', '') and service = v_service and active;
    if not found then select * into v_class from vehicle_classes where service = v_service and active order by (rank = 2) desc, sort limit 1; end if;
    v_fare := round_to((v_fare::numeric * v_class.multiplier)::bigint, 500);
    if v_service = 'box' then v_fare := v_fare + v_helpers * v_helper_fee; else v_helpers := 0; end if;
  elsif v_service in ('shop','market') and v_vehicle = 'car' then
    v_fare := round_to((v_fare::numeric * setting_num('shop_car_factor', 1.8))::bigint, 500);
    select * into v_class from vehicle_classes where code = 'car_economy';   -- kelas minimum: mobil apa saja
    v_helpers := 0;
  else v_helpers := 0; end if;
  select * into pr from pricing where service = v_service;

  insert into orders (service, customer_id, merchant_id, status, merchant_status,
    pickup_address, pickup_location, dropoff_address, dropoff_location,
    distance_km, duration_min, route_geometry, fare_delivery, platform_fee, payment_method, paid_via,
    notes, recipient_name, recipient_phone, package_details, promo_code, shopping_list, est_budget, shop_store,
    send_scope, dest_city_id, warehouse_id, origin_warehouse_id, weight_kg, intercity_fare, scheduled_at, vehicle_class, helpers, purpose,
    shop_store_id, market_id, shop_vehicle, service_fee, driver_service_share)
  values (v_service, v_uid, v_merchant.id, case when v_sched is not null then 'scheduled'::order_status else 'searching'::order_status end,
    case when v_service = 'food' then 'pending'::merchant_order_status else null end,
    v_pick_addr, st_setsrid(st_makepoint(v_pick_lng, v_pick_lat), 4326)::geography,
    v_drop_addr, st_setsrid(st_makepoint(v_drop_lng, v_drop_lat), 4326)::geography,
    (v_est->>'distance_km')::numeric, coalesce((p->>'duration_min')::int, (v_est->>'duration_min')::int),
    p->'route_geometry', v_fare, v_fee, v_pay, v_paid_via,
    p->>'notes', p->>'recipient_name', p->>'recipient_phone', p->'package_details', nullif(upper(p->>'promo_code'), ''),
    case when v_service in ('shop','market') then v_list else null end, v_budget, v_shop_store,
    case when v_service = 'send' then v_scope else 'in_city' end, v_dest_city, v_wh, v_origin_wh.id, v_weight, v_ic_fare, v_sched, v_class.code, v_helpers, p->>'purpose',
    v_store.id, v_market.id, case when v_service in ('shop','market') then v_vehicle else 'motor' end, v_service_fee, v_driver_share)
  returning * into v_order;

  if v_service = 'food' then
    for v_item in select * from jsonb_array_elements(p->'items') loop
      select * into v_menu from menu_items where id = (v_item->>'menu_item_id')::uuid and merchant_id = v_merchant.id and is_available;
      if not found then raise exception 'Menu tidak tersedia'; end if;
      insert into order_items (order_id, menu_item_id, name, price, qty, notes)
      values (v_order.id, v_menu.id, v_menu.name, v_menu.price, greatest(1, (v_item->>'qty')::int), v_item->>'notes');
      v_sub := v_sub + v_menu.price * greatest(1, (v_item->>'qty')::int);
    end loop;
  elsif v_service in ('shop','market') then
    v_sub := v_budget;
  end if;

  v_disc := apply_promo(v_order.promo_code, v_service, v_fare + case when v_service = 'food' then v_sub else 0 end);
  v_total := v_fare + v_fee + v_sub + v_ic_fare + v_service_fee - v_disc;

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
         when v_service = 'market' then 'Belanja pasar: dana ditahan sesuai acuan Rp' || v_budget || ', disesuaikan nota driver'
         when v_service = 'shop' then 'Belanja ' || coalesce(v_shop_store, 'toko') || case when v_vehicle = 'car' then ' (mobil)' else '' end
         else 'Pesanan dibuat, mencari driver' end);
  return v_order;
end $$;

-- ---------- driver_can_take: belanja mobil hanya driver mobil ----------
create or replace function driver_can_take(d drivers, o orders) returns boolean language sql stable as $$
  select case
    when o.service = 'ride_motor' then d.vehicle_type = 'motor'
    when o.service = 'ride_car' then d.vehicle_type = 'car'
    when o.service = 'box' then d.vehicle_type in ('box','pickup')
    when o.service in ('shop','market') and o.shop_vehicle = 'car' then d.vehicle_type = 'car'
    else d.vehicle_type in ('motor','car')
  end
  and (o.vehicle_class is null or exists (
    select 1 from vehicle_classes oc join vehicle_classes dc on dc.code = coalesce(d.vehicle_class, derive_vehicle_class(d.vehicle_type, d.vehicle_year, d.vehicle_condition, d.is_electric))
    where oc.code = o.vehicle_class and dc.rank >= oc.rank and (not oc.is_ev or d.is_electric)))
$$;

-- ---------- driver: total belanja riil (nota) — shop & market ----------
-- p_items: [{item_id|product_id, name, qty, price}] harga riil per item (opsional; total tetap p_amount)
create or replace function set_shopping_actual(p_order_id uuid, p_amount bigint, p_receipt_url text default null, p_items jsonb default null)
returns orders language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_delta bigint; v_bal bigint; v_new_total bigint; v_fee_new bigint; v_fee_delta bigint; it jsonb; v_limit bigint;
begin
  select * into o from orders where id = p_order_id for update;
  if not found or o.driver_id <> auth.uid() then raise exception 'Bukan order Anda'; end if;
  if o.service not in ('shop','market') then raise exception 'Bukan order belanja'; end if;
  if o.status not in ('arrived','in_progress') then raise exception 'Input total setelah tiba di toko/pasar'; end if;
  v_limit := greatest(floor(o.est_budget * 1.3)::bigint, o.est_budget + 50000);
  if p_amount < 0 or p_amount > v_limit then
    raise exception 'Total belanja melebihi batas (maks Rp%). Konfirmasi ke pelanggan atau minta pelanggan menambah anggaran.', v_limit;
  end if;
  -- jasa belanja dihitung ulang dari belanja riil (pelanggan hanya bayar harga riil + jasa)
  v_fee_new := shopping_service_fee(o.service, p_amount);
  v_fee_delta := v_fee_new - o.service_fee;
  v_delta := (p_amount - o.items_subtotal) + v_fee_delta;
  v_new_total := o.total + v_delta;
  if o.payment_method = 'wallet' and v_delta <> 0 then
    if v_delta > 0 then
      select balance into v_bal from wallets where user_id = o.customer_id for update;
      if coalesce(v_bal, 0) < v_delta then raise exception 'Saldo pelanggan tidak cukup untuk selisih belanja Rp%', v_delta; end if;
      perform wallet_apply(o.customer_id, 'payment', -v_delta, o.id, 'Selisih belanja ' || o.code);
    else
      perform wallet_apply(o.customer_id, 'refund', -v_delta, o.id, 'Kelebihan anggaran belanja ' || o.code);
    end if;
  end if;
  update orders set items_subtotal = p_amount, total = v_new_total, receipt_url = coalesce(p_receipt_url, receipt_url),
    service_fee = v_fee_new, driver_service_share = shopping_driver_share(service, v_fee_new), actual_items = coalesce(p_items, actual_items)
  where id = o.id returning * into o;
  -- log harga riil pasar → memperbarui acuan (median 7 hari)
  if o.service = 'market' and p_items is not null then
    for it in select * from jsonb_array_elements(p_items) loop
      if nullif(it->>'item_id', '') is not null and coalesce((it->>'price')::bigint, 0) > 0 then
        insert into market_price_log (market_id, item_id, price, qty, source, order_id, actor_id)
        values (o.market_id, (it->>'item_id')::uuid, (it->>'price')::bigint, nullif(it->>'qty', '')::numeric, 'driver', o.id, auth.uid());
      end if;
    end loop;
  end if;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'shop_total', auth.uid(), 'Total belanja riil Rp' || p_amount || ' · jasa belanja Rp' || v_fee_new);
  return o;
end $$;
grant execute on function set_shopping_actual(uuid, bigint, text, jsonb) to authenticated;
-- kompatibilitas: set_shop_total lama → set_shopping_actual
create or replace function set_shop_total(p_order_id uuid, p_amount bigint, p_receipt_url text default null)
returns orders language sql security definer set search_path = public as $$ select set_shopping_actual(p_order_id, p_amount, p_receipt_url, null); $$;

-- ---------- driver_update_order_status: payout jasa belanja (shop & market) ----------
create or replace function driver_update_order_status(p_order_id uuid, p_status order_status, p_pin text default null)
returns orders language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; pr pricing%rowtype; v_fee bigint; v_comm bigint; v_owner uuid; v_extra_driver bigint; v_session pricing_sessions; v_bonus bigint := 0; v_pin text;
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
  if p_status = 'in_progress' then
    select pin into v_pin from order_pins where order_id = o.id;
    if v_pin is not null and (p_pin is null or p_pin <> v_pin) then raise exception 'PIN_REQUIRED'; end if;
  end if;

  update orders set status = p_status,
    arrived_at = case when p_status = 'arrived' then now() else arrived_at end,
    started_at = case when p_status = 'in_progress' then now() else started_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    payment_status = case when p_status = 'completed' then 'paid' else payment_status end
  where id = o.id returning * into o;
  insert into order_events (order_id, status, actor_id, note) values (o.id, p_status::text, auth.uid(), case when p_status = 'in_progress' and v_pin is not null then 'PIN pelanggan terverifikasi' end);

  if p_status = 'completed' then
    select * into pr from pricing where service = o.service;
    v_comm := o.fare_delivery - o.driver_earning;
    v_extra_driver := o.tip + o.extras_total + o.driver_service_share;   -- tip, biaya tambahan, bagian jasa belanja → driver
    v_session := current_pricing_session(o.service, o.created_at);
    if v_session.id is not null and v_session.driver_bonus_pct > 0 then
      v_bonus := least(v_comm, floor(o.fare_delivery * v_session.driver_bonus_pct / 100.0));
      v_comm := v_comm - v_bonus;
    end if;
    update orders set driver_earning = driver_earning + v_extra_driver + v_bonus where id = o.id returning * into o;
    if o.payment_method = 'wallet' then
      perform wallet_apply(o.driver_id, 'earning', o.driver_earning, o.id, 'Pendapatan ' || o.code);
      if o.service in ('shop','market') and o.items_subtotal > 0 then
        perform wallet_apply(o.driver_id, 'earning', o.items_subtotal, o.id, 'Penggantian belanja ' || o.code);
      end if;
      if o.merchant_id is not null then
        select owner_id into v_owner from merchants where id = o.merchant_id;
        if v_owner is not null and o.merchant_earning > 0 then
          perform wallet_apply(v_owner, 'earning', o.merchant_earning, o.id, 'Penjualan ' || o.code);
        end if;
      end if;
    else
      -- tunai: driver terima tunai (tarif + belanja + jasa); potongan platform = komisi + fee + bagian perusahaan dari jasa belanja
      v_fee := v_comm + o.platform_fee + (o.service_fee - o.driver_service_share);
      if v_fee > 0 then perform wallet_apply(o.driver_id, 'fee', -v_fee, o.id, 'Potongan platform ' || o.code); end if;
      if o.tip > 0 then perform wallet_apply(o.driver_id, 'earning', o.tip, o.id, 'Tip dari pelanggan ' || o.code); end if;
    end if;
    perform set_config('antaraja.bypass', 'on', true);
    update drivers set total_trips = total_trips + 1 where id = o.driver_id;
    perform set_config('antaraja.bypass', 'off', true);
  end if;
  return o;
end $$;

-- ---------- driver_available_orders: + jasa belanja & kendaraan belanja ----------
drop function if exists driver_available_orders();
create or replace function driver_available_orders()
returns table(id uuid, code text, service service_type, pickup_address text, dropoff_address text,
  pickup_lat double precision, pickup_lng double precision, dropoff_lat double precision, dropoff_lng double precision,
  distance_km numeric, fare_delivery bigint, items_subtotal bigint, total bigint, driver_earning bigint,
  payment_method payment_method, merchant_status merchant_order_status, created_at timestamptz, distance_to_pickup_km numeric, merchant_name text,
  vehicle_class text, helpers int, scheduled_at timestamptz, send_scope text, shop_vehicle text, driver_service_share bigint)
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
    o.vehicle_class, o.helpers, o.scheduled_at, o.send_scope, o.shop_vehicle, o.driver_service_share
  from orders o left join merchants m on m.id = o.merchant_id
  where o.status = 'searching'
    and driver_can_take(d, o)
    and (o.merchant_status is null or o.merchant_status <> 'rejected')
    and d.location is not null
    and st_dwithin(o.pickup_location, d.location, v_radius * 1000)
  order by 18 asc limit 20;
end $$;
grant execute on function driver_available_orders() to authenticated;

-- ---------- customer_frequent: sertakan market ----------
create or replace function customer_frequent(p_limit integer default 6)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'merchants', coalesce((select jsonb_agg(x order by (x->>'count')::int desc) from (
        select jsonb_build_object('merchant_id', m.id, 'name', m.name, 'image_url', m.image_url, 'category', m.category, 'rating_avg', m.rating_avg,
          'is_halal', m.is_halal, 'halal_verified', m.halal_verified, 'is_open', m.is_open, 'count', count(*), 'last_at', max(o.created_at)) x
        from orders o join merchants m on m.id = o.merchant_id
        where o.customer_id = auth.uid() and o.status = 'completed' and m.status = 'approved'
        group by m.id order by count(*) desc, max(o.created_at) desc limit p_limit) s), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('service', o.service, 'dropoff_address', o.dropoff_address,
          'dropoff_lat', avg(o.dropoff_lat), 'dropoff_lng', avg(o.dropoff_lng),
          'pickup_address', (array_agg(o.pickup_address order by o.created_at desc))[1],
          'pickup_lat', (array_agg(o.pickup_lat order by o.created_at desc))[1], 'pickup_lng', (array_agg(o.pickup_lng order by o.created_at desc))[1],
          'shop_store', (array_agg(o.shop_store order by o.created_at desc))[1], 'count', count(*), 'last_at', max(o.created_at)) x
        from orders o
        where o.customer_id = auth.uid() and o.status = 'completed' and o.service in ('ride_motor','ride_car','send','shop','box','market')
        group by o.service, o.dropoff_address order by count(*) desc, max(o.created_at) desc limit p_limit) s), '[]'::jsonb),
    'services', coalesce((select jsonb_object_agg(service, cnt) from (select service, count(*) cnt from orders where customer_id = auth.uid() and status = 'completed' group by service) s), '{}'::jsonb),
    'recent', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('address', o.dropoff_address, 'lat', o.dropoff_lat, 'lng', o.dropoff_lng, 'service', o.service) x
        from (select distinct on (dropoff_address) * from orders where customer_id = auth.uid() and service <> 'food' order by dropoff_address, created_at desc) o
        order by o.created_at desc limit 5) s), '[]'::jsonb)
  )
$$;
