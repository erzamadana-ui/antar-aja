-- Tahap 7b (5 Sep 2026): otomasi — verifikasi mitra bertingkat, pencairan otomatis, pusat keamanan admin (PIN/sesi/log),
-- laporan keuangan eksekutif + rekomendasi, laporan terjadwal, retensi pelanggan otomatis, harga dinamis berbasis permintaan, pg_cron
insert into app_settings (key, value) values
  ('auto_verify_enabled', 'true'), ('auto_verify_min_score', '80'), ('probation_days', '7'), ('probation_daily_orders', '10'),
  ('auto_payout_enabled', 'true'), ('auto_payout_max', '500000'), ('auto_payout_daily_max', '1000000'),
  ('retention_enabled', 'true'), ('retention_days', '14'), ('retention_cooldown_days', '30'), ('retention_budget_month', '2000000'), ('retention_promo_value', '15'), ('retention_promo_max', '10000'),
  ('dynamic_pricing_enabled', 'true'), ('dynamic_max_multiplier', '1.5'), ('dynamic_radius_km', '5'), ('dynamic_window_min', '15'), ('dynamic_step', '0.25'),
  ('gateway_fee_pct', '1.5'), ('admin_session_minutes', '60'), ('reports_enabled', 'true'), ('target_take_rate_pct', '18')
on conflict (key) do nothing;

create table if not exists automation_runs (
  id bigserial primary key, kind text not null, started_at timestamptz not null default now(), finished_at timestamptz,
  ok boolean not null default true, count int not null default 0, detail jsonb not null default '{}'::jsonb, triggered_by uuid
);
create index if not exists automation_runs_kind on automation_runs (kind, started_at desc);
alter table automation_runs enable row level security;
drop policy if exists ar_admin on automation_runs; create policy ar_admin on automation_runs for select using (is_admin());

-- ============================================================================
-- 1. Verifikasi mitra bertingkat otomatis (driver & merchant)
-- ============================================================================
alter table drivers add column if not exists auto_verified boolean not null default false, add column if not exists probation_until timestamptz, add column if not exists verify_score int not null default 0;
alter table merchants add column if not exists auto_verified boolean not null default false, add column if not exists probation_until timestamptz, add column if not exists verify_score int not null default 0;

create or replace function verification_score_driver(p_driver uuid)
returns int language sql stable security definer set search_path = public as $$
  select (case when d.license_number is not null and length(d.license_number) >= 8 then 25 else 0 end)
       + (case when d.id_card_number is not null and length(d.id_card_number) = 16 then 20 else 0 end)
       + (case when d.photo_id_url is not null then 15 else 0 end)
       + (case when d.photo_vehicle_url is not null then 15 else 0 end)
       + (case when dr.vehicle_plate is not null and length(dr.vehicle_plate) >= 5 then 10 else 0 end)
       + (case when dr.last_selfie_url is not null then 5 else 0 end)
       + (case when p.phone is not null and length(p.phone) >= 10 then 5 else 0 end)
       + (case when dr.vehicle_year is not null and dr.vehicle_year >= extract(year from now())::int - 12 then 5 else 0 end)
  from drivers dr left join driver_documents d on d.driver_id = dr.id join profiles p on p.id = dr.id where dr.id = p_driver;
$$;
create or replace function verification_score_merchant(p_merchant uuid)
returns int language sql stable security definer set search_path = public as $$
  select (case when d.npwp_no is not null and length(regexp_replace(d.npwp_no, '\D', '', 'g')) >= 15 then 25 else 0 end)
       + (case when d.owner_id_card_url is not null then 20 else 0 end)
       + (case when d.place_photo_url is not null then 15 else 0 end)
       + (case when d.bank_account is not null and d.bank_holder is not null then 15 else 0 end)
       + (case when d.owner_phone is not null then 5 else 0 end)
       + (case when d.license_no is not null or d.license_url is not null then 10 else 0 end)
       + (case when m.image_url is not null then 5 else 0 end)
       + (case when m.address is not null and m.lat is not null then 5 else 0 end)
  from merchants m left join merchant_documents d on d.merchant_id = m.id where m.id = p_merchant;
$$;

