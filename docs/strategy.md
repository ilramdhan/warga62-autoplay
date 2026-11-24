# Strategi bot

Lapisan strategi ada di `src/core/strategy/` dan `src/core/state/view.js`. Semua fungsinya murni dan sinkron:
tidak menyentuh DOM, tidak memakai API Chrome/Node, dan tidak pernah melempar error (kalau ada yang aneh, kembali
ke pilihan aman). Bot **tidak** membaca `game.seed` / `game.rng` dan tidak menebak dadu; semua peluang di sini
adalah hitungan biasa yang juga bisa dilakukan pemain manusia.

## API

```js
import { buildView } from './state/view.js';
import { createPolicy, planAchievements } from './strategy/index.js';

const plan = planAchievements(ACHIEVEMENTS, progress, cfg); // { targetIds, roomPreset, policyFlags, ... }
const policy = createPolicy({ ...cfg, policyFlags: plan.policyFlags });
const view = buildView(game, meId, cfg);
policy.shouldBuy(view, { tile: 5, price: 500_000 }); // true/false
policy.lastReason; // alasan keputusan terakhir (untuk log)
```

`cfg.explain(reason)` (opsional) dipanggil setiap kali policy membuat keputusan.

### View (`buildView(game, meId, cfg)`)

Selain field di `docs/architecture.md`, View juga menyediakan: `gameMode` (`survival`/`ronde`), `roundsLeft`,
`difficultyKey`, `fees` (pajak, tol, parkir, denda Razia, jaminan — sudah dikali tingkat & Krisis), `loans`,
`player(idAtauNama)`, `idOf`, `ownsProvince`, `provinceCount`, `completeProvinces`, `isTakeoverSafe`,
`takeoverPrice`, `debtOf`, `tilesOf`, `isJailed`, `pinjolAvailable`, `winner`.

- `mode` = mode bot (`grind`/`arena`), bukan mode game. Mode game ada di `gameMode` / `settings.mode`.
- `rentAt(i, level?, asOwner?)`: tanpa argumen tambahan = sewa nyata (0 kalau digadai/tak bertuan). Dengan
  `level`/`asOwner` = sewa hipotetis (dipakai untuk menilai beli/bangun).
- `netWorth(id)` = kas + harga tanah + biaya bangunan + piutang (`receivablesOf`: pinjaman aktif ke pemain lain,
  jumlah tagihan) − utang, sesuai rumus peringkat mode Ronde di "Cara Main". Tanah gadai dihitung
  `harga × (1 − rasio tebus)`; aturan hanya menyebut "harga tanah", jadi apakah game menilai tanah gadai dengan
  harga penuh **perlu verifikasi di game** (valuasi konservatif ini sengaja dipertahankan).
- `treasury` = Kas Negara (`game.stateTreasury`). `turn` = `{ dice, doubles, salary }` giliran berjalan, dibaca dari
  `game.lastRoll|lastDice|dice` dan `game.salaryThisTurn|passedStartThisTurn|pending.salaryTurn` (bentuk **perlu
  verifikasi di game**; tanpa data semuanya `undefined`/`null`).
- Tingkat bisa ditulis `easy/medium/hard/extreme` atau `santai/normal/inflasi/krismon`.

## Model peluang (`risk.js`)

- 2d6. Zona **Perfect** menggandakan peluang kembar, **Cupu** membaginya dua; sisa peluang dibagi rata ke hasil
  non-kembar. Kembar tidak memberi giliran tambahan, jadi satu giliran = satu gerakan.
- Mendarat di Gerbang Tol dianggap pindah ke gerbang lain.
- **Lemparan satu dadu** (Razia, Pengadilan; `singleDieOdds(target, rolls)`): Biasa/Cupu satu dadu; **Perfect**
  melempar dua dadu dan mengambil yang **tertinggi** (P(maks ≤ k) = (k/6)²). Razia: Lapas (1–2) 1/3 Biasa/Cupu,
  **1/9** Perfect; denda (3–6) 2/3 vs **8/9**. Pengadilan: menang (5–6) 1/3 vs **5/9**, Lapas + denda (3–4) 1/3 vs
  **1/3**, Lapas + sita (1–2) 1/3 vs **1/9**. `visitProbabilities` dan `landingCost(view, id, t, target)` memakai zona
  lempar pemain. Lama tinggal di Lapas tidak dimodelkan di gerak (keluar Lapas langsung di giliran berikut).
