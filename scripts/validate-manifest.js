// Memeriksa dist/extension/manifest.json. Jalankan setelah npm run build.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'dist', 'extension');
const errors = [];
const fail = (m) => errors.push(m);

const file = join(EXT, 'manifest.json');
if (!existsSync(file)) {
  console.error('dist/extension/manifest.json tidak ada. Jalankan npm run build dulu.');
  process.exit(1);
}
const m = JSON.parse(readFileSync(file, 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

if (m.manifest_version !== 3) fail('manifest_version harus 3');
if (m.name !== 'Warga +62 Autoplay') fail(`name tidak sesuai: ${m.name}`);
if (m.version !== pkg.version) fail(`version ${m.version} != package.json ${pkg.version}`);
if (JSON.stringify(m.permissions) !== '["storage"]') fail('permissions harus persis ["storage"]');

const HOST = 'https://mainwarga62.id/*';
if (JSON.stringify(m.host_permissions) !== JSON.stringify([HOST])) fail(`host_permissions harus [${HOST}]`);

const cs = m.content_scripts || [];
for (const c of cs) {
  if (JSON.stringify(c.matches) !== JSON.stringify([HOST])) fail(`content_scripts.matches harus [${HOST}]`);
}
const bridge = cs.find((c) => (c.js || []).includes('bridge.js'));
const bot = cs.find((c) => (c.js || []).includes('bot.js'));
if (!bridge || bridge.world !== 'ISOLATED' || bridge.run_at !== 'document_start') {
  fail('bridge.js harus ISOLATED/document_start');
}
if (!bot || bot.world !== 'MAIN' || bot.run_at !== 'document_idle') fail('bot.js harus MAIN/document_idle');
if (m.background?.type !== 'module') fail('background.type harus module');
if (!m.options_page) fail('options_page tidak ada');

const referenced = new Set();
for (const c of cs) for (const f of [...(c.js || []), ...(c.css || [])]) referenced.add(f);
if (m.background?.service_worker) referenced.add(m.background.service_worker);
if (m.action?.default_popup) referenced.add(m.action.default_popup);
if (m.options_page) referenced.add(m.options_page);
for (const set of [m.icons, m.action?.default_icon]) for (const f of Object.values(set || {})) referenced.add(f);
for (const size of ['16', '32', '48', '128']) if (!m.icons?.[size]) fail(`icons.${size} tidak ada`);
for (const f of referenced) if (!existsSync(join(EXT, f))) fail(`File dirujuk tapi tidak ada: ${f}`);
for (const f of ['popup/popup.js', 'popup/popup.css', 'options/options.js', 'options/options.css']) {
  if (!existsSync(join(EXT, f))) fail(`File tidak ada: ${f}`);
}

if (errors.length) {
  console.error('Validasi manifest GAGAL:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log(`Manifest OK (v${m.version}, ${referenced.size} file dirujuk).`);
