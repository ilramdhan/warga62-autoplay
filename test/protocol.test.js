import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterHostMessage, LIMITS, pickKnownConfig, sanitizeBotEvent } from '../src/core/protocol.js';

test('filterHostMessage: menolak pesan bukan w62-host atau bentuk aneh', () => {
  for (const m of [null, 'x', 42, [], {}, { source: 'w62-bot', type: 'command', command: 'start' }]) {
    assert.equal(filterHostMessage(m), null);
  }
  assert.equal(filterHostMessage({ source: 'w62-host', type: 'eval', code: '1' }), null);
});

test('filterHostMessage: perintah hanya start/stop/reset', () => {
  for (const c of ['start', 'stop', 'reset']) {
    assert.deepEqual(filterHostMessage({ source: 'w62-host', type: 'command', command: c, extra: 1 }), {
      type: 'command',
      command: c,
    });
  }
  for (const c of ['START', 'destroy', '', null, { toString: () => 'start' }]) {
    assert.equal(filterHostMessage({ source: 'w62-host', type: 'command', command: c }), null);
  }
});

test('filterHostMessage: config dinormalisasi, kunci tak dikenal dibuang, galat validasi dilaporkan', () => {
  const r = filterHostMessage({
    source: 'w62-host',
    type: 'config',
    config: { myName: 'A', enabled: 'true', evil: 'x', __proto__: { polluted: true }, room: { access: 'publik' } },
  });
  assert.equal(r.type, 'config');
  assert.equal(r.config.enabled, true);
  assert.equal(r.config.myName, 'A');
  assert.equal('evil' in r.config, false);
  assert.equal(r.config.polluted, undefined);
  assert.ok(r.errors.some((e) => /Akses room/.test(e)));
  assert.equal(filterHostMessage({ source: 'w62-host', type: 'config', config: 'x' }), null);
  assert.equal(filterHostMessage({ source: 'w62-host', type: 'config', config: [1] }), null);
});

test('pickKnownConfig: hanya kunci tingkat atas DEFAULT_CONFIG', () => {
  assert.deepEqual(pickKnownConfig({ debug: true, foo: 1, policyFlags: {} }), { debug: true });
  assert.deepEqual(pickKnownConfig(null), {});
});

test('sanitizeBotEvent: hanya tipe event yang dikenal', () => {
  assert.equal(sanitizeBotEvent(null), null);
  assert.equal(sanitizeBotEvent({ type: 'config', config: {} }), null);
  assert.equal(sanitizeBotEvent({ type: 'status', state: 'x' }, 5).ts, 5);
});

test('sanitizeBotEvent: log level di-whitelist, msg dipotong, field asing dibuang', () => {
  const e = sanitizeBotEvent({ type: 'log', level: '<img>', msg: 'a'.repeat(5000), ts: 10, html: '<b>', url: 'x' });
  assert.deepEqual(Object.keys(e).sort(), ['level', 'msg', 'ts', 'type']);
  assert.equal(e.level, 'info');
  assert.equal(e.msg.length, LIMITS.msg);
  assert.equal(e.ts, 10);
  assert.equal(sanitizeBotEvent({ type: 'log', level: 'warn', msg: 7 }).msg, '7');
  assert.equal(sanitizeBotEvent({ type: 'log', level: 'warn' }).msg, '');
});

test('sanitizeBotEvent: status dibatasi kedalaman, panjang array, dan tanpa fungsi', () => {
  const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
  const e = sanitizeBotEvent({
    type: 'status',
    state: 'acting',
    players: Array.from({ length: 200 }, (_, i) => `p${i}`),
    insight: deep,
    lastAction: { msg: 'x'.repeat(2000), fn: () => 1 },
    receivedAt: 1,
    myCash: Infinity,
  });
  assert.equal(e.players.length, LIMITS.arr);
  assert.equal(e.lastAction.msg.length, LIMITS.str);
  assert.equal('fn' in e.lastAction, false);
  assert.equal('receivedAt' in e, false);
  assert.equal(e.myCash, null);
  assert.ok(JSON.stringify(e.insight).length < JSON.stringify(deep).length);
});
