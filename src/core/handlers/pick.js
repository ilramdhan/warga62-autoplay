import { IGNORED_LABELS, ask, findPlayerInText, throttle, tileIndexFromText } from './util.js';

/** Pilih kota / pemain (awaiting_pick): policy.chooseTile / choosePlayer, jika tidak "Lewati". */
export default {
  id: 'pick',
  scope: 'game',
  priority: 52,
  detect(ctx) {
    const title = ctx.dom.findLeaf(/^pilih (kota|pemain)\.?$/);
    if (!title) return null;
    const kind = /kota/i.test(title.textContent) ? 'tile' : 'player';
    return { kind, box: ctx.dom.boxOf(title, 2) };
  },
  async run(ctx, { kind, box }) {
    const { buttons, labelOf, isDisabled, findButton } = ctx.dom;
    if (!throttle(ctx, 'pick', 2000)) return false;
    const skip = findButton('lewati', box);
    const opts = buttons(box).filter(
      (b) => b !== skip && !isDisabled(b) && !IGNORED_LABELS.has(labelOf(b)) && labelOf(b),
    );
    const purpose = ctx.game?.pending?.purpose ?? ctx.game?.pending?.step ?? 'unknown';
    let target = null;
    if (kind === 'tile') {
      const byTile = opts
        .map((b) => ({ b, tile: tileIndexFromText(labelOf(b), ['city', 'toll']) }))
        .filter((x) => x.tile != null);
      const tile = byTile.length
        ? ask(ctx, 'chooseTile', null, { purpose, candidates: byTile.map((x) => x.tile) })
        : null;
      target = byTile.find((x) => x.tile === tile)?.b ?? null;
    } else {
      const byPlayer = opts.map((b) => ({ b, p: findPlayerInText(ctx.game, labelOf(b)), text: labelOf(b) }));
      const cands = byPlayer.map((x) => String(x.p?.id ?? x.text));
      const picked = cands.length ? ask(ctx, 'choosePlayer', null, { purpose, candidates: cands }) : null;
      const i = cands.findIndex(
        (c) => picked != null && (c === String(picked) || c.toLowerCase() === String(picked).toLowerCase()),
      );
      target = i >= 0 ? byPlayer[i].b : null;
    }
    const btn = target ?? skip ?? opts[0] ?? null;
    if (!btn) return false;
    await ctx.act.pause(ctx.cfg.timing.actionDelayMs);
    ctx.act.click(btn);
    ctx.log.info(`Pilih ${kind === 'tile' ? 'kota' : 'pemain'}: ${labelOf(btn)}.`);
    await ctx.act.sleep(1000);
    return true;
  },
};
