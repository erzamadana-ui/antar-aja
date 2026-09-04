-- ============================================================================
-- Tahap 6 (a): AntarShop katalog toko (Indomaret/Alfamart/apotek/supermarket) + AntarMarket pasar tradisional
--   • shop_stores / shop_products : toko & katalog per toko (harga toko), stok habis, impor CSV oleh admin
--   • markets / market_items / market_prices / market_price_log : pasar terdekat, bahan masak, harga acuan,
--     harga riil yang diisi driver saat belanja (nota) → memperbarui acuan
--   • orders: shop_store_id, market_id, shop_vehicle (motor/car), service_fee (jasa belanja) & bagian driver
--   • margin: jasa belanja = max(pct × belanja, minimum) → dibagi driver/perusahaan (app_settings)
-- ============================================================================

-- ---------- pengaturan margin ----------
insert into app_settings (key, value) values
  ('shop_service_pct', '5'), ('shop_service_min', '5000'), ('shop_driver_share_pct', '70'),
  ('market_service_pct', '10'), ('market_service_min', '8000'), ('market_driver_share_pct', '70'),
  ('shop_car_factor', '1.8'), ('shop_car_min_budget', '250000'), ('shop_budget_buffer_pct', '10')
on conflict (key) do nothing;

insert into pricing (service, base_fare, per_km, per_min, min_fare, platform_fee, commission_pct, merchant_commission_pct, surge_multiplier)
values ('market', 6000, 2500, 0, 9000, 1000, 20, 0, 1) on conflict (service) do nothing;

-- ---------- orders: kolom tahap 6 ----------
alter table orders
  add column if not exists shop_store_id uuid,
  add column if not exists market_id uuid,
  add column if not exists shop_vehicle text not null default 'motor' check (shop_vehicle in ('motor','car')),
  add column if not exists service_fee bigint not null default 0,          -- jasa belanja (dibayar pelanggan)
  add column if not exists driver_service_share bigint not null default 0, -- bagian driver dari jasa belanja
  add column if not exists actual_items jsonb;                             -- harga riil per item dari driver (nota)

-- ---------- AntarShop: toko & katalog ----------
create table if not exists shop_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null default 'lainnya',        -- indomaret / alfamart / alfamidi / apotek / supermarket / lainnya
  category text not null default 'minimarket',  -- minimarket / apotek / supermarket
  address text,
  lat double precision not null, lng double precision not null,
  location geography(point, 4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  city_id uuid references cities(id),
  open_hours text default '07:00-22:00',
  phone text,
  image_url text,
  catalog_source text not null default 'admin', -- admin / csv / api (rencana integrasi resmi)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shop_stores_loc on shop_stores using gist (location);

create table if not exists shop_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references shop_stores(id) on delete cascade,
  sku text,
  name text not null,
  category text not null default 'lainnya',     -- sembako / minuman / snack / obat / kebersihan / bayi / dapur / lainnya
  unit text not null default 'pcs',
  price bigint not null check (price >= 0),
  image_url text,
  in_stock boolean not null default true,
  stock int,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (store_id, sku)
);
create index if not exists shop_products_store on shop_products(store_id, active, in_stock);
create index if not exists shop_products_name on shop_products using gin (to_tsvector('simple', name));

