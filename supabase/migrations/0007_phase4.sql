-- =====================================================================
-- Antar Aja — Tahap 4
--  A. Merchant: sertifikasi usaha (NPWP/NPWPD, Izin Usaha/NIB, Sertifikat Halal), label halal
--     untuk pelanggan, model pengajuan + tinjauan admin (setujui/tolak + catatan)
--  B. Tiket aduan (pelanggan/driver/merchant) + tindak lanjut CS online (chat realtime)
--  C. Log aktivitas (audit log) untuk panel admin
--  D. Keamanan ala Gojek/Grab: SOS, bagikan perjalanan, PIN penjemputan,
--     verifikasi wajah driver sebelum online, kontak darurat
--  E. Beranda pelanggan: promo bergambar & "sering dipesan"
-- =====================================================================

-- ---------- A. Merchant ----------
alter table merchants
  add column if not exists is_halal boolean not null default false,
  add column if not exists halal_verified boolean not null default false;

create table if not exists merchant_documents (
  merchant_id uuid primary key references merchants(id) on delete cascade,
  owner_phone text,
  npwp_no text,                 -- NPWP / NPWPD (wajib)
  npwp_url text,
  license_no text,              -- Izin usaha / NIB (opsional)
  license_url text,
  halal_cert_no text,           -- Sertifikat halal (opsional)
  halal_cert_url text,
  owner_id_card_url text,       -- KTP pemilik (wajib)
  place_photo_url text,         -- foto tempat usaha (wajib)
  bank_name text, bank_account text, bank_holder text,   -- rekening pencairan
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id) on delete set null,
  review_note text,
  updated_at timestamptz not null default now()
);
alter table merchant_documents enable row level security;
create policy mdoc_select on merchant_documents for select to authenticated
  using (is_admin() or exists (select 1 from merchants m where m.id = merchant_documents.merchant_id and m.owner_id = auth.uid()));
create trigger t_mdoc_updated before update on merchant_documents for each row execute function set_updated_at();

-- kolom admin-only tambahan pada merchants
create or replace function guard_merchant_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('antaraja.bypass', true) = 'on' then return new; end if;
  if not is_admin() then
    if new.status <> old.status or new.rating_avg <> old.rating_avg or new.rating_count <> old.rating_count
       or new.owner_id is distinct from old.owner_id or new.halal_verified <> old.halal_verified then
      raise exception 'Kolom ini hanya bisa diubah admin';
    end if;
    -- klaim halal berubah → verifikasi dicabut sampai admin cek ulang
    if new.is_halal <> old.is_halal then new.halal_verified := false; end if;
  end if;
  return new;
end $$;

-- pendaftaran merchant (+ dokumen)
create or replace function register_merchant(p jsonb)
returns merchants language plpgsql security definer set search_path = public as $$
declare m merchants%rowtype;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if exists (select 1 from merchants where owner_id = auth.uid()) then raise exception 'Anda sudah punya merchant'; end if;
  if coalesce(p->>'npwp_no', '') = '' then raise exception 'NPWP/NPWPD wajib diisi'; end if;
  if coalesce(p->>'owner_id_card_url', '') = '' then raise exception 'Unggah foto KTP pemilik'; end if;
  insert into merchants (owner_id, name, description, category, address, location, image_url, prep_minutes, opening_hours, is_halal)
  values (auth.uid(), p->>'name', p->>'description', coalesce(p->>'category', 'Makanan'), p->>'address',
    st_setsrid(st_makepoint((p->>'lng')::double precision, (p->>'lat')::double precision), 4326)::geography,
    p->>'image_url', coalesce((p->>'prep_minutes')::int, 15), coalesce(p->>'opening_hours', '08:00-22:00'),
    coalesce((p->>'is_halal')::boolean, false))
  returning * into m;
  insert into merchant_documents (merchant_id, owner_phone, npwp_no, npwp_url, license_no, license_url, halal_cert_no, halal_cert_url,
    owner_id_card_url, place_photo_url, bank_name, bank_account, bank_holder)
  values (m.id, p->>'owner_phone', p->>'npwp_no', p->>'npwp_url', p->>'license_no', p->>'license_url', p->>'halal_cert_no', p->>'halal_cert_url',
    p->>'owner_id_card_url', p->>'place_photo_url', p->>'bank_name', p->>'bank_account', p->>'bank_holder');
  perform set_config('antaraja.bypass', 'on', true);
  update profiles set role = 'merchant' where id = auth.uid() and role = 'customer';
  perform set_config('antaraja.bypass', 'off', true);
  return m;
end $$;

