import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlers } from '../src/core/handlers/index.js';
import {
  tileIndexFromText,
  keepCardIdFromText,
  tollStepsFromText,
  percentFromText,
  nameFromTitle,
  roomOptionLabels,
} from '../src/core/handlers/util.js';
import { matchLabel, norm } from '../src/core/dom/query.js';
import { createLogger } from '../src/core/log.js';

test('daftar handler: terurut, id unik, bentuk benar', () => {
  const ids = handlers.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length);
  const prios = handlers.map((h) => h.priority);
  assert.deepEqual(
    prios,
    [...prios].sort((a, b) => a - b),
  );
  assert.equal(new Set(prios).size, prios.length, 'priority unik');
  for (const h of handlers) {
    assert.ok(['home', 'lobby', 'game', 'any'].includes(h.scope), h.id);
    assert.equal(typeof h.detect, 'function', h.id);
    assert.equal(typeof h.run, 'function', h.id);
  }
});

test('matchLabel: string, regex, fungsi', () => {
  const t = norm('  Tidak   Beli ');
  assert.equal(t, 'tidak beli');
  assert.ok(matchLabel('Tidak beli', t));
  assert.ok(!matchLabel('beli', t));
  assert.ok(matchLabel(/^tidak/, t));
  assert.ok(matchLabel((x) => x.endsWith('beli'), t));
  const g = /^a/g;
  assert.ok(matchLabel(g, 'abc') && matchLabel(g, 'abc'));
});

test('tileIndexFromText: kota, gerbang tol, batas kata', () => {
  assert.equal(tileIndexFromText('Bangun di Banda Aceh'), 1);
  assert.equal(tileIndexFromText('kota yogyakarta'), 23);
  assert.equal(tileIndexFromText('Jakarta Pusat Rp1 jt'), 47);
  assert.equal(tileIndexFromText('Gerbang Tol Timur 3 petak ke depan', ['toll']), 44);
  assert.equal(tileIndexFromText('Gerbang Tol Timur'), null);
  assert.equal(tileIndexFromText('dependen'), null);
  assert.equal(tileIndexFromText(''), null);
});

test('keepCardIdFromText', () => {
  assert.equal(keepCardIdFromText('Pakai Pengacara Kenalan'), 'pengacara');
  assert.equal(keepCardIdFromText('pakai orang dalam: batalkan perkara'), 'orang-dalam');
  assert.equal(keepCardIdFromText('Flash Sale: beli Rp900 rb'), 'flash-sale');
  assert.equal(keepCardIdFromText('Pakai Restu Ibu'), 'restu-ibu');
  assert.equal(keepCardIdFromText('Tidak usah'), null);
});

test('parser teks kecil', () => {
  assert.equal(tollStepsFromText('Gerbang Tol Barat 4 petak ke depan'), 4);
  assert.equal(tollStepsFromText('x'), null);
  assert.equal(percentFromText('Terima 25%'), 25);
  assert.equal(nameFromTitle('JULE mengajak mabar', 'mabar'), 'JULE');
  assert.equal(nameFromTitle('ilramdhan.dev minta uang', 'minta'), 'ilramdhan.dev');
  assert.equal(nameFromTitle('Kirim / minta uang', 'minta'), null);
});

test('roomOptionLabels: akses publik dipaksa privat', () => {
  const labels = roomOptionLabels({
    access: 'publik',
    mode: 'survival',
    difficulty: 'inflasi',
    startingCash: 15,
    maxPlayers: 8,
    map: 'ibu-kota-baru',
    awards: false,
  });
  const by = Object.fromEntries(labels.map((l) => [l.key, l.label]));
  assert.equal(by.access, 'Privat');
  assert.equal(by.difficulty, 'Inflasi');
  assert.equal(by.startingCash, 'Rp15 jt');
  assert.equal(by.maxPlayers, '8 orang');
  assert.equal(by.map, 'Ibu Kota Baru');
  assert.equal(by.awards, 'Lewati');
  assert.equal(roomOptionLabels({ access: 'teman' })[0].label, 'Teman');
});

test('createLogger: emit event log, debug hanya bila aktif', () => {
  const out = [];
  const log = createLogger((e) => out.push(e), { debug: false });
  log.info('a');
  log.debug('b');
  log.setDebug(true);
  log.debug('c');
  log.warn('d');
  assert.deepEqual(
    out.map((e) => [e.type, e.level, e.msg]),
    [
      ['log', 'info', 'a'],
      ['log', 'debug', 'c'],
      ['log', 'warn', 'd'],
    ],
  );
  assert.equal(typeof out[0].ts, 'number');
});
