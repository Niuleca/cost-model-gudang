// Lembar kebutuhan IT per tender (format BAP KLOG) → baris biaya mesin hitung.
// Murni TypeScript, tanpa dependensi, supaya bisa diuji dengan node --test.
import type { CostLineInput, KategoriRisiko } from './engine/types.ts';

export type BasisIt = 'Bulanan' | 'Transaksi' | 'Tahunan' | 'Sekali';
export const COST_TYPES: { v: string; basis: BasisIt; ket: string }[] = [
  { v: 'PUPM', basis: 'Bulanan', ket: 'per user per bulan' },
  { v: 'PDPM', basis: 'Bulanan', ket: 'per device per bulan' },
  { v: 'Cost/Month', basis: 'Bulanan', ket: 'biaya per bulan' },
  { v: 'Monthly/Site', basis: 'Bulanan', ket: 'per site per bulan' },
  { v: 'Transaction/Month', basis: 'Transaksi', ket: 'per transaksi (slab)' },
  { v: 'Yearly', basis: 'Tahunan', ket: 'per tahun' },
  { v: 'OTC/Unit', basis: 'Sekali', ket: 'one time charge per unit' },
  { v: 'OTC', basis: 'Sekali', ket: 'one time charge' },
  { v: 'Cost/Mandays', basis: 'Sekali', ket: 'per mandays (development)' },
];
export const KELOMPOK_IT = [
  'Software - WMS Solution', 'Hardware & Device', 'Networking Cabling', 'Networking Device', 'Other Devices',
  'Development & Interface', 'CCTV', 'Connection', 'Software TMIS', 'Hardware TMS', 'Mobile Devices TMS', 'Development TMS',
];
export const basisDari = (costType: string): BasisIt => COST_TYPES.find(c => c.v === costType)?.basis ?? 'Bulanan';

export interface ItLine {
  catalogId?: number;
  kelompok: string;
  item: string;
  costType: string;
  qty: number;                 // unit / user / device / transaksi per bulan / mandays
  hargaBudget: number;         // dalam mata uang baris
  hargaAktual?: number | null; // diisi setelah realisasi (BAP)
  mataUang?: 'IDR' | 'USD';
  /** Biaya sekali: 'depresiasi' = aset, disusutkan selama umur ekonomis (maks. kontrak);
   *  'amortisasi' = dibagi rata selama kontrak; 'tagih' = ditagih terpisah di quotation */
  perlakuanSekali?: PerlakuanSekali;
  umurBulan?: number;          // umur ekonomis untuk depresiasi
  catatan?: string;
}

export type PerlakuanSekali = 'depresiasi' | 'amortisasi' | 'tagih';
/** Kelompok berupa perangkat fisik → default didepresiasi; lainnya (development, cabling, connection) diamortisasi. */
export const KELOMPOK_ASET = ['Hardware & Device', 'Networking Device', 'Other Devices', 'CCTV', 'Hardware TMS', 'Mobile Devices TMS'];
export const UMUR_IT_DEFAULT = 36;
export const perlakuanDefault = (kelompok: string): PerlakuanSekali => KELOMPOK_ASET.includes(kelompok) ? 'depresiasi' : 'amortisasi';
export const perlakuanDari = (l: ItLine): PerlakuanSekali => l.perlakuanSekali ?? perlakuanDefault(l.kelompok);

export interface ItSheet { kursUsd: number; nomorBap?: string; lines: ItLine[] }
export const IT_SHEET_DEFAULT: ItSheet = { kursUsd: 16000, lines: [] };

export interface RingkasIt {
  bulanan: number; tahunan: number; sekali: number;     // budget, Rupiah
  bulananAktual: number; tahunanAktual: number; sekaliAktual: number;
  setaraBulan: number;                                  // bulanan + tahunan/12 (budget)
  depresiasiBulan: number; amortisasiBulan: number; bungaBulan: number;
  totalBulan: number;                                   // setara bulan + depresiasi + amortisasi + bunga modal
  nilaiAset: number; nilaiAmortisasi: number; nilaiTagih: number;
  tagihSekali: { deskripsi: string; nilai: number }[];  // OTC yang ditagih terpisah
}

const rupiah = (l: ItLine, harga: number, kurs: number) => harga * (l.mataUang === 'USD' ? kurs : 1);

export interface OpsiIt { kontrakBulan: number; bungaTahun: number }
export const OPSI_IT_DEFAULT: OpsiIt = { kontrakBulan: 36, bungaTahun: 0.1 };

