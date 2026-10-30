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

test('cross aisle akhir & awal dipatuhi tepat; sisa < 1 bay ke tengah / dibagi rata / sesuai pilihan', () => {
  const [a] = komponenBaru('areaRak', p, { x: 10, z: 0 }, 1.4);
  const bw = a.area!.rak.bayW; const ujung = (k: typeof a) => Math.max(...uraiArea(k).map(r => r.x + r.w)); const awal = (k: typeof a) => Math.min(...uraiArea(k).map(r => r.x));
  for (const akhir of [0, 1, 2.5, 4]) {
    const k = { ...a, w: 40, area: { ...a.area!, crossAwal: 0, crossAkhir: akhir, nTengah: 1, crossTengah: 3.4 } };
    assert.ok(Math.abs(k.x + k.w - ujung(k) - akhir) < 0.011, `akhir ${akhir}: ${k.x + k.w - ujung(k)}`);
    assert.ok(Math.abs(awal(k) - k.x) < 0.011);
  }
  const tanpaTengah = { ...a, w: 40, area: { ...a.area!, crossAwal: 0, crossAkhir: 1, nTengah: 0, sisa: 'akhir' as const } };
  assert.ok(Math.abs(awal(tanpaTengah) - tanpaTengah.x) < 0.011);
  const keAwal = { ...tanpaTengah, area: { ...tanpaTengah.area, sisa: 'awal' as const } };
  assert.ok(Math.abs(keAwal.x + keAwal.w - ujung(keAwal) - 1) < 0.011);
  assert.ok(ringkasArea(keAwal).bay === ringkasArea(tanpaTengah).bay && bw > 0);
});

test('area adaptif: rak menghindari kolom (spacer = kolom + 0,2 m), office, ramp & dinding; lorong ≥ minimum', () => {
  const [a0] = komponenBaru('areaRak', p, { x: 0, z: 0 }, 1.4);
  const g = { L: 60, W: 40, sideMm: 10000, centerMm: 12000 };
  const kolom = (x: number, z: number, w: number) => ({ id: `k${x}-${z}`, jenis: 'kolom' as const, label: 'Kolom', x, z, w, d: w, tinggi: 10 });
  const komp = [
    ...[10, 30, 50].flatMap(x => [kolom(x, 12, 0.5), kolom(x, 26, 1.0)]),
    { id: 'off', jenis: 'fasilitas' as const, label: 'Office', x: 50, z: 32, w: 10, d: 8, tinggi: 3 },
    { id: 'ramp', jenis: 'zona' as const, label: 'Ramp', x: 0, z: 0, w: 8, d: 4, tinggi: 0 },
  ];
  const area = { ...a0, x: 0, z: 0, w: 60, d: 40, area: { ...a0.area!, mode: 'adaptif' as const, crossAwal: 0, crossAkhir: 0, kelonggaran: 0.1, bebasRintangan: 0.3, bebasDinding: 0.5, rak: { ...a0.area!.rak, lebarLorong: 3.4 } } };
  const e: LayoutEdit = { ...dasar(), gedung: g, komponen: [...komp, area] };
  const rows = uraiArea(area, e);
  assert.ok(rows.length > 0);
  const tumpang = (r: { x: number; z: number; w: number; d: number }, o: { x: number; z: number; w: number; d: number }, m = 0) => r.x < o.x + o.w + m - 1e-6 && o.x - m < r.x + r.w - 1e-6 && r.z < o.z + o.d + m - 1e-6 && o.z - m < r.z + r.d - 1e-6;
  for (const r of rows) {
    for (const k of komp.filter(c => c.jenis === 'kolom')) assert.ok(!tumpang(r, k, 0.1 - 1e-6), `rak ${r.z} menabrak kolom ${k.id}`);
    assert.ok(!tumpang(r, komp[6], 0.3 - 1e-6) && !tumpang(r, komp[7], 0.3 - 1e-6), 'rak menabrak office / ramp');
    assert.ok(r.x >= 0.5 - 1e-6 && r.z >= 0.5 - 1e-6 && r.x + r.w <= 59.5 + 1e-6 && r.z + r.d <= 39.5 + 1e-6, 'rak keluar dari jarak dinding');
  }
  // kolom di row spacer: dua baris back-to-back mengapit kolom dengan celah = lebar kolom + 0,2
  const zs = [...new Set(rows.map(r => r.z))].sort((x, y) => x - y);
  const D = area.area.dalam;
  for (const [kz, w] of [[12, 0.5], [26, 1.0]] as const) {
    const sebelum = zs.find(z => Math.abs(z + D - (kz - 0.1)) < 0.011), sesudah = zs.find(z => Math.abs(z - (kz + w + 0.1)) < 0.011);
    assert.ok(sebelum != null && sesudah != null, `kolom z=${kz} tidak di row spacer: ${zs.join(', ')}`);
  }
  // lorong muka-ke-muka ≥ 3,4 m
  const hadap = new Map(rows.map(r => [r.z, r.rak!.hadap]));
  for (let i = 1; i < zs.length; i++) if (hadap.get(zs[i - 1]) === 1 && hadap.get(zs[i]) === -1) assert.ok(zs[i] - (zs[i - 1] + D) >= 3.4 - 1e-6, `lorong ${zs[i - 1]}→${zs[i]}`);
  assert.equal(ringkas(e).peringatan.filter(w => w.pesan.includes('bertabrakan')).length, 0);
});
