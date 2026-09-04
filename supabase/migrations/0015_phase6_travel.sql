-- ============================================================================
-- Tahap 6 (c): AntarTravel v2 — mitra = agen travel ATAU pemilik mobil pribadi (sering menganggur)
--   3 mode layanan:  (1) kursi bersama (travel_trips, sudah ada)  (2) carter privat sekali jalan  (3) sopir harian (mobil + sopir per hari)
--   Permintaan (travel_requests) → mitra kirim penawaran harga (travel_offers) → pelanggan terima & bayar → berjalan → selesai (payout)
--   Akomodasi sopir saat menginap: 'customer' (ditanggung pelanggan: makan + penginapan disediakan) atau 'self' (mandiri: kompensasi Rp/malam)
--   Referensi praktik rental: 12 jam/hari, overtime per jam, kompensasi akomodasi mandiri ±Rp150.000/malam, BBM/tol/parkir di luar harga sopir
-- ============================================================================

alter table travel_partners
  add column if not exists partner_type text not null default 'agency' check (partner_type in ('agency','private')),
  add column if not exists offers_shared boolean not null default true,     -- kursi bersama (agen)
  add column if not exists offers_charter boolean not null default true,    -- carter privat sekali jalan
  add column if not exists offers_daily boolean not null default false,     -- sopir harian (mobil + sopir)
  add column if not exists daily_rate bigint,                               -- harga per hari (12 jam), tanpa BBM
  add column if not exists overtime_rate bigint,                            -- per jam lewat 12 jam
  add column if not exists charter_rate_km bigint,                          -- acuan carter per km (opsional)
  add column if not exists accommodation text[] not null default '{customer,self}',  -- opsi akomodasi sopir yang diterima
  add column if not exists accommodation_fee bigint not null default 150000, -- kompensasi akomodasi mandiri per malam
  add column if not exists fuel_included boolean not null default false,
  add column if not exists base_city_id uuid references cities(id),
  add column if not exists bio text,
  add column if not exists driver_name text;
alter table travel_partners drop constraint if exists travel_partners_seats_check;
alter table travel_partners add constraint travel_partners_seats_check check (seats between 3 and 16);

insert into app_settings (key, value) values ('travel_request_commission_pct', '10'), ('travel_daily_hours', '12'), ('travel_cancel_free_hours', '12') on conflict (key) do nothing;

create sequence if not exists travel_request_seq;
create table if not exists travel_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('charter','daily')),
  partner_id uuid references travel_partners(id) on delete set null,      -- bila pelanggan memilih mitra tertentu
  from_city uuid references cities(id),
  to_city uuid references cities(id),
  pickup_address text not null, pickup_lat double precision, pickup_lng double precision,
  dropoff_address text, dropoff_lat double precision, dropoff_lng double precision,
  depart_at timestamptz not null,
  return_at timestamptz,
  days int not null default 1 check (days between 1 and 30),
  pax int not null default 1 check (pax between 1 and 16),
  luggage text,
  accommodation text not null default 'self' check (accommodation in ('customer','self')),
  fuel text not null default 'customer' check (fuel in ('customer','partner')),  -- BBM/tol/parkir ditanggung siapa
  vehicle_pref text,                                                            -- 'mpv' / 'hiace' / 'ev' / bebas
  notes text,
  budget bigint,
  status text not null default 'open' check (status in ('open','offered','accepted','paid','ongoing','completed','cancelled','expired')),
  accepted_offer_id uuid,
  price bigint not null default 0,
  platform_fee bigint not null default 0,
  partner_earning bigint not null default 0,
  payment_method payment_method not null default 'wallet',
  paid_via text not null default 'wallet',
  payment_status payment_status not null default 'unpaid',
  rating int check (rating between 1 and 5),
  rating_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists travel_requests_cust on travel_requests (customer_id, created_at desc);
create index if not exists travel_requests_open on travel_requests (status, depart_at) where status in ('open','offered');

