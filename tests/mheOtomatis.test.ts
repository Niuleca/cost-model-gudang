// Item harga MHE otomatis: termurah yang memenuhi kapasitas & tinggi angkat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pilihItemMhe, sesuaikanMhe, jenisMhe } from '../src/lib/mheOtomatis.ts';
import type { MheInput } from '../src/lib/engine/types.ts';
type M = MheInput & { priceItemId?: number };

const it = (id: number, tipe: string, ton: number, sewa: number, status = 'approved', extra: object = {}) =>
  ({ id, kategori: 'MHE', item: `${tipe} ${ton}T`, harga_beli: sewa * 10, harga_sewa_bulan: sewa, umur_ekonomis_bulan: 60, status_efektif: status, mhe_tipe: tipe, kapasitas_ton: ton, ...extra });
const items = [it(14, 'Counter Balance', 2.5, 19e6), it(15, 'Counter Balance', 3, 22e6), it(12, 'Hand Pallet', 2.5, 1e6), it(18, 'Reach Truck', 2.5, 28e6, 'draft', { tinggi_angkat_m: 11 }), it(30, 'Counter Balance', 1.5, 15e6)];

test('jenis alat dari kode VSM', () => {
  assert.equal(jenisMhe('CBT'), 'Counter Balance'); assert.equal(jenisMhe('RT'), 'Reach Truck'); assert.equal(jenisMhe('Hand Pallet'), 'Hand Pallet');
  assert.equal(jenisMhe('PC'), null); assert.equal(jenisMhe('RF'), null);
});
test('termurah yang kapasitasnya cukup', () => {
  assert.equal(pilihItemMhe('CBT', items, { tonPerPalet: 0.8 })!.item.id, 30);   // 1,5 t cukup untuk 0,83 t
  assert.equal(pilihItemMhe('CBT', items, { tonPerPalet: 2 })!.item.id, 14);     // 1,5 t tidak cukup → 2,5 t
  assert.equal(pilihItemMhe('RT', items, { tinggiBeamM: 5.5 })!.item.id, 18);    // hanya draft → tetap dipakai
  assert.equal(pilihItemMhe('PC', items), null);
});
test('baris manual tidak ditimpa, baris otomatis diperbarui', () => {
  const awal = sesuaikanMhe<M>([], ['CBT', 'Hand Pallet', 'PC'], items, { tonPerPalet: 2 })!;
  assert.deepEqual(awal.map(m => [m.tool, m.priceItemId, m.otomatis]), [['CBT', 14, true], ['Hand Pallet', 12, true]]);
  const manual = awal.map(m => m.tool === 'CBT' ? { ...m, priceItemId: 15, otomatis: false } : m);
  assert.equal((sesuaikanMhe(manual, ['CBT', 'Hand Pallet'], items, { tonPerPalet: 0.5 }) ?? manual).find(m => m.tool === 'CBT')!.priceItemId, 15);
  assert.equal(sesuaikanMhe(awal, ['CBT', 'Hand Pallet'], items, { tonPerPalet: 0.5 })!.find(m => m.tool === 'CBT')!.priceItemId, 30);
});
