import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitungKalender, hitungTender, roundupHarga } from '../src/lib/engine/index.ts';

import { contohTender, contohMaster } from './fixtures/contoh.ts';
import { PD_DEFAULT, ratakanBebanShift } from '../src/lib/engine/processDesign.ts';
export { contohTender, contohMaster };

test('kalender 2026: 261 hari kerja Senin–Jumat, libur di hari kerja dikurangi, cuti jadi faktor pengganti', () => {
  const k = hitungKalender(2026, 5, contohMaster.holidays, 12);
  assert.equal(k.hariKalenderKerja, 261);
  assert.equal(k.liburDiHariKerja, 4);      // 1 Jan Kamis, 1 Mei Jumat, 17 Ags Senin, 25 Des Jumat
  assert.equal(k.hariOperasional, 257);
  assert.equal(k.hariKerjaOrang, 245);
  assert.ok(Math.abs(k.faktorPengganti - 257 / 245) < 1e-9);
});

test('roundup harga', () => {
  assert.equal(roundupHarga(321.2), 330);
  assert.equal(roundupHarga(45318.4), 45400);
  assert.equal(roundupHarga(0), 0);
});

test('hitung tender contoh', () => {
  const h = hitungTender(contohTender, contohMaster);
  // Volume desain inbound per shift = 1500 / (257/12)
  const inb = h.volume.find(v => v.arus === 'inbound')!;
  assert.ok(Math.abs(inb.desainPerShift - 1500 / (257 / 12)) < 1e-9);
  // Space (metode Excel): storage = PP desain × m² per PP; total = jumlah komponen
  assert.equal(h.space.ppDesain, 480);
  assert.ok(Math.abs(h.space.storageM2 - h.space.ppDesain * h.space.m2PerPP) < 1, `storage ${h.space.storageM2}`);
  assert.ok(h.space.totalM2 >= h.space.storageM2 + h.space.stagingInM2 + h.space.stagingOutM2);
  // Manpower (metode Process Design, sama dengan Excel): FTE bulanan → orang per shift aktif; headcount = total orang
  const op = h.manpower.find(m => m.roleName === 'Operator Forklift')!;
  assert.ok(op.headcount >= 1 && op.mpPerShift >= 1);
  assert.equal(op.mpPerShift, Math.ceil(op.headcount / 1));   // 1 shift aktif
  // Unit forklift ≥ 1 dan tidak melebihi jumlah operator (alat dipakai bergantian)
  assert.ok(h.mhe[0].unit >= 1 && h.mhe[0].unit <= op.headcount, `unit ${h.mhe[0].unit}`);
  // Total biaya = jumlah baris; rate card ada untuk storage, in, out
  const sum = h.biaya.reduce((s, b) => s + b.biayaBulan, 0);
  assert.ok(Math.abs(sum - h.totalBiayaBulan) < 1);
  assert.deepEqual(h.rateCard.map(r => r.bucket).sort(), ['handling_in', 'handling_out', 'storage']);
  // Harga per bucket mencakup seluruh biaya (alokasi lengkap)
  const totBucket = h.rateCard.reduce((s, r) => s + r.biayaBulan, 0);
  assert.ok(Math.abs(totBucket - h.totalBiayaBulan) < 5, `alokasi bocor: ${totBucket} vs ${h.totalBiayaBulan}`);
  // GP pada volume komitmen harus positif dan > margin minimum karena margin 8–18%
  assert.ok(h.simulasi[0].gpPersen > 0.07, `GP ${h.simulasi[0].gpPersen}`);
  console.log(JSON.stringify({ kalender: h.kalender, space: h.space, totalHeadcount: h.totalHeadcount,
    manpower: h.manpower.map(m => [m.roleName, m.mpPerShift, m.headcount, m.utilisasi, m.biayaBulan]),
    mhe: h.mhe.map(m => [m.nama, m.jamPerShift, m.unit]), perKelompok: h.perKelompok, total: h.totalBiayaBulan,
    rateCard: h.rateCard, storageAlternatif: h.storageAlternatif, simulasi: h.simulasi, redFlags: h.redFlags }, null, 1));
});

test('red flag: peak < rata-rata dan komitmen nol', () => {
  const t = structuredClone(contohTender);
  t.volumes[1] = { ...t.volumes[1], peakBulan: 100, rataRataBulan: 200, komitmenBulan: 0 };
  const h = hitungTender(t, contohMaster);
  const kode = h.redFlags.map(f => f.kode);
  assert.ok(kode.includes('PEAK_LT_AVG'));
  assert.ok(kode.includes('KOMITMEN_NOL'));
});

test('2 shift: beban dibagi rata → orang tersebar ke 2 shift, total FTE tidak dobel, alat tidak dikali shift', () => {
  const h1 = hitungTender(contohTender, contohMaster);
  const t = structuredClone(contohTender); t.jumlahShift = 2;
  // beban bawaan 100/0/0 dengan 2 shift → red flag shift kosong
  assert.ok(hitungTender(t, contohMaster).redFlags.some(f => f.kode === 'SHIFT_TANPA_BEBAN'));
  t.processDesign = ratakanBebanShift(t.processDesign ?? PD_DEFAULT, 2);
  assert.deepEqual(t.processDesign.bebanShift.slice(0, 2), [0.5, 0.5]);
  const h = hitungTender(t, contohMaster);
  assert.ok(!h.redFlags.some(f => f.kode === 'SHIFT_TANPA_BEBAN'));
  const op = h.manpower.find(m => m.roleName === 'Operator Forklift')!;
  const op1 = h1.manpower.find(m => m.roleName === 'Operator Forklift')!;
  assert.ok(op.headcount >= op1.headcount, `2 shift ${op.headcount} < 1 shift ${op1.headcount}`);   // pembulatan per shift → bisa naik, tidak turun
  assert.ok(op.headcount <= op1.headcount * 2, 'FTE tidak boleh dobel karena dikali shift');
  assert.equal(op.mpPerShift, Math.ceil(op.headcount / 2 - 1e-9));
  assert.ok(h.mhe[0].unit <= h1.mhe[0].unit);
});

test('gudang terpilih: sewa utuh, luas kurang → red flag kritis', () => {
  const t = structuredClone(contohTender);
  t.space = { ...t.space, sewaTetapBulan: 50000000, luasTersediaM2: 300, namaGudang: 'Gudang A' };
  const h = hitungTender(t, contohMaster);
  const sewa = h.biaya.find(b => b.deskripsi.startsWith('Sewa gudang'))!;
  assert.equal(sewa.biayaBulan, 50000000);
  assert.ok(h.redFlags.some(f => f.kode === 'GUDANG_KURANG'));
  t.space.luasTersediaM2 = 2000;
  assert.ok(hitungTender(t, contohMaster).redFlags.some(f => f.kode === 'GUDANG_LONGGAR'));
});
