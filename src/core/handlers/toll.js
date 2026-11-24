import { ask, myPosition, throttle, tileIndexFromText, tileName, tollStepsFromText } from './util.js';
import { BOARD_SIZE, TILES } from '../data/board.js';
import { norm } from '../dom/query.js';

const TOLL = /petak ke depan$/;

const GATES = TILES.map((t, i) => ({ i, kind: t.kind, name: norm(t.name) })).filter((t) => t.kind === 'toll');

/**
 * Gerbang dari teks tombol. textContent menempel tanpa spasi ("gerbang tol timurgerbang tol asli24 petak ke depan"),
 * jadi selain pencocokan kata utuh dicari juga kemunculan nama gerbang paling awal.
 */
export function gateFromText(text) {
  const exact = tileIndexFromText(text, ['toll']);
  if (exact != null) return exact;
  const t = norm(text);
  let best = null;
  for (const g of GATES) {
    const at = t.indexOf(g.name);
    if (at >= 0 && (best == null || at < best.at)) best = { at, i: g.i };
  }
  return best?.i ?? null;
}

/** Pesan log singkat dari gerbang terpilih saja: "tol ke Gerbang Tol Timur (24 petak)". */
export function tollLog(tile, steps) {
  const name = tileName(tile) ?? 'gerbang pertama';
  return `tol ke ${name}${Number.isFinite(steps) ? ` (${steps} petak)` : ''}`;
}

/** Gerbang tol: tiap opsi tombol "<gerbang> N petak ke depan"; pilihan dari policy.chooseToll. */
export default {
  id: 'toll',
  scope: 'game',
  priority: 40,
  detect(ctx) {
    const btns = ctx.dom.findButtons(TOLL);
    return btns.length ? btns : null;
  },
  async run(ctx, btns) {
    if (!throttle(ctx, 'toll', 2000)) return false;
    const pos = myPosition(ctx);
    const tiles = btns.map((b) => {
      const text = ctx.dom.labelOf(b);
      const byName = gateFromText(text);
      if (byName != null) return byName;
      const n = tollStepsFromText(text);
      return pos != null && n != null ? (pos + n) % BOARD_SIZE : null;
    });
    const known = tiles.filter((t) => t != null);
    const chosen = known.length ? ask(ctx, 'chooseToll', null, known) : null;
    const idx = chosen != null && tiles.includes(chosen) ? tiles.indexOf(chosen) : 0;
    ctx.act.click(btns[idx]);
    ctx.log.info(tollLog(tiles[idx], tollStepsFromText(ctx.dom.labelOf(btns[idx]))));
    await ctx.act.sleep(1200);
    return true;
  },
};
