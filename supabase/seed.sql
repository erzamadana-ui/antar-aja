-- =====================================================================
-- Antar Aja — Seed data uji (akun demo, merchant, menu, promo)
-- Password semua akun demo: AntarAja#2026
-- =====================================================================
create or replace function seed_user(p_id uuid, p_email text, p_name text, p_phone text, p_password text)
returns void language plpgsql security definer as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, is_super_admin)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', p_name, 'phone', p_phone),
    now(), now(), '', '', '', '', false)
  on conflict (id) do nothing;
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text, 'email',
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false), now(), now(), now())
  on conflict do nothing;
end $$;

select seed_user('a0000000-0000-4000-8000-000000000001', 'admin@antaraja.id',    'Admin Antar Aja',  '+6281100000001', 'AntarAja#2026');
select seed_user('a0000000-0000-4000-8000-000000000002', 'customer@antaraja.id', 'Budi Santoso',     '+6281100000002', 'AntarAja#2026');
select seed_user('a0000000-0000-4000-8000-000000000003', 'driver@antaraja.id',   'Ahmad Fauzi',      '+6281100000003', 'AntarAja#2026');
select seed_user('a0000000-0000-4000-8000-000000000004', 'driver2@antaraja.id',  'Rina Kartika',     '+6281100000004', 'AntarAja#2026');
select seed_user('a0000000-0000-4000-8000-000000000005', 'merchant@antaraja.id', 'Mak Syukur',       '+6281100000005', 'AntarAja#2026');
drop function seed_user(uuid, text, text, text, text);

-- Role
set local antaraja.bypass = 'on';
update profiles set role = 'admin'    where id = 'a0000000-0000-4000-8000-000000000001';
update profiles set role = 'driver'   where id in ('a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000004');
update profiles set role = 'merchant' where id = 'a0000000-0000-4000-8000-000000000005';

-- Saldo awal demo
update wallets set balance = 200000 where user_id = 'a0000000-0000-4000-8000-000000000002';
insert into wallet_transactions (user_id, type, amount, balance_after, note) values ('a0000000-0000-4000-8000-000000000002', 'topup', 200000, 200000, 'Saldo demo awal');
update wallets set balance = 100000 where user_id in ('a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000004');
insert into wallet_transactions (user_id, type, amount, balance_after, note) values
  ('a0000000-0000-4000-8000-000000000003', 'topup', 100000, 100000, 'Deposit awal driver'),
  ('a0000000-0000-4000-8000-000000000004', 'topup', 100000, 100000, 'Deposit awal driver');

-- Driver demo (Padang)
insert into drivers (id, vehicle_type, vehicle_brand, vehicle_plate, vehicle_color, license_number, status, is_online, location, last_seen_at, rating_avg, rating_count, total_trips) values
  ('a0000000-0000-4000-8000-000000000003', 'motor', 'Honda Vario 160', 'BA 1234 AB', 'Hitam', 'SIM-C-000123', 'approved', false, st_setsrid(st_makepoint(100.4172, -0.9471), 4326)::geography, now(), 4.90, 128, 412),
  ('a0000000-0000-4000-8000-000000000004', 'car',   'Toyota Avanza',   'BA 5678 CD', 'Putih', 'SIM-A-000456', 'approved', false, st_setsrid(st_makepoint(100.3620, -0.9150), 4326)::geography, now(), 4.85, 64, 201);

