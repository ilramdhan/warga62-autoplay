/**
 * Loop utama bot: baca state, pilih handler pertama yang cocok, jalankan, jaga watchdog, kirim status.
 */
import { validateConfig } from './config.js';
import * as domDefault from './dom/query.js';
import * as actDefault from './dom/act.js';
import { readGame as readGameDefault, readMe as readMeDefault, playersOf } from './state/reader.js';
import { buildView } from './state/view.js';
import { createPolicy } from './strategy/index.js';
import { buildInsight } from './strategy/insight.js';
import { handlers as allHandlers } from './handlers/index.js';
import { createChat } from './social/chat.js';

const STATUS_GAP_MS = 1000;
const STUCK_RUNS = 25; // ~9 dtk pada tick 350 ms
const BENCH_MS = 6000;
const INSIGHT_GAP_MS = 1500;
/**
 * Batas bawaan satu run() handler tanpa jendela keputusan game (lobby, beranda, galat); lewat dari ini dianggap
 * gagal agar loop tidak tergantung selamanya.
 */
export const RUN_TIMEOUT_MS = 30000;
/**
 * Jendela keputusan game Online (tempo Normal) per id handler. Lewat jendela ini Autopilot yang memutuskan, jadi
 * run() dibatasi `RUN_WINDOW_FRACTION` darinya agar loop sempat mencoba lagi sebelum Autopilot mengambil alih.
 */
export const DECISION_WINDOW_MS = {
  roll: 15000,
  'pre-roll': 15000,
  order: 15000,
  court: 15000,
  'joki-dadu': 20000,
  toll: 20000,
  buy: 20000,
  takeover: 20000,
  choice: 20000,
  keep: 20000,
  pick: 20000,
  'card-continue': 20000,
  debt: 20000,
  'money-request': 20000,
  'loan-offer': 20000,
  trade: 20000,
  upgrade: 30000,
  'still-here': 10000,
};
export const RUN_WINDOW_FRACTION = 0.65;
/** Batas bawah: kocok (holdRoll ≤ 4,5 dtk + jeda animasi) tetap selesai walau tempo Kilat. */
export const MIN_RUN_TIMEOUT_MS = 7000;
/** Pengali jendela per tempo room (Santai 1,5×, Kilat 0,6×). */
export const TEMPO_FACTOR = { santai: 1.5, normal: 1, kilat: 0.6 };

/** Pengali tempo dari state game bila terbaca (nama field belum diverifikasi di game asli), else 1. */
export function tempoFactor(game) {
  const raw = game?.settings?.tempo ?? game?.tempo ?? game?.settings?.speed ?? null;
  return TEMPO_FACTOR[String(raw ?? '').toLowerCase()] ?? 1;
}

/**
 * Batas run() untuk `handler`: `handler.timeoutMs` bila ada; else `RUN_WINDOW_FRACTION` × jendela keputusan
 * (× tempo), minimal `MIN_RUN_TIMEOUT_MS`; handler tanpa jendela memakai `fallbackMs`.
 */
export function runTimeoutFor(handler, { tempo = 1, fallbackMs = RUN_TIMEOUT_MS } = {}) {
  if (Number.isFinite(handler?.timeoutMs) && handler.timeoutMs > 0) return handler.timeoutMs;
  const win = DECISION_WINDOW_MS[handler?.id];
  if (!win) return fallbackMs;
  return Math.max(MIN_RUN_TIMEOUT_MS, Math.round(win * tempo * RUN_WINDOW_FRACTION));
}
/** Batas total di ruang tunggu (kelipatan watchdogMs) walau handler terus "beraksi"; lalu pulang. */
export const LOBBY_DEADLINE_MULT = 5;

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

/** Identitas game dari state, tanpa seed/rng: id room/game bila ada, else null. */
function gameIdentity(game) {
  const id = game?.id ?? game?.roomId ?? game?.gameId ?? null;
  return id == null ? null : String(id);
}

/** Himpunan id/nama pemain (untuk mendeteksi game lain di path yang sama). */
function playerKeys(game) {
  return playersOf(game).map((p) => String(p.id ?? p.name ?? ''));
}

/**
 * Apakah `game` di `path` adalah game baru dibanding catatan `prev` (murni, diekspor untuk tes).
 * Game baru = path berubah (id room ada di URL), keluar dari game_over, ronde mundur, id game berubah,
 * atau daftar pemain sama sekali berbeda. State yang sesaat tidak terbaca BUKAN game baru.
 * @param {{path: string|null, phase: string|null, round: number|null, id?: string|null, players?: string[]|null}} prev
 */
export function isNewGame(prev, game, path) {
  if (prev.path !== path) return true;
  if (!game) return false;
  if (prev.phase === 'game_over' && game.phase !== 'game_over') return true;
  if (Number.isFinite(prev.round) && Number.isFinite(game.round) && game.round < prev.round) return true;
  const id = gameIdentity(game);
  if (prev.id != null && id != null && prev.id !== id) return true;
  const keys = playerKeys(game);
  if (prev.players?.length && keys.length && !keys.some((k) => prev.players.includes(k))) return true;
  return false;
}