-- merchant memperbarui dokumen / mengajukan ulang (setelah ditolak) → status kembali 'pending'
create or replace function merchant_save_documents(p jsonb)
returns merchant_documents language plpgsql security definer set search_path = public as $$
declare m merchants%rowtype; d merchant_documents%rowtype;
begin
  select * into m from merchants where owner_id = auth.uid();
  if not found then raise exception 'Anda belum terdaftar sebagai merchant'; end if;
  insert into merchant_documents (merchant_id) values (m.id) on conflict (merchant_id) do nothing;
  update merchant_documents set
    owner_phone = coalesce(p->>'owner_phone', owner_phone),
    npwp_no = coalesce(p->>'npwp_no', npwp_no), npwp_url = coalesce(p->>'npwp_url', npwp_url),
    license_no = coalesce(p->>'license_no', license_no), license_url = coalesce(p->>'license_url', license_url),
    halal_cert_no = coalesce(p->>'halal_cert_no', halal_cert_no), halal_cert_url = coalesce(p->>'halal_cert_url', halal_cert_url),
    owner_id_card_url = coalesce(p->>'owner_id_card_url', owner_id_card_url), place_photo_url = coalesce(p->>'place_photo_url', place_photo_url),
    bank_name = coalesce(p->>'bank_name', bank_name), bank_account = coalesce(p->>'bank_account', bank_account), bank_holder = coalesce(p->>'bank_holder', bank_holder),
    submitted_at = case when m.status in ('rejected','pending') then now() else submitted_at end
  where merchant_id = m.id returning * into d;
  if p ? 'is_halal' then
    update merchants set is_halal = (p->>'is_halal')::boolean where id = m.id;   -- guard: verifikasi halal dicabut otomatis bila berubah
  end if;
  if m.status = 'rejected' then
    perform set_config('antaraja.bypass', 'on', true);
    update merchants set status = 'pending' where id = m.id;
    update merchant_documents set reviewed_at = null, review_note = null where merchant_id = m.id returning * into d;
    perform set_config('antaraja.bypass', 'off', true);
  end if;
  return d;
end $$;

-- admin meninjau pengajuan: setujui / tolak / tangguhkan + catatan + verifikasi halal
create or replace function admin_review_merchant(p_merchant uuid, p_status approval_status, p_note text default null, p_halal_verified boolean default null)
returns merchants language plpgsql security definer set search_path = public as $$
declare m merchants%rowtype;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  perform set_config('antaraja.bypass', 'on', true);
  update merchants set status = p_status,
    halal_verified = case when p_halal_verified is not null then (p_halal_verified and is_halal) else halal_verified end
  where id = p_merchant returning * into m;
  if not found then perform set_config('antaraja.bypass', 'off', true); raise exception 'Merchant tidak ditemukan'; end if;
  insert into merchant_documents (merchant_id) values (p_merchant) on conflict (merchant_id) do nothing;
  update merchant_documents set reviewed_at = now(), reviewed_by = auth.uid(), review_note = p_note where merchant_id = p_merchant;
  perform set_config('antaraja.bypass', 'off', true);
  return m;
end $$;

