import { ask, nowMs, throttle, tileIndexFromText } from './util.js';

const CHECKBOX = 'input[type="checkbox"], [role="checkbox"]';

function labelTextOf(ctx, cb) {
  const lab = cb.closest('label');
  if (lab) return lab.textContent ?? '';
  let p = cb.parentElement;
  for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
    if (tileIndexFromText(p.textContent ?? '') != null && p.querySelectorAll(CHECKBOX).length === 1) {
      return p.textContent;
    }
  }
  return cb.getAttribute('aria-label') ?? '';
}

/** Bangun (awaiting_upgrade): centang kota pilihan policy.chooseUpgrades, tekan "Bangun", tunggu animasi. */
export default {
  id: 'upgrade',
  scope: 'game',
  priority: 46,
  detect(ctx) {
    if (nowMs(ctx) < (ctx.memo.upgradeUntil ?? 0)) return null;
    return ctx.dom.findButton('tidak bangun', document, { enabledOnly: false });
  },
  async run(ctx, no) {
    const { findButton, boxOf, isChecked, isDisabled } = ctx.dom;
    if (!throttle(ctx, 'upgrade', 2000)) return false;
    const box = boxOf(no, 2);
    const cbs = [...box.querySelectorAll(CHECKBOX)].filter((c) => !isDisabled(c));
    const items = cbs
      .map((cb) => ({ cb, tile: tileIndexFromText(labelTextOf(ctx, cb)) }))
      .filter((x) => x.tile != null);
    const chosen = items.length
      ? ask(
          ctx,
          'chooseUpgrades',
          [],
          items.map((x) => x.tile),
        )
      : [];
    const want = new Set(chosen);
    for (const { cb, tile } of items) {
      if (isChecked(cb) !== want.has(tile)) {
        ctx.act.click(cb);
        await ctx.act.sleep(120);
      }
    }
    await ctx.act.sleep(300);
    // kas kurang: kurangi pilihan dari belakang sampai tombol "Bangun" aktif
    const picked = () => items.filter((x) => isChecked(x.cb));
    let build = findButton(/^bangun rp/, box, { enabledOnly: false });
    while (build && build.disabled && picked().length) {
      ctx.act.click(picked().pop().cb);
      await ctx.act.sleep(150);
      build = findButton(/^bangun rp/, box, { enabledOnly: false });
    }
    const n = picked().length;
    if (n > 0 && build && !build.disabled) {
      ctx.act.click(build);
      ctx.log.info(`Bangun ${n} kota.`);
      const wait = 2000 + n * ctx.cfg.timing.buildDelayPerTileMs;
      ctx.memo.upgradeUntil = nowMs(ctx) + wait;
      await ctx.act.sleep(wait);
      return true;
    }
    const decline = findButton('tidak bangun', box) ?? no;
    ctx.act.click(decline);
    ctx.log.info('Tidak bangun.');
    await ctx.act.sleep(800);
    return true;
  },
};
