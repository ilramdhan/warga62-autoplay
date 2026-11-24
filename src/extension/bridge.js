// Content script (ISOLATED world): jembatan chrome.storage <-> halaman (bot.js di MAIN world).
// Pesan dari halaman bisa dikirim skrip mana pun di MAIN world: event disaring dulu (sanitizeBotEvent)
// sebelum ditulis ke chrome.storage.
import { BOT_SOURCE, HOST_SOURCE, sanitizeBotEvent } from '../core/protocol.js';

const KEYS = { config: 'w62.config', status: 'w62.status', logs: 'w62.logs', command: 'w62.command' };
const MAX_LOGS = 500;

function toPage(payload) {
  window.postMessage({ source: HOST_SOURCE, ...payload }, location.origin);
}

async function sendConfig() {
  try {
    const r = await chrome.storage.local.get(KEYS.config);
    if (r[KEYS.config]) toPage({ type: 'config', config: r[KEYS.config] });
  } catch (_e) {}
}

async function setStatus(value) {
  try {
    await chrome.storage.session.set({ [KEYS.status]: value });
  } catch (_e) {
    try {
      await chrome.storage.local.set({ [KEYS.status]: value });
    } catch (_e2) {}
  }
}

let logQueue = [];
let flushing = false;
async function flushLogs() {
  if (flushing) return;
  flushing = true;
  try {
    while (logQueue.length) {
      const batch = logQueue;
      logQueue = [];
      const r = await chrome.storage.local.get(KEYS.logs);
      const cur = Array.isArray(r[KEYS.logs]) ? r[KEYS.logs] : [];
      await chrome.storage.local.set({ [KEYS.logs]: cur.concat(batch).slice(-MAX_LOGS) });
    }
  } catch (_e) {
  } finally {
    flushing = false;
  }
}

window.addEventListener('message', (ev) => {
  if (ev.source !== window || ev.origin !== location.origin) return;
  const d = ev.data;
  if (!d || typeof d !== 'object' || d.source !== BOT_SOURCE) return;
  // Bot dimuat setelah bridge (document_idle): saat minta config / siap, kirim ulang.
  if (d.type === 'request-config' || d.type === 'ready') {
    sendConfig();
    return;
  }
  if (d.type !== 'event') return;
  const e = sanitizeBotEvent(d.event);
  if (!e) return;
  if (e.type === 'status') {
    setStatus({ ...e, receivedAt: Date.now(), url: location.pathname });
  } else {
    if (logQueue.length >= MAX_LOGS) logQueue.shift();
    logQueue.push(e);
    flushLogs();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[KEYS.config]) toPage({ type: 'config', config: changes[KEYS.config].newValue });
  if (changes[KEYS.command] && changes[KEYS.command].newValue) {
    const c = changes[KEYS.command].newValue;
    if (['start', 'stop', 'reset'].includes(c.command)) toPage({ type: 'command', command: c.command });
  }
});

// Kirim config saat dimuat, lalu ulangi sebentar karena bot.js baru siap setelah document_idle.
sendConfig();
document.addEventListener('DOMContentLoaded', sendConfig);
window.addEventListener('load', sendConfig);
setTimeout(sendConfig, 1500);
setTimeout(sendConfig, 4000);
