// Alat untuk aktivitas rak (putaway, replenishment, picking palet) mengikuti Warehouse Planning:
// tanpa rak (block stack / pallet floor) atau rak rendah → forklift counterbalance (CBT);
// double deep rack atau beam teratas di atas tinggi angkat CBT → reach truck (RT).
import { hitungLevelRak, lengkapiSpaceExcel, type SpaceExcel } from '@/lib/engine/space';
import type { AktivitasInput } from '@/lib/engine/types';

/** Tinggi angkat umum forklift counterbalance elektrik 2–2,5 ton (mast standar ± 4,5 m). */
export const BATAS_ANGKAT_CBT_MM = 4500;
const PROSES_RAK = ['putaway', 'replenishment', 'picking'];
const ROLE = { RT: 'Operator Reach Truck', CBT: 'Operator Forklift (CBT)' } as const;

export function alatRak(sx: Partial<SpaceExcel> | null | undefined, batasMm = BATAS_ANGKAT_CBT_MM) {
  const x = lengkapiSpaceExcel(sx);
  const p = x.porsi ?? { spr: 0, ddr: 0, block: 0, floor: 0 };
  const lv = hitungLevelRak(x.rak);
  const tinggiBeamMm = lv.dasar.length ? lv.dasar[lv.dasar.length - 1] : 0;   // permukaan beam level teratas
  const fm = (mm: number) => `${(mm / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} m`;
  if ((p.spr ?? 0) + (p.ddr ?? 0) <= 0) return { tool: 'CBT' as const, tinggiBeamMm: 0, level: 0, alasan: 'tanpa rak (block stack / pallet floor) → forklift counterbalance' };
  if ((p.ddr ?? 0) > 0) return { tool: 'RT' as const, tinggiBeamMm, level: lv.level, alasan: 'ada double deep rack → reach truck (double deep)' };
  return tinggiBeamMm <= batasMm
    ? { tool: 'CBT' as const, tinggiBeamMm, level: lv.level, alasan: `rak ${lv.level} level, beam teratas ${fm(tinggiBeamMm)} ≤ tinggi angkat CBT ${fm(batasMm)} → forklift counterbalance` }
    : { tool: 'RT' as const, tinggiBeamMm, level: lv.level, alasan: `rak ${lv.level} level, beam teratas ${fm(tinggiBeamMm)} > tinggi angkat CBT ${fm(batasMm)} → reach truck` };
}

const gantiNama = (nama: string, tool: 'RT' | 'CBT') => tool === 'CBT'
  ? nama.replace(/\(reach truck\)/i, '(forklift counterbalance)').replace(/reach truck/i, 'forklift')
  : nama.replace(/\(forklift counterbalance\)/i, '(reach truck)').replace(/^(Replenishment — )forklift/i, '$1reach truck');

/** Aktivitas rak palet yang alatnya CBT / RT dan belum diubah manual → disesuaikan; null bila tidak ada yang berubah. */
export function sesuaikanAlatRak<T extends AktivitasInput>(aktivitas: T[], sx: Partial<SpaceExcel> | null | undefined, batasMm?: number): T[] | null {
  const pilih = alatRak(sx, batasMm);
  let ubah = false;
  const hasil = aktivitas.map(a => {
    if (a.alatManual || a.porsiMuat?.muat !== 'palet' || !PROSES_RAK.includes(a.porsiMuat.proses) || !(a.tool === 'RT' || a.tool === 'CBT') || a.tool === pilih.tool) return a;
    ubah = true;
    const role = a.roleName === ROLE[a.tool as 'RT' | 'CBT'] ? ROLE[pilih.tool] : a.roleName;
    return { ...a, tool: pilih.tool, roleName: role, aktivitas: gantiNama(a.aktivitas, pilih.tool) };
  });
  return ubah ? hasil : null;
}