create or replace function auto_verify_driver(p_driver uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_score int; v_min int := setting_num('auto_verify_min_score', 80)::int; v_days int := setting_num('probation_days', 7)::int; d drivers;
begin
  if not coalesce((select value::text::boolean from app_settings where key = 'auto_verify_enabled'), true) then return false; end if;
  select * into d from drivers where id = p_driver; if not found or d.status <> 'pending' then return false; end if;
  if exists (select 1 from fraud_flags where subject_id = p_driver and status = 'open') then return false; end if;
  v_score := verification_score_driver(p_driver);
  update drivers set verify_score = v_score where id = p_driver;
  if v_score < v_min then return false; end if;
  perform set_config('antaraja.bypass', 'on', true);
  update drivers set status = 'approved', auto_verified = true, probation_until = now() + (v_days || ' days')::interval, status_reason = 'Auto-verifikasi (skor ' || v_score || '/100) · masa percobaan ' || v_days || ' hari' where id = p_driver;
  perform set_config('antaraja.bypass', 'off', true);
  insert into notifications (user_id, kind, title, body, data) values (p_driver, 'system', 'Akun driver aktif ✔', 'Dokumen Anda lolos verifikasi otomatis. Selama ' || v_days || ' hari pertama, maksimal ' || setting_num('probation_daily_orders', 10)::int || ' order/hari. Selamat bekerja!', jsonb_build_object('score', v_score));
  insert into security_events (kind, user_id, detail) values ('verify.auto', p_driver, jsonb_build_object('entity', 'driver', 'score', v_score));
  perform log_activity('driver.auto_verified', 'drivers', p_driver::text, '[otomatis] Driver disetujui (skor ' || v_score || ')', jsonb_build_object('score', v_score));
  return true;
end $$;
revoke execute on function auto_verify_driver(uuid) from public, anon, authenticated;

create or replace function auto_verify_merchant(p_merchant uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_score int; v_min int := setting_num('auto_verify_min_score', 80)::int; v_days int := setting_num('probation_days', 7)::int; m merchants;
begin
  if not coalesce((select value::text::boolean from app_settings where key = 'auto_verify_enabled'), true) then return false; end if;
  select * into m from merchants where id = p_merchant; if not found or m.status <> 'pending' then return false; end if;
  if exists (select 1 from fraud_flags where subject_id = m.owner_id and status = 'open') then return false; end if;
  v_score := verification_score_merchant(p_merchant);
  update merchants set verify_score = v_score where id = p_merchant;
  if v_score < v_min then return false; end if;
  perform set_config('antaraja.bypass', 'on', true);
  update merchants set status = 'approved', auto_verified = true, probation_until = now() + (v_days || ' days')::interval where id = p_merchant;
  perform set_config('antaraja.bypass', 'off', true);
  insert into notifications (user_id, kind, title, body, data) values (m.owner_id, 'system', 'Toko Anda aktif ✔', 'Dokumen usaha lolos verifikasi otomatis. Label halal terverifikasi tetap menunggu pemeriksaan admin.', jsonb_build_object('score', v_score, 'merchant_id', p_merchant));
  insert into security_events (kind, user_id, detail) values ('verify.auto', m.owner_id, jsonb_build_object('entity', 'merchant', 'merchant_id', p_merchant, 'score', v_score));
  perform log_activity('merchant.auto_verified', 'merchants', p_merchant::text, '[otomatis] Merchant "' || m.name || '" disetujui (skor ' || v_score || ')', jsonb_build_object('score', v_score));
  return true;
end $$;
revoke execute on function auto_verify_merchant(uuid) from public, anon, authenticated;

create or replace function trg_auto_verify_driver() returns trigger language plpgsql security definer set search_path = public as $$
begin perform auto_verify_driver(new.driver_id); return new; end $$;
drop trigger if exists driver_documents_auto_verify on driver_documents;
create trigger driver_documents_auto_verify after insert or update on driver_documents for each row execute function trg_auto_verify_driver();
create or replace function trg_auto_verify_merchant() returns trigger language plpgsql security definer set search_path = public as $$
begin perform auto_verify_merchant(new.merchant_id); return new; end $$;
drop trigger if exists merchant_documents_auto_verify on merchant_documents;
create trigger merchant_documents_auto_verify after insert or update on merchant_documents for each row execute function trg_auto_verify_merchant();

-- Batas order harian selama masa percobaan
create or replace function trg_probation_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare v_until timestamptz; v_n int; v_lim int := setting_num('probation_daily_orders', 10)::int;
begin
  if new.driver_id is not null and old.driver_id is null then
    select probation_until into v_until from drivers where id = new.driver_id;
    if v_until is not null and v_until > now() then
      select count(*) into v_n from orders where driver_id = new.driver_id and accepted_at >= date_trunc('day', now());
      if v_n >= v_lim then raise exception 'Batas % order/hari selama masa percobaan tercapai. Lanjut besok atau hubungi CS untuk verifikasi penuh.', v_lim; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_probation_limit on orders;
create trigger orders_probation_limit before update of driver_id on orders for each row execute function trg_probation_limit();

-- ============================================================================
-- 2. Pencairan saldo otomatis
-- ============================================================================
create table if not exists bank_accounts (
  user_id uuid primary key references profiles(id) on delete cascade,
  bank_name text not null, account_no text not null, holder text not null,
  verified boolean not null default false, verified_by uuid, verified_at timestamptz, updated_at timestamptz not null default now()
);
alter table bank_accounts enable row level security;
drop policy if exists ba_sel on bank_accounts; create policy ba_sel on bank_accounts for select using (user_id = auth.uid() or is_admin());
alter table withdrawal_requests add column if not exists auto boolean not null default false;

create or replace function request_withdrawal(p_amount bigint, p_bank text, p_account text, p_name text)
returns withdrawal_requests language plpgsql security definer set search_path = public as $$
declare w withdrawal_requests%rowtype; v_bal bigint; v_auto boolean; v_max bigint := setting_num('auto_payout_max', 500000)::bigint; v_daily bigint := setting_num('auto_payout_daily_max', 1000000)::bigint; v_today bigint; ba bank_accounts;
begin
  if p_amount < 10000 then raise exception 'Minimal penarikan Rp10.000'; end if;
  select balance into v_bal from wallets where user_id = auth.uid() for update;
  if coalesce(v_bal,0) < p_amount then raise exception 'Saldo tidak cukup'; end if;
  perform wallet_apply(auth.uid(), 'withdrawal', -p_amount, null, 'Penarikan saldo (menunggu proses)');
  insert into withdrawal_requests (user_id, amount, bank_name, bank_account, account_name) values (auth.uid(), p_amount, p_bank, p_account, p_name) returning * into w;
  -- rekening tersimpan; verified hanya bila sama dengan rekening yang sudah pernah disetujui admin
  insert into bank_accounts (user_id, bank_name, account_no, holder) values (auth.uid(), p_bank, p_account, p_name)
  on conflict (user_id) do update set verified = case when bank_accounts.account_no = excluded.account_no and bank_accounts.bank_name = excluded.bank_name then bank_accounts.verified else false end,
    bank_name = excluded.bank_name, account_no = excluded.account_no, holder = excluded.holder, updated_at = now();
  select * into ba from bank_accounts where user_id = auth.uid();
  select coalesce(sum(amount), 0) into v_today from withdrawal_requests where user_id = auth.uid() and auto and created_at >= date_trunc('day', now()) and id <> w.id;
  v_auto := coalesce((select value::text::boolean from app_settings where key = 'auto_payout_enabled'), true)
    and ba.verified and p_amount <= v_max and v_today + p_amount <= v_daily
    and not exists (select 1 from fraud_flags where subject_id = auth.uid() and status = 'open' and severity in ('med','high'))
    and not exists (select 1 from drivers where id = auth.uid() and status <> 'approved');
  if v_auto then
    update withdrawal_requests set status = 'approved', auto = true, reviewed_at = now(), review_note = 'Disetujui otomatis (rekening terverifikasi, ≤ batas harian)' where id = w.id returning * into w;
    insert into notifications (user_id, kind, title, body, data) values (auth.uid(), 'system', 'Penarikan disetujui otomatis', 'Rp' || p_amount || ' ke ' || p_bank || ' ' || p_account || ' sedang diproses ke rekening Anda.', jsonb_build_object('withdrawal_id', w.id));
    insert into security_events (kind, user_id, detail) values ('payout.auto', auth.uid(), jsonb_build_object('withdrawal_id', w.id, 'amount', p_amount));
    perform log_activity('withdrawal.auto', 'withdrawal_requests', w.id::text, '[otomatis] Penarikan Rp' || p_amount || ' disetujui', jsonb_build_object('amount', p_amount));
  end if;
  return w;
end $$;

create or replace function admin_review_withdrawal(p_id uuid, p_approve boolean, p_note text default null)
returns withdrawal_requests language plpgsql security definer set search_path = public as $$
declare w withdrawal_requests%rowtype;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  perform admin_require_unlock();
  select * into w from withdrawal_requests where id = p_id for update;
  if not found or w.status <> 'pending' then raise exception 'Permintaan tidak valid'; end if;
  update withdrawal_requests set status = case when p_approve then 'approved' else 'rejected' end::topup_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_id returning * into w;
  if not p_approve then perform wallet_apply(w.user_id, 'refund', w.amount, null, 'Penarikan ditolak, saldo dikembalikan', w.id::text);
  else
    -- rekening yang disetujui manual menjadi terverifikasi untuk pencairan otomatis berikutnya
    insert into bank_accounts (user_id, bank_name, account_no, holder, verified, verified_by, verified_at) values (w.user_id, w.bank_name, w.bank_account, w.account_name, true, auth.uid(), now())
    on conflict (user_id) do update set bank_name = excluded.bank_name, account_no = excluded.account_no, holder = excluded.holder, verified = true, verified_by = auth.uid(), verified_at = now(), updated_at = now();
  end if;
  return w;
end $$;

create or replace function admin_set_bank_verified(p_user uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  update bank_accounts set verified = p_verified, verified_by = auth.uid(), verified_at = now(), updated_at = now() where user_id = p_user;
  perform log_activity('bank.verified', 'bank_accounts', p_user::text, 'Rekening ' || case when p_verified then 'diverifikasi' else 'dicabut verifikasinya' end, jsonb_build_object('verified', p_verified));
end $$;

-- ============================================================================
-- 3. Pusat keamanan admin: PIN panel, sesi buka-kunci, log ekspor & tampilkan data pribadi
-- ============================================================================
create table if not exists admin_security (
  user_id uuid primary key references profiles(id) on delete cascade,
  pin_hash text, pin_set_at timestamptz,
  unlocked_until timestamptz, failed int not null default 0, locked_until timestamptz, updated_at timestamptz not null default now()
);
alter table admin_security enable row level security;
drop policy if exists as_own on admin_security; create policy as_own on admin_security for select using (user_id = auth.uid());

create or replace function admin_pin_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('has_pin', (select pin_hash is not null from admin_security where user_id = auth.uid()),
    'unlocked', coalesce((select unlocked_until > now() from admin_security where user_id = auth.uid()), false),
    'unlocked_until', (select unlocked_until from admin_security where user_id = auth.uid()),
    'locked_until', (select case when locked_until > now() then locked_until end from admin_security where user_id = auth.uid()),
    'session_minutes', setting_num('admin_session_minutes', 60))
  where is_admin();
$$;

create or replace function admin_set_pin(p_new text, p_old text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a admin_security;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_new !~ '^\d{6}$' then raise exception 'PIN harus 6 digit angka'; end if;
  select * into a from admin_security where user_id = auth.uid();
  if a.pin_hash is not null and (p_old is null or a.pin_hash <> extensions.crypt(p_old, a.pin_hash)) then raise exception 'PIN lama salah'; end if;
  insert into admin_security (user_id, pin_hash, pin_set_at, unlocked_until, failed) values (auth.uid(), extensions.crypt(p_new, extensions.gen_salt('bf')), now(), now() + (setting_num('admin_session_minutes', 60) || ' minutes')::interval, 0)
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, pin_set_at = now(), unlocked_until = excluded.unlocked_until, failed = 0, locked_until = null, updated_at = now();
  insert into security_events (kind, user_id, detail) values ('admin.pin_set', auth.uid(), '{}'::jsonb);
  perform log_activity('admin.pin_set', 'admin_security', auth.uid()::text, 'PIN panel admin diatur', null);
end $$;

create or replace function admin_unlock(p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a admin_security; v_min int := setting_num('admin_session_minutes', 60)::int;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  select * into a from admin_security where user_id = auth.uid();
  if a.pin_hash is null then raise exception 'PIN belum diatur'; end if;
  if a.locked_until is not null and a.locked_until > now() then raise exception 'Terlalu banyak percobaan. Coba lagi dalam % menit.', ceil(extract(epoch from (a.locked_until - now())) / 60); end if;
  if a.pin_hash <> extensions.crypt(p_pin, a.pin_hash) then
    update admin_security set failed = failed + 1, locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else locked_until end, updated_at = now() where user_id = auth.uid();
    insert into security_events (kind, user_id, detail) values ('admin.unlock_failed', auth.uid(), jsonb_build_object('failed', a.failed + 1));
    raise exception 'PIN salah (%/5)', a.failed + 1;
  end if;
  update admin_security set unlocked_until = now() + (v_min || ' minutes')::interval, failed = 0, locked_until = null, updated_at = now() where user_id = auth.uid();
  insert into security_events (kind, user_id, detail) values ('admin.unlock', auth.uid(), jsonb_build_object('minutes', v_min));
  return admin_pin_status();
end $$;

create or replace function admin_lock()
returns void language sql security definer set search_path = public as $$
  update admin_security set unlocked_until = null, updated_at = now() where user_id = auth.uid();
$$;

-- Dipanggil fungsi sensitif: wajib PIN aktif & sesi belum kadaluarsa. Bila PIN belum diatur → wajib atur dulu.
create or replace function admin_require_unlock()
returns void language plpgsql stable security definer set search_path = public as $$
declare a admin_security;
begin
  select * into a from admin_security where user_id = auth.uid();
  if a.pin_hash is null then raise exception 'ADMIN_PIN_REQUIRED: atur PIN panel admin di Pusat Keamanan sebelum tindakan sensitif'; end if;
  if a.unlocked_until is null or a.unlocked_until < now() then raise exception 'ADMIN_LOCKED: buka kunci panel dengan PIN (sesi kadaluarsa)'; end if;
end $$;

create or replace function admin_adjust_wallet(p_user uuid, p_amount bigint, p_note text)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  perform admin_require_unlock();
  return wallet_apply(p_user, 'adjustment', p_amount, null, coalesce(p_note, 'Penyesuaian admin'));
end $$;

create or replace function admin_set_user(p_user uuid, p_role user_role default null, p_active boolean default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_role = 'admin' then perform admin_require_unlock(); end if;
  if p_active = false and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Tulis alasan penonaktifan (min. 5 huruf)'; end if;
  perform set_config('antaraja.bypass', 'on', true);
  update profiles set role = coalesce(p_role, role), is_active = coalesce(p_active, is_active), status_reason = case when p_active is not null then p_reason else status_reason end where id = p_user;
  perform set_config('antaraja.bypass', 'off', true);
  perform log_activity('user.status_reason', 'profiles', p_user::text, 'Akun ' || case when p_active is false then 'dinonaktifkan' when p_active then 'diaktifkan' else 'diubah' end || coalesce(' · alasan: ' || p_reason, '') || coalesce(' · role ' || p_role::text, ''), jsonb_build_object('role', p_role, 'active', p_active, 'reason', p_reason));
end $$;

create or replace function admin_set_gateway(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  perform admin_require_unlock();
  insert into gateway_secrets (provider, server_key, client_key, is_production, merchant_id, updated_by)
  values ('midtrans', nullif(p->>'server_key', ''), nullif(p->>'client_key', ''), coalesce((p->>'is_production')::boolean, false), nullif(p->>'merchant_id', ''), auth.uid())
  on conflict (provider) do update set
    server_key = case when p ? 'server_key' and coalesce(p->>'server_key', '') <> '' then p->>'server_key' when p ? 'clear_server_key' then null else gateway_secrets.server_key end,
    client_key = case when p ? 'client_key' then nullif(p->>'client_key', '') else gateway_secrets.client_key end,
    is_production = coalesce((p->>'is_production')::boolean, gateway_secrets.is_production),
    merchant_id = case when p ? 'merchant_id' then nullif(p->>'merchant_id', '') else gateway_secrets.merchant_id end,
    updated_at = now(), updated_by = auth.uid();
  if p ? 'methods' then insert into app_settings (key, value) values ('pg_methods', p->'methods') on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
  if p ? 'topup_min' then insert into app_settings (key, value) values ('pg_topup_min', p->'topup_min') on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
  if p ? 'topup_max' then insert into app_settings (key, value) values ('pg_topup_max', p->'topup_max') on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
  perform log_activity('gateway_config', 'gateway_secrets', 'midtrans', 'Konfigurasi payment gateway diubah' || case when p ? 'server_key' then ' (server key)' else '' end,
    jsonb_build_object('is_production', p->>'is_production', 'methods', p->'methods'));
  return admin_gateway_status();
end $$;

create or replace function admin_log_event(p_kind text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_kind not in ('admin.export','admin.pii_reveal','admin.login') then raise exception 'Jenis tidak valid'; end if;
  insert into security_events (kind, user_id, detail) values (p_kind, auth.uid(), coalesce(p_detail, '{}'::jsonb));
end $$;

create or replace function admin_security_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pin', admin_pin_status(),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object('user_name', (select full_name from profiles where id = e.user_id)) order by e.created_at desc), '[]'::jsonb) from (select * from security_events order by created_at desc limit 100) e),
    'counts_7d', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from security_events where created_at > now() - interval '7 days' group by kind) q),
    'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'has_pin', s.pin_hash is not null, 'unlocked', coalesce(s.unlocked_until > now(), false))), '[]'::jsonb) from profiles p left join admin_security s on s.user_id = p.id where p.role = 'admin'),
    'fraud', admin_fraud_summary(),
    'auto_verified_30d', (select count(*) from security_events where kind = 'verify.auto' and created_at > now() - interval '30 days'),
    'auto_payout_30d', (select count(*) from withdrawal_requests where auto and created_at > now() - interval '30 days'),
    'bank_verified', (select count(*) from bank_accounts where verified)
  ) where is_admin();
$$;

-- ============================================================================
-- 4. Harga dinamis berbasis permintaan (di atas sesi terjadwal), batas atas diatur admin
-- ============================================================================
create or replace function demand_multiplier(p_service service_type, p_lat double precision, p_lng double precision)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_pt geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography; v_r numeric := setting_num('dynamic_radius_km', 5) * 1000; v_win int := setting_num('dynamic_window_min', 15)::int;
  v_demand int; v_supply int; v_ratio numeric; v_mult numeric := 1; v_max numeric := setting_num('dynamic_max_multiplier', 1.5); v_step numeric := setting_num('dynamic_step', 0.25);
begin
  if not coalesce((select value::text::boolean from app_settings where key = 'dynamic_pricing_enabled'), true) then return jsonb_build_object('multiplier', 1, 'demand', 0, 'supply', 0); end if;
  if p_service not in ('ride_motor','ride_car','food','send','shop','market','box') then return jsonb_build_object('multiplier', 1, 'demand', 0, 'supply', 0); end if;
  select count(*) into v_demand from orders o where o.status in ('searching','accepted') and o.created_at > now() - (v_win || ' minutes')::interval and o.pickup_location is not null and st_dwithin(o.pickup_location, v_pt, v_r)
    and (case when p_service in ('ride_car','box') then o.service = p_service else o.service not in ('ride_car','box','travel') end);
  select count(*) into v_supply from drivers d where d.is_online and d.status = 'approved' and d.location is not null and st_dwithin(d.location, v_pt, v_r)
    and (case when p_service = 'ride_car' then d.vehicle_type::text = 'car' when p_service = 'box' then d.vehicle_type::text in ('box','pickup') else d.vehicle_type::text = 'motor' end)
    and not exists (select 1 from orders o where o.driver_id = d.id and o.status in ('accepted','arrived','in_progress'));
  v_ratio := v_demand::numeric / greatest(1, v_supply);
  if v_demand >= 2 and v_ratio > 1 then v_mult := least(v_max, 1 + v_step * ceil(v_ratio - 1)); end if;
  return jsonb_build_object('multiplier', round(v_mult, 2), 'demand', v_demand, 'supply', v_supply, 'ratio', round(v_ratio, 2));
end $$;

create or replace function estimate_fare(p_service service_type, p_pickup_lat double precision, p_pickup_lng double precision, p_drop_lat double precision, p_drop_lng double precision, p_route_km numeric default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_straight numeric; v_km numeric; v_fare bigint; v_fee bigint; v_ratio numeric; s pricing_sessions; v_dm jsonb; v_mult numeric;
begin
  v_straight := st_distance(st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography, st_setsrid(st_makepoint(p_drop_lng, p_drop_lat), 4326)::geography) / 1000.0;
  v_ratio := setting_num('max_route_ratio', 2.5);
  v_km := coalesce(p_route_km, v_straight * 1.3);
  v_km := least(greatest(v_km, v_straight), greatest(v_straight * v_ratio, 0.5));
  v_km := round(v_km, 2);
  select fare, platform_fee into v_fare, v_fee from calc_fare(p_service, v_km);
  s := current_pricing_session(p_service);
  v_dm := demand_multiplier(p_service, p_pickup_lat, p_pickup_lng);
  v_mult := coalesce((v_dm->>'multiplier')::numeric, 1);
  if v_mult > 1 then v_fare := round_to((v_fare * v_mult)::bigint, 500); end if;
  return jsonb_build_object('distance_km', v_km, 'straight_km', round(v_straight, 2),
    'fare', v_fare, 'platform_fee', v_fee, 'total', v_fare + v_fee,
    'duration_min', greatest(3, ceil(v_km / 25.0 * 60)),
    'session', case when s.id is null then null else jsonb_build_object('name', s.name, 'level', s.level, 'multiplier', s.multiplier) end,
    'demand', case when v_mult > 1 then v_dm else null end);
end $$;

-- ============================================================================
-- 5. Laporan eksekutif: keuangan + rekomendasi (dipakai portal & laporan terjadwal)
-- ============================================================================
create or replace function exec_recommendations(d jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb := '[]'::jsonb; v numeric; v2 numeric; s jsonb := d->'summary'; f jsonb := d->'finance'; q jsonb := d->'quality'; sp jsonb := d->'supply'; x jsonb;
begin
  v := coalesce((q->>'cancel_rate')::numeric, 0);
  if v > 8 then r := r || jsonb_build_object('priority', case when v > 15 then 'high' else 'med' end, 'area', 'Operasional', 'title', 'Tingkat pembatalan ' || v || '%', 'detail', 'Di atas ambang sehat 8%. Penyebab umum: driver online kurang di jam sibuk, waktu tunggu lama, harga dinamis terlalu tinggi.', 'action', 'Aktifkan bonus sesi jam sibuk di Tarif & Promo, tinjau flag pembatalan driver di Pusat Keamanan.'); end if;
  v := coalesce((f->>'take_rate_pct')::numeric, 0); v2 := setting_num('target_take_rate_pct', 18);
  if coalesce((s->>'gmv')::numeric, 0) > 0 and v < v2 then r := r || jsonb_build_object('priority', 'med', 'area', 'Keuangan', 'title', 'Take rate ' || v || '% di bawah target ' || v2 || '%', 'detail', 'Pendapatan platform per GMV rendah. Cek platform fee per layanan, porsi jasa belanja (Shop/Market), dan diskon promo (' || coalesce(f->>'promo_pct_gmv','0') || '% dari GMV).', 'action', 'Naikkan platform fee layanan bermargin rendah atau batasi promo ke pelanggan baru saja.'); end if;
  v := coalesce((f->>'promo_pct_gmv')::numeric, 0);
  if v > 5 then r := r || jsonb_build_object('priority', 'med', 'area', 'Keuangan', 'title', 'Diskon promo ' || v || '% dari GMV', 'detail', 'Promo di atas 5% GMV menggerus margin.', 'action', 'Batasi kuota promo dan arahkan ke retensi otomatis (pelanggan tidak aktif) yang lebih tepat sasaran.'); end if;
  v := abs(coalesce((sp->>'wallet_negative')::numeric, 0));
  if v > 1000000 then r := r || jsonb_build_object('priority', 'high', 'area', 'Keuangan', 'title', 'Piutang saldo minus mitra Rp' || to_char(v, 'FM999G999G999'), 'detail', 'Saldo minus driver (order tunai) menumpuk; risiko gagal tagih.', 'action', 'Turunkan batas minus di Pengaturan dan wajibkan top up sebelum menerima order tunai.'); end if;
  v := coalesce((f->>'gateway_fee_est')::numeric, 0);
  if coalesce((f->>'topups_gateway')::numeric, 0) = 0 and coalesce((s->>'gmv')::numeric, 0) > 0 then r := r || jsonb_build_object('priority', 'med', 'area', 'Pembayaran', 'title', 'Belum ada top up via payment gateway', 'detail', 'Semua top up masih manual/simulasi; ini membatasi konversi pelanggan.', 'action', 'Isi kunci Midtrans di Panel Admin → Payment Gateway (Sandbox dulu), uji Rp10.000.'); end if;
  v := coalesce((d->>'gmv_growth_pct')::numeric, 0);
  if coalesce((d->>'prev_gmv')::numeric, 0) > 0 and v < 0 then r := r || jsonb_build_object('priority', 'high', 'area', 'Pertumbuhan', 'title', 'GMV turun ' || abs(v) || '% vs periode sebelumnya', 'detail', 'Periksa layanan/kota yang menurun di tabel di bawah.', 'action', 'Jalankan blast promo tertarget & pastikan pasokan driver di kota yang turun.');
  elsif coalesce((d->>'prev_gmv')::numeric, 0) > 0 and v > 30 then r := r || jsonb_build_object('priority', 'low', 'area', 'Pertumbuhan', 'title', 'GMV tumbuh ' || v || '%', 'detail', 'Pertumbuhan kuat; pastikan pasokan mitra mengikuti.', 'action', 'Buka pendaftaran mitra & aktifkan verifikasi otomatis agar antrean tidak menumpuk.'); end if;
  x := d->'by_city'->0;
  if x is not null and coalesce((s->>'gmv')::numeric, 0) > 0 and (x->>'gmv')::numeric / (s->>'gmv')::numeric > 0.7 and jsonb_array_length(d->'by_city') > 1 then
    r := r || jsonb_build_object('priority', 'low', 'area', 'Ekspansi', 'title', 'Konsentrasi ' || round(100 * (x->>'gmv')::numeric / (s->>'gmv')::numeric) || '% GMV di ' || (x->>'city'), 'detail', 'Ketergantungan pada satu kota.', 'action', 'Alokasikan promo akuisisi & rekrutmen mitra ke kota kedua.'); end if;
  v := coalesce((sp->>'drivers_pending')::numeric, 0) + coalesce((sp->>'merchants_pending')::numeric, 0);
  if v >= 5 then r := r || jsonb_build_object('priority', 'med', 'area', 'Pasokan', 'title', v || ' pengajuan mitra menunggu', 'detail', 'Antrean verifikasi memperlambat pasokan.', 'action', 'Pastikan verifikasi otomatis aktif (Otomasi) dan tinjau yang di bawah ambang skor.'); end if;
  v := coalesce((q->>'tickets_open')::numeric, 0); v2 := coalesce((q->>'avg_first_response_min')::numeric, 0);
  if v > 10 or v2 > 30 then r := r || jsonb_build_object('priority', 'med', 'area', 'Layanan pelanggan', 'title', v || ' tiket terbuka · respons pertama ' || v2 || ' mnt', 'detail', 'SLA respons > 30 menit menurunkan kepuasan.', 'action', 'Tambah jadwal CS jam sibuk; gunakan balasan cepat.'); end if;
  v := coalesce((d->'fraud'->>'open')::numeric, 0);
  if v > 0 then r := r || jsonb_build_object('priority', case when coalesce((d->'fraud'->>'open_high')::numeric, 0) > 0 then 'high' else 'low' end, 'area', 'Keamanan', 'title', v || ' flag anti-fraud terbuka', 'detail', coalesce((d->'fraud'->>'auto_suspended')::text, '0') || ' akun ditangguhkan otomatis menunggu peninjauan.', 'action', 'Tinjau di Panel Admin → Pusat Keamanan.'); end if;
  if jsonb_array_length(r) = 0 then r := r || jsonb_build_object('priority', 'low', 'area', 'Umum', 'title', 'Semua indikator dalam batas sehat', 'detail', 'Tidak ada anomali pada periode ini.', 'action', 'Pertahankan; fokus akuisisi pelanggan & pasokan mitra.'); end if;
  return r;
end $$;

create or replace function exec_report_data(p_months integer default 6)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := date_trunc('month', now()) - ((greatest(1, p_months) - 1) || ' months')::interval; d jsonb; f jsonb; v_gmv numeric; v_rev numeric; v_prev numeric; v_gw numeric := setting_num('gateway_fee_pct', 1.5);
begin
  d := jsonb_build_object(
    'generated_at', now(), 'from', v_from, 'months', greatest(1, p_months),
    'summary', (select jsonb_build_object(
        'gmv', coalesce(sum(total) filter (where status = 'completed'), 0),
        'orders', count(*), 'completed', count(*) filter (where status = 'completed'), 'cancelled', count(*) filter (where status = 'cancelled'),
        'revenue', coalesce(sum(platform_fee + (fare_delivery - driver_earning) + (items_subtotal - merchant_earning) * (merchant_id is not null)::int + coalesce(service_fee - driver_service_share, 0)) filter (where status = 'completed'), 0),
        'driver_payout', coalesce(sum(driver_earning + coalesce(driver_service_share, 0) + coalesce(tip, 0)) filter (where status = 'completed'), 0),
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
          'revenue', coalesce((select sum(platform_fee + (fare_delivery - driver_earning) + coalesce(service_fee - driver_service_share, 0)) from orders o where o.status = 'completed' and date_trunc('month', o.created_at) = m), 0),
          'promo', coalesce((select sum(discount) from orders o where o.status = 'completed' and date_trunc('month', o.created_at) = m), 0),
          'driver_payout', coalesce((select sum(driver_earning + coalesce(driver_service_share, 0)) from orders o where o.status = 'completed' and date_trunc('month', o.created_at) = m), 0),
          'topups', coalesce((select sum(amount) from wallet_transactions t where t.type = 'topup' and date_trunc('month', t.created_at) = m), 0),
          'withdrawals', coalesce((select -sum(amount) from wallet_transactions t where t.type = 'withdrawal' and date_trunc('month', t.created_at) = m), 0),
          'new_users', (select count(*) from profiles p where date_trunc('month', p.created_at) = m),
          'new_drivers', (select count(*) from drivers d where date_trunc('month', d.created_at) = m)) x
        from generate_series(v_from, date_trunc('month', now()), interval '1 month') m) q),
    'by_service', (select coalesce(jsonb_agg(jsonb_build_object('service', service, 'orders', n, 'gmv', gmv, 'revenue', rev) order by gmv desc), '[]') from (
        select service, count(*) n, coalesce(sum(total) filter (where status = 'completed'), 0) gmv, coalesce(sum(platform_fee + (fare_delivery - driver_earning) + coalesce(service_fee - driver_service_share, 0)) filter (where status = 'completed'), 0) rev from orders where created_at >= v_from group by service) q),
    'by_city', (select coalesce(jsonb_agg(jsonb_build_object('city', coalesce(city, 'Lainnya'), 'orders', n, 'gmv', gmv, 'customers', c) order by gmv desc), '[]') from (
        select city, count(*) n, coalesce(sum(total) filter (where status = 'completed'), 0) gmv, count(distinct customer_id) c from orders where created_at >= v_from group by city) q),
    'top_merchants', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'orders', n, 'gmv', gmv) order by gmv desc), '[]') from (
        select m.name, count(*) n, coalesce(sum(o.items_subtotal), 0) gmv from orders o join merchants m on m.id = o.merchant_id where o.status = 'completed' and o.created_at >= v_from group by m.name order by gmv desc limit 5) q),
    'supply', jsonb_build_object(
        'drivers_total', (select count(*) from drivers where status = 'approved'), 'drivers_online', (select count(*) from drivers where is_online),
        'drivers_pending', (select count(*) from drivers where status = 'pending'),
        'merchants_total', (select count(*) from merchants where status = 'approved'), 'merchants_pending', (select count(*) from merchants where status = 'pending'),
        'vendors_total', (select count(*) from market_vendors where status = 'approved'), 'vendors_pending', (select count(*) from market_vendors where status = 'pending'),
        'travel_partners', (select count(*) from travel_partners where status = 'approved'),
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
        'sos', (select count(*) from sos_alerts where created_at >= v_from)),
    'fraud', jsonb_build_object('open', (select count(*) from fraud_flags where status = 'open'), 'open_high', (select count(*) from fraud_flags where status = 'open' and severity = 'high'), 'auto_suspended', (select count(*) from fraud_flags where status = 'open' and auto_action = 'suspended')),
    'automation', jsonb_build_object('auto_verified', (select count(*) from security_events where kind = 'verify.auto' and created_at >= v_from), 'auto_payouts', (select count(*) from withdrawal_requests where auto and created_at >= v_from), 'place_suggestions', (select count(*) from place_suggestions where created_at >= v_from), 'place_auto_approved', (select count(*) from place_suggestions where auto and created_at >= v_from))
  );
  v_gmv := (d->'summary'->>'gmv')::numeric; v_rev := (d->'summary'->>'revenue')::numeric; v_prev := (d->>'prev_gmv')::numeric;
  f := jsonb_build_object(
    'gmv', v_gmv, 'revenue', v_rev,
    'take_rate_pct', case when v_gmv > 0 then round(100 * v_rev / v_gmv, 1) else 0 end,
    'promo_discount', (select coalesce(sum(discount), 0) from orders where status = 'completed' and created_at >= v_from),
    'promo_pct_gmv', case when v_gmv > 0 then round(100 * (select coalesce(sum(discount), 0) from orders where status = 'completed' and created_at >= v_from) / v_gmv, 1) else 0 end,
    'tips', (select coalesce(sum(tip), 0) from orders where status = 'completed' and created_at >= v_from),
    'refunds', (select coalesce(sum(amount), 0) from wallet_transactions where type = 'refund' and created_at >= v_from),
    'topups', (select coalesce(sum(amount), 0) from wallet_transactions where type = 'topup' and created_at >= v_from),
    'topups_gateway', (select coalesce(sum(amount), 0) from payments where status in ('settlement','capture','paid','success') and purpose = 'topup' and created_at >= v_from),
    'withdrawals', (select coalesce(-sum(amount), 0) from wallet_transactions where type = 'withdrawal' and created_at >= v_from),
    'withdrawals_pending', (select coalesce(sum(amount), 0) from withdrawal_requests where status = 'pending'),
    'topups_pending', (select coalesce(sum(amount), 0) from topup_requests where status = 'pending'),
    'wallet_liability', (select coalesce(sum(balance), 0) from wallets where balance > 0),
    'receivable_negative', (select coalesce(-sum(balance), 0) from wallets where balance < 0),
    'gateway_fee_pct', v_gw,
    'gateway_fee_est', round((select coalesce(sum(amount), 0) from payments where status in ('settlement','capture','paid','success') and purpose = 'topup' and created_at >= v_from) * v_gw / 100),
    'cash_orders_pct', (select round(100.0 * count(*) filter (where payment_method = 'cash') / greatest(1, count(*)), 1) from orders where status = 'completed' and created_at >= v_from)
  );
  f := f || jsonb_build_object('net_revenue', v_rev - (f->>'gateway_fee_est')::numeric - (f->>'promo_discount')::numeric,
    'contribution_margin_pct', case when v_gmv > 0 then round(100 * (v_rev - (f->>'gateway_fee_est')::numeric - (f->>'promo_discount')::numeric) / v_gmv, 1) else 0 end);
  d := d || jsonb_build_object('finance', f, 'gmv_growth_pct', case when v_prev > 0 then round(100 * (v_gmv - v_prev) / v_prev, 1) else null end);
  d := d || jsonb_build_object('recommendations', exec_recommendations(d));
  return d;
end $$;
revoke execute on function exec_report_data(integer) from public, anon, authenticated;

create or replace function exec_report(p_token text, p_months integer default 6)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s exec_sessions;
begin
  s := exec_valid(p_token);
  if s.token is null then raise exception 'EXEC_SESSION_EXPIRED'; end if;
  return exec_report_data(p_months) || jsonb_build_object('level', s.level);
end $$;

-- ============================================================================
-- 6. Laporan otomatis terjadwal (in-app ke admin & eksekutif; email via Edge Function bila kunci diisi)
-- ============================================================================
create table if not exists scheduled_reports (
  id uuid primary key default gen_random_uuid(),
  name text not null, cadence text not null check (cadence in ('daily','weekly','monthly')),
  hour int not null default 7, months int not null default 3,
  recipients text[] not null default '{}',     -- email tambahan (opsional)
  active boolean not null default true,
  last_run_at timestamptz, next_run_at timestamptz, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists report_runs (
  id bigserial primary key, report_id uuid references scheduled_reports(id) on delete set null, name text not null, period text not null,
  data jsonb not null, emailed boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists report_runs_created on report_runs (created_at desc);
alter table scheduled_reports enable row level security; alter table report_runs enable row level security;
drop policy if exists sr_admin on scheduled_reports; create policy sr_admin on scheduled_reports for select using (is_admin() or exists (select 1 from exec_access where user_id = auth.uid() and active));
drop policy if exists rr_admin on report_runs; create policy rr_admin on report_runs for select using (is_admin() or exists (select 1 from exec_access where user_id = auth.uid() and active));
insert into scheduled_reports (name, cadence, hour, months) select 'Ringkasan harian', 'daily', 7, 1 where not exists (select 1 from scheduled_reports);
insert into scheduled_reports (name, cadence, hour, months) select 'Laporan mingguan manajemen', 'weekly', 8, 3 where not exists (select 1 from scheduled_reports where cadence = 'weekly');

create or replace function report_next_run(p_cadence text, p_hour int, p_from timestamptz)
returns timestamptz language sql stable as $$
  select case p_cadence
    when 'daily' then (date_trunc('day', p_from at time zone 'Asia/Jakarta') + (p_hour || ' hours')::interval + interval '1 day') at time zone 'Asia/Jakarta'
    when 'weekly' then (date_trunc('week', p_from at time zone 'Asia/Jakarta') + interval '7 days' + (p_hour || ' hours')::interval) at time zone 'Asia/Jakarta'
    else (date_trunc('month', p_from at time zone 'Asia/Jakarta') + interval '1 month' + (p_hour || ' hours')::interval) at time zone 'Asia/Jakarta' end;
$$;

create or replace function run_scheduled_reports(p_force uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare r scheduled_reports; v_n int := 0; v_data jsonb; v_period text; v_run bigint; v_rec jsonb;
begin
  if not coalesce((select value::text::boolean from app_settings where key = 'reports_enabled'), true) and p_force is null then return 0; end if;
  for r in select * from scheduled_reports where active and ((p_force is not null and id = p_force) or (p_force is null and coalesce(next_run_at, now()) <= now())) loop
    v_data := exec_report_data(r.months);
    v_period := case r.cadence when 'daily' then to_char(now() at time zone 'Asia/Jakarta' - interval '1 day', 'DD Mon YYYY') when 'weekly' then 'Minggu ' || to_char(now() at time zone 'Asia/Jakarta', 'IW/YYYY') else to_char(now() at time zone 'Asia/Jakarta' - interval '1 month', 'Mon YYYY') end;
    insert into report_runs (report_id, name, period, data) values (r.id, r.name, v_period, v_data) returning id into v_run;
    v_rec := v_data->'recommendations'->0;
    insert into notifications (user_id, kind, title, body, data)
      select p.id, 'system', r.name || ' · ' || v_period, 'GMV Rp' || to_char((v_data->'summary'->>'gmv')::numeric, 'FM999G999G999G999') || ' · pendapatan Rp' || to_char((v_data->'finance'->>'revenue')::numeric, 'FM999G999G999G999') || ' · take rate ' || (v_data->'finance'->>'take_rate_pct') || '%. Rekomendasi: ' || coalesce(v_rec->>'title', '-'), jsonb_build_object('report_run_id', v_run, 'admin_route', '/exec')
      from profiles p where p.is_active and (p.role = 'admin' or exists (select 1 from exec_access e where e.user_id = p.id and e.active));
    update scheduled_reports set last_run_at = now(), next_run_at = report_next_run(cadence, hour, now()) where id = r.id;
    v_n := v_n + 1;
  end loop;
  insert into automation_runs (kind, finished_at, count, detail) values ('reports', now(), v_n, jsonb_build_object('forced', p_force is not null));
  return v_n;
end $$;
revoke execute on function run_scheduled_reports(uuid) from public, anon, authenticated;

create or replace function admin_upsert_scheduled_report(p jsonb)
returns scheduled_reports language plpgsql security definer set search_path = public as $$
declare r scheduled_reports;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if nullif(p->>'id','') is null then
    insert into scheduled_reports (name, cadence, hour, months, recipients, active, created_by, next_run_at)
    values (coalesce(p->>'name', 'Laporan'), coalesce(p->>'cadence', 'weekly'), coalesce((p->>'hour')::int, 7), coalesce((p->>'months')::int, 3), coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'recipients','[]'::jsonb)) x), '{}'), coalesce((p->>'active')::boolean, true), auth.uid(), report_next_run(coalesce(p->>'cadence', 'weekly'), coalesce((p->>'hour')::int, 7), now()))
    returning * into r;
  else
    update scheduled_reports set name = coalesce(p->>'name', name), cadence = coalesce(p->>'cadence', cadence), hour = coalesce((p->>'hour')::int, hour), months = coalesce((p->>'months')::int, months),
      recipients = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'recipients') x), recipients), active = coalesce((p->>'active')::boolean, active), next_run_at = report_next_run(coalesce(p->>'cadence', cadence), coalesce((p->>'hour')::int, hour), now())
    where id = (p->>'id')::uuid returning * into r;
  end if;
  return r;
