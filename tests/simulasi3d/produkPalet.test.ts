import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitungProduk, satuanDimEfektif } from '../../src/lib/produk';

test('produk UOM palet: dimensi mm terbaca otomatis, UPP 1, berat palet tanpa tare ganda', () => {
  const x = { id: 'a', kode: 'SKU-001', nama: 'WD40', uom: 'palet', p: 1000, l: 1200, t: 1000, beratKg: 750, upp: 0, qty: 700 };
  assert.equal(satuanDimEfektif(x).satuan, 'mm');
  const h = hitungProduk(x);
  assert.equal(Math.round(h.cbmPalet * 1000) / 1000, 1.2); assert.equal(h.beratPaletKg, 750); assert.equal(h.palet, 700); assert.equal(h.tinggiMuatanMm, 1000);
  // cm eksplisit tetap dihormati
  assert.equal(Math.round(hitungProduk({ ...x, p: 120, l: 100, t: 100 }).cbmPalet * 1000) / 1000, 1.2);
  // karton dalam mm (pilihan user)
  assert.equal(Math.round(hitungProduk({ ...x, uom: 'karton', p: 400, l: 300, t: 250, beratKg: 10, upp: 48, qty: 960, satuanDim: 'mm' as const }).cbmPalet * 100) / 100, 1.44);
});
