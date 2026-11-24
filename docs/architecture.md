# Arsitektur & kontrak modul

Dokumen ini adalah **kontrak** antar modul. Ubah kontrak di sini dulu sebelum mengubah kode yang melintasi batas modul.

## Gambaran besar

```text
                ┌──────────── Chrome extension (MV3) ─────────────┐
 popup / options│  chrome.storage  ⇄  bridge.js (ISOLATED world)  │
                │                         ⇅ window.postMessage     │
                │                    bot.js (MAIN world, bundled)  │
                └──────────────────────────────────────────────────┘
                ┌──────────── Playwright runner (Node) ─────────────┐
                │ N persistent Chromium profiles (1 per akun)       │
                │ addInitScript(window.__W62_CONFIG__) + bot.js     │
                │ page.exposeBinding('__w62Emit') untuk log/status  │
                └───────────────────────────────────────────────────┘
```

`bot.js` = bundle esbuild (IIFE) dari `src/core/entry-page.js`. Kode yang sama dipakai extension dan runner.

## Prinsip

1. **Baca state dari game, aksi lewat UI.** State game dibaca dari React fiber (props `game`). Aksi selalu klik tombol / tekan tombol seperti manusia. Jangan pernah memanggil `act()` store atau mengirim pesan websocket langsung.
2. **Jangan gunakan `game.seed` / `game.rng`.** Bot tidak memprediksi dadu. Lihat `.claude/rules/game-integrity.md`.
3. **Fallback DOM.** Kalau state tidak terbaca (fiber berubah), handler tetap bisa jalan dengan membaca teks tombol.
4. **Room selalu Privat/Teman.** Bot tidak bergabung ke room publik dan tidak membuat room Publik.
5. **Tidak ada fitur penghindar deteksi.** Jeda hanya untuk menunggu animasi.
6. Semua modul di `src/core` adalah ES module tanpa API `chrome.*` dan tanpa Node API.

## Struktur

```text
src/core/
  entry-page.js        # menerima config, membuat bot, meneruskan event ke host (extension/runner)
  index.js             # createBot(config, host) -> { start, stop, getStatus, updateConfig }
  engine.js            # loop utama, watchdog, AFK, pemulihan error
  config.js            # DEFAULT_CONFIG, normalizeConfig(), validateConfig()
  log.js               # createLogger(emit)
  dom/query.js         # norm, isVisible, buttons, findButton, findModal, textOf, pageHas
  dom/act.js           # sleep, click, pressKey, holdRoll, waitFor, typeText
  dom/money.js         # parseRupiah, formatRupiah
  state/reader.js      # readGame(), readMe(game, cfg) via React fiber
  state/view.js        # buildView(game, meId) -> View (data turunan untuk strategi)
  data/board.js        # petak, provinsi, tingkat kesulitan (SUDAH ADA)
  data/cards.js        # kartu (SUDAH ADA)
  data/achievements.js # katalog pencapaian + cara mencapainya
  handlers/*.js        # satu file per situasi layar
  strategy/index.js    # createPolicy(cfg) -> Policy
  strategy/grind.js    # policy mode grinding (satu pemenang, sisanya "feeder")
  strategy/smart.js    # policy mode arena (main untuk menang)
  strategy/risk.js     # peluang 2d6, ekspektasi sewa, cadangan kas
  strategy/planner.js  # pilih target pencapaian -> preset room + flag policy
  social/chat.js       # pesan cepat / stiker saat event (hanya di room sendiri)
src/extension/         # manifest.json, bridge.js, background.js, popup/, options/, icons/
src/runner/            # cli.js (Playwright)
scripts/               # build.js, validate-manifest.js, package-extension.js
test/                  # node:test
```

## Konfigurasi (`config.js`)

