# Handler

Urut menurut `priority` (kecil dicek lebih dulu). `run()` yang mengembalikan `false` berarti "tidak ada aksi" (tidak mereset watchdog).
Scope: `any` selalu berlaku; `home` di `/` dan `/online`; `lobby` di `/room/*` saat ada tombol "Bagikan link"/"Link tersalin"; `game` di `/room/*` selain itu.

| Prio | id              | Scope | Deteksi                                                                          | Aksi                                                                                                    |
| ---- | --------------- | ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 5    | error           | any   | `Muat ulang` / `Cari room lain`                                                  | ke `/` (jeda 15 dtk)                                                                                    |
| 10   | invite-incoming | any   | judul `<nama> mengajak mabar`                                                    | guest + dari hostName + tidak sedang main: `Gabung`; selain itu `Tutup`/`Nanti`                         |
| 12   | afk             | any   | `Aku kembali`                                                                    | klik                                                                                                    |
| 15   | money-request   | game  | judul `<nama> minta uang` + `Tolak`                                              | `policy.respondMoneyRequest` -> `Kirim Rp…` / `Tolak`                                                   |
| 20   | order           | game  | `Lempar ulang`, `Mulai main` (bukan lobby), `Lanjut` saat `order_roll`           | klik                                                                                                    |
| 22   | endgame         | game  | `game_over`, `Lewati N/M`, `Bagikan hasil`, `Mulai lagi`                         | `Lewati` sekali (memo), `Lanjut`, host `Mulai lagi`/`Main lagi`                                         |
| 30   | debt            | game  | `Jual +Rp`, `Gadai +Rp`, `Ambil Pinjol`, `Bangkrut`, `Ya, bangkrut`, `Kas minus` | `policy.debtStep`; `Ya, bangkrut` hanya bila langkah bangkrut dipilih (memo 30 dtk), selain itu `Batal` |
| 35   | court           | game  | `Kocok dadu sekarang`                                                            | `Pakai …` bila `policy.useKeepCard`, else kocok                                                         |
| 38   | joki-dadu       | game  | `Jalan ke …` / `Pakai Joki, jalan ke …`                                          | `policy.jokiDadu` (ketuk dadu) atau jalan apa adanya                                                    |
| 40   | toll            | game  | tombol berakhiran `petak ke depan`                                               | `policy.chooseToll` (petak dari nama gerbang atau posisi + N)                                           |
| 42   | buy             | game  | `Tidak beli`                                                                     | `policy.shouldBuy`; `Flash Sale` bila `useKeepCard`                                                     |
| 44   | takeover        | game  | `Ambil alih Rp…`                                                                 | `policy.shouldTakeover`                                                                                 |
| 46   | upgrade         | game  | `Tidak bangun`                                                                   | centang sesuai `policy.chooseUpgrades`, `Bangun`, tunggu `buildDelayPerTileMs` x n                      |
| 48   | choice          | game  | `Bayar Rp…` atau fase `awaiting_choice`                                          | `policy.chooseOption` (urutan tombol = opsi)                                                            |
| 50   | keep            | game  | `Pakai …` (bukan pengadilan/joki)                                                | `policy.useKeepCard` -> `Pakai` / `Tidak usah`                                                          |
| 52   | pick            | game  | judul `Pilih kota.` / `Pilih pemain.`                                            | `policy.chooseTile` / `choosePlayer`, else `Lewati`                                                     |
| 54   | loan-offer      | game  | `Terima N%` (peminjam) / `N%` + `Tawarkan` (pemberi)                             | `policy.acceptLoan` / `lendOffer`                                                                       |
| 56   | trade           | game  | `Terima tawaran`                                                                 | `policy.respondTrade`                                                                                   |
| 58   | card-continue   | game  | `Lanjut` aktif                                                                   | klik                                                                                                    |
| 60   | pre-roll        | game  | dok giliran terlihat + `policy.preRoll` tidak kosong                             | kirim uang / tebus / gadai / bayar jaminan (maks 2 percobaan per aksi per ronde)                        |
| 70   | roll            | game  | tombol `aria-label` "Kocok dadu:" aktif, giliran saya                            | `holdRoll` ke `policy.rollTarget`                                                                       |
| 80   | lobby-configure | lobby | host, belum dikonfigurasi di room ini                                            | `Atur` -> opsi dari `cfg.room` (akses publik ditolak) -> `Selesai`/`Tutup`                              |
| 82   | lobby-invite    | lobby | host, akun hilang dan sudah lewat `inviteRetryMs` / modal terbuka                | `Undang teman` -> `Undang` hanya nama di `cfg.accounts` -> `Tutup`                                      |
| 84   | lobby-start     | lobby | host, `Mulai main` aktif                                                         | cukup akun hadir (semua, atau jendela undangan lewat) dan room terkonfigurasi aman                      |
| 90   | join-page       | any   | guest di `/room/*`, bukan lobby, `Gabung`                                        | klik                                                                                                    |
| 95   | online          | home  | host di `/online`, `Buat room`                                                   | klik                                                                                                    |
| 96   | home            | home  | host di `/`, link `Main Online`                                                  | klik                                                                                                    |

Fallback tanpa state/policy: beli ya, bangun tidak, pilihan kartu opsi pertama, kartu simpanan dipakai, tol gerbang pertama, kocok perfect, utang jual -> gadai -> pinjaman -> bangkrut.
