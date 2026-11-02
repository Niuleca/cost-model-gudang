// Gedung: grid pilar as-ke-as, gate di 4 dinding, platform loading dock & tinggi dock ke layout 3D.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paramAwal, susunLayout } from '../../src/lib/simulasi3d/layout';
import { aturSisiGate, dariOtomatis, keLayoutGudang, komponenBaru, posisiBentang, posisiGate, ringkas } from '../../src/lib/simulasi3d/editor';
import { fixtureTender } from '../game/fixture';

const { t, h } = fixtureTender();
const p = paramAwal(t, h);
const lay0 = susunLayout(t, h, { param: p });
const dasar = () => dariOtomatis(lay0, p, 0);

test('bentang pilar as ke as: 6 → 0, 6, 12, 18 (tiap bentang tetap 6 m, bukan bertambah)', () => {
  assert.deepEqual(posisiBentang('6', 20), [0, 6, 12, 18]);
  assert.deepEqual(posisiBentang('6; 6; 8', 40), [0, 6, 12, 20]);
  assert.deepEqual(posisiBentang('7,5', 16), [0, 7.5, 15]);
  const xs = posisiBentang('6', 60); xs.slice(1).forEach((x, i) => assert.equal(x - xs[i], 6));
});

test('gate menempel dinding yang dipilih, posisi & lebar dipertahankan saat pindah dinding', () => {
  const e = dasar(); const g = e.gedung;
  const [gt] = komponenBaru('gate', p, { x: 0, z: 10 }, 1.4);
  const depan = aturSisiGate({ ...gt, z: 10 }, 'depan', g);
  assert.equal(posisiGate(depan, g).pos, 10); assert.equal(depan.x, -0.3);
  const blk = aturSisiGate(depan, 'belakang', g); assert.equal(blk.x, Math.round((g.L - 0.3) * 100) / 100); assert.equal(posisiGate(blk, g).lebar, 4);
  const kiri = aturSisiGate(depan, 'kiri', g); assert.equal(kiri.z, -0.3); assert.equal(kiri.w, 4);
  const lay = keLayoutGudang({ ...e, gedung: { ...g, tinggiDockM: 1.3 }, komponen: [...e.komponen, depan, blk, kiri] }, lay0);
  assert.equal(lay.gate?.length, 3); assert.deepEqual(lay.gate?.map(x => x.sisi).sort(), ['belakang', 'depan', 'kiri']);
  assert.equal(lay.tinggiDock, 1.3);
  assert.equal(ringkas({ ...e, komponen: [...e.komponen, depan, blk, kiri] }).peringatan.filter(w => w.pesan.startsWith('Gate')).length, 0);
});

test('platform loading dock di luar dinding depan ikut ke layout 3D dengan palet', () => {
  const e = dasar();
  const [pl] = komponenBaru('platform', p, { x: 0, z: 2 }, 1.4);
  const lay = keLayoutGudang({ ...e, komponen: [...e.komponen, { ...pl, d: 30, w: 5, x: -5, palet: 12 }] }, lay0);
  assert.equal(lay.platform?.length, 1); const q = lay.platform![0];
  assert.equal(q.x1, 0); assert.equal(q.x0, -5); assert.equal(q.z1 - q.z0, 30); assert.equal(q.palet, 12);
});