```js
{
  enabled: false,
  myName: '',                 // nick akun di instance ini (WAJIB)
  role: 'host' | 'guest',     // host = pembuat room
  mode: 'grind' | 'arena',
  accounts: ['ilramdhan.dev', 'JULE'],   // akun dikenal = whitelist pengaman (1–30): pemain di luar daftar ini
                                         // menjeda bot. Selalu memuat semua nama `roster`.
  roster: ['ilramdhan.dev', 'JULE'],     // akun yang ikut main sesi ini (1–8, ≤ room.maxPlayers, termasuk diri sendiri).
                                         // myName, hostName, dan (grind) winnerName otomatis ditambahkan. Host hanya
                                         // mengundang & menunggu roster; planner menghitung kursi dari roster.
                                         // Migrasi: config lama tanpa `roster` -> roster = nick sendiri + accounts lama,
                                         // dipotong ke room.maxPlayers.
  hostName: 'ilramdhan.dev',  // undangan hanya diterima dari nick ini. Boleh kosong untuk guest (tanpa auto-terima).
  winnerName: 'JULE',         // mode grind: akun yang dibuat menang
  room: {                     // diterapkan host lewat tombol "Atur"
    access: 'privat' | 'teman',
    mode: 'survival' | 'ronde',
    difficulty: 'santai' | 'normal' | 'inflasi' | 'krismon',
    startingCash: 5 | 10 | 15,           // juta
    maxPlayers: 4 | 6 | 8,
    map: 'pulau' | 'kota-banjir' | 'ibu-kota-baru' | 'desa-sawah' | 'acak',
    awards: true | false,
    autoByAchievement: true,             // planner boleh menimpa preset di atas
  },
  achievements: { enabled: true, targets: [] /* id pencapaian; kosong = otomatis */ },
  strategy: { riskTolerance: 0.5, reserveRounds: 1.0, lendInterest: 'auto' | 0 | 10 | 25 | 50, usePinjol: 'auto' | 'never' | 'always' },
  chat: { enabled: true, stickers: true, quickPhrases: true, customPhrases: [] },
  timing: { tickMs: 350, actionDelayMs: [250, 700], buildDelayPerTileMs: 1200, watchdogMs: 180000, minStartPlayers: 2, inviteRetryMs: 45000 },
  debug: false,
}
```

## Protokol host ⇄ bot (`entry-page.js`)

- Target bot ditanam saat build (`__W62_TARGET__` di `scripts/build.js`), bukan dibaca dari halaman:
  `dist/bot.js` = `runner`, `dist/extension/bot.js` = `extension`.
- Config masuk:
  - Extension: `bridge.js` mengirim `window.postMessage({ source: 'w62-host', type: 'config', config }, location.origin)` saat halaman dimuat dan setiap kali `chrome.storage.local['w62.config']` berubah. Perintah: `{ source:'w62-host', type:'command', command:'start'|'stop'|'reset' }`. `window.__W62_CONFIG__` **diabaikan** di build extension.
  - Runner: `window.__W62_CONFIG__` di-set lewat `addInitScript` sebelum bot.js jalan. Pesan `w62-host` diabaikan di build runner.
  - Penyaring (`src/core/protocol.js`, `filterHostMessage`): perintah selain `start`/`stop`/`reset` dibuang; config hanya
    menyimpan kunci tingkat atas yang ada di `DEFAULT_CONFIG`, lalu melewati `normalizeConfig` + `validateConfig`.
- Event keluar: bot memanggil `window.__w62Emit(event)` kalau fungsi itu ada (runner, via `exposeBinding`), dan selalu `window.postMessage({ source: 'w62-bot', type: 'event', event }, location.origin)` (diterima bridge).
- `bridge.js` menyaring event dengan `sanitizeBotEvent` (tipe `log|status|error|game_over|achievement`, level log
  `debug|info|warn|error`, hanya field yang dikenal per tipe, `msg` maks 500 karakter, string lain maks 200, array maks 50,
  kedalaman maks 5), lalu menyimpan status terakhir ke `chrome.storage.session['w62.status']` dan log ke
  `chrome.storage.local['w62.logs']` (ring buffer 500). Field status baru harus ditambahkan ke `EVENT_FIELDS` di
  `protocol.js` supaya sampai ke popup.