end $$;

create or replace function report_runs_list(p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'period', period, 'created_at', created_at, 'summary', data->'summary', 'finance', data->'finance', 'recommendations', data->'recommendations') order by created_at desc), '[]'::jsonb)
  from (select * from report_runs where is_admin() or exists (select 1 from exec_access where user_id = auth.uid() and active) order by created_at desc limit p_limit) q;
$$;

-- ============================================================================
-- 7. Retensi pelanggan otomatis (pelanggan tidak aktif & merchant sepi)
-- ============================================================================
create table if not exists retention_touches (
  id bigserial primary key, user_id uuid not null references profiles(id) on delete cascade, kind text not null, promo_code text, est_cost bigint not null default 0, created_at timestamptz not null default now()
);
create index if not exists retention_touches_user on retention_touches (user_id, created_at desc);
alter table retention_touches enable row level security;
drop policy if exists rt_admin on retention_touches; create policy rt_admin on retention_touches for select using (is_admin());

create or replace function run_retention_campaign()
returns int language plpgsql security definer set search_path = public as $$
declare v_days int := setting_num('retention_days', 14)::int; v_cool int := setting_num('retention_cooldown_days', 30)::int; v_budget bigint := setting_num('retention_budget_month', 2000000)::bigint;
  v_val int := setting_num('retention_promo_value', 15)::int; v_max bigint := setting_num('retention_promo_max', 10000)::bigint; v_spent bigint; v_code text := 'KEMBALI' || v_val; v_n int := 0; v_m int := 0; u record;
