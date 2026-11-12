import { nowMs, lobbyPresence, nameInText, throttle } from './util.js';

const UNDANG = /^undang$/;
const TERUNDANG = /^terundang$/;

/** Kotak modal "Undang teman" (judul → naik sampai ada tombol Tutup), atau null bila tertutup. */
function inviteBox(dom) {
  const title = dom.findLeaf('undang teman');
  return title ? (dom.climb(title, (p) => dom.findButton('tutup', p, { enabledOnly: false })) ?? null) : null;
}

const CLOSE_TRIES = 3;

/** Tutup modal: "Tutup", lalu Escape bila gagal. true bila modal benar-benar hilang. */
async function closeBox(ctx, box) {
  const close = ctx.dom.findButton('tutup', box ?? document);
  if (close) {
    ctx.act.click(close);
    if (await ctx.act.waitFor(() => !inviteBox(ctx.dom), { timeout: 1500 })) return true;
  }
  ctx.act.pressKey(document.activeElement ?? document.body, 'keydown', 'Escape');
  return !!(await ctx.act.waitFor(() => !inviteBox(ctx.dom), { timeout: 1000 }));
}

/**
 * Ruang tunggu (host): buka "Undang teman", TUNGGU daftar teman termuat (muncul async setelah modal
 * dibuka), lalu klik "Undang" hanya untuk akun cfg.accounts yang BELUM hadir, verifikasi jadi "Terundang".
 * Diulang tiap inviteRetryMs selama masih ada akun yang belum masuk. Modal yang tertinggal terbuka ditutup.
 */
export default {
  id: 'lobby-invite',
  scope: 'lobby',
  priority: 82,
  detect(ctx) {
    if (ctx.cfg.role !== 'host' || !ctx.dom.inLobby() || !ctx.memo.configured) return null;
    // Modal tertinggal terbuka (mis. ditutup gagal) menghalangi "Mulai main": tutup dulu (maks CLOSE_TRIES).
    if (inviteBox(ctx.dom)) return (ctx.memo.inviteCloseFails ?? 0) < CLOSE_TRIES ? { closeOnly: true } : null;
    ctx.memo.inviteCloseFails = 0;
    const { missing } = lobbyPresence(ctx);
    if (!missing.length) return null;
    const last = ctx.memo.lastInviteAt ?? 0;
    return !last || nowMs(ctx) - last >= ctx.cfg.timing.inviteRetryMs ? { missing } : null;
  },
  async run(ctx, detected) {
    if (detected.closeOnly) {
      if (!throttle(ctx, 'invite-close', 2000)) return false;
      if (await closeBox(ctx, inviteBox(ctx.dom))) {
        ctx.log.info('Menutup modal Undang teman.');
        return true;
      }
      ctx.memo.inviteCloseFails = (ctx.memo.inviteCloseFails ?? 0) + 1;
      if (ctx.memo.inviteCloseFails >= CLOSE_TRIES) {
        ctx.log.warn('Modal Undang teman tidak bisa ditutup; menunggu watchdog.');
      }
      return false; // tidak dihitung aksi, supaya watchdog tetap bisa memulihkan
    }
    const { findButton, findButtons, labelOf, buttons, norm } = ctx.dom;
    const open = findButton('undang teman');
    if (!open) return false;

    // Catat waktu di awal: kegagalan apa pun tetap menunggu inviteRetryMs, tidak mencoba tiap tick.
    ctx.memo.firstInviteAt ??= nowMs(ctx);
    ctx.memo.lastInviteAt = nowMs(ctx);
    {
      ctx.act.click(open);
      // Daftar teman dimuat async (~300 ms); tunggu tombol Undang/Terundang muncul, bukan sekadar judul modal.
      const rowsIn = (root) =>
        findButtons(UNDANG, root, { enabledOnly: false }).length +
        findButtons(TERUNDANG, root, { enabledOnly: false }).length;
      await ctx.act.waitFor(() => inviteBox(ctx.dom) && rowsIn(inviteBox(ctx.dom)), { timeout: 4000 });
      await ctx.act.sleep(400);

      const box = inviteBox(ctx.dom);
      if (!box) {
        ctx.log.warn('Modal Undang teman tidak terbuka.');
        return false;
      }
      const wanted = detected.missing;

      const rowNameOf = (btn) => {
        let row = btn;
        for (let p = btn.parentElement, i = 0; p && p !== box && i < 5; p = p.parentElement, i++) {
          if (buttons(p).filter((b) => UNDANG.test(labelOf(b)) || TERUNDANG.test(labelOf(b))).length !== 1) break;
          row = p;
        }
        return nameInText(row.textContent, wanted);
      };

      const invited = [];
      const already = [];
      for (const btn of findButtons(TERUNDANG, box, { enabledOnly: false })) {
        const name = rowNameOf(btn);
        if (name) already.push(name);
      }
      for (const btn of findButtons(UNDANG, box)) {
        const name = rowNameOf(btn);
        if (!name || invited.includes(name)) continue;
        ctx.act.click(btn);
        // Satu klik cukup; perubahan ke "Terundang" bisa agak telat. Jangan klik ganda.
        const ok = await ctx.act.waitFor(
          () => !btn.isConnected || TERUNDANG.test(labelOf(btn)) || ctx.dom.isDisabled(btn),
          { timeout: 3500 },
        );
        invited.push(ok ? name : `${name} (?)`);
        await ctx.act.sleep(300);
      }

      const offline = wanted.filter((n) => !invited.some((x) => x.startsWith(n)) && !already.includes(n));
      if (invited.length) ctx.log.info(`Mengundang: ${invited.join(', ')}.`);
      if (already.length) ctx.log.info(`Sudah diundang, menunggu: ${already.join(', ')}.`);
      if (offline.length) {
        const why = rowsIn(box) ? 'tidak ada di daftar teman online' : 'belum ada teman online';
        ctx.log.info(`Belum bisa diundang (${why}): ${offline.map(norm).join(', ')}.`);
      }
      if (!(await closeBox(ctx, box))) ctx.memo.inviteCloseFails = (ctx.memo.inviteCloseFails ?? 0) + 1;
      return true;
    }
  },
};
