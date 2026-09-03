# Antar Aja

Super-app ala Gojek: **AntarRide** (ojek motor), **AntarCar** (mobil), **AntarFood** (pesan makanan), **AntarSend** (kirim paket), dan **AntarPay** (dompet digital). Satu basis kode React Native + Expo untuk **Android, iOS, dan Web**, backend **Supabase** (Postgres + PostGIS, Auth, Realtime, Storage).

| Peran | Fitur |
|---|---|
| Pelanggan | Pesan ride/car/food/send, estimasi tarif rute, tracking driver realtime, chat, promo, wallet & top up, riwayat, rating |
| Mitra Driver | Online/offline, siaran lokasi GPS, daftar order sekitar (radius 5 km), terima order, navigasi, progres status, pendapatan & tarik saldo |
| Merchant | Kelola menu, terima/tolak/siapkan pesanan, buka/tutup toko, saldo penjualan |
| Admin (web) | Dashboard KPI, verifikasi driver & merchant, pengguna, pesanan live, verifikasi top up/penarikan, tarif & promo, pengaturan |

## Akun demo (kata sandi semua: `AntarAja#2026`)

| Email | Peran |
|---|---|
| customer@antaraja.id | Pelanggan (saldo AntarPay demo) |
| driver@antaraja.id | Driver motor (Padang) |
| driver2@antaraja.id | Driver mobil (Padang) |
| merchant@antaraja.id | Pemilik "Sate Padang Mak Syukur" |
| admin@antaraja.id | Admin |

> Data demo (merchant, menu, promo) berpusat di **Padang** dan **Pekanbaru**. Di web/emulator tanpa GPS, aplikasi memakai pusat kota Padang.

## Struktur

```
antar-aja/
├─ app.config.ts          # konfigurasi Expo (nama, ikon, izin, baseUrl web)
├─ eas.json               # profil EAS Build (APK preview, AAB/iOS production)
├─ .env                   # URL & anon key Supabase (aman untuk klien; akses diatur RLS)
├─ src/app/               # rute Expo Router
│  ├─ (auth)/             # welcome, login, register
│  ├─ (customer)/         # tab pelanggan: beranda, pesanan, AntarPay, akun
│  ├─ ride/ food/ send/   # alur pemesanan
│  ├─ order/[id]/         # tracking + chat
│  ├─ (driver)/ driver/   # mode mitra driver
│  ├─ (merchant)/         # mode merchant
│  └─ (admin)/            # panel admin (sidebar di layar lebar)
├─ src/components/map/    # peta lintas platform (Leaflet: WebView di native, react-leaflet di web)
├─ src/lib/geo.ts         # pencarian tempat (Photon/Nominatim), rute (OSRM), fallback Google
├─ supabase/migrations/   # skema, fungsi bisnis (RPC), RLS, hardening
├─ supabase/seed.sql      # data demo
└─ .github/workflows/     # CI: web → GitHub Pages, APK Android → GitHub Release
```

## Menjalankan di komputer (Mac)

```bash
cd antar-aja
npm install            # otomatis menyalin Leaflet ke src/components/map/leaflet-bundle.ts
npm run web            # buka http://localhost:8081 di browser
npm start              # tampilkan QR code → scan dengan Expo Go (iOS/Android)
```

Expo Go: pasang dari App Store / Play Store, pastikan HP dan Mac satu Wi-Fi, scan QR dari terminal. Semua fitur (peta, GPS, kamera) jalan di Expo Go tanpa build native.

## Deploy web + APK otomatis (GitHub)

1. Buat repositori GitHub bernama `antar-aja` (public atau private).
2. Push kode ini ke branch `main`.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
4. Setiap push ke `main`:
   * workflow **Web → GitHub Pages** menerbitkan aplikasi web ke `https://<username>.github.io/antar-aja/`
   * workflow **Android APK** membangun APK dan menaruhnya di **Releases** (`https://github.com/<username>/antar-aja/releases/latest`).
5. Unduh APK di HP Android → izinkan instal dari sumber tidak dikenal → pasang.

APK dari workflow ditandatangani keystore debug (cocok untuk uji/distribusi langsung). Untuk Play Store gunakan EAS (bawah).

## Build resmi dengan EAS (Play Store / App Store / TestFlight)

```bash
npm install -g eas-cli
eas login                               # akun Expo gratis
eas init                                # mengisi extra.eas.projectId
eas build -p android --profile preview  # APK uji
eas build -p android --profile production   # AAB untuk Play Console
eas build -p ios --profile production       # butuh Apple Developer Program (US$99/th)
eas submit -p ios                            # kirim ke TestFlight / App Store
```

Play Console (US$25 sekali) dan Apple Developer (US$99/tahun) memakai akun Anda sendiri.

## Backend Supabase

Project: `antar-aja` (ref `qwltshvzrsykxdvhbxcv`, region Singapore). Semua migrasi ada di `supabase/migrations/` dan sudah diterapkan.

Prinsip keamanan:
* **RLS aktif di semua tabel**; klien hanya membaca data miliknya (pesanan, wallet, transaksi). Pesanan `searching` hanya terlihat driver yang disetujui.
* **Semua mutasi uang & status lewat fungsi RPC `SECURITY DEFINER`** (`create_order`, `driver_accept_order`, `driver_update_order_status`, `cancel_order`, `admin_review_topup`, …) — saldo tidak bisa diubah langsung dari klien.
* Tarif dihitung ulang di server; jarak rute dari klien dibatasi maksimal 2,5× jarak garis lurus (anti manipulasi).
* Terima order atomik (`update … where status='searching'`) → tidak ada rebutan ganda.
* Fungsi admin memeriksa `is_admin()`; kolom `role`, `status` dilindungi trigger.
* Grant EXECUTE dicabut dari `anon`/PUBLIC untuk semua fungsi aplikasi (kecuali estimasi tarif & daftar merchant).

Pengaturan dashboard yang disarankan:
* **Authentication → Providers → Email → Confirm email: OFF** (saat ini email dikonfirmasi otomatis oleh trigger `auto_confirm_email`; matikan trigger itu bila ingin verifikasi email sungguhan + SMTP kustom).
* **Authentication → Rate limits** sesuaikan saat trafik naik.
* Aktifkan **Leaked password protection** (paket Pro).

## Peta & integrasi berbayar (opsional)

Tanpa API key: tile OpenStreetMap, pencarian Photon → Nominatim, rute OSRM publik (rate limit ringan; cocok untuk MVP/uji).

Untuk produksi:
* **Google Maps**: isi `EXPO_PUBLIC_GOOGLE_MAPS_KEY` di `.env` → pencarian tempat, reverse geocode, dan rute otomatis memakai Google (Places, Geocoding, Directions). Tile peta tetap Leaflet; bila ingin Google Maps SDK native, ganti `src/components/map/MapView.tsx` dengan `react-native-maps` (butuh build native).
* **Pembayaran otomatis** (Midtrans/Xendit): lihat `docs/INTEGRASI.md`.
* **Push notification**: lihat `docs/INTEGRASI.md` (Expo Notifications + trigger Supabase → Edge Function).

## Skrip

| Perintah | Fungsi |
|---|---|
| `npm run web` / `npm start` | dev server web / Expo Go |
| `npm run typecheck` | pemeriksaan TypeScript |
| `npm run build:web` | export web statis ke `dist/` |
| `node scripts/gen-leaflet.mjs` | regenerasi bundel Leaflet untuk WebView |

## Lisensi

Hak cipta © 2026 Erza Pradipta Madana. Seluruh hak dilindungi.
