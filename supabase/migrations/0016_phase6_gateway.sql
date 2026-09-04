-- ============================================================================
-- Tahap 6 (d): Payment gateway plug-and-play (Midtrans Snap)
--   • gateway_secrets: server key/client key/mode disimpan admin dari panel (RLS tanpa policy → hanya service role/edge function yang bisa baca)
--   • pengaturan publik: metode yang diaktifkan, mode, client key (untuk Snap.js) — dibaca aplikasi lewat gateway_public_config()
--   • admin_gateway_status(): status tersamar (tanpa membocorkan key), statistik pembayaran, webhook terakhir
--   • payment_settle: catat webhook terakhir + notifikasi ke pengguna
-- ============================================================================
create table if not exists gateway_secrets (
  provider text primary key,                 -- 'midtrans'
  server_key text,
  client_key text,
  is_production boolean not null default false,
  merchant_id text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table gateway_secrets enable row level security;   -- sengaja tanpa policy: hanya service_role
revoke all on gateway_secrets from anon, authenticated;

insert into app_settings (key, value) values
  ('pg_provider', '"midtrans"'), ('pg_methods', '["gopay","shopeepay","qris","bank_transfer","ovo","dana"]'),
  ('pg_topup_min', '10000'), ('pg_topup_max', '10000000'), ('pg_last_webhook_at', 'null')
on conflict (key) do nothing;

-- konfigurasi publik untuk aplikasi (tanpa server key)
create or replace function gateway_public_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'provider', coalesce((select value #>> '{}' from app_settings where key = 'pg_provider'), 'midtrans'),
    'methods', coalesce((select value from app_settings where key = 'pg_methods'), '[]'::jsonb),
    'topup_min', setting_num('pg_topup_min', 10000), 'topup_max', setting_num('pg_topup_max', 10000000),
    'configured', exists (select 1 from gateway_secrets where provider = 'midtrans' and coalesce(server_key, '') <> ''),
    'is_production', coalesce((select is_production from gateway_secrets where provider = 'midtrans'), false),
    'client_key', (select client_key from gateway_secrets where provider = 'midtrans'));
$$;
grant execute on function gateway_public_config() to anon, authenticated;

create or replace function admin_set_gateway(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
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
grant execute on function admin_set_gateway(jsonb) to authenticated;

create or replace function admin_gateway_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare g gateway_secrets%rowtype; v jsonb;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  select * into g from gateway_secrets where provider = 'midtrans';
  v := jsonb_build_object(
    'provider', 'midtrans',
    'configured', coalesce(g.server_key, '') <> '',
    'server_key_masked', case when coalesce(g.server_key, '') = '' then null else left(g.server_key, 13) || '••••' || right(g.server_key, 4) end,
    'client_key', g.client_key, 'is_production', coalesce(g.is_production, false), 'merchant_id', g.merchant_id,
    'updated_at', g.updated_at, 'updated_by', (select full_name from profiles where id = g.updated_by),
    'methods', coalesce((select value from app_settings where key = 'pg_methods'), '[]'::jsonb),
    'topup_min', setting_num('pg_topup_min', 10000), 'topup_max', setting_num('pg_topup_max', 10000000),
    'last_webhook_at', (select value from app_settings where key = 'pg_last_webhook_at'),
    'stats', (select jsonb_build_object('total', count(*), 'settlement', count(*) filter (where status = 'settlement'), 'pending', count(*) filter (where status = 'pending'),
      'failed', count(*) filter (where status in ('cancel','deny','expire','failure')), 'amount_settled', coalesce(sum(amount) filter (where status = 'settlement'), 0),
      'simulated', count(*) filter (where provider = 'simulated'), 'last_7d', count(*) filter (where created_at > now() - interval '7 days')) from payments),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'external_id', p.external_id, 'amount', p.amount, 'method', p.method, 'provider', p.provider, 'status', p.status, 'purpose', p.purpose, 'created_at', p.created_at, 'user', pr.full_name) order by p.created_at desc)
      from (select * from payments order by created_at desc limit 30) p left join profiles pr on pr.id = p.user_id), '[]'::jsonb));
  return v;
end $$;
grant execute on function admin_gateway_status() to authenticated;

-- payment_settle: catat waktu webhook terakhir + notifikasi pengguna
create or replace function payment_settle(p_external_id text, p_status text, p_raw jsonb default null)
returns payments language plpgsql security definer set search_path = public as $$
declare p payments%rowtype;
begin
  select * into p from payments where external_id = p_external_id for update;
  if not found then raise exception 'Payment tidak ditemukan'; end if;
  if p.provider <> 'simulated' then
    insert into app_settings (key, value) values ('pg_last_webhook_at', to_jsonb(now())) on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  if p.status = 'settlement' then return p; end if;
  update payments set status = p_status, raw = coalesce(p_raw, raw) where id = p.id returning * into p;
  if p_status = 'settlement' then
    perform wallet_apply(p.user_id, 'topup', p.amount, p.order_id, 'Top up via ' || p.method || ' (' || p.provider || ')', p.external_id);
    insert into notifications (user_id, kind, title, body, data) values (p.user_id, 'system', 'Top up berhasil', 'Rp' || to_char(p.amount, 'FM999G999G999') || ' masuk ke AntarPay via ' || p.method, jsonb_build_object('payment_id', p.id));
  elsif p_status in ('cancel','deny','expire','failure') then
    insert into notifications (user_id, kind, title, body, data) values (p.user_id, 'system', 'Pembayaran ' || p_status, 'Transaksi ' || p.external_id || ' tidak selesai. Coba lagi dengan metode lain.', jsonb_build_object('payment_id', p.id));
  end if;
  return p;
end $$;
