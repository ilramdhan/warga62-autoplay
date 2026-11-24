import { test } from 'node:test';
import assert from 'node:assert/strict';
import online, { CREATE_GUARD_MS } from '../src/core/handlers/online.js';
import { buyLog } from '../src/core/handlers/buy.js';
import { gateFromText, tollLog } from '../src/core/handlers/toll.js';
import { errorPageText } from '../src/core/handlers/error.js';
import { tileName } from '../src/core/handlers/util.js';
import { normalizeConfig } from '../src/core/config.js';

test('buyLog: nama kota + harga formatRupiah', () => {
  assert.equal(buyLog('buy', 'Makassar', 1_100_000), 'beli Makassar (Rp1,1 jt)');
  assert.equal(buyLog('flash', 'Medan', 900_000), 'beli (Flash Sale) Medan (Rp900 rb)');
  assert.equal(buyLog('skip', 'Solo', null), 'tidak beli Solo');
  assert.equal(buyLog('buy', null, 500_000), 'beli (Rp500 rb)');
  assert.equal(tileName(27), 'Makassar');
  assert.equal(tileName(99), null);
});

test('toll: gerbang dari textContent yang menempel; log hanya gerbang terpilih', () => {
  const text = 'gerbang tol timurgerbang tol asli24 petak ke depan';
  assert.equal(gateFromText(text), 44);
  assert.equal(gateFromText('Gerbang Tol Barat 4 petak ke depan'), 20);
  assert.equal(gateFromText('12 petak ke depan'), null);
  assert.equal(tollLog(44, 24), 'tol ke Gerbang Tol Timur (24 petak)');
  assert.equal(tollLog(null, null), 'tol ke gerbang pertama');
});

test('errorPageText: teks halaman tanpa label tombol, dipotong', () => {
  const root = {
    textContent: 'Room tidak ditemukan  Kamu dikeluarkan karena tidak aktif. Cari room lain',
    parentElement: null,
  };
  const wrap = { textContent: 'Cari room lain', parentElement: root };
  const btn = { parentElement: wrap };
  assert.equal(errorPageText(btn, 'cari room lain'), 'Room tidak ditemukan Kamu dikeluarkan karena tidak aktif.');
  const long = { textContent: 'x'.repeat(500), parentElement: null };
  assert.equal(errorPageText({ parentElement: long }, 'muat ulang', 50).length, 50);
  assert.equal(errorPageText(null, 'muat ulang'), '');
});

test('online: klik "Buat room" lalu tunggu pindah; tidak klik ulang selama halaman lambat', async (t) => {
  const prevLoc = globalThis.location;
  globalThis.location = { pathname: '/online' };
  t.after(() => (globalThis.location = prevLoc));
  let clock = 1_000_000;
  let clicks = 0;
  const waits = [];
  const ctx = {
    cfg: normalizeConfig({ myName: 'A', role: 'host', accounts: ['A'] }),
    memo: {},
    now: () => clock,
    dom: { inLobby: () => false, findButton: () => ({}) },
    act: {
      click: () => clicks++,
      waitFor: async (fn, opts) => {
        waits.push(opts.timeout);
        clock += opts.timeout; // halaman lambat: tetap di /online sampai timeout
        return fn() || null;
      },
    },
    log: { info() {}, warn() {}, error() {}, debug() {} },
  };
  assert.ok(online.detect(ctx));
  assert.equal(await online.run(ctx, {}), true);
  assert.equal(clicks, 1);
  assert.equal(waits[0], 15000);
  // masih dalam jendela penjaga: tidak klik lagi walau throttle 4 dtk sudah lewat
  assert.equal(await online.run(ctx, {}), false);
  assert.equal(clicks, 1);
  clock = ctx.memo.roomCreateAt + CREATE_GUARD_MS;
  assert.equal(await online.run(ctx, {}), true);
  assert.equal(clicks, 2);

  // pindah ke room: waitFor selesai segera
  const ctx2 = { ...ctx, memo: {}, act: { ...ctx.act, waitFor: async (fn) => fn() } };
  globalThis.location = { pathname: '/online' };
  ctx2.act.click = () => {
    clicks++;
    globalThis.location = { pathname: '/room/abc' };
  };
  assert.equal(await online.run(ctx2, {}), true);
  assert.equal(online.detect(ctx2), false);
});
