# Aturan kode

- ES module, Node ≥ 20, browser Chrome ≥ 114. Tanpa TypeScript; pakai JSDoc untuk tipe yang melintasi modul.
- `src/core/**` tidak boleh memakai `chrome.*` atau API Node. `src/extension/**` boleh `chrome.*`. `src/runner/**` boleh Node + Playwright.
- Strategi (`src/core/strategy/**`) dan `state/view.js` harus **murni**: tanpa DOM, tanpa waktu, tanpa random. Mudah dites.
- Jangan pernah melempar error dari strategi; kembalikan default aman.
- Teks tombol dicocokkan setelah dinormalisasi (`norm()` di `dom/query.js`): lowercase, spasi dirapikan. Jangan pakai `innerText` (terpengaruh CSS uppercase).
- Satu `run()` handler = satu keputusan. Tunggu animasi dengan `act.sleep` / `act.waitFor`, jangan loop panjang tanpa batas waktu.
- Log ke pengguna dalam Bahasa Indonesia, singkat, contoh: `beli Makassar (Rp1,1 jt)`.
- Format dengan Prettier, lint dengan ESLint (`npm run lint`).
