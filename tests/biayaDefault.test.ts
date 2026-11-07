import { test } from 'node:test';
import assert from 'node:assert/strict';
import { biayaLainDefault, sinkronBiaya, tambahDefault, kurangDefault, type DriverBiaya, type ItemHarga } from '../src/lib/biayaLainDefault.ts';
import { itDefault, sinkronIt, slabWms, type KatalogIt } from '../src/lib/itDefault.ts';

const it = (id: number, kategori: string, item: string, beli: number | null, sewa: number | null = null, umur: number | null = null): ItemHarga =>
  ({ id, kategori, item, satuan: 'unit', harga_beli: beli, harga_sewa_bulan: sewa, umur_ekonomis_bulan: umur });
const items: ItemHarga[] = [
  it(1, 'Office', 'Meja Kerja Staff 120x60cm', 750000, null, 48), it(2, 'Office', 'Kursi Kantor Staff', 495000, null, 48),
  it(3, 'ATK', 'Kertas HVS A4', 54000), it(4, 'ATK', 'Kertas HVS A4', 48600), it(5, 'ATK', 'Pulpen', 2100), it(6, 'ATK', 'Pulpen', 18103),
  it(7, 'Consumable', 'Stretch Film 50 cm × 300 m, 17 mic (wrapping palet)', 140000), it(8, 'Palet', 'Pallet Kayu', 250000, 6000),
  it(9, 'Palet', 'Pallet Plastik', 450000, 40000), it(10, 'HSE', 'APAR / Fire Extinguisher 6kg', 450000, null, 24),
  it(11, 'Security', 'Security Guard / Satpam outsourcing (8 jam/shift)', null, 8200000), it(12, 'Asuransi', 'Asuransi stok — gudang umum / 3PL, konstruksi kelas 1 (okupasi 29378)', 2255000, 187917),
  it(13, 'HSE', 'Spill Kit (khusus Hazmat/B3)', 2500000, null, 24),
];
const d: DriverBiaya = { headcount: 40, userKantor: 6, manajer: 2, luasM2: 10000, officeM2: 90, posisiPalet: 4000, paletInBulan: 3000, paletOutBulan: 2800,
  orderInBulan: 400, orderOutBulan: 2600, hariKerjaBulan: 25, kategori: 'FMCG', umk: 5938885, skenarioAset: 'Rental', tipeGudang: 'Dedicated', nilaiStokRp: 0 };
const cari = (rows: ReturnType<typeof biayaLainDefault>, k: string) => rows.find(r => r.kunci === k)!;

test('default biaya lain: qty dari manpower, luas, volume & kategori', () => {
  const rows = biayaLainDefault(d, items);
  assert.equal(cari(rows, 'office.meja-staf').qty, 4);                 // 6 user kantor − 2 SPV
  assert.equal(cari(rows, 'office.kursi').qty, 10);                    // 6 + 4 kursi meeting
  assert.equal(cari(rows, 'atk.hvs').priceItemId, 4);                  // kemasan termurah (per rim)
  assert.equal(cari(rows, 'atk.hvs').qty, 9);                          // 6 user + 3.000 order ÷ 1.000
  assert.equal(cari(rows, 'cons.stretch').qty, 140);                   // 2.800 palet keluar ÷ 20
  assert.equal(cari(rows, 'palet').priceItemId, 9);                    // FMCG → palet plastik
  assert.equal(cari(rows, 'palet').qty, 4200);
  assert.equal(cari(rows, 'hse.apar').qty, 50);                        // 10.000 m² ÷ 200
  assert.equal(cari(rows, 'svc.satpam').qty, 4);                       // 1 pos (luas tidak > 10.000) × 4
  assert.equal(cari(rows, 'svc.satpam').hargaSatuan, Math.round(5938885 * 1.38 / 1000) * 1000);
  const asr = cari(rows, 'asuransi.stok');
  assert.equal(asr.belumDiketahui, true); assert.equal(asr.qty, 0);    // nilai stok belum diisi → merah
  assert.equal(rows.some(r => r.kunci === 'hse.spill'), false);        // spill kit hanya DG / kimia
});

