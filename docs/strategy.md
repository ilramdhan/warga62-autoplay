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
- `netWorth(id)` = kas + harga tanah + biaya bangunan − utang. Tanah gadai dihitung `harga × (1 − rasio tebus)`.
- Tingkat bisa ditulis `easy/medium/hard/extreme` atau `santai/normal/inflasi/krismon`.

## Model peluang (`risk.js`)

- 2d6. Zona **Perfect** menggandakan peluang kembar, **Cupu** membaginya dua; sisa peluang dibagi rata ke hasil
  non-kembar. Kembar tidak memberi giliran tambahan, jadi satu giliran = satu gerakan.
- Mendarat di Gerbang Tol dianggap pindah ke gerbang lain; Razia mengirim ke Lapas 1/3, Pengadilan 2/3.
  Lama tinggal di Lapas tidak dimodelkan.
- `visitProbabilities(from, turns)` = ekspektasi berapa kali tiap petak didarati dalam N giliran.
- `expectedRentExposure(view, id, turns)` = ekspektasi pengeluaran (sewa + pajak/tol/parkir/Razia/Pengadilan/
  Musibah) dan `worst` = biaya terbesar yang peluangnya ≥ 2%.
- `recommendedReserve` = ekspektasi + (1 − riskTolerance) × kasus terburuk. Dipakai hampir semua keputusan.
- Kerugian rata-rata kartu Musibah diasumsikan Rp300 rb (`MUSIBAH_EXPECTED_LOSS`), karena isi dek tidak dicatat.

## Mode grind (`grind.js`)

Satu akun (`winnerName`) dibuat menang; akun lain jadi feeder. Peran dicek setiap keputusan dari View.

**Feeder**: sebelum lempar mengirim seluruh kas ke pemenang (minimal Rp100 rb), tidak beli/bangun/ambil alih,
memilih opsi "bayar" di kartu pilihan, menerima permintaan uang & tawaran tukar hanya dari pemenang, tol & Joki
Dadu diarahkan ke kota pemenang. Saat Gali Lubang: jual → gadai → bangkrut. Kalau flag
`holdBankruptUntilRound` aktif dan ronde belum sampai, feeder menyisakan kas cadangan (kelipatan Rp100 rb),
minta pinjaman, lalu Pinjol sebelum bangkrut. Kalau pemenang tidak ada di meja, feeder main normal (smart).

**Pemenang**: memakai otak smart dengan toleransi risiko tinggi, beli & bangun semua yang terjangkau (sisakan
cadangan kecil), ambil alih kota yang tidak aman, tidak pernah membayar permintaan uang feeder, meminjamkan ke
feeder hanya bila flag meminta (0% saat menahan bangkrut, atau bunga tetap untuk pencapaian Koperasi). Gali Lubang:
jual bangunan termurah → gadai kota termurah → pinjam → Pinjol → bangkrut hanya kalau benar-benar habis.

## Mode arena (`smart.js`)

Setiap akun main sendiri untuk menang, tanpa kerja sama.

- **Beli**: harga tanah tetap dihitung di kekayaan bersih, jadi biaya sebenarnya adalah likuiditas. Bot membeli
  kalau sisa kas ≥ cadangan. Cadangan dilonggarkan untuk kota yang **melengkapi provinsi** (40% cadangan) atau
  **menggagalkan provinsi lawan** yang sudah 2/3 (70%). Nilai kota = ekspektasi sewa dari lawan selama sisa game
  (dikali eskalasi Krisis), plus bonus melengkapi/menggagalkan.
- **Bangun**: skor = tambahan sewa × ekspektasi kunjungan lawan ÷ biaya, dikali bonus petak hotspot (2–12
  langkah setelah START, Lapas, dan gerbang tol), provinsi lengkap ×1,5, dan naik ke Perumahan Elit ×1,25 (aman
  dari ambil alih). Dibangun dari skor tertinggi selama anggaran (kas − cadangan) cukup.
- **Ambil alih**: tolak kota yang aman (Elit, provinsi penuh, gadai, Negara). Ambil kalau manfaat (sewa ke depan,
  bonus melengkapi/menggagalkan provinsi) ≥ premi (harga − nilai kota) dan cadangan tetap aman.
- **Tol**: tiap gerbang dinilai dari ekspektasi biaya 2 giliran berikut, peluang gajian, dan peluang mendarat di
  kota kosong. Gerbang yang melompati START dikurangi satu gaji (lewat tol tidak gajian).
- **Kartu pilihan**: tiap opsi diberi biaya: nominal bayar, "lewati N giliran" (tempo hilang dikurangi sewa yang
  terhindar), atau "kota termurah disita" (nilai kota termurah; 0 kalau tak punya kota).
- **Gali Lubang**: dari semua opsi jual/gadai pilih kerugian per rupiah terkecil. Jual bangunan rugi
  (biaya − refund) + sewa yang hilang; gadai rugi selisih tebus + sewa yang hilang, ×1,5 kalau bagian provinsi
  lengkap. Setelah aset habis: pinjam pemain (bunga biasanya lebih murah) → Pinjol → bangkrut.
