import { ask, throttle } from './util.js';

const WALK = /^jalan ke /;
const USE = /^pakai joki,? jalan ke /;

function diceFrom(ctx) {
  const g = ctx.game;
  const d = g?.pending?.dice ?? g?.dice ?? g?.lastRoll;
  return Array.isArray(d) && d.length >= 2 ? [Number(d[0]), Number(d[1])] : null;
}

/** Modal Joki Dadu: jalan apa adanya, atau ubah satu dadu (ketuk dadu) bila policy.jokiDadu menyuruh. */
export default {
  id: 'joki-dadu',
  scope: 'game',
  priority: 38,
  detect: (ctx) => ctx.dom.findButton(WALK) || ctx.dom.findButton(USE),
  async run(ctx) {
    const { findButton, findLeaf, climb, buttons } = ctx.dom;
    if (!throttle(ctx, 'joki', 2000)) return false;
    const anchor = findButton(WALK) || findButton(USE);
    const box = climb(anchor, (p) => buttons(p).length >= 1 && /dadu/i.test(p.textContent)) ?? document;
    const dice = diceFrom(ctx);
    const plan = dice ? ask(ctx, 'jokiDadu', null, { dice }) : null;
    if (plan && Number.isInteger(plan.dieIndex) && plan.value >= 1 && plan.value <= 6 && findLeaf(/ketuk dadu/, box)) {
      const faces = [...box.querySelectorAll('div, button, span')].filter(
        (e) => e.children.length === 0 && /^[1-6]$/.test(e.textContent.trim()),
      );
      const die = faces[plan.dieIndex];
      for (let i = 0; die && i < 6 && Number(die.textContent.trim()) !== plan.value; i++) {
        ctx.act.click(die);
        await ctx.act.sleep(250);
      }
      const use = findButton(USE, box);
      if (use) {
        ctx.act.click(use);
        ctx.log.info(`Joki Dadu: ubah dadu ${plan.dieIndex + 1} jadi ${plan.value}.`);
        await ctx.act.sleep(1200);
        return true;
      }
    }
    const walk = findButton(WALK, box) || findButton(WALK);
    if (!walk) return false;
    ctx.act.click(walk);
    ctx.log.info(`Joki Dadu: ${ctx.dom.labelOf(walk)}.`);
    await ctx.act.sleep(1200);
    return true;
  },
};
