import { nowMs, otherAccounts, lobbyHasName } from './util.js';

const UNDANG = /^undang$/;
const TERUNDANG = /^terundang$/;

/**
 * Ruang tunggu (host): buka "Undang teman", TUNGGU daftar teman termuat (muncul async setelah modal
 * dibuka), lalu klik "Undang" hanya untuk nama di cfg.accounts dan verifikasi jadi "Terundang".
 * Diulang tiap inviteRetryMs selama masih ada akun yang belum masuk.
 */
export default {
  id: 'lobby-invite',
  scope: 'lobby',
  priority: 82,
  detect(ctx) {
    if (ctx.cfg.role !== 'host' || !ctx.dom.inLobby() || !ctx.memo.configured) return null;
    const missing = otherAccounts(ctx.cfg).filter((n) => !lobbyHasName(ctx, n));
    if (!missing.length) return null;
    const last = ctx.memo.lastInviteAt ?? 0;
    return !last || nowMs(ctx) - last >= ctx.cfg.timing.inviteRetryMs ? { missing } : null;
  },
  async run(ctx) {
    const { findButton, findButtons, climb, norm, buttons, labelOf, findLeaf } = ctx.dom;

    const open = findButton('undang teman');
    if (!open) return false;
    ctx.act.click(open);

    // Daftar teman dimuat async; tunggu tombol Undang/Terundang muncul, bukan sekadar judul modal.
    const hasRows = () =>
      findButtons(UNDANG, document, { enabledOnly: false }).length ||
      findButtons(TERUNDANG, document, { enabledOnly: false }).length;
    await ctx.act.waitFor(hasRows, { timeout: 4000 });
    await ctx.act.sleep(400);

    const modalLeaf = findLeaf('undang teman');
    const box = (modalLeaf && climb(modalLeaf, (p) => findButton('tutup', p))) ?? document;
    const wanted = otherAccounts(ctx.cfg).map(norm);

    const rowNameOf = (btn) => {
      let row = btn;
      for (let p = btn.parentElement, i = 0; p && i < 5; p = p.parentElement, i++) {
        if (buttons(p).filter((b) => UNDANG.test(labelOf(b)) || TERUNDANG.test(labelOf(b))).length !== 1) break;
        row = p;
      }
      const text = norm(row.textContent);
      return wanted.find((n) => text.includes(n)) ?? null;
    };

    const invited = [];
    for (const btn of findButtons(UNDANG, box)) {
      const name = rowNameOf(btn);
      if (!name) continue;
      ctx.act.click(btn);
      // Konfirmasi (perubahan ke "Terundang" bisa agak telat); satu klik sudah cukup, jangan klik ganda.
      const ok = await ctx.act.waitFor(() => !document.contains(btn) || TERUNDANG.test(labelOf(btn)) || btn.disabled, {
        timeout: 3500,
      });
      invited.push(ok ? name : `${name} (?)`);
      await ctx.act.sleep(400);
    }

    ctx.memo.firstInviteAt ??= nowMs(ctx);
    ctx.memo.lastInviteAt = nowMs(ctx);
    const rowsNow = findButtons(UNDANG, box).length + findButtons(TERUNDANG, box).length;
    if (invited.length) ctx.log.info(`Mengundang: ${invited.join(', ')}.`);
    else if (rowsNow === 0) ctx.log.info('Belum ada teman online yang bisa diundang; coba lagi nanti.');
    else ctx.log.info('Ada teman online, tapi bukan akun di daftar `accounts`; tidak diundang.');

    const close = findButton('tutup', box);
    if (close) {
      ctx.act.click(close);
      await ctx.act.sleep(400);
    }
    return true;
  },
};
