import { ask, isMyTurnOrUnknown, throttle } from './util.js';

/** Kocok dadu: tahan/ketuk tombol, lepas di zona target dari policy.rollTarget (bawaan: perfect). */
export default {
  id: 'roll',
  scope: 'game',
  priority: 70,
  detect(ctx) {
    if (!isMyTurnOrUnknown(ctx)) return null;
    return ctx.dom.findButtonByAria(/^kocok dadu:/i);
  },
  async run(ctx, btn) {
    if (!throttle(ctx, 'roll', 2500)) return false;
    const target = ask(ctx, 'rollTarget', 'perfect');
    const res = await ctx.act.holdRoll(btn, {
      target: ['perfect', 'cupu', 'biasa'].includes(target) ? target : 'perfect',
    });
    const pct = Number.isFinite(res.pos) ? `${(res.pos * 100).toFixed(1)}%` : '?';
    ctx.log.info(`Kocok (${target}) dilepas di ${pct} [${res.reason}].`);
    ctx.memo.preRoll = null;
    if (res.reason === 'zona' && target === 'perfect') {
      ctx.memo.perfectStreak = (ctx.memo.perfectStreak ?? 0) + 1;
      if (ctx.memo.perfectStreak >= 3) ctx.chat?.react('perfect_streak');
    } else ctx.memo.perfectStreak = 0;
    await ctx.act.sleep(1500);
    return true;
  },
};