drop function if exists nearby_merchants(double precision, double precision, numeric, text);
create or replace function nearby_merchants(p_lat double precision, p_lng double precision, p_radius_km numeric default 15, p_q text default null, p_halal boolean default null)
returns table(id uuid, name text, description text, category text, address text, image_url text, is_open boolean,
  rating_avg numeric, rating_count int, prep_minutes int, lat double precision, lng double precision, distance_km numeric, delivery_fee bigint,
  is_halal boolean, halal_verified boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.name, m.description, m.category, m.address, m.image_url, m.is_open, m.rating_avg, m.rating_count, m.prep_minutes,
    m.lat, m.lng,
    round((st_distance(m.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0)::numeric, 2),
    (select fare from calc_fare('food'::service_type, (greatest(0.5, st_distance(m.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0 * 1.3))::numeric)),
    m.is_halal, m.halal_verified
  from merchants m
  where m.status = 'approved' and m.location is not null
    and st_dwithin(m.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
    and (p_halal is null or m.is_halal = p_halal)
    and (p_q is null or p_q = '' or m.name ilike '%' || p_q || '%' or m.category ilike '%' || p_q || '%'
         or exists (select 1 from menu_items mi where mi.merchant_id = m.id and mi.name ilike '%' || p_q || '%'))
  order by 13 limit 50
$$;

-- ---------- B. Tiket aduan & CS online ----------
create sequence if not exists ticket_seq;
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  user_id uuid not null references profiles(id) on delete cascade,
  role user_role not null default 'customer',
  order_id uuid references orders(id) on delete set null,
  category text not null default 'other' check (category in ('order','payment','driver','merchant','account','app','safety','other')),
  subject text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_user','resolved','closed')),
  assigned_to uuid references profiles(id) on delete set null,
  attachments text[] not null default '{}',
  last_message_at timestamptz not null default now(),
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  rating int check (rating between 1 and 5),
  rating_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tickets_user_idx on tickets (user_id, created_at desc);
create index if not exists tickets_status_idx on tickets (status, priority, last_message_at desc);
create table if not exists ticket_messages (
  id bigserial primary key,
  ticket_id uuid not null references tickets(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  sender_role text not null default 'user' check (sender_role in ('user','cs','system')),
  body text not null,
  attachment_url text,
  is_internal boolean not null default false,      -- catatan internal CS (tak terlihat pengguna)
  created_at timestamptz not null default now()
);
create index if not exists ticket_messages_idx on ticket_messages (ticket_id, created_at);
alter table tickets enable row level security;
alter table ticket_messages enable row level security;
create policy tickets_select on tickets for select to authenticated using (user_id = auth.uid() or is_admin());
create policy tmsg_select on ticket_messages for select to authenticated using (
  (not is_internal or is_admin()) and exists (select 1 from tickets t where t.id = ticket_messages.ticket_id and (t.user_id = auth.uid() or is_admin())));
create trigger t_tickets_updated before update on tickets for each row execute function set_updated_at();
alter publication supabase_realtime add table tickets, ticket_messages;

create or replace function create_ticket(p jsonb)
returns tickets language plpgsql security definer set search_path = public as $$
declare t tickets%rowtype; v_role user_role; v_cat text := coalesce(p->>'category', 'other'); v_order uuid := nullif(p->>'order_id', '')::uuid;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if length(trim(coalesce(p->>'subject', ''))) < 4 then raise exception 'Judul aduan minimal 4 huruf'; end if;
  v_role := coalesce(nullif(p->>'role', '')::user_role, (select role from profiles where id = auth.uid()), 'customer');
  if v_order is not null and not exists (select 1 from orders o where o.id = v_order and (o.customer_id = auth.uid() or o.driver_id = auth.uid() or owns_merchant(o.merchant_id))) then
    raise exception 'Order bukan milik Anda';
  end if;
  insert into tickets (code, user_id, role, order_id, category, subject, description, priority, attachments)
  values ('TK' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || lpad(nextval('ticket_seq')::text, 4, '0'),
    auth.uid(), v_role, v_order, v_cat, trim(p->>'subject'), p->>'description',
    case when v_cat = 'safety' then 'urgent' when coalesce(p->>'priority','') in ('low','normal','high','urgent') then p->>'priority' else 'normal' end,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'attachments', '[]'::jsonb)) x), '{}'))
  returning * into t;
  insert into ticket_messages (ticket_id, sender_id, sender_role, body) values (t.id, auth.uid(), 'user', coalesce(nullif(p->>'description', ''), trim(p->>'subject')));
  insert into ticket_messages (ticket_id, sender_role, body) values (t.id, 'system',
    case when v_cat = 'safety' then 'Laporan keamanan diterima dengan prioritas DARURAT. CS akan menghubungi Anda segera.'
         else 'Tiket ' || t.code || ' diterima. CS online membalas rata-rata < 15 menit (07.00–22.00 WIB).' end);
  return t;
end $$;

create or replace function ticket_reply(p_ticket uuid, p_body text, p_attachment text default null, p_internal boolean default false)
returns ticket_messages language plpgsql security definer set search_path = public as $$
declare t tickets%rowtype; m ticket_messages%rowtype; v_admin boolean := is_admin();
begin
  select * into t from tickets where id = p_ticket for update;
  if not found or not (t.user_id = auth.uid() or v_admin) then raise exception 'Tiket tidak ditemukan'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 and p_attachment is null then raise exception 'Pesan kosong'; end if;
  if t.status = 'closed' and not v_admin then raise exception 'Tiket sudah ditutup. Buat tiket baru bila masih ada kendala.'; end if;
  insert into ticket_messages (ticket_id, sender_id, sender_role, body, attachment_url, is_internal)
  values (t.id, auth.uid(), case when v_admin then 'cs' else 'user' end, coalesce(nullif(trim(p_body), ''), '📎 Lampiran'), p_attachment, v_admin and p_internal)
  returning * into m;
  if v_admin then
    if not p_internal then
      update tickets set last_message_at = now(), first_response_at = coalesce(first_response_at, now()),
        assigned_to = coalesce(assigned_to, auth.uid()),
        status = case when status in ('open','in_progress') then 'waiting_user' else status end
      where id = t.id;
    end if;
  else
    update tickets set last_message_at = now(),
      status = case when status in ('waiting_user','resolved') then 'in_progress' when status = 'open' then 'open' else status end,
      resolved_at = case when status = 'resolved' then null else resolved_at end
    where id = t.id;
  end if;
  return m;
end $$;

create or replace function admin_update_ticket(p_ticket uuid, p_status text default null, p_priority text default null, p_assign_to uuid default null, p_note text default null)
returns tickets language plpgsql security definer set search_path = public as $$
declare t tickets%rowtype; v_label text;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  select * into t from tickets where id = p_ticket for update;
  if not found then raise exception 'Tiket tidak ditemukan'; end if;
  update tickets set
    status = coalesce(p_status, status), priority = coalesce(p_priority, priority),
    assigned_to = coalesce(p_assign_to, assigned_to),
    resolved_at = case when p_status = 'resolved' then now() when p_status in ('open','in_progress','waiting_user') then null else resolved_at end,
    closed_at = case when p_status = 'closed' then now() else closed_at end,
    first_response_at = coalesce(first_response_at, case when p_status is not null then now() end)
  where id = t.id returning * into t;
  if p_status is not null then
    v_label := case p_status when 'open' then 'Dibuka' when 'in_progress' then 'Sedang ditangani CS' when 'waiting_user' then 'Menunggu balasan Anda'
      when 'resolved' then 'Ditandai selesai — balas bila masih ada kendala' when 'closed' then 'Ditutup' else p_status end;
    insert into ticket_messages (ticket_id, sender_role, body) values (t.id, 'system', 'Status tiket: ' || v_label || coalesce(' · ' || nullif(p_note, ''), ''));
  end if;
  return t;
end $$;

create or replace function close_ticket(p_ticket uuid, p_rating int default null, p_comment text default null)
returns tickets language plpgsql security definer set search_path = public as $$
declare t tickets%rowtype;
begin
  update tickets set status = 'closed', closed_at = now(), resolved_at = coalesce(resolved_at, now()),
    rating = coalesce(p_rating, rating), rating_comment = coalesce(p_comment, rating_comment)
  where id = p_ticket and user_id = auth.uid() returning * into t;
  if not found then raise exception 'Tiket tidak ditemukan'; end if;
  insert into ticket_messages (ticket_id, sender_role, body) values (t.id, 'system', 'Tiket ditutup oleh pengguna' || case when p_rating is not null then ' · penilaian ' || p_rating || '/5' else '' end);
  return t;
end $$;

-- ---------- C. Log aktivitas (audit) ----------
create table if not exists audit_logs (
  id bigserial primary key,
  actor_id uuid,
  actor_name text,
  actor_role user_role,
  action text not null,           -- contoh: order.created, merchant.approved, wallet.topup
  entity text not null,           -- orders, merchants, drivers, profiles, wallets, pricing, promos, settings, tickets, sos
  entity_id text,
  summary text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx on audit_logs (entity, entity_id);
create index if not exists audit_logs_actor_idx on audit_logs (actor_id, created_at desc);
alter table audit_logs enable row level security;
create policy audit_select on audit_logs for select to authenticated using (is_admin());
alter publication supabase_realtime add table audit_logs;

create or replace function log_activity(p_action text, p_entity text, p_entity_id text, p_summary text, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_name text; v_role user_role;
begin
  if v_uid is not null then select full_name, role into v_name, v_role from profiles where id = v_uid; end if;
  insert into audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id, summary, detail)
  values (v_uid, coalesce(v_name, case when v_uid is null then 'Sistem' else 'Pengguna' end), v_role, p_action, p_entity, p_entity_id, p_summary, p_detail);
end $$;

create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare n jsonb := to_jsonb(new); o jsonb := to_jsonb(old); v_action text; v_summary text; v_id text; v_detail jsonb;
begin
  if TG_OP = 'DELETE' and TG_TABLE_NAME not in ('pricing','pricing_sessions','promos','app_settings','competitor_prices') then return null; end if;
  v_id := coalesce(n->>'id', o->>'id', n->>'code', o->>'code', n->>'key', o->>'key', n->>'service', o->>'service', n->>'user_id', o->>'user_id');
  case TG_TABLE_NAME
    when 'orders' then
      if TG_OP = 'INSERT' then v_action := 'order.created'; v_summary := 'Pesanan ' || new.code || ' (' || new.service || ') dibuat · ' || new.total;
      elsif new.status <> old.status then v_action := 'order.' || new.status; v_summary := 'Pesanan ' || new.code || ' → ' || new.status;
      elsif new.driver_id is distinct from old.driver_id and new.driver_id is not null then v_action := 'order.assigned'; v_summary := 'Pesanan ' || new.code || ' diambil driver';
      elsif new.merchant_status is distinct from old.merchant_status then v_action := 'order.merchant_' || new.merchant_status; v_summary := 'Merchant ' || new.merchant_status || ' pesanan ' || new.code;
      else return null; end if;
      v_detail := jsonb_build_object('code', new.code, 'service', new.service, 'status', new.status, 'total', new.total, 'customer_id', new.customer_id, 'driver_id', new.driver_id);
    when 'drivers' then
      if TG_OP = 'UPDATE' and new.status <> old.status then v_action := 'driver.' || new.status; v_summary := 'Status driver → ' || new.status;
      elsif TG_OP = 'UPDATE' and new.is_online <> old.is_online then v_action := case when new.is_online then 'driver.online' else 'driver.offline' end; v_summary := case when new.is_online then 'Driver online' else 'Driver offline' end;
      elsif TG_OP = 'INSERT' then v_action := 'driver.registered'; v_summary := 'Pendaftaran driver baru · ' || new.vehicle_plate;
      elsif TG_OP = 'UPDATE' and new.last_selfie_at is distinct from old.last_selfie_at then v_action := 'driver.selfie'; v_summary := 'Verifikasi wajah driver';
      else return null; end if;
      v_detail := jsonb_build_object('driver_id', new.id, 'plate', new.vehicle_plate, 'status', new.status);
    when 'merchants' then
      if TG_OP = 'INSERT' then v_action := 'merchant.registered'; v_summary := 'Pengajuan merchant baru: ' || new.name;
      elsif new.status <> old.status then v_action := 'merchant.' || new.status; v_summary := 'Merchant ' || new.name || ' → ' || new.status;
      elsif new.halal_verified <> old.halal_verified then v_action := 'merchant.halal_' || case when new.halal_verified then 'verified' else 'unverified' end; v_summary := 'Halal ' || new.name || case when new.halal_verified then ' terverifikasi' else ' dicabut' end;
      elsif new.is_halal <> old.is_halal then v_action := 'merchant.halal_claim'; v_summary := new.name || case when new.is_halal then ' mengklaim halal' else ' non-halal' end;
      elsif new.is_open <> old.is_open then v_action := case when new.is_open then 'merchant.open' else 'merchant.close' end; v_summary := new.name || case when new.is_open then ' buka' else ' tutup' end;
      else return null; end if;
      v_detail := jsonb_build_object('merchant_id', new.id, 'name', new.name, 'status', new.status);
    when 'merchant_documents' then
      if TG_OP = 'UPDATE' and new.submitted_at <> old.submitted_at then v_action := 'merchant.resubmitted'; v_summary := 'Merchant mengajukan ulang dokumen';
      elsif TG_OP = 'UPDATE' and new.reviewed_at is distinct from old.reviewed_at and new.reviewed_at is not null then v_action := 'merchant.reviewed'; v_summary := 'Tinjauan merchant: ' || coalesce(new.review_note, '(tanpa catatan)');
      else return null; end if;
      v_id := new.merchant_id::text; v_detail := jsonb_build_object('merchant_id', new.merchant_id);
    when 'profiles' then
      if TG_OP = 'INSERT' then v_action := 'user.registered'; v_summary := 'Akun baru: ' || new.full_name;
      elsif new.role <> old.role then v_action := 'user.role'; v_summary := new.full_name || ' role ' || old.role || ' → ' || new.role;
      elsif new.is_active <> old.is_active then v_action := case when new.is_active then 'user.activated' else 'user.deactivated' end; v_summary := new.full_name || case when new.is_active then ' diaktifkan' else ' dinonaktifkan' end;
      else return null; end if;
      v_detail := jsonb_build_object('user_id', new.id, 'role', new.role);
    when 'wallet_transactions' then
      v_action := 'wallet.' || new.type; v_summary := new.note || ' · ' || new.amount; v_id := new.user_id::text;
      v_detail := jsonb_build_object('user_id', new.user_id, 'amount', new.amount, 'order_id', new.order_id);
    when 'topup_requests' then
      if TG_OP = 'INSERT' then v_action := 'topup.requested'; v_summary := 'Permintaan top up ' || new.amount;
      elsif new.status <> old.status then v_action := 'topup.' || new.status; v_summary := 'Top up ' || new.amount || ' → ' || new.status; else return null; end if;
      v_detail := jsonb_build_object('user_id', new.user_id, 'amount', new.amount);
    when 'withdrawal_requests' then
      if TG_OP = 'INSERT' then v_action := 'withdrawal.requested'; v_summary := 'Permintaan tarik saldo ' || new.amount;
      elsif new.status <> old.status then v_action := 'withdrawal.' || new.status; v_summary := 'Tarik saldo ' || new.amount || ' → ' || new.status; else return null; end if;
      v_detail := jsonb_build_object('user_id', new.user_id, 'amount', new.amount);
    when 'payments' then
      if TG_OP = 'UPDATE' and new.status <> old.status then v_action := 'payment.' || new.status; v_summary := 'Pembayaran ' || new.external_id || ' ' || new.amount || ' → ' || new.status; v_id := new.external_id;
      elsif TG_OP = 'INSERT' then v_action := 'payment.created'; v_summary := 'Pembayaran ' || new.method || ' ' || new.amount; v_id := new.external_id;
      else return null; end if;
      v_detail := jsonb_build_object('user_id', new.user_id, 'amount', new.amount, 'method', new.method, 'provider', new.provider);
    when 'tickets' then
      if TG_OP = 'INSERT' then v_action := 'ticket.created'; v_summary := 'Tiket ' || new.code || ' [' || new.category || '] ' || new.subject;
      elsif new.status <> old.status then v_action := 'ticket.' || new.status; v_summary := 'Tiket ' || new.code || ' → ' || new.status;
      elsif new.assigned_to is distinct from old.assigned_to then v_action := 'ticket.assigned'; v_summary := 'Tiket ' || new.code || ' ditugaskan';
      elsif new.priority <> old.priority then v_action := 'ticket.priority'; v_summary := 'Tiket ' || new.code || ' prioritas → ' || new.priority;
      else return null; end if;
      v_detail := jsonb_build_object('code', new.code, 'user_id', new.user_id, 'category', new.category, 'priority', new.priority);
    when 'sos_alerts' then
      if TG_OP = 'INSERT' then v_action := 'sos.triggered'; v_summary := '🚨 SOS dari ' || new.role || coalesce(' · ' || new.note, '');
      elsif new.status <> old.status then v_action := 'sos.' || new.status; v_summary := 'SOS → ' || new.status; else return null; end if;
      v_detail := jsonb_build_object('user_id', new.user_id, 'order_id', new.order_id, 'lat', new.lat, 'lng', new.lng);
    when 'pricing' then v_action := 'pricing.changed'; v_summary := 'Tarif ' || coalesce(n->>'service', o->>'service') || ' diubah'; v_detail := jsonb_build_object('before', o, 'after', n);
    when 'pricing_sessions' then v_action := 'pricing.session_' || lower(TG_OP); v_summary := 'Sesi harga ' || coalesce(n->>'name', o->>'name'); v_detail := jsonb_build_object('before', o, 'after', n);
    when 'promos' then v_action := 'promo.' || lower(TG_OP); v_summary := 'Promo ' || coalesce(n->>'code', o->>'code') || ' ' || lower(TG_OP); v_detail := jsonb_build_object('before', o, 'after', n);
    when 'app_settings' then v_action := 'settings.changed'; v_summary := 'Pengaturan ' || coalesce(n->>'key', o->>'key') || ' diubah'; v_detail := jsonb_build_object('before', o->'value', 'after', n->'value');
    when 'competitor_prices' then v_action := 'pricing.competitor_' || lower(TG_OP); v_summary := 'Harga kompetitor ' || coalesce(n->>'competitor', o->>'competitor') || ' ' || lower(TG_OP); v_detail := coalesce(n, o);
    else return null;
  end case;
  perform log_activity(v_action, TG_TABLE_NAME, v_id, v_summary, v_detail);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['orders','drivers','merchants','merchant_documents','profiles','wallet_transactions','topup_requests','withdrawal_requests','payments','tickets','pricing','pricing_sessions','promos','app_settings','competitor_prices'] loop
    execute format('drop trigger if exists t_audit_%s on %I', t, t);
    execute format('create trigger t_audit_%s after insert or update or delete on %I for each row execute function audit_trigger()', t, t);
  end loop;
end $$;

-- ---------- D. Keamanan ----------
alter table profiles
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;
alter table drivers
  add column if not exists last_selfie_at timestamptz,
  add column if not exists last_selfie_url text;
alter table orders add column if not exists share_token text;
update orders set share_token = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 18) where share_token is null;
alter table orders alter column share_token set default substr(md5(random()::text || clock_timestamp()::text), 1, 18);
create unique index if not exists orders_share_token_idx on orders (share_token);

create table if not exists order_pins (
  order_id uuid primary key references orders(id) on delete cascade,
  pin text not null,
  created_at timestamptz not null default now()
);
alter table order_pins enable row level security;
create policy pins_customer on order_pins for select to authenticated
  using (exists (select 1 from orders o where o.id = order_pins.order_id and o.customer_id = auth.uid()));

create table if not exists sos_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role user_role not null,
  order_id uuid references orders(id) on delete set null,
  ticket_id uuid references tickets(id) on delete set null,
  lat double precision, lng double precision,
  note text,
  status text not null default 'open' check (status in ('open','handled','false_alarm')),
  handled_by uuid references profiles(id) on delete set null,
  handled_at timestamptz,
  handle_note text,
  created_at timestamptz not null default now()
);
alter table sos_alerts enable row level security;
create policy sos_select on sos_alerts for select to authenticated using (user_id = auth.uid() or is_admin());
alter publication supabase_realtime add table sos_alerts;
create trigger t_audit_sos_alerts after insert or update on sos_alerts for each row execute function audit_trigger();

