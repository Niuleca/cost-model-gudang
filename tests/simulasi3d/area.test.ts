// Area rak otomatis (gaya CLASS): tarik area → baris, lorong, bay terbentuk ulang; gabung/pecah tidak mengubah kapasitas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paramAwal, susunLayout } from '../../src/lib/simulasi3d/layout';
import { dariOtomatis, gabungJadiArea, keLayoutGudang, komponenBaru, pecahArea, ringkas, ringkasArea, uraiArea, type LayoutEdit } from '../../src/lib/simulasi3d/editor';
import { fixtureTender } from '../game/fixture';

const { t, h } = fixtureTender();
const p = paramAwal(t, h);
const dasar = () => dariOtomatis(susunLayout(t, h, { param: p }), p, 0);
const lorongKurang = (e: LayoutEdit) => ringkas(e).peringatan.filter(w => w.pesan.includes('lorong di muka')).length;
const tabrak = (e: LayoutEdit) => ringkas(e).peringatan.filter(w => w.pesan.includes('bertabrakan')).length;

test('area baru: ditarik lebih lebar → baris bertambah; lebih panjang → bay bertambah; tanpa tabrakan antar baris', () => {
  const [a] = komponenBaru('areaRak', p, { x: 0, z: 0 }, 1.4);
  const r0 = ringkasArea(a);
  assert.ok(r0.baris >= 3 && r0.posisi > 0, JSON.stringify(r0));
  const lebar = ringkasArea({ ...a, d: a.d * 2 }); assert.ok(lebar.baris > r0.baris);
  const panjang = ringkasArea({ ...a, w: a.w * 2 }); assert.ok(panjang.bay > r0.bay); assert.equal(panjang.baris, r0.baris);
  // cross aisle tengah memotong baris jadi 2 segmen
  const ct = uraiArea({ ...a, area: { ...a.area!, nTengah: 1 } }); assert.equal(ct.length, uraiArea(a).length * 2);
  const g: LayoutEdit = { ...dasar(), komponen: [{ ...a, x: 5, z: 1, d: 16 }] };
  assert.equal(tabrak(g), 0); assert.equal(lorongKurang(g), 0);
  for (const r of uraiArea(a)) assert.ok(r.x >= a.x - 1e-6 && r.z >= a.z - 1e-6 && r.x + r.w <= a.x + a.w + 1e-6 && r.z + r.d <= a.z + a.d + 1e-6);
});

test('rak layout otomatis → area (per kolom) → kapasitas sama; pecah lagi → sama; 3D/game memakai baris area', () => {
  const e = dasar(); const awal = ringkas(e).totalRak;
  let x = e; for (let i = 0; i < 50; i++) { const k = x.komponen.find(c => c.rak); if (!k) break; x = gabungJadiArea(x, k.id)!.edit; }
  assert.ok(x.komponen.some(k => k.area)); assert.ok(!x.komponen.some(k => k.rak));
  assert.equal(ringkas(x).totalRak, awal);
  const lay = keLayoutGudang({ ...x, okupansi: 1 }, susunLayout(t, h, { param: { ...p, okupansi: 1 } }));
  assert.equal(lay.rak.length, e.komponen.filter(k => k.rak).length);
  const pecah = { ...x, komponen: x.komponen.flatMap(k => (k.area ? pecahArea(k) : [k])) };
  assert.equal(ringkas(pecah).totalRak, awal);
});
