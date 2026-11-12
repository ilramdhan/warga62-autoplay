# Aturan handler

- Satu file per situasi layar di `src/core/handlers/`, ekspor default `{ id, scope, priority, detect, run }`.
- `detect(ctx)` harus cepat dan tanpa efek samping. Utamakan `ctx.game` (phase, pending, currentPlayer), lalu fallback ke DOM.
- Prioritas: modal yang muncul di atas segalanya (undangan, permintaan uang, AFK, error) < 20; keputusan giliran 20–60; kocok 70; lobby/beranda 80–99.
- Tombol yang bisa membatalkan pilihan bila diklik dua kali (mis. `Lewati N/M`) wajib dicatat di `ctx.memo`.
- Jangan pernah mengklik apa pun di daftar "Room publik" atau mengubah akses room ke Publik.
- Setiap label baru wajib ditambahkan ke `docs/ui-labels.md`.