/** Biaya per bulan satu baris (sama dengan mesin hitung: depresiasi selama min(umur, kontrak) + bunga atas rata-rata nilai buku). */
export function biayaBulanIt(l: ItLine, kurs: number, o: OpsiIt = OPSI_IT_DEFAULT) {
  const b = basisDari(l.costType);
  const nilai = l.qty * rupiah(l, l.hargaBudget, kurs);
  const n = Math.max(1, o.kontrakBulan || 1), r = o.bungaTahun / 12;
  if (b === 'Bulanan' || b === 'Transaksi') return { jenis: 'Bulanan', nilai, pokok: nilai, bunga: 0, total: nilai, periode: 1 };
  if (b === 'Tahunan') return { jenis: 'Tahunan ÷ 12', nilai, pokok: nilai / 12, bunga: 0, total: nilai / 12, periode: 12 };
  const p = perlakuanDari(l);
  if (p === 'tagih') return { jenis: 'Tagih terpisah', nilai, pokok: 0, bunga: 0, total: 0, periode: 0 };
  const periode = p === 'depresiasi' ? Math.min(Math.max(1, l.umurBulan || UMUR_IT_DEFAULT), n) : n;
  const pokok = nilai / periode, bunga = (nilai / 2) * r;
  return { jenis: p === 'depresiasi' ? 'Depresiasi' : 'Amortisasi', nilai, pokok, bunga, total: pokok + bunga, periode };
}

export function ringkasIt(s: ItSheet, o: OpsiIt = OPSI_IT_DEFAULT): RingkasIt {
  const r: RingkasIt = { bulanan: 0, tahunan: 0, sekali: 0, bulananAktual: 0, tahunanAktual: 0, sekaliAktual: 0, setaraBulan: 0,
    depresiasiBulan: 0, amortisasiBulan: 0, bungaBulan: 0, totalBulan: 0, nilaiAset: 0, nilaiAmortisasi: 0, nilaiTagih: 0, tagihSekali: [] };
  for (const l of s.lines) {
    const b = basisDari(l.costType);
    const nb = l.qty * rupiah(l, l.hargaBudget, s.kursUsd);
    const na = l.hargaAktual == null ? 0 : l.qty * rupiah(l, l.hargaAktual, s.kursUsd);
    if (b === 'Bulanan' || b === 'Transaksi') { r.bulanan += nb; r.bulananAktual += na; }
    else if (b === 'Tahunan') { r.tahunan += nb; r.tahunanAktual += na; }
    else {
      r.sekali += nb; r.sekaliAktual += na;
      const p = perlakuanDari(l), c = biayaBulanIt(l, s.kursUsd, o);
      if (p === 'tagih') { r.nilaiTagih += nb; if (nb > 0) r.tagihSekali.push({ deskripsi: `IT — ${l.item} (${l.qty} ${l.costType})`, nilai: nb }); }
      else if (p === 'depresiasi') { r.nilaiAset += nb; r.depresiasiBulan += c.pokok; r.bungaBulan += c.bunga; }
      else { r.nilaiAmortisasi += nb; r.amortisasiBulan += c.pokok; r.bungaBulan += c.bunga; }
    }
  }
  r.setaraBulan = r.bulanan + r.tahunan / 12;
  r.totalBulan = r.setaraBulan + r.depresiasiBulan + r.amortisasiBulan + r.bungaBulan;
  return r;
}

/** Ubah lembar IT menjadi baris biaya mesin hitung (kelompok IT). */
export function itKeCostLines(s: ItSheet, risiko: KategoriRisiko = 'Rendah'): CostLineInput[] {
  const out: CostLineInput[] = [];
  const alokasi = { manajemen: 1 };                       // IT = biaya bersama, disebar ke bucket operasi
  for (const l of s.lines) {
    if (!(l.qty > 0) || !(l.hargaBudget > 0)) continue;
    const b = basisDari(l.costType);
    const harga = rupiah(l, l.hargaBudget, s.kursUsd);
    const sumber = `IT ${l.costType}${l.mataUang === 'USD' ? ` · USD×${s.kursUsd}` : ''}`;
    if (b === 'Bulanan' || b === 'Transaksi')
      out.push({ deskripsi: `IT — ${l.item}`, kelompok: 'IT', mode: 'bulanan', qty: l.qty, hargaSatuan: harga, kategoriRisiko: risiko, alokasi, sumber });
    else if (b === 'Tahunan')
      out.push({ deskripsi: `IT — ${l.item} (tahunan ÷ 12)`, kelompok: 'IT', mode: 'bulanan', qty: l.qty, hargaSatuan: harga / 12, kategoriRisiko: risiko, alokasi, sumber });
    else if (perlakuanDari(l) === 'depresiasi')
      out.push({ deskripsi: `IT — ${l.item}`, kelompok: 'IT', mode: 'beli', qty: l.qty, hargaSatuan: harga, umurBulan: l.umurBulan || UMUR_IT_DEFAULT, kategoriRisiko: risiko, alokasi, sumber });
    else if (perlakuanDari(l) === 'amortisasi')
      out.push({ deskripsi: `IT — ${l.item}`, kelompok: 'IT', mode: 'sekali', qty: l.qty, hargaSatuan: harga, kategoriRisiko: risiko, alokasi, sumber });
  }
  return out;
}