create table if not exists travel_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references travel_requests(id) on delete cascade,
  partner_id uuid not null references travel_partners(id) on delete cascade,
  price bigint not null check (price > 0),
  breakdown jsonb,          -- {daily_rate, days, accommodation_nights, accommodation_fee, fuel_est, overtime_rate, notes}
  message text,
  status text not null default 'offered' check (status in ('offered','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  unique (request_id, partner_id)
);
alter table travel_requests add constraint travel_requests_offer_fk foreign key (accepted_offer_id) references travel_offers(id) on delete set null;
create trigger t_travel_requests_upd before update on travel_requests for each row execute function set_updated_at();

alter table travel_requests enable row level security; alter table travel_offers enable row level security;
create policy tr_sel on travel_requests for select to authenticated using (customer_id = auth.uid() or is_admin()
  or exists (select 1 from travel_partners tp where tp.id = auth.uid() and tp.status = 'approved'));   -- mitra: detail lewat RPC
create policy to_sel on travel_offers for select to authenticated using (partner_id = auth.uid() or is_admin()
  or exists (select 1 from travel_requests r where r.id = request_id and r.customer_id = auth.uid()));
grant select on travel_requests, travel_offers to authenticated;
alter publication supabase_realtime add table travel_requests, travel_offers;

-- ---------- pendaftaran mitra travel v2 ----------
create or replace function travel_partner_register(p jsonb)
returns travel_partners language plpgsql security definer set search_path = public as $$
declare t travel_partners%rowtype; v_type text := coalesce(nullif(p->>'partner_type', ''), 'agency');
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if coalesce((p->>'seats')::int, 0) < 3 then raise exception 'Kursi penumpang minimal 3'; end if;
  if v_type = 'agency' and coalesce((p->>'seats')::int, 0) < 6 then raise exception 'Agen travel kursi bersama wajib mobil ≥ 6 kursi (Innova, Hi-Ace, dsb.)'; end if;
  insert into travel_partners (id, company_name, vehicle_model, vehicle_plate, vehicle_year, seats, is_electric, photo_url, license_url, permit_url,
    partner_type, offers_shared, offers_charter, offers_daily, daily_rate, overtime_rate, accommodation, accommodation_fee, fuel_included, base_city_id, bio, driver_name)
  values (auth.uid(), p->>'company_name', p->>'vehicle_model', upper(p->>'vehicle_plate'), nullif(p->>'vehicle_year', '')::int, (p->>'seats')::int,
    coalesce((p->>'is_electric')::boolean, false), p->>'photo_url', p->>'license_url', p->>'permit_url',
    v_type, coalesce((p->>'offers_shared')::boolean, v_type = 'agency'), coalesce((p->>'offers_charter')::boolean, true), coalesce((p->>'offers_daily')::boolean, v_type = 'private'),
    nullif(p->>'daily_rate', '')::bigint, nullif(p->>'overtime_rate', '')::bigint,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'accommodation', '["customer","self"]'::jsonb)) x), '{customer,self}'),
    coalesce(nullif(p->>'accommodation_fee', '')::bigint, 150000), coalesce((p->>'fuel_included')::boolean, false),
    coalesce(nullif(p->>'base_city_id', '')::uuid, nearest_city(nullif(p->>'base_lat', '')::double precision, nullif(p->>'base_lng', '')::double precision)), p->>'bio', p->>'driver_name')
  on conflict (id) do update set company_name = excluded.company_name, vehicle_model = excluded.vehicle_model, vehicle_plate = excluded.vehicle_plate,
    vehicle_year = excluded.vehicle_year, seats = excluded.seats, is_electric = excluded.is_electric,
    photo_url = coalesce(excluded.photo_url, travel_partners.photo_url), license_url = coalesce(excluded.license_url, travel_partners.license_url),
    permit_url = coalesce(excluded.permit_url, travel_partners.permit_url),
    partner_type = excluded.partner_type, offers_shared = excluded.offers_shared, offers_charter = excluded.offers_charter, offers_daily = excluded.offers_daily,
    daily_rate = excluded.daily_rate, overtime_rate = excluded.overtime_rate, accommodation = excluded.accommodation, accommodation_fee = excluded.accommodation_fee,
    fuel_included = excluded.fuel_included, base_city_id = coalesce(excluded.base_city_id, travel_partners.base_city_id), bio = excluded.bio, driver_name = excluded.driver_name,
    status = case when travel_partners.status in ('approved','suspended') then travel_partners.status else 'pending' end
  returning * into t;
  perform set_config('antaraja.bypass', 'on', true);
  update profiles set role = 'driver' where id = auth.uid() and role = 'customer';
  perform set_config('antaraja.bypass', 'off', true);
  return t;
