import {
  closeDialog,
  nowMs,
  lobbyPresence,
  nameInElement,
  throttle,
  inviteModalBox,
  roomMaxPlayers,
  selectInvitees,
} from './util.js';

const UNDANG = /^undang$/;
const TERUNDANG = /^terundang$/;

/** Kotak modal "Undang teman" (di-scope ke modal, bukan BODY), atau null bila tertutup. */
const inviteBox = inviteModalBox;

const CLOSE_TRIES = 3;

/** Tutup modal: "Tutup" DI DALAM modal saja, lalu Escape bila gagal. true bila modal benar-benar hilang. */
function closeBox(ctx, box) {
  if (!box) return Promise.resolve(!inviteBox(ctx.dom));
  return closeDialog(ctx, {
    box,
    isOpen: () => inviteBox(ctx.dom),
    anywhere: false,
    enabledOnly: false,
    waitMs: 1500,
    escMs: 1000,
  });
}

/**
 * Ruang tunggu (host): buka "Undang teman", TUNGGU daftar teman termuat (muncul async setelah modal
 * dibuka), lalu klik "Undang" hanya untuk akun cfg.roster (akun yang ikut main) yang BELUM hadir, verifikasi jadi
 * "Terundang". Jumlah tamu tidak pernah melebihi Maks. pemain − 1 (lihat selectInvitees).
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
    const { missing, count } = lobbyPresence(ctx);
    if (!missing.length || count >= roomMaxPlayers(ctx.cfg)) return null;
    const last = ctx.memo.lastInviteAt ?? 0;
    return !last || nowMs(ctx) - last >= ctx.cfg.timing.inviteRetryMs ? { missing, count } : null;
  },
  async run(ctx, detected) {
    if (detected.closeOnly) {
      if (!throttle(ctx, 'invite-close', 2000)) return false;
      if (await closeBox(ctx, inviteBox(ctx.dom))) {
        ctx.log.info('Menutup modal Undang teman.');
        return false; // menutup modal bukan kemajuan (hanya klik Undang yang dihitung)
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
        return nameInElement(row, wanted);
      };

      const invited = [];
      const already = [];
      for (const btn of findButtons(TERUNDANG, box, { enabledOnly: false })) {
        const name = rowNameOf(btn);
        if (name) already.push(name);
      }
      const { invite: allowed, skipped } = selectInvitees({
        missing: wanted,
        pending: already,
        count: detected.count ?? lobbyPresence(ctx).count,
        maxPlayers: roomMaxPlayers(ctx.cfg),
      });
      for (const btn of findButtons(UNDANG, box)) {
        const name = rowNameOf(btn);
        if (!name || invited.includes(name) || !allowed.includes(name)) continue;
        ctx.act.click(btn);
        // Satu klik cukup; konfirmasi "Terundang" datang dari server (~2–4 dtk). Jangan klik ganda.
        const ok = await ctx.act.waitFor(
          () => !btn.isConnected || TERUNDANG.test(labelOf(btn)) || ctx.dom.isDisabled(btn),
          { timeout: 6000 },
        );
        invited.push(ok ? name : `${name} (?)`);
        await ctx.act.sleep(300);
      }

      const offline = allowed.filter((n) => !invited.some((x) => x.startsWith(n)) && !already.includes(n));
      if (skipped.length && throttle(ctx, 'invite-full', 60000)) {
        ctx.log.warn(`Kursi room penuh (maks ${roomMaxPlayers(ctx.cfg)}), tidak mengundang: ${skipped.join(', ')}.`);
      }
      if (invited.length) ctx.log.info(`Mengundang: ${invited.join(', ')}.`);
      if (already.length) ctx.log.info(`Sudah diundang, menunggu: ${already.join(', ')}.`);
      if (offline.length) {
        const why = rowsIn(box) ? 'tidak ada di daftar teman online' : 'belum ada teman online';
        ctx.log.info(`Belum bisa diundang (${why}): ${offline.map(norm).join(', ')}.`);
      }
      if (!(await closeBox(ctx, box))) ctx.memo.inviteCloseFails = (ctx.memo.inviteCloseFails ?? 0) + 1;
      // Hanya klik "Undang" yang dihitung aksi: membuka/menutup modal tanpa mengundang bukan kemajuan,
      // jadi watchdog tetap berjalan (dan tenggat ruang tunggu di engine membatasi undangan ulang).
      return invited.length > 0;
    }
  },
};
