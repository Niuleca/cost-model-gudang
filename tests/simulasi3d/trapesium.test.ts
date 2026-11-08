import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentangZ, poligonLuar, kotakLuar, luasGedung, diDalamGedung, type Gedung } from '../../src/lib/simulasi3d/editor.ts';

const g: Gedung = { L: 40, W: 40, sideMm: 9000, centerMm: 11000, trapesium: { lebarDepan: 20, lebarBelakang: 40, sisi: 'kanan' } };

test('gedung trapesium: rentang lebar, luas, titik di dalam', () => {
  assert.deepEqual(rentangZ(g, 0), [0, 20]);
  assert.deepEqual(rentangZ(g, 40), [0, 40]);
  assert.deepEqual(rentangZ(g, 20), [0, 30]);
  assert.equal(luasGedung(g), 1200);
  assert.equal(diDalamGedung(g, 5, 15), true);
  assert.equal(diDalamGedung(g, 5, 30), false);
  assert.equal(poligonLuar(g)!.length, 4);
  const kotak = kotakLuar(g, 10);
  assert.equal(kotak.length, 4);
  assert.deepEqual(kotak[0], { x0: 0, x1: 10, z0: 20, z1: 40 });
  assert.equal(luasGedung({ ...g, trapesium: null }), 1600);
  assert.equal(poligonLuar({ ...g, trapesium: { lebarDepan: 40, lebarBelakang: 40, sisi: 'kiri' } }), null);
  assert.deepEqual(rentangZ({ ...g, trapesium: { lebarDepan: 20, lebarBelakang: 40, sisi: 'kiri' } }, 0), [20, 40]);
});

import { asGridKolom, uraiGridKolom, gabungJadiAreaKolom, pecahGridKolom, uraiKomponen, putar, type Komponen as KompKol } from '../../src/lib/simulasi3d/editor.ts';
test('area kolom: tarik → kolom menyesuaikan, bentang per as, pecah & gabung', () => {
  const k: KompKol = { id: 'g', jenis: 'areaKolom', label: 'Grid', x: 0, z: 0, w: 36.5, d: 24.5, tinggi: 10, gridKolom: { bentangX: [12], bentangZ: [12], kolomW: 0.5, kolomD: 0.5, tutupUjung: true } };
  assert.deepEqual(asGridKolom(k).xs, [0.25, 12.25, 24.25, 36.25]);
  assert.equal(uraiGridKolom(k).length, 4 * 3);
  // tarik area lebih panjang → kolom bertambah; sisa bentang diberi kolom ujung
  assert.deepEqual(asGridKolom({ ...k, w: 42.5 }).xs, [0.25, 12.25, 24.25, 36.25, 42.25]);
  // satu bentang berbeda
  assert.deepEqual(asGridKolom({ ...k, gridKolom: { ...k.gridKolom!, bentangX: [12, 8] } }).xs, [0.25, 12.25, 20.25, 28.25, 36.25]);
  // pecah → kolom satuan, gabung lagi → area dengan bentang sama
  const satuan = pecahGridKolom(k);
  assert.ok(satuan.every(c => c.jenis === 'kolom' && !c.induk));
  const e = { versi: 1 as const, gedung: { L: 60, W: 30, sideMm: 10000, centerMm: 12000 }, komponen: satuan, ukur: [], okupansi: null, stokDesain: 0, tinggiPalet: 1.4 };
  const h = gabungJadiAreaKolom(e as never)!;
  const area = h.edit.komponen.find(c => c.id === h.id)!;
  assert.deepEqual(area.gridKolom!.bentangX, [12, 12, 12]); assert.equal(uraiKomponen(h.edit.komponen).length, 12);
  assert.deepEqual(putar(k).gridKolom!.bentangX, [12]); assert.equal(putar(k).w, 24.5);
});
