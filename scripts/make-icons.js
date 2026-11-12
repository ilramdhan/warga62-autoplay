// Membuat ikon extension (SVG -> PNG 16/32/48/128). Jalankan: NODE_PATH=/opt/npm-tools/node_modules node scripts/make-icons.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'extension', 'icons');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <rect x="4" y="4" width="120" height="120" rx="18" fill="#ffc61a" stroke="#1b1a17" stroke-width="8"/>
  <g transform="rotate(-8 40 46)">
    <rect x="12" y="18" width="56" height="56" rx="10" fill="#f7f0dc" stroke="#1b1a17" stroke-width="6"/>
    <circle cx="28" cy="34" r="5.5" fill="#1b1a17"/>
    <circle cx="40" cy="46" r="5.5" fill="#c7281c"/>
    <circle cx="52" cy="58" r="5.5" fill="#1b1a17"/>
  </g>
  <text x="64" y="112" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="44" fill="#1b1a17">62</text>
</svg>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'icon.svg'), svg);
for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon${size}.png`));
}
console.log('Ikon dibuat di', outDir);
