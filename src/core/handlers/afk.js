import { throttle } from './util.js';

/** Layar AFK: klik "Aku kembali". */
export default {
  id: 'afk',
  scope: 'any',
  priority: 12,
  detect: (ctx) => ctx.dom.findButton('aku kembali'),
  async run(ctx, btn) {
    if (!throttle(ctx, 'afk', 2000)) return false;
    ctx.act.click(btn);
    ctx.log.info('Klik "Aku kembali" (AFK).');
    return true;
  },
};
