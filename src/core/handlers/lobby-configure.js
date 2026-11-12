import { ALLOWED_ACCESS } from '../config.js';
import { roomOptionLabels } from './util.js';

const MAX_TRIES = 4;

/**
 * Ruang tunggu (host, sekali per room): buka panel "Aturan main" ("Atur" bila perlu), pasang opsi
 * dari cfg.roomPreset (atau cfg.room), lalu tutup dengan "Selesai".
 *
 * Opsi di game adalah komponen Segmented: tiap pilihan sebuah `<label>` dengan `<input type=radio>`
 * (bukan `<button>`), terpilih = radio `checked`. Akses selain Privat/Teman ditolak (dipaksa Privat).
 */
export default {
  id: 'lobby-configure',
  scope: 'lobby',
  priority: 80,
  detect(ctx) {
    if (ctx.cfg.role !== 'host' || ctx.memo.configured) return null;
    return ctx.dom.inLobby() ? { ok: true } : null;
  },
  async run(ctx) {
    const { findButton, optionByText, optionChecked, climb } = ctx.dom;
    ctx.memo.configTries = (ctx.memo.configTries ?? 0) + 1;
    if (ctx.memo.configTries > MAX_TRIES) {
      ctx.memo.configured = 'failed';
      ctx.log.error('Gagal mengatur room setelah beberapa percobaan; lanjut tanpa mengubah setelan.');
      return false;
    }

    const room = { ...ctx.cfg.room, ...(ctx.cfg.roomPreset ?? {}) };
    if (!ALLOWED_ACCESS.includes(room.access)) {
      ctx.log.warn(`Akses room "${room.access}" tidak diizinkan; memakai Privat.`);
      room.access = 'privat';
    }

    // Pastikan panel setelan terlihat (opsi radio ada); kalau belum, klik "Atur".
    const settingsVisible = () => optionByText('Privat') || optionByText('Teman') || optionByText('Survival');
    if (!settingsVisible()) {
      const open = findButton('atur');
      if (open) {
        ctx.act.click(open);
        await ctx.act.waitFor(() => settingsVisible(), { timeout: 3000 });
      }
    }
    const anchor = settingsVisible();
    if (!anchor) {
      ctx.log.warn('Panel aturan main tidak terbuka.');
      return false;
    }

    // Pasang tiap opsi lewat label radio-nya (lewati yang sudah terpilih).
    for (const { key, label } of roomOptionLabels(room)) {
      const el = optionByText(label);
      if (!el) {
        ctx.log.warn(`Opsi "${label}" (${key}) tidak ditemukan.`);
        continue;
      }
      if (optionChecked(el) === true) continue;
      ctx.act.click(el);
      await ctx.act.sleep(250);
    }

    // Keamanan akses: tidak aman kalau Publik terpilih, atau akses yang diinginkan jelas tidak terpilih.
    const publik = optionByText('Publik');
    const wanted = optionByText(room.access === 'teman' ? 'Teman' : 'Privat');
    const publicOn = optionChecked(publik) === true;
    const wantedOn = optionChecked(wanted) === true;
    ctx.memo.accessUnsafe = publicOn || (wanted != null && !wantedOn);

    // Tutup panel dengan "Selesai" (simpan), fallback "Tutup".
    const box = climb(anchor, (p) => findButton(/^(selesai|tutup)$/, p)) ?? document;
    const close = findButton('selesai', box) || findButton('selesai') || findButton('tutup', box);
    if (close) {
      ctx.act.click(close);
      await ctx.act.sleep(500);
    }

    if (ctx.memo.accessUnsafe) {
      ctx.log.error('Akses room bukan Privat/Teman; tidak akan memulai. Periksa setelan akses.');
      return true;
    }
    ctx.memo.configured = 'ok';
    ctx.log.info(
      `Room diatur: akses ${room.access}, ${room.difficulty}, modal ${room.startingCash} jt, maks ${room.maxPlayers} pemain, peta ${room.map}.`,
    );
    return true;
  },
};
