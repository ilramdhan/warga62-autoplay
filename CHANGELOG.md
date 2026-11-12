# Changelog

Semua perubahan penting pada proyek ini dicatat di berkas ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/), dan proyek ini memakai [Semantic Versioning](https://semver.org/lang/id/).

## [Unreleased]

Belum ada perubahan.

## [2.0.0]

Chrome extension (MV3), runner Playwright, dan mesin strategi.

### Added

- Chrome extension MV3 dengan popup dan halaman opsi. Bot berjalan di halaman game.
- Runner Playwright (`warga62-runner`) dengan satu profil browser per akun.
- Mesin strategi untuk mode grind (satu pemenang) dan mode arena (setiap akun bermain untuk diri sendiri).
- Planner pencapaian yang memilih preset room.
- Pembatasan room hanya ke Privat dan Teman.

### Changed

- Dibangun ulang dari userscript Tampermonkey menjadi modul ES yang dipakai bersama oleh extension dan runner, lalu dibundel dengan esbuild.

## [1.5.0]

### Added

- Penanganan layar kartu pilihan (choice cards).

## [1.4.0]

### Added

- Fitur Joki Dadu.

## [1.3.0]

### Added

- Kirim seluruh uang sebelum melempar dadu.
- Penanganan pembayaran tol.

## [1.2.0]

### Fixed

- Perbaikan tautan Main Online.

## [1.1.0]

### Added

- Penanganan gadai dan kebangkrutan.
- Penanganan layar akhir permainan.
- Watchdog untuk mendeteksi bot yang macet.

## [1.0.0]

### Added

- Alur dasar permainan otomatis.
