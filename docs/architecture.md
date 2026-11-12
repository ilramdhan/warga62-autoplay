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
  accounts: ['ilramdhan.dev', 'JULE'],   // semua nick milik user (2–8). Host mengundang selain dirinya.
  hostName: 'ilramdhan.dev',  // undangan hanya diterima dari nick ini
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

- Config masuk:
  - Extension: `bridge.js` mengirim `window.postMessage({ source: 'w62-host', type: 'config', config }, location.origin)` saat halaman dimuat dan setiap kali `chrome.storage.local['w62.config']` berubah. Perintah: `{ source:'w62-host', type:'command', command:'start'|'stop'|'reset' }`.
  - Runner: `window.__W62_CONFIG__` di-set lewat `addInitScript` sebelum bot.js jalan.
- Event keluar: bot memanggil `window.__w62Emit(event)` kalau fungsi itu ada (runner, via `exposeBinding`), dan selalu `window.postMessage({ source: 'w62-bot', type: 'event', event }, location.origin)` (diterima bridge).
- `bridge.js` menyimpan status terakhir ke `chrome.storage.session['w62.status']` dan log ke `chrome.storage.local['w62.logs']` (ring buffer 500).
- Bot hanya aktif di path `/`, `/online`, `/room/*`. Halaman lain (`/profil`, `/cara-main`, dll.) diabaikan, kecuali handler `profile-sync` yang hanya membaca.

## Status & event (bot → host)

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
  scope: 'game',          // 'home' | 'lobby' | 'game' | 'any'
  priority: 50,           // lebih kecil = dicek lebih dulu
  detect(ctx) { /* return falsy atau objek deteksi */ },
  async run(ctx, detected) { /* lakukan SATU keputusan lalu return */ },
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
  preRoll(view): Array<{type:'send', to:string, amount:number} | {type:'redeem', tile:number} | {type:'mortgage', tile:number} | {type:'payBail'}>,
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
  acceptLoan(view, {offers: Array<{lender, interestPercent}>}): string | null,
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