- **Meminjamkan**: hanya kalau sisa kas ≥ 1,2× cadangan, game belum hampir selesai, dan peminjam bukan pemimpin
  (mode survival). Rasio risiko = (jumlah × 1,5) ÷ (kekayaan bersih peminjam + sebagian gaji). Rasio > 1 → tidak
  menawarkan; > 0,6 → 50%; > 0,3 → 25%; selain itu 10%. `strategy.lendInterest` angka tetap menimpa hasil ini.
- **Terima pinjaman**: bunga terendah; kalau Pinjol tersedia dan bunganya lebih murah, kembalikan `null`.
- **Permintaan uang**: default tolak; hanya terima ≤ Rp100 rb, peminjam bukan pemimpin, kas tetap ≥ 2× cadangan.
- **Tukar tanah**: terima kalau (nilai masuk − nilai keluar + bonus provinsi lengkap kita − bonus lawan) > 0, kas
  tetap aman, dan lawan tidak mendapat provinsi lengkap lebih banyak dari kita.
- **Kartu simpanan**: Voucher Tol, Juru Parkir, Surat RT, Pengacara langsung dipakai. Orang Dalam: dipakai untuk
  membatalkan putusan Pengadilan yang buruk, atau keluar Lapas di game menengah/akhir (ronde ≥ 6), saat sewa kita
  sedang mengalir ke Negara, atau kas tidak cukup untuk jaminan. Restu Ibu/Asuransi: kerugian besar
  (≥ Rp500 rb atau ≥ 20% kas). Numpang Dulu: sewa tinggi. Flash Sale: dinilai seperti beli setengah harga.
- **Joki Dadu** (efek kartu resmi): coba semua kemungkinan mengubah satu dadu, nilai petak tujuan (petak sendiri,
  kota kosong bagus, hindari sewa lawan/pajak/Pengadilan, bonus gajian), pakai kalau lebih baik dari hasil asli.
- **Lapas**: selama di Lapas, sewa kota kita masuk ke Negara, jadi tinggal di Lapas biasanya rugi. Bot membayar
  jaminan di awal game (masih ≥ 6 kota kosong) atau kalau sewa yang hilang + setengah jaminan > ekspektasi biaya
  bergerak. Kalau memegang Orang Dalam yang akan dipakai, jaminan tidak dibayar.
- **Mode Ronde**: horizon nilai = sisa ronde. Di ronde terakhir bot tidak membangun dan tidak menebus gadai (netral
  untuk kekayaan bersih tapi mengurangi likuiditas), dan ambil alih otomatis tidak menarik karena sewanya kecil.
- **Tingkat**: gaji, pengali sewa/biaya, jaminan, rasio gadai/tebus/refund, pengali ambil alih, dan Pinjol semua
  dibaca dari tabel `DIFFICULTY`.
- `rollTarget` default **Perfect** (peluang kembar 2× untuk keluar Lapas, lemparan satu dadu ambil yang terbaik).

## Flag policy

Dokumentasi tiap flag ada di `ACHIEVEMENT_FLAGS` (`src/core/strategy/index.js`). Ringkasnya: `rollTarget`,
`holdBankruptUntilRound`/`minRounds`, `wantPinjol`, `wantJail`, `wantBail`, `wantElit`, `wantTakeover`,
`wantProvinces`, `maxBuild`, `neverNegative`, `reserveOverride`, `lendInterest`, `preferPlayerLoan`,
`feederBuyForTakeover`, `payStateWhenChoice`, `useAllKeepCards`, `useKeepCards`, `preferParking`.

## Asumsi terhadap modul lain (handler/engine)

- `debtStep` menerima `triedLoan: true` dari handler setelah pemain memilih "Tidak jadi, pilih lagi" agar tidak
  meminta pinjaman berulang-ulang. Pinjol/minta pinjaman hanya muncul setelah jual/gadai habis; handler mengisi
  `canLoan`/`canPinjol` sesuai tombol yang terlihat.
- `useKeepCard(view, { cardId, situation })`: `situation` boleh string (`'jail'`, `'court'`, `'rent'`, `'toll'`)
  atau objek `{ kind, amount, verdict, tile, dice }`. `cardId` memakai id di `KEEP_CARDS` (`orang-dalam`, dst.).
- `acceptLoan` mengembalikan `lender` persis seperti yang diberikan di `offers` (id atau nama).
- Bentuk `game.loans[]` belum pasti; View membaca `borrower|borrowerId`, `lender|lenderId`,
  `amount|principal`, `interestPercent|interest`, `remaining|owed|total`.
- Bentuk tawaran tukar tanah belum pasti; `normalizeTrade` membaca `offerTiles/offerCash` (yang diberikan
  pengusul) dan `requestTiles/requestCash` (yang diminta), plus beberapa alias.
- Pengali sewa Krisis dibaca dari `game.rules.rentMultiplier` (atau `game.rentMultiplier`) bila ada; kalau tidak,
  memakai pengali tingkat.
- Preset room dari planner berisi field tambahan `rounds` (10/15/20, untuk mode Ronde).
- `node --test test/` tidak menerima folder di Node 22; pakai `node --test` (penemuan otomatis) atau `npm test`
  di Node ≥ 23.