- **Biaya masuk Lapas** (`jailCost`) = jaminan + ekspektasi sewa kota kita (tak tergadai) yang masuk Negara selama
  satu putaran lawan. Razia = P(Lapas) × biaya Lapas + P(denda) × denda; Pengadilan menambahkan biaya Lapas ke
  hasil denda dan sita.
- `visitProbabilities(from, turns)` = ekspektasi berapa kali tiap petak didarati dalam N giliran.
- `expectedRentExposure(view, id, turns)` = ekspektasi pengeluaran (sewa + pajak/tol/parkir/Razia/Pengadilan/
  Musibah) dan `worst` = biaya terbesar yang peluangnya ≥ 2%.
- `recommendedReserve` = ekspektasi + (1 − riskTolerance) × kasus terburuk.
- `policyReserve(view, { riskTolerance, reserveRounds, flags, target })` = cadangan yang dipakai policy smart **dan**
  Monitor (lihat "Cadangan kas" di bawah), supaya angka di Monitor sama dengan yang dipakai keputusan.
- **Zona lempar**: bot melempar Perfect (default `rollTarget`), jadi cadangan, ekspektasi biaya, kunjungan lawan,
  dan pemasukan sewa (`expectedRentIncome(..., { target })`) dihitung dengan distribusi `rollTarget`. Lawan di
  arena juga bot milik pengguna dengan default yang sama, jadi gerak lawan memakai distribusi yang sama.
- Kerugian rata-rata kartu Musibah diasumsikan Rp300 rb × pengali biaya tingkat (`MUSIBAH_EXPECTED_LOSS`), karena
  isi dek tidak dicatat.
- Pengadilan: −menang × P(5–6) + (denda + Lapas) × P(3–4) + (sita + Lapas) × P(1–2). **Pengacara** (lempar dua
  kali, ambil terbaik) menggandakan jumlah dadu yang diambil maksimumnya (Biasa: 5/9, 1/3, 1/9; Perfect: maks empat
  dadu). Dengan **Orang Dalam** putusan buruk dibatalkan, tinggal −menang × P(5–6).

## Mode grind (`grind.js`)

Satu akun (`winnerName`) dibuat menang; akun lain jadi feeder. Peran dicek setiap keputusan dari View.

**Feeder**: sebelum lempar mengirim seluruh kas ke pemenang (minimal Rp100 rb), tidak beli/bangun/ambil alih,
memilih opsi "bayar" di kartu pilihan, menerima permintaan uang & tawaran tukar hanya dari pemenang, tol & Joki
Dadu diarahkan ke kota pemenang. Saat Gali Lubang: jual → gadai → bangkrut. Kalau flag
`holdBankruptUntilRound` aktif dan ronde belum sampai, feeder menyisakan kas cadangan (kelipatan Rp100 rb),
minta pinjaman, lalu Pinjol sebelum bangkrut. Kalau pemenang tidak ada di meja, feeder main normal (smart).

**Pemenang**: memakai otak smart dengan toleransi risiko tinggi, beli & bangun semua yang terjangkau (sisakan
cadangan kecil; kota tergadai tidak dibangun), ambil alih kota yang tidak aman, tidak pernah membayar permintaan uang
feeder, meminjamkan ke feeder hanya bila flag meminta (0% saat menahan bangkrut, atau bunga tetap untuk pencapaian
Koperasi). Sebelum lempar: bayar jaminan, lunasi utang mahal/hampir jatuh tempo (aturan sama dengan smart), lalu
tebus gadai dengan urutan provinsi lengkap dulu. Gali Lubang: kalau flag `wantPinjol` → Pinjol; selain itu memakai
`debtStep` smart (kerugian per rupiah terkecil), jadi kota lepas digadai sebelum bangunan provinsi lengkap dijual.

Feeder menawarkan pinjaman 0% kalau peminjamnya pemenang (jumlah harus diketahui dan sisa kas feeder ≥ ekspektasi
pengeluaran 1 giliran); ke pemain lain tidak meminjamkan. Pemenang meminjamkan ke feeder hanya kalau sisa kas ≥ 1,5×
cadangan pemenang dan pemenang tidak berutang.

## Mode arena (`smart.js`)

