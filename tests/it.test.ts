import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringkasIt, itKeCostLines, type ItSheet } from '../src/lib/it.ts';
import { hitungTender } from '../src/lib/engine/index.ts';
import { contohTender, contohMaster } from './engine.test.ts';

const sheet: ItSheet = { kursUsd: 16000, lines: [
  { kelompok: 'Software - WMS Solution', item: 'Antivirus', costType: 'PUPM', qty: 4, hargaBudget: 39375 },
  { kelompok: 'Hardware & Device', item: 'Scanner HHT', costType: 'PDPM', qty: 3, hargaBudget: 475000, hargaAktual: 450000 },
  { kelompok: 'Software - WMS Solution', item: 'Lisensi tahunan', costType: 'Yearly', qty: 1, hargaBudget: 12000000 },
  { kelompok: 'Hardware & Device', item: 'Printer Dot Matrix', costType: 'OTC/Unit', qty: 1, hargaBudget: 10000000, perlakuanSekali: 'amortisasi' },
  { kelompok: 'Connection', item: 'Instalasi WAN', costType: 'OTC', qty: 1, hargaBudget: 8360000, perlakuanSekali: 'tagih' },
  { kelompok: 'Development & Interface', item: 'Interface EDI', costType: 'Cost/Mandays', qty: 2, hargaBudget: 100, mataUang: 'USD' },
] };

test('ringkasan IT format BAP: bulanan, tahunan, OTC, aktual', () => {
  const r = ringkasIt(sheet);
  assert.equal(r.bulanan, 4 * 39375 + 3 * 475000);
  assert.equal(r.bulananAktual, 3 * 450000);
  assert.equal(r.tahunan, 12000000);
  assert.equal(r.sekali, 10000000 + 8360000 + 2 * 100 * 16000);
  assert.equal(r.setaraBulan, r.bulanan + 1000000);
  assert.deepEqual(r.tagihSekali.map(t => t.nilai), [8360000]);
});

test('IT → baris biaya: tahunan ÷12, OTC diamortisasi, OTC tagih tidak masuk tarif', () => {
  const cl = itKeCostLines(sheet);
  assert.equal(cl.length, 5);
  assert.equal(cl.find(c => c.deskripsi.includes('tahunan'))!.hargaSatuan, 1000000);
  assert.equal(cl.find(c => c.deskripsi.includes('EDI'))!.hargaSatuan, 1600000);
  assert.ok(!cl.some(c => c.deskripsi.includes('WAN')));
  const t = structuredClone(contohTender); t.costLines = [...t.costLines, ...cl];
  const h = hitungTender(t, contohMaster);
  assert.ok(h.biaya.some(b => b.deskripsi === 'IT — Printer Dot Matrix — amortisasi'));
});
