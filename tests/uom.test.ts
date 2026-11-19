// Konversi UoM terpadu: semua satuan volume → palet ekuivalen → satuan lain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uraiUom, paletEkuivalen, faktorUom, kelasUom, type VolumeInput } from '../src/lib/engine/types.ts';
import { opsiUomRateCard } from '../src/lib/engine/index.ts';

const m = { cbmPerPalet: 1.6, tonPerPalet: 0.5, cbmPerCase: 0.04, kgPerCase: 12 };
const vol = (uom: string, q: number, konversi?: VolumeInput['konversi']): VolumeInput => ({ arus: 'storage', uom, rataRataBulan: q, peakBulan: q, komitmenBulan: q, konversi });

test('4.000 CBM → palet, ton, case (bukan 4.000 palet)', () => {
  const u = uraiUom(vol('cbm', 4000), 4000, m);
  assert.equal(u.palet, 2500);
  assert.equal(u.cbm, 4000);
  assert.equal(u.kg, 1_250_000);
  assert.equal(u.case, 2500 * 40);            // perkiraan 1,6 ÷ 0,04 = 40 case/palet
  assert.equal(paletEkuivalen({ ...vol('cbm', 4000), muatan: m }).palet, 2500);
  assert.equal(paletEkuivalen({ ...vol('cbm', 4000), muatan: m }).ok, true);
});

test('ton, kg & liter', () => {
  assert.equal(uraiUom(vol('ton', 100), 100, m).palet, 200);
  assert.equal(uraiUom(vol('kg', 1000), 1000, m).palet, 2);
  assert.equal(uraiUom(vol('liter', 1000), 1000, m).palet, null);                 // isi cair per palet belum diisi
  assert.equal(uraiUom(vol('liter', 1000), 1000, { ...m, literPerPalet: 1000 }).palet, 1);
});

test('case / bag dengan isi per palet + isi kecil', () => {
  const u = uraiUom(vol('karton', 4800, { uom1: 'case', per1: 0, uom2: 'pcs', per2: 24, paletIsi: 48 }), 4800, m);
  assert.equal(u.palet, 100); assert.equal(u.case, 4800); assert.equal(u.pcs, 4800 * 24); assert.equal(u.paletPasti, true);
  const b = uraiUom(vol('bag', 1000, { uom1: 'case', per1: 0, uom2: 'kg', per2: 50 }), 1000, m);
  assert.equal(b.palet, 100);                                                           // 1000 × 50 kg ÷ 500 kg/palet (perkiraan)
  assert.equal(b.paletPasti, false);
});

test('baris palet: isi case & pcs, faktor ke aktivitas', () => {
  const v = vol('palet', 10, { uom1: 'case', per1: 40, uom2: 'pcs', per2: 12 });
  const u = uraiUom(v, 10, m);
  assert.equal(u.case, 400); assert.equal(u.pcs, 4800); assert.equal(u.cbm, 16);
  assert.equal(faktorUom(v, 'karton', m), 40);
  assert.equal(faktorUom(v, 'pcs', m), 480);
  assert.equal(faktorUom(v, 'cbm', m), 1.6);
});

test('satuan transaksi tidak dikonversi, kelas UoM', () => {
  assert.equal(uraiUom(vol('order', 500), 500, m).palet, null);
  assert.equal(kelasUom('Pallet'), 'palet'); assert.equal(kelasUom('m³'), 'cbm'); assert.equal(kelasUom('jumbo bag'), 'kemasan');
});

test('opsi tarif storage untuk volume CBM berisi palet & kg', () => {
  const o = opsiUomRateCard('storage', { ...vol('cbm', 4000), muatan: m }, 4000, 5000, m);
  const cari = (u: string) => o.find(x => x.uom === u)?.volume;
  assert.equal(cari('cbm'), 4000); assert.equal(cari('palet'), 2500); assert.equal(cari('kg'), 1_250_000);
  assert.ok(!o.some(x => !Number.isFinite(x.volume)));
});

test('Profil order: kontainer loose case tidak 0 walau isi case/palet kosong', async () => {
  const { volumePalet, hitungProfil, KENDARAAN_DEFAULT, PARAM_DEFAULT } = await import('../src/lib/profilVolume.ts');
  const inb: VolumeInput = { arus: 'inbound', uom: 'palet', rataRataBulan: 1500, peakBulan: 1500, komitmenBulan: 1500 };
  const vp = volumePalet(inb, 'peakBulan', PARAM_DEFAULT, [inb]);
  assert.equal(vp.cpp, 37);                      // 1,5 CBM ÷ 0,04 CBM per case
  const h = hitungProfil([{ moda: 'cont40hc', persen: 1, muatan: 'case' }], vp.paletBulan / 25, PARAM_DEFAULT, KENDARAAN_DEFAULT, vp, 25);
  assert.equal(h.hasil[0].qtyHari, 60 * 37);
  assert.equal(h.hasil[0].mobil?.bulat, 2);
  // isi dari baris volume lain (mis. outbound karton 48 per palet) dipakai lebih dulu
  const out: VolumeInput = { arus: 'outbound', uom: 'karton', rataRataBulan: 1000, peakBulan: 1000, komitmenBulan: 1000, konversi: { uom1: 'case', per1: 0, uom2: 'pcs', per2: 12, paletIsi: 48 } };
  assert.equal(volumePalet(inb, 'peakBulan', PARAM_DEFAULT, [inb, out]).cpp, 48);
});

test('Volume salah ketik ribuan (10.673 tersimpan 10,673) terdeteksi', async () => {
  const { volumeSalahRibuan } = await import('../src/lib/engine/types.ts');
  const vs: VolumeInput[] = [
    { arus: 'inbound', uom: 'karton', rataRataBulan: 3217, peakBulan: 3217, komitmenBulan: 3217 },
    { arus: 'outbound', uom: 'karton', rataRataBulan: 10.673, peakBulan: 10.673, komitmenBulan: 10.673 },
    { arus: 'storage', uom: 'palet', rataRataBulan: 1.5, peakBulan: 1.5, komitmenBulan: 1.5 },
  ];
  assert.deepEqual(volumeSalahRibuan(vs).map(x => x.i), [1]);
});
