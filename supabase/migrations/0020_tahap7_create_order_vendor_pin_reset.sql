-- Tahap 7c: create_order menerima barang pedagang pasar (vendor_item_id) dengan harga pedagang; reset PIN admin oleh admin lain
do $$
declare def text; anchor text := $a$      elsif v_service = 'market' and nullif(v_item->>'item_id', '') is not null then$a$;
  branch text := $b$      elsif v_service = 'market' and nullif(v_item->>'vendor_item_id', '') is not null then
        select i.*, v.stall_name, v.stall_no, v.market_id vendor_market into v_mi from market_vendor_items i join market_vendors v on v.id = i.vendor_id
          where i.id = (v_item->>'vendor_item_id')::uuid and i.active and v.status = 'approved';
        if not found then raise exception 'Barang pedagang tidak tersedia: %', v_item->>'name'; end if;
        if v_mi.vendor_market <> v_market.id then raise exception 'Barang pedagang bukan dari pasar yang dipilih'; end if;
        if not v_mi.in_stock then raise exception 'Stok pedagang habis: %', v_mi.name; end if;
        v_list := v_list || jsonb_build_object('item_id', v_mi.item_id, 'vendor_item_id', v_mi.id, 'vendor_id', v_mi.vendor_id, 'vendor_name', v_mi.stall_name || coalesce(' no. ' || v_mi.stall_no, ''), 'grade', v_mi.grade,
          'name', v_mi.name, 'qty', v_qty, 'unit', v_mi.unit, 'price', v_mi.price, 'ref_price', (select ref_price from market_items where id = v_mi.item_id), 'note', v_item->>'note');
        v_budget := v_budget + (v_mi.price * v_qty)::bigint;
$b$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_order';
  if position('vendor_item_id' in def) > 0 then return; end if;
  if position(anchor in def) = 0 then raise exception 'anchor create_order tidak ditemukan'; end if;
  execute replace(def, anchor, branch || anchor);
end $$;

create or replace function admin_reset_pin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_user = auth.uid() then raise exception 'Minta admin lain untuk mereset PIN Anda'; end if;
  perform admin_require_unlock();
  update admin_security set pin_hash = null, pin_set_at = null, unlocked_until = null, failed = 0, locked_until = null, updated_at = now() where user_id = p_user;
  insert into security_events (kind, user_id, detail) values ('admin.pin_reset', auth.uid(), jsonb_build_object('target', p_user));
  perform log_activity('admin.pin_reset', 'admin_security', p_user::text, 'PIN admin direset oleh admin lain', null);
end $$;
revoke execute on function admin_reset_pin(uuid) from public, anon;
