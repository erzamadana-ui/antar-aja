-- Simulasi transaksi ujung-ke-ujung AntarKita (semua peran) — dijalankan dalam satu transaksi lalu di-ROLLBACK (data tidak berubah).
-- Cara pakai: jalankan di SQL editor Supabase sebagai postgres; hasil log ada di pesan error terakhir (sengaja RAISE agar rollback).
do $sim$
declare
  cust uuid := 'a0000000-0000-4000-8000-000000000002'; drv uuid := 'a0000000-0000-4000-8000-000000000003'; drv2 uuid := 'a0000000-0000-4000-8000-000000000004';
  mown uuid := 'a0000000-0000-4000-8000-000000000005'; adm uuid := 'a0000000-0000-4000-8000-000000000001';
  merch uuid := 'b0000000-0000-4000-8000-000000000001'; menu1 uuid; store1 uuid; prod1 uuid; mk uuid; item1 uuid; route1 uuid; wh_dest uuid; city_bkt uuid;
  o orders; o2 orders; r jsonb; j jsonb; v_pin text; b0 bigint; b1 bigint; d0 bigint; d1 bigint; m0 bigint; m1 bigint; n int; t tickets; tr travel_requests; tt travel_trips; tb travel_bookings; tofr travel_offers; v market_vendors; vi market_vendor_items; f fraud_flags; w withdrawal_requests; tp topup_requests; log text := E'\n';
