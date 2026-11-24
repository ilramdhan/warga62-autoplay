const MAX_TEXT = 200;

/**
 * Teks penjelasan halaman galat di sekitar tombol (judul + keterangan), tanpa label tombol, dipotong `MAX_TEXT`.
 * Naik dari induk tombol sampai menemukan kontainer yang berisi teks selain label. Murni terhadap DOM yang diberikan.
 */
export function errorPageText(btn, label, max = MAX_TEXT) {
  const clean = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  const lbl = clean(label).toLowerCase();
  let p = btn?.parentElement ?? null;
  for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
    let t = clean(p.textContent);
    if (lbl) t = clean(t.replace(new RegExp(lbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' '));
    if (t.length >= 8) return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }
  return '';
}

/** Halaman galat: "Muat ulang" / "Cari room lain" -> kembali ke beranda. */
export default {
  id: 'error',
  scope: 'any',
  priority: 5,
  detect: (ctx) => ctx.dom.findButton(/^(muat ulang|cari room lain)$/),
  async run(ctx, btn) {
    const label = ctx.dom.labelOf(btn);
    const text = errorPageText(btn, label);
    if (!ctx.act.goHome(15000)) return false;
    ctx.log.warn(`Halaman galat [${label}]: ${text || '(tanpa keterangan)'} — kembali ke beranda.`);
    return true;
  },
};
