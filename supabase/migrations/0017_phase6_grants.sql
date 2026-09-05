-- Tahap 6 (e): hardening — fungsi SECURITY DEFINER hanya untuk authenticated (anon hanya estimasi tarif, halaman berbagi, konfigurasi gateway publik)
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.proname not in ('estimate_fare','round_to','shared_order','gateway_public_config','calc_fare','current_pricing_session','setting_num')
  loop execute format('revoke execute on function %s from public, anon', r.sig); end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public;
