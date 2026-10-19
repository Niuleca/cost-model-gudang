// Porsi workload palletize vs loose per proses (unloading, putaway, replenishment, picking, loading).
// Aktivitas yang diberi tag porsiMuat mendapat % volume otomatis dari porsi ini.
export type ProsesMuat = 'unloading' | 'putaway' | 'replenishment' | 'picking' | 'loading';
export type JenisMuat = 'palet' | 'loose' | 'semua';
export interface TagPorsi { proses: ProsesMuat; muat: JenisMuat }
/** Porsi palletize (0..1) per proses; loose = 1 − palletize. */
export type PorsiMuat = Record<ProsesMuat, number>;

export const PROSES_MUAT: { v: ProsesMuat; l: string; ket: string }[] = [
  { v: 'unloading', l: 'Unloading', ket: 'barang masuk: palet (forklift CB) vs curah / loose case (TKBM)' },
  { v: 'putaway', l: 'Putaway', ket: 'palet ke rak (reach truck) vs loose case ke shelving' },
  { v: 'replenishment', l: 'Replenishment', ket: 'dari volume case picking: turun palet (reach truck) vs loose case (manual)' },
  { v: 'picking', l: 'Picking', ket: 'full palet (reach truck) vs case picking (picker)' },
  { v: 'loading', l: 'Loading', ket: 'muat paletan (forklift CB) vs curah / case (TKBM)' },
];
export const PORSI_MUAT_DEFAULT: PorsiMuat = { unloading: 0.5, putaway: 1, replenishment: 1, picking: 0.5, loading: 0.5 };

/** % volume aktivitas dari tag. Replenishment hanya terjadi untuk porsi case picking (1 − picking palet). */
export function persenDariPorsi(tag: TagPorsi, porsi?: Partial<PorsiMuat>) {
  const p = { ...PORSI_MUAT_DEFAULT, ...(porsi ?? {}) };
  const pal = Math.min(1, Math.max(0, Number(p[tag.proses]) || 0));
  const basis = tag.proses === 'replenishment' ? 1 - Math.min(1, Math.max(0, Number(p.picking) || 0)) : 1;
  return basis * (tag.muat === 'palet' ? pal : tag.muat === 'loose' ? 1 - pal : 1);
}

export function terapkanPorsiMuat<T extends { persenVolume: number; porsiMuat?: TagPorsi }>(aktivitas: T[], porsi?: Partial<PorsiMuat>): T[] {
  return (aktivitas ?? []).map(a => a.porsiMuat ? { ...a, persenVolume: persenDariPorsi(a.porsiMuat, porsi) } : a);
}

export const labelTag = (t: TagPorsi) => `${PROSES_MUAT.find(x => x.v === t.proses)?.l ?? t.proses} · ${t.muat === 'palet' ? 'palletize' : t.muat === 'loose' ? 'loose' : 'semua'}`;
export const OPSI_TAG: { k: string; t: TagPorsi }[] = PROSES_MUAT.flatMap(p => (['palet', 'loose', ...(p.v === 'replenishment' ? ['semua'] as const : [])] as JenisMuat[]).map(m => ({ k: `${p.v}:${m}`, t: { proses: p.v, muat: m } })));
