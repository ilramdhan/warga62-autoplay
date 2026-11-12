import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textHasName, nameInText, combinePresence, nameFromTitle } from '../src/core/handlers/util.js';

test('textHasName: nama utuh, tanpa beda huruf, bukan potongan nick lain', () => {
  assert.ok(textHasName('Selebgram Endorse JULE Online', 'jule'));
  assert.ok(textHasName('ilramdhan.dev (host)', 'ilramdhan.dev'));
  assert.ok(!textHasName('JULES', 'JULE'));
  assert.ok(!textHasName('xjule', 'JULE'));
  assert.ok(!textHasName('ilramdhan.dev2', 'ilramdhan.dev'));
  assert.ok(!textHasName('apa saja', ''));
  assert.ok(textHasName('a+b', 'a+b'), 'karakter regex di-escape');
});

test('nameInText: nama terpanjang dulu', () => {
  assert.equal(nameInText('Bidak JULE2 Online Undang', ['JULE', 'JULE2']), 'JULE2');
  assert.equal(nameInText('Bidak JULE Online Undang', ['JULE', 'JULE2']), 'JULE');
  assert.equal(nameInText('Bidak Orang Lain Online', ['JULE']), null);
});

test('combinePresence: hanya host bila ada teks "Butuh minimal 2 pemain"', () => {
  const r = combinePresence({ others: ['JULE'], texts: ['jule'], onlyHost: true, startEnabled: false });
  assert.deepEqual(r, { present: [], missing: ['JULE'], count: 1 });
});

test('combinePresence: nama di daftar pemain → hadir', () => {
  const r = combinePresence({ others: ['JULE', 'ADI'], texts: ['ilramdhan.dev', 'jule'] });
  assert.deepEqual(r.present, ['JULE']);
  assert.deepEqual(r.missing, ['ADI']);
  assert.equal(r.count, 2);
});

test('combinePresence: "Mulai main" aktif menjamin ≥2 walau nama tak terbaca, tanpa melebihi jumlah akun', () => {
  assert.equal(combinePresence({ others: ['JULE'], texts: [], startEnabled: true }).count, 2);
  assert.equal(combinePresence({ others: ['JULE'], texts: ['jule'], startEnabled: true }).count, 2);
  assert.equal(combinePresence({ others: [], texts: [], startEnabled: true }).count, 1);
});

test('nameFromTitle: judul multi-baris / spasi ganda', () => {
  assert.equal(nameFromTitle('  ilramdhan.dev\n   mengajak mabar ', 'mabar'), 'ilramdhan.dev');
  assert.equal(nameFromTitle('mengajak mabar', 'mabar'), null);
});

test('textHasName: titik akhir kalimat & huruf berdiakritik', () => {
  assert.ok(textHasName('Halo JULE.', 'JULE'));
  assert.ok(!textHasName('jule.dev', 'JULE'));
  assert.ok(!textHasName('josé', 'jose'), 'tanda diakritik gabungan = bagian nama');
});

test('combinePresence: notifikasi "X keluar"/"X bergabung" bukan bukti hadir', () => {
  const r = combinePresence({ others: ['JULE'], texts: ['jule keluar', 'jule bergabung ke room'] });
  assert.deepEqual(r.present, []);
});
