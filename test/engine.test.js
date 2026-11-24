import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, isNewGame, LOBBY_DEADLINE_MULT } from '../src/core/engine.js';
import { normalizeConfig } from '../src/core/config.js';

const WATCHDOG = 20000;

/** Engine berjalan (tick() hanya bekerja saat running) dengan tickMs maksimum; tick dipanggil manual. */
function setup(t, { handlers, path = '/room/abc', lobby = false, games = () => null, timing = {}, runTimeoutMs } = {}) {
  const cfg = normalizeConfig({
    enabled: true,
    myName: 'A',
    role: 'host',
    accounts: ['A', 'B'],
    hostName: 'A',
    winnerName: 'A',
    chat: { enabled: false },
    timing: { watchdogMs: WATCHDOG, tickMs: 5000, ...timing },
  });
  const clock = { t: 1_000_000 };
  const logs = [];
  const log = {
    info: (m) => logs.push(['info', m]),
    warn: (m) => logs.push(['warn', m]),
    error: (m) => logs.push(['error', m]),
    debug: (m) => logs.push(['debug', m]),
  };
  let homes = 0;
  const dom = { invalidate() {}, inLobby: () => (typeof lobby === 'function' ? lobby() : lobby) };
  const act = { goHome: () => (homes++, true), sleep: async () => {} };
  const engine = createEngine({
    getConfig: () => cfg,
    emit: () => {},
    log,
    handlers,
    env: {
      dom,
      act,
      readGame: () => games(),
      readMe: (g) => g?.players?.[0] ?? null,
      now: () => clock.t,
      isHidden: () => false,
      path: () => (typeof path === 'function' ? path() : path),
      runTimeoutMs,
    },
  });
  if (!timing.manualStart) {
    engine.start();
    t.after(() => engine.stop());
  }
  return { engine, clock, logs, homes: () => homes, cfg };
}

const handler = (over = {}) => ({
  id: 'h',
  scope: 'game',
  priority: 50,
  detect: () => true,
  run: async () => true,
  ...over,
});

test('watchdog: run() false terus-menerus -> pulang ke beranda', async (t) => {
  const { engine, clock, homes } = setup(t, { handlers: [handler({ run: async () => false })] });
  await engine.tick();
  clock.t += WATCHDOG - 1000;
  await engine.tick();
  assert.equal(homes(), 0);
  clock.t += 2000;
  await engine.tick();
  assert.equal(homes(), 1);
});

test('watchdog: run() true mereset waktu aksi', async (t) => {
  const { engine, clock, homes } = setup(t, { handlers: [handler()] });
  for (let i = 0; i < 5; i++) {
    clock.t += WATCHDOG - 1000;
    await engine.tick();
  }
  assert.equal(homes(), 0);
});

test('tenggat ruang tunggu: handler lobby yang terus true tetap dipulangkan', async (t) => {
  const { engine, clock, homes, logs } = setup(t, { lobby: true, handlers: [handler({ scope: 'lobby' })] });
  await engine.tick();
  const step = 10000;
  for (let t = 0; t <= WATCHDOG * LOBBY_DEADLINE_MULT; t += step) {
    clock.t += step;
    await engine.tick();
  }
  assert.equal(homes(), 1);
  assert.ok(logs.some(([, m]) => /ruang tunggu/.test(m)));
});

test('isNewGame: aturan reset memo', () => {
  const g = (round, phase = 'pre_roll', players = [{ id: 1 }, { id: 2 }]) => ({ round, phase, players });
  const prev = { path: '/room/x', phase: 'pre_roll', round: 5, id: null, players: ['1', '2'] };
  assert.equal(isNewGame(prev, null, '/room/x'), false, 'state tidak terbaca bukan game baru');
  assert.equal(isNewGame(prev, g(5), '/room/x'), false);
  assert.equal(isNewGame(prev, g(6), '/room/x'), false);
  assert.equal(isNewGame(prev, g(5), '/room/y'), true, 'path berubah');
  assert.equal(isNewGame(prev, g(2), '/room/x'), true, 'ronde mundur');
  assert.equal(isNewGame({ ...prev, phase: 'game_over' }, g(1, 'order_roll'), '/room/x'), true, 'keluar game_over');
  assert.equal(isNewGame(prev, g(5, 'pre_roll', [{ id: 7 }, { id: 8 }]), '/room/x'), true, 'pemain berbeda');
  assert.equal(isNewGame(prev, g(5, 'pre_roll', [{ id: 1 }, { id: 2 }, { id: 3 }]), '/room/x'), false);
  assert.equal(isNewGame({ ...prev, id: 'g1' }, { ...g(5), id: 'g2' }, '/room/x'), true, 'id game berubah');
});

test('memo bertahan saat state sesaat tidak terbaca, reset saat ronde mundur', async (t) => {
  let game = { phase: 'pre_roll', round: 3, players: [{ id: 1, name: 'A', cash: 1, position: 0 }] };
  let seen = null;
  const h = handler({
    run: async (ctx) => {
      ctx.memo.count = (ctx.memo.count ?? 0) + 1;
      seen = ctx.memo.count;
      return true;
    },
  });
  const { engine, clock } = setup(t, { handlers: [h], games: () => game, timing: { watchdogMs: 600000 } });
  await engine.tick();
  await engine.tick();
  assert.equal(seen, 2);
  const saved = game;
  game = null;
  clock.t += 30000; // > 10 dtk tidak terbaca
  await engine.tick();
  game = saved;
  await engine.tick();
  assert.equal(seen, 4, 'memo tidak dihapus');
  game = { ...saved, round: 1 };
  await engine.tick();
  assert.equal(seen, 1, 'memo direset saat ronde mundur');
});

test('stop()+start() saat tick berjalan tidak membuat dua loop', async (t) => {
  let release;
  const gate = new Promise((r) => (release = r));
  let calls = 0;
  let first = true;
  const h = handler({
    detect: () => (calls++, true),
    run: async () => {
      if (first) {
        first = false;
        await gate;
      }
      return true;
    },
  });
  const { engine } = setup(t, { handlers: [h], timing: { tickMs: 100, watchdogMs: 600000, manualStart: true } });
  engine.start();
  await new Promise((r) => setTimeout(r, 150)); // tick pertama tertahan di run()
  engine.stop();
  engine.start();
  release();
  calls = 0;
  await new Promise((r) => setTimeout(r, 1050));
  engine.stop();
  assert.ok(calls <= 13, `terlalu banyak tick (${calls}): ada loop ganda`);
  assert.ok(calls >= 5, `loop berhenti (${calls})`);
});

test('run() yang menggantung dibatasi waktu dan dianggap gagal', async (t) => {
  const h = handler({ run: () => new Promise(() => {}) });
  const { engine, logs } = setup(t, { handlers: [h], runTimeoutMs: 20 });
  const t0 = Date.now();
  await engine.tick();
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(logs.some(([lvl, m]) => lvl === 'warn' && /tidak selesai/.test(m)));
  assert.equal(engine.getStatus().state, 'waiting');
});

test('log keputusan tidak memakai pesan handler sebelumnya', async (t) => {
  let n = 0;
  const policyLess = handler({
    run: async (ctx) => {
      n++;
      if (n === 1) ctx.log.info('aksi pertama');
      return true;
    },
  });
  const { engine } = setup(t, { handlers: [policyLess] });
  await engine.tick();
  await engine.tick();
  // tick kedua tidak menulis log: lastAction.msg bukan sisa "aksi pertama"
  assert.equal(engine.getStatus().lastAction?.msg ?? null, null);
});