insert into app_settings (key, value) values ('driver_selfie_hours', '20'), ('pin_services', '["ride_motor","ride_car"]')
on conflict (key) do nothing;

-- guard driver: kolom selfie hanya lewat RPC
create or replace function guard_driver_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('antaraja.bypass', true) = 'on' then return new; end if;
  if not is_admin() then
    if new.status <> old.status or new.rating_avg <> old.rating_avg or new.rating_count <> old.rating_count
       or new.total_trips <> old.total_trips or new.last_selfie_at is distinct from old.last_selfie_at then
      raise exception 'Kolom ini hanya bisa diubah admin';
    end if;
  end if;
  return new;
end $$;

-- verifikasi wajah (selfie) sebelum online
create or replace function driver_selfie_check(p_url text)
returns drivers language plpgsql security definer set search_path = public as $$
declare d drivers%rowtype;
begin
  if coalesce(p_url, '') = '' then raise exception 'Foto selfie wajib'; end if;
  perform set_config('antaraja.bypass', 'on', true);
  update drivers set last_selfie_at = now(), last_selfie_url = p_url where id = auth.uid() returning * into d;
  perform set_config('antaraja.bypass', 'off', true);
  if not found then raise exception 'Belum terdaftar sebagai driver'; end if;
  return d;
end $$;