begin
  if not coalesce((select value::text::boolean from app_settings where key = 'retention_enabled'), true) then return 0; end if;
  insert into promos (code, title, description, discount_type, value, max_discount, min_total, is_active, valid_from, valid_to, sort_order)
  values (v_code, 'Diskon ' || v_val || '% untuk kembali', 'Promo retensi otomatis untuk pelanggan yang lama tidak memesan', 'percent', v_val, v_max, 20000, true, now(), now() + interval '1 year', 99)
  on conflict (code) do update set is_active = true, value = v_val, max_discount = v_max, valid_to = now() + interval '1 year';
  select coalesce(sum(est_cost), 0) into v_spent from retention_touches where created_at >= date_trunc('month', now());
  for u in
    select p.id, p.full_name from profiles p where p.is_active and p.role = 'customer'
      and coalesce((select max(created_at) from orders o where o.customer_id = p.id), p.created_at) < now() - (v_days || ' days')::interval
      and not exists (select 1 from retention_touches t where t.user_id = p.id and t.created_at > now() - (v_cool || ' days')::interval)
    order by (select max(created_at) from orders o where o.customer_id = p.id) desc nulls last limit 500
  loop
    exit when v_spent + v_max > v_budget;
    insert into notifications (user_id, kind, title, body, promo_code, data) values (u.id, 'promo', 'Kami rindu Anda, ' || split_part(coalesce(u.full_name, 'Kak'), ' ', 1) || ' 👋', 'Diskon ' || v_val || '% (maks Rp' || to_char(v_max, 'FM999G999') || ') untuk pesanan berikutnya. Pakai kode ' || v_code || '.', v_code, jsonb_build_object('auto', true, 'kind', 'retention'));
    insert into retention_touches (user_id, kind, promo_code, est_cost) values (u.id, 'inactive_customer', v_code, v_max);
    v_spent := v_spent + v_max; v_n := v_n + 1;
  end loop;
  -- merchant sepi: tidak ada order 14 hari → saran promo (tanpa biaya)
  for u in
    select m.owner_id id, m.name full_name from merchants m where m.status = 'approved' and m.owner_id is not null
      and not exists (select 1 from orders o where o.merchant_id = m.id and o.created_at > now() - (v_days || ' days')::interval)
      and not exists (select 1 from retention_touches t where t.user_id = m.owner_id and t.kind = 'quiet_merchant' and t.created_at > now() - (v_cool || ' days')::interval)
    limit 200
  loop
    insert into notifications (user_id, kind, title, body, data) values (u.id, 'system', 'Toko ' || u.full_name || ' sepi ' || v_days || ' hari', 'Tips: perbarui foto menu, tambah menu andalan dengan harga promo, dan pastikan jam buka benar. Pelanggan sekitar akan diberi tahu otomatis saat ada menu baru.', jsonb_build_object('auto', true, 'kind', 'quiet_merchant'));
    insert into retention_touches (user_id, kind) values (u.id, 'quiet_merchant');
    v_m := v_m + 1;
  end loop;
  insert into automation_runs (kind, finished_at, count, detail) values ('retention', now(), v_n, jsonb_build_object('customers', v_n, 'merchants', v_m, 'spent_month', v_spent, 'budget', v_budget));
  return v_n;