Setiap akun main sendiri untuk menang, tanpa kerja sama.

- **Cadangan kas**: `recommendedReserve` (ekspektasi biaya 2 giliran + (1 − toleransi) × kasus terburuk), minimal
  `(1,3 − toleransi) ×` sewa terbesar yang mungkin didarati, ditambah setengah eskalasi Krisis kalau Krisis aktif
  (dan game tidak mengirim pengali sewa aktual), ditambah utang yang jatuh tempo ≤ 2 giliran. Semua dari tabel
  tingkat (Santai/Normal/Inflasi/Krismon). Implementasinya `policyReserve` di `risk.js`.
- **Beli**: harga tanah tetap dihitung di kekayaan bersih, jadi biaya sebenarnya likuiditas + Pajak Tahunan (dihitung
  per properti). Syarat sisa kas: **melengkapi provinsi** 40% cadangan, **menggagalkan provinsi lawan** 70%,
  provinsi yang masih bisa kita lengkapi = cadangan + **dana bangun**, kota di provinsi yang sudah dimiliki lawan =
  1,5× cadangan + dana bangun. Dana bangun = biaya satu putaran bangun di provinsi lengkap kita (atau setengah
  biaya bangun kalau belum punya provinsi lengkap). Tanpa dana ini kas habis untuk tanah dan bot tidak pernah bisa
  membangun, padahal tambahan sewa per rupiah bangunan ~4× tanah.
- **Bangun**: kota di provinsi lengkap selalu didahulukan dan boleh memakai kas sampai
  `max(35% cadangan, min(75% cadangan, ½ kekayaan bersih + utang jatuh tempo))` (bangunan bisa dijual lagi saat
  Gali Lubang); kota lain sampai 100% cadangan. Kalau utang > kas, tidak membangun sama sekali. Di dalam kelompok, urut skor = tambahan sewa ×
  ekspektasi kunjungan lawan ÷ biaya, dikali bonus hotspot (2–12 langkah setelah START, Lapas, gerbang tol) dan
  Perumahan Elit ×1,25 (aman dari ambil alih). Kota tergadai tidak dibangun.
- **Ambil alih**: premi (harga − nilai kota) hilang permanen, jadi hanya dipertimbangkan kalau kota itu
  **melengkapi provinsi kita** atau **menggagalkan provinsi lawan** (pemilik punya 2/3 dan kota ketiga masih
  kosong). Syarat: sisa kas ≥ 1,2× cadangan (+ biaya satu bangunan kalau melengkapi), dan manfaat (sewa kota ini +
  sewa KPR Subsidi dua kota lain di provinsi selama ≤ 20 giliran, bonus menggagalkan) ≥ premi ×
  (1,3 + 0,6 × (1 − toleransi)) × k. Premi dibayar ke pemilik, jadi k = 1,5 kalau pemilik pemimpin kekayaan bersih,
  0,8 kalau pemilik paling lemah, selain itu 1. Kota aman (Elit, provinsi penuh, gadai, Negara)
  ditolak; di mode Ronde ≤ 3 ronde terakhir tidak ambil alih.
- **Tol**: tiap gerbang dinilai dari ekspektasi biaya 2 giliran berikut, peluang gajian, dan peluang mendarat di
  kota kosong. Gerbang yang melompati START dikurangi satu gaji (lewat tol tidak gajian).
- **Kartu pilihan**: tiap opsi diberi biaya: nominal bayar, "lewati N giliran" (tempo hilang dikurangi sewa yang
  terhindar), atau "kota termurah disita" (nilai kota termurah, ×3 kalau kota itu bagian provinsi lengkap kita,
  sama seperti `chooseTile`; 0 kalau tak punya kota).
- **Gali Lubang**: dari semua opsi jual/gadai pilih kerugian per rupiah terkecil. Jual bangunan rugi
  (biaya − refund) + sewa yang hilang (8 giliran); gadai rugi selisih tebus + sewa yang hilang, ×1,5 kalau bagian
  provinsi lengkap. Kalau Pinjol tersedia bersamaan dan plafonnya cukup, Pinjol dipilih bila bunganya lebih kecil
  dari kerugian per rupiah opsi terbaik (mis. jual rumah di provinsi lengkap); pinjaman pemain dipilih bila opsi
  terbaik rugi > 25% + nilai penyelamat per rupiah. Pinjaman pemain hanya **sekali per game**, jadi nilai penyelamat
  = 35% (bot menjual/menggadai dulu), kecuali sisa ronde ≤ tempo pinjaman + 1 (nilai 0). Setelah aset habis: pinjam pemain → Pinjol → pinjam lagi / Pinjol walau kurang →
  bangkrut **hanya** kalau tidak ada pinjaman maupun Pinjol (Krismon tidak punya Pinjol).
