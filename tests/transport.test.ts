import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cariLokasi, jarakKm, bisaDarat } from '../src/lib/lokasiIndonesia.ts';
import { hitungRute, ringkasTransport, hitungIntermodal, ruteIntermodalBaru, estimasiHarga, cocokRate, kapasitasBasis, armada, type RateTransport } from '../src/lib/transport.ts';

test('lokasi: nama bebas, alias & jarak', () => {
  assert.equal(cariLokasi('Kota Bekasi')?.nama, 'Bekasi');
  assert.equal(cariLokasi('Solo')?.nama, 'Surakarta (Solo)');
  assert.equal(cariLokasi('Tanjung Perak Surabaya')?.nama, 'Tanjung Perak');
  assert.equal(cariLokasi('CGK')?.jenis, 'bandara');
  const km = jarakKm('Jakarta', 'Surabaya')!;
  assert.ok(km > 800 && km < 1000, `Jakarta–Surabaya ±${km} km`);
  assert.equal(bisaDarat('Jakarta', 'Makassar'), false);
  assert.equal(bisaDarat('Jakarta', 'Medan'), true);
});

test('transport: harga jual = beli × (1 + margin), margin rute menimpa global', () => {
  const r = { id: 'a', origin: 'Jakarta', destination: 'Bandung', armada: 'CDD Box', basis: 'trip' as const, volumeBulan: 20, vendor: 'V', hargaBeli: 2_000_000 };
  const h = hitungRute(r, 0.1);
  assert.equal(h.jual, 2_200_000); assert.equal(h.biayaBulan, 40_000_000); assert.equal(h.pendapatanBulan, 44_000_000);
  assert.equal(Math.round(h.gpPersen * 10000) / 10000, 0.0909);
  assert.equal(hitungRute({ ...r, marginPersen: 0.2 }, 0.1).jual, 2_400_000);
  const s = ringkasTransport({ marginGlobal: 0.1, rute: [r, { ...r, id: 'b', hargaBeli: 0 }] });
  assert.equal(s.tanpaHarga, 1); assert.equal(s.pendapatanBulan, 44_000_000);
});

test('transport: estimasi per km & konversi basis, market price termurah', () => {
  const e = estimasiHarga('CDD Box', 'Jakarta', 'Surabaya', 'trip')!;
  assert.ok(e.harga > 3_000_000 && e.harga < 4_500_000, `estimasi ${e.harga}`);
  assert.equal(kapasitasBasis(armada('CDD Box'), 'pallet'), 6);
  const rates = [
    { id: 1, moda: 'darat', origin: 'Jakarta', destination: 'Surabaya', armada: 'CDD Box', basis: 'trip', harga: 5_000_000, vendor: 'A', lead_time_hari: 2, min_charge: null, cakupan: null, berlaku_sampai: null, status: 'draft' },
    { id: 2, moda: 'darat', origin: 'jakarta', destination: 'surabaya', armada: 'CDD Box', basis: 'trip', harga: 4_500_000, vendor: 'B', lead_time_hari: 2, min_charge: null, cakupan: null, berlaku_sampai: null, status: 'draft' },
    { id: 3, moda: 'darat', origin: 'Jakarta', destination: 'Surabaya', armada: 'CDD Box', basis: 'trip', harga: 3_000_000, vendor: 'C', lead_time_hari: 2, min_charge: null, cakupan: null, berlaku_sampai: '2020-01-01', status: 'draft' },
  ] as RateTransport[];
  assert.deepEqual(cocokRate(rates, { moda: 'darat', origin: 'Jakarta', destination: 'Surabaya', armada: 'CDD Box', basis: 'trip' }).map(r => r.id), [2, 1]);
});

test('intermodal: 3 stage digabung + biaya lain, margin, harga per satuan jual', () => {
  const r = ruteIntermodalBaru({ biayaLain: 1_000_000, shipmentBulan: 4, satuanJual: 'cbm', qtyJual: 25 });
  r.stage[0].harga = 2_000_000; r.stage[1].harga = 8_000_000; r.stage[2].harga = 3_000_000;
  const h = hitungIntermodal(r, 0.15);
  assert.equal(h.beliShipment, 14_000_000);
  assert.equal(h.jualShipment, 16_100_000);
  assert.equal(h.jualPerSatuan, 644_000);
  assert.equal(h.pendapatanBulan, 64_400_000);
});

import { hitungMetrik, analisisAkar, rataAktual, type Rencana, type AktualBulan } from '../src/lib/analisisProyek.ts';
test('project analysis: variance, status & akar masalah', () => {
  const r: Rencana = { sumber: 'uji', satuanVolume: 'palet', volumeIn: 3000, volumeOut: 3000, stokRata: 2000, satuanStok: 'palet', headcount: 40, headcountDirect: 30, hariKerja: 25,
    luasM2: 5000, posisiPalet: 2500, biayaBulan: 500_000_000, pendapatanBulan: 600_000_000, biayaKelompok: {} };
  const a: AktualBulan = { periode: '2026-09', volumeIn: 2400, volumeOut: 2500, stokRata: 2400, headcount: 46, headcountDirect: 36, hariKerja: 25, luasDipakaiM2: 5000, posisiPalet: 2500,
    biayaBulan: 560_000_000, pendapatanBulan: 590_000_000 };
  const m = hitungMetrik(r, a);
  const g = (k: string) => m.find(x => x.kode === k)!;
  assert.equal(g('hc').status, 'kuning');                 // +15%
  assert.equal(g('prod').status, 'merah');                // 4.900 ÷ (36×25) vs 6.000 ÷ (30×25)
  assert.equal(g('util').status, 'merah');                // 96%
  assert.equal(g('gp').status, 'merah');                  // 5,1% vs 16,7%
  const kode = analisisAkar(m).map(x => x.kode);
  for (const k of ['vol-rendah', 'prod', 'hc', 'util-tinggi', 'biaya', 'gp']) assert.ok(kode.includes(k), k);
  const rata = rataAktual([a, { ...a, periode: '2026-10', biayaBulan: 540_000_000 }])!;
  assert.equal(rata.biayaBulan, 550_000_000);
});
