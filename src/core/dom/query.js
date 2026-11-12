/**
 * Pencarian elemen DOM. Teks tombol dirender UPPERCASE lewat CSS, jadi selalu bandingkan
 * `textContent` yang dinormalisasi (lowercase, spasi dirapikan), bukan `innerText`.
 */

let cache = null;
/** Buang cache daftar tombol (otomatis dibuang di akhir blok sinkron, atau setelah klik/tidur). */
export function invalidate() {
  cache = null;
}

/** @param {string} s */
export function norm(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** @param {Element|null|undefined} el */
export function isVisible(el) {
  if (!el || el.closest?.('[data-w62]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
}

/** Teks bernormalisasi sebuah elemen (fallback ke aria-label). */
export function labelOf(el) {
  return norm(el?.textContent || el?.getAttribute?.('aria-label') || '');
}

/** Alias: teks bernormalisasi. */
export const textOf = labelOf;

export const isDisabled = (el) => !!el && (el.disabled === true || el.getAttribute?.('aria-disabled') === 'true');

/**
 * Cocokkan `text` (sudah dinormalisasi) dengan matcher.
 * Matcher: string (sama persis setelah dinormalisasi), RegExp, atau function(text, el).
 */
export function matchLabel(matcher, text, el) {
  if (typeof matcher === 'string') return text === norm(matcher);
  if (matcher instanceof RegExp) {
    matcher.lastIndex = 0;
    return matcher.test(text);
  }
  if (typeof matcher === 'function') return !!matcher(text, el);
  return false;
}

/** Semua tombol/link/role=button yang terlihat. */
export function buttons(root = document) {
  if (root === document && cache) return cache;
  const list = [...root.querySelectorAll('button, a[href], [role="button"]')].filter(isVisible);
  if (root === document) {
    cache = list;
    queueMicrotask(invalidate);
  }
  return list;
}

/** Semua tombol yang cocok dengan teksnya. */
export function findButtons(matcher, root = document, { enabledOnly = true } = {}) {
  return buttons(root).filter((b) => {
    if (enabledOnly && isDisabled(b)) return false;
    return matchLabel(matcher, labelOf(b), b);
  });
}

/** Tombol pertama yang cocok teksnya. */
export function findButton(matcher, root = document, opts = {}) {
  return findButtons(matcher, root, opts)[0] ?? null;
}

/** Tombol berdasarkan `aria-label` (dinormalisasi). */
export function findButtonByAria(matcher, root = document, { enabledOnly = true } = {}) {
  return (
    buttons(root).find((b) => {
      if (enabledOnly && isDisabled(b)) return false;
      return matchLabel(matcher, norm(b.getAttribute('aria-label')), b);
    }) ?? null
  );
}

const LEAF_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,div,span,label,strong,b,li';

/**
 * Elemen teks (bukan tombol) terdalam yang teksnya cocok, mis. judul modal.
 * Elemen dengan sedikit anak ikut dipertimbangkan agar judul "<span>nama</span> mengajak mabar" terbaca.
 */
export function findLeaf(matcher, root = document) {
  const all = root.querySelectorAll(LEAF_SELECTOR);
  for (const el of all) {
    if (el.children.length > 3) continue;
    const raw = el.textContent;
    if (!raw || raw.length > 200) continue;
    const t = norm(raw);
    if (!matchLabel(matcher, t, el)) continue;
    if (el.closest('button, a[href], [role="button"]')) continue;
    if ([...el.children].some((c) => matchLabel(matcher, norm(c.textContent), c))) continue;
    if (isVisible(el)) return el;
  }
  return null;
}

/** Naik ke parent sampai `test(el)` benar. */
export function climb(el, test, max = 12) {
  let p = el;
  for (let i = 0; i < max && p; i++, p = p.parentElement) if (test(p)) return p;
  return null;
}

/** Kontainer (modal) terdekat dari elemen yang berisi minimal `min` tombol; fallback `document`. */
export function boxOf(el, min = 2) {
  return climb(el, (p) => buttons(p).length >= min) ?? document;
}

/** Dialog modal teratas yang terlihat (role=dialog / aria-modal), atau null. */
export function findModal() {
  const list = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')].filter(isVisible);
  return list[list.length - 1] ?? null;
}

/** Apakah halaman memuat teks (string atau RegExp) — dari body.textContent bernormalisasi. */
export function pageHas(text) {
  const body = norm(document.body?.textContent);
  return text instanceof RegExp ? text.test(body) : body.includes(norm(text));
}

/** Sedang di ruang tunggu room? */
export function inLobby() {
  return !!findButton(/^(bagikan link|link tersalin)$/, document, { enabledOnly: false });
}

/** Status terpilih sebuah tombol segmented: true / false / null (tidak diketahui). */
export function isSelected(el) {
  if (!el) return null;
  for (const a of ['aria-pressed', 'aria-checked', 'aria-selected', 'aria-current']) {
    const v = el.getAttribute(a);
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  const ds = el.getAttribute('data-state');
  if (ds) return ['on', 'active', 'checked', 'selected'].includes(ds.toLowerCase());
  return null;
}

/**
 * Opsi setelan room = komponen Segmented: `<label>` berisi `<input type=radio class=sr-only>` + teks.
 * Cari label (prioritas) yang teksnya sama persis; fallback ke button/role=button/role=radio.
 */
export function optionByText(text, root = document) {
  const want = norm(text);
  const radioLabels = [...root.querySelectorAll('label')].filter(isVisible);
  const hit = radioLabels.find(
    (l) => l.querySelector('input[type="radio"], input[type="checkbox"]') && norm(l.textContent) === want,
  );
  if (hit) return hit;
  return (
    [...root.querySelectorAll('button, a[href], [role="button"], [role="radio"]')]
      .filter(isVisible)
      .find((b) => norm(b.textContent) === want) ?? null
  );
}

/** Apakah opsi (label radio / tombol) sedang terpilih: dari input di dalamnya, lalu aria/data-state. */
export function optionChecked(el) {
  if (!el) return null;
  const input = el.querySelector ? el.querySelector('input[type="radio"], input[type="checkbox"]') : null;
  if (input) return !!input.checked;
  return isSelected(el);
}

/** Status centang checkbox (input atau role=checkbox). */
export function isChecked(el) {
  if (!el) return false;
  if (typeof el.checked === 'boolean') return el.checked;
  return el.getAttribute('aria-checked') === 'true';
}
