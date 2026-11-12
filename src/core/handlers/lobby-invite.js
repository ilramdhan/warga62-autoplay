import { nowMs, otherAccounts, lobbyHasName } from './util.js';

/** Ruang tunggu (host): buka "Undang teman", klik "Undang" hanya untuk nama di cfg.accounts, ulangi tiap inviteRetryMs. */
export default {
  id: 'lobby-invite',
  scope: 'lobby',
  priority: 82,
  detect(ctx) {
    if (ctx.cfg.role !== 'host' || !ctx.dom.inLobby()) return null;
    const modal = ctx.dom.findLeaf('undang teman');
    if (modal) return { modal };
    if (!ctx.memo.configured) return null;
    const missing = otherAccounts(ctx.cfg).filter((n) => !lobbyHasName(ctx, n));
    if (!missing.length) return null;
    const last = ctx.memo.lastInviteAt ?? 0;
    return !last || nowMs(ctx) - last >= ctx.cfg.timing.inviteRetryMs ? { missing } : null;
  },
  async run(ctx, d) {
    const { findButton, findButtons, climb, norm, buttons } = ctx.dom;
    if (!d.modal) {
      const open = findButton('undang teman');
      if (!open) return false;
      ctx.act.click(open);
      await ctx.act.waitFor(() => ctx.dom.findLeaf('undang teman'), { timeout: 3000 });
      return true;
    }
    const box = climb(d.modal, (p) => findButton('tutup', p)) ?? document;
    const wanted = new Set(otherAccounts(ctx.cfg).map(norm));
    const invited = [];
    for (const btn of findButtons('undang', box)) {
      let row = btn;
      for (let p = btn.parentElement, i = 0; p && i < 5; p = p.parentElement, i++) {
        if (buttons(p).filter((b) => ctx.dom.labelOf(b) === 'undang').length !== 1) break;
        row = p;
      }
      const text = norm(row.textContent);
      const name = [...wanted].find((n) => text.includes(n));
      if (!name) continue;
      ctx.act.click(btn);
      invited.push(name);
      await ctx.act.sleep(500);
    }
    ctx.memo.firstInviteAt ??= nowMs(ctx);
    ctx.memo.lastInviteAt = nowMs(ctx);
    if (invited.length) ctx.log.info(`Mengundang: ${invited.join(', ')}.`);
    else ctx.log.info('Tidak ada akun yang bisa diundang (mungkin belum online).');
    const close = findButton('tutup', box);
    if (close) {
      ctx.act.click(close);
      await ctx.act.sleep(500);
    }
    return true;
  },
};