create or replace function driver_set_online(p_online boolean, p_lat double precision default null, p_lng double precision default null)
returns drivers language plpgsql security definer set search_path = public as $$
declare d drivers%rowtype; v_bal bigint; v_hours numeric := setting_num('driver_selfie_hours', 20);
begin
  select * into d from drivers where id = auth.uid();
  if not found then raise exception 'Belum terdaftar sebagai driver'; end if;
  if p_online then
    if d.status <> 'approved' then raise exception 'Akun driver belum disetujui admin'; end if;
    select balance into v_bal from wallets where user_id = d.id;
    if coalesce(v_bal, 0) < -500000 then raise exception 'Saldo minus melebihi batas (Rp500.000). Top up saldo dulu.'; end if;
    if p_lat is null and d.location is null then raise exception 'Lokasi belum tersedia, aktifkan GPS'; end if;
    if v_hours > 0 and (d.last_selfie_at is null or d.last_selfie_at < now() - (v_hours || ' hours')::interval) then
      raise exception 'SELFIE_REQUIRED';
    end if;
  end if;
  perform set_config('antaraja.bypass', 'on', true);
  update drivers set is_online = p_online, last_seen_at = now(),
    location = case when p_lat is not null then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography else location end
  where id = d.id returning * into d;
  perform set_config('antaraja.bypass', 'off', true);
  return d;
