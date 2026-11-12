/**
 * Helper bersama untuk handler. Fungsi murni (tanpa DOM) diekspor agar bisa diuji.
 */
import { TILES } from '../data/board.js';
import { KEEP_CARDS } from '../data/cards.js';
import { norm } from '../dom/query.js';
import { playersOf } from '../state/reader.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TILE_PATTERNS = TILES.map((t, i) => ({ i, kind: t.kind, name: norm(t.name) }))
  .map((e) => ({ ...e, re: new RegExp(`(^|[^a-z0-9])${esc(e.name)}($|[^a-z0-9])`) }))
  .sort((a, b) => b.name.length - a.name.length);

/**
 * Cari indeks petak dari teks (nama kota / gerbang). `kinds` membatasi jenis petak.
 * @param {string} text
 * @param {string[]} [kinds]
 * @returns {number|null}
 */
export function tileIndexFromText(text, kinds = ['city']) {
  const t = norm(text);
  if (!t) return null;
  for (const e of TILE_PATTERNS) if (kinds.includes(e.kind) && e.re.test(t)) return e.i;
  return null;
}

const KEEP_ALIASES = {
  'restu-ibu': ['restu ibu'],
  'orang-dalam': ['orang dalam'],
  'joki-dadu': ['joki'],
  'voucher-tol': ['voucher tol', 'voucher'],
  'flash-sale': ['flash sale'],
  'numpang-dulu': ['numpang'],
  pengacara: ['pengacara'],
  asuransi: ['asuransi'],
  'juru-parkir': ['juru parkir'],
  'surat-rt': ['surat keterangan rt', 'surat rt', 'keterangan rt'],
};

/** Id kartu simpanan dari teks tombol ("Pakai Pengacara Kenalan" -> 'pengacara'), atau null. */
export function keepCardIdFromText(text) {
  const t = norm(text);
  for (const [id, card] of Object.entries(KEEP_CARDS)) {
    if (t.includes(norm(card.name))) return id;
  }
  for (const [id, words] of Object.entries(KEEP_ALIASES)) {
    if (words.some((w) => t.includes(w))) return id;
  }
  return null;
}

/** "3 petak ke depan" -> 3, selain itu null. */
export function tollStepsFromText(text) {
  const m = /(\d+)\s*petak ke depan/.exec(norm(text));
  return m ? Number(m[1]) : null;
}

/** "terima 25%" / "25%" -> 25. */
export function percentFromText(text) {
  const m = /(\d+)\s*%/.exec(String(text ?? ''));
  return m ? Number(m[1]) : null;
}

