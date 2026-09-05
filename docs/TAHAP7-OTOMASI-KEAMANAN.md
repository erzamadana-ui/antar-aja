# Tahap 7 — Data pengguna, mitra pasar, otomasi & keamanan (5 Sep 2026)

## 1. Ringkasan perubahan
| Area | Isi |
|---|---|
| Pelanggan | Menu mode kemitraan dihapus. Usulan/pembaruan data **toko (AntarShop)** & **pasar (AntarMarket)** dari titik lokasi pengguna (`/places/suggest`). Bagian **Pedagang terverifikasi** di AntarMarket (barang bergrade A/B/C, harga vs acuan). |
| Mitra | Hanya halaman mitra. Jenis mitra baru **Pedagang pasar tradisional** (`/account/become-vendor`) dengan tab Lapak / Barang / Akun dan **skor kualitas** 0–100. Driver melihat harga acuan + peringatan koefisien saat input nota. |
| Admin | Sidebar bisa di-scroll. Menu baru: **Usulan Data**, **Mitra Pasar**, **Otomasi**, **Pusat Keamanan**. PIN panel (6 digit) untuk tindakan sensitif, masking data pribadi, log ekspor. |
| Eksekutif | Bagian **Keuangan** (take rate, net revenue, margin kontribusi, liabilitas saldo, piutang, P&L bulanan), **Rekomendasi** otomatis, **Otomasi & keamanan**, **Laporan otomatis**. |
| Backend | Migrasi 0018–0020, pg_cron 3 jadwal, 40+ RPC baru (lihat di bawah). |

## 2. Cara kerja otomasi (semua bisa diatur di Panel Admin → Otomasi)
1. **Moderasi data toko/pasar** — usulan pelanggan dalam radius 50 m dengan nama mirip digabung; **3 laporan konsisten** → aktif otomatis (`shop_stores.catalog_source='crowd'`), konflik nama → menunggu admin.
2. **Koefisien harga & anti-fraud** — harga nota vs acuan: `< 0,6×` atau `> 1,25×` → ditandai + foto nota wajib; `> 1,6×` → ditolak. Pembatalan driver **3×/24 jam** → ditangguhkan otomatis; lompatan GPS `> 150 km/jam`; perangkat sama dipakai ≥3 akun; total belanja > anggaran × 1,3. Semua masuk **Pusat Keamanan → Flag** (Konfirmasi / Abaikan / Abaikan & pulihkan akun).
3. **Verifikasi mitra bertingkat** — skor dokumen driver/merchant (0–100); skor ≥ **80** → disetujui otomatis dengan masa percobaan 7 hari (maks 10 order/hari). Berjalan saat dokumen diunggah dan tiap 30 menit (`antarkita_verify_backlog`). Label halal tetap manual.
4. **Pencairan otomatis** — penarikan ≤ **Rp500.000**/transaksi dan ≤ **Rp1.000.000**/hari disetujui otomatis bila rekening sudah **terverifikasi** (pernah disetujui admin atau ditandai di Keuangan) dan tidak ada flag fraud terbuka.
5. **Retensi pelanggan** — tiap hari 10.00 WIB (`antarkita_retention`): pelanggan tanpa pesanan 14 hari menerima promo `KEMBALI15` (maks Rp10.000) sampai anggaran bulanan (Rp2.000.000) habis; jeda 30 hari per pelanggan; merchant sepi 14 hari mendapat tips.
6. **Harga dinamis permintaan** — saat order "mencari driver" dalam 15 menit & radius 5 km melebihi driver online, tarif dikali `1 + 0,25 × kelebihan`, maksimum **1,5×** (di atas sesi terjadwal). Tampil sebagai `demand` di estimasi.
7. **Laporan terjadwal** — `Ringkasan harian` (07.00 WIB, 1 bulan data) & `Laporan mingguan manajemen` (Senin 08.00 WIB, 3 bulan) dikirim ke kotak masuk admin & eksekutif; riwayat di Portal Eksekutif dan Otomasi. Email opsional: isi `recipients` lalu sambungkan Edge Function pengirim (belum dibuat — lihat §5).

## 3. Pusat keamanan admin
- **PIN 6 digit** wajib untuk: penyesuaian saldo, review pencairan, simpan payment gateway, menjadikan akun admin, reset PIN admin lain. Sesi 60 menit (bisa diubah). 5× salah → terkunci 15 menit. Lupa PIN → admin lain menekan **Reset PIN**.
- Telepon/email pengguna **tersamar**; tombol *Tampilkan* dan **Ekspor CSV** dicatat di log keamanan (`security_events`).
- Log: flag fraud, penangguhan otomatis, buka kunci/gagal, PIN diatur/direset, ekspor, tampilkan data pribadi, pencairan & verifikasi otomatis.

## 4. RPC & tabel baru (Supabase)
- Tabel: `place_suggestions`, `place_suggestion_votes`, `fraud_flags`, `security_events`, `market_vendors`, `market_vendor_items`, `bank_accounts`, `admin_security`, `automation_runs`, `scheduled_reports`, `report_runs`, `retention_touches`. Kolom baru: `drivers/merchants.auto_verified, probation_until, verify_score`; `withdrawal_requests.auto`.
- Pelanggan/mitra: `suggest_place`, `my_place_suggestions`, `apply_market_vendor`, `vendor_upsert_item`, `vendor_set_stock`, `market_vendor_catalog`, `request_withdrawal` (v2), `set_shopping_actual` (v2 koefisien), `estimate_fare` (v2 demand), `create_order` (barang pedagang `vendor_item_id`).
- Admin: `admin_place_suggestions/review_place_suggestion`, `admin_fraud_flags/review_fraud/fraud_summary`, `admin_market_vendors/review_market_vendor`, `admin_pin_status/set_pin/unlock/lock/reset_pin`, `admin_log_event`, `admin_security_overview`, `admin_set_bank_verified`, `admin_automation_status`, `admin_set_settings`, `admin_run_automation`, `admin_upsert_scheduled_report`, `report_runs_list`.
- Eksekutif: `exec_report` v3 (`finance`, `recommendations`, `fraud`, `automation`, `gmv_growth_pct`), internal `exec_report_data`, `exec_recommendations`.
- pg_cron: `antarkita_reports` (tiap jam :05), `antarkita_retention` (03.00 UTC = 10.00 WIB), `antarkita_verify_backlog` (tiap 30 menit).

## 5. Belum otomatis / asumsi
- Email laporan terjadwal belum terkirim (hanya in-app); perlu Edge Function + kunci SMTP/Resend.
- Skor kualitas pedagang & rekomendasi eksekutif berbasis aturan (bukan ML); ambang bisa diubah di Otomasi.
- Harga acuan pasar masih perkiraan; koefisien default 0,6 / 1,25 / 1,6.
- Akun demo admin memakai PIN `123456` (ubah di Pusat Keamanan).
