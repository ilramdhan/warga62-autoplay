import { nameFromTitle, throttle } from './util.js';

/** Undangan mabar: terima hanya dari hostName (peran guest, tidak sedang main); selain itu ditutup. */
export default {
  id: 'invite-incoming',
  scope: 'any',
  priority: 10,
  detect(ctx) {
    const title = ctx.dom.findLeaf(/ mengajak mabar$/);
    if (!title) return null;
    const from = nameFromTitle(title.textContent, 'mabar');
    if (!from) return null;
    return { title, from, box: ctx.dom.boxOf(title, 2) };
  },
  async run(ctx, { from, box }) {
    const { findButton, norm } = ctx.dom;
    const playing = ctx.game?.phase && ctx.game.phase !== 'game_over';
    const accept = ctx.cfg.role === 'guest' && norm(from) === norm(ctx.cfg.hostName) && !playing;
    if (accept) {
      const join = findButton('gabung', box);
      if (!join || !throttle(ctx, 'invite-gabung', 2500)) return false;
      ctx.act.click(join);
      ctx.log.info(`Menerima undangan dari ${from}.`);
      return true;
    }
    const close = findButton('tutup', box) || findButton('nanti', box);
    if (!close || !throttle(ctx, 'invite-tutup', 2000)) return false;
    ctx.act.click(close);
    ctx.log.info(`Menolak undangan dari ${from}.`);
    return true;
  },
};
