# Panduan Kontribusi

Terima kasih sudah mau berkontribusi. Dokumen ini menjelaskan cara menyiapkan lingkungan, alur kerja, dan batasan yang wajib dipatuhi.

## Sebelum mulai

Baca dulu dokumen berikut:

- [docs/architecture.md](docs/architecture.md): kontrak antar modul.
- [docs/responsible-use.md](docs/responsible-use.md): penggunaan yang bertanggung jawab.
- [.claude/rules/game-integrity.md](.claude/rules/game-integrity.md): aturan integritas game (WAJIB).

## Menyiapkan lingkungan

Gunakan Node.js 22. Minimal Node.js 20 juga didukung.

```bash
git clone https://github.com/ilramdhan/warga62-autoplay.git
cd warga62-autoplay
npm ci
npm run check
```

`npm run check` menjalankan lint, cek format, test, build, dan validasi manifest. Semuanya harus lolos sebelum membuka pull request.

## Alur kerja cabang

- Buat cabang baru dari `main`.
- Format nama cabang: `jenis/deskripsi-singkat`. Jenis yang dipakai: `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, atau `chore`.
- Contoh: `feat/strategi-pinjol`, `fix/modal-gadai-tidak-tertutup`.
- Gunakan huruf kecil dan tanda hubung.

## Format commit

Gunakan [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Contoh:

- `feat(runner): tambah opsi jumlah akun`
- `fix(extension): perbaiki status ganda di popup`
- `docs: perbarui panduan troubleshooting`

## Melaporkan modal game baru

Jika bot macet di modal yang belum dikenali:

1. Ambil screenshot modal tersebut.
2. Salin teks modal.
3. Buka DevTools (F12, atau Cmd+Option+I di Mac), lalu buka tab Console.
4. Filter dengan teks `[W62]` dan salin baris log yang muncul.
5. Buka issue [Modal game baru](https://github.com/ilramdhan/warga62-autoplay/issues/new?template=new_game_modal.yml) dan isi formulirnya.

Hapus data pribadi yang tidak perlu dari log sebelum mengunggahnya. Jangan pernah menyertakan cookie atau token.

## Aturan yang wajib dipatuhi

Pull request berikut akan ditolak:

- Fitur anti-deteksi, misalnya spoofing fingerprint, penyamaran user-agent, atau gerakan mouse palsu.
- Fitur untuk bergabung ke room publik atau membuat room publik.
- Prediksi RNG, misalnya membaca `game.seed`, `game.rng`, atau state acak lain untuk memprediksi dadu atau kartu.

Selain itu, patuhi seluruh [aturan integritas game](.claude/rules/game-integrity.md). Aksi hanya boleh lewat UI, room selalu Privat atau Teman, dan chat otomatis hanya di room yang dibuat sendiri. Bagian "Gunakan dengan bijak" di README juga tidak boleh dihapus.

## Pull request

- Isi seluruh bagian template pull request.
- Pastikan `npm run check` lolos di lokal.
- Perbarui dokumentasi dan tambahkan entri di `CHANGELOG.md` pada bagian `[Unreleased]` jika perilaku berubah.
- Uji hanya di game sungguhan dengan akun milik sendiri di room privat.
