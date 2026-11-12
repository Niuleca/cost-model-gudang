// Layer denah 2D (seperti layer di CAD): tampil / sembunyi & kunci per kelompok komponen.
// Hanya memengaruhi editor 2D (tampilan, seleksi, ekspor PNG/PDF denah) — kapasitas & 3D tetap menghitung semua komponen.
import type { JenisKomp } from '@/lib/simulasi3d/editor';

export type KunciLapis = 'rak' | 'block' | 'staging' | 'kolom' | 'fasilitas' | 'dock' | 'jalur' | 'ukuran' | 'latar';
export interface StatusLapis { lihat: boolean; kunci: boolean }
export type Lapisan = Record<KunciLapis, StatusLapis>;

export const LAPISAN: { k: KunciLapis; label: string; warna: string; jenis: JenisKomp[] }[] = [
  { k: 'rak', label: 'Rak & area rak', warna: '#1e56a0', jenis: ['spr', 'ddr', 'areaRak'] },
  { k: 'block', label: 'Block stack', warna: '#a16207', jenis: ['block'] },
  { k: 'staging', label: 'Staging', warna: '#2563eb', jenis: ['stagingIn', 'stagingOut'] },
  { k: 'kolom', label: 'Kolom / grid pilar', warna: '#475569', jenis: ['kolom', 'areaKolom'] },
  { k: 'fasilitas', label: 'Office & loading dock', warna: '#6d28d9', jenis: ['fasilitas', 'platform'] },
  { k: 'dock', label: 'Dock & gate', warna: '#111827', jenis: ['dock', 'gate'] },
  { k: 'jalur', label: 'Jalur, ramp & zona', warna: '#d97706', jenis: ['jalur', 'zona'] },
  { k: 'ukuran', label: 'Garis ukur & lebar lorong', warna: '#7c3aed', jenis: [] },
  { k: 'latar', label: 'Latar denah / CAD', warna: '#94a3b8', jenis: [] },
];
export const LAPISAN_AWAL: Lapisan = Object.fromEntries(LAPISAN.map(l => [l.k, { lihat: true, kunci: false }])) as Lapisan;
export const lapisDari = (j: JenisKomp): KunciLapis => LAPISAN.find(l => l.jenis.includes(j))?.k ?? 'jalur';
