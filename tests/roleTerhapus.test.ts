import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASUMSI_DEFAULT, bersihkanRoleTerhapus, roleDipakaiTender, type Asumsi } from '../src/lib/tender.ts';

const dasar: Asumsi = { ...ASUMSI_DEFAULT, aktivitas: [{ roleName: 'Operator Forklift (CBT)' } as never], spanOfControl: 1, roleSupervisor: 'Operational SPV',
  peranTetap: [{ roleName: 'Security', qty: 1, perShift: true, alokasi: { manajemen: 1 } }],
  rincianBiayaMp: { 'Operational SPV': { porsi: 0.25, skema: 'sharing' } as never, Security: { gajiPokok: 6e6 } as never }, levelRole: { 'Operational SPV': 'supervisor' } as never };

test('supervisor otomatis dihapus (span 0) → override rincian biaya & level ikut dibuang', () => {
  assert.ok(roleDipakaiTender(dasar).has('Operational SPV'));
  const b = bersihkanRoleTerhapus(dasar, { ...dasar, spanOfControl: 0 });
  assert.ok(!roleDipakaiTender(b).has('Operational SPV'));
  assert.deepEqual(Object.keys(b.rincianBiayaMp ?? {}), ['Security']);
  assert.deepEqual(Object.keys(b.levelRole ?? {}), []);
});

test('hapus peran tetap → override role itu dibuang; role lain tetap', () => {
  const b = bersihkanRoleTerhapus(dasar, { ...dasar, peranTetap: [] });
  assert.ok(!('Security' in (b.rincianBiayaMp ?? {})));
  assert.ok('Operational SPV' in (b.rincianBiayaMp ?? {}));
});

test('tidak ada role yang hilang → objek tidak berubah', () => {
  const baru = { ...dasar, spanOfControl: 15 };
  assert.equal(bersihkanRoleTerhapus(dasar, baru), baru);
});
