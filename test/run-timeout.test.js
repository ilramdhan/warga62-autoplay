import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, runTimeoutFor, tempoFactor, RUN_TIMEOUT_MS, MIN_RUN_TIMEOUT_MS } from '../src/core/engine.js';
import { normalizeConfig } from '../src/core/config.js';

test('runTimeoutFor: batas di bawah jendela keputusan game', () => {
  assert.equal(runTimeoutFor({ id: 'roll' }), 9750);
  assert.equal(runTimeoutFor({ id: 'buy' }), 13000);
  assert.equal(runTimeoutFor({ id: 'toll' }), 13000);
  assert.equal(runTimeoutFor({ id: 'upgrade' }), 19500);
  assert.ok(runTimeoutFor({ id: 'roll' }) < 15000);
  assert.ok(runTimeoutFor({ id: 'buy' }) < 20000);
});

test('runTimeoutFor: tempo Kilat/Santai, batas bawah, override, fallback', () => {
  assert.equal(runTimeoutFor({ id: 'roll' }, { tempo: 0.6 }), MIN_RUN_TIMEOUT_MS);
  assert.ok(MIN_RUN_TIMEOUT_MS < 15000 * 0.6, 'batas bawah tetap di bawah jendela kocok Kilat');
  assert.equal(runTimeoutFor({ id: 'buy' }, { tempo: 1.5 }), 19500);
  assert.equal(runTimeoutFor({ id: 'buy', timeoutMs: 1234 }), 1234);
  assert.equal(runTimeoutFor({ id: 'lobby-start' }), RUN_TIMEOUT_MS);
  assert.equal(runTimeoutFor({ id: 'online' }), RUN_TIMEOUT_MS);
});

test('tempoFactor: dari state bila terbaca, else 1', () => {
  assert.equal(tempoFactor(null), 1);
  assert.equal(tempoFactor({ settings: { tempo: 'Kilat' } }), 0.6);
  assert.equal(tempoFactor({ tempo: 'santai' }), 1.5);
  assert.equal(tempoFactor({ settings: { tempo: 'aneh' } }), 1);
});

test('engine memakai handler.timeoutMs untuk run() yang menggantung', async (t) => {
  const cfg = normalizeConfig({
    enabled: true,
    myName: 'A',
    role: 'host',
    accounts: ['A', 'B'],
    hostName: 'A',
    winnerName: 'A',
    chat: { enabled: false },
    timing: { tickMs: 5000 },
  });
  const logs = [];
  const log = { info() {}, warn: (m) => logs.push(m), error() {}, debug() {} };
  const h = {
    id: 'buy',
    scope: 'game',
    priority: 1,
    timeoutMs: 20,
    detect: () => true,
    run: () => new Promise(() => {}),
  };
  const engine = createEngine({
    getConfig: () => cfg,
    emit: () => {},
    log,
    handlers: [h],
    env: {
      dom: { invalidate() {}, inLobby: () => false },
      act: { goHome: () => true, sleep: async () => {} },
      readGame: () => null,
      readMe: () => null,
      isHidden: () => false,
      path: () => '/room/x',
    },
  });
  engine.start();
  t.after(() => engine.stop());
  const t0 = Date.now();
  await engine.tick();
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(logs.some((m) => /buy tidak selesai/.test(m)));
});
