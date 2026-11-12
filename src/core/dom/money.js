/** Parsing & format rupiah gaya UI game ("Rp9,9 jt", "Rp900 rb", "Rp1.250.000"). */

const UNIT = { jt: 1e6, juta: 1e6, rb: 1e3, ribu: 1e3, m: 1e9, miliar: 1e9 };
const RE = /([-−–]\s*)?rp\.?\s*([-−–]\s*)?(\d[\d.,]*)\s*(jt|juta|rb|ribu|miliar|m)?(?![a-z])/i;

function parseNumber(raw, hasUnit) {
  const s = raw.replace(/[.,]+$/, '');
  const hasC = s.includes(',');
  const hasD = s.includes('.');
  if (hasC && hasD) {
    return s.lastIndexOf(',') > s.lastIndexOf('.')
      ? parseFloat(s.replace(/\./g, '').replace(',', '.'))
      : parseFloat(s.replace(/,/g, ''));
  }
  if (hasC) {
    const parts = s.split(',');
    const thousands = parts.length > 2 || (parts[1].length === 3 && !hasUnit);
    return parseFloat(thousands ? s.replace(/,/g, '') : s.replace(',', '.'));
  }
  if (hasD) {
    const parts = s.split('.');
    const thousands = parts.length > 2 || parts[1].length === 3;
    return parseFloat(thousands ? s.replace(/\./g, '') : s);
  }
  return parseFloat(s);
}

/**
 * "Rp9,9 jt" -> 9900000, "Rp900 rb" -> 900000, "−Rp9,9 jt" -> -9900000. Tidak cocok -> null.
 * @param {string} text
 * @returns {number|null}
 */
export function parseRupiah(text) {
  const m = RE.exec(String(text ?? ''));
  if (!m) return null;
  const unit = m[4] ? m[4].toLowerCase() : '';
  const n = parseNumber(m[3], !!unit);
  if (!Number.isFinite(n)) return null;
  const value = Math.round(n * (UNIT[unit] || 1));
  return m[1] || m[2] ? -value : value;
}

const trim2 = (x) => String(Math.round(x * 100) / 100).replace('.', ',');

/**
 * Format ala UI game. `compact` (bawaan): "Rp9,9 jt", "Rp900 rb", "Rp500". Selain itu "Rp1.250.000".
 * @param {number} n
 * @param {{compact?: boolean}} [opts]
 */
export function formatRupiah(n, { compact = true } = {}) {
  const value = Math.round(Number(n) || 0);
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (!compact) return `${sign}Rp${String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  if (abs >= 1e9) return `${sign}Rp${trim2(abs / 1e9)} m`;
  if (abs >= 1e6) {
    const v = Math.round((abs / 1e6) * 100) / 100;
    return v >= 1000 ? `${sign}Rp${trim2(abs / 1e9)} m` : `${sign}Rp${trim2(abs / 1e6)} jt`;
  }
  if (abs >= 1e3) {
    const v = Math.round((abs / 1e3) * 100) / 100;
    return v >= 1000 ? `${sign}Rp${trim2(abs / 1e6)} jt` : `${sign}Rp${trim2(abs / 1e3)} rb`;
  }
  return `${sign}Rp${abs}`;
}
