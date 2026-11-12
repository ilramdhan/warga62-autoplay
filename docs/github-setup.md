# Pengaturan repositori GitHub

Panduan ini untuk maintainer. Langkah-langkah ini dilakukan di pengaturan repositori GitHub, bukan di kode.

## Deskripsi repositori

> Auto-play bot untuk Warga +62: Chrome extension MV3 dan runner Playwright, khusus room privat dengan akun sendiri.

## Topik

`warga62`, `monopoly`, `chrome-extension`, `playwright`, `game-bot`, `automation`, `javascript`, `manifest-v3`, `indonesia`

Isi topik di bagian **About** (ikon roda gigi), lalu tambahkan topik satu per satu.

## Laporan kerentanan privat

1. Buka **Settings**, lalu bagian **Security** atau **Code security**.
2. Aktifkan **Private vulnerability reporting**.

Setelah aktif, tombol **Report a vulnerability** muncul di tab **Security**.

## Proteksi cabang main

Buka **Settings > Rules > Rulesets** (atau **Branches** untuk aturan klasik), lalu buat aturan untuk `main` dengan opsi berikut:

- Require a pull request before merging.
- Require review from Code Owners (`.github/CODEOWNERS`).
- Require status checks to pass, dan pilih job **check** dari workflow CI.
- Block force pushes.

## Sinkronisasi label

Label didefinisikan di `.github/labels.yml`. Workflow **Sync labels** berjalan otomatis setiap ada push ke `main` yang mengubah file itu. Untuk menjalankannya manual, buka tab **Actions**, pilih **Sync labels**, lalu klik **Run workflow**.

## Rilis

Workflow **Release** berjalan saat tag `v*` didorong. Contoh:

```bash
git tag v2.0.0
git push origin v2.0.0
```

Workflow ini membuat GitHub Release dan melampirkan `warga62-autoplay-extension.zip`.
