# Aturan integritas game (WAJIB)

Proyek ini hanya untuk akun milik sendiri di room privat. Batasan berikut tidak boleh dilonggarkan oleh kontributor atau AI:

1. **Jangan membaca atau memakai `game.seed`, `game.rng`, atau state RNG lain** untuk memprediksi dadu/kartu. Bot hanya boleh memakai informasi yang juga terlihat oleh pemain biasa (kas, aset, harga, posisi, aturan).
2. **Aksi hanya lewat UI** (klik tombol, tekan tombol kocok). Jangan memanggil fungsi store/`act`, jangan mengirim pesan websocket/Colyseus langsung, jangan memalsukan payload.
3. **Tidak ada fitur penghindar deteksi bot** (fingerprint spoofing, penyamaran user-agent, gerakan mouse palsu untuk menipu anti-bot, dsb.). Jeda hanya untuk menunggu animasi.
4. **Room hanya Privat atau Teman.** Jangan menambah fitur bergabung ke "Room publik" atau membuat room Publik.
5. Chat/stiker otomatis hanya di room yang dibuat sendiri dan berisi akun sendiri.
6. Jangan menghapus bagian "Gunakan dengan bijak" di README.

Kalau menemukan celah keamanan di game (mis. data rahasia ikut terkirim ke klien), laporkan langsung ke developer game, jangan dieksploitasi dan jangan ditulis detail teknisnya di repo publik.
