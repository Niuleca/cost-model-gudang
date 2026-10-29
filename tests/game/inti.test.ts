// Uji M1 Leca Game: alokasi FEFO/FIFO, putaway terdekat, invariant 30 hari, determinisme seed,
// gate biaya bulanan = cost model ±1%, performa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatDunia, jalankanHari, cekInvariant, ringkasDunia, skenarioDariTender, HARI } from '../../src/lib/game/index';
import { _uji } from '../../src/lib/game/dunia';
import type { Order } from '../../src/lib/game/tipe';
import { hitungTender } from '../../src/lib/engine/index';
import { contohMaster, contohTender } from '../fixtures/contoh';
import { fixtureTender } from './fixture';

const { t, h } = fixtureTender();
const orderUji = (sku: string, karton: number): Order => ({ id: 'SO-UJI', dibuat: 0, batas: HARI, baris: [{ sku, karton, teralokasi: 0, terpick: 0 }], status: 'baru', truk: null, sisaPick: 0, kartonLepas: 0, paletEq: 0, kurang: 0 });

test('skenario dari tender: lokasi, pekerja, MHE, tarif & biaya terisi', () => {
  const sk = skenarioDariTender(t, h, { seed: 1 });
  assert.ok(sk.lokasi.filter(l => l.tipe === 'rak' || l.tipe === 'lantai').length > 0);
  assert.equal(sk.pekerja.length, h.manpower.reduce((a, m) => a + Math.round(m.headcount), 0));
  assert.ok(sk.mhe.length > 0);
  assert.ok(sk.tarif.storagePerPaletBulan > 0 && sk.tarif.inboundPerPalet > 0 && sk.tarif.outboundPerPalet > 0);
  assert.ok(sk.permintaan.paletInHari > 0);
});

test('alokasi FEFO: palet expiry terdekat diambil dulu; karton lepas dari palet yang sudah terbuka', () => {
  const sk = skenarioDariTender(t, h, { seed: 1 }); sk.stokAwal = 0;
  const s = sk.sku.find(x => x.kontrol === 'expiry')!;
  const d = buatDunia(sk); d.t = 10 * HARI;
  const lok = () => _uji.cariLokasiKosong(d)!.id;
  const jauh = _uji.lpnBaru(d, s.id, 'L-JAUH', 300, s.kartonPerPalet, lok(), 'disimpan'); _uji.txn(d, 'opening', jauh, jauh.karton);
  const dekat = _uji.lpnBaru(d, s.id, 'L-DEKAT', 60, s.kartonPerPalet, lok(), 'disimpan'); _uji.txn(d, 'opening', dekat, dekat.karton);
  const kedaluwarsa = _uji.lpnBaru(d, s.id, 'L-HAMPIR', 12, s.kartonPerPalet, lok(), 'disimpan'); _uji.txn(d, 'opening', kedaluwarsa, kedaluwarsa.karton);
  const o1 = orderUji(s.id, s.kartonPerPalet); d.order.set(o1.id, o1); _uji.alokasi(d, o1);
  assert.equal(dekat.dialokasi, s.kartonPerPalet, 'palet expiry hari ke-60 dipilih');
  assert.equal(jauh.dialokasi, 0);
  assert.equal(kedaluwarsa.dialokasi, 0, 'sisa umur < 7 hari tidak dialokasi');
  // buka palet jauh sebagian, lalu order karton lepas harus menghabiskan palet terbuka itu dulu
  const buka = _uji.lpnBaru(d, s.id, 'L-BUKA', 400, 10, lok(), 'disimpan'); _uji.txn(d, 'opening', buka, buka.karton);
  const o2 = { ...orderUji(s.id, 10), id: 'SO-UJI2' }; d.order.set(o2.id, o2); _uji.alokasi(d, o2);
  assert.equal(buka.dialokasi, 10);
  assert.equal(jauh.dialokasi, 0);
  assert.deepEqual(cekInvariant(d), []);
});

test('alokasi FIFO untuk SKU tanpa expiry: yang diterima lebih dulu diambil', () => {
  const sk = skenarioDariTender(t, h, { seed: 1 }); sk.stokAwal = 0;
  const s = sk.sku.find(x => x.kontrol === 'none')!;
  const d = buatDunia(sk); d.t = 5 * HARI;
  const baru = _uji.lpnBaru(d, s.id, 'B', null, s.kartonPerPalet, _uji.cariLokasiKosong(d)!.id, 'disimpan'); _uji.txn(d, 'opening', baru, baru.karton);
  d.t = 2 * HARI;
  const lama = _uji.lpnBaru(d, s.id, 'A', null, s.kartonPerPalet, _uji.cariLokasiKosong(d)!.id, 'disimpan'); _uji.txn(d, 'opening', lama, lama.karton);
  d.t = 6 * HARI;
  const o = orderUji(s.id, s.kartonPerPalet); d.order.set(o.id, o); _uji.alokasi(d, o);
  assert.equal(lama.dialokasi, s.kartonPerPalet);
  assert.equal(baru.dialokasi, 0);
});

