/**
 * createPolicy(cfg) -> Policy (lihat docs/architecture.md).
 * cfg.mode: 'grind' | 'arena'. cfg.policyFlags dari planner (opsional).
 * Setiap method dibungkus: kalau terjadi error, kembalikan default aman (tidak pernah melempar).
 */
import { createGrindPolicy } from './grind.js';
import { createSmartPolicy } from './smart.js';

export { createGrindPolicy } from './grind.js';
export { createSmartPolicy } from './smart.js';
export { planAchievements, flagsForRole } from './planner.js';

/** Dokumentasi flag policy yang dihasilkan planner. */
export const ACHIEVEMENT_FLAGS = {
  rollTarget: "'perfect' | 'cupu' | 'biasa' — target zona power bar.",
  holdBankruptUntilRound:
    'Feeder menahan bangkrut (menyisakan kas, pinjam) sampai ronde ini (Juara 2 butuh ≥ 10 ronde).',
  minRounds: 'Ronde minimum game (informasi untuk host/engine).',
  wantPinjol: 'Ambil Pinjol saat Gali Lubang bila tersedia.',
  wantJail: 'Jangan bayar jaminan / jangan pakai Orang Dalam di Lapas; Joki Dadu & tol diarahkan ke Razia/Pengadilan.',
  wantBail: 'Bayar jaminan Lapas setiap kali bisa.',
  wantElit: 'Prioritaskan bangun sampai Perumahan Elit.',
  wantTakeover: 'Ambil alih setiap kali terjangkau.',
  wantProvinces: 'Daftar id provinsi yang wajib dibeli (mis. ["dki"]).',
  maxBuild: 'Bangun sebanyak mungkin (cadangan minimum).',
  neverNegative: 'Cadangan kas lebih besar agar kas tidak pernah minus.',
  reserveOverride: 'Paksa cadangan kas (rupiah), mis. 0 untuk sengaja Gali Lubang.',
  lendInterest: 'Bunga pinjaman yang ditawarkan (0/10/25/50).',
  preferPlayerLoan: 'Feeder minta pinjaman pemain sebelum bangkrut.',
  feederBuyForTakeover: 'Feeder membeli kota supaya bisa diambil alih pemenang.',
  feederPayRent: 'Feeder diarahkan (tol/Joki Dadu) ke kota pemenang.',
  payStateWhenChoice: 'Pada kartu pilihan, pilih opsi bayar.',
  useAllKeepCards: 'Pakai semua kartu Simpanan begitu bisa.',
  useKeepCards: 'Daftar id kartu Simpanan yang selalu dipakai.',
  preferParking: 'Joki Dadu diarahkan ke Parkiran Liar.',
  manyDebtSteps: 'Gali Lubang satu langkah kecil per kali (eksperimental).',
  keepLoanToEnd: 'Jangan menolak pinjaman pemain demi Pinjol.',
  awards: 'Malam penghargaan harus "Ada".',
  winner: 'Sub-objek flag khusus pemenang (mode grind).',
  feeder: 'Sub-objek flag khusus feeder (mode grind).',
};

/** Default aman per method bila policy error. */
export const SAFE_DEFAULTS = {
  rollTarget: () => 'biasa',
  preRoll: () => [],
  shouldBuy: () => false,
  shouldTakeover: () => false,
  chooseUpgrades: () => [],
  chooseToll: (_v, options) => (Array.isArray(options) ? (options[0] ?? null) : null),
  chooseOption: () => 0,
  chooseTile: () => null,
  choosePlayer: (_v, arg) => (Array.isArray(arg?.candidates) ? (arg.candidates[0] ?? null) : null),
  useKeepCard: () => false,
  jokiDadu: () => null,
  debtStep: (_v, arg) => {
    if (Array.isArray(arg?.canSell) && arg.canSell.length) return { type: 'sell', tile: arg.canSell[0] };
    if (Array.isArray(arg?.canMortgage) && arg.canMortgage.length) {
      return { type: 'mortgage', tile: arg.canMortgage[0] };
    }
    return { type: 'bankrupt' };
  },
  lendOffer: () => null,
  acceptLoan: () => null,
  respondMoneyRequest: () => false,
  respondTrade: () => false,
};

/**
 * @param {object} cfg config bot (mode, winnerName, accounts, strategy, policyFlags, explain?)
 * @returns {object} Policy dengan `lastReason`, `mode`, dan semua method kontrak.
 */
export function createPolicy(cfg = {}) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const inner = c.mode === 'grind' ? createGrindPolicy(c) : createSmartPolicy(c);
  const policy = { mode: c.mode === 'grind' ? 'grind' : 'arena', lastReason: '', inner };
  for (const [name, fallback] of Object.entries(SAFE_DEFAULTS)) {
    policy[name] = (view, arg) => {
      try {
        const out = inner[name](view, arg);
        policy.lastReason = inner.lastReason;
        return out;
      } catch (err) {
        policy.lastReason = `error di ${name}: ${err?.message ?? err}; pakai default aman`;
        return fallback(view, arg);
      }
    };
  }
  return policy;
}
