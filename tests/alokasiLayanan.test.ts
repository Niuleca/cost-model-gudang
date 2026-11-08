import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitungTender } from '../src/lib/engine/index.ts';
import { contohTender, contohMaster } from './fixtures/contoh.ts';

const tot = (h: ReturnType<typeof hitungTender>) => h.rateCard.reduce((s, r) => s + r.biayaBulan, 0);
const biaya = (h: ReturnType<typeof hitungTender>, b: string) => h.rateCard.find(r => r.bucket === b)?.biayaBulan ?? 0;

test('pola matriks: semua kategori porsi sama → total layanan = porsi itu; GP tetap; penyesuaian total lama diabaikan', () => {
  const cts = hitungTender(contohTender, contohMaster);
  const kat = cts.alokasiLayanan.matriks.map(r => r.kelompok);
  const sama = (p: Record<string, number>) => Object.fromEntries(kat.map(k => [k, p]));
  const rata = hitungTender({ ...contohTender, alokasiKategori: sama({ storage: 1 / 3, handling_in: 1 / 3, handling_out: 1 / 3 }) }, contohMaster);
  assert.ok(Math.abs(tot(rata) - tot(cts)) <= 3);
  for (const b of ['storage', 'handling_in', 'handling_out']) assert.ok(Math.abs(biaya(rata, b) - tot(cts) / 3) <= kat.length, `rata ${b}`);
  const man = hitungTender({ ...contohTender, alokasiKategori: sama({ storage: 0.5, handling_in: 0.25, handling_out: 0.25 }) }, contohMaster);
  assert.ok(Math.abs(biaya(man, 'storage') - tot(cts) * 0.5) <= kat.length);
  const g = { storage: 0.15, handling_in: 0.15, handling_out: 0.15 };
  const a = hitungTender({ ...contohTender, marginManual: g }, contohMaster), b2 = hitungTender({ ...contohTender, marginManual: g, alokasiKategori: sama({ storage: 1 / 3, handling_in: 1 / 3, handling_out: 1 / 3 }) }, contohMaster);
  assert.ok(Math.abs(a.marginTotal.gpPersen - b2.marginTotal.gpPersen) < 0.0005);
  // tender lama yang menyimpan alokasiLayanan (penyesuaian total, sudah dihapus) → tidak berpengaruh
  const lama = hitungTender({ ...contohTender, alokasiLayanan: { mode: 'rata' } } as never, contohMaster);
  assert.deepEqual(lama.rateCard.map(r => r.biayaBulan), cts.rateCard.map(r => r.biayaBulan));
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

test('layanan termasuk: biaya dipindah ke layanan yang dijual, total & simulasi tetap; tarif tambahan dihitung', () => {
  const d = hitungTender(contohTender, contohMaster);
  const j = hitungTender({ ...contohTender, layananJual: { handling_in: 'termasuk' } }, contohMaster);
  assert.ok(!j.rateCard.some(r => r.bucket === 'handling_in'));
  assert.ok(Math.abs(tot(j) - tot(d)) <= 3);
  assert.equal(j.layananTermasuk[0].bucket, 'handling_in');
  assert.ok(biaya(j, 'storage') > biaya(d, 'storage') && biaya(j, 'handling_out') > biaya(d, 'handling_out'));
  // proporsional biaya layanan yang dijual
  const pindah = biaya(d, 'handling_in'), s0 = biaya(d, 'storage'), o0 = biaya(d, 'handling_out');
  assert.ok(Math.abs(biaya(j, 'storage') - (s0 + pindah * s0 / (s0 + o0))) <= 2);
  const t = hitungTender({ ...contohTender, tarifTambahan: [
    { id: 'a', nama: 'Movement', satuan: 'per palet', dasar: 'aktivitas', menit: 6, orang: 1, alat: true },
    { id: 'b', nama: 'Label', satuan: 'per pcs', dasar: 'manual', biaya: 350, gp: 0.3, volumeBulan: 1000 },
  ] }, contohMaster);
  const tt = t.tarifTambahan;
  assert.deepEqual(t.rateCard.map(r => r.tarifPerUnit), d.rateCard.map(r => r.tarifPerUnit));
  const mv = tt.items[0];
  assert.ok(Math.abs(mv.biayaPerUnit - 0.1 * (tt.tarifJamOrang + tt.tarifJamAlat)) < 0.05);
  const lb = tt.items[1];
  assert.equal(lb.tarifPerUnit, 520);   // 350 ÷ 0,7 = 500 → gross-up PPh 2% (exclude) = 510,2 → dibulatkan 10 ke atas = 520
  assert.ok(Math.abs(lb.pendapatanBulan - 520 * 1000 * 0.98) <= 1);
});
