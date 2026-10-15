import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitungKalender, hitungTender, roundupHarga } from '../src/lib/engine/index.ts';
import type { TenderInput, MasterData } from '../src/lib/engine/index.ts';

// Contoh ilustratif (bukan data customer): gudang semen block stacking, 1 shift, Surabaya.
export const contohTender: TenderInput = {
  customer: 'Contoh — Semen Kemasan', provinsi: 'Jawa Timur', kabKota: 'Kota Surabaya', tahun: 2026,
  durasiKontrakBulan: 24, jumlahShift: 1, jamEfektifPerShift: 7, hariKerjaPerMinggu: 5, cutiTahunanHari: 12,
  skenarioAset: 'Rental', paymentTermHari: 60,
  volumes: [
    { arus: 'storage', uom: 'palet', rataRataBulan: 400, peakBulan: 480, komitmenBulan: 400 },
    { arus: 'inbound', uom: 'palet', rataRataBulan: 1200, peakBulan: 1500, komitmenBulan: 1200 },
    { arus: 'outbound', uom: 'palet', rataRataBulan: 1200, peakBulan: 1500, komitmenBulan: 1200 },
  ],
  aktivitas: [
    { aktivitas: 'Unload palet dari truk', tahap: 'Inbound', tool: 'CBT', roleName: 'Operator Forklift', uom: 'palet', prodPerJam: 25, arus: 'inbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Cek palet', tahap: 'Inbound', tool: 'RF', roleName: 'Checker', uom: 'palet', prodPerJam: 40, arus: 'inbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Putaway block stack', tahap: 'Putaway', tool: 'CBT', roleName: 'Operator Forklift', uom: 'palet', prodPerJam: 20, arus: 'inbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Picking palet', tahap: 'Picking', tool: 'CBT', roleName: 'Operator Forklift', uom: 'palet', prodPerJam: 20, arus: 'outbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Loading palet ke truk', tahap: 'Outbound', tool: 'CBT', roleName: 'Operator Forklift', uom: 'palet', prodPerJam: 25, arus: 'outbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Cek outbound', tahap: 'Outbound', tool: 'RF', roleName: 'Checker', uom: 'palet', prodPerJam: 40, arus: 'outbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Muat sak manual (TKBM)', tahap: 'Outbound', tool: 'Manual', roleName: 'TKBM', uom: 'bag', prodPerJam: 400, arus: 'outbound', persenVolume: 0.3, pengaliUom: 40 },
  ],
  peranTetap: [
    { roleName: 'Admin Gudang', qty: 1, alokasi: { handling_in: 0.5, handling_out: 0.5 } },
  ],
  spanOfControl: 15, roleSupervisor: 'Supervisor', faktorProduktivitas: 0.95, efisiensi: 0.9,
  space: { metodeSimpan: 'block', palletPanjangM: 1.2, palletLebarM: 1.0, levelSimpan: 2, faktorAisle: 0.6,
    stagingM2PerPalet: 1.8, sequencePerShift: 2, fasilitasM2: 40, allowancePersen: 0.1, tarifSewaM2Bulan: 55000, luasCadM2: 800 },
  mhe: [{ tool: 'CBT', nama: 'Forklift Counterbalance 2,5T', mode: 'sewa', harga: 19000000, ketersediaan: 0.85, sparePersen: 0 }],
  costLines: [
    { deskripsi: 'Laptop', kelompok: 'IT', mode: 'beli', qty: 2, hargaSatuan: 17500000, umurBulan: 36 },
    { deskripsi: 'Handheld scanner', kelompok: 'IT', mode: 'beli', qty: 2, hargaSatuan: 9980000, umurBulan: 36 },
    { deskripsi: 'Internet', kelompok: 'IT', mode: 'bulanan', qty: 1, hargaSatuan: 750000 },
    { deskripsi: 'Pest control umum', kelompok: 'HSE', mode: 'bulanan', qty: 1, hargaSatuan: 750000 },
    { deskripsi: 'Asuransi gudang & barang', kelompok: 'Asuransi', mode: 'bulanan', qty: 1, hargaSatuan: 2562500 },
    { deskripsi: 'APAR 6 kg', kelompok: 'HSE', mode: 'beli', qty: 8, hargaSatuan: 450000, umurBulan: 24 },
    { deskripsi: 'Implementasi & mob-demob', kelompok: 'Startup', mode: 'sekali', qty: 1, hargaSatuan: 30000000 },
  ],
  listrik: [
    { item: 'Lampu gudang LED 100W', watt: 100, qty: 24, jamPerHari: 10 },
    { item: 'Komputer', watt: 300, qty: 2, jamPerHari: 9 },
  ],
  tarifListrikKwh: 1114.74,
  advanceSewaBulan: 12, depositBulan: 1,
  stokTon: 480 * 2,
};