end $$;
revoke execute on function run_retention_campaign() from public, anon, authenticated;

-- ============================================================================
-- 8. Pusat otomasi admin: status, jalankan manual, backlog verifikasi
-- ============================================================================
create or replace function run_verification_backlog()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record;
begin
  for r in select id from drivers where status = 'pending' loop if auto_verify_driver(r.id) then v_n := v_n + 1; end if; end loop;
  for r in select id from merchants where status = 'pending' loop if auto_verify_merchant(r.id) then v_n := v_n + 1; end if; end loop;
  update drivers set verify_score = verification_score_driver(id) where status = 'pending';
  update merchants set verify_score = verification_score_merchant(id) where status = 'pending';
  insert into automation_runs (kind, finished_at, count) values ('verify_backlog', now(), v_n);
  return v_n;
end $$;
revoke execute on function run_verification_backlog() from public, anon, authenticated;

create or replace function admin_run_automation(p_kind text, p_arg text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  case p_kind
    when 'retention' then v_n := run_retention_campaign();
    when 'reports' then v_n := run_scheduled_reports(nullif(p_arg,'')::uuid);
    when 'verify_backlog' then v_n := run_verification_backlog();
    else raise exception 'Otomasi tidak dikenal';
  end case;
  update automation_runs set triggered_by = auth.uid() where id = (select max(id) from automation_runs where kind = p_kind);
  perform log_activity('automation.run', 'automation_runs', p_kind, 'Otomasi ' || p_kind || ' dijalankan manual (' || v_n || ')', jsonb_build_object('count', v_n));
  return jsonb_build_object('count', v_n);
end $$;

create or replace function admin_automation_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'settings', (select jsonb_object_agg(key, value) from app_settings where key in ('auto_verify_enabled','auto_verify_min_score','probation_days','probation_daily_orders','auto_payout_enabled','auto_payout_max','auto_payout_daily_max',
      'retention_enabled','retention_days','retention_cooldown_days','retention_budget_month','retention_promo_value','retention_promo_max','dynamic_pricing_enabled','dynamic_max_multiplier','dynamic_radius_km','dynamic_window_min','dynamic_step',
      'reports_enabled','fraud_auto_suspend','fraud_cancel_limit','fraud_gps_speed_kmh','price_coef_min','price_coef_max','price_coef_hard','shop_budget_coef','place_auto_approve_reports','place_dedup_radius_m','vendor_quality_min','admin_session_minutes','gateway_fee_pct','target_take_rate_pct')),
    'last_runs', (select coalesce(jsonb_object_agg(kind, to_jsonb(r)), '{}'::jsonb) from (select distinct on (kind) * from automation_runs order by kind, started_at desc) r),
    'recent_runs', (select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]'::jsonb) from (select * from automation_runs order by started_at desc limit 30) r),
    'reports', (select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at), '[]'::jsonb) from scheduled_reports s),
    'cron', (select coalesce(jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active)), '[]'::jsonb) from cron.job),
    'pending', jsonb_build_object('drivers', (select count(*) from drivers where status = 'pending'), 'merchants', (select count(*) from merchants where status = 'pending'), 'vendors', (select count(*) from market_vendors where status = 'pending'),
      'withdrawals', (select count(*) from withdrawal_requests where status = 'pending'), 'places', (select count(*) from place_suggestions where status = 'pending'), 'fraud', (select count(*) from fraud_flags where status = 'open')),
    'retention_month', jsonb_build_object('touches', (select count(*) from retention_touches where created_at >= date_trunc('month', now())), 'spent', (select coalesce(sum(est_cost), 0) from retention_touches where created_at >= date_trunc('month', now())))
  ) where is_admin();
