# Pemecahan masalah

## Extension atau panel tidak berjalan

- Pastikan **Developer mode** aktif di `chrome://extensions`.
- Muat folder `dist/extension/` hasil `npm run build` dengan **Load unpacked**.
- Klik **Reload** pada extension di `chrome://extensions`, lalu muat ulang tab game dengan **Cmd+R** (Mac) atau **Ctrl+R** (Windows/Linux).

## Game berhenti saat tab tidak terlihat atau diminimalkan

Chrome memperlambat timer di tab yang tidak terlihat, sehingga bot ikut melambat atau berhenti. Ada dua pilihan:

- Gunakan runner Playwright, yang berjalan di jendela browser sendiri.
- Gunakan desktop macOS terpisah dan biarkan jendela Chrome tetap terlihat. Jalankan Chrome dengan flag berikut:

```bash
open -na "Google Chrome" --args --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
```

Flag ini hanya mengatur throttling browser. Flag ini tidak menyembunyikan apa pun dari game.

## Bot macet di modal

1. Buka DevTools (Cmd+Option+I di Mac, Ctrl+Shift+I di Windows/Linux), lalu buka tab **Console**.
2. Filter dengan teks `[W62]`.
3. Salin baris log yang muncul, dan ambil screenshot modal.
4. Buka issue [Modal game baru](https://github.com/ilramdhan/warga62-autoplay/issues/new?template=new_game_modal.yml) dan isi formulirnya.

## Undangan tidak diterima

- Akun harus sudah berteman di dalam game.
- Akun penerima harus sedang online.
- Nama host di konfigurasi (`hostName`) harus sama persis dengan nama akun host.

## Dua host bentrok di profil Chrome yang sama

Satu profil browser hanya boleh menjalankan satu peran, yaitu host atau guest. Buat profil Chrome terpisah untuk setiap akun.

## Mengaktifkan bot di tengah game

Bot boleh dinyalakan kapan saja, termasuk setelah game dimulai, dan mode (Grinding XP ↔ Arena pintar) boleh diganti
di tengah pertandingan: keputusan berikutnya langsung memakai mode baru.

- Guest cukup isi **nick sendiri** di popup. Nick sendiri, host, dan pemenang otomatis masuk daftar akun.
- Bila ada pemain lain di game yang belum terdaftar, bot **dijeda** (bot hanya main melawan akun milikmu sendiri).
  Popup menampilkan nama-namanya; klik **Semua pemain ini akun saya** bila memang semuanya akunmu.