-- Merchant demo
insert into merchants (id, owner_id, name, description, category, address, location, image_url, status, rating_avg, rating_count, prep_minutes) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'Sate Padang Mak Syukur', 'Sate padang legendaris dengan kuah kental rempah', 'Makanan', 'Jl. Sudirman No. 12, Padang', st_setsrid(st_makepoint(100.3625, -0.9405), 4326)::geography, 'https://images.unsplash.com/photo-1529042410759-befb1204b468?w=600', 'approved', 4.80, 950, 15),
  ('b0000000-0000-4000-8000-000000000002', null, 'RM Sederhana Bundo Kanduang', 'Masakan Padang otentik: rendang, ayam pop, gulai tunjang', 'Makanan', 'Jl. Pemuda No. 8, Padang', st_setsrid(st_makepoint(100.3560, -0.9500), 4326)::geography, 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=600', 'approved', 4.70, 1230, 10),
  ('b0000000-0000-4000-8000-000000000003', null, 'Kopi Kubik Padang', 'Kopi susu gula aren, es kopi, dan roti bakar', 'Minuman', 'Jl. Khatib Sulaiman No. 45, Padang', st_setsrid(st_makepoint(100.3720, -0.9250), 4326)::geography, 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600', 'approved', 4.60, 410, 8),
  ('b0000000-0000-4000-8000-000000000004', null, 'Martabak Kubang Hayuda', 'Martabak mesir kubang & martabak manis', 'Jajanan', 'Jl. M. Yamin No. 130, Padang', st_setsrid(st_makepoint(100.3600, -0.9440), 4326)::geography, 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=600', 'approved', 4.75, 620, 12),
  ('b0000000-0000-4000-8000-000000000005', null, 'Ayam Geprek Bensu Padang', 'Ayam geprek sambal level 1-10', 'Makanan', 'Jl. Veteran No. 20, Padang', st_setsrid(st_makepoint(100.3680, -0.9350), 4326)::geography, 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600', 'approved', 4.50, 880, 12),
  ('b0000000-0000-4000-8000-000000000006', null, 'Es Durian Ganti Nan Lamo', 'Es durian dan es campur khas Padang', 'Minuman', 'Jl. Pulau Karam No. 3, Padang', st_setsrid(st_makepoint(100.3580, -0.9560), 4326)::geography, 'https://images.unsplash.com/photo-1488900128323-21503983a07e?w=600', 'approved', 4.65, 300, 8),
  ('b0000000-0000-4000-8000-000000000007', null, 'Pekanbaru Mie Ayam Pak Kumis', 'Mie ayam & bakso', 'Makanan', 'Jl. Sudirman No. 200, Pekanbaru', st_setsrid(st_makepoint(101.4478, 0.5071), 4326)::geography, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600', 'approved', 4.55, 210, 10),
  ('b0000000-0000-4000-8000-000000000008', null, 'Sate Ocu Kampar', 'Sate ocu khas Kampar', 'Makanan', 'Jl. Tuanku Tambusai No. 50, Pekanbaru', st_setsrid(st_makepoint(101.4300, 0.5150), 4326)::geography, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600', 'approved', 4.70, 340, 15);

insert into menu_items (merchant_id, name, description, price, category, sort_order) values
  ('b0000000-0000-4000-8000-000000000001', 'Sate Padang 10 Tusuk', 'Sate daging sapi + kuah kental + ketupat', 30000, 'Sate', 1),
  ('b0000000-0000-4000-8000-000000000001', 'Sate Padang 20 Tusuk', 'Porsi jumbo', 55000, 'Sate', 2),
  ('b0000000-0000-4000-8000-000000000001', 'Sate Lidah', 'Sate lidah sapi 10 tusuk', 35000, 'Sate', 3),
  ('b0000000-0000-4000-8000-000000000001', 'Kerupuk Kulit', 'Kerupuk jangek', 5000, 'Tambahan', 4),
  ('b0000000-0000-4000-8000-000000000001', 'Teh Talua', 'Teh telur khas Minang', 12000, 'Minuman', 5),
  ('b0000000-0000-4000-8000-000000000002', 'Nasi Rendang', 'Nasi + rendang daging + sayur', 28000, 'Nasi', 1),
  ('b0000000-0000-4000-8000-000000000002', 'Nasi Ayam Pop', 'Nasi + ayam pop + sambal lado', 25000, 'Nasi', 2),
  ('b0000000-0000-4000-8000-000000000002', 'Nasi Gulai Tunjang', 'Nasi + gulai tunjang', 30000, 'Nasi', 3),
  ('b0000000-0000-4000-8000-000000000002', 'Nasi Dendeng Balado', 'Nasi + dendeng balado', 32000, 'Nasi', 4),
  ('b0000000-0000-4000-8000-000000000002', 'Es Teh Manis', '', 5000, 'Minuman', 5),
  ('b0000000-0000-4000-8000-000000000003', 'Kopi Susu Gula Aren', 'Signature', 18000, 'Kopi', 1),
  ('b0000000-0000-4000-8000-000000000003', 'Es Kopi Hitam', '', 12000, 'Kopi', 2),
  ('b0000000-0000-4000-8000-000000000003', 'Matcha Latte', '', 22000, 'Non-Kopi', 3),
  ('b0000000-0000-4000-8000-000000000003', 'Roti Bakar Coklat Keju', '', 15000, 'Snack', 4),
  ('b0000000-0000-4000-8000-000000000004', 'Martabak Kubang Daging', 'Martabak mesir isi daging + kuah cuka', 35000, 'Martabak', 1),
  ('b0000000-0000-4000-8000-000000000004', 'Martabak Manis Coklat Keju', '', 32000, 'Martabak', 2),
  ('b0000000-0000-4000-8000-000000000004', 'Martabak Manis Kacang', '', 28000, 'Martabak', 3),
  ('b0000000-0000-4000-8000-000000000005', 'Ayam Geprek Original', 'Ayam geprek + nasi + sambal level pilihan', 18000, 'Geprek', 1),
  ('b0000000-0000-4000-8000-000000000005', 'Ayam Geprek Keju', '', 23000, 'Geprek', 2),
  ('b0000000-0000-4000-8000-000000000005', 'Es Teh Jumbo', '', 6000, 'Minuman', 3),
  ('b0000000-0000-4000-8000-000000000006', 'Es Durian', 'Es durian asli', 20000, 'Es', 1),
  ('b0000000-0000-4000-8000-000000000006', 'Es Campur', '', 15000, 'Es', 2),
  ('b0000000-0000-4000-8000-000000000007', 'Mie Ayam Bakso', '', 18000, 'Mie', 1),
  ('b0000000-0000-4000-8000-000000000007', 'Bakso Urat Jumbo', '', 22000, 'Bakso', 2),
  ('b0000000-0000-4000-8000-000000000008', 'Sate Ocu 10 Tusuk', '', 30000, 'Sate', 1),
  ('b0000000-0000-4000-8000-000000000008', 'Sate Ocu 20 Tusuk', '', 55000, 'Sate', 2);

insert into promos (code, description, discount_type, value, max_discount, min_total, service, quota) values
  ('ANTARBARU', 'Diskon 50% s.d. Rp10.000 untuk pengguna baru', 'percent', 50, 10000, 10000, null, 1000),
  ('HEMAT5', 'Potongan Rp5.000 min. transaksi Rp20.000', 'fixed', 5000, null, 20000, null, null),
  ('MAKANENAK', 'Diskon 20% AntarFood s.d. Rp15.000', 'percent', 20, 15000, 30000, 'food', 500);

insert into saved_places (user_id, label, address, lat, lng) values
  ('a0000000-0000-4000-8000-000000000002', 'Rumah', 'Jl. Sudirman No. 45, Padang', -0.9471, 100.4172),
  ('a0000000-0000-4000-8000-000000000002', 'Kantor', 'Jl. Khatib Sulaiman, Padang', -0.9250, 100.3720);

-- Contoh harga kompetitor (untuk halaman intelijen harga admin) — perbarui dengan survei nyata
insert into competitor_prices (competitor, service, base_fare, per_km, min_fare, level, source, note)
select * from (values
 ('Kompetitor A','ride_motor'::service_type,0,2600,10000,'middle','Contoh referensi — perbarui dengan survei aplikasi kompetitor','Data contoh'),
 ('Kompetitor B','ride_motor'::service_type,0,2500,9500,'middle','Contoh referensi — perbarui dengan survei aplikasi kompetitor','Data contoh'),
 ('Kompetitor A','ride_motor'::service_type,0,3400,13000,'high','Contoh referensi (jam sibuk)','Data contoh'),
 ('Kompetitor A','ride_car'::service_type,0,5000,20000,'middle','Contoh referensi','Data contoh'),
 ('Kompetitor B','ride_car'::service_type,0,4800,19000,'middle','Contoh referensi','Data contoh'),
 ('Kompetitor A','food'::service_type,0,2500,9000,'middle','Contoh referensi (ongkir)','Data contoh'),
 ('Kompetitor A','send'::service_type,0,2700,10000,'middle','Contoh referensi','Data contoh'),
 ('Kompetitor A','shop'::service_type,3000,2700,12000,'middle','Contoh referensi (jasa belanja)','Data contoh')
) v(competitor, service, base_fare, per_km, min_fare, level, source, note)
where not exists (select 1 from competitor_prices);

-- Tahap 4: label halal demo (klaim + 2 terverifikasi)
update merchants set is_halal = true where name not ilike '%kopi%';
update merchants set halal_verified = true where id in ('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002');
