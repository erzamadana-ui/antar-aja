-- Tahap 7a (5 Sep 2026): usulan toko/pasar dari pelanggan + moderasi otomatis, koefisien harga & anti-fraud otomatis, mitra pasar tradisional (pedagang) + katalog kualitas
-- ============================================================================
-- 0. Pengaturan baru (app_settings)
-- ============================================================================
create extension if not exists pg_trgm;  -- similarity() untuk dedup nama usulan
insert into app_settings (key, value) values
  ('place_auto_approve_reports', '3'),        -- jumlah laporan konsisten agar usulan toko/pasar aktif otomatis
  ('place_dedup_radius_m', '50'),             -- radius dedup usulan (meter)
  ('price_coef_min', '0.6'),                  -- harga nota < ref × min → ditandai (murah mencurigakan)
  ('price_coef_max', '1.25'),                 -- harga nota > ref × max → ditandai (mahal)
  ('price_coef_hard', '1.6'),                 -- harga nota > ref × hard → ditolak
  ('shop_budget_coef', '1.3'),                -- total belanja maks = anggaran × koefisien
  ('fraud_cancel_limit', '3'),                -- pembatalan driver per 24 jam sebelum ditangguhkan otomatis
  ('fraud_gps_speed_kmh', '150'),             -- lompatan GPS di atas kecepatan ini ditandai
  ('fraud_auto_suspend', 'true'),
  ('vendor_quality_min', '60')                -- skor kualitas minimum agar barang pedagang tampil ke pelanggan
on conflict (key) do nothing;

