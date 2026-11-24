// Build: bot.js (IIFE) + extension MV3 + zip. Jalankan: npm run build
import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const EXT = join(DIST, 'extension');
const SRC = join(ROOT, 'src');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;

const entryPage = join(SRC, 'core', 'entry-page.js');
const configJs = join(SRC, 'core', 'config.js');
for (const f of [entryPage, configJs]) {
  if (!existsSync(f)) {
    console.error(`Build gagal: ${f} belum ada.`);
    process.exit(1);
  }
}

// Katalog pencapaian opsional: kalau file belum ada, options.js memakai modul kosong.
const achievementsJs = join(SRC, 'core', 'data', 'achievements.js');
const achievementsPlugin = {
  name: 'w62-achievements',
  setup(b) {
    b.onResolve({ filter: /^w62-achievements$/ }, () =>
      existsSync(achievementsJs) ? { path: achievementsJs } : { path: 'w62-achievements-stub', namespace: 'w62-stub' },
    );
    b.onLoad({ filter: /.*/, namespace: 'w62-stub' }, () => ({
      contents: 'export const ACHIEVEMENTS = [];',
      loader: 'js',
    }));
  },
};

const common = { bundle: true, target: 'chrome114', minify: false, legalComments: 'inline', logLevel: 'info' };

rmSync(DIST, { recursive: true, force: true });
mkdirSync(EXT, { recursive: true });

// 1. Bot untuk runner dan extension. Target ditanam saat build supaya halaman tidak bisa memalsukannya
//    (lihat src/core/entry-page.js): runner membaca window.__W62_CONFIG__, extension hanya pesan bridge.
for (const [target, outfile] of [
  ['runner', join(DIST, 'bot.js')],
  ['extension', join(EXT, 'bot.js')],
]) {
  await build({
    ...common,
    entryPoints: [entryPage],
    outfile,
    format: 'iife',
    define: { __W62_TARGET__: JSON.stringify(target) },
  });
}

// 2. Skrip extension.
await build({
  ...common,
  entryPoints: [join(SRC, 'extension', 'bridge.js')],
  outfile: join(EXT, 'bridge.js'),
  format: 'iife',
});
await build({
  ...common,
  entryPoints: [join(SRC, 'extension', 'background.js')],
  outfile: join(EXT, 'background.js'),
  format: 'esm',
});
await build({
  ...common,
  entryPoints: [join(SRC, 'extension', 'popup', 'popup.js')],
  outfile: join(EXT, 'popup', 'popup.js'),
  format: 'iife',
});
await build({
  ...common,
  entryPoints: [join(SRC, 'extension', 'options', 'options.js')],
  outfile: join(EXT, 'options', 'options.js'),
  format: 'iife',
  plugins: [achievementsPlugin],
});

// 3. HTML, CSS, ikon.
for (const f of ['popup/popup.html', 'popup/popup.css', 'options/options.html', 'options/options.css']) {
  cpSync(join(SRC, 'extension', f), join(EXT, f));
}
mkdirSync(join(EXT, 'icons'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  cpSync(join(SRC, 'extension', 'icons', `icon${size}.png`), join(EXT, 'icons', `icon${size}.png`));
}

// 4. Manifest dengan versi dari package.json.
const manifest = JSON.parse(readFileSync(join(SRC, 'extension', 'manifest.json'), 'utf8'));
manifest.version = version;
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// 5. Zip (deterministik): urutan file tetap, mtime tetap, tanpa atribut OS. Gagal = build gagal.
const zipName = `warga62-autoplay-extension-v${version}.zip`;
const zipPath = join(DIST, zipName);
// Waktu lokal: fflate menulis DOS time dari getter lokal, jadi hasil sama di zona waktu mana pun.
const ZIP_MTIME = new Date(1980, 0, 1, 0, 0, 0);
const files = {};
const walk = (dir, prefix) => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
    else files[`${prefix}${name}`] = [new Uint8Array(readFileSync(full)), { mtime: ZIP_MTIME }];
  }
};
walk(EXT, '');
if (!files['manifest.json']) throw new Error('Zip gagal: manifest.json tidak ada di dist/extension.');
writeFileSync(zipPath, zipSync(files, { level: 9 }));
cpSync(zipPath, join(DIST, 'warga62-autoplay-extension.zip'));
console.log(`Selesai: dist/bot.js, dist/extension/, dist/${zipName} (${Object.keys(files).length} file)`);
