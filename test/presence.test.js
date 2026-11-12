import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foreignPlayers } from '../src/core/engine.js';
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

test('foreignPlayers: pemain di luar daftar akun terdeteksi, tanpa beda huruf', () => {
  assert.deepEqual(foreignPlayers(['JULE', 'akun3', 'Orang'], ['jule', 'AKUN3']), ['Orang']);
  assert.deepEqual(foreignPlayers([], ['a']), []);
});

test('joki dadu: simpulkan dadu dari batas total (putaran berurutan atau acak)', async () => {
  const { inferDice, secondDieBounds, planForFirstDie } = await import('../src/core/handlers/joki-dadu.js');
  // asli (4,3)=7; dadu 1 → 1 dan 6 terlihat: total 4 dan 9 → dadu 2 = 3
  assert.deepEqual(inferDice(7, [4, 9]), [4, 3]);
  assert.deepEqual(secondDieBounds(7, [8]), { lo: 2, hi: 6 });
  assert.equal(inferDice(7, [8, 7]), null, 'belum pasti');
  assert.deepEqual(inferDice(12, []), [6, 6], 'total 12 pasti 6+6');
  assert.deepEqual(inferDice(2, []), [1, 1]);
  assert.equal(inferDice(null, [3]), null);
  // rencana dadu 2 diubah jadi dadu 1 dengan total & status kembar sama
  assert.equal(planForFirstDie([4, 3], { dieIndex: 0, value: 6 }), 6);
  assert.equal(planForFirstDie([4, 3], { dieIndex: 1, value: 5 }), 6, '4+5=9 → 6+3');
  assert.equal(planForFirstDie([4, 3], { dieIndex: 1, value: 4 }), null, 'kembar 4+4 tak bisa lewat dadu 1');
  assert.equal(planForFirstDie([4, 3], null), null);
  assert.equal(planForFirstDie([4, 3], { dieIndex: 0, value: 4 }), null, 'tidak berubah');
});

test('nameInParts: teks anak tergabung tanpa spasi tetap cocok (regresi kirim uang & undang)', async () => {
  const { nameInParts } = await import('../src/core/handlers/util.js');
  assert.equal(nameInParts(['JULE', 'Rp5 jt'], 'JULERp5 jt', ['JULE']), 'JULE');
  assert.equal(nameInParts(['Selebgram Endorse', 'JULE', 'Online'], 'Selebgram EndorseJULEOnline', ['JULE']), 'JULE');
  assert.equal(nameInParts([], 'julerp5 jt', ['JULE']), 'JULE', 'fallback includes');
  assert.equal(nameInParts(['JULES', 'Online'], 'JULESOnline', ['JULE', 'JULES']), 'JULES');
  assert.equal(nameInParts(['Orang'], 'Orang', ['JULE']), null);
});