begin
  select id into menu1 from menu_items where merchant_id = merch and is_available limit 1;
  select id into store1 from shop_stores where active and name ilike 'Indomaret%' limit 1;
  select id into prod1 from shop_products where store_id = store1 and in_stock limit 1;
  select id into mk from markets where active order by name limit 1;
  select id into item1 from market_items where name ilike 'Beras medium' limit 1;
  select id into city_bkt from cities where name = 'Bukittinggi';
  select id into route1 from travel_routes where active and from_city = (select id from cities where name = 'Pekanbaru') and to_city = (select id from cities where name = 'Padang') limit 1;
  select id into wh_dest from warehouses where city_id = city_bkt and active limit 1;

  -- ===== S0 Saldo uji pelanggan (top up manual disetujui admin) =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    tp := request_topup(2000000, 'bank_transfer', 'https://x/bukti.jpg', 'saldo uji');
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    perform admin_review_topup(tp.id, true, 'saldo uji');
    log := log || format('S0 OK saldo uji pelanggan=%s', (select balance from wallets where user_id = cust)) || E'\n';
  exception when others then log := log || 'S0 BUG topup: ' || sqlerrm || E'\n'; end;

  -- ===== S1 Ride motor (wallet) =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    perform driver_selfie_check('https://x/selfie.jpg'); perform driver_set_online(true, 0.4810, 101.4349);
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    select balance into b0 from wallets where user_id = cust;
    o := create_order(jsonb_build_object('service', 'ride_motor', 'vehicle_class', 'motor_economy', 'pickup', jsonb_build_object('lat', 0.4810, 'lng', 101.4349, 'address', 'Jl. Sudirman 45'), 'dropoff', jsonb_build_object('lat', 0.50, 'lng', 101.44, 'address', 'Plaza Andalas'), 'paid_via', 'wallet'));
    select balance into b1 from wallets where user_id = cust;
    select pin into v_pin from order_pins where order_id = o.id;
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    select balance into d0 from wallets where user_id = drv;
    o := driver_accept_order(o.id);
    o := driver_update_order_status(o.id, 'arrived', null);
    begin o := driver_update_order_status(o.id, 'in_progress', '0000'); log := log || 'S1 BUG: PIN salah diterima' || E'\n'; exception when others then if sqlerrm not like '%PIN%' then raise; end if; end;
    o := driver_update_order_status(o.id, 'in_progress', v_pin);
    o := driver_update_order_status(o.id, 'completed', null);
    select balance into d1 from wallets where user_id = drv;
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    perform rate_order(o.id, 'driver', 5, 'Mantap');
    perform add_tip(o.id, 5000);
    log := log || format('S1 OK ride_motor %s total=%s cust %s→%s (potong %s) driver +%s status=%s pin=%s', o.code, o.total, b0, b1, b0 - b1, d1 - d0, o.status, v_pin) || E'\n';
  exception when others then log := log || 'S1 BUG ride_motor: ' || sqlerrm || E'\n'; end;

  -- ===== S2 Ride car (tunai, kelas mobil) =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', drv2, 'role', 'authenticated')::text, true);
    perform driver_selfie_check('https://x/selfie.jpg'); perform driver_set_online(true, 0.4946, 101.4314);
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    o := create_order(jsonb_build_object('service', 'ride_car', 'vehicle_class', 'car_economy', 'pickup', jsonb_build_object('lat', 0.4946, 'lng', 101.4314, 'address', 'Rumah'), 'dropoff', jsonb_build_object('lat', 0.52, 'lng', 101.45, 'address', 'Bandara SSK II'), 'paid_via', 'cash'));
    select pin into v_pin from order_pins where order_id = o.id;
    perform set_config('request.jwt.claims', json_build_object('sub', drv2, 'role', 'authenticated')::text, true);
    select balance into d0 from wallets where user_id = drv2;
    o := driver_accept_order(o.id); o := driver_update_order_status(o.id, 'arrived', null); o := driver_update_order_status(o.id, 'in_progress', v_pin); o := driver_update_order_status(o.id, 'completed', null);
    select balance into d1 from wallets where user_id = drv2;
    log := log || format('S2 OK ride_car %s total=%s fare=%s potongan platform driver=%s', o.code, o.total, o.fare_delivery, d0 - d1) || E'\n';
  exception when others then log := log || 'S2 BUG ride_car: ' || sqlerrm || E'\n'; end;

  -- ===== S3 Food (wallet, promo, merchant, PIN tidak wajib) =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    perform driver_selfie_check('https://x/selfie.jpg'); perform driver_set_online(true, -0.9405, 100.3625);
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    select balance into b0 from wallets where user_id = cust; select balance into m0 from wallets where user_id = mown;
    o := create_order(jsonb_build_object('service', 'food', 'merchant_id', merch, 'items', jsonb_build_array(jsonb_build_object('menu_item_id', menu1, 'qty', 2)), 'dropoff', jsonb_build_object('lat', -0.945, 'lng', 100.36, 'address', 'Kos Andalas'), 'paid_via', 'wallet', 'promo_code', 'ANTARBARU'));
    perform set_config('request.jwt.claims', json_build_object('sub', mown, 'role', 'authenticated')::text, true);
    begin o := merchant_update_order(o.id, 'accepted'); exception when others then log := log || 'S3 note merchant accepted: ' || sqlerrm || E'\n'; end;
    begin o := merchant_update_order(o.id, 'preparing'); exception when others then null; end;
    o := merchant_update_order(o.id, 'ready');
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    o := driver_accept_order(o.id); o := driver_update_order_status(o.id, 'arrived', null); o := driver_update_order_status(o.id, 'in_progress', null); o := driver_update_order_status(o.id, 'completed', null);
    select balance into b1 from wallets where user_id = cust; select balance into m1 from wallets where user_id = mown;
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    perform rate_order(o.id, 'merchant', 4, 'Enak');
    log := log || format('S3 OK food %s sub=%s disc=%s total=%s cust -%s merchant +%s merchant_earning=%s', o.code, o.items_subtotal, o.discount, o.total, b0 - b1, m1 - m0, o.merchant_earning) || E'\n';
  exception when others then log := log || 'S3 BUG food: ' || sqlerrm || E'\n'; end;

  -- ===== S4 Send dalam kota (tunai) + extra biaya =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    o := create_order(jsonb_build_object('service', 'send', 'pickup', jsonb_build_object('lat', -0.9405, 'lng', 100.3625, 'address', 'Toko A'), 'dropoff', jsonb_build_object('lat', -0.95, 'lng', 100.37, 'address', 'Rumah B'), 'recipient_name', 'Siti', 'recipient_phone', '0813', 'package_details', jsonb_build_object('type', 'dokumen'), 'paid_via', 'cash'));
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    o := driver_accept_order(o.id); o := driver_update_order_status(o.id, 'arrived', null);
    o := request_extra(o.id, 'parking', 3000, 'Parkir');
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    o := respond_extra(o.id, (o.extras->-1->>'id')::uuid, true);
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    o := driver_update_order_status(o.id, 'in_progress', null); o := driver_update_order_status(o.id, 'completed', null);
    log := log || format('S4 OK send %s total=%s extras=%s', o.code, o.total, o.extras_total) || E'\n';
  exception when others then log := log || 'S4 BUG send: ' || sqlerrm || E'\n'; end;

  -- ===== S5 Send antar kota (Padang → Bukittinggi) =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    o := create_order(jsonb_build_object('service', 'send', 'send_scope', 'intercity', 'dest_city_id', city_bkt, 'warehouse_id', wh_dest, 'weight_kg', 2.5, 'pickup', jsonb_build_object('lat', -0.9405, 'lng', 100.3625, 'address', 'Toko A'), 'dropoff', jsonb_build_object('lat', -0.3, 'lng', 100.37, 'address', 'Bukittinggi'), 'recipient_name', 'Andi', 'recipient_phone', '0812', 'paid_via', 'wallet'));
    log := log || format('S5 OK send_intercity %s ongkir dalam kota=%s antar kota=%s total=%s drop=%s', o.code, o.fare_delivery, o.intercity_fare, o.total, o.dropoff_address) || E'\n';
    perform cancel_order(o.id, 'uji');
  exception when others then log := log || 'S5 BUG send_intercity: ' || sqlerrm || E'\n'; end;

  -- ===== S6 Box (mobil box + helper) → batal & refund =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    select balance into b0 from wallets where user_id = cust;
    o := create_order(jsonb_build_object('service', 'box', 'helpers', 2, 'purpose', 'pindahan', 'pickup', jsonb_build_object('lat', -0.9405, 'lng', 100.3625, 'address', 'Kos lama'), 'dropoff', jsonb_build_object('lat', -0.93, 'lng', 100.38, 'address', 'Kos baru'), 'paid_via', 'wallet'));
    select balance into b1 from wallets where user_id = cust;
    o := cancel_order(o.id, 'Berubah pikiran');
    select balance into d1 from wallets where user_id = cust;
    log := log || format('S6 OK box %s total=%s dipotong=%s refund kembali=%s status=%s', o.code, o.total, b0 - b1, d1 - b1, o.status) || E'\n';
    if d1 <> b0 then log := log || 'S6 BUG: refund tidak penuh' || E'\n'; end if;
  exception when others then log := log || 'S6 BUG box: ' || sqlerrm || E'\n'; end;

  -- ===== S7 AntarShop (wallet) =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    perform driver_selfie_check('https://x/selfie.jpg'); perform driver_set_online(true, 0.5168, 101.4463);
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    select balance into b0 from wallets where user_id = cust;
    o := create_order(jsonb_build_object('service', 'shop', 'shop_store_id', store1, 'shop_vehicle', 'motor', 'shopping_list', jsonb_build_array(jsonb_build_object('product_id', prod1, 'qty', 2)), 'dropoff', jsonb_build_object('lat', 0.52, 'lng', 101.45, 'address', 'Rumah'), 'paid_via', 'wallet'));
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    select balance into d0 from wallets where user_id = drv;
    o := driver_accept_order(o.id); o := driver_update_order_status(o.id, 'arrived', null);
    o := set_shopping_actual(o.id, 149000, 'https://x/nota.jpg', null);
    o := driver_update_order_status(o.id, 'in_progress', null); o := driver_update_order_status(o.id, 'completed', null);
    select balance into b1 from wallets where user_id = cust; select balance into d1 from wallets where user_id = drv;
    log := log || format('S7 OK shop %s anggaran=%s riil=%s jasa=%s total=%s cust -%s driver +%s', o.code, o.est_budget, o.items_subtotal, o.service_fee, o.total, b0 - b1, d1 - d0) || E'\n';
  exception when others then log := log || 'S7 BUG shop: ' || sqlerrm || E'\n'; end;

  -- ===== S8 AntarMarket + pedagang + koefisien =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', mown, 'role', 'authenticated')::text, true);
    v := apply_market_vendor(jsonb_build_object('market_id', mk, 'stall_name', 'Lapak Uji', 'categories', jsonb_build_array('sembako'), 'phone', '0812', 'photo_url', 'x', 'id_card_url', 'y'));
    vi := vendor_upsert_item(jsonb_build_object('name', 'Beras medium premium', 'category', 'sembako', 'unit', 'kg', 'price', 15000, 'grade', 'A', 'photo_url', 'z', 'item_id', item1));
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    perform admin_review_market_vendor(v.id, 'approved', null);
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    perform driver_selfie_check('https://x/selfie.jpg'); perform driver_set_online(true, 0.5345, 101.4407);
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    select balance into b0 from wallets where user_id = cust;
    o := create_order(jsonb_build_object('service', 'market', 'market_id', mk, 'shop_vehicle', 'motor', 'shopping_list', jsonb_build_array(jsonb_build_object('item_id', item1, 'qty', 2), jsonb_build_object('vendor_item_id', vi.id, 'name', vi.name, 'qty', 1)), 'dropoff', jsonb_build_object('lat', 0.52, 'lng', 101.45, 'address', 'Rumah'), 'paid_via', 'wallet'));
    log := log || format('S8a OK market %s list=%s anggaran=%s', o.code, (select string_agg(coalesce(x->>'vendor_name', 'acuan') || ':' || (x->>'price'), ', ') from jsonb_array_elements(o.shopping_list) x), o.est_budget) || E'\n';
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    o := driver_accept_order(o.id); o := driver_update_order_status(o.id, 'arrived', null);
    -- harga 2x acuan → harus ditolak
    begin o := set_shopping_actual(o.id, 60000, 'https://x/nota.jpg', jsonb_build_array(jsonb_build_object('item_id', item1, 'price', 30000, 'qty', 2))); log := log || 'S8 BUG: harga 2x acuan tidak ditolak' || E'\n';
    exception when others then log := log || 'S8b OK hard cap: ' || sqlerrm || E'\n'; end;
    -- harga 1.35x tanpa nota → harus minta foto nota
    begin o := set_shopping_actual(o.id, 44000, null, jsonb_build_array(jsonb_build_object('item_id', item1, 'price', 19500, 'qty', 2))); log := log || 'S8 BUG: outlier tanpa nota diterima' || E'\n';
    exception when others then log := log || 'S8c OK nota wajib: ' || sqlerrm || E'\n'; end;
    o := set_shopping_actual(o.id, 54000, 'https://x/nota.jpg', jsonb_build_array(jsonb_build_object('item_id', item1, 'price', 19500, 'qty', 2), jsonb_build_object('item_id', vi.item_id, 'price', 15000, 'qty', 1)));
    select count(*) into n from fraud_flags where order_id = o.id and kind = 'price_outlier';
    o := driver_update_order_status(o.id, 'in_progress', null); o := driver_update_order_status(o.id, 'completed', null);
    select balance into b1 from wallets where user_id = cust;
    log := log || format('S8d OK market selesai total=%s riil=%s flag_outlier=%s cust -%s', o.total, o.items_subtotal, n, b0 - b1) || E'\n';
  exception when others then log := log || 'S8 BUG market: ' || sqlerrm || E'\n'; end;

  -- ===== S9 Pembatalan driver berulang → tangguhkan otomatis → admin pulihkan =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    perform driver_selfie_check('https://x/selfie.jpg'); perform driver_set_online(true, 0.4810, 101.4349);
    for n in 1..3 loop
      perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
      o := create_order(jsonb_build_object('service', 'ride_motor', 'vehicle_class', 'motor_economy', 'pickup', jsonb_build_object('lat', 0.4810, 'lng', 101.4349, 'address', 'A'), 'dropoff', jsonb_build_object('lat', 0.49, 'lng', 101.44, 'address', 'B'), 'paid_via', 'cash'));
      perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
      o := driver_accept_order(o.id);
      o := cancel_order(o.id, 'uji batal');
      perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
      perform cancel_order(o.id, 'bersih');
    end loop;
    select * into f from fraud_flags where subject_id = drv and kind = 'cancel_spam' and severity = 'high' order by created_at desc limit 1;
    log := log || format('S9a %s driver status=%s flag=%s auto=%s', case when (select status from drivers where id = drv) = 'suspended' then 'OK' else 'BUG' end, (select status from drivers where id = drv), f.kind, f.auto_action) || E'\n';
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    perform admin_review_fraud(f.id, 'dismissed', 'Uji sistem', true);
    log := log || format('S9b %s driver dipulihkan status=%s', case when (select status from drivers where id = drv) = 'approved' then 'OK' else 'BUG' end, (select status from drivers where id = drv)) || E'\n';
  exception when others then log := log || 'S9 BUG cancel-spam: ' || sqlerrm || E'\n'; end;

  -- ===== S10 Travel kursi bersama =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', drv2, 'role', 'authenticated')::text, true);
    tt := travel_trip_create(jsonb_build_object('route_id', route1, 'depart_at', (now() + interval '1 day')::text, 'seats_total', 6, 'seat_price', 150000, 'allow_private', true, 'private_price', 800000));
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    select balance into b0 from wallets where user_id = cust;
    tb := travel_book(jsonb_build_object('trip_id', tt.id, 'pax', 2, 'pickup_address', 'Jl. Sudirman 45', 'pickup_lat', 0.5, 'pickup_lng', 101.44, 'passengers', jsonb_build_array(jsonb_build_object('name', 'Budi'), jsonb_build_object('name', 'Ani')), 'paid_via', 'wallet'));
    select balance into b1 from wallets where user_id = cust;
    perform set_config('request.jwt.claims', json_build_object('sub', drv2, 'role', 'authenticated')::text, true);
    r := travel_trip_manifest(tt.id);
    perform travel_trip_set_status(tt.id, 'departed', null);
    perform travel_trip_set_status(tt.id, 'arrived', null);
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    perform travel_rate(tb.id, 5);
    log := log || format('S10 OK travel shared booking=%s pax=%s total=%s cust -%s manifest=%s', tb.code, tb.pax, tb.price + tb.platform_fee, b0 - b1, jsonb_array_length(r)) || E'\n';
  exception when others then log := log || 'S10 BUG travel shared: ' || sqlerrm || E'\n'; end;

  -- ===== S11 Travel carter (permintaan → tawaran → terima → selesai → nilai) =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    tr := travel_request_create(jsonb_build_object('kind', 'charter', 'depart_at', (now() + interval '2 days')::text, 'pickup_address', 'Jl. Sudirman 199, Pekanbaru', 'pickup_lat', 0.5, 'pickup_lng', 101.44, 'dropoff_address', 'Bukittinggi', 'pax', 4, 'accommodation', 'customer', 'fuel', 'partner', 'budget', 600000, 'paid_via', 'wallet'));
    perform set_config('request.jwt.claims', json_build_object('sub', drv2, 'role', 'authenticated')::text, true);
    tofr := travel_offer_create(tr.id, 500000, jsonb_build_object('base', 500000), 'Innova 2021');
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    select balance into b0 from wallets where user_id = cust;
    r := to_jsonb(travel_offer_accept(tofr.id));
    select balance into b1 from wallets where user_id = cust;
    perform set_config('request.jwt.claims', json_build_object('sub', drv2, 'role', 'authenticated')::text, true);
    perform travel_request_set_status(tr.id, 'ongoing', null);
    perform travel_request_set_status(tr.id, 'completed', null);
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    perform travel_request_rate(tr.id, 5, 'Sopir ramah');
    j := travel_request_detail(tr.id);
    log := log || format('S11 OK travel charter %s status=%s harga=%s cust -%s', tr.code, j->>'status', tofr.price, b0 - b1) || E'\n';
  exception when others then log := log || 'S11 BUG travel charter: ' || sqlerrm || E'\n'; end;

  -- ===== S12 Dompet: top up manual → admin setujui; penarikan otomatis & manual (PIN admin) =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    select balance into b0 from wallets where user_id = cust;
    tp := request_topup(100000, 'bank_transfer', 'https://x/bukti.jpg', 'uji');
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    perform admin_review_topup(tp.id, true, 'ok');
    select balance into b1 from wallets where user_id = cust;
    log := log || format('S12a %s topup manual +%s', case when b1 - b0 = 100000 then 'OK' else 'BUG' end, b1 - b0) || E'\n';
    insert into bank_accounts (user_id, bank_name, account_no, holder, verified) values (drv, 'BCA', '111', 'Driver', true) on conflict (user_id) do update set verified = true, bank_name = 'BCA', account_no = '111';
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    w := request_withdrawal(50000, 'BCA', '111', 'Driver');
    log := log || format('S12b %s penarikan saat ada flag fraud terbuka → manual (status=%s auto=%s)', case when not w.auto then 'OK' else 'BUG' end, w.status, w.auto) || E'\n';
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    for f in select * from fraud_flags where subject_id = drv and status = 'open' loop perform admin_review_fraud(f.id, 'dismissed', 'uji', false); end loop;
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    w := request_withdrawal(40000, 'BCA', '111', 'Driver');
    log := log || format('S12b2 %s penarikan otomatis setelah flag ditutup status=%s auto=%s', case when w.auto then 'OK' else 'BUG' end, w.status, w.auto) || E'\n';
    perform set_config('request.jwt.claims', json_build_object('sub', drv2, 'role', 'authenticated')::text, true);
    w := request_withdrawal(50000, 'BNI', '222', 'Driver 2');
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    update admin_security set pin_hash = extensions.crypt('123456', extensions.gen_salt('bf')), failed = 0, locked_until = null where user_id = adm;
    insert into admin_security (user_id, pin_hash) select adm, extensions.crypt('123456', extensions.gen_salt('bf')) where not exists (select 1 from admin_security where user_id = adm);
    perform admin_lock();
    begin perform admin_review_withdrawal(w.id, true, 'ok'); log := log || 'S12c BUG: review tanpa PIN diterima' || E'\n'; exception when others then log := log || 'S12c OK terkunci: ' || left(sqlerrm, 40) || E'\n'; end;
    r := admin_unlock('123456');
    w := admin_review_withdrawal(w.id, true, 'ok');
    log := log || format('S12d %s penarikan manual status=%s rekening terverifikasi=%s', case when w.status = 'approved' then 'OK' else 'BUG' end, w.status, (select verified from bank_accounts where user_id = drv2)) || E'\n';
  exception when others then log := log || 'S12 BUG dompet: ' || sqlerrm || E'\n'; end;

  -- ===== S13 Tiket CS & SOS =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    t := create_ticket(jsonb_build_object('subject', 'Driver kasar', 'category', 'driver', 'body', 'Uji aduan'));
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    perform ticket_reply(t.id, 'Kami tindak lanjuti', null, false);
    perform admin_update_ticket(t.id, 'resolved', 'high', adm, 'ditindak');
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    perform close_ticket(t.id, 5, 'cepat');
    r := to_jsonb(sos_trigger(null, 0.5, 101.44, 'uji sos'));
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    perform admin_handle_sos((r->>'id')::uuid, 'handled', 'uji');
    j := cs_stats();
    log := log || format('S13 OK tiket %s ditutup rating 5; SOS ditangani; cs_stats=%s', t.id, left(j::text, 60)) || E'\n';
  exception when others then log := log || 'S13 BUG CS/SOS: ' || sqlerrm || E'\n'; end;

  -- ===== S14 Pesanan terjadwal =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    o := create_order(jsonb_build_object('service', 'ride_motor', 'scheduled_at', (now() + interval '45 minutes')::text, 'pickup', jsonb_build_object('lat', 0.4810, 'lng', 101.4349, 'address', 'A'), 'dropoff', jsonb_build_object('lat', 0.49, 'lng', 101.44, 'address', 'B'), 'paid_via', 'wallet'));
    n := release_scheduled_orders();
    log := log || format('S14 %s terjadwal status=%s scheduled_at=%s dirilis sekarang=%s', case when o.status = 'scheduled' then 'OK' else 'BUG' end, o.status, o.scheduled_at, n) || E'\n';
    perform cancel_order(o.id, 'uji');
  exception when others then log := log || 'S14 BUG terjadwal: ' || sqlerrm || E'\n'; end;

  -- ===== S15 Admin: statistik, blast, kelas driver, gateway, otomasi, eksekutif =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    j := admin_dashboard_stats(); r := admin_traffic_stats(3);
    perform admin_blast_promo(jsonb_build_object('title', 'Uji blast', 'body', 'Diskon uji', 'promo_code', 'ANTARBARU', 'merchant_id', merch, 'audience', 'all'));
    perform admin_set_driver_class(drv2, 'car_standard');
    j := admin_gateway_status(); r := admin_automation_status();
    j := exec_report_data(3);
    log := log || format('S15 OK admin stats ok; blast ok; kelas driver=%s; gateway configured=%s; otomasi pending=%s; exec rekomendasi=%s', (select vehicle_class from drivers where id = drv2), j->>'configured', r->'pending', jsonb_array_length((exec_report_data(3))->'recommendations')) || E'\n';
  exception when others then log := log || 'S15 BUG admin: ' || sqlerrm || E'\n'; end;

  -- ===== S16 Harga dinamis: 3 order mencari driver tanpa driver online =====
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    perform driver_set_online(false, 0.4810, 101.4349);
    perform set_config('request.jwt.claims', json_build_object('sub', drv2, 'role', 'authenticated')::text, true);
    perform driver_set_online(false, 0.4946, 101.4314);
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    j := estimate_fare('ride_motor', 0.4810, 101.4349, 0.49, 101.44, null);
    for n in 1..2 loop
      o := create_order(jsonb_build_object('service', 'ride_motor', 'pickup', jsonb_build_object('lat', 0.4810, 'lng', 101.4349, 'address', 'A'), 'dropoff', jsonb_build_object('lat', 0.49, 'lng', 101.44, 'address', 'B'), 'paid_via', 'cash'));
    end loop;
    r := estimate_fare('ride_motor', 0.4810, 101.4349, 0.49, 101.44, null);
    log := log || format('S16 %s harga dinamis: sebelum=%s sesudah=%s demand=%s', case when (r->>'fare')::bigint > (j->>'fare')::bigint then 'OK' else 'BUG' end, j->>'fare', r->>'fare', r->'demand') || E'\n';
    -- S17 fallback kelas: order Standar berumur >3 menit boleh diambil driver Hemat
    update orders set created_at = now() - interval '4 minutes' where id = o.id;
    perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
    perform driver_set_online(true, 0.4810, 101.4349);
    o := driver_accept_order(o.id);
    log := log || format('S17 %s fallback kelas: order %s (kelas %s) diambil driver Hemat setelah 4 menit', case when o.driver_id = drv then 'OK' else 'BUG' end, o.code, o.vehicle_class) || E'\n';
  exception when others then log := log || 'S16/17 BUG: ' || sqlerrm || E'\n'; end;

  raise exception using message = 'SIMULASI_SELESAI' || log;
end $sim$;
