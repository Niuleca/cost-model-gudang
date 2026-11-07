// Air bersih (Utilities Management → Water). Di kawasan industri / PDAM air umumnya berbayar per m³.
// Kebutuhan dasar: SNI 03-7065-2005 (tata cara perencanaan sistem plambing) — pekerja/kantor ±50 L/orang/hari.
import type { CostLineInput } from './engine/types';

export type SumberAir = 'pdam' | 'kawasan' | 'sumur' | 'termasuk_sewa';
export interface AirInput {
  sumber: SumberAir;
  literOrangHari: number;      // kebutuhan per orang per hari kerja
  literM2Hari: number;         // pembersihan lantai / toilet / area per m² per hari kerja
  tarifM3: number;             // Rp per m³
  abonemenBulan: number;       // biaya beban tetap per bulan (meter, pemeliharaan)
  // nilai dari tab lain (disimpan supaya mesin hitung tidak perlu menghitung ulang headcount)
  headcount?: number; luasM2?: number; hariKerjaBulan?: number;
}

export const SUMBER_AIR: Record<SumberAir, { l: string; berbayar: boolean; ket: string }> = {
  pdam: { l: 'PDAM', berbayar: true, ket: 'Tarif per m³ golongan niaga / industri, ditambah biaya beban meter.' },
  kawasan: { l: 'Pengelola kawasan industri', berbayar: true, ket: 'Ditagih pengelola kawasan per m³ (umumnya lebih tinggi dari PDAM).' },
  sumur: { l: 'Sumur bor / air tanah', berbayar: true, ket: 'Pajak air tanah (per m³) + listrik pompa + perawatan.' },
  termasuk_sewa: { l: 'Termasuk sewa gudang', berbayar: false, ket: 'Tidak dihitung terpisah — pastikan tertulis di kontrak sewa.' },
};

export const AIR_DEFAULT: AirInput = { sumber: 'kawasan', literOrangHari: 50, literM2Hari: 0.2, tarifM3: 15000, abonemenBulan: 150000 };

export function hitungAir(a: AirInput) {
  const s = SUMBER_AIR[a.sumber] ?? SUMBER_AIR.kawasan;
  const hari = a.hariKerjaBulan ?? 25, orang = a.headcount ?? 0, luas = a.luasM2 ?? 0;
  const m3Orang = (orang * a.literOrangHari * hari) / 1000;
  const m3Area = (luas * a.literM2Hari * hari) / 1000;
  const m3Bulan = m3Orang + m3Area;
  const biayaBulan = s.berbayar ? m3Bulan * a.tarifM3 + a.abonemenBulan : 0;
  return { berbayar: s.berbayar, m3Orang, m3Area, m3Bulan, biayaBulan };
}

/** Baris biaya air untuk mesin hitung (kelompok Utilitas). Kosong bila air termasuk sewa. */
export function airKeCostLines(a?: AirInput | null): CostLineInput[] {
  if (!a) return [];
  const h = hitungAir(a); if (!h.berbayar || h.biayaBulan <= 0) return [];
  const sumber = SUMBER_AIR[a.sumber].l;
  return [{ deskripsi: `Water — ${sumber} (${Math.round(h.m3Bulan)} m³/bln)`, kelompok: 'Utilitas', mode: 'bulanan', qty: 1, hargaSatuan: Math.round(h.biayaBulan),
    kategoriRisiko: 'Sedang', sumber: `${Math.round(h.m3Bulan)} m³ × Rp${a.tarifM3.toLocaleString('id-ID')} + beban Rp${a.abonemenBulan.toLocaleString('id-ID')}` }];
}