test('default DG menambah spill kit; asuransi dari nilai stok', () => {
  const rows = biayaLainDefault({ ...d, kategori: 'Dangerous Goods (DG)', nilaiStokRp: 25e9 }, items);
  assert.equal(cari(rows, 'hse.spill').qty, 10);
  const asr = cari(rows, 'asuransi.stok');
  assert.equal(asr.qty, 25); assert.equal(asr.hargaSatuan, 187917); assert.equal(asr.belumDiketahui, undefined);
});

test('baris default ikut data tender selama qty belum diubah manual', () => {
  const awal = biayaLainDefault(d, items);
  const edit = awal.map(r => (r.kunci === 'office.kursi' ? { ...r, qty: 15 } : r));
  const baru = sinkronBiaya(edit, biayaLainDefault({ ...d, luasM2: 12000, umk: 6000000 }, items))!;
  assert.ok(baru);
  assert.equal(cari(baru, 'hse.apar').qty, 60);
  assert.equal(cari(baru, 'office.kursi').qty, 15);                     // manual tetap
  assert.equal(cari(baru, 'svc.satpam').qty, 8);                        // > 10.000 m² → pos patroli
  assert.equal(cari(baru, 'svc.satpam').hargaSatuan, Math.round(6000000 * 1.38 / 1000) * 1000);
  assert.equal(sinkronBiaya(baru, biayaLainDefault({ ...d, luasM2: 12000, umk: 6000000 }, items)), null);
});

test('tambah default tidak menduplikasi item lama tanpa kunci', () => {
  const def = biayaLainDefault(d, items);
  const lama = [{ priceItemId: 7, deskripsi: 'Stretch', kelompok: 'Consumable' as const, mode: 'bulanan' as const, qty: 10, hargaSatuan: 140000 }];
  const hasil = tambahDefault(lama, def);
  assert.equal(hasil.filter(r => r.priceItemId === 7).length, 1);
  assert.equal(kurangDefault(hasil, def).length, 0);
});

test('IT: slab WMS dari volume order, access point & RF dari operator', () => {
  const kat: KatalogIt[] = [
    { id: 1, kelompok: 'Software - WMS Solution', item: 'WMS SaaS – slab 1', cost_type: 'Transaction/Month', harga: 3400, slab_min: 0, slab_max: 20000 },
    { id: 2, kelompok: 'Software - WMS Solution', item: 'WMS SaaS – slab 2', cost_type: 'Transaction/Month', harga: 2750, slab_min: 20001, slab_max: 100000 },
    { id: 3, kelompok: 'Hardware & Device', item: 'Scanner HHT', cost_type: 'PDPM', harga: 475000 },
    { id: 4, kelompok: 'Networking Device', item: 'WiFi Access Point (WiFi 6, enterprise)', cost_type: 'OTC/Unit', harga: 3450000 },
  ];
  assert.equal(slabWms(kat, 35000)?.id, 2);
  const drv = { luasM2: 10000, officeM2: 150, transaksiBulan: 5000, orderBulan: 35000, userKantor: 6, manajer: 2, operatorScan: 20, shift: 2, unitRf: 0, unitPc: 0, unitLaptop: 0 };
  const rows = itDefault(drv, kat);
  const wms = rows.find(r => r.kunci === 'wms')!;
  assert.equal(wms.catalogId, 2); assert.equal(wms.qty, 35000);
  assert.equal(rows.find(r => r.kunci === 'hht')!.qty, 11);              // 20 ÷ 2 shift × 1,1
  assert.equal(rows.find(r => r.kunci === 'ap')!.qty, 17 + 1);           // 9.850 m² ÷ 600 → 17 + office 1
  const turun = sinkronIt(rows, itDefault({ ...drv, orderBulan: 12000 }, kat))!;
  assert.equal(turun.find(r => r.kunci === 'wms')!.catalogId, 1);
});