- **Lunasi utang** (`preRoll` → `{type:'repay'}`, tombol `Bayar utang`): kalau ada pinjaman/Pinjol dengan
  `turnsLeft ≤ 1` dan kas ≥ utang, **selalu** dilunasi tanpa melihat cadangan (telat Pinjol = semua tanah disita
  Negara; telat pinjaman pemain = ditagih paksa dari kas, bangunan, lalu tanah). Sama untuk pemenang grind. Selain
  itu: kalau kas − utang ≥ cadangan dan utangnya
  mahal (Pinjol atau bunga ≥ 25%) atau jatuh tempo ≤ 1 giliran. Kalau rincian pinjaman tidak diketahui, hanya
  kalau kas − utang ≥ 1,5× cadangan.
- **Tebus gadai**: kota di provinsi lengkap kalau kas sisa ≥ 1,5× cadangan; kota lain baru kalau ≥ 2,5× cadangan
  (tebus lebih mahal dari hasil gadai). Tidak menebus di ronde terakhir.
- **Meminjamkan** (`assessLoan` + `loanDefaultProbability` di `risk.js`): tolak kalau peminjam tidak dikenal,
  bangkrut, atau masih punya utang lain; jumlah pinjaman tidak diketahui; kita sendiri berutang; sisa ronde
  ≤ tempo pinjaman + 1; kas − jumlah < 1,5× cadangan; jumlah > 25% kas di atas cadangan; atau peminjam lebih kaya.
  Peluang gagal bayar = 1,25 − 0,4 × cakupan (5–95%), cakupan = (kas peminjam setelah pinjaman + gaji selama tempo
  - ½ nilai cair kota tak tergadai − ekspektasi sewa selama tempo − utang lain) ÷ tagihan. Pinjaman yang tidak
    menutup kekurangan kas peminjam dianggap gagal bayar 95%. EV = tagihan × (1 − pDefault) − jumlah. Bunga dipilih
    dari opsi dengan EV > margin (maks(Rp50 rb, 5%)) dan pDefault ≤ 35%; EV yang hampir sama memilih bunga lebih
    rendah (bunga tinggi menaikkan risiko gagal bayar). `strategy.lendInterest` angka tetap dipakai hanya kalau EV-nya
    positif. Utang/piutang pemain bangkrut hangus, jadi View membuang pinjaman yang peminjam/pemberinya bangkrut.
- **Handler pemberi** (`loan-offer`): peminjam dibaca dari `game.pending` (`borrowerId|borrower|requester|playerId|from`),
  lalu satu nama pemain lain di modal, lalu `currentPlayer` saat fase `awaiting_loan`/`debt`; jumlah dari
  `pending.amount`, lalu teks berlabel (pinjam/butuh/kurang/jumlah) atau satu-satunya nominal di modal. Salah satu tidak
  diketahui atau policy `null` → tolak (`Tolak`/`Batal`/`Tutup`/`Nanti`/X/Escape). **Tidak pernah** mengklik `Tawarkan`
  tanpa persetujuan policy; tanpa tombol tolak tawaran dibiarkan kedaluwarsa.
- **Terima pinjaman**: bunga terendah. Tawaran ditolak demi Pinjol hanya kalau Pinjol lebih murah, tombol Pinjol di
  layar Gali Lubang memang aktif (`canPinjol !== false`), dan plafon Pinjol ≥ kekurangan (`owe`).
