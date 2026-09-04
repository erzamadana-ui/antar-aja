-- Tahap 6: enum baru (harus di migrasi terpisah agar bisa dipakai di migrasi berikutnya)
alter type service_type add value if not exists 'market';       -- AntarMarket: belanja bahan masak di pasar tradisional