end $$;

-- PIN penjemputan: dibuat saat order ride dibuat (lihat trigger), diperiksa saat driver mulai perjalanan
create or replace function make_order_pin() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_services jsonb := coalesce((select value from app_settings where key = 'pin_services'), '["ride_motor","ride_car"]'::jsonb);
begin
  if v_services ? new.service::text then
    insert into order_pins (order_id, pin) values (new.id, lpad((floor(random() * 10000))::int::text, 4, '0')) on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists t_order_pin on orders;
create trigger t_order_pin after insert on orders for each row execute function make_order_pin();

drop function if exists driver_update_order_status(uuid, order_status);
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
    v_extra_driver := o.tip + o.extras_total;
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
      v_fee := v_comm + o.platform_fee;
      if v_fee > 0 then perform wallet_apply(o.driver_id, 'fee', -v_fee, o.id, 'Potongan platform ' || o.code); end if;
      if o.tip > 0 then perform wallet_apply(o.driver_id, 'earning', o.tip, o.id, 'Tip dari pelanggan ' || o.code); end if;
    end if;
    perform set_config('antaraja.bypass', 'on', true);
    update drivers set total_trips = total_trips + 1 where id = o.driver_id;
    perform set_config('antaraja.bypass', 'off', true);
  end if;
  return o;
