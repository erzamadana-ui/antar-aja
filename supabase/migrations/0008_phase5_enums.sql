-- Tahap 5: nilai enum baru (harus commit terpisah sebelum dipakai)
alter type service_type add value if not exists 'box';          -- AntarBox: mobil box / pick up, pindahan
alter type vehicle_type add value if not exists 'box';
alter type vehicle_type add value if not exists 'pickup';
alter type order_status add value if not exists 'scheduled' before 'searching';   -- booking terjadwal
alter type payment_method add value if not exists 'ewallet';    -- bayar via e-wallet gateway
