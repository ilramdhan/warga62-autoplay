import { throttle } from './util.js';

/** Judul prompt "Masih ikut?" (muncul saat host menekan Mulai/Main lagi; harus dijawab dalam 10 dtk). */
const TITLE = /masih ikut/;
/** Tombol konfirmasi (label persis belum diverifikasi di game, lihat docs/ui-labels.md). */
const CONFIRM = /^(ya[,!.]? ?)?(aku |saya )?(masih ikut|ikut|ya)( dong| kok| main)?[!.]?$/;
/** Apa pun yang bisa membuat kita keluar dari room/menolak tidak pernah diklik. */
const LEAVE = /keluar|tinggal|tidak|nggak|enggak|gak|batal|tolak|nanti|tutup|pergi|leave|no\b/;
/** Label yang cukup spesifik untuk diklik walau judul tidak terbaca. */
const SPECIFIC = /^(ya[,!.]? ?)?(aku |saya )?masih ikut[!.]?$/;

const isConfirm = (text) => CONFIRM.test(text) && !LEAVE.test(text);
const isSpecific = (text) => SPECIFIC.test(text) && !LEAVE.test(text);

/**
 * Prompt "Masih ikut?" untuk pemain yang diam > 60 dtk: klik tombol konfirmasi supaya tidak dikeluarkan.
 * Konservatif: hanya tombol berlabel ikut/ya/masih ikut di dalam kotak prompt; tombol keluar tidak pernah diklik.
 */
export default {
  id: 'still-here',
  scope: 'any',
  priority: 13,
  detect(ctx) {
    const { findLeaf, climb, findButton } = ctx.dom;
    const title = findLeaf?.(TITLE);
    if (title) {
      const box = climb?.(title, (p) => !!findButton(isConfirm, p));
      const btn = box ? findButton(isConfirm, box) : null;
      if (btn) return btn;
    }
    return findButton(isSpecific) ?? null;
  },
  async run(ctx, btn) {
    if (!throttle(ctx, 'still-here', 2000)) return false;
    ctx.act.click(btn);
    ctx.log.info(`Klik "${ctx.dom.labelOf(btn)}" (konfirmasi masih ikut).`);
    return true;
  },
};
