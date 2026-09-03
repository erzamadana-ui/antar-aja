-- Layanan baru: AntarShop (belanja titip). Nilai enum harus di-commit terpisah sebelum dipakai.
alter type service_type add value if not exists 'shop';
