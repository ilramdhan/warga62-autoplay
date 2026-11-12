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

## Izin workflow (WAJIB untuk rilis otomatis)

Buka **Settings > Actions > General**, bagian **Workflow permissions**, lalu:

- Centang **Allow GitHub Actions to create and approve pull requests**.

Tanpa ini, workflow **Release** (release-please) gagal dengan pesan
_"GitHub Actions is not permitted to create or approve pull requests"_ karena ia perlu membuat "release PR".

## Sinkronisasi label

Label didefinisikan di `.github/labels.yml`. Workflow **Sync labels** berjalan otomatis setiap ada push ke `main` yang mengubah file itu. Untuk menjalankannya manual, buka tab **Actions**, pilih **Sync labels**, lalu klik **Run workflow**.

## Rilis (release-please otomatis)

Rilis diatur otomatis oleh **release-please** berdasarkan pesan commit Conventional (`feat:`, `fix:`, dst.):

1. Setiap push ke `main`, workflow **Release** membuat atau memperbarui sebuah **release PR** berjudul seperti _"chore: release 2.1.0"_ yang menaikkan versi di `package.json` dan menulis `CHANGELOG.md`.
2. Saat kamu **merge release PR** itu, release-please membuat tag `v*`, GitHub Release, lalu melampirkan `warga62-autoplay-extension-v<versi>.zip` secara otomatis.

Tidak perlu membuat tag manual. Versi awal yang dilacak ada di `.release-please-manifest.json`.