$$;

create or replace function admin_set_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  for k, v in select * from jsonb_each(p) loop
    if k !~ '^[a-z_]+$' then raise exception 'Kunci tidak valid: %', k; end if;
    insert into app_settings (key, value) values (k, v) on conflict (key) do update set value = excluded.value, updated_at = now();
  end loop;
  perform log_activity('settings.update', 'app_settings', 'batch', 'Pengaturan otomasi diubah: ' || (select string_agg(key, ', ') from jsonb_object_keys(p) key), p);
end $$;

-- ============================================================================
-- 9. Penjadwalan pg_cron (WIB = UTC+7)
-- ============================================================================
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('antarkita_reports','antarkita_retention','antarkita_verify_backlog');
exception when others then null; end $$;
select cron.schedule('antarkita_reports', '5 * * * *', $$select public.run_scheduled_reports();$$);
select cron.schedule('antarkita_retention', '0 3 * * *', $$select public.run_retention_campaign();$$);           -- 10.00 WIB setiap hari
select cron.schedule('antarkita_verify_backlog', '*/30 * * * *', $$select public.run_verification_backlog();$$);

-- Hardening: fungsi baru tidak boleh dipanggil anon
do $$ declare f record; begin
  for f in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('suggest_place','my_place_suggestions','admin_place_suggestions','admin_review_place_suggestion','admin_fraud_flags','admin_review_fraud','admin_fraud_summary','market_vendor_quality','apply_market_vendor','vendor_upsert_item','vendor_set_stock','market_vendor_catalog','admin_market_vendors','admin_review_market_vendor','verification_score_driver','verification_score_merchant','admin_pin_status','admin_set_pin','admin_unlock','admin_lock','admin_require_unlock','admin_set_bank_verified','admin_log_event','admin_security_overview','demand_multiplier','exec_recommendations','admin_upsert_scheduled_report','report_runs_list','admin_run_automation','admin_automation_status','admin_set_settings','report_next_run','trg_fraud_driver_cancel','trg_fraud_gps_jump','trg_fraud_shared_device','trg_auto_verify_driver','trg_auto_verify_merchant','trg_probation_limit')
  loop execute 'revoke execute on function ' || f.sig || ' from public, anon'; end loop; end $$;