end $$;

-- direktori mitra (sopir pribadi / agen) untuk pelanggan memilih langsung
create or replace function travel_partners_directory(p_kind text default 'charter', p_city uuid default null)
returns table(id uuid, name text, company_name text, partner_type text, vehicle_model text, vehicle_year int, seats int, is_electric boolean, photo_url text, avatar_url text,
  rating_avg numeric, rating_count int, total_trips int, daily_rate bigint, overtime_rate bigint, accommodation text[], accommodation_fee bigint, fuel_included boolean, base_city text, bio text)
language sql stable security definer set search_path = public as $$
  select tp.id, pr.full_name, tp.company_name, tp.partner_type, tp.vehicle_model, tp.vehicle_year, tp.seats, tp.is_electric, tp.photo_url, pr.avatar_url,
    tp.rating_avg, tp.rating_count, tp.total_trips, tp.daily_rate, tp.overtime_rate, tp.accommodation, tp.accommodation_fee, tp.fuel_included, c.name, tp.bio
  from travel_partners tp join profiles pr on pr.id = tp.id left join cities c on c.id = tp.base_city_id
  where tp.status = 'approved' and pr.is_active
    and (p_kind = 'daily' and tp.offers_daily or p_kind = 'charter' and tp.offers_charter or p_kind = 'shared' and tp.offers_shared)
    and (p_city is null or tp.base_city_id = p_city or tp.base_city_id is null)
  order by (tp.base_city_id = p_city) desc nulls last, tp.rating_avg desc, tp.total_trips desc limit 50;
$$;
grant execute on function travel_partners_directory(text, uuid) to authenticated;

