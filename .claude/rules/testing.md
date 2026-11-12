# Aturan tes

- Pakai `node:test` + `node:assert/strict`, tanpa dependency. File di `test/*.test.js`.
- Strategi: buat objek `game` palsu minimal lalu `buildView()`; uji keputusan, bukan detail implementasi.
- Parser (rupiah, label) wajib punya tes untuk format `Rp9,9 jt`, `Rp900 rb`, `−Rp1 jt`.
- Perubahan perilaku di game asli diuji manual dengan akun sendiri di room Privat, lalu catat di PR.
