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