-- ---------- AntarMarket: pasar tradisional ----------
create table if not exists markets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision not null, lng double precision not null,
  location geography(point, 4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  city_id uuid references cities(id),
  open_hours text default '05:00-13:00',
  image_url text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists markets_loc on markets using gist (location);

create table if not exists market_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'sayur',       -- sayur / bumbu / daging_ikan / buah / sembako / lainnya
  unit text not null default 'kg',              -- kg / ikat / ekor / butir / liter / bungkus
  ref_price bigint not null check (ref_price >= 0),   -- harga acuan nasional/kota (PIHPS / survei admin)
  price_source text not null default 'admin',   -- admin / pihps / survey
  price_updated_at timestamptz not null default now(),
  image_url text,
  sort int not null default 100,
  active boolean not null default true
);
-- harga acuan per pasar (hasil survei / median harga riil driver 7 hari terakhir)
create table if not exists market_prices (
  market_id uuid not null references markets(id) on delete cascade,
  item_id uuid not null references market_items(id) on delete cascade,
  price bigint not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (market_id, item_id)
);
create table if not exists market_price_log (
  id bigserial primary key,
  market_id uuid references markets(id) on delete set null,
  item_id uuid not null references market_items(id) on delete cascade,
  price bigint not null,
  qty numeric,
  source text not null default 'driver',        -- driver (nota) / admin / pihps
  order_id uuid references orders(id) on delete set null,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists market_price_log_item on market_price_log(item_id, market_id, created_at desc);

alter table orders add constraint orders_shop_store_fk foreign key (shop_store_id) references shop_stores(id) on delete set null;
alter table orders add constraint orders_market_fk foreign key (market_id) references markets(id) on delete set null;

-- ---------- RLS ----------
alter table shop_stores enable row level security; alter table shop_products enable row level security;
alter table markets enable row level security; alter table market_items enable row level security;
alter table market_prices enable row level security; alter table market_price_log enable row level security;
create policy shop_stores_sel on shop_stores for select to authenticated using (active or is_admin());
create policy shop_products_sel on shop_products for select to authenticated using (active or is_admin());
create policy markets_sel on markets for select to authenticated using (active or is_admin());
create policy market_items_sel on market_items for select to authenticated using (active or is_admin());
create policy market_prices_sel on market_prices for select to authenticated using (true);
create policy market_price_log_sel on market_price_log for select to authenticated using (is_admin());
grant select on shop_stores, shop_products, markets, market_items, market_prices, market_price_log to authenticated;
-- tulis hanya lewat RPC admin (security definer)

create trigger t_shop_stores_upd before update on shop_stores for each row execute function set_updated_at();
create trigger t_shop_products_upd before update on shop_products for each row execute function set_updated_at();
create trigger t_markets_upd before update on markets for each row execute function set_updated_at();

-- ---------- RPC: pencarian toko & katalog ----------
create or replace function nearby_stores(p_lat double precision, p_lng double precision, p_radius_km numeric default 15, p_category text default null)
returns table(id uuid, name text, brand text, category text, address text, lat double precision, lng double precision, open_hours text, image_url text,
  distance_km numeric, product_count bigint, is_open_now boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.brand, s.category, s.address, s.lat, s.lng, s.open_hours, s.image_url,
    round((st_distance(s.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0)::numeric, 2) as distance_km,
    (select count(*) from shop_products p where p.store_id = s.id and p.active) as product_count,
    case when s.open_hours ~ '^\d{2}:\d{2}-\d{2}:\d{2}$' then
      (to_char(now() at time zone 'Asia/Jakarta', 'HH24:MI') between split_part(s.open_hours, '-', 1) and split_part(s.open_hours, '-', 2))
      or split_part(s.open_hours, '-', 2) <= split_part(s.open_hours, '-', 1)
    else true end as is_open_now
  from shop_stores s
  where s.active and (p_category is null or s.category = p_category or s.brand = p_category)
    and st_dwithin(s.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
  order by distance_km limit 40;
$$;
grant execute on function nearby_stores(double precision, double precision, numeric, text) to authenticated;

create or replace function store_products(p_store uuid, p_q text default null, p_category text default null)
returns setof shop_products language sql stable security definer set search_path = public as $$
  select * from shop_products p
  where p.store_id = p_store and p.active
    and (p_category is null or p.category = p_category)
    and (p_q is null or p_q = '' or p.name ilike '%' || p_q || '%')
  order by p.in_stock desc, p.category, p.name limit 300;
$$;
grant execute on function store_products(uuid, text, text) to authenticated;

-- ---------- RPC: pasar & bahan masak ----------
create or replace function nearby_markets(p_lat double precision, p_lng double precision, p_radius_km numeric default 15)
returns table(id uuid, name text, address text, lat double precision, lng double precision, open_hours text, image_url text, notes text, distance_km numeric, is_open_now boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.name, m.address, m.lat, m.lng, m.open_hours, m.image_url, m.notes,
    round((st_distance(m.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0)::numeric, 2) as distance_km,
    case when m.open_hours ~ '^\d{2}:\d{2}-\d{2}:\d{2}$' then
      to_char(now() at time zone 'Asia/Jakarta', 'HH24:MI') between split_part(m.open_hours, '-', 1) and split_part(m.open_hours, '-', 2)
    else true end as is_open_now
  from markets m
  where m.active and st_dwithin(m.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
  order by distance_km limit 20;
$$;
grant execute on function nearby_markets(double precision, double precision, numeric) to authenticated;

-- katalog bahan: harga acuan per pasar (market_prices) → median nota driver 7 hari → acuan umum item
create or replace function market_catalog(p_market uuid default null)
returns table(id uuid, name text, category text, unit text, image_url text, sort int, ref_price bigint, price bigint, price_source text, price_updated_at timestamptz, samples bigint)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.category, i.unit, i.image_url, i.sort, i.ref_price,
    coalesce(mp.price,
      (select percentile_cont(0.5) within group (order by l.price)::bigint from market_price_log l where l.item_id = i.id and (p_market is null or l.market_id = p_market) and l.created_at > now() - interval '7 days' and l.source = 'driver'),
      i.ref_price) as price,
    case when mp.price is not null then 'pasar' when exists (select 1 from market_price_log l where l.item_id = i.id and (p_market is null or l.market_id = p_market) and l.created_at > now() - interval '7 days') then 'nota_driver' else i.price_source end as price_source,
    coalesce(mp.updated_at, i.price_updated_at) as price_updated_at,
    (select count(*) from market_price_log l where l.item_id = i.id and (p_market is null or l.market_id = p_market) and l.created_at > now() - interval '7 days') as samples
  from market_items i left join market_prices mp on mp.item_id = i.id and mp.market_id = p_market
  where i.active order by i.sort, i.category, i.name;
$$;
grant execute on function market_catalog(uuid) to authenticated;

-- ---------- RPC admin: toko, produk, impor CSV, pasar, bahan, harga ----------
create or replace function admin_upsert_store(p jsonb) returns shop_stores language plpgsql security definer set search_path = public as $$
declare r shop_stores%rowtype;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if nullif(p->>'id', '') is null then
    insert into shop_stores (name, brand, category, address, lat, lng, city_id, open_hours, phone, image_url, catalog_source, active)
    values (p->>'name', coalesce(p->>'brand', 'lainnya'), coalesce(p->>'category', 'minimarket'), p->>'address', (p->>'lat')::double precision, (p->>'lng')::double precision,
      nullif(p->>'city_id', '')::uuid, coalesce(p->>'open_hours', '07:00-22:00'), p->>'phone', p->>'image_url', coalesce(p->>'catalog_source', 'admin'), coalesce((p->>'active')::boolean, true))
    returning * into r;
  else
    update shop_stores set name = coalesce(p->>'name', name), brand = coalesce(p->>'brand', brand), category = coalesce(p->>'category', category), address = coalesce(p->>'address', address),
      lat = coalesce((p->>'lat')::double precision, lat), lng = coalesce((p->>'lng')::double precision, lng), city_id = coalesce(nullif(p->>'city_id', '')::uuid, city_id),
      open_hours = coalesce(p->>'open_hours', open_hours), phone = coalesce(p->>'phone', phone), image_url = coalesce(p->>'image_url', image_url),
      catalog_source = coalesce(p->>'catalog_source', catalog_source), active = coalesce((p->>'active')::boolean, active)
    where id = (p->>'id')::uuid returning * into r;
    if not found then raise exception 'Toko tidak ditemukan'; end if;
  end if;
  update shop_stores set city_id = nearest_city(r.lat, r.lng) where id = r.id and city_id is null;
  perform log_activity('shop_store_upsert', 'shop_store', r.id::text, 'Toko: ' || r.name);
  return r;
end $$;
grant execute on function admin_upsert_store(jsonb) to authenticated;

create or replace function admin_upsert_product(p jsonb) returns shop_products language plpgsql security definer set search_path = public as $$
declare r shop_products%rowtype;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if nullif(p->>'id', '') is null then
    insert into shop_products (store_id, sku, name, category, unit, price, image_url, in_stock, stock, active)
    values ((p->>'store_id')::uuid, nullif(p->>'sku', ''), p->>'name', coalesce(p->>'category', 'lainnya'), coalesce(p->>'unit', 'pcs'), (p->>'price')::bigint, p->>'image_url',
      coalesce((p->>'in_stock')::boolean, true), nullif(p->>'stock', '')::int, coalesce((p->>'active')::boolean, true))
    on conflict (store_id, sku) do update set name = excluded.name, category = excluded.category, unit = excluded.unit, price = excluded.price, image_url = coalesce(excluded.image_url, shop_products.image_url), in_stock = excluded.in_stock, stock = excluded.stock, active = excluded.active
    returning * into r;
  else
    update shop_products set sku = coalesce(nullif(p->>'sku', ''), sku), name = coalesce(p->>'name', name), category = coalesce(p->>'category', category), unit = coalesce(p->>'unit', unit),
      price = coalesce((p->>'price')::bigint, price), image_url = coalesce(p->>'image_url', image_url), in_stock = coalesce((p->>'in_stock')::boolean, in_stock),
      stock = case when p ? 'stock' then nullif(p->>'stock', '')::int else stock end, active = coalesce((p->>'active')::boolean, active)
    where id = (p->>'id')::uuid returning * into r;
    if not found then raise exception 'Produk tidak ditemukan'; end if;
  end if;
  return r;
end $$;
grant execute on function admin_upsert_product(jsonb) to authenticated;

-- impor massal (CSV → jsonb array [{sku,name,category,unit,price,in_stock}]) — sumber "set up dari supermarket"
create or replace function admin_import_products(p_store uuid, p_items jsonb, p_source text default 'csv')
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; n int := 0;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if not exists (select 1 from shop_stores where id = p_store) then raise exception 'Toko tidak ditemukan'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(it->>'name', '') = '' or (it->>'price') is null then continue; end if;
    insert into shop_products (store_id, sku, name, category, unit, price, in_stock, image_url)
    values (p_store, coalesce(nullif(it->>'sku', ''), lower(regexp_replace(it->>'name', '[^a-zA-Z0-9]+', '-', 'g'))), it->>'name', coalesce(nullif(it->>'category', ''), 'lainnya'),
      coalesce(nullif(it->>'unit', ''), 'pcs'), (it->>'price')::bigint, coalesce((it->>'in_stock')::boolean, true), it->>'image_url')
    on conflict (store_id, sku) do update set name = excluded.name, category = excluded.category, unit = excluded.unit, price = excluded.price, in_stock = excluded.in_stock, image_url = coalesce(excluded.image_url, shop_products.image_url), active = true;
    n := n + 1;
  end loop;
  update shop_stores set catalog_source = p_source where id = p_store;
  perform log_activity('shop_import_products', 'shop_store', p_store::text, 'Impor ' || n || ' produk (' || p_source || ')', jsonb_build_object('count', n, 'source', p_source));
  return jsonb_build_object('imported', n);
end $$;
grant execute on function admin_import_products(uuid, jsonb, text) to authenticated;

create or replace function admin_set_product_stock(p_ids uuid[], p_in_stock boolean) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  update shop_products set in_stock = p_in_stock where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function admin_set_product_stock(uuid[], boolean) to authenticated;

create or replace function admin_upsert_market(p jsonb) returns markets language plpgsql security definer set search_path = public as $$
declare r markets%rowtype;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if nullif(p->>'id', '') is null then
    insert into markets (name, address, lat, lng, city_id, open_hours, image_url, notes, active)
    values (p->>'name', p->>'address', (p->>'lat')::double precision, (p->>'lng')::double precision, nullif(p->>'city_id', '')::uuid, coalesce(p->>'open_hours', '05:00-13:00'), p->>'image_url', p->>'notes', coalesce((p->>'active')::boolean, true))
    returning * into r;
  else
    update markets set name = coalesce(p->>'name', name), address = coalesce(p->>'address', address), lat = coalesce((p->>'lat')::double precision, lat), lng = coalesce((p->>'lng')::double precision, lng),
      city_id = coalesce(nullif(p->>'city_id', '')::uuid, city_id), open_hours = coalesce(p->>'open_hours', open_hours), image_url = coalesce(p->>'image_url', image_url), notes = coalesce(p->>'notes', notes), active = coalesce((p->>'active')::boolean, active)
    where id = (p->>'id')::uuid returning * into r;
    if not found then raise exception 'Pasar tidak ditemukan'; end if;
  end if;
  update markets set city_id = nearest_city(r.lat, r.lng) where id = r.id and city_id is null;
  perform log_activity('market_upsert', 'market', r.id::text, 'Pasar: ' || r.name);
  return r;
end $$;
grant execute on function admin_upsert_market(jsonb) to authenticated;

create or replace function admin_upsert_market_item(p jsonb) returns market_items language plpgsql security definer set search_path = public as $$
declare r market_items%rowtype;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if nullif(p->>'id', '') is null then
    insert into market_items (name, category, unit, ref_price, price_source, image_url, sort, active)
    values (p->>'name', coalesce(p->>'category', 'sayur'), coalesce(p->>'unit', 'kg'), (p->>'ref_price')::bigint, coalesce(p->>'price_source', 'admin'), p->>'image_url', coalesce((p->>'sort')::int, 100), coalesce((p->>'active')::boolean, true))
    returning * into r;
  else
    update market_items set name = coalesce(p->>'name', name), category = coalesce(p->>'category', category), unit = coalesce(p->>'unit', unit),
      ref_price = coalesce((p->>'ref_price')::bigint, ref_price), price_source = case when p ? 'ref_price' then coalesce(p->>'price_source', 'admin') else price_source end,
      price_updated_at = case when p ? 'ref_price' then now() else price_updated_at end,
      image_url = coalesce(p->>'image_url', image_url), sort = coalesce((p->>'sort')::int, sort), active = coalesce((p->>'active')::boolean, active)
    where id = (p->>'id')::uuid returning * into r;
    if not found then raise exception 'Bahan tidak ditemukan'; end if;
  end if;
  if p ? 'ref_price' then insert into market_price_log (item_id, price, source, actor_id) values (r.id, r.ref_price, 'admin', auth.uid()); end if;
  return r;
end $$;
grant execute on function admin_upsert_market_item(jsonb) to authenticated;

-- set harga acuan per pasar massal: [{item_id, price}]
create or replace function admin_set_market_prices(p_market uuid, p_prices jsonb, p_source text default 'survey')
returns int language plpgsql security definer set search_path = public as $$
declare it jsonb; n int := 0;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  for it in select * from jsonb_array_elements(p_prices) loop
    insert into market_prices (market_id, item_id, price) values (p_market, (it->>'item_id')::uuid, (it->>'price')::bigint)
    on conflict (market_id, item_id) do update set price = excluded.price, updated_at = now();
    insert into market_price_log (market_id, item_id, price, source, actor_id) values (p_market, (it->>'item_id')::uuid, (it->>'price')::bigint, p_source, auth.uid());
    n := n + 1;
  end loop;
  perform log_activity('market_set_prices', 'market', p_market::text, 'Set ' || n || ' harga acuan (' || p_source || ')', jsonb_build_object('count', n, 'source', p_source));
  return n;
end $$;
grant execute on function admin_set_market_prices(uuid, jsonb, text) to authenticated;

-- statistik harga untuk admin: acuan vs nota driver 30 hari
create or replace function admin_market_price_stats(p_days int default 30)
returns table(item_id uuid, name text, unit text, ref_price bigint, driver_median bigint, driver_samples bigint, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.unit, i.ref_price,
    (select percentile_cont(0.5) within group (order by l.price)::bigint from market_price_log l where l.item_id = i.id and l.source = 'driver' and l.created_at > now() - (p_days || ' days')::interval),
    (select count(*) from market_price_log l where l.item_id = i.id and l.source = 'driver' and l.created_at > now() - (p_days || ' days')::interval),
    (select max(l.created_at) from market_price_log l where l.item_id = i.id and l.source = 'driver')
  from market_items i where i.active and is_admin() order by i.sort, i.name;
$$;
grant execute on function admin_market_price_stats(int) to authenticated;

-- ---------- jasa belanja (margin) ----------
create or replace function shopping_service_fee(p_service service_type, p_subtotal bigint)
returns bigint language sql stable as $$
  select case when p_service = 'market'
    then greatest(setting_num('market_service_min', 8000)::bigint, floor(p_subtotal * setting_num('market_service_pct', 10) / 100.0)::bigint)
    else greatest(setting_num('shop_service_min', 5000)::bigint, floor(p_subtotal * setting_num('shop_service_pct', 5) / 100.0)::bigint) end;
$$;
create or replace function shopping_driver_share(p_service service_type, p_fee bigint)
returns bigint language sql stable as $$
  select floor(p_fee * (case when p_service = 'market' then setting_num('market_driver_share_pct', 70) else setting_num('shop_driver_share_pct', 70) end) / 100.0)::bigint;
$$;
grant execute on function shopping_service_fee(service_type, bigint) to authenticated;
grant execute on function shopping_driver_share(service_type, bigint) to authenticated;

-- estimasi biaya belanja untuk layar pelanggan (ongkir motor/mobil + jasa + fee)
create or replace function shopping_estimate(p_service service_type, p_pickup_lat double precision, p_pickup_lng double precision,
  p_drop_lat double precision, p_drop_lng double precision, p_subtotal bigint, p_vehicle text default 'motor', p_route_km numeric default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_est jsonb; v_fare bigint; v_fee bigint; v_service bigint; v_car numeric := setting_num('shop_car_factor', 1.8);
begin
  v_est := estimate_fare(p_service, p_pickup_lat, p_pickup_lng, p_drop_lat, p_drop_lng, p_route_km);
  v_fare := (v_est->>'fare')::bigint;
  if p_vehicle = 'car' then v_fare := round_to((v_fare::numeric * v_car)::bigint, 500); end if;
  v_fee := (v_est->>'platform_fee')::bigint;
  v_service := shopping_service_fee(p_service, greatest(0, p_subtotal));
  return v_est || jsonb_build_object('fare', v_fare, 'service_fee', v_service, 'subtotal', greatest(0, p_subtotal),
    'total', v_fare + v_fee + v_service + greatest(0, p_subtotal),
    'fare_motor', (v_est->>'fare')::bigint, 'fare_car', round_to((((v_est->>'fare')::bigint)::numeric * v_car)::bigint, 500),
    'car_min_budget', setting_num('shop_car_min_budget', 250000)::bigint);
end $$;
grant execute on function shopping_estimate(service_type, double precision, double precision, double precision, double precision, bigint, text, numeric) to authenticated;