-- ---------- pelanggan: buat permintaan carter / sopir harian ----------
create or replace function travel_request_create(p jsonb)
returns travel_requests language plpgsql security definer set search_path = public as $$
declare r travel_requests%rowtype; v_uid uuid := auth.uid(); v_kind text := p->>'kind'; v_days int := greatest(1, coalesce((p->>'days')::int, 1));
  v_depart timestamptz := (p->>'depart_at')::timestamptz; v_partner uuid := nullif(p->>'partner_id', '')::uuid; v_from uuid; tp travel_partners%rowtype;
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  if v_kind not in ('charter','daily') then raise exception 'Jenis permintaan tidak valid'; end if;
  if v_depart is null or v_depart < now() + interval '2 hours' then raise exception 'Jadwal minimal 2 jam dari sekarang'; end if;
  if v_depart > now() + interval '60 days' then raise exception 'Jadwal maksimal 60 hari ke depan'; end if;
  if coalesce(p->>'pickup_address', '') = '' then raise exception 'Alamat jemput wajib diisi'; end if;
  if v_kind = 'charter' and coalesce(p->>'dropoff_address', '') = '' then raise exception 'Tujuan wajib diisi untuk carter'; end if;
  if (select count(*) from travel_requests where customer_id = v_uid and status in ('open','offered','accepted','paid','ongoing')) >= 3 then raise exception 'Maksimal 3 permintaan travel aktif'; end if;
  if v_partner is not null then
    select * into tp from travel_partners where id = v_partner and status = 'approved';
    if not found then raise exception 'Mitra tidak tersedia'; end if;
    if v_kind = 'daily' and not tp.offers_daily then raise exception 'Mitra ini tidak melayani sopir harian'; end if;
    if v_kind = 'charter' and not tp.offers_charter then raise exception 'Mitra ini tidak melayani carter'; end if;
  end if;
  v_from := coalesce(nullif(p->>'from_city', '')::uuid, nearest_city(nullif(p->>'pickup_lat', '')::double precision, nullif(p->>'pickup_lng', '')::double precision));
  insert into travel_requests (code, customer_id, kind, partner_id, from_city, to_city, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
    depart_at, return_at, days, pax, luggage, accommodation, fuel, vehicle_pref, notes, budget, payment_method, paid_via)
  values ('TR' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || lpad(nextval('travel_request_seq')::text, 4, '0'), v_uid, v_kind, v_partner, v_from,
    coalesce(nullif(p->>'to_city', '')::uuid, nearest_city(nullif(p->>'dropoff_lat', '')::double precision, nullif(p->>'dropoff_lng', '')::double precision)),
    p->>'pickup_address', nullif(p->>'pickup_lat', '')::double precision, nullif(p->>'pickup_lng', '')::double precision,
    p->>'dropoff_address', nullif(p->>'dropoff_lat', '')::double precision, nullif(p->>'dropoff_lng', '')::double precision,
    v_depart, nullif(p->>'return_at', '')::timestamptz, v_days, greatest(1, coalesce((p->>'pax')::int, 1)), p->>'luggage',
    coalesce(nullif(p->>'accommodation', ''), 'self'), coalesce(nullif(p->>'fuel', ''), 'customer'), p->>'vehicle_pref', p->>'notes', nullif(p->>'budget', '')::bigint,
    case when coalesce(p->>'payment_method', 'wallet') = 'cash' then 'cash'::payment_method else 'wallet'::payment_method end, coalesce(nullif(p->>'paid_via', ''), coalesce(p->>'payment_method', 'wallet')))
  returning * into r;
  -- beri tahu mitra yang cocok (kota asal sama / tanpa kota) — satu arah, tanpa spam: maks 30 mitra
  insert into notifications (user_id, kind, title, body, data)
  select tp2.id, 'order', case when v_kind = 'daily' then 'Permintaan sopir harian baru' else 'Permintaan carter baru' end,
    r.pickup_address || coalesce(' → ' || r.dropoff_address, '') || ' · ' || to_char(r.depart_at at time zone 'Asia/Jakarta', 'DD Mon HH24:MI') || ' · ' || r.pax || ' pax · ' || r.days || ' hari',
    jsonb_build_object('travel_request_id', r.id, 'code', r.code)
  from travel_partners tp2 where tp2.status = 'approved' and (v_partner is null or tp2.id = v_partner)
    and (v_kind = 'daily' and tp2.offers_daily or v_kind = 'charter' and tp2.offers_charter)
    and (v_from is null or tp2.base_city_id is null or tp2.base_city_id = v_from)
  limit 30;
  perform log_activity('travel.request', 'travel_requests', r.id::text, 'Permintaan ' || r.kind || ' ' || r.code, jsonb_build_object('customer_id', v_uid));
  return r;
end $$;
grant execute on function travel_request_create(jsonb) to authenticated;

