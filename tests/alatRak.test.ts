// Alat rak otomatis: CBT ⇄ RT dari Warehouse Planning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alatRak, sesuaikanAlatRak } from '../src/lib/alatRak.ts';
import { VSM_DEFAULT } from '../src/lib/vsmDefault.ts';

const rak = { beamMm: 100, sideMm: 8000, centerMm: 10000, palletMm: 150, productMm: 1050, clearanceMm: 100, levelManual: null, tinggiLevel: [] };
test('rak 5 level (beam teratas 5,5 m) → RT; batas CBT 6 m → CBT', () => {
  assert.equal(alatRak({ porsi: { spr: 1, ddr: 0, block: 0, floor: 0 }, rak }).tool, 'RT');
  assert.equal(alatRak({ porsi: { spr: 1, ddr: 0, block: 0, floor: 0 }, rak }, 6000).tool, 'CBT');
});
test('block stack saja → CBT, aktivitas & role ikut berubah; manual tidak diubah', () => {
  const sx = { porsi: { spr: 0, ddr: 0, block: 1, floor: 0 }, rak };
  const akt = VSM_DEFAULT.map(x => ({ ...x }));
  akt[17] = { ...akt[17], alatManual: true };
  const baru = sesuaikanAlatRak(akt, sx)!;
  const put = baru.find(x => x.porsiMuat?.proses === 'putaway' && x.porsiMuat.muat === 'palet')!;
  assert.equal(put.tool, 'CBT'); assert.equal(put.roleName, 'Operator Forklift (CBT)'); assert.match(put.aktivitas, /forklift counterbalance/);
  assert.equal(baru.filter(x => x.tool === 'RT').length, akt.filter(x => x.tool === 'RT' && x.alatManual).length);
  assert.equal(sesuaikanAlatRak(baru, sx), null);
});
