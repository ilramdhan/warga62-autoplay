import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRupiah, formatRupiah } from '../src/core/dom/money.js';

test('parseRupiah: format UI game', () => {
  assert.equal(parseRupiah('Rp9,9 jt'), 9_900_000);
  assert.equal(parseRupiah('Rp900 rb'), 900_000);
  assert.equal(parseRupiah('Rp1 jt'), 1_000_000);
  assert.equal(parseRupiah('Rp1.250.000'), 1_250_000);
  assert.equal(parseRupiah('−Rp9,9 jt'), -9_900_000);
  assert.equal(parseRupiah('-Rp500 rb'), -500_000);
  assert.equal(parseRupiah('kirim rp1,5 jt'), 1_500_000);
  assert.equal(parseRupiah('Rp8,1 jt'), 8_100_000);
  assert.equal(parseRupiah('Rp500'), 500);
});

test('parseRupiah: bukan rupiah -> null', () => {
  assert.equal(parseRupiah('tidak ada angka'), null);
  assert.equal(parseRupiah(''), null);
  assert.equal(parseRupiah(null), null);
});

test('parseRupiah: kata setelah angka tidak dianggap satuan', () => {
  assert.equal(parseRupiah('Beli Rp500 main'), 500);
  assert.equal(parseRupiah('Bayar Rp500 rb ke negara'), 500_000);
});

test('formatRupiah', () => {
  assert.equal(formatRupiah(9_900_000), 'Rp9,9 jt');
  assert.equal(formatRupiah(900_000), 'Rp900 rb');
  assert.equal(formatRupiah(1_000_000), 'Rp1 jt');
  assert.equal(formatRupiah(-9_900_000), '−Rp9,9 jt');
  assert.equal(formatRupiah(1_250_000, { compact: false }), 'Rp1.250.000');
  assert.equal(formatRupiah(500), 'Rp500');
});

test('format lalu parse kembali sama', () => {
  for (const n of [100_000, 1_500_000, 12_300_000, -2_000_000, 750]) {
    assert.equal(parseRupiah(formatRupiah(n)), n);
    assert.equal(parseRupiah(formatRupiah(n, { compact: false })), n);
  }
});
