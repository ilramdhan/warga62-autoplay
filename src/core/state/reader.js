/**
 * Baca state game (read-only) dari React fiber. Tidak pernah membaca atau mengekspos seed/rng.
 */

const MAX_DEPTH = 120;
const FORBIDDEN_KEY = /seed|rng/i;

/** Fiber React dari sebuah node DOM. */
export function fiberOf(node) {
  if (!node) return null;
  const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
  return key ? node[key] : null;
}

/** Naik lewat `.return` mencari memoizedProps.game yang punya `players`. */
export function findGameInFiber(fiber, maxDepth = MAX_DEPTH) {
  let f = fiber;
  for (let i = 0; i < maxDepth && f; i++, f = f.return) {
    const p = f.memoizedProps;
    if (p && typeof p === 'object' && p.game && typeof p.game === 'object' && p.game.players) return p.game;
  }
  return null;
}

/** Kedalaman maksimum pembersihan kunci seed/rng (cukup untuk game.settings, players[i].x, pending.y.z). */
export const SANITIZE_DEPTH = 6;

const isPlain = (v) => {
  if (!v || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null || Array.isArray(v);
};

/**
 * Salinan `v` tanpa kunci yang cocok /seed|rng/i sampai `depth` level. Copy-on-write: objek/array yang
 * tidak berisi kunci terlarang dikembalikan apa adanya (tanpa alokasi). Objek non-plain tidak disentuh.
 */
function strip(v, depth) {
  if (depth <= 0 || !isPlain(v)) return v;
  if (Array.isArray(v)) {
    let out = null;
    for (let i = 0; i < v.length; i++) {
      const c = strip(v[i], depth - 1);
      if (c !== v[i]) (out ??= v.slice())[i] = c;
    }
    return out ?? v;
  }
  let out = null;
  for (const k of Object.keys(v)) {
    if (FORBIDDEN_KEY.test(k)) {
      out ??= { ...v };
      delete out[k];
      continue;
    }
    const c = strip(v[k], depth - 1);
    if (c !== v[k]) (out ??= { ...v })[k] = c;
  }
  return out ?? v;
}

/** Klon tanpa kunci seed/rng di level mana pun (dibatasi SANITIZE_DEPTH). Selalu objek baru di level atas. */
export function sanitizeGame(game) {
  if (!game || typeof game !== 'object') return null;
  const clone = strip(game, SANITIZE_DEPTH);
  return clone === game ? { ...game } : clone;
}

function anchors(doc) {
  const list = [];
  const push = (n) => n && !list.includes(n) && list.push(n);
  doc.querySelectorAll('button[aria-label^="Sorot kota"]').forEach((n, i) => i < 3 && push(n));
  push(doc.querySelector('button[aria-label^="Kocok dadu"]'));
  doc.querySelectorAll('[role="dialog"] button, [aria-modal="true"] button').forEach((n, i) => i < 3 && push(n));
  push(doc.querySelector('#root > *'));
  [...doc.querySelectorAll('button')].slice(0, 30).forEach(push);
  return list;
}

/** Jangkar terakhir yang berhasil menemukan game; dicoba lebih dulu agar tidak memindai DOM tiap tick. */
let lastAnchor = null;

/** @returns {object|null} salinan game tanpa seed/rng, atau null kalau tidak terbaca. */
export function readGame(doc = document) {
  try {
    if (lastAnchor?.isConnected && lastAnchor.ownerDocument === doc) {
      const game = findGameInFiber(fiberOf(lastAnchor));
      if (game) return sanitizeGame(game);
    }
    lastAnchor = null;
    for (const node of anchors(doc)) {
      const game = findGameInFiber(fiberOf(node));
      if (game) {
        lastAnchor = node;
        return sanitizeGame(game);
      }
    }
  } catch {
    // struktur fiber berubah: biarkan handler pakai DOM saja
  }
  return null;
}

/** Daftar pemain sebagai array (players bisa array atau objek berdasarkan id). */
export function playersOf(game) {
  const p = game?.players;
  if (!p) return [];
  return (Array.isArray(p) ? p : Object.values(p)).filter((x) => x && typeof x === 'object');
}

/** Pemain milik instance ini (nama sama dengan cfg.myName, tanpa membedakan huruf besar/kecil). */
export function readMe(game, cfg) {
  const name = String(cfg?.myName ?? '')
    .trim()
    .toLowerCase();
  if (!name) return null;
  return (
    playersOf(game).find(
      (p) =>
        String(p.name ?? '')
          .trim()
          .toLowerCase() === name,
    ) ?? null
  );
}
