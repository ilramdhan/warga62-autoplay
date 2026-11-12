/**
 * Loop utama bot: baca state, pilih handler pertama yang cocok, jalankan, jaga watchdog, kirim status.
 */
import { validateConfig } from './config.js';
import * as dom from './dom/query.js';
import * as act from './dom/act.js';
import { readGame, readMe, playersOf } from './state/reader.js';
import { buildView } from './state/view.js';
import { createPolicy } from './strategy/index.js';
import { buildInsight } from './strategy/insight.js';
import { handlers as allHandlers } from './handlers/index.js';
import { createChat } from './social/chat.js';

const STATUS_GAP_MS = 1000;
const GAME_GAP_MS = 10000;
const STUCK_RUNS = 25; // ~9 dtk pada tick 350 ms
const BENCH_MS = 6000;
const INSIGHT_GAP_MS = 1500;

/** Nama pemain yang bukan akun milik user (tanpa beda huruf besar/kecil). */
export function foreignPlayers(players, accounts) {
  const own = new Set((accounts ?? []).map((n) => String(n).trim().toLowerCase()));
  return players.filter((n) => !own.has(String(n).trim().toLowerCase()));
}

export const isActivePath = (p) => p === '/' || p === '/online' || p === '/online/' || p.startsWith('/room/');

/** Scope yang berlaku untuk path/kondisi saat ini. */
export function scopesFor(path, inLobbyNow) {
  const s = new Set(['any']);
  if (path === '/' || path.startsWith('/online')) s.add('home');
  else if (path.startsWith('/room/')) s.add(inLobbyNow ? 'lobby' : 'game');
  return s;
}

function rankingOf(game) {
  const raw = Array.isArray(game?.ranking) ? game.ranking : null;
  if (raw) return raw.map((r) => (r && typeof r === 'object' ? { ...r } : r));
  return playersOf(game)
    .map((p) => ({ id: p.id, name: p.name, cash: p.cash, bankrupt: !!p.bankrupt }))
    .sort((a, b) => Number(a.bankrupt) - Number(b.bankrupt) || (b.cash ?? 0) - (a.cash ?? 0))
    .map((p, i) => ({ rank: i + 1, ...p }));
}

/**
 * @param {{getConfig: () => object, emit: (e: object) => void, log: object, handlers?: object[]}} deps
 */
