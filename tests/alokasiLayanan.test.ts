import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitungTender } from '../src/lib/engine/index.ts';
import { contohTender, contohMaster } from './fixtures/contoh.ts';

const tot = (h: ReturnType<typeof hitungTender>) => h.rateCard.reduce((s, r) => s + r.biayaBulan, 0);
const biaya = (h: ReturnType<typeof hitungTender>, b: string) => h.rateCard.find(r => r.bucket === b)?.biayaBulan ?? 0;

test('pembagian biaya ke layanan: cost-to-serve = default, rata & manual menjaga total biaya', () => {
  const cts = hitungTender(contohTender, contohMaster);
  const def = hitungTender({ ...contohTender, alokasiLayanan: { mode: 'cts' } }, contohMaster);
  assert.deepEqual(def.rateCard.map(r => r.biayaBulan), cts.rateCard.map(r => r.biayaBulan));
  assert.equal(cts.alokasiLayanan.mode, 'cts');
  const aktif = cts.rateCard.map(r => r.bucket);
  for (const b of aktif) assert.ok(Math.abs(cts.alokasiLayanan.biayaCts[b] - biaya(cts, b)) <= 1);

  const rata = hitungTender({ ...contohTender, alokasiLayanan: { mode: 'rata' } }, contohMaster);
  assert.ok(Math.abs(tot(rata) - tot(cts)) <= aktif.length);
  for (const b of aktif) assert.ok(Math.abs(biaya(rata, b) - tot(cts) / aktif.length) <= 1, `rata ${b}`);

  const man = hitungTender({ ...contohTender, alokasiLayanan: { mode: 'manual', porsi: { storage: 0.5, handling_in: 0.25, handling_out: 0.25 } } }, contohMaster);
  assert.ok(Math.abs(tot(man) - tot(cts)) <= 3);
  assert.ok(Math.abs(biaya(man, 'storage') - tot(cts) * 0.5) <= 1);
  assert.ok(!man.redFlags.some(f => f.kode === 'ALOKASI_BUKAN_100'));
  // GP manual 15% tetap → GP total sama karena total biaya sama
  const g = { storage: 0.15, handling_in: 0.15, handling_out: 0.15 };
  const a = hitungTender({ ...contohTender, marginManual: g }, contohMaster), b2 = hitungTender({ ...contohTender, marginManual: g, alokasiLayanan: { mode: 'rata' } }, contohMaster);
  assert.ok(Math.abs(a.marginTotal.gpPersen - b2.marginTotal.gpPersen) < 0.0005);

  // total input bukan 100% → dinormalisasi + flag
  const n = hitungTender({ ...contohTender, alokasiLayanan: { mode: 'manual', porsi: { storage: 0.6, handling_in: 0.3, handling_out: 0.3 } } }, contohMaster);
  assert.ok(n.redFlags.some(f => f.kode === 'ALOKASI_BUKAN_100'));
  assert.ok(Math.abs(biaya(n, 'storage') - tot(cts) * 0.5) <= 1);
});

test('matriks pembagian per kategori: default = simulasi, override per kategori, total biaya tetap', () => {
  const d = hitungTender(contohTender, contohMaster);
  const mx = d.alokasiLayanan.matriks;
  assert.ok(mx.length > 0 && mx.every(r => !r.override));
  for (const r of mx) {
    const j = r.porsi.storage + r.porsi.handling_in + r.porsi.handling_out + r.porsi.vas;
    assert.ok(Math.abs(j - 1) < 0.001, `${r.kelompok} total ${j}`);
  }
  // Σ biaya per layanan dari matriks = biaya rate card (mode ikuti matriks)
  for (const rc of d.rateCard) assert.ok(Math.abs(mx.reduce((a, r) => a + r.biayaPerLayanan[rc.bucket], 0) - rc.biayaBulan) <= mx.length, rc.bucket);
  // Pola: kategori pertama (terbesar) 100% storage, sisanya 50/50 handling
  const kat = mx.map(r => r.kelompok);
  const ov = Object.fromEntries(kat.map((k, i) => [k, i === 0 ? { storage: 1 } : { handling_in: 0.5, handling_out: 0.5 }]));
  const o = hitungTender({ ...contohTender, alokasiKategori: ov }, contohMaster);
  assert.ok(o.alokasiLayanan.matriks.every(r => r.override));
  assert.ok(Math.abs(tot(o) - tot(d)) <= 3);
  const big = o.alokasiLayanan.matriks.find(r => r.kelompok === kat[0])!;
  assert.ok(Math.abs(biaya(o, 'storage') - big.biayaBulan) <= 2);
  assert.ok(Math.abs(biaya(o, 'handling_in') - biaya(o, 'handling_out')) <= 2);
  // default tetap terlihat walau di-override
  assert.deepEqual(big.porsiDefault, mx.find(r => r.kelompok === kat[0])!.porsiDefault);
  // satu kategori saja, total ≠ 100% → flag
  const s1 = hitungTender({ ...contohTender, alokasiKategori: { [kat[1]]: { storage: 0.5, handling_in: 0.7 } } }, contohMaster);
  assert.ok(s1.redFlags.some(f => f.kode === 'ALOKASI_KAT_BUKAN_100'));
  assert.equal(s1.alokasiLayanan.matriks.filter(r => r.override).length, 1);
});