- **Permintaan uang**: default tolak; hanya terima ≤ Rp100 rb, peminjam bukan pemimpin, kas tetap ≥ 2× cadangan.
- **Tukar tanah**: langsung tolak kalau kota yang diminta bukan milik kita atau kota yang ditawarkan bukan milik
  pengusul. Kota tergadai dinilai harga × (1 − rasio tebus). Bonus provinsi lengkap = sewa KPR Subsidi × 3 kota ×
  kunjungan lawan per kota per giliran × horizon (≤ 20). Penalti ½ bonus provinsi lawan kalau tukar membuat lawan
  tinggal butuh satu kota di suatu provinsi. Terima kalau (nilai masuk − nilai keluar + bonus kita − bonus lawan −
  penalti) > 0, kas tetap aman, dan lawan tidak mendapat provinsi lengkap lebih bernilai dari kita.
- **Kartu simpanan**: Voucher Tol, Juru Parkir, Surat RT, Pengacara langsung dipakai. Orang Dalam: dipakai untuk
  membatalkan putusan Pengadilan yang buruk (hanya kalau putusan sudah diketahui; tanpa putusan kartu disimpan), atau keluar Lapas di game menengah/akhir (ronde ≥ 6), saat sewa kita
  sedang mengalir ke Negara, atau kas tidak cukup untuk jaminan. Restu Ibu/Asuransi: kerugian besar
  (≥ Rp500 rb atau ≥ 20% kas). Numpang Dulu: sewa tinggi. Flash Sale: dinilai seperti beli setengah harga.
- **Joki Dadu** (efek kartu resmi): coba semua kemungkinan mengubah satu dadu, nilai petak tujuan (petak sendiri,
  kota kosong bagus, hindari sewa lawan/pajak/Pengadilan, bonus gajian), pakai kalau lebih baik dari hasil asli.
  Bonus kartu Takdir untuk kembar tidak diberikan kalau kembar itu dipakai keluar Lapas (aturan: tidak ada kartu).
- **Beli di giliran gajian**: tawaran bangun datang di akhir giliran dan hangus kalau giliran itu Gali Lubang. Kalau
  giliran gajian dan kembar (kartu Takdir di akhir giliran), pembelian yang menyisakan kas < Rp300 rb × pengali biaya
  dilewati, kecuali melengkapi provinsi. Info gajian/kembar dari `view.turn` atau argumen `{ salaryTurn, doubles }`;
  tanpa info tidak berpengaruh.
- **Lapas**: selama di Lapas, sewa kota kita masuk ke Negara dan kita tidak gajian, tapi juga tidak membayar biaya
  mendarat. Pada giliran Lapas ke-3 jaminan **wajib** dibayar. Asumsi (**perlu verifikasi di game**): `jailTurns` =
  giliran Lapas ke-berapa, mulai 1 (konsisten dengan `inJail = jailTurns > 0`), jadi sisa percobaan kembar gratis
  `a = maxTurns − jailTurns` (jailTurns dibatasi 1..3; tanpa data dianggap 1). Kalau ternyata `jailTurns` = sisa
  giliran, rumus ini perlu dibalik. Dengan p_kembar dari `rollTarget` dan stay = 1 − p_kembar: bertahan menghemat
  rata-rata `jaminan × (1 − stay^a)` (keluar lewat kembar sebelum wajib bayar) dan merugikan
  `Σ_{k=1..a} stay^k × (sewa hilang per giliran + gaji ÷ giliran per putaran − ekspektasi biaya 1 giliran)`. Bot
  membayar sekarang kalau `a = 0`, di awal game (masih ≥ 6 kota kosong), atau kerugian bertahan > penghematan, dan
  sisa kas ≥ ½ cadangan. Kalau memegang Orang Dalam yang akan dipakai, jaminan tidak dibayar.
- **Negara sebagai pesaing**: Kas Negara (`view.treasury`) = semua uang yang dibayar ke Negara, dan Negara ikut
  diperingkat. Monitor menampilkan `me.vsNegara` ("di atas/di bawah Kas Negara") dan catatan kekayaan vs Kas Negara.
  Mode Ronde ≤ 2 ronde terakhir: jaminan sukarela tidak dibayar kalau kekayaan bersih kita masih di atas Kas Negara
  tapi selisihnya < 2× jaminan (membayar memindahkan uang ke Negara dua kali lipat secara relatif), kecuali sewa yang
  mengalir ke Negara selama di Lapas lebih besar dari jaminan.
- **Mode Ronde**: horizon nilai = sisa ronde. Di ronde terakhir bot tidak membangun dan tidak menebus gadai (netral
  untuk kekayaan bersih tapi mengurangi likuiditas), dan ambil alih otomatis tidak menarik karena sewanya kecil.
