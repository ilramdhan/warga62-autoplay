/** Halaman galat: "Muat ulang" / "Cari room lain" -> kembali ke beranda. */
export default {
  id: 'error',
  scope: 'any',
  priority: 5,
  detect: (ctx) => ctx.dom.findButton(/^(muat ulang|cari room lain)$/),
  async run(ctx, btn) {
    const label = ctx.dom.labelOf(btn);
    if (!ctx.act.goHome(15000)) return false;
    ctx.log.warn(`Halaman galat ("${label}"), kembali ke beranda.`);
    return true;
  },
};