end $$;

-- SOS: alarm darurat → tiket prioritas darurat otomatis
create or replace function sos_trigger(p_order uuid default null, p_lat double precision default null, p_lng double precision default null, p_note text default null)
returns sos_alerts language plpgsql security definer set search_path = public as $$
declare a sos_alerts%rowtype; t tickets%rowtype; v_role user_role; v_code text;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  select role into v_role from profiles where id = auth.uid();
  if p_order is not null then select code into v_code from orders where id = p_order and (customer_id = auth.uid() or driver_id = auth.uid()); end if;
  t := create_ticket(jsonb_build_object('category', 'safety', 'subject', '🚨 SOS ' || coalesce(v_code, 'tanpa order'),
        'description', coalesce(p_note, 'Tombol darurat ditekan') || case when p_lat is not null then ' · lokasi ' || round(p_lat::numeric, 5) || ',' || round(p_lng::numeric, 5) else '' end,
        'order_id', case when v_code is not null then p_order::text end));
  insert into sos_alerts (user_id, role, order_id, ticket_id, lat, lng, note)
  values (auth.uid(), coalesce(v_role, 'customer'), case when v_code is not null then p_order end, t.id, p_lat, p_lng, p_note) returning * into a;
  return a;
end $$;

create or replace function admin_handle_sos(p_id uuid, p_status text, p_note text default null)
returns sos_alerts language plpgsql security definer set search_path = public as $$
declare a sos_alerts%rowtype;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  update sos_alerts set status = p_status, handled_by = auth.uid(), handled_at = now(), handle_note = p_note where id = p_id returning * into a;
  if a.ticket_id is not null then perform admin_update_ticket(a.ticket_id, case when p_status = 'false_alarm' then 'closed' else 'in_progress' end, null, auth.uid(), coalesce(p_note, 'SOS ' || p_status)); end if;
  return a;
end $$;

-- kontak darurat
create or replace function set_emergency_contact(p_name text, p_phone text)
returns void language sql security definer set search_path = public as $$
  update profiles set emergency_contact_name = nullif(trim(p_name), ''), emergency_contact_phone = nullif(regexp_replace(p_phone, '[^0-9+]', '', 'g'), '') where id = auth.uid();
$$;