/** Nama pengirim dari judul "<nama> mengajak mabar" / "<nama> minta uang". */
export function nameFromTitle(text, suffix) {
  const re = suffix === 'mabar' ? /^(.+?)\s+mengajak mabar$/i : /^([^/]+?)\s+minta uang\b/i;
  const m = re.exec(
    String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  return m ? m[1].trim() : null;
}

/** Label tombol opsi segmented ruang tunggu dari cfg.room. Akses selain privat/teman dipaksa ke Privat. */
export function roomOptionLabels(room = {}) {
  const access = room.access === 'teman' ? 'Teman' : 'Privat';
  const cash = { 5: 'Rp5 jt', 10: 'Rp10 jt', 15: 'Rp15 jt' }[room.startingCash];
  const players = { 4: '4 orang', 6: '6 orang', 8: '8 orang' }[room.maxPlayers];
  const map = {
    pulau: 'Pulau',
    'kota-banjir': 'Kota Banjir',
    'ibu-kota-baru': 'Ibu Kota Baru',
    'desa-sawah': 'Desa Sawah',
    acak: 'Acak',
  }[room.map];
  const diff = { santai: 'Santai', normal: 'Normal', inflasi: 'Inflasi', krismon: 'Krismon' }[room.difficulty];
  const mode = { survival: 'Survival', ronde: 'Ronde' }[room.mode];
  // Sub-opsi jumlah ronde ("Batas ronde") hanya muncul saat mode Ronde dipilih.
  // Label asli di game: "10 ronde" / "15 ronde" / "20 ronde".
  const rounds = room.mode === 'ronde' ? { 10: '10 ronde', 15: '15 ronde', 20: '20 ronde' }[room.rounds] : null;
  return [
    { key: 'access', label: access },
    { key: 'mode', label: mode },
    { key: 'rounds', label: rounds },
    { key: 'difficulty', label: diff },
    { key: 'startingCash', label: cash },
    { key: 'maxPlayers', label: players },
    { key: 'map', label: map },
    { key: 'awards', label: room.awards === false ? 'Lewati' : 'Ada' },
  ].filter((x) => x.label);
}

export const IGNORED_LABELS = new Set(['tutup', 'chat', 'aset', 'riwayat', 'menu', 'stiker', 'nanti']);

export function nowMs(ctx) {
  const n = ctx?.now;
  return typeof n === 'function' ? n() : typeof n === 'number' ? n : Date.now();
}

/** true bila aksi `key` boleh jalan (tidak dalam jeda `ms`); mencatat waktunya di ctx.memo. */
export function throttle(ctx, key, ms) {
  const t = (ctx.memo.__throttle ??= {});
  const now = nowMs(ctx);
  if (now - (t[key] ?? 0) < ms) return false;
  t[key] = now;
  return true;
}

export const pause = (ctx) => ctx.act.pause(ctx.cfg?.timing?.actionDelayMs);

/** Panggil fungsi policy(view, ...args); undefined/gagal -> fallback (nilai atau fungsi). */
export function ask(ctx, fnName, fallback, ...args) {
  try {
    const fn = ctx.policy?.[fnName];
    if (typeof fn === 'function' && ctx.view) {
      const r = fn.call(ctx.policy, ctx.view, ...args);
      if (r !== undefined) return r;
    }
  } catch (e) {
    ctx.log.warn(`Strategi ${fnName} gagal: ${e?.message ?? e}`);
  }
  return typeof fallback === 'function' ? fallback() : fallback;
}

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** Giliran saya? Bila state tidak terbaca dianggap ya (DOM yang menentukan). */
export function isMyTurnOrUnknown(ctx) {
  const cp = ctx.game?.currentPlayer;
  if (cp == null || !ctx.me) return true;
  return sameId(cp, ctx.me.id);
}

export function findPlayerByName(game, name) {
  const n = norm(name);
  return playersOf(game).find((p) => norm(p.name) === n) ?? null;
}

export function findPlayerById(game, id) {
  return playersOf(game).find((p) => sameId(p.id, id)) ?? null;
}

/** Pemain yang namanya muncul di teks (nama terpanjang dulu). */
export function findPlayerInText(game, text) {
  const t = norm(text);
  return (
    playersOf(game)
      .filter((p) => p.name && t.includes(norm(p.name)))
      .sort((a, b) => String(b.name).length - String(a.name).length)[0] ?? null
  );
}

/** Petak tempat saya berdiri (dari state), atau null. */
export const myPosition = (ctx) => (Number.isFinite(ctx.me?.position) ? ctx.me.position : null);

/** Kontainer baris terbesar yang hanya memuat satu tombol sejenis (untuk membaca nama kota di samping tombol). */
export function rowOfButton(ctx, btn, sameKind) {
  let row = btn;
  for (let p = btn.parentElement, i = 0; p && i < 6; p = p.parentElement, i++) {
    const n = ctx.dom.buttons(p).filter((b) => sameKind(ctx.dom.labelOf(b))).length;
    if (n !== 1) break;
    row = p;
  }
  return row;
}

/** Nama akun lain (selain saya) dari cfg.accounts. */
export function otherAccounts(cfg) {
  const me = norm(cfg.myName);
  return (cfg.accounts ?? []).filter((n) => norm(n) !== me);
}

const NAME_CHAR = '[\\p{L}\\p{N}\\p{M}._-]';

/**
 * Apakah `name` muncul utuh (bukan potongan nick lain) di `text`. Tanpa beda huruf besar/kecil.
 * Titik penutup kalimat setelah nama ("… JULE.") tetap dianggap batas.
 */
export function textHasName(text, name) {
  const n = norm(name);
  if (!n) return false;
  return new RegExp(`(?<!${NAME_CHAR})${esc(n)}(?=\\.?(?!${NAME_CHAR}))`, 'u').test(norm(text));
}

/** Nama akun (dari `wanted`) yang muncul utuh di `text`; nama terpanjang dulu agar "JULE" tak kalah oleh "JUL". */
export function nameInText(text, wanted) {
  return [...wanted].sort((a, b) => norm(b).length - norm(a).length).find((n) => textHasName(text, n)) ?? null;
}

/** Teks notifikasi/peristiwa ("JULE bergabung", "JULE keluar") bukan bukti kehadiran. */
const EVENT_TEXT =
  /(^|\s)(bergabung|keluar|masuk|meninggalkan|diundang|terundang|mengajak|undang|dikeluarkan)(\s|$|[.!])/u;

/**
 * Gabungkan bukti kehadiran di ruang tunggu (murni, bisa diuji).
 * - `texts`: teks pendek dari elemen ruang tunggu (sudah tanpa modal Undang teman / dialog / chat).
 * - `onlyHost`: teks "Butuh minimal 2 pemain." terlihat → pasti belum ada akun lain.
 * - `startEnabled`: "Mulai main" aktif → game sendiri menjamin ≥ 2 pemain.
 * @returns {{present: string[], missing: string[], count: number}}
 */
export function combinePresence({ others, texts, onlyHost = false, startEnabled = false }) {
  const roster = texts.filter((t) => !EVENT_TEXT.test(norm(t)));
  const present = onlyHost ? [] : others.filter((n) => roster.some((t) => textHasName(t, n)));
  const missing = others.filter((n) => !present.includes(n));
  const count = Math.min(1 + others.length, Math.max(1 + present.length, startEnabled && !onlyHost ? 2 : 1));
  return { present, missing, count };
}

const NOT_LOBBY = '[role="dialog"], [aria-modal="true"], dialog, [data-w62]';
const LOBBY_CONTROL = /^(mulai main|undang teman|bagikan link|link tersalin|atur)$/;
const CHAT_CLIMB_MAX = 4;

/** Modal Undang teman (selalu diabaikan). */
function inviteModalBox(dom) {
  const title = dom.findLeaf('undang teman');
  return title ? (dom.climb(title, (p) => dom.findButton('tutup', p, { enabledOnly: false })) ?? title) : null;
}

/** Panel chat: naik dari input "Tulis pesan…" (maks 4 level) tanpa melewati kontainer tombol ruang tunggu. */
function chatBox(dom) {
  const chat = document.querySelector('input[placeholder^="Tulis pesan" i], textarea[placeholder^="Tulis pesan" i]');
  if (!chat) return null;
  let box = chat;
  for (let p = chat.parentElement, i = 0; p && p !== document.body && i < CHAT_CLIMB_MAX; p = p.parentElement, i++) {
    if (dom.findButton(LOBBY_CONTROL, p, { enabledOnly: false })) break;
    box = p;
  }
  return box;
}

/** Teks pendek (≤ 80 karakter) dari elemen terlihat di ruang tunggu, di luar `skip`. */
function lobbyTexts(dom, skip) {
  const root = document.body;
  if (!root) return [];
  const seen = new Set();
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!el || seen.has(el) || !node.nodeValue.trim()) continue;
    seen.add(el);
    const raw = el.textContent;
    if (raw.length > 80 || el.closest('script, style, input, textarea, ' + NOT_LOBBY)) continue;
    if (skip.some((b) => b && b.contains(el)) || !dom.isVisible(el)) continue;
    out.push(norm(raw));
  }
  return out;
}

