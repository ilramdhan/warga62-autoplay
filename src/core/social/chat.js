/**
 * Reaksi chat opsional (pesan cepat / stiker) saat kejadian tertentu. Hanya di room sendiri
 * (semua pemain adalah akun di cfg.accounts) dan hanya bila cfg.chat.enabled. Minimal 20 dtk antar pesan.
 */
import { playersOf } from '../state/reader.js';

export const MIN_GAP_MS = 20000;
const EXPIRE_MS = 30000;

/** Preset per kejadian: kata kunci stiker dan kalimat cepat (kalimat cepat sesuai tombol yang ada di game). */
export const PRESETS = {
  game_start: { sticker: 'semangat', phrase: 'Gas, mulai!' },
  bankrupt: { sticker: 'mampus', phrase: 'Siap bangkrut?' },
  perfect_streak: { sticker: 'keren', phrase: 'Gas, mulai!' },
  game_over: { sticker: 'gg', phrase: 'Halo, warga!' },
};

/** Room sendiri? Dengan state: semua pemain ada di cfg.accounts. Tanpa state: hanya host. */
export function isOwnRoom(game, cfg) {
  const names = new Set((cfg.accounts ?? []).map((n) => String(n).trim().toLowerCase()));
  const players = playersOf(game);
  if (players.length) {
    return players.every((p) =>
      names.has(
        String(p.name ?? '')
          .trim()
          .toLowerCase(),
      ),
    );
  }
  return cfg.role === 'host';
}

export function createChat({ getConfig, dom, act, log }) {
  let pending = [];
  let lastAt = 0;
  let lastGame = null;
  let prevBankrupt = new Set();
  let prevPhase = null;

  const react = (event) => {
    if (!PRESETS[event]) return;
    pending.push({ event, at: Date.now() });
    if (pending.length > 5) pending.shift();
  };

  /** Dipanggil engine tiap tick: mendeteksi kejadian dari perubahan state. */
  function observe(game) {
    lastGame = game;
    if (!game) return;
    const bankrupt = new Set(
      playersOf(game)
        .filter((p) => p.bankrupt)
        .map((p) => String(p.id ?? p.name)),
    );
    for (const id of bankrupt) if (!prevBankrupt.has(id) && prevPhase) react('bankrupt');
    prevBankrupt = bankrupt;
    if (game.phase !== prevPhase) {
      if (!prevPhase && (game.phase === 'order_roll' || game.phase === 'pre_roll')) react('game_start');
      if (game.phase === 'game_over' && prevPhase) react('game_over');
      prevPhase = game.phase;
    }
  }

  function reset() {
    pending = [];
    prevBankrupt = new Set();
    prevPhase = null;
  }

  async function sendCustom(text) {
    const input = [...document.querySelectorAll('input, textarea')].find(
      (i) => /^tulis pesan/i.test(i.placeholder ?? '') && dom.isVisible(i),
    );
    if (!input) return false;
    act.typeText(input, text);
    await act.sleep(200);
    const send = dom.findButton('kirim');
    if (!send) return false;
    act.click(send);
    return true;
  }

  async function sendSticker(keyword) {
    const open = dom.findButton('stiker');
    if (!open) return false;
    act.click(open);
    await act.sleep(500);
    const kw = dom.norm(keyword);
    const cand = [...document.querySelectorAll('button, [role="button"], img')].find((e) => {
      if (e === open || !dom.isVisible(e)) return false;
      const t = dom.norm(
        [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('alt'), e.textContent].join(' '),
      );
      return t.includes(kw);
    });
    if (!cand) {
      const close = dom.findButton('tutup');
      if (close) act.click(close);
      return false;
    }
    act.click(cand);
    return true;
  }

  /** Jalankan satu reaksi tertunda bila diizinkan. Mengembalikan true bila ada aksi UI. */
  async function flush() {
    const cfg = getConfig();
    const now = Date.now();
    pending = pending.filter((e) => now - e.at < EXPIRE_MS);
    if (!cfg.chat?.enabled) {
      pending = [];
      return false;
    }
    if (!pending.length || now - lastAt < MIN_GAP_MS) return false;
    const { event } = pending.shift();
    if (!isOwnRoom(lastGame, cfg)) return false;
    const preset = PRESETS[event];
    let sent = false;
    if (cfg.chat.customPhrases?.length) {
      const text = cfg.chat.customPhrases[Math.floor(Math.random() * cfg.chat.customPhrases.length)];
      sent = await sendCustom(text);
    }
    if (!sent && cfg.chat.stickers) sent = await sendSticker(preset.sticker);
    if (!sent && cfg.chat.quickPhrases) {
      const btn = dom.findButton(preset.phrase);
      if (btn) {
        act.click(btn);
        sent = true;
      }
    }
    if (sent) {
      lastAt = now;
      log.debug(`Chat otomatis (${event}).`);
    }
    return sent;
  }

  return { react, observe, flush, reset };
}
