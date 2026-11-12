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

function stripForbidden(obj) {
  const out = {};
  for (const k of Object.keys(obj)) if (!FORBIDDEN_KEY.test(k)) out[k] = obj[k];
  return out;
}

/** Klon dangkal tanpa kunci seed/rng (juga di `settings`). */
export function sanitizeGame(game) {
  if (!game || typeof game !== 'object') return null;
  const clone = stripForbidden(game);
  if (clone.settings && typeof clone.settings === 'object') clone.settings = stripForbidden(clone.settings);
  return clone;
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

/** @returns {object|null} salinan dangkal game, atau null kalau tidak terbaca. */
export function readGame(doc = document) {
  try {
    for (const node of anchors(doc)) {
      const game = findGameInFiber(fiberOf(node));
      if (game) return sanitizeGame(game);
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
