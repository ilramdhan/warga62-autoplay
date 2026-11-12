# Changelog

Semua perubahan penting pada proyek ini dicatat di berkas ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/), dan proyek ini memakai [Semantic Versioning](https://semver.org/lang/id/).

## [2.1.5](https://github.com/ilramdhan/warga62-autoplay/compare/v2.1.4...v2.1.5) (2026-11-12)


### Bug Fixes

* **lobby:** deteksi kehadiran dari daftar pemain, bukan teks body ([290e2a9](https://github.com/ilramdhan/warga62-autoplay/commit/290e2a905553b528cd8ad6d47a93256ec73ace1d))

## [2.1.4](https://github.com/ilramdhan/warga62-autoplay/compare/v2.1.3...v2.1.4) (2026-11-12)


### Bug Fixes

* role selalu tersimpan di popup; default grind = Survival cepat ([d52b1f5](https://github.com/ilramdhan/warga62-autoplay/commit/d52b1f50d5474632773e8ca4c59147af3050cefb))

## [2.1.3](https://github.com/ilramdhan/warga62-autoplay/compare/v2.1.2...v2.1.3) (2026-11-12)


### Bug Fixes

* **lobby:** tunggu daftar teman termuat sebelum mengundang (race) ([953072c](https://github.com/ilramdhan/warga62-autoplay/commit/953072c6eee528c54d36631e07689691b1de8573))

## [2.1.2](https://github.com/ilramdhan/warga62-autoplay/compare/v2.1.1...v2.1.2) (2026-11-12)


### Bug Fixes

* **lobby:** label "N ronde" untuk Batas ronde; retry invite 20s ([317f678](https://github.com/ilramdhan/warga62-autoplay/commit/317f6785ea2410727fd5c07f648115d5b70dfdc8))

## [2.1.1](https://github.com/ilramdhan/warga62-autoplay/compare/v2.1.0...v2.1.1) (2026-11-12)


### Bug Fixes

* **lobby:** atur room via label radio, bukan button; klik Selesai andal ([98ddd71](https://github.com/ilramdhan/warga62-autoplay/commit/98ddd7190a8e36dcc52161f9fbe161f0d2e80b2e))

## [2.1.0](https://github.com/ilramdhan/warga62-autoplay/compare/v2.0.0...v2.1.0) (2026-11-12)


### Features

* bot auto-play Warga +62 (extension + runner + strategi) ([e726ed7](https://github.com/ilramdhan/warga62-autoplay/commit/e726ed73c0dac45e542c05ad417758b12868af8c))


### Bug Fixes

* sambungkan perencana pencapaian & cegah loop Gali Lubang ([f863854](https://github.com/ilramdhan/warga62-autoplay/commit/f863854fd9b329cbf2a6da91081af279fa17fa98))

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
