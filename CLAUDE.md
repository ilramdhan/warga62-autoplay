# CLAUDE.md — konteks proyek untuk AI & kontributor

Bot auto-play untuk **Warga +62** (game monopoli Indonesia, https://mainwarga62.id) yang dipakai **hanya** dengan akun milik sendiri di room Privat/Teman. Ada dua cara menjalankan bot dengan kode inti yang sama:

- **Chrome extension (MV3)**: `src/extension/` → `dist/extension/` (Load unpacked).
- **Playwright runner**: `src/runner/cli.js`, menjalankan banyak akun sekaligus di latar belakang (headless).

## Wajib dibaca sebelum mengubah kode

1. `.claude/rules/game-integrity.md` — batasan yang **tidak boleh** dilonggarkan (tanpa prediksi RNG, aksi hanya lewat UI, tanpa anti-deteksi, room privat saja).
2. `docs/architecture.md` — kontrak antar modul (config, protokol host⇄bot, Handler, Policy, View).
3. `docs/ui-labels.md` — label tombol & fakta DOM yang sudah diverifikasi di game asli.
4. `.claude/rules/coding.md`, `.claude/rules/handlers.md`, `.claude/rules/testing.md`.

## Peta kode

| Path                     | Isi                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `src/core/entry-page.js` | Entry bundle `bot.js` (MAIN world). Terima config, buat bot, kirim event.                |
| `src/core/engine.js`     | Loop, pemilihan handler, watchdog, AFK, pemulihan error.                                 |
| `src/core/handlers/`     | Satu file per situasi layar (beli, tol, gadai, lobby, …). Urutan di `handlers/index.js`. |
| `src/core/strategy/`     | Keputusan murni: `grind.js`, `smart.js`, `risk.js`, `planner.js`.                        |
| `src/core/state/`        | `reader.js` membaca state game dari React fiber; `view.js` data turunan untuk strategi.  |
| `src/core/data/`         | Data papan, kartu, pencapaian.                                                           |
| `src/core/dom/`          | Helper query/klik/kocok/rupiah.                                                          |
| `src/extension/`         | manifest, bridge (ISOLATED), popup, options, background.                                 |
| `src/runner/`            | CLI Playwright (`login`, `run`, `doctor`).                                               |
| `scripts/`               | build (esbuild), validasi manifest, ikon.                                                |
| `test/`                  | `node:test`, tanpa dependency.                                                           |

## Perintah

```bash
npm ci                 # pasang dependency
npm run check          # lint + format:check + test + build + validate (sama dengan CI)
npm run build          # dist/bot.js, dist/extension/, dist/*.zip
npm test
npm run runner -- doctor
```

## Cara menambah dukungan modal baru

1. Catat teks modal & label tombol persis (teks dirender uppercase lewat CSS; pakai `textContent`).
2. Tambahkan ke `docs/ui-labels.md`.
3. Buat/ubah handler di `src/core/handlers/` (detect murni + run satu keputusan), daftarkan di `handlers/index.js` dengan prioritas yang tepat.
4. Kalau butuh keputusan, tambahkan method ke Policy (`docs/architecture.md`) dan implementasikan di `grind.js` **dan** `smart.js`, plus tes.
5. `npm run check`.

## Konvensi

- JavaScript ES module, tanpa TypeScript; JSDoc untuk tipe penting. Prettier (120 kolom, single quote).
- Pesan log & UI dalam Bahasa Indonesia; identifier dalam bahasa Inggris.
- Strategi = fungsi murni sinkron, tidak menyentuh DOM. Handler = satu aksi per `run()`.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
