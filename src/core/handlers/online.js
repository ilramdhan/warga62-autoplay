import { nowMs, pathname, throttle } from './util.js';

/** Tunggu pindah ke room / ruang tunggu setelah klik "Buat room" (halaman bisa lambat). */
export const CREATE_WAIT_MS = 15000;
/** Jeda minimal antar klik "Buat room" walau halaman belum pindah, agar tidak membuat beberapa room. */
export const CREATE_GUARD_MS = 20000;

const onOnline = () => pathname().replace(/\/+$/, '') === '/online';

/** Halaman /online: host klik "Buat room". Tidak menyentuh daftar room publik atau input kode. */
export default {
  id: 'online',
  scope: 'home',
  priority: 95,
  detect: (ctx) => ctx.cfg.role === 'host' && onOnline() && ctx.dom.findButton('buat room'),
  async run(ctx, btn) {
    const last = ctx.memo.roomCreateAt;
    if (last != null && nowMs(ctx) - last < CREATE_GUARD_MS) return false;
    if (!throttle(ctx, 'online', 4000)) return false;
    ctx.memo.roomCreateAt = nowMs(ctx);
    ctx.act.click(btn);
    ctx.log.info('Membuat room baru.');
    const moved = await ctx.act.waitFor(() => !onOnline() || ctx.dom.inLobby?.(), {
      timeout: CREATE_WAIT_MS,
      interval: 250,
    });
    if (!moved) ctx.log.warn('Room belum terbuka setelah klik "Buat room"; menunggu sebelum mencoba lagi.');
    return true;
  },
};