- **Tingkat**: gaji, pengali sewa/biaya, jaminan, rasio gadai/tebus/refund, pengali ambil alih, dan Pinjol semua
  dibaca dari tabel `DIFFICULTY`.
- `rollTarget` default **Perfect** (peluang kembar 2× untuk keluar Lapas, lemparan satu dadu ambil yang terbaik).

## Monitor (`strategy/insight.js`)

Dihitung tiap ~1,5 dtk dari View (hanya info yang terlihat pemain): kas, kekayaan bersih, utang, cadangan risiko
(`policyReserve`, sama dengan policy smart, memakai `strategy.riskTolerance`/`reserveRounds` dan `policyFlags`),
perkiraan biaya 2 giliran, sikap (agresif/seimbang/bertahan); per lawan: kota/bangunan/gadai, provinsi lengkap &
hampir lengkap, ancaman sewa ke saya (2 giliran), gaya main (pembangun, kolektor tanah, terjepit utang, menimbun
kas), tren kekayaan, dan perubahan sejak pembaruan sebelumnya. Ditampilkan di tab **Monitor** halaman Pengaturan
dan ringkas di popup, bersama 15 keputusan terakhir beserta alasannya.

## Flag policy

Dokumentasi tiap flag ada di `ACHIEVEMENT_FLAGS` (`src/core/strategy/index.js`). Ringkasnya: `rollTarget`,
`holdBankruptUntilRound`/`minRounds`, `wantPinjol`, `wantJail`, `wantBail`, `wantElit`, `wantTakeover`,
`wantProvinces`, `maxBuild`, `neverNegative`, `reserveOverride`, `lendInterest`, `preferPlayerLoan`,
`feederBuyForTakeover`, `payStateWhenChoice`, `useAllKeepCards`, `useKeepCards`, `preferParking`.

## TODO

- **Gadai untuk melengkapi provinsi**: saat kas kurang untuk membeli/mengambil alih kota terakhir sebuah provinsi,
  menggadai kota lepas (di provinsi yang tidak mungkin lengkap) bisa sepadan. Butuh perubahan kontrak handler
  (aksi gadai di tengah modal beli/ambil alih, lalu kembali ke keputusan beli), jadi belum diimplementasikan.

## Asumsi terhadap modul lain (handler/engine)

- `debtStep` menerima `triedLoan: true` dari handler setelah pemain memilih "Tidak jadi, pilih lagi" agar tidak
  meminta pinjaman berulang-ulang. Pinjol/minta pinjaman hanya muncul setelah jual/gadai habis; handler mengisi
  `canLoan`/`canPinjol` sesuai tombol yang terlihat.
- `useKeepCard(view, { cardId, situation })`: `situation` boleh string (`'jail'`, `'court'`, `'rent'`, `'toll'`)
  atau objek `{ kind, amount, verdict, tile, dice }`. `cardId` memakai id di `KEEP_CARDS` (`orang-dalam`, dst.).
- `acceptLoan` mengembalikan `lender` persis seperti yang diberikan di `offers` (id atau nama).
- Bentuk `game.loans[]` belum pasti; View membaca `borrower|borrowerId`, `lender|lenderId`,
  `amount|principal`, `interestPercent|interest`, `remaining|owed|total`, `turnsLeft|dueIn|remainingTurns`
  (sisa giliran sampai jatuh tempo, opsional).
- Data papan (`data/board.js`) sama untuk semua peta (pulau, kota-banjir, ibu-kota-baru, desa-sawah); peta hanya
  tampilan. Kalau suatu peta ternyata mengubah harga/sewa, data papan perlu dibuat per peta.
- Bentuk tawaran tukar tanah belum pasti; `normalizeTrade` membaca `offerTiles/offerCash` (yang diberikan
  pengusul) dan `requestTiles/requestCash` (yang diminta), plus beberapa alias.
- Pengali sewa Krisis dibaca dari `game.rules.rentMultiplier` (atau `game.rentMultiplier`) bila ada; kalau tidak,
  memakai pengali tingkat.
- Preset room dari planner berisi field tambahan `rounds` (10/15/20, untuk mode Ronde).
- `node --test test/` tidak menerima folder di Node 22; pakai `node --test` (penemuan otomatis) atau `npm test`
  di Node ≥ 23.