-- ---------- mitra: daftar permintaan terbuka & kirim penawaran ----------
create or replace function travel_partner_open_requests()
returns table(id uuid, code text, kind text, pickup_address text, dropoff_address text, depart_at timestamptz, return_at timestamptz, days int, pax int, luggage text,
  accommodation text, fuel text, vehicle_pref text, notes text, budget bigint, status text, from_city text, to_city text, customer_name text, my_offer jsonb, offers_count bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.code, r.kind, r.pickup_address, r.dropoff_address, r.depart_at, r.return_at, r.days, r.pax, r.luggage, r.accommodation, r.fuel, r.vehicle_pref, r.notes, r.budget, r.status,
    cf.name, ct.name, pr.full_name,
    (select to_jsonb(o) from travel_offers o where o.request_id = r.id and o.partner_id = auth.uid()),
    (select count(*) from travel_offers o where o.request_id = r.id and o.status = 'offered'), r.created_at
  from travel_requests r join profiles pr on pr.id = r.customer_id left join cities cf on cf.id = r.from_city left join cities ct on ct.id = r.to_city
  join travel_partners tp on tp.id = auth.uid() and tp.status = 'approved'
  where (r.status in ('open','offered') and r.depart_at > now() and (r.partner_id is null or r.partner_id = tp.id)
         and (r.kind = 'daily' and tp.offers_daily or r.kind = 'charter' and tp.offers_charter)
         and (r.from_city is null or tp.base_city_id is null or tp.base_city_id = r.from_city))
     or (r.accepted_offer_id in (select o.id from travel_offers o where o.partner_id = tp.id) and r.status in ('accepted','paid','ongoing'))
  order by (r.status in ('accepted','paid','ongoing')) desc, r.depart_at limit 50;
$$;
grant execute on function travel_partner_open_requests() to authenticated;

create or replace function travel_offer_create(p_request uuid, p_price bigint, p_breakdown jsonb default null, p_message text default null)
returns travel_offers language plpgsql security definer set search_path = public as $$
declare r travel_requests%rowtype; tp travel_partners%rowtype; o travel_offers%rowtype;
begin
  select * into tp from travel_partners where id = auth.uid() and status = 'approved';
  if not found then raise exception 'Bukan mitra travel aktif'; end if;
  select * into r from travel_requests where id = p_request for update;
  if not found or r.status not in ('open','offered') then raise exception 'Permintaan tidak tersedia'; end if;
  if r.partner_id is not null and r.partner_id <> tp.id then raise exception 'Permintaan ditujukan ke mitra lain'; end if;
  if p_price < 50000 or p_price > 50000000 then raise exception 'Harga penawaran tidak wajar'; end if;
  insert into travel_offers (request_id, partner_id, price, breakdown, message) values (r.id, tp.id, p_price, p_breakdown, p_message)
  on conflict (request_id, partner_id) do update set price = excluded.price, breakdown = excluded.breakdown, message = excluded.message, status = 'offered', created_at = now()
  returning * into o;
  update travel_requests set status = 'offered' where id = r.id and status = 'open';
  insert into notifications (user_id, kind, title, body, data) values (r.customer_id, 'order', 'Penawaran travel masuk',
    coalesce(tp.company_name, tp.driver_name, 'Mitra') || ' · ' || tp.vehicle_model || ' · Rp' || to_char(p_price, 'FM999G999G999'), jsonb_build_object('travel_request_id', r.id, 'offer_id', o.id));
  return o;
end $$;
grant execute on function travel_offer_create(uuid, bigint, jsonb, text) to authenticated;

-- ---------- pelanggan: terima penawaran & bayar ----------
create or replace function travel_offer_accept(p_offer uuid)
returns travel_requests language plpgsql security definer set search_path = public as $$
declare o travel_offers%rowtype; r travel_requests%rowtype; v_fee bigint; v_comm numeric := setting_num('travel_request_commission_pct', 10); v_bal bigint; tp travel_partners%rowtype;
begin
  select * into o from travel_offers where id = p_offer for update;
  if not found or o.status <> 'offered' then raise exception 'Penawaran tidak tersedia'; end if;
  select * into r from travel_requests where id = o.request_id for update;
  if r.customer_id <> auth.uid() then raise exception 'Bukan permintaan Anda'; end if;
  if r.status not in ('open','offered') then raise exception 'Permintaan sudah diproses'; end if;
  select * into tp from travel_partners where id = o.partner_id;
  v_fee := floor(o.price * v_comm / 100.0)::bigint;
  if r.payment_method = 'wallet' then
    select balance into v_bal from wallets where user_id = r.customer_id for update;
    if coalesce(v_bal, 0) < o.price then raise exception 'SALDO_KURANG:%', o.price - coalesce(v_bal, 0); end if;
    perform wallet_apply(r.customer_id, 'payment', -o.price, null, 'Travel ' || r.code || ' · ' || coalesce(tp.company_name, tp.driver_name, tp.vehicle_model));
  end if;
  update travel_offers set status = 'accepted' where id = o.id;
  update travel_offers set status = 'rejected' where request_id = r.id and id <> o.id and status = 'offered';
  update travel_requests set status = case when r.payment_method = 'wallet' then 'paid' else 'accepted' end, accepted_offer_id = o.id, price = o.price, platform_fee = v_fee,
    partner_earning = o.price - v_fee, payment_status = (case when r.payment_method = 'wallet' then 'paid' else 'unpaid' end)::payment_status
  where id = r.id returning * into r;
  insert into notifications (user_id, kind, title, body, data) values (o.partner_id, 'order', 'Penawaran diterima · ' || r.code,
    r.pickup_address || ' · ' || to_char(r.depart_at at time zone 'Asia/Jakarta', 'DD Mon HH24:MI') || ' · Rp' || to_char(o.price, 'FM999G999G999') || case when r.payment_method = 'cash' then ' (bayar tunai)' else ' (sudah dibayar)' end,
    jsonb_build_object('travel_request_id', r.id));
  perform log_activity('travel.accepted', 'travel_requests', r.id::text, 'Penawaran diterima ' || r.code || ' · Rp' || o.price, jsonb_build_object('partner_id', o.partner_id));
  return r;
end $$;
grant execute on function travel_offer_accept(uuid) to authenticated;

-- ---------- status perjalanan: mitra (ongoing/completed), pelanggan (cancelled) ----------
create or replace function travel_request_set_status(p_request uuid, p_status text, p_note text default null)
returns travel_requests language plpgsql security definer set search_path = public as $$
declare r travel_requests%rowtype; o travel_offers%rowtype; v_uid uuid := auth.uid(); v_refund bigint; v_free numeric := setting_num('travel_cancel_free_hours', 12);
begin
  select * into r from travel_requests where id = p_request for update;
  if not found then raise exception 'Permintaan tidak ditemukan'; end if;
  if r.accepted_offer_id is not null then select * into o from travel_offers where id = r.accepted_offer_id; end if;
  if p_status = 'cancelled' then
    if r.customer_id <> v_uid and not is_admin() then raise exception 'Bukan permintaan Anda'; end if;
    if r.status in ('ongoing','completed','cancelled') then raise exception 'Tidak bisa dibatalkan'; end if;
    if r.payment_status = 'paid' then
      v_refund := case when r.depart_at - now() >= (v_free || ' hours')::interval then r.price else floor(r.price * 0.7)::bigint end;
      perform wallet_apply(r.customer_id, 'refund', v_refund, null, 'Refund travel ' || r.code || case when v_refund < r.price then ' (potongan 30% pembatalan mendadak)' else '' end);
      update travel_requests set payment_status = 'refunded' where id = r.id;
    end if;
    update travel_requests set status = 'cancelled', notes = coalesce(notes, '') || case when p_note is not null then E'\n[batal] ' || p_note else '' end where id = r.id returning * into r;
    if o.partner_id is not null then insert into notifications (user_id, kind, title, body, data) values (o.partner_id, 'order', 'Travel dibatalkan · ' || r.code, coalesce(p_note, 'Dibatalkan pelanggan'), jsonb_build_object('travel_request_id', r.id)); end if;
    return r;
  end if;
  if o.partner_id is null or o.partner_id <> v_uid then raise exception 'Hanya mitra yang diterima'; end if;
  if p_status = 'ongoing' then
    if r.status not in ('accepted','paid') then raise exception 'Status tidak valid'; end if;
    update travel_requests set status = 'ongoing' where id = r.id returning * into r;
  elsif p_status = 'completed' then
    if r.status <> 'ongoing' then raise exception 'Perjalanan belum dimulai'; end if;
    update travel_requests set status = 'completed', payment_status = 'paid' where id = r.id returning * into r;
    if r.payment_method = 'wallet' then
      perform wallet_apply(o.partner_id, 'earning', r.partner_earning, null, 'Pendapatan travel ' || r.code);
    else
      perform wallet_apply(o.partner_id, 'fee', -r.platform_fee, null, 'Komisi platform travel ' || r.code);
    end if;
    perform set_config('antaraja.bypass', 'on', true);
    update travel_partners set total_trips = total_trips + 1 where id = o.partner_id;
    perform set_config('antaraja.bypass', 'off', true);
  else raise exception 'Status tidak dikenal'; end if;
  insert into notifications (user_id, kind, title, body, data) values (r.customer_id, 'order', case when p_status = 'ongoing' then 'Perjalanan dimulai · ' else 'Perjalanan selesai · ' end || r.code,
    coalesce(p_note, case when p_status = 'ongoing' then 'Sopir dalam perjalanan / menjemput Anda' else 'Terima kasih, beri penilaian untuk sopir Anda' end), jsonb_build_object('travel_request_id', r.id));
  return r;
end $$;
grant execute on function travel_request_set_status(uuid, text, text) to authenticated;

create or replace function travel_request_rate(p_request uuid, p_rating int, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r travel_requests%rowtype; o travel_offers%rowtype;
begin
  select * into r from travel_requests where id = p_request for update;
  if not found or r.customer_id <> auth.uid() then raise exception 'Bukan permintaan Anda'; end if;
  if r.status <> 'completed' or r.rating is not null then raise exception 'Belum bisa dinilai'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating 1–5'; end if;
  select * into o from travel_offers where id = r.accepted_offer_id;
  update travel_requests set rating = p_rating, rating_comment = p_comment where id = r.id;
  perform set_config('antaraja.bypass', 'on', true);
  update travel_partners set rating_avg = round(((rating_avg * rating_count) + p_rating) / (rating_count + 1.0), 2), rating_count = rating_count + 1 where id = o.partner_id;
  perform set_config('antaraja.bypass', 'off', true);
end $$;
grant execute on function travel_request_rate(uuid, int, text) to authenticated;

-- detail permintaan + penawaran (pelanggan / mitra terkait / admin)
create or replace function travel_request_detail(p_request uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(r) || jsonb_build_object(
    'from_city_name', (select name from cities where id = r.from_city), 'to_city_name', (select name from cities where id = r.to_city),
    'customer', (select jsonb_build_object('id', pr.id, 'name', pr.full_name, 'avatar_url', pr.avatar_url) from profiles pr where pr.id = r.customer_id),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'price', o.price, 'breakdown', o.breakdown, 'message', o.message, 'status', o.status, 'created_at', o.created_at,
        'partner', jsonb_build_object('id', tp.id, 'name', pr.full_name, 'company_name', tp.company_name, 'driver_name', tp.driver_name, 'partner_type', tp.partner_type, 'vehicle_model', tp.vehicle_model, 'vehicle_year', tp.vehicle_year,
          'vehicle_plate', tp.vehicle_plate, 'seats', tp.seats, 'is_electric', tp.is_electric, 'rating_avg', tp.rating_avg, 'rating_count', tp.rating_count, 'total_trips', tp.total_trips, 'avatar_url', pr.avatar_url, 'photo_url', tp.photo_url,
          'accommodation', tp.accommodation, 'accommodation_fee', tp.accommodation_fee, 'fuel_included', tp.fuel_included)) order by o.created_at)
      from travel_offers o join travel_partners tp on tp.id = o.partner_id join profiles pr on pr.id = tp.id
      where o.request_id = r.id and (r.customer_id = auth.uid() or is_admin() or o.partner_id = auth.uid())), '[]'::jsonb))
  from travel_requests r where r.id = p_request
    and (r.customer_id = auth.uid() or is_admin() or exists (select 1 from travel_offers o where o.request_id = r.id and o.partner_id = auth.uid())
         or (r.status in ('open','offered') and exists (select 1 from travel_partners tp where tp.id = auth.uid() and tp.status = 'approved')));
