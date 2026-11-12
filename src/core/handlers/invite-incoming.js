import { lobbyPresence, nameFromTitle, pathname, throttle } from './util.js';

const ACCEPT = 'gabung';
const DECLINE = /^(tutup|nanti)$/;

/**
 * Undangan mabar ("<nama> mengajak mabar"): guest menerima hanya dari hostName dan hanya bila tidak
 * sedang di tengah game; selain itu ditutup ("Nanti"/"Tutup").
 */
export default {
  id: 'invite-incoming',
  scope: 'any',
  priority: 10,
  detect(ctx) {
    const { findLeaf, climb, findButton } = ctx.dom;
    const title = findLeaf(/ mengajak mabar$/);
    if (!title) return null;
    const from = nameFromTitle(title.textContent, 'mabar');
    if (!from) return null;
    // Kotak modal: utamakan leluhur yang memuat tombol Gabung (bisa ada ikon "Tutup" lebih dekat ke judul
    // yang tidak memuat Gabung); fallback leluhur dengan Tutup/Nanti untuk menolak.
    const box =
      climb(title, (p) => !!findButton(ACCEPT, p, { enabledOnly: false })) ??
      climb(title, (p) => !!findButton(DECLINE, p, { enabledOnly: false })) ??
      null;
    return box ? { from, box } : null;
  },
  async run(ctx, { from, box }) {
    const { findButton, norm, inLobby } = ctx.dom;
    const fromHost = norm(from) === norm(ctx.cfg.hostName);
    const inRoom = pathname().startsWith('/room/');
    const lobby = inRoom && inLobby();
    // Sedang main = di /room/ di luar ruang tunggu, kecuali halaman gabung (belum masuk) atau game sudah selesai.
    // State tak terbaca di tengah game tetap dianggap main (lebih aman daripada meninggalkan game).
    const joinPage =
      inRoom &&
      !lobby &&
      !ctx.game &&
      !!findButton(/^(gabung|menghubungkan…|menghubungkan\.\.\.)$/, document, {
        enabledOnly: false,
      });
    const playing = inRoom && !lobby && !joinPage && ctx.game?.phase !== 'game_over';
    // Sudah di ruang tunggu bersama host: undangan ulang tidak perlu (hindari keluar-masuk room).
    const withHost = lobby && lobbyPresence(ctx).present.some((n) => norm(n) === norm(ctx.cfg.hostName));
    if (ctx.cfg.role === 'guest' && fromHost && !playing && !withHost) {
      const join = findButton(ACCEPT, box) || findButton(ACCEPT);
      if (!join) {
        if (throttle(ctx, 'invite-wait', 10000)) ctx.log.info(`Undangan dari ${from}: menunggu tombol Gabung aktif.`);
        return false; // tombol masih "Menghubungkan…"/nonaktif: tunggu
      }
      if (!throttle(ctx, 'invite-gabung', 3000)) return false;
      ctx.act.click(join);
      ctx.log.info(`Menerima undangan dari ${from}.`);
      await ctx.act.sleep(1500);
      return true;
    }
    const close = findButton('nanti', box) || findButton('tutup', box);
    if (!close || !throttle(ctx, 'invite-tutup', 2000)) return false;
    ctx.act.click(close);
    const why = ctx.cfg.role !== 'guest' ? 'peran host' : !fromHost ? `bukan host ${ctx.cfg.hostName}` : 'sedang main';
    ctx.log.info(`Menolak undangan dari ${from} (${why}).`);
    return true;
  },
};