-- ============================================================================
-- 1. Usulan data toko/pasar dari pelanggan (crowdsourcing) + moderasi otomatis
-- ============================================================================
create table if not exists place_suggestions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('store','market')),
  target_id uuid,                                  -- toko/pasar yang diperbarui (null = usulan tempat baru)
  name text not null,
  brand text, category text,
  address text, lat double precision not null, lng double precision not null,
  location geography(point,4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  open_hours text, phone text, notes text, photo_url text,
  submitted_by uuid not null references profiles(id) on delete cascade,
  reports int not null default 1,
  status text not null default 'pending' check (status in ('pending','approved','rejected','merged')),
  auto boolean not null default false,
  reviewed_by uuid, reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists place_suggestions_loc on place_suggestions using gist (location);
create index if not exists place_suggestions_status on place_suggestions (status, created_at desc);
create table if not exists place_suggestion_votes (
  suggestion_id uuid references place_suggestions(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);
alter table place_suggestions enable row level security;
alter table place_suggestion_votes enable row level security;
drop policy if exists ps_sel on place_suggestions;
create policy ps_sel on place_suggestions for select using (submitted_by = auth.uid() or is_admin());
drop policy if exists psv_sel on place_suggestion_votes;
create policy psv_sel on place_suggestion_votes for select using (user_id = auth.uid() or is_admin());

-- Terapkan usulan menjadi data toko/pasar (dipakai auto-approve & admin)
create or replace function place_suggestion_apply(p_id uuid, p_auto boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare s place_suggestions; v_id uuid; v_city uuid;
begin
  select * into s from place_suggestions where id = p_id for update;
  if not found or s.status <> 'pending' then raise exception 'Usulan tidak valid'; end if;
  v_city := (select id from cities c where c.active order by st_distance(c.location, s.location) limit 1);
  if s.kind = 'store' then
    if s.target_id is not null then
      update shop_stores set name = coalesce(nullif(s.name,''), name), brand = coalesce(s.brand, brand), category = coalesce(s.category, category),
        address = coalesce(s.address, address), open_hours = coalesce(s.open_hours, open_hours), phone = coalesce(s.phone, phone), image_url = coalesce(s.photo_url, image_url), updated_at = now()
      where id = s.target_id; v_id := s.target_id;
    else
      insert into shop_stores (name, brand, category, address, lat, lng, city_id, open_hours, phone, image_url, catalog_source, active)
      values (s.name, coalesce(s.brand, 'lainnya'), coalesce(s.category, 'minimarket'), s.address, s.lat, s.lng, v_city, s.open_hours, s.phone, s.photo_url, 'crowd', true) returning id into v_id;
    end if;
  else
    if s.target_id is not null then
      update markets set name = coalesce(nullif(s.name,''), name), address = coalesce(s.address, address), open_hours = coalesce(s.open_hours, open_hours), notes = coalesce(s.notes, notes), image_url = coalesce(s.photo_url, image_url), updated_at = now()
      where id = s.target_id; v_id := s.target_id;
    else
      insert into markets (name, address, lat, lng, city_id, open_hours, notes, image_url, active)
      values (s.name, s.address, s.lat, s.lng, v_city, s.open_hours, s.notes, s.photo_url, true) returning id into v_id;
    end if;
  end if;
  update place_suggestions set status = 'approved', auto = p_auto, target_id = v_id, reviewed_at = now(), reviewed_by = case when p_auto then null else auth.uid() end,
    review_note = case when p_auto then 'Disetujui otomatis (' || reports || ' laporan konsisten)' else review_note end, updated_at = now() where id = p_id;
  insert into notifications (user_id, kind, title, body, data)
    select v.user_id, 'system', 'Terima kasih! Data ' || case when s.kind = 'store' then 'toko' else 'pasar' end || ' Anda sudah aktif',
      s.name || ' kini tampil untuk pengguna lain di sekitar.', jsonb_build_object('suggestion_id', s.id, 'kind', s.kind, 'target_id', v_id)
    from (select s.submitted_by as user_id union select pv.user_id from place_suggestion_votes pv where pv.suggestion_id = s.id) v;
  perform log_activity('place.suggestion_approved', 'place_suggestions', s.id::text, (case when p_auto then '[otomatis] ' else '' end) || s.kind || ' "' || s.name || '" aktif', jsonb_build_object('auto', p_auto, 'target_id', v_id));
  return v_id;
end $$;
revoke execute on function place_suggestion_apply(uuid, boolean) from public, anon, authenticated;

-- Pelanggan mengusulkan tempat baru / pembaruan data dari titik lokasinya
create or replace function suggest_place(p jsonb)
returns place_suggestions language plpgsql security definer set search_path = public as $$
declare s place_suggestions; v_kind text := p->>'kind'; v_lat double precision := (p->>'lat')::double precision; v_lng double precision := (p->>'lng')::double precision;
  v_pt geography := st_setsrid(st_makepoint((p->>'lng')::double precision, (p->>'lat')::double precision), 4326)::geography;
  v_target uuid := nullif(p->>'target_id','')::uuid; v_radius numeric := setting_num('place_dedup_radius_m', 50); v_need int := setting_num('place_auto_approve_reports', 3)::int; v_conflict boolean;
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  if v_kind not in ('store','market') then raise exception 'Jenis tidak valid'; end if;
  if length(trim(coalesce(p->>'name',''))) < 3 then raise exception 'Nama minimal 3 huruf'; end if;
  if v_lat is null or v_lng is null then raise exception 'Titik lokasi wajib'; end if;
  if (select count(*) from place_suggestions where submitted_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then raise exception 'Batas 20 usulan per hari'; end if;
  -- Dedup: usulan pending sejenis dalam radius & nama mirip → jadi dukungan (laporan konsisten)
  select * into s from place_suggestions x where x.status = 'pending' and x.kind = v_kind and coalesce(x.target_id::text,'') = coalesce(v_target::text,'')
    and st_dwithin(x.location, v_pt, v_radius) and (lower(x.name) = lower(p->>'name') or similarity(lower(x.name), lower(p->>'name')) > 0.5)
    order by x.created_at limit 1;
  if found then
    if s.submitted_by = auth.uid() or exists (select 1 from place_suggestion_votes where suggestion_id = s.id and user_id = auth.uid()) then
      raise exception 'Anda sudah mengusulkan tempat ini. Menunggu konfirmasi pengguna lain/admin.';
    end if;
    insert into place_suggestion_votes (suggestion_id, user_id) values (s.id, auth.uid());
    update place_suggestions set reports = reports + 1, open_hours = coalesce(open_hours, p->>'open_hours'), phone = coalesce(phone, p->>'phone'),
      photo_url = coalesce(photo_url, p->>'photo_url'), address = coalesce(address, p->>'address'), updated_at = now() where id = s.id returning * into s;
  else
    -- Tempat baru yang sebenarnya sudah ada (toko/pasar aktif dalam radius) → arahkan jadi pembaruan
    if v_target is null then
      if v_kind = 'store' then select id into v_target from shop_stores where active and st_dwithin(location, v_pt, v_radius) and lower(name) = lower(p->>'name') limit 1;
      else select id into v_target from markets where active and st_dwithin(location, v_pt, v_radius) and lower(name) = lower(p->>'name') limit 1; end if;
    end if;
    insert into place_suggestions (kind, target_id, name, brand, category, address, lat, lng, open_hours, phone, notes, photo_url, submitted_by)
    values (v_kind, v_target, trim(p->>'name'), nullif(p->>'brand',''), nullif(p->>'category',''), nullif(p->>'address',''), v_lat, v_lng,
      nullif(p->>'open_hours',''), nullif(p->>'phone',''), nullif(p->>'notes',''), nullif(p->>'photo_url',''), auth.uid()) returning * into s;
    perform log_activity('place.suggested', 'place_suggestions', s.id::text, 'Usulan ' || v_kind || ' "' || s.name || '" dari pelanggan', jsonb_build_object('target_id', v_target));
  end if;
  -- Moderasi otomatis: cukup laporan & tidak ada konflik (usulan pending lain dalam radius dengan nama berbeda)
  if s.reports >= v_need then
    select exists (select 1 from place_suggestions x where x.id <> s.id and x.status = 'pending' and x.kind = s.kind and st_dwithin(x.location, s.location, v_radius) and lower(x.name) <> lower(s.name)) into v_conflict;
    if not v_conflict then perform place_suggestion_apply(s.id, true); select * into s from place_suggestions where id = s.id; end if;
  end if;
  return s;
end $$;

create or replace function my_place_suggestions()
returns setof place_suggestions language sql stable security definer set search_path = public as $$
  select s.* from place_suggestions s where s.submitted_by = auth.uid() or exists (select 1 from place_suggestion_votes v where v.suggestion_id = s.id and v.user_id = auth.uid()) order by s.created_at desc limit 50;
$$;

create or replace function admin_place_suggestions(p_status text default 'pending')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('submitter', (select full_name from profiles where id = s.submitted_by),
    'existing_name', case when s.target_id is null then null when s.kind = 'store' then (select name from shop_stores where id = s.target_id) else (select name from markets where id = s.target_id) end,
    'nearby_conflicts', (select count(*) from place_suggestions x where x.id <> s.id and x.status = 'pending' and x.kind = s.kind and st_dwithin(x.location, s.location, setting_num('place_dedup_radius_m', 50)) and lower(x.name) <> lower(s.name)))
    order by s.reports desc, s.created_at), '[]'::jsonb)
  from place_suggestions s where is_admin() and (p_status is null or p_status = 'all' or s.status = p_status);
$$;

create or replace function admin_review_place_suggestion(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s place_suggestions;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_approve then perform place_suggestion_apply(p_id, false);
  else
    update place_suggestions set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note, updated_at = now() where id = p_id and status = 'pending' returning * into s;
    if found then
      insert into notifications (user_id, kind, title, body, data) values (s.submitted_by, 'system', 'Usulan tempat belum bisa diterima', coalesce(p_note, 'Data tidak dapat diverifikasi. Terima kasih atas kontribusinya.'), jsonb_build_object('suggestion_id', s.id));
      perform log_activity('place.suggestion_rejected', 'place_suggestions', s.id::text, 'Usulan "' || s.name || '" ditolak: ' || coalesce(p_note, '-'), null);
    end if;
  end if;
end $$;

-- nearby_stores / nearby_markets: sertakan sumber data (crowd) & jumlah usulan pending di sekitar (untuk badge "data dari pengguna")
-- (fungsi lama tetap; layar pelanggan memakai kolom catalog_source = 'crowd')

-- ============================================================================
-- 2. Koefisien harga & anti-fraud otomatis
-- ============================================================================
create table if not exists fraud_flags (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                               -- price_outlier | price_hard_reject | cancel_spam | gps_jump | shared_device | budget_overrun
  severity text not null default 'med' check (severity in ('low','med','high')),
  subject_id uuid references profiles(id) on delete cascade,  -- akun yang ditandai
  order_id uuid references orders(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  auto_action text,                                 -- suspended | none
  status text not null default 'open' check (status in ('open','confirmed','dismissed')),
  reviewed_by uuid, reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now()
);
create index if not exists fraud_flags_status on fraud_flags (status, created_at desc);
create index if not exists fraud_flags_subject on fraud_flags (subject_id, created_at desc);
alter table fraud_flags enable row level security;
drop policy if exists ff_admin on fraud_flags;
create policy ff_admin on fraud_flags for select using (is_admin());

create table if not exists security_events (
  id bigserial primary key,
  kind text not null,               -- fraud.flag | fraud.auto_suspend | admin.unlock_failed | admin.export | admin.pii_reveal | admin.pin_set | payout.auto | verify.auto
  user_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_events_created on security_events (created_at desc);
alter table security_events enable row level security;
drop policy if exists se_admin on security_events;
create policy se_admin on security_events for select using (is_admin());

create or replace function fraud_flag(p_kind text, p_severity text, p_subject uuid, p_order uuid, p_detail jsonb, p_auto_suspend boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_action text := 'none'; v_open int;
begin
  -- hindari duplikat flag sejenis untuk order/subjek yang sama dalam 1 jam
  select id into v_id from fraud_flags where kind = p_kind and subject_id is not distinct from p_subject and order_id is not distinct from p_order and created_at > now() - interval '1 hour' limit 1;
  if v_id is not null then return v_id; end if;
  if p_auto_suspend and coalesce((select value::text::boolean from app_settings where key = 'fraud_auto_suspend'), true) and p_subject is not null then
    perform set_config('antaraja.bypass', 'on', true);
    update drivers set status = 'suspended', is_online = false, status_reason = 'Ditangguhkan otomatis: ' || p_kind || '. Menunggu peninjauan admin.' where id = p_subject and status = 'approved';
    if found then v_action := 'suspended'; end if;
    perform set_config('antaraja.bypass', 'off', true);
    if v_action = 'suspended' then
      insert into notifications (user_id, kind, title, body, data) values (p_subject, 'system', 'Akun mitra ditangguhkan sementara', 'Sistem mendeteksi aktivitas tidak wajar (' || p_kind || '). Tim kami akan meninjau dalam 1×24 jam. Hubungi CS bila ini keliru.', jsonb_build_object('kind', p_kind));
    end if;
  end if;
  insert into fraud_flags (kind, severity, subject_id, order_id, detail, auto_action) values (p_kind, p_severity, p_subject, p_order, coalesce(p_detail, '{}'::jsonb), v_action) returning id into v_id;
  insert into security_events (kind, user_id, detail) values (case when v_action = 'suspended' then 'fraud.auto_suspend' else 'fraud.flag' end, p_subject, jsonb_build_object('flag_id', v_id, 'kind', p_kind, 'severity', p_severity, 'order_id', p_order));
  -- beri tahu admin (semua akun admin) untuk severity high
  if p_severity = 'high' then
    insert into notifications (user_id, kind, title, body, data)
      select id, 'system', 'Flag anti-fraud: ' || p_kind, coalesce((select full_name from profiles where id = p_subject), 'Akun') || case when v_action = 'suspended' then ' ditangguhkan otomatis' else ' perlu ditinjau' end, jsonb_build_object('flag_id', v_id, 'admin_route', '/(admin)/security')
      from profiles where role = 'admin' and is_active;
  end if;
  return v_id;
end $$;
revoke execute on function fraud_flag(text, text, uuid, uuid, jsonb, boolean) from public, anon, authenticated;

-- 2a. Pembatalan driver berulang → flag + tangguhkan otomatis
create or replace function trg_fraud_driver_cancel() returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int; v_lim int := setting_num('fraud_cancel_limit', 3)::int;
begin
  if new.status = 'driver_cancelled' and new.actor_id is not null then
    select count(*) into v_n from order_events where status = 'driver_cancelled' and actor_id = new.actor_id and created_at > now() - interval '24 hours';
    if v_n >= v_lim then
      perform fraud_flag('cancel_spam', 'high', new.actor_id, new.order_id, jsonb_build_object('cancellations_24h', v_n, 'limit', v_lim), true);
    elsif v_n = v_lim - 1 then
      insert into notifications (user_id, kind, title, body, data) values (new.actor_id, 'system', 'Peringatan pembatalan', 'Anda membatalkan ' || v_n || ' order dalam 24 jam. Satu pembatalan lagi akan menangguhkan akun secara otomatis.', '{}'::jsonb);
      perform fraud_flag('cancel_spam', 'low', new.actor_id, new.order_id, jsonb_build_object('cancellations_24h', v_n, 'limit', v_lim), false);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists order_events_fraud_cancel on order_events;
create trigger order_events_fraud_cancel after insert on order_events for each row execute function trg_fraud_driver_cancel();

-- 2b. Lompatan GPS tidak wajar
create or replace function trg_fraud_gps_jump() returns trigger language plpgsql security definer set search_path = public as $$
declare v_km numeric; v_h numeric; v_speed numeric; v_lim numeric := setting_num('fraud_gps_speed_kmh', 150);
begin
  if old.location is not null and new.location is not null and old.last_seen_at is not null then
    v_km := st_distance(old.location, new.location) / 1000.0;
    v_h := greatest(extract(epoch from (now() - old.last_seen_at)) / 3600.0, 1.0 / 3600);
    v_speed := v_km / v_h;
    if v_km > 2 and v_speed > v_lim then
      perform fraud_flag('gps_jump', case when v_speed > v_lim * 3 then 'high' else 'med' end, new.id, null, jsonb_build_object('km', round(v_km, 2), 'seconds', round(v_h * 3600), 'speed_kmh', round(v_speed)), false);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists drivers_fraud_gps on drivers;
create trigger drivers_fraud_gps before update of location on drivers for each row execute function trg_fraud_gps_jump();

-- 2c. Perangkat yang sama dipakai banyak akun (push_token sama)
create or replace function trg_fraud_shared_device() returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if new.push_token is not null and new.push_token is distinct from old.push_token then
    select count(*) into v_n from profiles where push_token = new.push_token and id <> new.id and is_active;
    if v_n >= 2 then
      perform fraud_flag('shared_device', 'med', new.id, null, jsonb_build_object('accounts_same_device', v_n + 1), false);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_fraud_device on profiles;
create trigger profiles_fraud_device after update of push_token on profiles for each row execute function trg_fraud_shared_device();

-- 2d. set_shopping_actual: koefisien harga per item (pasar) & batas anggaran dari pengaturan
create or replace function set_shopping_actual(p_order_id uuid, p_amount bigint, p_receipt_url text default null, p_items jsonb default null)
returns orders language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_delta bigint; v_bal bigint; v_new_total bigint; v_fee_new bigint; v_fee_delta bigint; it jsonb; v_limit bigint;
  v_cmin numeric := setting_num('price_coef_min', 0.6); v_cmax numeric := setting_num('price_coef_max', 1.25); v_chard numeric := setting_num('price_coef_hard', 1.6);
  v_ref bigint; v_price bigint; v_outliers jsonb := '[]'::jsonb; v_name text;
begin
  select * into o from orders where id = p_order_id for update;
  if not found or o.driver_id <> auth.uid() then raise exception 'Bukan order Anda'; end if;
  if o.service not in ('shop','market') then raise exception 'Bukan order belanja'; end if;
  if o.status not in ('arrived','in_progress') then raise exception 'Input total setelah tiba di toko/pasar'; end if;
  v_limit := greatest(floor(o.est_budget * setting_num('shop_budget_coef', 1.3))::bigint, o.est_budget + 50000);
  if p_amount < 0 or p_amount > v_limit then
    perform fraud_flag('budget_overrun', 'med', auth.uid(), o.id, jsonb_build_object('amount', p_amount, 'limit', v_limit, 'budget', o.est_budget), false);
    raise exception 'Total belanja melebihi batas (maks Rp%). Konfirmasi ke pelanggan atau minta pelanggan menambah anggaran.', v_limit;
  end if;
  -- Koefisien harga per bahan (AntarMarket): bandingkan dengan harga acuan pasar / item
  if o.service = 'market' and p_items is not null then
    for it in select * from jsonb_array_elements(p_items) loop
      if nullif(it->>'item_id', '') is not null and coalesce((it->>'price')::bigint, 0) > 0 then
        v_price := (it->>'price')::bigint;
        select coalesce(mp.price, mi.ref_price), mi.name into v_ref, v_name from market_items mi left join market_prices mp on mp.item_id = mi.id and mp.market_id = o.market_id where mi.id = (it->>'item_id')::uuid;
        if v_ref is not null and v_ref > 0 then
          if v_price > v_ref * v_chard then
            perform fraud_flag('price_hard_reject', 'high', auth.uid(), o.id, jsonb_build_object('item', v_name, 'price', v_price, 'ref', v_ref, 'coef', round(v_price::numeric / v_ref, 2)), false);
            raise exception 'Harga % (Rp%) melebihi %× harga acuan (Rp%). Cek kembali nota atau hubungi CS.', v_name, v_price, v_chard, v_ref;
          elsif v_price > v_ref * v_cmax or v_price < v_ref * v_cmin then
            v_outliers := v_outliers || jsonb_build_object('item', v_name, 'price', v_price, 'ref', v_ref, 'coef', round(v_price::numeric / v_ref, 2));
          end if;
        end if;
      end if;
    end loop;
    if jsonb_array_length(v_outliers) > 0 then
      if p_receipt_url is null and o.receipt_url is null then raise exception 'Ada harga di luar batas wajar (%). Foto nota wajib diunggah.', (v_outliers->0->>'item'); end if;
      perform fraud_flag('price_outlier', case when jsonb_array_length(v_outliers) >= 3 then 'high' else 'med' end, auth.uid(), o.id, jsonb_build_object('items', v_outliers, 'coef_min', v_cmin, 'coef_max', v_cmax), false);
    end if;
  end if;
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
  if o.service = 'market' and p_items is not null then
    for it in select * from jsonb_array_elements(p_items) loop
      if nullif(it->>'item_id', '') is not null and coalesce((it->>'price')::bigint, 0) > 0 then
        insert into market_price_log (market_id, item_id, price, qty, source, order_id, actor_id)
        values (o.market_id, (it->>'item_id')::uuid, (it->>'price')::bigint, nullif(it->>'qty', '')::numeric, 'driver', o.id, auth.uid());
      end if;
    end loop;
  end if;
  insert into order_events (order_id, status, actor_id, note) values (o.id, 'shop_total', auth.uid(), 'Total belanja riil Rp' || p_amount || ' · jasa belanja Rp' || v_fee_new || case when jsonb_array_length(v_outliers) > 0 then ' · ' || jsonb_array_length(v_outliers) || ' harga di luar koefisien (ditandai)' else '' end);
  return o;
end $$;

-- 2e. Panel admin anti-fraud
create or replace function admin_fraud_flags(p_status text default 'open')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(f) || jsonb_build_object('subject_name', (select full_name from profiles where id = f.subject_id), 'subject_role', (select role from profiles where id = f.subject_id),
    'order_code', (select code from orders where id = f.order_id), 'driver_status', (select status from drivers where id = f.subject_id)) order by f.created_at desc), '[]'::jsonb)
  from (select * from fraud_flags where is_admin() and (p_status is null or p_status = 'all' or status = p_status) order by created_at desc limit 300) f;
$$;

create or replace function admin_review_fraud(p_id uuid, p_status text, p_note text default null, p_reinstate boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare f fraud_flags;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_status not in ('confirmed','dismissed') then raise exception 'Status tidak valid'; end if;
  update fraud_flags set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_id returning * into f;
  if not found then raise exception 'Flag tidak ditemukan'; end if;
  if p_reinstate and f.subject_id is not null then
    perform set_config('antaraja.bypass', 'on', true);
    update drivers set status = 'approved', status_reason = 'Dipulihkan admin setelah peninjauan' where id = f.subject_id and status = 'suspended';
    perform set_config('antaraja.bypass', 'off', true);
    insert into notifications (user_id, kind, title, body, data) values (f.subject_id, 'system', 'Akun mitra dipulihkan', coalesce(p_note, 'Peninjauan selesai, Anda bisa menerima order kembali.'), '{}'::jsonb);
  end if;
  perform log_activity('fraud.review', 'fraud_flags', p_id::text, 'Flag ' || f.kind || ' → ' || p_status || coalesce(' · ' || p_note, '') || case when p_reinstate then ' · akun dipulihkan' else '' end, jsonb_build_object('status', p_status, 'reinstate', p_reinstate));
end $$;

create or replace function admin_fraud_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select count(*) from fraud_flags where status = 'open'),
    'open_high', (select count(*) from fraud_flags where status = 'open' and severity = 'high'),
    'auto_suspended', (select count(*) from fraud_flags where status = 'open' and auto_action = 'suspended'),
    'last_7d', (select count(*) from fraud_flags where created_at > now() - interval '7 days'),
    'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from fraud_flags where created_at > now() - interval '30 days' group by kind) q),
    'coef', jsonb_build_object('min', setting_num('price_coef_min', 0.6), 'max', setting_num('price_coef_max', 1.25), 'hard', setting_num('price_coef_hard', 1.6), 'budget', setting_num('shop_budget_coef', 1.3), 'cancel_limit', setting_num('fraud_cancel_limit', 3), 'gps_speed', setting_num('fraud_gps_speed_kmh', 150), 'auto_suspend', coalesce((select value::text::boolean from app_settings where key = 'fraud_auto_suspend'), true))
  ) where is_admin();
$$;

-- ============================================================================
-- 3. Mitra pasar tradisional (pedagang) + katalog barang berkualitas
-- ============================================================================
create table if not exists market_vendors (
  id uuid primary key references profiles(id) on delete cascade,
  market_id uuid not null references markets(id),
  stall_name text not null,
  stall_no text,
  categories text[] not null default '{}',
  description text,
  photo_url text,                   -- foto lapak
  id_card_url text,                 -- KTP pedagang
  market_card_url text,             -- kartu/izin pedagang pasar (opsional)
  phone text,
  bank_name text, bank_account text, bank_holder text,
  status approval_status not null default 'pending',
  status_reason text,
  quality_score numeric not null default 0,
  rating_avg numeric not null default 0, rating_count int not null default 0,
  total_orders int not null default 0,
  open_hours text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists market_vendors_market on market_vendors (market_id, status);
create table if not exists market_vendor_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references market_vendors(id) on delete cascade,
  item_id uuid references market_items(id),          -- tautan ke bahan standar (opsional)
  name text not null, category text not null, unit text not null default 'kg',
  price bigint not null check (price >= 0),
  grade text not null default 'B' check (grade in ('A','B','C')),   -- A = premium/segar, B = standar, C = ekonomis
  origin text,                                      -- asal barang (mis. Bukittinggi)
  photo_url text,
  in_stock boolean not null default true,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists market_vendor_items_vendor on market_vendor_items (vendor_id, active);
alter table market_vendors enable row level security;
alter table market_vendor_items enable row level security;
drop policy if exists mv_sel on market_vendors;
create policy mv_sel on market_vendors for select using (id = auth.uid() or is_admin() or status = 'approved');
drop policy if exists mvi_sel on market_vendor_items;
create policy mvi_sel on market_vendor_items for select using (vendor_id = auth.uid() or is_admin() or exists (select 1 from market_vendors v where v.id = vendor_id and v.status = 'approved'));

-- Skor kualitas (0–100): kelengkapan profil + foto barang + kesegaran harga + harga dalam koefisien + rating
create or replace function market_vendor_quality(p_vendor uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v market_vendors; v_items int; v_photo int; v_fresh int; v_inband int; v_score numeric := 0;
begin
  select * into v from market_vendors where id = p_vendor; if not found then return 0; end if;
  select count(*), count(*) filter (where photo_url is not null), count(*) filter (where updated_at > now() - interval '3 days'),
    count(*) filter (where item_id is null or price between (select coalesce(ref_price,0) * setting_num('price_coef_min', 0.6) from market_items where id = item_id) and (select coalesce(ref_price,0) * setting_num('price_coef_max', 1.25) from market_items where id = item_id))
  into v_items, v_photo, v_fresh, v_inband from market_vendor_items where vendor_id = p_vendor and active;
  v_score := v_score + (case when v.photo_url is not null then 15 else 0 end) + (case when v.id_card_url is not null then 10 else 0 end) + (case when v.market_card_url is not null then 5 else 0 end) + (case when v.phone is not null then 5 else 0 end);
  if v_items > 0 then
    v_score := v_score + 20 * v_photo::numeric / v_items + 20 * v_fresh::numeric / v_items + 15 * v_inband::numeric / v_items;
  end if;
  v_score := v_score + (case when v.rating_count > 0 then least(10, v.rating_avg * 2) else 5 end);
  return round(least(100, v_score), 1);
end $$;

create or replace function apply_market_vendor(p jsonb)
returns market_vendors language plpgsql security definer set search_path = public as $$
declare v market_vendors;
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  if nullif(p->>'market_id','') is null then raise exception 'Pilih pasar'; end if;
  if length(trim(coalesce(p->>'stall_name',''))) < 3 then raise exception 'Nama lapak minimal 3 huruf'; end if;
  insert into market_vendors (id, market_id, stall_name, stall_no, categories, description, photo_url, id_card_url, market_card_url, phone, bank_name, bank_account, bank_holder, open_hours)
  values (auth.uid(), (p->>'market_id')::uuid, trim(p->>'stall_name'), nullif(p->>'stall_no',''), coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'categories','[]'::jsonb)) x), '{}'),
    nullif(p->>'description',''), nullif(p->>'photo_url',''), nullif(p->>'id_card_url',''), nullif(p->>'market_card_url',''), nullif(p->>'phone',''), nullif(p->>'bank_name',''), nullif(p->>'bank_account',''), nullif(p->>'bank_holder',''), nullif(p->>'open_hours',''))
  on conflict (id) do update set market_id = excluded.market_id, stall_name = excluded.stall_name, stall_no = excluded.stall_no, categories = excluded.categories, description = excluded.description,
    photo_url = coalesce(excluded.photo_url, market_vendors.photo_url), id_card_url = coalesce(excluded.id_card_url, market_vendors.id_card_url), market_card_url = coalesce(excluded.market_card_url, market_vendors.market_card_url),
    phone = excluded.phone, bank_name = excluded.bank_name, bank_account = excluded.bank_account, bank_holder = excluded.bank_holder, open_hours = excluded.open_hours,
    status = case when market_vendors.status = 'rejected' then 'pending'::approval_status else market_vendors.status end, updated_at = now()
  returning * into v;
  update market_vendors set quality_score = market_vendor_quality(auth.uid()) where id = auth.uid() returning * into v;
  perform log_activity('vendor.applied', 'market_vendors', v.id::text, 'Pengajuan pedagang pasar "' || v.stall_name || '"', jsonb_build_object('market_id', v.market_id));
  return v;
end $$;

create or replace function vendor_upsert_item(p jsonb)
returns market_vendor_items language plpgsql security definer set search_path = public as $$
declare it market_vendor_items; v_ref bigint; v_hard numeric := setting_num('price_coef_hard', 1.6);
begin
  if not exists (select 1 from market_vendors where id = auth.uid()) then raise exception 'Daftar sebagai pedagang dulu'; end if;
  if length(trim(coalesce(p->>'name',''))) < 2 then raise exception 'Nama barang wajib'; end if;
  if coalesce((p->>'price')::bigint, 0) <= 0 then raise exception 'Harga wajib'; end if;
  if nullif(p->>'item_id','') is not null then
    select ref_price into v_ref from market_items where id = (p->>'item_id')::uuid;
    if v_ref is not null and (p->>'price')::bigint > v_ref * v_hard then raise exception 'Harga melebihi %× harga acuan (Rp%). Turunkan harga atau hubungi admin.', v_hard, v_ref; end if;
  end if;
  if nullif(p->>'id','') is null then
    insert into market_vendor_items (vendor_id, item_id, name, category, unit, price, grade, origin, photo_url, in_stock)
    values (auth.uid(), nullif(p->>'item_id','')::uuid, trim(p->>'name'), coalesce(nullif(p->>'category',''), 'lainnya'), coalesce(nullif(p->>'unit',''), 'kg'), (p->>'price')::bigint, coalesce(nullif(p->>'grade',''), 'B'), nullif(p->>'origin',''), nullif(p->>'photo_url',''), coalesce((p->>'in_stock')::boolean, true))
    returning * into it;
  else
    update market_vendor_items set item_id = nullif(p->>'item_id','')::uuid, name = trim(p->>'name'), category = coalesce(nullif(p->>'category',''), category), unit = coalesce(nullif(p->>'unit',''), unit), price = (p->>'price')::bigint,
      grade = coalesce(nullif(p->>'grade',''), grade), origin = nullif(p->>'origin',''), photo_url = coalesce(nullif(p->>'photo_url',''), photo_url), in_stock = coalesce((p->>'in_stock')::boolean, in_stock), active = coalesce((p->>'active')::boolean, active), updated_at = now()
    where id = (p->>'id')::uuid and vendor_id = auth.uid() returning * into it;
    if not found then raise exception 'Barang tidak ditemukan'; end if;
  end if;
  update market_vendors set quality_score = market_vendor_quality(auth.uid()), updated_at = now() where id = auth.uid();
  return it;
end $$;

create or replace function vendor_set_stock(p_ids uuid[], p_in_stock boolean)
returns void language sql security definer set search_path = public as $$
  update market_vendor_items set in_stock = p_in_stock, updated_at = now() where vendor_id = auth.uid() and id = any(p_ids);
$$;

-- Katalog pedagang untuk pelanggan (hanya pedagang disetujui & skor kualitas ≥ minimum)
create or replace function market_vendor_catalog(p_market uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'stall_name', v.stall_name, 'stall_no', v.stall_no, 'categories', v.categories, 'photo_url', v.photo_url, 'quality_score', v.quality_score,
      'rating_avg', v.rating_avg, 'rating_count', v.rating_count, 'open_hours', v.open_hours,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'item_id', i.item_id, 'name', i.name, 'category', i.category, 'unit', i.unit, 'price', i.price, 'grade', i.grade, 'origin', i.origin, 'photo_url', i.photo_url, 'in_stock', i.in_stock, 'updated_at', i.updated_at,
          'ref_price', (select ref_price from market_items where id = i.item_id)) order by i.category, i.name), '[]'::jsonb) from market_vendor_items i where i.vendor_id = v.id and i.active))
    order by v.quality_score desc, v.rating_avg desc), '[]'::jsonb)
  from market_vendors v where v.market_id = p_market and v.status = 'approved' and v.quality_score >= setting_num('vendor_quality_min', 60);