export function createEngine({ getConfig, emit, log, handlers = allHandlers }) {
  const list = [...handlers].sort((a, b) => a.priority - b.priority);
  const chat = createChat({ getConfig, dom, act, log });
  let timer = null;
  let running = false;
  let busy = false;
  let memo = {};
  let policy = null;
  let policyCfg = null;
  let validatedCfg = null;
  let configOk = true;
  let hiddenLogged = false;
  let foreignLogged = null;
  let progressSig = null;
  const idleRuns = new Map();
  const decisions = [];
  let insightMemory = {};
  let insightAt = 0;
  let lastInsight = null;
  const benched = new Map();
  let lastActionAt = Date.now();
  let lastAction = null;
  let lastStatusAt = 0;
  let status = {
    type: 'status',
    state: 'idle',
    handler: null,
    round: null,
    phase: null,
    myCash: null,
    lastAction: null,
  };
  let prev = { path: null, phase: null, round: null, gameSeenAt: 0 };
  let gameOverEmitted = false;

  const sendStatus = (patch, force = false) => {
    status = { ...status, ...patch, type: 'status', lastAction };
    const now = Date.now();
    if (!force && now - lastStatusAt < STATUS_GAP_MS) return;
    lastStatusAt = now;
    emit({ ...status, ts: now });
  };

  // log yang juga mencatat aksi terakhir
  const ctxLog = {
    info: (m) => {
      lastAction = { ...(lastAction ?? {}), msg: m, ts: Date.now() };
      log.info(m);
    },
    warn: (m) => log.warn(m),
    error: (m) => log.error(m),
    debug: (m) => log.debug(m),
  };

  function policyFor(cfg) {
    if (policyCfg !== cfg) {
      policyCfg = cfg;
      try {
        policy = createPolicy(cfg);
      } catch (e) {
        policy = null;
        log.error(`Gagal membuat strategi: ${e?.message ?? e}`);
      }
    }
    return policy;
  }

  function trackGame(game, path, now) {
    const newGame =
      prev.path !== path ||
      (game && now - prev.gameSeenAt > GAME_GAP_MS) ||
      (game && prev.phase === 'game_over' && game.phase !== 'game_over') ||
      (game && Number.isFinite(prev.round) && Number.isFinite(game.round) && game.round < prev.round);
    if (newGame && prev.path !== null) {
      memo = {};
      insightMemory = {};
      lastInsight = null;
      decisions.length = 0;
      chat.reset();
      gameOverEmitted = false;
    }
    prev = {
      path,
      phase: game ? game.phase : prev.phase,
      round: game ? game.round : prev.round,
      gameSeenAt: game ? now : prev.gameSeenAt,
    };
    if (game?.phase === 'game_over' && !gameOverEmitted) {
      gameOverEmitted = true;
      const ranking = rankingOf(game);
      emit({ type: 'game_over', ts: now, round: game.round ?? null, ranking });
      log.info('Game selesai.');
    } else if (game && game.phase !== 'game_over') gameOverEmitted = false;
  }

  /** Bot sedang tidak bertindak (mati/jeda): watchdog tidak boleh menghitung waktu ini sebagai macet. */
  const idle = (patch) => {
    lastActionAt = Date.now();
    return sendStatus(patch);
  };

  async function tick() {
    if (busy || !running) return;
    busy = true;
    try {
      const cfg = getConfig();
      const now = Date.now();
      if (!cfg.enabled) return idle({ state: 'paused', handler: null, reason: 'off' });
      if (validatedCfg !== cfg) {
        validatedCfg = cfg;
        const errs = validateConfig(cfg);
        configOk = errs.length === 0;
        errs.forEach((e) => log.error(`Konfigurasi: ${e}`));
      }
      if (!configOk) return idle({ state: 'paused', handler: null, reason: 'config' });
      if (document.hidden) {
        if (!hiddenLogged) {
          hiddenLogged = true;
          log.info('Tab tidak terlihat; bot dijeda sampai tab aktif lagi.');
        }
        return idle({ state: 'paused', handler: null, reason: 'hidden' });
      }
      hiddenLogged = false;
      const path = location.pathname;
      if (!isActivePath(path)) return idle({ state: 'idle', handler: null, reason: null });

      const game = readGame();
      const me = game ? readMe(game, cfg) : null;
      let view = null;
      if (game) {
        try {
          view = buildView(game, me?.id ?? null, cfg);
        } catch (e) {
          log.debug(`buildView gagal: ${e?.message ?? e}`);
        }
      }
      trackGame(game, path, now);

      // Pengaman integritas: bot hanya bermain bila SEMUA pemain adalah akun milik user (cfg.accounts).
      const players = playersOf(game)
        .map((p) => String(p.name ?? '').trim())
        .filter(Boolean);
      const foreign = foreignPlayers(players, cfg.accounts);
      if (foreign.length) {
        const key = foreign.join('|');
        if (foreignLogged !== key) {
          foreignLogged = key;
          log.warn(
            `Bot dijeda: pemain ${foreign.join(', ')} tidak terdaftar sebagai akunmu. Tambahkan di popup bila memang akunmu.`,
          );
        }
        return idle({ state: 'paused', handler: null, reason: 'foreign', players, foreign });
      }
      foreignLogged = null;
      // Game yang bergerak (giliran/fase/ronde/kas berubah) = tidak macet, walau bot sendiri belum beraksi
      // (mis. menunggu giliran pemain lain yang dimainkan manual, atau bot baru diaktifkan di tengah game).
      const sig = game
        ? [game.phase, game.round, game.currentPlayer, ...playersOf(game).map((p) => `${p.cash}:${p.position}`)].join(
            '|',
          )
        : null;
      if (sig !== progressSig) {
        progressSig = sig;
        if (sig) lastActionAt = Date.now();
      }
      chat.observe(game);

      const ctx = {
        cfg,
        game,
        me,
        view,
        policy: policyFor(cfg),
        dom,
        act,
        log: ctxLog,
        memo,
        emit,
        now: () => Date.now(),
        chat,
      };
      dom.invalidate();
      const scopes = scopesFor(path, dom.inLobby());
      let chosen = null;
      let detected = null;
      for (const h of list) {
        if (!scopes.has(h.scope)) continue;
        if ((benched.get(h.id) ?? 0) > Date.now()) continue;
        try {
          const d = h.detect(ctx);
          if (d) {
            chosen = h;
            detected = d;
            break;
          }
        } catch (e) {
          log.debug(`detect ${h.id} gagal: ${e?.message ?? e}`);
        }
      }

      let insight = null;
      if (view && now - insightAt >= INSIGHT_GAP_MS) {
        insightAt = now;
        try {
          insight = buildInsight(view, cfg, insightMemory);
          lastInsight = insight;
        } catch (e) {
          log.debug(`insight gagal: ${e?.message ?? e}`);
        }
      } else insight = view ? lastInsight : null;
      const base = {
        insight,
        decisions: decisions.slice(),
        round: game?.round ?? null,
        phase: game?.phase ?? null,
        myCash: me?.cash ?? null,
        reason: null,
        players,
        foreign: [],
      };
      if (chosen) {
        sendStatus({ ...base, state: 'acting', handler: chosen.id });
        let result;
        try {
          result = await chosen.run(ctx, detected);
        } catch (e) {
          log.error(`Handler ${chosen.id} galat: ${e?.message ?? e}`);
          result = false;
        }
        // Pengaman: handler yang terus terdeteksi tapi tidak bisa bertindak (run() false) jangan memblokir
        // handler berprioritas lebih rendah selamanya (mis. modal "X bangkrut → Lanjut").
        if (result !== false && ctx.policy?.lastReason && lastAction?.msg) {
          decisions.push({ ts: Date.now(), fn: chosen.id, label: lastAction.msg, reason: ctx.policy.lastReason });
          if (decisions.length > 15) decisions.shift();
        }
        if (ctx.policy) ctx.policy.lastReason = '';
        if (result === false) {
          const n = (idleRuns.get(chosen.id) ?? 0) + 1;
          idleRuns.set(chosen.id, n);
          if (n >= STUCK_RUNS) {
            idleRuns.set(chosen.id, 0);
            benched.set(chosen.id, Date.now() + BENCH_MS);
            log.debug(`Handler ${chosen.id} tidak bisa bertindak ${n}x; dilewati sementara.`);
          }
        } else idleRuns.set(chosen.id, 0);
        if (result !== false) {
          lastActionAt = Date.now();
          lastAction = { handler: chosen.id, msg: lastAction?.msg ?? null, ts: lastActionAt };
        }
        sendStatus({ ...base, state: result === false ? 'waiting' : 'acting', handler: chosen.id });
      } else {
        let chatted = false;
        try {
          chatted = await chat.flush();
        } catch (e) {
          log.debug(`chat gagal: ${e?.message ?? e}`);
        }
        if (chatted) lastActionAt = Date.now();
        sendStatus({ ...base, state: 'waiting', handler: null });
      }

      // Guest yang menunggu undangan (beranda/online) memang diam tanpa batas. Guest di ruang tunggu
      // menunggu host mulai: batas lebih longgar (5× watchdog) agar room mati tetap ditinggalkan.
      const guestHome = cfg.role === 'guest' && (path === '/' || path.startsWith('/online'));
      const limit = cfg.role === 'guest' && scopes.has('lobby') ? cfg.timing.watchdogMs * 5 : cfg.timing.watchdogMs;
      if (!guestHome && Date.now() - lastActionAt > limit) {
        log.warn('Tidak ada aksi terlalu lama; kembali ke beranda.');
        lastActionAt = Date.now();
        memo = {};
        act.goHome(0);
      }
    } catch (e) {
      log.error(`Galat loop: ${e?.message ?? e}`);
    } finally {
      busy = false;
    }
  }

  function schedule() {
    if (!running) return;
    const ms = getConfig().timing?.tickMs ?? 350;
    timer = setTimeout(async () => {
      await tick();
      schedule();
    }, ms);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastActionAt = Date.now();
      log.info('Bot dimulai.');
      schedule();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      sendStatus({ state: 'paused', handler: null }, true);
      log.info('Bot dihentikan.');
    },
    reset() {
      memo = {};
      chat.reset();
      lastActionAt = Date.now();
      gameOverEmitted = false;
    },
    getStatus: () => status,
    tick,
  };
}
