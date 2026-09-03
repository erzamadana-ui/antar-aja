-- =====================================================================
-- Pengerasan hak akses fungsi (security hardening)
-- Postgres memberi EXECUTE ke PUBLIC untuk setiap fungsi baru — artinya
-- peran `anon` (tanpa login) bisa memanggil RPC admin. Di sini semua grant
-- PUBLIC dicabut untuk fungsi aplikasi, lalu diberikan eksplisit.
-- =====================================================================
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop  -- lewati fungsi ekstensi (PostGIS)
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to postgres, service_role', r.sig);
    if r.proname not in ('wallet_apply','handle_new_user','auto_confirm_email','guard_profile_update','guard_driver_update','guard_merchant_update','set_updated_at') then
      execute format('grant execute on function %s to authenticated', r.sig);
    else
      execute format('revoke all on function %s from authenticated', r.sig);
    end if;
  end loop;
end $$;

-- Fungsi yang boleh dipanggil tanpa login (landing web)
grant execute on function estimate_fare(service_type, double precision, double precision, double precision, double precision, numeric) to anon;
grant execute on function nearby_merchants(double precision, double precision, numeric, text) to anon;
grant execute on function calc_fare(service_type, numeric) to anon;
grant execute on function round_to(bigint, bigint) to anon;

-- Trigger auth.users dijalankan oleh GoTrue (supabase_auth_admin)
grant execute on function handle_new_user() to supabase_auth_admin;
grant execute on function auto_confirm_email() to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant insert on public.profiles, public.wallets to supabase_auth_admin;

-- Default: fungsi baru tidak otomatis bisa dieksekusi anon/public
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

alter function set_updated_at() set search_path = public;
alter function auto_confirm_email() set search_path = public;
alter function round_to(bigint, bigint) set search_path = public;

-- Catatan advisor yang sengaja dibiarkan:
--  * spatial_ref_sys tanpa RLS: tabel referensi bawaan PostGIS, milik supabase_admin, tidak berisi data pengguna.
--  * extension postgis di schema public: bawaan Supabase; memindahkan butuh reinstall ekstensi.
--  * "Leaked password protection": aktifkan di Dashboard > Authentication > Providers > Email (butuh paket Pro).
