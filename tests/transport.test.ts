import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cariLokasi, jarakKm, bisaDarat } from '../src/lib/lokasiIndonesia.ts';
import { hitungRute, ringkasTransport, hitungIntermodal, ruteIntermodalBaru, estimasiHarga, cocokRate, kapasitasBasis, armada, tierTransport, tierIntermodal,
  reviewTransport, reviewIntermodal, rateCardTransport, rateCardIntermodal, type RateTransport } from '../src/lib/transport.ts';

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

test('transport: margin = GP% → harga jual = beli ÷ (1 − margin), margin rute menimpa global', () => {
  const r = { id: 'a', origin: 'Jakarta', destination: 'Bandung', armada: 'CDD Box', basis: 'trip' as const, volumeBulan: 20, vendor: 'V', hargaBeli: 2_000_000 };
  const h = hitungRute(r, 0.15);
  assert.equal(h.jual, 2_352_941.18); assert.equal(h.biayaBulan, 40_000_000);
  assert.equal(Math.round(h.gpPersen * 10000) / 10000, 0.15);          // input 15% → GP tepat 15% (bukan 13,04%)
  assert.equal(hitungRute({ ...r, marginPersen: 0.2 }, 0.1).jual, 2_500_000);
  const s = ringkasTransport({ marginGlobal: 0.1, rute: [r, { ...r, id: 'b', hargaBeli: 0 }] });
  assert.equal(s.tanpaHarga, 1); assert.equal(Math.round(s.gpPersen * 1000) / 1000, 0.1);
});

test('transport: perbandingan tier margin, review & rate card quotation', () => {
  const r = { id: 'a', origin: 'Jakarta', destination: 'Surabaya', armada: 'CDD Box', basis: 'trip' as const, volumeBulan: 10, vendor: 'V', hargaBeli: 4_000_000, marginPersen: 0.2, leadTimeHari: 2 };
  const t = { marginGlobal: 0.12, rute: [r, { ...r, id: 'b', destination: 'Makassar', hargaBeli: 0, marginPersen: null }] };
  const x = tierTransport(t, [0.15, 0.1, 0.05]);
  assert.deepEqual(x.kolom.map(k => k.label), ['Saat ini', 'Margin 15%', 'Margin 10%', 'Margin 5%']);
  assert.equal(x.baris[0].jual[0], 5_000_000);                         // margin rute 20% tetap di kolom "Saat ini"
  assert.deepEqual(x.total.slice(1).map(k => Math.round(k.gpPersen * 100)), [15, 10, 5]);
  const rv = reviewTransport(t);
  assert.ok(rv.some(c => c.level === 'kritis' && /harga beli/i.test(c.pesan)));
  assert.ok(rv.some(c => /beda pulau/.test(c.pesan)));
  const rc = rateCardTransport(t);
  assert.equal(rc.length, 1); assert.equal(rc[0].tarif, 5_000_000); assert.match(rc[0].catatan ?? '', /Lead time 2 hari/);
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
  assert.equal(h.jualShipment, 16_470_588.24);                          // 14 jt ÷ 0,85
  assert.equal(h.jualPerSatuan, 658_823.53);
  assert.equal(Math.round(h.gpPersen * 1000) / 1000, 0.15);
  const t = { marginGlobal: 0.15, rute: [r] };
  assert.deepEqual(tierIntermodal(t, [0.1]).total.map(k => Math.round(k.gpPersen * 100)), [15, 10]);
  assert.equal(rateCardIntermodal(t)[0].tarif, 658_824);
  assert.deepEqual(reviewIntermodal(t).filter(c => c.level === 'kritis').map(c => c.pesan), ['Origin / destination belum diisi.']);   // semua stage sudah berharga
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

import { workbookTransport } from '../src/lib/exportTransport.ts';
test('export Excel transport: rumus lengkap + hasil sama dengan sistem', async () => {
  const t = { kode: 'X', customer: 'C', industri: null, kab_kota: 'Jakarta', provinsi: '-', durasi_kontrak_bulan: 12, payment_term_hari: 30, status: 'draft' };
  const tr = { marginGlobal: 0.15, rute: [{ id: 'a', origin: 'Jakarta', destination: 'Bandung', armada: 'CDD Box', basis: 'trip' as const, volumeBulan: 20, vendor: 'V', hargaBeli: 2_000_000 }] };
  const wb = await workbookTransport(t, tr);
  const r = wb.getWorksheet('Rute')!;
  assert.match((r.getCell('M5').value as { formula: string }).formula, /ROUND\(J5\/\(1-MIN\(0\.95,MAX\(-1,L5\)\)\),2\)/);
  assert.equal((r.getCell('M5').value as { result: number }).result, 2_352_941.18);
  assert.deepEqual(wb.worksheets.map(w => w.name), ['Ringkasan', 'Rute', 'Perbandingan Margin', 'Review']);
});
