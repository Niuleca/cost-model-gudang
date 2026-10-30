// Tarik rak otomatis: rak memanjang sampai rintangan / dinding, kelipatan bay, tidak menabrak komponen lain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paramAwal, susunLayout } from '../../src/lib/simulasi3d/layout';
import { dariOtomatis, nBay, ringkas, tarikRak, type LayoutEdit } from '../../src/lib/simulasi3d/editor';
import { fixtureTender } from '../game/fixture';

const { t, h } = fixtureTender();
const tabrak = (e: LayoutEdit) => ringkas(e).peringatan.filter(p => p.pesan.includes('bertabrakan') || p.pesan.includes('keluar dari batas')).length;

test('tarik semua rak: bay bertambah, kelipatan bay penuh, tidak ada tabrakan baru, jarak dinding dipatuhi', () => {
  const p = paramAwal(t, h);
  const e = dariOtomatis(susunLayout(t, h, { param: p }), p, 0);
  // pendekkan semua rak supaya ada ruang untuk ditarik
  for (const k of e.komponen) if (k.rak) k.w = Math.max(k.rak.bayW, Math.round(k.w / 2 / k.rak.bayW) * k.rak.bayW);
  const sebelum = tabrak(e);
  const r = tarikRak(e, { jarakDinding: 0.5 });
  assert.ok(r.n > 0); assert.ok(r.bayAkhir > r.bayAwal); assert.ok(r.posAkhir > r.posAwal);
  assert.ok(tabrak(r.edit) <= sebelum);
  for (const k of r.edit.komponen) if (k.rak) {
    assert.ok(Math.abs(k.w - nBay(k) * k.rak.bayW) < 0.011, `${k.label} kelipatan bay`);
    assert.ok(k.x + k.w <= e.gedung.L - 0.5 + 0.011, `${k.label} jarak dinding`);
  }
  // idempoten: ditarik lagi tidak berubah
  const r2 = tarikRak(r.edit, { jarakDinding: 0.5 });
  assert.equal(r2.bayAkhir, r.bayAkhir);
});

test('tarik rak terpilih saja; rak yang menabrak rintangan dipendekkan', () => {
  const p = paramAwal(t, h);
  const e = dariOtomatis(susunLayout(t, h, { param: p }), p, 0);
  const rak = e.komponen.find(k => k.rak)!;
  e.komponen.push({ id: 'off', jenis: 'fasilitas', label: 'Office', x: rak.x + rak.rak!.bayW + 0.3, z: rak.z, w: 3, d: rak.d, tinggi: 3 });
  const r = tarikRak(e, { ids: [rak.id], jarakDinding: 0.5 });
  const baru = r.edit.komponen.find(k => k.id === rak.id)!;
  assert.equal(r.n, 1); assert.equal(nBay(baru), 1);
  const lain = r.edit.komponen.filter(k => k.rak && k.id !== rak.id);
  assert.deepEqual(lain.map(k => k.w), e.komponen.filter(k => k.rak && k.id !== rak.id).map(k => k.w));
});
