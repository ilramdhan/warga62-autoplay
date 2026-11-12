// Helper bersama untuk popup & options (di-bundle esbuild).
import { normalizeConfig, validateConfig } from '../core/config.js';

export const KEYS = { config: 'w62.config', status: 'w62.status', logs: 'w62.logs', command: 'w62.command' };

export async function loadConfig() {
  const r = await chrome.storage.local.get(KEYS.config);
  return normalizeConfig(r[KEYS.config] || {});
}

export async function saveConfig(cfg) {
  const normalized = normalizeConfig(cfg);
  await chrome.storage.local.set({ [KEYS.config]: normalized });
  return normalized;
}

/** validateConfig bisa mengembalikan array, {errors}, atau {ok}; seragamkan ke array string. */
export function errorsOf(cfg) {
  let v;
  try {
    v = validateConfig(cfg);
  } catch (e) {
    return [String(e && e.message ? e.message : e)];
  }
  if (Array.isArray(v)) return v.map(String);
  if (v && Array.isArray(v.errors)) return v.errors.map(String);
  return [];
}

export async function loadStatus() {
  try {
    const r = await chrome.storage.session.get(KEYS.status);
    if (r[KEYS.status]) return r[KEYS.status];
  } catch (_e) {}
  const r = await chrome.storage.local.get(KEYS.status);
  return r[KEYS.status] || null;
}

export async function loadLogs() {
  const r = await chrome.storage.local.get(KEYS.logs);
  return Array.isArray(r[KEYS.logs]) ? r[KEYS.logs] : [];
}

export function onStorageChange(cb) {
  chrome.storage.onChanged.addListener((changes, area) => cb(changes, area));
}

export function formatRupiah(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

export function logLine(l) {
  const t = l.ts ? new Date(l.ts).toLocaleTimeString('id-ID', { hour12: false }) : '--:--:--';
  const msg = l.msg ?? l.message ?? (typeof l.text === 'string' ? l.text : JSON.stringify(l));
  return `${t} ${msg}`;
}

export function statusFields(s) {
  const src = s && typeof s === 'object' ? (s.status && typeof s.status === 'object' ? s.status : s) : {};
  const me = src.me && typeof src.me === 'object' ? src.me : {};
  return {
    state: src.state ?? src.engineState ?? null,
    handler: src.handler ?? src.lastHandler ?? null,
    round: src.round ?? null,
    phase: src.phase ?? null,
    reason: src.reason ?? null,
    players: Array.isArray(src.players) ? src.players.map(String) : [],
    foreign: Array.isArray(src.foreign) ? src.foreign.map(String) : [],
    cash: src.cash ?? me.cash ?? null,
    at: (s && (s.receivedAt || s.ts)) || null,
  };
}
