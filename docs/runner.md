# Playwright runner

Runner membuka satu browser Chromium terpisah untuk tiap akun (profil sendiri-sendiri) dan menjalankan bot yang sama dengan extension. Cocok untuk menjalankan 2 sampai 8 akun sekaligus tanpa jendela terbuka.

> **Gunakan dengan bijak.** Hanya untuk akun milikmu sendiri di room **Privat** atau **Teman**.

## 1. Persiapan (sekali saja)

1. Pasang Node.js 20 atau lebih baru. Di macOS: `brew install node` (atau unduh dari nodejs.org). Cek dengan `node -v`.
2. Di folder proyek:

   ```bash
   npm ci
   npx playwright install chromium
   npm run build
   ```

3. Salin contoh konfigurasi dan sesuaikan:

   ```bash
   cp src/runner/runner.config.example.json runner.config.json
   ```

## 2. Login tiap akun (manual)

Untuk setiap nick:

```bash
npm run runner -- login --account ilramdhan.dev
```

Jendela Chromium terbuka. Login seperti biasa, pastikan kamu sudah masuk, lalu tutup jendelanya. Sesi tersimpan di `.runner-profiles/<nick>`.

> **Folder `.runner-profiles/` berisi cookie login akunmu.** Jaga tetap privat: jangan di-commit, di-zip, atau dibagikan. Folder ini sudah ada di `.gitignore`.

## 3. Jalankan

```bash
npm run runner -- doctor
npm run runner -- run --config runner.config.json
```

Tambahkan `--headful` untuk melihat jendela browser. Tekan `Ctrl+C` untuk berhenti dengan rapi.

Runner menjalankan guest lebih dulu, host terakhir (jeda 2 detik). Log tiap akun tampil di terminal dengan warna berbeda. Jika halaman crash atau tertutup, runner membuka ulang; jika gagal membuka situs, ia mencoba lagi dengan jeda yang makin lama; jika tidak ada event lebih dari `timing.watchdogMs`, halaman dimuat ulang ke `/`.

## Field `runner.config.json`

Bentuknya sama dengan konfigurasi extension, ditambah:

| Field          | Arti                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `headless`     | `true` (bawaan) tanpa jendela; `--headful` menimpa                                                                                      |
| `accounts`     | 2 sampai 8 nick milikmu                                                                                                                 |
| `hostName`     | nick host; akun ini jadi `host`, sisanya `guest`                                                                                        |
| `winnerName`   | akun pemenang untuk mode `grind`                                                                                                        |
| `mode`         | `grind` (Grinding XP) atau `arena` (Arena pintar)                                                                                       |
| `room`         | `access` (`privat`/`teman`), `mode`, `difficulty`, `startingCash` (5/10/15), `maxPlayers` (4/6/8), `map`, `awards`, `autoByAchievement` |
| `achievements` | `enabled`, `targets` (id pencapaian; kosong = otomatis)                                                                                 |
| `strategy`     | `riskTolerance` 0 sampai 1, `reserveRounds`, `lendInterest`, `usePinjol`                                                                |
| `chat`         | `enabled`, `stickers`, `quickPhrases`, `customPhrases`                                                                                  |
| `timing`       | `tickMs`, `actionDelayMs` [min, maks], `buildDelayPerTileMs`, `watchdogMs`, `minStartPlayers`, `inviteRetryMs`                          |
| `debug`        | log lebih rinci                                                                                                                         |

`myName` dan `role` diisi otomatis per akun.

## Kenapa tetap jalan saat Mac dipakai untuk hal lain?

Tiap akun berjalan di jendela Chromium sendiri (biasanya headless), terpisah dari Chrome yang kamu pakai sehari-hari. Runner mematikan pelambatan timer latar belakang (`--disable-background-timer-throttling`, `--disable-renderer-backgrounding`, `--disable-backgrounding-occluded-windows`), jadi bot tidak ikut melambat ketika jendela tertutup aplikasi lain atau layar dikunci. Yang tetap perlu: Mac tidak tidur (pakai `caffeinate -d` di terminal lain atau atur Energy Saver) dan koneksi internet stabil.

## Masalah umum

- `dist/bot.js belum ada`: jalankan `npm run build`.
- Sesi kedaluwarsa (bot berhenti di halaman login): jalankan `login --account <nick>` lagi.
- Playwright belum terpasang: `npm ci` lalu `npx playwright install chromium`.