-- Bagikan perjalanan: halaman publik dengan token (tanpa login)
create or replace function shared_order(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', o.code, 'service', o.service, 'status', o.status, 'created_at', o.created_at, 'started_at', o.started_at, 'completed_at', o.completed_at,
    'pickup_address', o.pickup_address, 'pickup_lat', o.pickup_lat, 'pickup_lng', o.pickup_lng,
    'dropoff_address', o.dropoff_address, 'dropoff_lat', o.dropoff_lat, 'dropoff_lng', o.dropoff_lng,
    'route_geometry', o.route_geometry, 'distance_km', o.distance_km, 'duration_min', o.duration_min,
    'customer_name', split_part(c.full_name, ' ', 1),
    'driver', case when d.id is null then null else jsonb_build_object('name', p.full_name, 'avatar_url', p.avatar_url, 'plate', d.vehicle_plate,
      'vehicle_type', d.vehicle_type, 'vehicle_brand', d.vehicle_brand, 'vehicle_color', d.vehicle_color, 'rating', d.rating_avg,
      'lat', case when o.status in ('accepted','arrived','in_progress') then d.lat end, 'lng', case when o.status in ('accepted','arrived','in_progress') then d.lng end, 'heading', d.heading) end)
  from orders o
  join profiles c on c.id = o.customer_id
  left join drivers d on d.id = o.driver_id
  left join profiles p on p.id = d.id
  where o.share_token = p_token and length(p_token) >= 12
$$;

-- ---------- E. Promo bergambar & sering dipesan ----------
alter table promos
  add column if not exists title text,
  add column if not exists image_url text,
  add column if not exists sort_order int not null default 0;
update promos set title = case code when 'ANTARBARU' then 'Diskon 50% Pengguna Baru' when 'HEMAT5' then 'Hemat Rp5.000' when 'MAKANENAK' then 'AntarFood Diskon 20%' else code end where title is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promo-images', 'promo-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "promo images public read" on storage.objects for select using (bucket_id = 'promo-images');
create policy "promo images admin write" on storage.objects for insert to authenticated with check (bucket_id = 'promo-images' and is_admin());
create policy "promo images admin update" on storage.objects for update to authenticated using (bucket_id = 'promo-images' and is_admin());
create policy "promo images admin delete" on storage.objects for delete to authenticated using (bucket_id = 'promo-images' and is_admin());

create or replace function customer_frequent(p_limit int default 6)
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
        where o.customer_id = auth.uid() and o.status = 'completed' and o.service in ('ride_motor','ride_car','send','shop')
        group by o.service, o.dropoff_address order by count(*) desc, max(o.created_at) desc limit p_limit) s), '[]'::jsonb),
    'services', coalesce((select jsonb_object_agg(service, cnt) from (select service, count(*) cnt from orders where customer_id = auth.uid() and status = 'completed' group by service) s), '{}'::jsonb),
    'recent', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('address', o.dropoff_address, 'lat', o.dropoff_lat, 'lng', o.dropoff_lng, 'service', o.service) x
        from (select distinct on (dropoff_address) * from orders where customer_id = auth.uid() and service <> 'food' order by dropoff_address, created_at desc) o
        order by o.created_at desc limit 5) s), '[]'::jsonb)
  )
$$;

create or replace function cs_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select count(*) from tickets where status = 'open'),
    'in_progress', (select count(*) from tickets where status in ('in_progress','waiting_user')),
    'resolved', (select count(*) from tickets where status in ('resolved','closed') and coalesce(closed_at, resolved_at) > now() - interval '7 days'),
    'urgent', (select count(*) from tickets where priority = 'urgent' and status not in ('resolved','closed')),
    'avg_first_response_min', (select round(avg(extract(epoch from (first_response_at - created_at)) / 60)::numeric, 1) from tickets where first_response_at is not null and created_at > now() - interval '30 days'),
    'avg_rating', (select round(avg(rating)::numeric, 2) from tickets where rating is not null),
    'sos_open', (select count(*) from sos_alerts where status = 'open')
  ) where is_admin();
$$;

-- ---------- Grants ----------
grant execute on function register_merchant(jsonb) to authenticated;
grant execute on function merchant_save_documents(jsonb) to authenticated;
grant execute on function admin_review_merchant(uuid, approval_status, text, boolean) to authenticated;
grant execute on function nearby_merchants(double precision, double precision, numeric, text, boolean) to anon, authenticated;
grant execute on function create_ticket(jsonb) to authenticated;
grant execute on function ticket_reply(uuid, text, text, boolean) to authenticated;
grant execute on function admin_update_ticket(uuid, text, text, uuid, text) to authenticated;
grant execute on function close_ticket(uuid, int, text) to authenticated;
grant execute on function cs_stats() to authenticated;
revoke all on function log_activity(text, text, text, text, jsonb) from authenticated, anon, public;
revoke all on function audit_trigger() from authenticated, anon, public;
revoke all on function make_order_pin() from authenticated, anon, public;
grant execute on function driver_selfie_check(text) to authenticated;
grant execute on function driver_set_online(boolean, double precision, double precision) to authenticated;
grant execute on function driver_update_order_status(uuid, order_status, text) to authenticated;
grant execute on function sos_trigger(uuid, double precision, double precision, text) to authenticated;
grant execute on function admin_handle_sos(uuid, text, text) to authenticated;
grant execute on function set_emergency_contact(text, text) to authenticated;
grant execute on function shared_order(text) to anon, authenticated;
grant execute on function customer_frequent(int) to authenticated;
