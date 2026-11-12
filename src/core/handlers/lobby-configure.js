import { ALLOWED_ACCESS } from '../config.js';
import { roomOptionLabels } from './util.js';

const ACCESS_LABELS = ['publik', 'teman', 'privat'];
const MAX_TRIES = 3;

/**
 * Ruang tunggu (host, sekali per room): buka "Atur", pasang opsi dari cfg.room (atau preset planner),
 * verifikasi, tutup. Akses selain Privat/Teman ditolak (dipaksa Privat). Gagal verifikasi akses -> memo.accessUnsafe.
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
    const { findButton, climb, norm, isSelected } = ctx.dom;
    ctx.memo.configTries = (ctx.memo.configTries ?? 0) + 1;
    if (ctx.memo.configTries > MAX_TRIES) {
      ctx.memo.configured = 'failed';
      ctx.log.error('Gagal mengatur room setelah beberapa percobaan; room tidak akan dimulai.');
      return false;
    }

    let room = { ...ctx.cfg.room };
    if (room.autoByAchievement && typeof ctx.policy?.roomPreset === 'function') {
      try {
        const preset = ctx.policy.roomPreset(ctx.view);
        if (preset && typeof preset === 'object') room = { ...room, ...preset };
      } catch (e) {
        ctx.log.warn(`Preset room gagal: ${e?.message ?? e}`);
      }
    }
    if (!ALLOWED_ACCESS.includes(ctx.cfg.room.access)) {
      ctx.log.warn(`Akses room "${ctx.cfg.room.access}" tidak diizinkan; memakai Privat.`);
    }
    room.access = ALLOWED_ACCESS.includes(ctx.cfg.room.access) ? ctx.cfg.room.access : 'privat';

    let anchor = findButton('privat', document, { enabledOnly: false });
    if (!anchor) {
      const open = findButton('atur');
      if (!open) {
        ctx.log.warn('Tombol "Atur" tidak ditemukan.');
        return false;
      }
      ctx.act.click(open);
      anchor = await ctx.act.waitFor(() => findButton('privat', document, { enabledOnly: false }), { timeout: 3000 });
      if (!anchor) {
        ctx.log.warn('Modal aturan main tidak terbuka.');
        return false;
      }
    }
    const box = climb(anchor, (p) => findButton(/^(selesai|tutup)$/, p)) ?? document;

    for (const { key, label } of roomOptionLabels(room)) {
      for (let i = 0; i < 3; i++) {
        const btn = findButton(norm(label), box, { enabledOnly: false });
        if (!btn) {
          ctx.log.warn(`Opsi "${label}" (${key}) tidak ditemukan.`);
          break;
        }
        if (isSelected(btn) === true) break;
        ctx.act.click(btn);
        await ctx.act.sleep(300);
        const again = findButton(norm(label), box, { enabledOnly: false });
        if (isSelected(again) !== false) break; // terpilih, atau tidak bisa diverifikasi
      }
    }

    const selectedAccess = ACCESS_LABELS.filter((l) => isSelected(findButton(l, box, { enabledOnly: false })) === true);
    const publicOn = selectedAccess.includes('publik');
    const wanted = norm(roomOptionLabels(room)[0].label);
    ctx.memo.accessUnsafe = publicOn;
    const close = findButton('selesai', box) || findButton('tutup', box);
    if (close) {
      ctx.act.click(close);
      await ctx.act.sleep(500);
    }
    if (publicOn) {
      ctx.log.error('Akses room masih Publik; tidak akan memulai. Ubah ke Privat/Teman.');
      return true;
    }
    ctx.memo.configured = 'ok';
    ctx.log.info(
      `Room diatur: akses ${wanted}, ${room.difficulty}, modal ${room.startingCash} jt, maks ${room.maxPlayers} pemain, peta ${room.map}.`,
    );
    return true;
  },
};