- Muat-ganda dicegah dengan penanda `window[Symbol.for('w62.autoplay.loaded')]` yang didefinisikan bot sendiri
  (non-writable, non-configurable). `window.__W62_BOT__` hanya info read-only (`{ version, target, getStatus }`).
- Batasan yang tersisa: bot.js berjalan di MAIN world, satu konteks JavaScript dengan skrip halaman, jadi tidak bisa
  diisolasi penuh. Skrip halaman tetap bisa mengirim pesan `w62-host` yang lolos penyaring (mis. `stop`, atau config
  valid lain), mengirim event `w62-bot` palsu yang lolos penyaring ke log/status, menimpa API global yang dipakai bot,
  atau mendefinisikan penanda muat-ganda lebih dulu sehingga bot tidak jalan. Penyaring membatasi bentuk pesan dan
  dampaknya ke `chrome.storage`, bukan asal-usulnya; batas keamanan sebenarnya tetap: extension hanya aktif di
  `mainwarga62.id` dan pengaman integritas (room privat/teman, daftar akun sendiri) dijalankan di engine/handler.
- Bot hanya aktif di path `/`, `/online`, `/room/*`. Halaman lain (`/profil`, `/cara-main`, dll.) diabaikan, kecuali handler `profile-sync` yang hanya membaca.

## Status & event (bot → host)

Pengaman integritas di engine: bila game terbaca dan ada pemain yang tidak ada di `cfg.accounts`, bot dijeda
(`status.state = 'paused'`, `reason = 'foreign'`, `players[]`, `foreign[]`) dan tidak melakukan aksi apa pun.
Popup menampilkan daftar pemain dan tombol untuk mendaftarkan nama itu ke `accounts` (akun dikenal) bila memang
akun milik user sendiri; `roster` tidak berubah, jadi undangan dan kursi room tetap.

Validasi (`validateConfigDetailed`): `roster` ≤ `room.maxPlayers` dan semua ada di `accounts`; host:
`timing.minStartPlayers` ≤ jumlah roster. `configWarnings` (informasi saja): roster < 3 (papan peringkat hanya
menghitung game ≥10 ronde dengan ≥3 pemain). Undangan host (`selectInvitees` di `handlers/util.js`): hanya roster yang
belum hadir dan belum "Terundang", total tamu ≤ `maxPlayers − 1` (maxPlayers dari `roomPreset`, fallback `room`).

`host.emit(event)` dengan `event = { type: 'log'|'status'|'error'|'game_over'|'achievement', ts, ...payload }`.
Extension meneruskan ke `chrome.storage.session` (status) dan ring buffer log (maks 500). Runner mencetak ke stdout.

## State game (dibaca dari React fiber, read-only)

`readGame()` mencari props `game` dengan naik dari node di dalam `#root` (mis. tombol `Sorot kota ...`). Bentuk penting:

```text
game.phase: 'order_roll' | 'pre_roll' | 'awaiting_dice' | 'awaiting_buy' | 'awaiting_takeover' | 'awaiting_toll'
          | 'awaiting_upgrade' | 'awaiting_choice' | 'awaiting_keep' | 'awaiting_pick' | 'awaiting_loan' | 'debt' | 'game_over'
game.round, game.turnOrder[], game.currentPlayer (id), game.crisisActive, game.stateTreasury
game.players[id] = { id, name, pawn, cash, position, salary, passStartCount, jailTurns, skipTurns,
                     keepCards[], pinjolTaken, loanTaken, bankrupt, bankruptRound }
game.properties[tileIndex] = { owner: id|null|'state', level: 0..3, mortgaged }
game.settings = { difficulty: 'easy'|'medium'|'hard'|'extreme', mode: 'survival'|'ronde', maxRounds, startingCash, map, awards }
game.rules (aturan aktif, termasuk perubahan dari kartu Krisis), game.loans[], game.moneyRequests[], game.trade, game.pending, game.ranking
```

`pending` berisi detail keputusan yang menunggu (mis. `{kind:'buy', tile, price}`, `{kind:'takeover', tile, price, owner}`, `{kind:'loan', amount, offers[]}`, `{step:'pick_tile'}`). Bentuk persisnya tidak dijamin; strategi harus defensif dan handler harus bisa jalan dengan DOM saja.