export const contohMaster: MasterData = {
  upahMinimum: 5288796, statusUpah: 'Media + no. SK',
  jobLevels: [
    { roleName: 'Operator Forklift', klasifikasi: 'Blue Collar', faktorUmk: 1.05, tunjanganBulan: 200000, isOutsourcing: true },
    { roleName: 'Checker', klasifikasi: 'Blue Collar', faktorUmk: 1, tunjanganBulan: 0, isOutsourcing: true },
    { roleName: 'TKBM', klasifikasi: 'Blue Collar', faktorUmk: 1, tunjanganBulan: 0, isOutsourcing: true },
    { roleName: 'Admin Gudang', klasifikasi: 'White Collar', faktorUmk: 1.1, tunjanganBulan: 0, isOutsourcing: true },
    { roleName: 'Supervisor', klasifikasi: 'White Collar', faktorUmk: 1.6, tunjanganBulan: 500000, isOutsourcing: false },
  ],
  holidays: [
    { tanggal: '2026-01-01', nama: 'Tahun Baru' }, { tanggal: '2026-05-01', nama: 'Hari Buruh' },
    { tanggal: '2026-08-17', nama: 'HUT RI' }, { tanggal: '2026-12-25', nama: 'Natal' },
  ],
  payroll: { bpjsJht: 0.037, bpjsJkk: 0.0089, bpjsJkm: 0.003, bpjsJp: 0.02, bpjsKes: 0.04,
    batasUpahJp: 10547400, batasUpahKes: 12000000, thr: 1 / 12, pesangon: 0.08, contingencyOs: 0.07, feeOs: 0.05 },
  finance: { bungaModalTahun: 0.1, apHari: 30, overheadPersen: 0.03, pphGrossUp: 0.02, gpMinimum: 0.08 },
  margin: { Rendah: 0.08, Sedang: 0.12, Tinggi: 0.18 },
};

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
  // Space: 480 PP × 1,2 × 1,6 / 2 = 460,8 m²
  assert.equal(h.space.storageM2, 460.8);
  // Forklift: jam per shift dari 4 aktivitas CBT
  const v = 1500 / (257 / 12);
  const jamFl = (v / (25 * 0.95) + v / (20 * 0.95)) / 0.9 * 2;
  const op = h.manpower.find(m => m.roleName === 'Operator Forklift')!;
  assert.ok(Math.abs(op.jamPerShift - Math.round(jamFl * 100) / 100) < 0.01);
  assert.equal(op.mpPerShift, Math.ceil(jamFl / 7));
  assert.equal(op.headcount, Math.ceil(Math.ceil(jamFl / 7) * 1 * (257 / 245)));
  // Unit forklift = ceil(jam / (7 × 0,85))
  assert.equal(h.mhe[0].unit, Math.ceil(jamFl / (7 * 0.85)));
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

test('2 shift: headcount operator ≈ 2× per shift, unit forklift tidak dikali shift', () => {
  const t = structuredClone(contohTender); t.jumlahShift = 2;
  const h = hitungTender(t, contohMaster);
  const op = h.manpower.find(m => m.roleName === 'Operator Forklift')!;
  assert.equal(op.headcount, Math.ceil(op.mpPerShift * 2 * (257 / 245)));
  const h1 = hitungTender(contohTender, contohMaster);
  assert.ok(h.mhe[0].unit <= h1.mhe[0].unit);
});
