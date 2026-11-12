// Membuat screenshot UI extension (popup & options) + banner ke docs/images/.
// Pakai: npm run build && npm run screenshots
// Extension dibuka lewat server HTTP lokal dengan stub `chrome.*` berisi data demo (nick generik).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'dist', 'extension');
const OUT = path.join(ROOT, 'docs', 'images');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

if (!fs.existsSync(path.join(EXT, 'popup', 'popup.html'))) {
  console.error('dist/extension belum ada. Jalankan `npm run build` dulu.');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const rp = (n) => n;
const demo = {
  config: {
    enabled: true,
    myName: 'akun.dua',
    role: 'guest',
    mode: 'arena',
    accounts: ['akun.utama', 'akun.dua', 'akun.tiga'],
    hostName: 'akun.utama',
    winnerName: 'akun.tiga',
  },
  status: {
    state: 'acting',
    handler: 'roll',
    round: 9,
    phase: 'pre_roll',
    myCash: rp(6_400_000),
    cash: rp(6_400_000),
    players: ['akun.utama', 'akun.dua', 'akun.tiga'],
    foreign: [],
    insight: {
      round: 9,
      mode: 'arena',
      crisis: false,
      difficulty: 'Normal',
      me: {
        name: 'akun.dua',
        cash: 6_400_000,
        netWorth: 14_800_000,
        loanDebt: 0,
        reserve: 1_800_000,
        exposure: 1_200_000,
        stance: 'agresif',
        stanceWhy: 'kas aman di atas cadangan dan selisih kekayaan kecil terhadap pemimpin',
      },
      opponents: [
        {
          name: 'akun.utama',
          own: true,
          cash: 5_200_000,
          netWorth: 15_600_000,
          loanDebt: 0,
          cities: 7,
          buildings: 5,
          mortgaged: 0,
          provinces: ['Sumatera Utara'],
          nearProvinces: ['Jawa Timur'],
          threat: 2_400_000,
          jailed: false,
          bankrupt: false,
          style: 'agresif',
          trend: 'naik',
          changes: ['beli Surabaya', 'bangun 2 kota'],
        },
        {
          name: 'akun.tiga',
          own: true,
          cash: 2_100_000,
          netWorth: 9_300_000,
          loanDebt: 1_000_000,
          cities: 4,
          buildings: 2,
          mortgaged: 1,
          provinces: [],
          nearProvinces: ['Sulawesi Selatan'],
          threat: 900_000,
          jailed: true,
          bankrupt: false,
          style: 'hati-hati',
          trend: 'turun',
          changes: ['gadai Medan'],
        },
      ],
      leaderName: 'akun.utama',
      notes: ['akun.tiga sedang di Lapas', 'Sulsel tinggal 1 petak untuk dilengkapi'],
      strategy: [
        'Lengkapi provinsi Sulsel sebelum membangun di tempat lain.',
        'Jaga kas minimal sebesar cadangan 1 ronde sewa.',
        'Hindari membeli petak di provinsi milik pemimpin.',
      ],
    },
    decisions: [
      { fn: 'buy', label: 'Beli: beli rp1,1 jt.', reason: 'melengkapi provinsi Sulsel' },
      { fn: 'build', label: 'Bangun 3 kota: Rp1,5 jt.', reason: 'kas di atas cadangan' },
      { fn: 'roll', label: 'Kocok (perfect) dilepas di 86.4% [zona].', reason: 'zona aman dari tol' },
      { fn: 'toll', label: 'Bayar tol: rp300 rb.', reason: 'wajib' },
      { fn: 'skip', label: 'Lewati beli: rp2,4 jt.', reason: 'kas di bawah cadangan' },
      { fn: 'mortgage', label: 'Tidak menggadai.', reason: 'kas masih aman' },
    ].map((d, i) => ({ ...d, ts: Date.now() - (6 - i) * 20000 })),
  },
  logs: [
    'Bot aktif (mode arena, peran tamu).',
    'Mengundang: akun.dua, akun.tiga.',
    'Game dimulai, 3 pemain.',
    'Kocok (perfect) dilepas di 86.4% [zona].',
    'Beli: beli rp1,1 jt.',
    'Bayar tol: rp300 rb.',
    'Kocok (perfect) dilepas di 91.2% [zona].',
    'Bangun 3 kota: Rp1,5 jt.',
    'Kartu Dana Umum: terima rp200 rb.',
    'Lewati beli: rp2,4 jt (kas di bawah cadangan).',
    'Kocok (perfect) dilepas di 88.0% [zona].',
    'Ronde 9 dimulai.',
  ].map((msg, i, a) => ({ type: 'log', level: 'info', msg, ts: Date.now() - (a.length - i) * 15000 })),
};

// Dipasang sebelum skrip halaman: stub minimal chrome.* berbasis memori.
function installStub(data) {
  const mk = () => {
    const store = {};
    return {
      async get(keys) {
        const ks = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
        const r = {};
        for (const k of ks) if (k in store) r[k] = structuredClone(store[k]);
        return r;
      },
      async set(obj) {
        Object.assign(store, structuredClone(obj));
      },
      setAccessLevel: async () => {},
      onChanged: { addListener() {} },
      _store: store,
    };
  };
  const local = mk();
  const session = mk();
  local._store['w62.config'] = data.config;
  local._store['w62.logs'] = data.logs;
  Object.defineProperty(session._store, 'w62.status', {
    enumerable: true,
    get: () => ({ ...data.status, receivedAt: Date.now() - 2000 }),
  });
  window.chrome = {
    storage: { local, session, onChanged: { addListener() {} } },
    runtime: {
      getURL: (p) => '/' + p,
      openOptionsPage() {},
      sendMessage: async () => ({}),
      onMessage: { addListener() {} },
    },
    tabs: { create() {} },
  };
}

const server = http.createServer((req, res) => {
  const p = path.join(EXT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(EXT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const out = (n) => path.join(OUT, n);

const GUTTER = 24;
const BASE_CSS = '[hidden]{display:none!important}';

/** Screenshot dipotong ke konten (bounding box elemen) + gutter rata. */
async function shoot(page, file, selectors, { fullWidth = false } = {}) {
  await page.addStyleTag({ content: BASE_CSS + '.savebar{display:none!important}body{padding-bottom:64px!important}' });
  const box = await page.evaluate(
    ({ selectors, fullWidth }) => {
      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = 0;
      let y2 = 0;
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (!r.width) continue;
          const sh = el.matches('main, .tabs, .toggle') || el.closest('main, .toggle') === el ? 8 : 0;
          x1 = Math.min(x1, r.left + window.scrollX);
          y1 = Math.min(y1, r.top + window.scrollY);
          x2 = Math.max(x2, r.right + window.scrollX + sh);
          y2 = Math.max(y2, r.bottom + window.scrollY + sh);
        }
      }
      return { x1, y1, x2, y2, w: document.documentElement.clientWidth, fullWidth };
    },
    { selectors, fullWidth },
  );
  const x = box.fullWidth ? 0 : Math.max(0, box.x1 - GUTTER);
  const right = box.fullWidth ? box.w : box.x2 + GUTTER;
  await page.screenshot({
    path: out(file),
    fullPage: true,
    clip: {
      x,
      y: Math.max(0, box.y1 - GUTTER),
      width: right - x,
      height: box.y2 + GUTTER - Math.max(0, box.y1 - GUTTER),
    },
  });
}

async function newPage(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn('pageerror:', e.message));
  await page.addInitScript(installStub, demo);
  return page;
}

try {
  // Popup
  const pop = await newPage(408, 600);
  await pop.goto(`${base}/popup/popup.html`);
  await pop.addStyleTag({
    content:
      'body{width:360px!important;padding:24px!important}.logs{height:auto!important;overflow:visible!important}',
  });
  await pop.waitForTimeout(600);
  await shoot(pop, 'popup.png', ['body > *'], { fullWidth: true });
  await pop.context().close();

  // Options (desktop)
  const opt = await newPage(1280, 800);
  await opt.goto(`${base}/options/options.html`);
  for (const tab of ['akun', 'mode', 'room', 'capaian', 'strategi', 'monitor', 'log']) {
    await opt.click(`[data-tab="${tab}"]`);
    await opt.waitForTimeout(300);
    if (tab === 'capaian') {
      // Daftar pencapaian punya scroll internal; potong tepat setelah 4 baris kartu supaya tidak ada kartu terpotong.
      await opt.evaluate(() => {
        const list = document.querySelector('#tab-capaian [style*="overflow"], #tab-capaian .catalog, #tab-capaian ul');
        const box =
          list ??
          [...document.querySelectorAll('#tab-capaian *')].find((e) => getComputedStyle(e).overflowY === 'auto');
        if (!box) return;
        const items = [...box.children];
        const top = box.getBoundingClientRect().top;
        const cut = items[7] ?? items[items.length - 1];
        if (cut) box.style.maxHeight = `${Math.ceil(cut.getBoundingClientRect().bottom - top)}px`;
        box.style.overflow = 'hidden';
      });
    }
    await shoot(opt, `options-${tab}.png`, ['.masthead', '.notice', '.layout', 'main']);
  }
  await opt.context().close();

  // Monitor (mobile)
  const mob = await newPage(390, 844);
  await mob.goto(`${base}/options/options.html`);
  await mob.addStyleTag({ content: 'body{padding-left:24px!important;padding-right:32px!important}' });
  await mob.click('[data-tab="monitor"]');
  await mob.waitForTimeout(300);
  await shoot(mob, 'options-monitor-mobile.png', ['.masthead', '.notice', '.layout', 'main'], { fullWidth: true });
  await mob.context().close();

  // Banner
  const svg = fs.readFileSync(out('banner.svg'), 'utf8');
  const bp = await newPage(1280, 400);
  await bp.setContent(`<body style="margin:0">${svg}</body>`);
  await bp.screenshot({ path: out('banner.png'), clip: { x: 0, y: 0, width: 1280, height: 400 } });
  await bp.context().close();
} finally {
  await browser.close();
  server.close();
}
console.log('Selesai: docs/images/');