/** Hasil `p`, atau `onTimeout()` bila `p` belum selesai dalam `ms` (timer dibersihkan saat `p` selesai). */
function withTimeout(p, ms, onTimeout) {
  let t;
  const guard = new Promise((resolve) => {
    t = setTimeout(() => resolve(onTimeout()), ms);
  });
  return Promise.race([Promise.resolve(p).finally(() => clearTimeout(t)), guard]);
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
 * `env` = seam untuk tes (semua opsional): dom, act, readGame, readMe, now, isHidden, path, runTimeoutMs.
 * @param {{getConfig: () => object, emit: (e: object) => void, log: object, handlers?: object[], env?: object}} deps
 */
export function createEngine({ getConfig, emit, log, handlers = allHandlers, env = {} }) {
  const dom = env.dom ?? domDefault;
  const act = env.act ?? actDefault;
  const readGame = env.readGame ?? readGameDefault;
  const readMe = env.readMe ?? readMeDefault;
  const now = env.now ?? (() => Date.now());
  const isHidden = env.isHidden ?? (() => document.hidden);
  const currentPath = env.path ?? (() => location.pathname);
  /** Seam tes: angka = batas seragam untuk semua handler (menimpa batas per handler). */
  const runTimeoutOverride = env.runTimeoutMs ?? null;
  const list = [...handlers].sort((a, b) => a.priority - b.priority);
  const chat = createChat({ getConfig, dom, act, log });
  let timer = null;
  let running = false;
  let generation = 0;
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
  let lastActionAt = now();
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
  let prev = { path: null, phase: null, round: null, id: null, players: null };
  let gameOverEmitted = false;

  const sendStatus = (patch, force = false) => {
    status = { ...status, ...patch, type: 'status', lastAction };
    const t = now();
    if (!force && t - lastStatusAt < STATUS_GAP_MS) return;
    lastStatusAt = t;
    emit({ ...status, ts: t });
  };

  // log yang juga mencatat aksi terakhir
  const ctxLog = {
    info: (m) => {
      lastAction = { ...(lastAction ?? {}), msg: m, ts: now() };
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

  function trackGame(game, path, t) {
    const newGame = isNewGame(prev, game, path);
    if (newGame && prev.path !== null) {
      memo = {};
      insightMemory = {};
      lastInsight = null;
      decisions.length = 0;
      chat.reset();
      gameOverEmitted = false;
    }
    const keys = game ? playerKeys(game) : [];
    prev = {
      path,
      phase: game ? game.phase : newGame ? null : prev.phase,
      round: game ? game.round : newGame ? null : prev.round,
      id: game ? (gameIdentity(game) ?? (newGame ? null : prev.id)) : newGame ? null : prev.id,
      players: keys.length ? keys : newGame ? null : prev.players,
    };
    if (game?.phase === 'game_over' && !gameOverEmitted) {
      gameOverEmitted = true;
      const ranking = rankingOf(game);
      emit({ type: 'game_over', ts: t, round: game.round ?? null, ranking });
      log.info('Game selesai.');
    } else if (game && game.phase !== 'game_over') gameOverEmitted = false;
  }

  /** Bot sedang tidak bertindak (mati/jeda): watchdog tidak boleh menghitung waktu ini sebagai macet. */
  const idle = (patch) => {
    lastActionAt = now();
    return sendStatus(patch);
  };

  async function tick() {
    if (busy || !running) return;
    busy = true;
    try {
      const cfg = getConfig();
      const t0 = now();
      if (!cfg.enabled) return idle({ state: 'paused', handler: null, reason: 'off' });
      if (validatedCfg !== cfg) {
        validatedCfg = cfg;
        const errs = validateConfig(cfg);
        configOk = errs.length === 0;
        errs.forEach((e) => log.error(`Konfigurasi: ${e}`));
      }
      if (!configOk) return idle({ state: 'paused', handler: null, reason: 'config' });
      if (isHidden()) {
        if (!hiddenLogged) {
          hiddenLogged = true;
          log.info('Tab tidak terlihat; bot dijeda sampai tab aktif lagi.');
        }
        return idle({ state: 'paused', handler: null, reason: 'hidden' });
      }
      hiddenLogged = false;
      const path = currentPath();
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
      trackGame(game, path, t0);

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
        if (sig) lastActionAt = now();
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
        now,
        chat,
      };
      dom.invalidate?.();
      const scopes = scopesFor(path, dom.inLobby());
      // Tenggat ruang tunggu: handler lobby yang terus "beraksi" (mis. undang ulang) tidak boleh menahan
      // bot di room mati selamanya.
      if (scopes.has('lobby')) memo.lobbySince ??= t0;
      else delete memo.lobbySince;
      let chosen = null;
      let detected = null;
      for (const h of list) {
        if (!scopes.has(h.scope)) continue;
        if ((benched.get(h.id) ?? 0) > now()) continue;
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
      if (view && t0 - insightAt >= INSIGHT_GAP_MS) {
        insightAt = t0;
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
        const before = lastAction;
        const TIMED_OUT = Symbol('timeout');
        const runTimeoutMs = runTimeoutOverride ?? runTimeoutFor(chosen, { tempo: tempoFactor(game) });
        try {
          result = await withTimeout(chosen.run(ctx, detected), runTimeoutMs, () => TIMED_OUT);
        } catch (e) {
          log.error(`Handler ${chosen.id} galat: ${e?.message ?? e}`);
          result = false;
        }
        if (result === TIMED_OUT) {
          log.warn(`Handler ${chosen.id} tidak selesai dalam ${Math.round(runTimeoutMs / 1000)} dtk; dianggap gagal.`);
          result = false;
        }
        // Pesan aksi hanya dari run() ini (ctxLog.info membuat objek baru), bukan sisa handler sebelumnya.
        const runMsg = lastAction !== before ? (lastAction?.msg ?? null) : null;
        // Pengaman: handler yang terus terdeteksi tapi tidak bisa bertindak (run() false) jangan memblokir
        // handler berprioritas lebih rendah selamanya (mis. modal "X bangkrut → Lanjut").
        if (result !== false && ctx.policy?.lastReason && runMsg) {
          decisions.push({ ts: now(), fn: chosen.id, label: runMsg, reason: ctx.policy.lastReason });
          if (decisions.length > 15) decisions.shift();
        }
        if (ctx.policy) ctx.policy.lastReason = '';
        if (result === false) {
          const n = (idleRuns.get(chosen.id) ?? 0) + 1;
          idleRuns.set(chosen.id, n);
          if (n >= STUCK_RUNS) {
            idleRuns.set(chosen.id, 0);
            benched.set(chosen.id, now() + BENCH_MS);
            log.debug(`Handler ${chosen.id} tidak bisa bertindak ${n}x; dilewati sementara.`);
          }
        } else idleRuns.set(chosen.id, 0);
        if (result !== false) {
          lastActionAt = now();
          lastAction = { handler: chosen.id, msg: runMsg, ts: lastActionAt };
        }
        sendStatus({ ...base, state: result === false ? 'waiting' : 'acting', handler: chosen.id });
      } else {
        let chatted = false;
        try {
          chatted = await chat.flush();
        } catch (e) {
          log.debug(`chat gagal: ${e?.message ?? e}`);
        }
        if (chatted) lastActionAt = now();
        sendStatus({ ...base, state: 'waiting', handler: null });
      }

      // Guest yang menunggu undangan (beranda/online) memang diam tanpa batas. Guest di ruang tunggu
      // menunggu host mulai: batas lebih longgar (5× watchdog) agar room mati tetap ditinggalkan.
      const guestHome = cfg.role === 'guest' && (path === '/' || path.startsWith('/online'));
      const limit = cfg.role === 'guest' && scopes.has('lobby') ? cfg.timing.watchdogMs * 5 : cfg.timing.watchdogMs;
      const lobbyStuck =
        memo.lobbySince != null && now() - memo.lobbySince > cfg.timing.watchdogMs * LOBBY_DEADLINE_MULT;
      if (lobbyStuck) {
        log.warn('Terlalu lama di ruang tunggu; kembali ke beranda.');
        lastActionAt = now();
        memo = {};
        act.goHome(0);
      } else if (!guestHome && now() - lastActionAt > limit) {
        log.warn('Tidak ada aksi terlalu lama; kembali ke beranda.');
        lastActionAt = now();
        memo = {};
        act.goHome(0);
      }
    } catch (e) {
      log.error(`Galat loop: ${e?.message ?? e}`);
    } finally {
      busy = false;
    }
  }

  // Tiap start() menaikkan `generation`; loop lama (tick masih berjalan saat stop()+start()) berhenti
  // sendiri karena generasinya tidak cocok, jadi tidak pernah ada dua loop.
  function schedule(gen) {
    if (!running || gen !== generation) return;
    const ms = getConfig().timing?.tickMs ?? 350;
    timer = setTimeout(async () => {
      if (gen !== generation) return;
      await tick();
      schedule(gen);
    }, ms);
  }

  return {
    start() {
      if (running) return;
      running = true;
      generation++;
      lastActionAt = now();
      log.info('Bot dimulai.');
      schedule(generation);
    },
    stop() {
      running = false;
      generation++;
      clearTimeout(timer);
      sendStatus({ state: 'paused', handler: null }, true);
      log.info('Bot dihentikan.');
    },
    reset() {
      memo = {};
      chat.reset();
      lastActionAt = now();
      gameOverEmitted = false;
    },
    getStatus: () => status,
    tick,
  };
}