/**
 * Akun lain yang hadir di ruang tunggu. Nama dicari di elemen pendek di luar modal "Undang teman",
 * dialog lain, dan panel chat (dulu memakai teks body sehingga nama di daftar undangan dianggap hadir).
 * Pengaman: nama saya sendiri pasti ada di daftar pemain; kalau tidak terbaca, pengecualian chat
 * kemungkinan ikut menelan daftar pemain, jadi dihitung ulang tanpa pengecualian chat.
 * Hasil di-cache 300 ms di ctx.memo.
 */
export function lobbyPresence(ctx) {
  const cache = (ctx.memo.__presence ??= { t: -Infinity, v: null });
  const now = nowMs(ctx);
  if (cache.v && now - cache.t <= 300) return cache.v;
  const { dom } = ctx;
  const invite = inviteModalBox(dom);
  let texts = lobbyTexts(dom, [invite, chatBox(dom)]);
  if (ctx.cfg.myName && !texts.some((t) => textHasName(t, ctx.cfg.myName))) texts = lobbyTexts(dom, [invite]);
  const start = dom.findButton('mulai main', document, { enabledOnly: false });
  cache.v = combinePresence({
    others: otherAccounts(ctx.cfg),
    texts,
    onlyHost: !!dom.findLeaf(/^butuh minimal 2 pemain\.?$/),
    startEnabled: !!start && !dom.isDisabled(start),
  });
  cache.t = now;
  return cache.v;
}

export const pathname = () => (typeof location !== 'undefined' ? location.pathname : '/');
