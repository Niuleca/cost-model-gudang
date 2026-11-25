import { test } from 'node:test';
import assert from 'node:assert/strict';
import { terapkanPorsiJalur, porsiJalur, jalurBaris, type BarisProfil } from '../src/lib/profilVolume';
import { ubahSpek, tampilSpek, cekSpek, volSpek } from '../src/lib/volumeSpek';
import type { VolumeInput } from '../src/lib/engine/types';
import { hitungTender } from '../src/lib/engine/index.ts';
import { kebutuhanSecurityCleaning } from '../src/lib/biayaLainDefault.ts';
import { contohTender, contohMaster } from './fixtures/contoh.ts';
import { hitungProduk, adaProdukNyata, turunanProduk, terapkanProduk, ATURAN_BERAT_DEFAULT } from '../src/lib/produk.ts';

test('jalur: data lama ditebak dari moda', () => {
  assert.equal(jalurBaris({ moda: 'cont40', persen: 0.5 }, 'inbound'), 'import');
  assert.equal(jalurBaris({ moda: 'palet', persen: 0.5 }, 'outbound'), 'inland');
  assert.equal(jalurBaris({ moda: 'cont20', persen: 1, jalur: 'sea' }, 'outbound'), 'sea');
});

test('terapkan porsi jalur: skala proporsional, jalur baru dibuat, 0% dihapus', () => {
  const rows: BarisProfil[] = [{ moda: 'cont40hc', persen: 0.3 }, { moda: 'cont20', persen: 0.1 }, { moda: 'palet', persen: 0.6 }];
  const r = terapkanPorsiJalur(rows, 'inbound', { import: 0.8, local: 0.2 });
  assert.equal(r.length, 3);
  assert.ok(Math.abs(r[0].persen - 0.6) < 1e-9 && Math.abs(r[1].persen - 0.2) < 1e-9);
  assert.equal(r[2].jalur, 'local'); assert.ok(Math.abs(r[2].persen - 0.2) < 1e-9);
  const o = terapkanPorsiJalur([], 'outbound', { export: 0.5, inland: 0.5, air: 0 });
  assert.deepEqual(o.map(x => [x.jalur, x.moda]), [['export', 'cont40hc'], ['inland', 'palet']]);
  const p = porsiJalur(o, 'outbound');
  assert.equal(p.export, 0.5); assert.equal(p.air, 0);
  assert.equal(terapkanPorsiJalur(rows, 'inbound', { import: 0, local: 1 }).length, 1);
});

const V = (x: Partial<VolumeInput>): VolumeInput => ({ arus: 'inbound', uom: 'palet', rataRataBulan: 0, peakBulan: 0, komitmenBulan: 0, ...x });

test('volume spek: Max/Avg kosong ikut Volume 1 bulan', () => {
  let v = V({});
  v = { ...v, ...ubahSpek(v, 'vol', 1000) };
  assert.deepEqual([v.komitmenBulan, v.peakBulan, v.rataRataBulan], [1000, 1000, 1000]);
  assert.deepEqual(tampilSpek(v), { vol: 1000, max: undefined, avg: undefined, min: undefined });
  v = { ...v, ...ubahSpek(v, 'max', 1400) };
  v = { ...v, ...ubahSpek(v, 'vol', 1200) };
  assert.deepEqual([v.komitmenBulan, v.peakBulan, v.rataRataBulan], [1200, 1400, 1200]);
  v = { ...v, ...ubahSpek(v, 'max', 0) };
  assert.equal(v.peakBulan, 1200);
  v = { ...v, ...ubahSpek(v, 'min', 900) };
  assert.equal(v.minBulan, 900);
  assert.deepEqual(cekSpek({ ...v, peakBulan: 1000 }), ['Max lebih kecil dari Volume 1 bulan']);
});

test('volume spek: data lama tanpa komitmen memakai rata-rata', () => {
  assert.equal(volSpek(V({ rataRataBulan: 500, peakBulan: 700 })), 500);
  assert.equal(tampilSpek(V({ rataRataBulan: 500, peakBulan: 700 })).max, 700);
});