$$;

create or replace function admin_market_vendors(p_status text default 'pending')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(v) || jsonb_build_object('owner_name', (select full_name from profiles where id = v.id), 'owner_phone', (select phone from profiles where id = v.id), 'market_name', (select name from markets where id = v.market_id),
    'items', (select count(*) from market_vendor_items i where i.vendor_id = v.id and i.active), 'items_photo', (select count(*) from market_vendor_items i where i.vendor_id = v.id and i.active and i.photo_url is not null)) order by v.created_at desc), '[]'::jsonb)
  from market_vendors v where is_admin() and (p_status is null or p_status = 'all' or v.status::text = p_status);
$$;

create or replace function admin_review_market_vendor(p_id uuid, p_status approval_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v market_vendors;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_status in ('rejected','suspended') and length(trim(coalesce(p_reason,''))) < 5 then raise exception 'Tulis alasan (min. 5 huruf)'; end if;
  update market_vendors set status = p_status, status_reason = p_reason, quality_score = market_vendor_quality(p_id), updated_at = now() where id = p_id returning * into v;
  if not found then raise exception 'Pedagang tidak ditemukan'; end if;
  insert into notifications (user_id, kind, title, body, data) values (p_id, 'system',
    case p_status when 'approved' then 'Lapak Anda aktif di AntarMarket' when 'rejected' then 'Pengajuan pedagang ditolak' when 'suspended' then 'Lapak ditangguhkan' else 'Status pengajuan diperbarui' end,
    coalesce(p_reason, 'Barang Anda kini tampil untuk pelanggan di pasar ' || (select name from markets where id = v.market_id) || '. Jaga foto & harga tetap terbaru agar skor kualitas tinggi.'), jsonb_build_object('status', p_status));
  perform log_activity('vendor.status', 'market_vendors', p_id::text, 'Pedagang "' || v.stall_name || '" → ' || p_status || coalesce(' · ' || p_reason, ''), jsonb_build_object('status', p_status, 'reason', p_reason));
end $$;

