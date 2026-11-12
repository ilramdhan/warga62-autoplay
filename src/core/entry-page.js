/**
 * Entry browser (di-bundle jadi bot.js IIFE). Menerima config dari runner (window.__W62_CONFIG__)
 * atau extension (postMessage dari bridge), dan meneruskan event ke host.
 */
import { createBot } from './index.js';

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
        window.postMessage({ source: 'w62-bot', type: 'event', event }, location.origin);
      } catch {
        // event tidak bisa di-clone: abaikan
      }
    },
  };

  const bot = createBot(window.__W62_CONFIG__ ?? {}, host);
  window.__W62_BOT__ = { version: 1, getStatus: bot.getStatus };

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const msg = ev.data;
    if (!msg || msg.source !== 'w62-host') return;
    if (msg.type === 'config' && msg.config) bot.updateConfig(msg.config);
    else if (msg.type === 'command') {
      if (msg.command === 'start') bot.updateConfig({ enabled: true });
      else if (msg.command === 'stop') bot.updateConfig({ enabled: false });
      else if (msg.command === 'reset') bot.reset();
    }
  });

  bot.start();
}

if (!window.__W62_BOT__) main();