## Handler

```js
/** @type {Handler} */
export default {
  id: 'buy',
  scope: 'game', // 'home' | 'lobby' | 'game' | 'any'
  priority: 50, // lebih kecil = dicek lebih dulu
  detect(ctx) {
    /* return falsy atau objek deteksi */
  },
  async run(ctx, detected) {
    /* lakukan SATU keputusan lalu return */
  },
};
```

`ctx = { cfg, game, me, view, policy, dom, act, log, memo, emit, now }`:

- `game` = hasil `readGame()` atau `null`; `me` = pemain milik instance ini atau `null`; `view` = `buildView()` atau `null`.
- `dom` = modul `dom/query.js`; `act` = modul `dom/act.js`.
- `memo` = objek per-game yang di-reset saat game baru (`game.seed`/room berganti). Boleh dipakai handler untuk "sudah klik Lewati n/n".
- Engine memanggil handler pertama (urut priority) yang `detect()`-nya truthy, menunggu `run()`, lalu lanjut tick berikutnya.

Daftar handler (prioritas) dan label UI yang sudah diverifikasi ada di `docs/ui-labels.md`.

## Policy (strategi) — fungsi murni, sinkron, tanpa DOM

```js
createPolicy(cfg) -> {
  rollTarget(view): 'perfect' | 'cupu' | 'biasa',
  preRoll(view): Array<{type:'send', to:string, amount:number} | {type:'redeem', tile:number} | {type:'mortgage', tile:number} | {type:'payBail'} | {type:'repay'}>,
  shouldBuy(view, {tile, price}): boolean,
  shouldTakeover(view, {tile, price, ownerId}): boolean,
  chooseUpgrades(view, candidates: number[]): number[],          // subset tile yang dibangun
  chooseToll(view, options: number[]): number,                      // tile tujuan
  chooseOption(view, {cardId?, options: string[]}): number,         // index opsi kartu pilihan
  chooseTile(view, {purpose, candidates: number[]}): number | null, // PICK_TILE
  choosePlayer(view, {purpose, candidates: string[]}): string,      // PICK_PLAYER
  useKeepCard(view, {cardId, situation}): boolean,
  jokiDadu(view, {dice:[number,number]}): {dieIndex:0|1, value:1..6} | null,
  debtStep(view, {owe, canSell:number[], canMortgage:number[], canLoan:boolean, canPinjol:boolean}):
      {type:'sell', tile} | {type:'mortgage', tile} | {type:'requestLoan'} | {type:'pinjol'} | {type:'bankrupt'},
  lendOffer(view, {borrowerId, amount}): number | null,             // persen bunga (0/10/25/50) atau null = tidak menawarkan
  acceptLoan(view, {offers: Array<{lender, interestPercent}>, canPinjol?: boolean, owe?: number}): string | null,
  respondMoneyRequest(view, {fromId, amount}): boolean,
  respondTrade(view, trade): boolean,
}
```

`View` (dibangun `state/view.js`): `{ me, opponents[], allPlayers[], phase, round, difficulty (dari DIFFICULTY), crisis, rentMultiplier, properties (array per tile: {owner, level, mortgaged}), myTiles[], tileValue(i), rentAt(i, level?), netWorth(id), cashOf(id), position(id), isFeeder(id), isWinner(id), mode, settings }`.

## Mode

- **grind**: `winnerName` menang. Akun lain = feeder: kirim seluruh kas ke pemenang sebelum lempar, tidak beli, tidak bangun, bayar pada kartu pilihan, saat Gali Lubang: jual/gadai lalu bangkrut. Pemenang: beli & bangun agresif, setujui permintaan uang dari pemenang, tolak sisanya.
- **arena**: semua akun main untuk menang sendiri-sendiri dengan `strategy/smart.js`. Tidak ada kolusi antar akun.

## Build

`npm run build` → `dist/extension/` (siap "Load unpacked") + `dist/bot.js` (untuk runner) + `dist/warga62-autoplay-extension.zip`.
