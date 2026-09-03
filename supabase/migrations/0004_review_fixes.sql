-- =====================================================================
-- Perbaikan hasil code review
-- =====================================================================

-- 1) Dokumen sensitif driver dipisah ke tabel tersendiri (hanya pemilik & admin)
create table driver_documents (
  driver_id uuid primary key references drivers(id) on delete cascade,
  license_number text,
  id_card_number text,
  photo_id_url text,
  photo_vehicle_url text,
  updated_at timestamptz not null default now()
);
insert into driver_documents (driver_id, license_number, id_card_number, photo_id_url, photo_vehicle_url)
select id, license_number, id_card_number, photo_id_url, photo_vehicle_url from drivers;
alter table drivers drop column license_number, drop column id_card_number, drop column photo_id_url, drop column photo_vehicle_url;
alter table driver_documents enable row level security;
create policy driver_docs_select on driver_documents for select to authenticated using (driver_id = auth.uid() or is_admin());

-- 2) register_driver: bypass guard sebelum upsert (driver yang ditolak bisa kirim ulang)
create or replace function register_driver(p jsonb)
returns drivers language plpgsql security definer set search_path = public as $$
declare d drivers%rowtype;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  perform set_config('antaraja.bypass', 'on', true);
  insert into drivers (id, vehicle_type, vehicle_brand, vehicle_plate, vehicle_color)
  values (auth.uid(), coalesce((p->>'vehicle_type')::vehicle_type, 'motor'), p->>'vehicle_brand', upper(p->>'vehicle_plate'), p->>'vehicle_color')
  on conflict (id) do update set vehicle_type = excluded.vehicle_type, vehicle_brand = excluded.vehicle_brand,
    vehicle_plate = excluded.vehicle_plate, vehicle_color = excluded.vehicle_color,
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
revoke all on function register_driver(jsonb) from public, anon;
grant execute on function register_driver(jsonb) to authenticated, service_role;

-- 3) Batas saldo minus driver diperiksa saat online/terima order, bukan saat potongan (agar order tak macet)
alter table wallets drop constraint if exists wallets_balance_check;
create or replace function driver_set_online(p_online boolean, p_lat double precision default null, p_lng double precision default null)
returns drivers language plpgsql security definer set search_path = public as $$
declare d drivers%rowtype; v_bal bigint;
begin
  select * into d from drivers where id = auth.uid();
  if not found then raise exception 'Belum terdaftar sebagai driver'; end if;
  if p_online then
    if d.status <> 'approved' then raise exception 'Akun driver belum disetujui admin'; end if;
    select balance into v_bal from wallets where user_id = d.id;
    if coalesce(v_bal, 0) < -500000 then raise exception 'Saldo minus melebihi batas (Rp500.000). Top up saldo dulu.'; end if;
    if p_lat is null and d.location is null then raise exception 'Lokasi belum tersedia, aktifkan GPS'; end if;
  end if;
  update drivers set is_online = p_online, last_seen_at = now(),
    location = case when p_lat is not null then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography else location end
  where id = d.id returning * into d;
  return d;
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
  update orders set driver_id = d.id, status = 'accepted', accepted_at = now()
  where id = p_order_id and status = 'searching'
    and ((service = 'ride_motor' and d.vehicle_type = 'motor') or (service = 'ride_car' and d.vehicle_type = 'car') or service in ('food','send'))
  returning * into o;
  if not found then raise exception 'Order sudah diambil driver lain'; end if;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'accepted', d.id, 'Driver menerima pesanan');
  return o;
end $$;

-- 4) Kebijakan RLS untuk anon memanggil is_admin(): izinkan eksekusi (SECURITY DEFINER, hanya membaca peran sendiri)
grant execute on function is_admin() to anon;
grant execute on function owns_merchant(uuid) to anon;
grant execute on function is_approved_driver() to anon;