test('putaway memilih lokasi kosong terdekat dari staging inbound', () => {
  const sk = skenarioDariTender(t, h, { seed: 3 });
  const d = buatDunia(sk);
  const st = [...d.lokasi.values()].find(l => l.tipe === 'staging_in')!;
  const jarak = (l: { x: number; z: number; y: number }) => Math.abs(l.x - st.x) + Math.abs(l.z - st.z) + l.y * 2;
  const kosong = [...d.lokasi.values()].filter(l => (l.tipe === 'rak' || l.tipe === 'lantai') && l.lpn.length + l.dipesan < l.kapasitas);
  const terbaik = Math.min(...kosong.map(jarak));
  const dipilih = _uji.cariLokasiKosong(d)!;
  assert.ok(Math.abs(jarak(dipilih) - terbaik) < 1e-9);
});

test('30 hari operasi: tanpa pelanggaran invariant, order terkirim, stok tidak negatif', () => {
  const d = buatDunia(skenarioDariTender(t, h, { seed: 11 }));
  jalankanHari(d, 30);
  const r = ringkasDunia(d);
  assert.deepEqual(d.pelanggaran, []);
  assert.equal(r.hari, 30);
  assert.ok(r.orderSelesai > 0 && r.paletMasuk > 0);
  assert.ok(r.sla >= 0.9, `SLA ${r.sla}`);
  assert.ok(d.laporan.every(x => x.stokPalet >= 0));
});

test('deterministik: seed sama → hasil identik, seed beda → hasil berbeda', () => {
  const jalan = (seed: number) => { const d = buatDunia(skenarioDariTender(t, h, { seed })); jalankanHari(d, 10); return JSON.stringify(d.laporan); };
  assert.equal(jalan(42), jalan(42));
  assert.notEqual(jalan(42), jalan(43));
});

test('GATE: biaya bulanan game = total biaya cost model Leca ±1%', () => {
  const sk = skenarioDariTender(t, h, { seed: 5, mulai: '2026-03-01', peluang: { rusakPerPalet: 0 } });
  const d = buatDunia(sk);
  jalankanHari(d, 31);                                   // 1–31 Maret
  const biaya = d.laporan.reduce((a, r) => a + r.biaya, 0);
  const selisih = Math.abs(biaya - h.totalBiayaBulan) / h.totalBiayaBulan;
  assert.ok(selisih <= 0.01, `biaya game ${Math.round(biaya)} vs cost model ${h.totalBiayaBulan} (selisih ${(selisih * 100).toFixed(2)}%)`);
  // pendapatan bulanan mendekati simulasi cost model pada volume rata-rata (throughput nyata, toleransi 15%)
  const pend = d.laporan.reduce((a, r) => a + r.pendapatan, 0);
  const acuan = h.simulasi.find(s => s.skenario === 'Volume rata-rata')!.pendapatanBulan;
  assert.ok(Math.abs(pend - acuan) / acuan <= 0.15, `pendapatan game ${Math.round(pend)} vs cost model ${acuan}`);
});

test('performa: 1 hari game < 2 detik, termasuk gudang besar', () => {
  const besar = { ...contohTender, volumes: contohTender.volumes.map(v => ({ ...v, rataRataBulan: v.rataRataBulan * 15, peakBulan: v.peakBulan * 15, komitmenBulan: v.komitmenBulan * 15 })) };
  const hb = hitungTender(besar, contohMaster);
  const tb = { ...t, asumsi: { ...t.asumsi, volumes: besar.volumes } };
  const sk = skenarioDariTender(tb, hb, { seed: 9 });
  const d = buatDunia(sk);
  const t0 = performance.now(); jalankanHari(d, 1); const ms = performance.now() - t0;
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms`);
  assert.deepEqual(d.pelanggaran, []);
});

test('layout dari Desain gudang 2D ⇄ 3D (versi tersimpan) dipakai game: lokasi = posisi rak editor, 10 hari tanpa pelanggaran', async () => {
  const { paramAwal, susunLayout } = await import('../../src/lib/simulasi3d/layout');
  const { dariOtomatis, keLayoutGudang, ringkas } = await import('../../src/lib/simulasi3d/editor');
  const p = paramAwal(t, h); const auto = susunLayout(t, h, { param: { ...p, okupansi: 1 } });
  const edit = dariOtomatis(susunLayout(t, h, { param: p }), p, Math.round(h.space.ppDesain ?? 0));
  // ubah layout: gandakan rak pertama (kapasitas bertambah)
  const rak = edit.komponen.find(k => k.rak);
  if (rak) edit.komponen.push({ ...rak, id: 'salinan', z: rak.z + rak.d + 3, rak: { ...rak.rak! } });
  const lay = keLayoutGudang({ ...edit, okupansi: 1 }, auto);
  const sk = skenarioDariTender(t, h, { seed: 2, layout: lay });
  const posisi = sk.lokasi.filter(l => l.tipe === 'rak' || l.tipe === 'lantai').length;
  assert.equal(posisi, ringkas({ ...edit, okupansi: 1 }).totalRak);
  const d = buatDunia(sk); jalankanHari(d, 10);
  assert.deepEqual(d.pelanggaran, []);
  assert.ok(ringkasDunia(d).orderSelesai > 0);
});
