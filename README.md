# Warga +62 Autoplay

[![CI](https://github.com/ilramdhan/warga62-autoplay/actions/workflows/ci.yml/badge.svg)](https://github.com/ilramdhan/warga62-autoplay/actions/workflows/ci.yml)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-blue)
![Node 20+](https://img.shields.io/badge/node-%3E%3D20-green)
![License MIT](https://img.shields.io/badge/license-MIT-lightgrey)

Bot auto-play untuk **[Warga +62](https://mainwarga62.id)**, game monopoli satir Indonesia. Bot ini mengurus satu pertandingan penuh: membuat room, mengundang akun-akunmu, mengocok dadu tepat di zona ★ Perfect, mengambil keputusan beli/bangun/gadai/pinjam, hingga memulai game berikutnya. Semua itu hanya untuk **akun milik sendiri di room Privat/Teman**.

> [!WARNING]
> **Gunakan dengan bijak.** Pakai hanya dengan akun-akun milikmu sendiri di room Privat atau Teman yang kamu buat. Jangan memakainya di room publik atau melawan pemain lain. Proyek ini tidak berafiliasi dengan developer Warga +62. Bot bisa melanggar ketentuan game dan berisiko membuat akun diblokir, dan risiko itu ditanggung sendiri. Dukung developernya: game ini dibuat oleh developer indie dan dibiayai donasi. Baca [docs/responsible-use.md](docs/responsible-use.md).

## Fitur

- **Dua mode**
  - **Grinding XP**: satu akun ditetapkan sebagai pemenang. Akun lain mengirim seluruh kasnya ke pemenang, tidak membeli apa pun, lalu bangkrut, sehingga game selesai cepat dan langsung diulang.
  - **Arena pintar** (2–8 akun milikmu): setiap akun bermain untuk menang sendiri-sendiri. Keputusannya memperhitungkan nilai tanah, monopoli provinsi, risiko sewa lawan, fase Krisis, tingkat kesulitan, pinjaman antar pemain (bunga 0/10/25/50%), dan Pinjol.
- **Kocokan Perfect otomatis**: membaca posisi jarum di setiap frame, jadi tepat di zona ★ dan tidak bergantung ukuran layar.
- **Semua modal ditangani**: kartu Takdir/Musibah/Krisis, kartu pilihan, Joki Dadu, gerbang tol, pengadilan, Lapas, bangun saat gajian, ambil alih, Gali Lubang (jual/gadai/pinjam/Pinjol/bangkrut), tukar tanah, permintaan uang, layar akhir (`Lewati N/M` → `Lanjut` → `Mulai lagi`).
- **Atur room otomatis** lewat tombol _Atur_: akses, mode, tingkat, modal, jumlah pemain, peta, dan malam penghargaan. Room selalu Privat atau Teman.
- **Perencana pencapaian**: memilih aturan room dan perilaku bot untuk mengejar pencapaian di halaman Profil, misalnya Segala cuaca, Turis Domestik, atau Napi Teladan.
- **Chat & stiker** di room sendiri (opsional), misalnya stiker otomatis saat ada yang bangkrut.
- **Tahan banting**: watchdog, kembali ke beranda saat error atau macet, penanganan AFK (`Aku kembali`), dan auto-retry.
- **Dua cara menjalankan**
  - **Extension Chrome**: panel kecil dan halaman pengaturan yang ramah.
  - **Runner Playwright**: menjalankan banyak akun sekaligus di latar belakang. Game tetap jalan walaupun kamu memakai komputer untuk hal lain.

## Mulai cepat

### Opsi A: Extension Chrome

1. Unduh `warga62-autoplay-extension-v*.zip` dari [Releases](https://github.com/ilramdhan/warga62-autoplay/releases) (atau `npm run build`), lalu ekstrak.
2. Buka `chrome://extensions`, nyalakan **Developer mode**, klik **Load unpacked**, lalu pilih folder hasil ekstrak.
3. Ulangi di setiap profil Chrome. Satu profil berisi satu akun.
4. Klik ikon extension → **Pengaturan lengkap**: isi nick akun ini, daftar semua akunmu, host, dan mode.
5. Buka mainwarga62.id di setiap profil, lalu tekan **START** di popup. Mulai dari akun guest, baru host.

> Chrome menghentikan halaman yang di-minimize atau berada di tab belakang. Letakkan tiap jendela game di desktop terpisah dan jangan di-minimize, atau pakai Opsi B. Lihat [docs/troubleshooting.md](docs/troubleshooting.md).

Detail: [docs/extension.md](docs/extension.md)

### Opsi B: Runner Playwright (direkomendasikan untuk jalan di latar belakang)

```bash
git clone https://github.com/ilramdhan/warga62-autoplay.git
cd warga62-autoplay
npm ci
npx playwright install chromium
npm run build
cp src/runner/runner.config.example.json runner.config.json   # lalu edit nick akun
npm run runner -- login --account ilramdhan.dev              # login manual sekali per akun
npm run runner -- login --account JULE
npm run runner -- run --config runner.config.json
```

Detail: [docs/runner.md](docs/runner.md)

## Dokumentasi

| Dokumen                                            | Isi                                   |
| -------------------------------------------------- | ------------------------------------- |
| [docs/architecture.md](docs/architecture.md)       | Arsitektur & kontrak modul            |
| [docs/strategy.md](docs/strategy.md)               | Cara bot mengambil keputusan          |
| [docs/achievements.md](docs/achievements.md)       | Pencapaian yang bisa diotomatisasi    |
| [docs/ui-labels.md](docs/ui-labels.md)             | Label tombol & fakta DOM game         |
| [docs/handlers.md](docs/handlers.md)               | Daftar handler modal                  |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Masalah umum                          |
| [docs/responsible-use.md](docs/responsible-use.md) | Gunakan dengan bijak                  |
| [CLAUDE.md](CLAUDE.md)                             | Konteks proyek untuk AI & kontributor |

## Struktur

```text
src/core/        logika bot (dipakai extension & runner)
  handlers/      satu file per situasi layar
  strategy/      keputusan: grind, smart, risk, planner
  state/         baca state game & data turunan
  data/          data papan, kartu, pencapaian
src/extension/   Chrome extension MV3 (popup, options, bridge)
src/runner/      CLI Playwright
scripts/         build, validasi, ikon
test/            node:test
docs/            dokumentasi
```

## Kontribusi

Lihat [CONTRIBUTING.md](CONTRIBUTING.md). Modal baru yang belum ditangani? Buka issue **New game modal** dan sertakan teks modal serta baris log `[W62]`. Semua kontribusi wajib mematuhi [aturan integritas](.claude/rules/game-integrity.md).

## Lisensi

[MIT](LICENSE) © 2026 ilramdhan
