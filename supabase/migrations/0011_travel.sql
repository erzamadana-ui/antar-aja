-- =====================================================================
-- Antar Aja — Tahap 5 · AntarTravel (perjalanan antar kota bersama mitra travel)
--  Rute antar kota (harga per kursi & carter/private), mitra travel (Innova/Hi-Ace, ICE/EV),
--  jadwal keberangkatan (trip), booking tanggal + jemput di rumah, minimum penumpang,
--  private untuk 1 keluarga, pembayaran & pencairan.
--  Asumsi bisnis: minimum penumpang berangkat = 4 (praktik umum travel Sumatra; referensi operator
--  tidak menyebut angka eksplisit) — bisa diubah per rute (travel_routes.min_pax).
-- =====================================================================
create table if not exists travel_routes (
  id uuid primary key default gen_random_uuid(),
  from_city uuid not null references cities(id) on delete cascade,
  to_city uuid not null references cities(id) on delete cascade,
  distance_km numeric(6,1) not null default 0,
  duration_h numeric(4,1) not null default 0,
  seat_price bigint not null,                -- harga per kursi (bersama)
  private_price bigint not null,             -- carter 1 keluarga, mobil 6–7 kursi (Innova)
  private_price_large bigint,                -- carter mobil besar 11–15 kursi (Hi-Ace)
  min_pax int not null default 4,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (from_city, to_city)
);
create table if not exists travel_partners (
  id uuid primary key references profiles(id) on delete cascade,
  company_name text,
  vehicle_model text not null,               -- Innova Reborn / Hi-Ace Commuter / dll
  vehicle_plate text not null,
  vehicle_year int,
  seats int not null default 6 check (seats between 4 and 16),   -- kursi penumpang
  is_electric boolean not null default false,
  photo_url text,
  license_url text,                          -- SIM
  permit_url text,                           -- izin angkutan/KIR (opsional)
  status approval_status not null default 'pending',
  status_reason text,
  rating_avg numeric(3,2) not null default 5.00,
  rating_count int not null default 0,
  total_trips int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists travel_trips (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references travel_partners(id) on delete cascade,
  route_id uuid not null references travel_routes(id) on delete cascade,
  depart_at timestamptz not null,
  seats_total int not null,
  seats_booked int not null default 0,
  min_pax int not null default 4,
  seat_price bigint not null,
  private_price bigint not null,
  allow_private boolean not null default true,
  is_private boolean not null default false,  -- sudah dicarter 1 keluarga
  status text not null default 'open' check (status in ('open','confirmed','full','departed','arrived','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists travel_trips_idx on travel_trips (route_id, depart_at);
create table if not exists travel_bookings (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  trip_id uuid not null references travel_trips(id) on delete cascade,
  customer_id uuid not null references profiles(id) on delete cascade,
  pax int not null check (pax between 1 and 16),
  is_private boolean not null default false,
  pickup_address text not null,
  pickup_location geography(point, 4326),
  dropoff_address text,
  passengers jsonb not null default '[]',    -- [{name, phone?}]
  price bigint not null,
  platform_fee bigint not null default 0,
  partner_earning bigint not null default 0,
  payment_method payment_method not null default 'cash',
  paid_via text,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  status text not null default 'booked' check (status in ('booked','confirmed','picked_up','completed','cancelled')),
  notes text,
  rating int check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table travel_bookings add column if not exists pickup_lat double precision generated always as (st_y(pickup_location::geometry)) stored;
alter table travel_bookings add column if not exists pickup_lng double precision generated always as (st_x(pickup_location::geometry)) stored;
create index if not exists travel_bookings_cust_idx on travel_bookings (customer_id, created_at desc);
create index if not exists travel_bookings_trip_idx on travel_bookings (trip_id);
create sequence if not exists travel_booking_seq;
create trigger t_travel_partners_upd before update on travel_partners for each row execute function set_updated_at();
create trigger t_travel_bookings_upd before update on travel_bookings for each row execute function set_updated_at();

alter table travel_routes enable row level security; alter table travel_partners enable row level security;
alter table travel_trips enable row level security; alter table travel_bookings enable row level security;
create policy tr_select on travel_routes for select to anon, authenticated using (active or is_admin());
create policy tr_admin on travel_routes for all to authenticated using (is_admin()) with check (is_admin());
create policy tp_select on travel_partners for select to authenticated using (status = 'approved' or id = auth.uid() or is_admin());
create policy tt_select on travel_trips for select to anon, authenticated using (true);
create policy tb_select on travel_bookings for select to authenticated using (
  customer_id = auth.uid() or is_admin() or exists (select 1 from travel_trips t where t.id = travel_bookings.trip_id and t.partner_id = auth.uid()));
grant select on travel_routes, travel_partners, travel_trips, travel_bookings to anon, authenticated;
grant insert, update, delete on travel_routes to authenticated;
alter publication supabase_realtime add table travel_trips, travel_bookings;

insert into app_settings (key, value) values ('travel_commission_pct', '10'), ('travel_platform_fee', '5000') on conflict (key) do nothing;

-- seed rute (harga acuan operator travel Sumatra 2026: kursi Rp50rb–250rb, carter Hi-Ace ±Rp2,5jt)
insert into travel_routes (from_city, to_city, distance_km, duration_h, seat_price, private_price, private_price_large, min_pax)
select a.id, b.id, r.km, r.h, r.seat, r.priv, r.privl, 4 from (values
  ('Padang','Pekanbaru', 355, 8.0, 150000, 950000, 2300000), ('Pekanbaru','Padang', 355, 8.0, 150000, 950000, 2300000),
  ('Padang','Bukittinggi', 95, 2.5, 50000, 350000, 800000), ('Bukittinggi','Padang', 95, 2.5, 50000, 350000, 800000),
  ('Pekanbaru','Dumai', 190, 4.0, 100000, 650000, 1500000), ('Dumai','Pekanbaru', 190, 4.0, 100000, 650000, 1500000),
  ('Pekanbaru','Bukittinggi', 270, 6.0, 130000, 850000, 2000000), ('Bukittinggi','Pekanbaru', 270, 6.0, 130000, 850000, 2000000),
  ('Pekanbaru','Jambi', 520, 10.0, 220000, 1500000, 3200000), ('Jambi','Pekanbaru', 520, 10.0, 220000, 1500000, 3200000),
  ('Padang','Medan', 780, 16.0, 350000, 2400000, 4800000), ('Medan','Padang', 780, 16.0, 350000, 2400000, 4800000)
) as r(f, t, km, h, seat, priv, privl) join cities a on a.name = r.f join cities b on b.name = r.t
on conflict (from_city, to_city) do nothing;

-- ---------- pencarian ----------
create or replace function travel_search(p_from uuid, p_to uuid, p_date date default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'route', (select to_jsonb(r) - 'created_at' from travel_routes r where r.from_city = p_from and r.to_city = p_to and r.active),
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'depart_at', t.depart_at, 'seats_total', t.seats_total, 'seats_booked', t.seats_booked, 'seats_left', t.seats_total - t.seats_booked,
        'min_pax', t.min_pax, 'seat_price', t.seat_price, 'private_price', t.private_price, 'allow_private', t.allow_private and t.seats_booked = 0,
        'status', t.status, 'notes', t.notes,
        'partner', jsonb_build_object('id', p.id, 'company', p.company_name, 'model', p.vehicle_model, 'plate', p.vehicle_plate, 'seats', p.seats,
          'is_electric', p.is_electric, 'photo_url', p.photo_url, 'rating', p.rating_avg, 'rating_count', p.rating_count, 'total_trips', p.total_trips, 'name', pr.full_name, 'avatar_url', pr.avatar_url))
        order by t.depart_at)
      from travel_trips t join travel_routes r on r.id = t.route_id join travel_partners p on p.id = t.partner_id join profiles pr on pr.id = p.id
      where r.from_city = p_from and r.to_city = p_to and p.status = 'approved' and t.status in ('open','confirmed')
        and t.depart_at > now() + interval '1 hour'
        and (p_date is null or (t.depart_at at time zone 'Asia/Jakarta')::date = p_date)), '[]'::jsonb))
$$;

-- ---------- mitra travel ----------
create or replace function travel_partner_register(p jsonb)
returns travel_partners language plpgsql security definer set search_path = public as $$
declare t travel_partners%rowtype;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if coalesce((p->>'seats')::int, 0) < 4 then raise exception 'Mitra travel wajib mobil kapasitas besar (≥ 6 kursi: Innova, Hi-Ace, dsb.)'; end if;
  insert into travel_partners (id, company_name, vehicle_model, vehicle_plate, vehicle_year, seats, is_electric, photo_url, license_url, permit_url)
  values (auth.uid(), p->>'company_name', p->>'vehicle_model', upper(p->>'vehicle_plate'), nullif(p->>'vehicle_year', '')::int, (p->>'seats')::int,
    coalesce((p->>'is_electric')::boolean, false), p->>'photo_url', p->>'license_url', p->>'permit_url')
  on conflict (id) do update set company_name = excluded.company_name, vehicle_model = excluded.vehicle_model, vehicle_plate = excluded.vehicle_plate,
    vehicle_year = excluded.vehicle_year, seats = excluded.seats, is_electric = excluded.is_electric,
    photo_url = coalesce(excluded.photo_url, travel_partners.photo_url), license_url = coalesce(excluded.license_url, travel_partners.license_url),
    permit_url = coalesce(excluded.permit_url, travel_partners.permit_url),
    status = case when travel_partners.status in ('approved','suspended') then travel_partners.status else 'pending' end
  returning * into t;
  perform set_config('antaraja.bypass', 'on', true);
  update profiles set role = 'driver' where id = auth.uid() and role = 'customer';
  perform set_config('antaraja.bypass', 'off', true);
  return t;
end $$;

create or replace function admin_set_travel_partner(p_id uuid, p_status approval_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_status in ('suspended','rejected') and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Tulis alasan (min. 5 huruf)'; end if;
  update travel_partners set status = p_status, status_reason = p_reason where id = p_id;
  perform log_activity('travel.partner_' || p_status, 'travel_partners', p_id::text, 'Mitra travel → ' || p_status || coalesce(' · alasan: ' || p_reason, ''), jsonb_build_object('status', p_status, 'reason', p_reason));
end $$;

create or replace function travel_trip_create(p jsonb)
returns travel_trips language plpgsql security definer set search_path = public as $$
declare tp travel_partners%rowtype; r travel_routes%rowtype; t travel_trips%rowtype; v_at timestamptz := (p->>'depart_at')::timestamptz;
begin
  select * into tp from travel_partners where id = auth.uid();
  if not found or tp.status <> 'approved' then raise exception 'Akun mitra travel belum disetujui admin'; end if;
  select * into r from travel_routes where id = (p->>'route_id')::uuid and active;
  if not found then raise exception 'Rute tidak tersedia'; end if;
  if v_at < now() + interval '2 hours' then raise exception 'Jadwal minimal 2 jam dari sekarang'; end if;
  if exists (select 1 from travel_trips x where x.partner_id = tp.id and x.status in ('open','confirmed','full','departed') and abs(extract(epoch from (x.depart_at - v_at))) < 3600 * 6) then
    raise exception 'Anda sudah punya jadwal lain dalam rentang 6 jam';
  end if;
  insert into travel_trips (partner_id, route_id, depart_at, seats_total, min_pax, seat_price, private_price, allow_private, notes)
  values (tp.id, r.id, v_at, least(tp.seats, coalesce((p->>'seats')::int, tp.seats)), coalesce((p->>'min_pax')::int, r.min_pax),
    coalesce((p->>'seat_price')::bigint, r.seat_price), case when tp.seats >= 10 then coalesce(r.private_price_large, r.private_price) else r.private_price end,
    coalesce((p->>'allow_private')::boolean, true), p->>'notes')
  returning * into t;
  return t;
end $$;

-- ---------- booking ----------
create or replace function travel_book(p jsonb)
returns travel_bookings language plpgsql security definer set search_path = public as $$
declare t travel_trips%rowtype; b travel_bookings%rowtype; v_uid uuid := auth.uid();
  v_pax int := greatest(1, coalesce((p->>'pax')::int, 1)); v_private boolean := coalesce((p->>'is_private')::boolean, false);
  v_paid_via text := coalesce(nullif(p->>'paid_via', ''), 'cash'); v_pay payment_method := case when v_paid_via = 'cash' then 'cash' else 'wallet' end;
  v_price bigint; v_fee bigint := setting_num('travel_platform_fee', 5000)::bigint; v_comm numeric := setting_num('travel_commission_pct', 10); v_bal bigint;
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  select * into t from travel_trips where id = (p->>'trip_id')::uuid for update;
  if not found or t.status not in ('open','confirmed') then raise exception 'Jadwal tidak tersedia'; end if;
  if t.depart_at < now() + interval '1 hour' then raise exception 'Jadwal sudah terlalu dekat'; end if;
  if coalesce(p->>'pickup_address', '') = '' then raise exception 'Isi alamat jemput'; end if;
  if v_private then
    if not t.allow_private or t.seats_booked > 0 then raise exception 'Mobil ini sudah ada penumpang lain — pilih jadwal lain untuk private'; end if;
    if v_pax > t.seats_total then raise exception 'Jumlah penumpang melebihi kapasitas (%)', t.seats_total; end if;
    v_price := t.private_price;
  else
    if t.is_private then raise exception 'Jadwal ini sudah dicarter'; end if;
    if v_pax > t.seats_total - t.seats_booked then raise exception 'Kursi tersisa hanya %', t.seats_total - t.seats_booked; end if;
    v_price := t.seat_price * v_pax;
  end if;
  insert into travel_bookings (code, trip_id, customer_id, pax, is_private, pickup_address, pickup_location, dropoff_address, passengers, price, platform_fee, partner_earning, payment_method, paid_via, notes)
  values ('TV' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || lpad(nextval('travel_booking_seq')::text, 4, '0'), t.id, v_uid, v_pax, v_private,
    p->>'pickup_address', case when p->>'pickup_lat' is not null then st_setsrid(st_makepoint((p->>'pickup_lng')::double precision, (p->>'pickup_lat')::double precision), 4326)::geography end,
    p->>'dropoff_address', coalesce(p->'passengers', '[]'::jsonb), v_price + v_fee, v_fee, v_price - floor(v_price * v_comm / 100.0), v_pay, v_paid_via, p->>'notes')
  returning * into b;
  if v_pay = 'wallet' then
    select balance into v_bal from wallets where user_id = v_uid for update;
    if coalesce(v_bal, 0) < b.price then raise exception 'SALDO_KURANG:%', b.price - coalesce(v_bal, 0); end if;
    perform wallet_apply(v_uid, 'payment', -b.price, null, 'Travel ' || b.code);
    update travel_bookings set payment_status = 'paid' where id = b.id returning * into b;
  end if;
  update travel_trips set seats_booked = case when v_private then seats_total else seats_booked + v_pax end,
    is_private = is_private or v_private,
    status = case when v_private or seats_booked + v_pax >= seats_total then 'full' when seats_booked + v_pax >= min_pax then 'confirmed' else status end
  where id = t.id;
  perform log_activity('travel.booked', 'travel_bookings', b.id::text, 'Booking travel ' || b.code || ' · ' || v_pax || ' pax' || case when v_private then ' (private)' else '' end || ' · ' || b.price, jsonb_build_object('trip_id', t.id, 'customer_id', v_uid));
  return b;
end $$;

create or replace function travel_booking_cancel(p_id uuid, p_reason text default null)
returns travel_bookings language plpgsql security definer set search_path = public as $$
declare b travel_bookings%rowtype; t travel_trips%rowtype; v_admin boolean := is_admin();
begin
  select * into b from travel_bookings where id = p_id for update;
  if not found or not (b.customer_id = auth.uid() or v_admin) then raise exception 'Booking tidak ditemukan'; end if;
  if b.status in ('completed','cancelled','picked_up') then raise exception 'Booking tidak bisa dibatalkan'; end if;
  select * into t from travel_trips where id = b.trip_id for update;
  if t.depart_at < now() + interval '3 hours' and not v_admin then raise exception 'Pembatalan maksimal 3 jam sebelum berangkat'; end if;
  update travel_bookings set status = 'cancelled', notes = coalesce(p_reason, notes),
    payment_status = case when payment_status = 'paid' then 'refunded' else payment_status end where id = b.id returning * into b;
  if b.payment_status = 'refunded' then perform wallet_apply(b.customer_id, 'refund', b.price, null, 'Refund travel ' || b.code); end if;
  update travel_trips set seats_booked = greatest(0, case when b.is_private then 0 else seats_booked - b.pax end), is_private = case when b.is_private then false else is_private end,
    status = case when status in ('full','confirmed') then case when greatest(0, seats_booked - b.pax) >= min_pax then 'confirmed' else 'open' end else status end
  where id = t.id;
  return b;
end $$;

-- mitra: ubah status trip (confirmed / departed / arrived / cancelled) → penyelesaian & pencairan
create or replace function travel_trip_set_status(p_trip uuid, p_status text, p_note text default null)
returns travel_trips language plpgsql security definer set search_path = public as $$
declare t travel_trips%rowtype; b travel_bookings; v_admin boolean := is_admin(); v_fee_total bigint := 0;
begin
  select * into t from travel_trips where id = p_trip for update;
  if not found or not (t.partner_id = auth.uid() or v_admin) then raise exception 'Jadwal tidak ditemukan'; end if;
  if p_status not in ('confirmed','departed','arrived','cancelled') then raise exception 'Status tidak valid'; end if;
  if p_status = 'departed' and t.status not in ('open','confirmed','full') then raise exception 'Jadwal tidak bisa diberangkatkan'; end if;
  if p_status = 'arrived' and t.status <> 'departed' then raise exception 'Belum berangkat'; end if;
  update travel_trips set status = p_status, notes = coalesce(p_note, notes) where id = t.id returning * into t;
  if p_status = 'departed' then
    update travel_bookings set status = 'picked_up' where trip_id = t.id and status in ('booked','confirmed');
  elsif p_status = 'arrived' then
    for b in select * from travel_bookings where trip_id = t.id and status in ('booked','confirmed','picked_up') loop
      update travel_bookings set status = 'completed', payment_status = 'paid' where id = b.id;
      if b.payment_method = 'wallet' then
        perform wallet_apply(t.partner_id, 'earning', b.partner_earning, null, 'Pendapatan travel ' || b.code);
      else
        v_fee_total := v_fee_total + (b.price - b.partner_earning);   -- tunai: potongan platform (fee + komisi) didebet dari saldo mitra
      end if;
    end loop;
    if v_fee_total > 0 then perform wallet_apply(t.partner_id, 'fee', -v_fee_total, null, 'Potongan platform travel (tunai)'); end if;
    update travel_partners set total_trips = total_trips + 1 where id = t.partner_id;
  elsif p_status = 'cancelled' then
    for b in select * from travel_bookings where trip_id = t.id and status in ('booked','confirmed') loop
      update travel_bookings set status = 'cancelled', payment_status = case when payment_status = 'paid' then 'refunded' else payment_status end, notes = coalesce(p_note, 'Dibatalkan mitra travel') where id = b.id;
      if b.payment_status = 'paid' then perform wallet_apply(b.customer_id, 'refund', b.price, null, 'Refund travel ' || b.code); end if;
      insert into notifications (user_id, kind, title, body) values (b.customer_id, 'order', 'Travel ' || b.code || ' dibatalkan', coalesce(p_note, 'Jadwal dibatalkan mitra travel. Dana dikembalikan ke AntarPay bila sudah dibayar.'));
    end loop;
  end if;
  perform log_activity('travel.trip_' || p_status, 'travel_trips', t.id::text, 'Trip travel → ' || p_status || coalesce(' · ' || p_note, ''), jsonb_build_object('partner_id', t.partner_id));
  return t;
end $$;

create or replace function travel_rate(p_booking uuid, p_stars int)
returns void language plpgsql security definer set search_path = public as $$
declare b travel_bookings%rowtype; t travel_trips%rowtype;
begin
  select * into b from travel_bookings where id = p_booking and customer_id = auth.uid() and status = 'completed';
  if not found then raise exception 'Booking tidak ditemukan'; end if;
  if b.rating is not null then raise exception 'Sudah dinilai'; end if;
  update travel_bookings set rating = p_stars where id = b.id;
  select * into t from travel_trips where id = b.trip_id;
  update travel_partners set rating_avg = round(((rating_avg * rating_count) + p_stars) / (rating_count + 1.0), 2), rating_count = rating_count + 1 where id = t.partner_id;
end $$;

-- manifest untuk mitra (booking + nama pelanggan + alamat jemput)
create or replace function travel_trip_manifest(p_trip uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'pax', b.pax, 'is_private', b.is_private, 'pickup_address', b.pickup_address,
    'pickup_lat', b.pickup_lat, 'pickup_lng', b.pickup_lng, 'dropoff_address', b.dropoff_address, 'passengers', b.passengers, 'price', b.price,
    'payment_method', b.payment_method, 'payment_status', b.payment_status, 'status', b.status, 'notes', b.notes,
    'customer', jsonb_build_object('id', p.id, 'name', p.full_name, 'avatar_url', p.avatar_url)) order by b.created_at), '[]'::jsonb)
  from travel_bookings b join profiles p on p.id = b.customer_id join travel_trips t on t.id = b.trip_id
  where b.trip_id = p_trip and (t.partner_id = auth.uid() or is_admin()) and b.status <> 'cancelled'
$$;

-- grants
grant execute on function travel_search(uuid, uuid, date) to anon, authenticated;
grant execute on function travel_partner_register(jsonb) to authenticated;
grant execute on function admin_set_travel_partner(uuid, approval_status, text) to authenticated;
grant execute on function travel_trip_create(jsonb) to authenticated;
grant execute on function travel_book(jsonb) to authenticated;
grant execute on function travel_booking_cancel(uuid, text) to authenticated;
grant execute on function travel_trip_set_status(uuid, text, text) to authenticated;
grant execute on function travel_rate(uuid, int) to authenticated;
grant execute on function travel_trip_manifest(uuid) to authenticated;
