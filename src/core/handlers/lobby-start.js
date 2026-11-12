import { nowMs, otherAccounts, lobbyHasName, throttle } from './util.js';

/** Ruang tunggu (host): "Mulai main" bila cukup akun hadir (semua, atau setelah jendela undangan lewat). */
export default {
  id: 'lobby-start',
  scope: 'lobby',
  priority: 84,
  detect(ctx) {
    if (ctx.cfg.role !== 'host' || !ctx.dom.inLobby() || ctx.dom.findLeaf('undang teman')) return null;
    return ctx.dom.findButton('mulai main');
  },
  async run(ctx, btn) {
    if (ctx.memo.accessUnsafe || ctx.memo.configured !== 'ok') {
      if (throttle(ctx, 'start-blocked', 30000)) {
        ctx.log.warn('Menunggu pengaturan room (akses Privat/Teman) sebelum mulai.');
      }
      return false;
    }
    const others = otherAccounts(ctx.cfg);
    const present = 1 + others.filter((n) => lobbyHasName(ctx, n)).length;
    const all = present >= 1 + others.length;
    const windowPassed = ctx.memo.firstInviteAt && nowMs(ctx) - ctx.memo.firstInviteAt >= ctx.cfg.timing.inviteRetryMs;
    if (present < ctx.cfg.timing.minStartPlayers || !(all || windowPassed)) return false;
    if (!throttle(ctx, 'start', 4000)) return false;
    ctx.act.click(btn);
    ctx.log.info(`Mulai main dengan ${present} pemain.`);
    await ctx.act.sleep(2000);
    return true;
  },
};
