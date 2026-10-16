// Biaya lain dikelompokkan per klasifikasi (mengikuti kategori Price Inquiry), bukan dicampur dalam satu tabel.
import type { CostLineInput, Kelompok } from './engine/types';

export type ModeBiaya = CostLineInput['mode'];
export interface Seksi { id: string; label: string; ket: string; kategori: string[]; kelompok: Kelompok; mode: ModeBiaya }

export const SEKSI_BIAYA: Seksi[] = [
  { id: 'office', label: 'Office (furniture & peralatan kantor)', ket: 'Aset kantor — default beli, disusutkan', kategori: ['Office', 'Rental Office', 'Printer'], kelompok: 'Office', mode: 'beli' },
  { id: 'atk', label: 'Stationery / ATK', ket: 'Habis pakai — qty per bulan', kategori: ['ATK'], kelompok: 'Consumable', mode: 'bulanan' },
  { id: 'consumable', label: 'Consumable gudang (seragam, konsumsi, wrapping)', ket: 'Habis pakai — qty per bulan', kategori: ['Consumable', 'Seragam', 'Konsumsi'], kelompok: 'Consumable', mode: 'bulanan' },
  { id: 'palet', label: 'Pallet', ket: 'Beli (disusutkan) atau sewa per bulan', kategori: ['Palet'], kelompok: 'Consumable', mode: 'beli' },
  { id: 'hse', label: 'HSE & Fire Protection', ket: 'APAR, P3K, rambu, APD — default beli', kategori: ['HSE'], kelompok: 'HSE', mode: 'beli' },
  { id: 'services', label: 'Services (pest control, security, cleaning)', ket: 'Kontrak jasa per bulan', kategori: ['Pest Control', 'Security', 'Cleaning'], kelompok: 'Lainnya', mode: 'bulanan' },
  { id: 'asuransi', label: 'Asuransi', ket: 'Premi per bulan', kategori: ['Asuransi'], kelompok: 'Asuransi', mode: 'bulanan' },
  { id: 'startup', label: 'Startup & konstruksi (one time)', ket: 'Biaya sekali — diamortisasi selama kontrak', kategori: ['Konstruksi'], kelompok: 'Startup', mode: 'sekali' },
  { id: 'lainnya', label: 'Lainnya', ket: 'Item manual di luar klasifikasi di atas', kategori: [], kelompok: 'Lainnya', mode: 'bulanan' },
];

const KELOMPOK_KE_SEKSI: Partial<Record<Kelompok, string>> = { Office: 'office', Consumable: 'atk', HSE: 'hse', Asuransi: 'asuransi', Startup: 'startup' };

/** Seksi sebuah baris: tersimpan → kategori item harga → kelompok lama → lainnya. */
export function seksiDari(c: CostLineInput & { seksi?: string; priceItemId?: number }, kategoriItem?: string): string {
  if (c.seksi && SEKSI_BIAYA.some(s => s.id === c.seksi)) return c.seksi;
  if (kategoriItem) { const s = SEKSI_BIAYA.find(x => x.kategori.includes(kategoriItem)); if (s) return s.id; }
  return KELOMPOK_KE_SEKSI[c.kelompok] ?? 'lainnya';
}

/** Biaya per bulan, sama dengan mesin hitung: beli = nilai ÷ min(umur, kontrak) + bunga; sekali = nilai ÷ kontrak + bunga. */
export function biayaBulanBaris(c: CostLineInput, kontrakBulan: number, bungaTahun: number) {
  const nilai = (c.qty || 0) * (c.hargaSatuan || 0);
  const n = Math.max(1, kontrakBulan || 1), r = bungaTahun / 12;
  if (c.mode === 'bulanan' || c.mode === 'sewa') return { nilai, pokok: nilai, bunga: 0, total: nilai, periode: 1 };
  const periode = c.mode === 'beli' ? Math.min(c.umurBulan && c.umurBulan > 0 ? c.umurBulan : n, n) : n;
  const pokok = nilai / periode, bunga = (nilai / 2) * r;
  return { nilai, pokok, bunga, total: pokok + bunga, periode };
}

/** Harga satuan yang sesuai mode dari item harga. */
export function hargaUntukMode(it: { harga_beli: number | null; harga_sewa_bulan: number | null }, mode: ModeBiaya) {
  const beli = it.harga_beli, sewa = it.harga_sewa_bulan;
  return Number((mode === 'sewa' ? sewa ?? beli : mode === 'bulanan' ? sewa ?? beli : beli ?? sewa) ?? 0);
}