test('racking skema sewa: posisi × sewa per PP per bulan, tanpa investasi', () => {
  const beli = hitungTender(contohTender, contohMaster);
  const t = { ...contohTender, space: { ...contohTender.space, rakSkema: 'sewa' as const, sewaRakPerPPBulan: 25000 } };
  const h = hitungTender(t, contohMaster);
  const rak = h.biaya.filter(b => b.kelompok === 'Racking');
  assert.ok(rak.length > 0 && rak.every(b => /^Sewa racking/.test(b.deskripsi)));
  for (const b of rak) { const pos = Number(b.deskripsi.match(/\((\d+) posisi\)/)![1]); assert.equal(b.biayaBulan, pos * 25000); }
  assert.ok(h.investasi <= beli.investasi);
});

test('security & cleaning untuk VSM: pos jaga × 3, danru ≥ 8 satpam, cleaner dari luas', () => {
  assert.deepEqual(kebutuhanSecurityCleaning({ luasM2: 1700, officeM2: 32, userKantor: 1, kategori: 'Automotive & Spare Parts' }), { pos: 1, satpam: 3, danru: 0, cleaner: 2 });
  const besar = kebutuhanSecurityCleaning({ luasM2: 15000, officeM2: 100, userKantor: 3, kategori: 'Healthcare & Pharma' });
  assert.equal(besar.pos, 3); assert.equal(besar.satpam, 9); assert.equal(besar.danru, 1); assert.equal(besar.cleaner, 4 + 1);
});

// Produk berat di lantai (kasus gula rafinasi 50 kg/sak, 30 sak/palet, tanpa racking)
const gula = { id: 'g', kode: 'GULA', nama: 'Gula rafinasi', uom: 'bag', p: 0.33, l: 0.33, t: 0.275, satuanDim: 'm' as const, beratKg: 50, upp: 30, qty: 0, perLayer: 6, layer: 5, simpan: 'floor' as const, otomatis: false };

test('produk pallet floor: kapasitas beam tidak berlaku', () => {
  const h = hitungProduk(gula, ATURAN_BERAT_DEFAULT);
  assert.equal(h.beratPaletKg, 1525);
  assert.equal(h.caraSimpan, 'floor');
  assert.equal(h.hanyaLantai, false);
  assert.equal(h.levelMaks, 1);
  assert.ok(!h.peringatan.some(w => /beam/.test(w)), h.peringatan.join(' | '));
  // produk yang sama dengan cara simpan otomatis tetap dicek beam (dipaksa ke lantai)
  const oto = hitungProduk({ ...gula, simpan: 'otomatis' }, ATURAN_BERAT_DEFAULT);
  assert.equal(oto.hanyaLantai, true);
  assert.equal(oto.caraSimpan, 'floor');
});

test('produk tanpa qty tetap jadi sumber data per palet; stok storage dari Volume', () => {
  assert.equal(adaProdukNyata([gula]), true);
  const d = turunanProduk([gula]);
  assert.ok(d && !d.adaQty);
  assert.equal(Math.round(d!.kgPerPalet), 1525);
  assert.equal(d!.porsiLantai, 1);
  const a = { volumes: [{ arus: 'storage', uom: 'palet', peakBulan: 400, rataRataBulan: 400, komitmenBulan: 400 }] as never[], space: { excel: { porsi: { spr: 0, ddr: 0, block: 0, floor: 0 } } } };
  const { patch } = terapkanProduk(a, [gula]);
  const p = patch as { profilVolume?: { param: { tonPerPalet: number; kgPerCase: number } }; volumes?: { peakBulan: number }[]; space?: { excel: { porsi: { floor: number; spr: number } } } };
  assert.equal(p.profilVolume?.param.tonPerPalet, 1.525);
  assert.equal(p.profilVolume?.param.kgPerCase, 50);
  assert.equal(p.volumes?.[0].peakBulan, 400);          // stok tidak ditimpa
  assert.equal(p.space?.excel.porsi.floor, 1);           // 100% pallet floor
  assert.equal(p.space?.excel.porsi.spr, 0);
});
