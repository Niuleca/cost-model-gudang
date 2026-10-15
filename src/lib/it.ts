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
  /** Untuk biaya sekali: 'amortisasi' = masuk tarif bulanan; 'tagih' = ditagih terpisah di quotation */
  perlakuanSekali?: 'amortisasi' | 'tagih';
  catatan?: string;
}

export interface ItSheet { kursUsd: number; nomorBap?: string; lines: ItLine[] }
export const IT_SHEET_DEFAULT: ItSheet = { kursUsd: 16000, lines: [] };

export interface RingkasIt {
  bulanan: number; tahunan: number; sekali: number;     // budget, Rupiah
  bulananAktual: number; tahunanAktual: number; sekaliAktual: number;
  setaraBulan: number;                                  // bulanan + tahunan/12 (budget)
  tagihSekali: { deskripsi: string; nilai: number }[];  // OTC yang ditagih terpisah
}

const rupiah = (l: ItLine, harga: number, kurs: number) => harga * (l.mataUang === 'USD' ? kurs : 1);

export function ringkasIt(s: ItSheet): RingkasIt {
  const r: RingkasIt = { bulanan: 0, tahunan: 0, sekali: 0, bulananAktual: 0, tahunanAktual: 0, sekaliAktual: 0, setaraBulan: 0, tagihSekali: [] };
  for (const l of s.lines) {
    const b = basisDari(l.costType);
    const nb = l.qty * rupiah(l, l.hargaBudget, s.kursUsd);
    const na = l.hargaAktual == null ? 0 : l.qty * rupiah(l, l.hargaAktual, s.kursUsd);
    if (b === 'Bulanan' || b === 'Transaksi') { r.bulanan += nb; r.bulananAktual += na; }
    else if (b === 'Tahunan') { r.tahunan += nb; r.tahunanAktual += na; }
    else {
      r.sekali += nb; r.sekaliAktual += na;
      if (l.perlakuanSekali === 'tagih' && nb > 0) r.tagihSekali.push({ deskripsi: `IT — ${l.item} (${l.qty} ${l.costType})`, nilai: nb });
    }
  }
  r.setaraBulan = r.bulanan + r.tahunan / 12;
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
    else if (l.perlakuanSekali !== 'tagih')
      out.push({ deskripsi: `IT — ${l.item}`, kelompok: 'IT', mode: 'sekali', qty: l.qty, hargaSatuan: harga, kategoriRisiko: risiko, alokasi, sumber });
  }
  return out;
}
