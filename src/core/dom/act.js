/**
 * Aksi UI: klik, tahan tombol kocok, ketik teks. Semua lewat elemen/event seperti pemain biasa.
 */
import { invalidate } from './query.js';

export const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(
      () => {
        invalidate();
        resolve();
      },
      Math.max(0, ms),
    ),
  );

/** Angka acak dalam rentang [min, max] (ms). Dipakai sebagai jeda menunggu animasi. */
export function jitter(range = [250, 700]) {
  const [a, b] = Array.isArray(range) ? range : [range, range];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Math.round(lo + Math.random() * (hi - lo));
}

export const pause = (range) => sleep(jitter(range));

export function click(el) {
  if (!el) return false;
  el.scrollIntoView?.({ block: 'nearest' });
  el.click();
  invalidate();
  return true;
}

export function pressKey(el, type, key = 'Enter') {
  el.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }));
}

/** Tunggu sampai fn() truthy. Mengembalikan nilainya, atau null saat timeout. */
export async function waitFor(fn, { timeout = 5000, interval = 100 } = {}) {
  const t0 = performance.now();
  for (;;) {
    let v = null;
    try {
      v = fn();
    } catch {
      v = null;
    }
    if (v) return v;
    if (performance.now() - t0 >= timeout) return null;
    await sleep(interval);
  }
}

/** Tekan tombol "+" sampai nonaktif (maksimum). Mengembalikan jumlah klik. */
export async function pressPlusUntilMax(plusBtn, { maxClicks = 600, delayMs = 12 } = {}) {
  let n = 0;
  while (
    plusBtn?.isConnected &&
    !plusBtn.disabled &&
    plusBtn.getAttribute('aria-disabled') !== 'true' &&
    n < maxClicks
  ) {
    plusBtn.click();
    n++;
    await sleep(delayMs);
  }
  return n;
}

/** Isi input/textarea supaya React ikut tahu (native setter + event input). */
export function typeText(input, text) {
  if (!input) return false;
  const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  input.focus?.();
  if (setter) setter.call(input, text);
  else input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Zona lepas jarum (pecahan lebar bar). */
export const ROLL_TARGETS = {
  perfect: { lo: 0.855, hi: 0.905 },
  cupu: { lo: 0, hi: 0.35 },
  biasa: { lo: 0.5, hi: 0.8 },
};

export const isInZone = (pos, target = 'perfect') => {
  const z = ROLL_TARGETS[target] ?? ROLL_TARGETS.perfect;
  return pos >= z.lo && pos <= z.hi;
};

/** Mode ketuk (aria-label memuat "ketuk") atau tahan. */
export const isTapMode = (btn) => /ketuk/i.test(btn?.getAttribute?.('aria-label') ?? '');

/** Elemen jarum: div.absolute di dalam saudara sebelum tombol kocok. */
export function findNeedle(btn) {
  const bar = btn?.previousElementSibling;
  if (!bar) return null;
  return [...bar.querySelectorAll('div')].find((d) => /absolute/.test(d.className) && d.style.left !== '') ?? null;
}

function needlePos(needle, bar) {
  const left = needle.style.left;
  if (!left) return NaN;
  if (left.endsWith('px')) {
    const w = bar?.clientWidth || 0;
    return w ? parseFloat(left) / w : NaN;
  }
  return parseFloat(left) / 100;
}

/**
 * Tahan tombol kocok (Enter keydown), baca posisi jarum tiap frame, lepas saat masuk zona target.
 * Mode ketuk: keydown pertama memulai, keydown kedua melempar. Pengaman: lepas otomatis setelah 4 dtk.
 * @param {HTMLElement} button
 * @param {{target?: 'perfect'|'cupu'|'biasa', timeoutMs?: number}} [opts]
 * @returns {Promise<{pos:number, reason:'zona'|'timeout'|'tanpa-jarum', ms:number}>}
 */
export function holdRoll(button, { target = 'perfect', timeoutMs = 4000 } = {}) {
  const tap = isTapMode(button);
  const key = (type) => pressKey(button, type, 'Enter');
  const release = () => (tap ? key('keydown') : key('keyup'));
  button.focus?.();
  key('keydown');
  const t0 = performance.now();
  let needle = findNeedle(button);
  return new Promise((resolve) => {
    const finish = (reason, pos) => {
      release();
      invalidate();
      resolve({ pos, reason, ms: Math.round(performance.now() - t0) });
    };
    const loop = () => {
      const el = performance.now() - t0;
      if (!needle || !needle.isConnected) needle = findNeedle(button);
      const pos = needle ? needlePos(needle, button.previousElementSibling) : NaN;
      if (!needle && el > 400) return finish('tanpa-jarum', NaN);
      if (Number.isFinite(pos) && el > 40 && isInZone(pos, target)) return finish('zona', pos);
      if (el > timeoutMs) return finish('timeout', pos);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

/** Kembali ke beranda (pemulihan). Dibatasi minimal `minGapMs` antar pemanggilan (lintas reload). */
export function goHome(minGapMs = 15000) {
  try {
    const last = Number(sessionStorage.getItem('w62.lastHome') || 0);
    if (Date.now() - last < minGapMs) return false;
    sessionStorage.setItem('w62.lastHome', String(Date.now()));
  } catch {
    // sessionStorage tidak tersedia
  }
  location.assign('/');
  return true;
}
