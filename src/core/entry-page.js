/**
 * Entry browser (di-bundle jadi bot.js IIFE). Menerima config dari runner (window.__W62_CONFIG__)
 * atau extension (postMessage dari bridge), dan meneruskan event ke host.
 *
 * Target ditentukan saat build (`__W62_TARGET__`, lihat scripts/build.js), bukan dari state halaman:
 * - 'runner'   : dist/bot.js. Config dari window.__W62_CONFIG__ (addInitScript, jalan sebelum skrip halaman).
 *                Pesan `w62-host` diabaikan.
 * - 'extension': dist/extension/bot.js. window.__W62_CONFIG__ diabaikan (bisa di-set halaman);
 *                config & perintah hanya lewat pesan `w62-host` yang sudah disaring.
 */
/* global __W62_TARGET__ */
import { createBot } from './index.js';
import { BOT_SOURCE, filterHostMessage } from './protocol.js';

const TARGET = typeof __W62_TARGET__ === 'string' ? __W62_TARGET__ : 'runner';
// Penanda muat-ganda: didefinisikan bot sendiri (non-writable, non-configurable). Pemeriksaan memakai
// deskriptor milik window, jadi halaman yang menimpa window.__W62_BOT__ tidak lagi bisa memblokir bot.
const LOADED = Symbol.for('w62.autoplay.loaded');

function defineReadonly(key, value) {
  try {
    Object.defineProperty(window, key, { value, writable: false, configurable: false, enumerable: false });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const host = {
    emit(event) {
      if (event.type === 'log') console.log(`[W62 ${event.level}] ${event.msg}`);
      try {
        if (typeof window.__w62Emit === 'function') window.__w62Emit(event);
      } catch {
        // binding runner belum siap
      }
      try {
        window.postMessage({ source: BOT_SOURCE, type: 'event', event }, location.origin);
      } catch {
        // event tidak bisa di-clone: abaikan
      }
    },
  };

  const initial = TARGET === 'runner' ? (window.__W62_CONFIG__ ?? {}) : {};
  const bot = createBot(initial, host);
  defineReadonly('__W62_BOT__', Object.freeze({ version: 2, target: TARGET, getStatus: bot.getStatus }));

  if (TARGET === 'extension') {
    let lastErrors = '';
    window.addEventListener('message', (ev) => {
      if (ev.source !== window || ev.origin !== location.origin) return;
      const msg = filterHostMessage(ev.data);
      if (!msg) return;
      if (msg.type === 'config') {
        bot.updateConfig(msg.config);
        const sig = msg.errors.join(' | ');
        if (sig && sig !== lastErrors) console.warn(`[W62] config belum valid: ${sig}`);
        lastErrors = sig;
      } else if (msg.command === 'start') bot.updateConfig({ enabled: true });
      else if (msg.command === 'stop') bot.updateConfig({ enabled: false });
      else if (msg.command === 'reset') bot.reset();
    });
  }

  bot.start();
}

if (!Object.getOwnPropertyDescriptor(window, LOADED) && defineReadonly(LOADED, true)) main();
