import { nowMs, lobbyPresence, throttle, inviteModalBox } from './util.js';

/**
 * Ruang tunggu (host): "Mulai main" bila cukup akun hadir — semua akun, atau minimal
 * `minStartPlayers` setelah jendela undangan (inviteRetryMs sejak undangan pertama) lewat.
 * Kehadiran dibaca dari daftar pemain ruang tunggu, BUKAN teks body (modal Undang teman memuat nama juga).
 */
export default {
  id: 'lobby-start',
  scope: 'lobby',
  priority: 84,
  detect(ctx) {
    if (ctx.cfg.role !== 'host' || !ctx.dom.inLobby() || inviteModalBox(ctx.dom)) return null;
    return ctx.dom.findButton('mulai main');
  },
  async run(ctx, btn) {
    if (ctx.memo.accessUnsafe || ctx.memo.configured !== 'ok') {
      if (throttle(ctx, 'start-blocked', 30000)) {
        ctx.log.warn('Menunggu pengaturan room (akses Privat/Teman) sebelum mulai.');
      }
      return false;
    }
    const { present, missing, count } = lobbyPresence(ctx);
    const all = missing.length === 0;
    const windowPassed =
      ctx.memo.firstInviteAt != null && nowMs(ctx) - ctx.memo.firstInviteAt >= ctx.cfg.timing.inviteRetryMs;
    const need = Math.max(2, ctx.cfg.timing.minStartPlayers);
    if (present.length === 0 && count >= 2 && throttle(ctx, 'presence-unread', 120000)) {
      ctx.log.warn('"Mulai main" aktif tapi nama pemain tidak terbaca di ruang tunggu; kehadiran ditebak minimal 2.');
    }
    if (count < need || !(all || windowPassed)) {
      if (throttle(ctx, 'start-wait', 30000)) {
        ctx.log.info(`Menunggu pemain (${count}/${need}); belum hadir: ${missing.join(', ') || '-'}.`);
      }
      return false;
    }
    if (!throttle(ctx, 'start', 4000)) return false;
    ctx.act.click(btn);
    const who = present.length ? ` (${present.join(', ')})` : '';
    ctx.log.info(`Mulai main dengan ${count} pemain${who}.`);
    await ctx.act.sleep(2000);
    return true;
  },
};
