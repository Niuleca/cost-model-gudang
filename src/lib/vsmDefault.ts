// Skema default Aktivitas (VSM) mengikuti prosedur gudang standar: inbound → putaway → inventory → replenishment → outbound.
// Produktivitas diambil dari database produktivitas (productivityId) bila ada; porsi % adalah asumsi awal yang bisa diubah.
import type { AktivitasInput } from '@/lib/engine/types';
import type { TagPorsi } from '@/lib/porsiMuat';

type Baris = AktivitasInput & { productivityId?: number };
const b = (tahap: string, aktivitas: string, roleName: string, tool: string, uom: string, prodPerJam: number, arus: Baris['arus'], persenVolume: number, productivityId?: number, porsiMuat?: TagPorsi): Baris =>
  ({ tahap, aktivitas, roleName, tool, uom, prodPerJam, arus, persenVolume, pengaliUom: 1, ...(productivityId ? { productivityId } : {}), ...(porsiMuat ? { porsiMuat } : {}) });
const tg = (proses: TagPorsi['proses'], muat: TagPorsi['muat']): TagPorsi => ({ proses, muat });

export const VSM_DEFAULT: Baris[] = [
  // Inbound — unloading: curah/loose oleh TKBM, atau palletize dengan forklift counterbalance
  b('Inbound - Receiving', 'Unloading curah / loose case (TKBM)', 'TKBM', 'Manual', 'karton', 350, 'inbound', 0.5, 2, tg('unloading', 'loose')),
  b('Inbound - Receiving', 'Palletize barang curah (TKBM)', 'TKBM', 'Manual', 'karton', 300, 'inbound', 0.5, 9, tg('unloading', 'loose')),
  b('Inbound - Receiving', 'Unloading palet (forklift counterbalance)', 'Operator Forklift (CBT)', 'CBT', 'palet', 40, 'inbound', 0.5, 1, tg('unloading', 'palet')),
  b('Inbound - Receiving', 'Admin inbound — proses receiving (dokumen & GR)', 'Inbound Admin', 'PC', 'order', 30, 'inbound', 1, 15),
  b('Inbound - Receiving', 'Checker inbound — checking barang & isi tally sheet', 'Checker', 'Manual', 'palet', 60, 'inbound', 1, 5),
  b('Inbound - Receiving', 'Pindah barang ke staging inbound', 'TKBM (Runner)', 'Hand Pallet', 'palet', 20, 'inbound', 1, 13),
  // Putaway
  b('Inbound - Putaway', 'Admin inbound — input putaway', 'Inbound Admin', 'PC', 'line', 60, 'inbound', 1, 21),
  b('Inbound - Putaway', 'Putaway ke rak (reach truck)', 'Operator Reach Truck', 'RT', 'palet', 30, 'inbound', 1, 17, tg('putaway', 'palet')),
  b('Inbound - Putaway', 'Putaway loose case ke shelving', 'Inventory Staff', 'Manual', 'karton', 900, 'inbound', 0, 19, tg('putaway', 'loose')),
  // Inventory
  b('Inventory', 'Cycle count', 'Stock Controller', 'RF', 'palet', 60, 'storage', 1, 22),
  b('Inventory', 'Admin inventory — input data produk / hasil cycle count', 'Inventory Controller', 'PC', 'line', 60, 'storage', 1, 26),
  b('Inventory', 'Admin inventory — input replenishment', 'Inventory Controller', 'PC', 'line', 60, 'outbound', 0.5, 26, tg('replenishment', 'semua')),
  b('Inventory', 'Replenishment — reach truck menurunkan barang', 'Operator Reach Truck', 'RT', 'palet', 20, 'outbound', 0.5, 23, tg('replenishment', 'palet')),
  b('Inventory', 'Replenishment loose case (manual)', 'Inventory Controller', 'Manual', 'karton', 300, 'outbound', 0, 24, tg('replenishment', 'loose')),
  // Outbound — picking
  b('Outbound - Picking', 'Admin outbound — input data picking', 'Outbound Admin', 'PC', 'order', 80, 'outbound', 1, 36),
  b('Outbound - Picking', 'Picking case (picker)', 'Picker', 'RF', 'karton', 220, 'outbound', 0.5, 29, tg('picking', 'loose')),
  b('Outbound - Picking', 'Picking palet dari rak (reach truck)', 'Operator Reach Truck', 'RT', 'palet', 22, 'outbound', 0.5, 28, tg('picking', 'palet')),
  b('Outbound - Picking', 'Pindah barang ke staging outbound', 'TKBM (Runner)', 'Hand Pallet', 'palet', 20, 'outbound', 1, 33),
  // Outbound — dispatching
  b('Outbound - Dispatching', 'Checker outbound — check produk', 'Checker', 'RF', 'palet', 60, 'outbound', 1, 38),
  b('Outbound - Dispatching', 'Loading ke mobil — curah / case (TKBM)', 'TKBM', 'Manual', 'karton', 300, 'outbound', 0.5, 45, tg('loading', 'loose')),
  b('Outbound - Dispatching', 'Loading ke mobil — paletan (forklift counterbalance)', 'Operator Forklift (CBT)', 'CBT', 'palet', 40, 'outbound', 0.5, 44, tg('loading', 'palet')),
  b('Outbound - Dispatching', 'Admin outbound — input barang keluar (goods issue)', 'Outbound Admin', 'PC', 'order', 60, 'outbound', 1, 37),
  b('Outbound - Dispatching', 'Admin outbound — print handover list', 'Outbound Admin', 'PC', 'order', 60, 'outbound', 1),
  b('Outbound - Dispatching', 'Checker — serahkan handover list ke driver (±5 mnt per mobil ≈ 10 palet)', 'Checker', 'Manual', 'palet', 120, 'outbound', 1),
];

/** Isi skema default; produktivitas & role mengikuti database bila productivityId-nya ada. */
export function skemaVsmDefault(prods: { id: number; prod_per_jam: number | string; role_name: string; tool: string; uom: string }[]): Baris[] {
  return VSM_DEFAULT.map(x => {
    const p = x.productivityId ? prods.find(y => y.id === x.productivityId) : undefined;
    return p ? { ...x, prodPerJam: Number(p.prod_per_jam) || x.prodPerJam } : { ...x };
  });
}

/** Tender lama dengan baris skema default (nama sama) tanpa tag → beri tag porsi agar ikut porsi palletize/loose. */
export function tagDariDefault<T extends Baris>(xs: T[]): T[] {
  return xs.map(x => x.porsiMuat ? x : (() => { const d = VSM_DEFAULT.find(y => y.aktivitas === x.aktivitas && y.porsiMuat); return d ? { ...x, porsiMuat: d.porsiMuat } : x; })());
}
