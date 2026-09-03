# Panduan Integrasi Lanjutan

## 1. Pembayaran otomatis (Midtrans / Xendit)

Saat ini top up AntarPay dilakukan manual (transfer → bukti → admin verifikasi → `admin_review_topup`). Untuk otomatis:

1. Daftar merchant Midtrans (Snap) atau Xendit (Invoice). Simpan **Server Key** sebagai secret Supabase: `supabase secrets set MIDTRANS_SERVER_KEY=...`.
2. Buat Edge Function `create-topup` (Deno): menerima `{ amount }` dari klien (JWT diverifikasi), memanggil API Snap/Invoice, menyimpan `topup_requests` dengan `method='midtrans'` dan `ref=<order_id gateway>`, mengembalikan URL pembayaran. Klien membukanya dengan `expo-web-browser`.
3. Buat Edge Function `payment-webhook` (`verify_jwt=false`): memverifikasi signature (SHA-512 Midtrans / callback token Xendit), lalu memanggil fungsi SQL `admin_review_topup` menggunakan **service role** (atau fungsi khusus `system_apply_topup(ref)`), sehingga saldo bertambah otomatis.
4. Di `src/app/pay/topup.tsx`, tambahkan tombol "Bayar otomatis (QRIS/VA)" yang memanggil `supabase.functions.invoke('create-topup')`.

Jangan pernah menaruh server key di aplikasi klien.

## 2. Push notification

1. `npx expo install expo-notifications expo-device`.
2. Saat login, minta izin & ambil `ExpoPushToken`, simpan ke `profiles.push_token` (kolom sudah ada).
3. Buat Edge Function `notify` yang menerima `{ user_id, title, body, data }` dan memanggil `https://exp.host/--/api/v2/push/send`.
4. Buat trigger Postgres `after insert on order_events` → `pg_net` (`net.http_post`) ke Edge Function `notify` untuk customer/driver/merchant sesuai status (`accepted`, `arrived`, `completed`, `merchant_ready`, dst.).
5. Untuk APK/IPA produksi: konfigurasi FCM (Android) & APNs (iOS) di `eas credentials`.

## 3. Google Maps penuh (peta native)

* Isi `EXPO_PUBLIC_GOOGLE_MAPS_KEY` → pencarian/rute pindah ke Google tanpa ubah kode.
* Untuk tampilan peta Google native: `npx expo install react-native-maps`, tambahkan plugin di `app.config.ts` (`android.config.googleMaps.apiKey`), lalu buat `MapView.native.tsx` berbasis `react-native-maps` dengan antarmuka yang sama (`MapProps` di `src/components/map/shared.ts`). Web tetap Leaflet atau ganti ke `@vis.gl/react-google-maps`.

## 4. Verifikasi OTP nomor HP

Supabase Auth mendukung phone OTP via Twilio/Vonage/MessageBird. Aktifkan di Dashboard → Authentication → Providers → Phone, lalu ganti alur login ke `supabase.auth.signInWithOtp({ phone })` + `verifyOtp`.

## 5. Dispatch otomatis (penugasan driver oleh sistem)

Saat ini driver memilih order dari daftar terdekat (first-come). Untuk penugasan otomatis ala Gojek:
* Edge Function terjadwal (`pg_cron` tiap 5 detik) memilih order `searching` tertua, mencari driver online terdekat (`nearby_drivers`) yang belum menerima tawaran, menulis `order_offers(order_id, driver_id, expires_at)`; klien driver menampilkan tawaran 15 detik (terima/tolak); jika kedaluwarsa, lanjut ke driver berikutnya.
* Tambah bobot: rating, jarak, tingkat penerimaan.

## 6. Skala & biaya

* Supabase Free: 500 MB DB, 1 GB storage, 2 juta pesan realtime/bulan — cukup untuk uji hingga ratusan pengguna. Upgrade Pro (US$25/bln) saat produksi.
* OSRM/Nominatim publik: batasi ≤1 req/detik. Untuk produksi sewa MapTiler/Google atau host OSRM sendiri.
* GitHub Pages gratis; custom domain (mis. `app.antaraja.id`) bisa dipasang di Settings → Pages.