$$;
grant execute on function travel_request_detail(uuid) to authenticated;

-- admin: ringkasan permintaan travel
create or replace function admin_travel_requests(p_status text default null)
returns table(id uuid, code text, kind text, status text, customer_name text, partner_name text, pickup_address text, dropoff_address text, depart_at timestamptz, days int, pax int, price bigint, platform_fee bigint, payment_status payment_status, offers_count bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.code, r.kind, r.status, pc.full_name, coalesce(tp.company_name, pp.full_name), r.pickup_address, r.dropoff_address, r.depart_at, r.days, r.pax, r.price, r.platform_fee, r.payment_status,
    (select count(*) from travel_offers o where o.request_id = r.id), r.created_at
  from travel_requests r join profiles pc on pc.id = r.customer_id
  left join travel_offers ao on ao.id = r.accepted_offer_id left join travel_partners tp on tp.id = ao.partner_id left join profiles pp on pp.id = tp.id
  where is_admin() and (p_status is null or r.status = p_status) order by r.created_at desc limit 200;
$$;
grant execute on function admin_travel_requests(text) to authenticated;

-- demo: mitra sopir pribadi (driver2 tetap agen Hi-Ace; tambah profil tipe private pada driver motor? tidak — buat via UI). Perbarui driver2 agar juga melayani carter & harian.
update travel_partners set offers_charter = true, offers_daily = true, daily_rate = 650000, overtime_rate = 50000, accommodation = '{customer,self}', accommodation_fee = 150000, driver_name = 'Rizal'
  where id = 'a0000000-0000-4000-8000-000000000004';
