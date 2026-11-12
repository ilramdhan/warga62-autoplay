# Chrome extension

Extension ini menjalankan bot langsung di tab `https://mainwarga62.id` pada Chrome milikmu. Cocok kalau kamu ingin mengawasi permainan sambil jalan.

> **Gunakan dengan bijak.** Hanya untuk akun milikmu sendiri di room **Privat** atau **Teman**. Jangan dipakai di room publik.

## 1. Dapatkan extension

**Opsi A: dari file zip** (paling mudah)

1. Unduh `warga62-autoplay-extension-v<versi>.zip` dari halaman Releases di GitHub, atau buat sendiri dengan `npm run build` (hasilnya ada di folder `dist/`).
2. Ekstrak zip ke sebuah folder tetap, misalnya `~/warga62-extension`. Jangan hapus folder ini setelah dipasang.

**Opsi B: build dari sumber**

```bash
npm ci
npm run build
```

Folder siap pakai ada di `dist/extension/`.

## 2. Pasang di Chrome (macOS, Windows, Linux)

1. Buka `chrome://extensions`.
2. Nyalakan **Developer mode** (pojok kanan atas).
3. Klik **Load unpacked** lalu pilih folder hasil ekstrak (atau `dist/extension`).
4. Klik ikon puzzle di toolbar Chrome, lalu **pin** "Warga +62 Autoplay".

Setelah memperbarui kode atau menimpa folder dengan versi baru, klik tombol muat ulang pada kartu extension di `chrome://extensions`.

## 3. Pakai

Satu profil Chrome = satu akun game. Untuk 2 sampai 8 akun, buat satu profil Chrome per akun (menu profil di pojok kanan atas Chrome), login ke akun masing-masing, dan pasang extension di tiap profil.

1. Buka **Pengaturan lengkap** (dari popup). Di tab **Akun** isi:
   - nick akun di browser ini,
   - peran: **Host** untuk satu browser pembuat room, **Guest** untuk sisanya,
   - daftar semua nick milikmu (2 sampai 8), nick host, dan nick pemenang untuk mode Grinding XP.
2. Pilih **Mode** (Grinding XP atau Arena pintar), atur **Aturan room**, **Strategi**, dan lainnya. Tekan **Simpan**.
3. Buka `https://mainwarga62.id` di tab biasa.
4. Klik ikon extension lalu tombol **MULAI**. Badge berubah menjadi `ON`.
5. Ulangi di profil Chrome lain. Host membuat room dan mengundang akunmu yang lain; guest menerima undangan hanya dari nick host.

Popup menampilkan status (state, handler, ronde, fase, kas), pilihan cepat peran dan mode, serta 20 baris log terakhir. Log lengkap, ekspor log, impor/ekspor konfigurasi, dan reset ada di halaman pengaturan.

## Catatan

- Tab game harus tetap terbuka. Chrome bisa menidurkan tab yang tersembunyi; letakkan tiap profil di jendela sendiri, atau pakai [runner Playwright](runner.md) bila ingin berjalan di latar belakang.
- Pengaturan disimpan di `chrome.storage.local`, status di `chrome.storage.session`. Tidak ada data yang dikirim ke server lain; extension hanya punya izin untuk `mainwarga62.id`.
- Kalau bot macet, tekan **BERHENTI** lalu **MULAI** lagi, atau muat ulang tab game.
