#!/usr/bin/env node
// Playwright runner: menjalankan bot untuk beberapa akun (milik sendiri) di profil Chromium terpisah.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeConfig } from '../core/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://mainwarga62.id';
const PROFILES = join(ROOT, '.runner-profiles');
const BOT_JS = join(ROOT, 'dist', 'bot.js');
const CHROME_ARGS = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];
const COLORS = [36, 33, 35, 32, 34, 31, 96, 93];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let shuttingDown = false;
const stopWaiters = new Set();
function onShutdown(fn) {
  stopWaiters.add(fn);
}

// ---- util ------------------------------------------------------------------
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function safeDir(nick) {
  return String(nick).replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (_e) {}
  // Fallback: hormati NODE_PATH (ESM tidak membacanya secara bawaan).
  const paths = (process.env.NODE_PATH || '').split(':').filter(Boolean);
  const req = createRequire(join(ROOT, 'package.json'));
  for (const p of paths) {
    try {
      return req(req.resolve('playwright', { paths: [p] }));
    } catch (_e) {}
  }
  throw new Error('Playwright belum terpasang. Jalankan: npm ci && npx playwright install chromium');
}

function paint(i, text) {
  return `\x1b[${COLORS[i % COLORS.length]}m${text}\x1b[0m`;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Tidak bisa membaca ${file}: ${e.message}`);
  }
}

// ---- login -----------------------------------------------------------------
async function cmdLogin(args) {
  const nick = args.account;
  if (!nick || nick === true) throw new Error('Pakai: login --account <nick>');
  const { chromium } = await loadPlaywright();
  const dir = join(PROFILES, safeDir(nick));
  console.log(`Membuka browser untuk akun "${nick}". Login manual di jendela yang muncul, lalu tutup jendelanya.`);
  console.log(`Profil disimpan di ${dir} (berisi cookie login, jangan dibagikan).`);
  const ctx = await chromium.launchPersistentContext(dir, { headless: false, viewport: null, args: CHROME_ARGS });
  const closed = new Promise((r) => ctx.on('close', r));
  onShutdown(() => ctx.close().catch(() => {}));
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(`${SITE}/`).catch((e) => console.error('Gagal membuka situs:', e.message));
  await closed;
  console.log('Profil tersimpan.');
}

// ---- run -------------------------------------------------------------------
function accountConfig(base, account) {
  const cfg = structuredClone(base);
  delete cfg.headless;
  cfg.myName = account;
  cfg.role = account === base.hostName ? 'host' : 'guest';
  cfg.enabled = true;
  return normalizeConfig(cfg);
}

function printEvent(idx, nick, ev) {
  const tag = paint(idx, `[${nick}]`);
  const t = new Date(ev.ts || Date.now()).toLocaleTimeString('id-ID', { hour12: false });
  if (ev.type === 'status') {
    if (process.env.W62_VERBOSE) console.log(`${tag} ${t} status ${JSON.stringify(ev)}`);
    return;
  }
  const msg = ev.msg ?? ev.message ?? JSON.stringify(ev);
  const kind = ev.type === 'log' ? ev.level || 'info' : ev.type;
  const mark = ev.type === 'error' || kind === 'error' ? '\x1b[31m' + kind + '\x1b[0m' : kind;
  console.log(`${tag} ${t} ${mark} ${msg}`);
}

async function superviseAccount(pw, account, idx, base, headless, botSource) {
  const cfg = accountConfig(base, account);
  const dir = join(PROFILES, safeDir(account));
  const tag = (m) => console.log(`${paint(idx, `[${account}]`)} ${m}`);
  const guard = (code) => `if (location.origin === ${JSON.stringify(SITE)}) {\n${code}\n}`;
  let attempt = 0;

  while (!shuttingDown) {
    let ctx;
    let lastEvent = Date.now();
    let restart;
    const needRestart = new Promise((r) => (restart = r));
    try {
      ctx = await pw.chromium.launchPersistentContext(dir, {
        headless,
        viewport: { width: 1280, height: 900 },
        args: CHROME_ARGS,
      });
      await ctx.exposeBinding('__w62Emit', (_src, ev) => {
        lastEvent = Date.now();
        attempt = 0;
        if (ev && typeof ev === 'object') printEvent(idx, account, ev);
      });
      await ctx.addInitScript({ content: guard(`window.__W62_CONFIG__ = ${JSON.stringify(cfg)};`) });
      await ctx.addInitScript({ content: guard(botSource) });
      ctx.on('close', () => restart('context ditutup'));
      const page = ctx.pages()[0] || (await ctx.newPage());
      page.on('crash', () => restart('halaman crash'));
      page.on('close', () => restart('halaman ditutup'));

      for (let n = 0; ; n++) {
        try {
          await page.goto(`${SITE}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
          break;
        } catch (e) {
          if (shuttingDown) break;
          const wait = Math.min(60000, 2000 * 2 ** n);
          tag(`Gagal membuka situs (${e.message.split('\n')[0]}). Coba lagi ${Math.round(wait / 1000)} dtk.`);
          await sleep(wait);
        }
      }

      const watchdogMs = cfg.timing.watchdogMs;
      const timer = setInterval(() => {
        if (Date.now() - lastEvent > watchdogMs) {
          tag(`Tidak ada event ${Math.round((Date.now() - lastEvent) / 1000)} dtk, memuat ulang ke /.`);
          lastEvent = Date.now();
          page.goto(`${SITE}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        }
      }, 60000);
      onShutdown(() => restart('shutdown'));
      const reason = await needRestart;
      clearInterval(timer);
      if (!shuttingDown) tag(`Restart: ${reason}.`);
    } catch (e) {
      tag(`Error: ${e.message.split('\n')[0]}`);
    } finally {
      if (ctx) await ctx.close().catch(() => {});
    }
    if (shuttingDown) break;
    attempt++;
    await sleep(Math.min(60000, 2000 * 2 ** Math.min(attempt, 5)));
  }
  tag('Berhenti.');
}

async function cmdRun(args) {
  const file = resolve(process.cwd(), typeof args.config === 'string' ? args.config : 'runner.config.json');
  if (!existsSync(file)) {
    throw new Error(`File config tidak ditemukan: ${file}. Salin dari src/runner/runner.config.example.json`);
  }
  if (!existsSync(BOT_JS)) throw new Error('dist/bot.js belum ada. Jalankan: npm run build');
  const raw = readJson(file);
  const accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
  if (accounts.length < 2 || accounts.length > 8) throw new Error('config.accounts harus berisi 2 sampai 8 nick.');
  if (!raw.hostName || !accounts.includes(raw.hostName)) {
    throw new Error('config.hostName harus salah satu dari accounts.');
  }
  const headless = args.headful ? false : raw.headless !== false;
  const base = normalizeConfig({ ...raw, myName: raw.hostName });
  const botSource = readFileSync(BOT_JS, 'utf8');
  const pw = await loadPlaywright();

  // Guest dulu, host terakhir (jeda 2 detik).
  const ordered = [...accounts.filter((a) => a !== raw.hostName), raw.hostName];
  console.log(
    `Menjalankan ${ordered.length} akun (${headless ? 'headless' : 'headful'}). Tekan Ctrl+C untuk berhenti.`,
  );
  const tasks = [];
  for (const acc of ordered) {
    if (shuttingDown) break;
    const idx = accounts.indexOf(acc);
    tasks.push(superviseAccount(pw, acc, idx, { ...base, accounts, hostName: raw.hostName }, headless, botSource));
    await sleep(2000);
  }
  await Promise.all(tasks);
}

// ---- doctor ----------------------------------------------------------------
async function cmdDoctor(args) {
  let ok = true;
  const line = (pass, msg) => {
    if (!pass) ok = false;
    console.log(`${pass ? '[OK]  ' : '[GAGAL]'} ${msg}`);
  };
  const major = Number(process.versions.node.split('.')[0]);
  line(major >= 20, `Node ${process.versions.node} (butuh >= 20)`);
  try {
    await loadPlaywright();
    line(true, 'Playwright terpasang');
  } catch (e) {
    line(false, e.message);
  }
  line(existsSync(BOT_JS), `dist/bot.js ${existsSync(BOT_JS) ? 'ada' : 'belum ada (jalankan: npm run build)'}`);
  const file = resolve(process.cwd(), typeof args.config === 'string' ? args.config : 'runner.config.json');
  let accounts = [];
  if (existsSync(file)) {
    try {
      accounts = readJson(file).accounts || [];
      line(true, `Config ${file}`);
    } catch (e) {
      line(false, e.message);
    }
  } else {
    console.log(`[info] ${file} belum ada; memeriksa semua folder profil.`);
    accounts = existsSync(PROFILES) ? readdirSync(PROFILES) : [];
  }
  for (const a of accounts) {
    const has = existsSync(join(PROFILES, safeDir(a)));
    line(has, `Profil "${a}" ${has ? 'ada' : `belum ada (jalankan: npm run runner -- login --account ${a})`}`);
  }
  process.exitCode = ok ? 0 : 1;
}

// ---- main ------------------------------------------------------------------
const HELP = `Pemakaian:
  node src/runner/cli.js login --account <nick>
  node src/runner/cli.js run --config runner.config.json [--headful]
  node src/runner/cli.js doctor [--config runner.config.json]`;

process.on('SIGINT', () => {
  if (shuttingDown) process.exit(130);
  shuttingDown = true;
  console.log('\nMenutup browser...');
  for (const fn of stopWaiters) fn();
  setTimeout(() => process.exit(0), 8000).unref();
});

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const commands = { login: cmdLogin, run: cmdRun, doctor: cmdDoctor };
if (!commands[cmd]) {
  console.log(HELP);
  process.exitCode = cmd ? 1 : 0;
} else {
  commands[cmd](args).catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  });
}
