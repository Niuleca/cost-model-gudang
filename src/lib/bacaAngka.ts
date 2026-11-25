// Format angka aplikasi: titik = desimal, koma = pemisah ribuan (1,250.5) — konsisten di layar, PDF & Excel.
// Isian tetap menerima kebiasaan lain supaya keyboard HP berbahasa Indonesia (yang hanya punya koma) bisa dipakai.
export const LOKAL_ANGKA = 'en-US';

/**
 * Teks isian → teks angka standar ("1250.5").
 * - koma diikuti tepat 3 angka (1,250 / 1,250,000) = ribuan; koma lain (1,1 / 2,75) = desimal
 * - titik = desimal; beberapa titik berkelompok 3 angka (1.250.000) = ribuan
 * - ada titik dan koma: tanda yang paling belakang = desimal (1,250.5 atau 1.250,5)
 */
export function normalDesimal(x: string) {
  let t = x.trim().replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = /^-?[1-9]\d{0,2}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (/^-?[1-9]\d{0,2}(\.\d{3}){2,}$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  return t;
}
/** Teks isian → angka (null bila kosong / tidak terbaca). */
export function bacaAngka(x: string): number | null {
  const t = normalDesimal(x);
  if (t === '' || /^-?\.?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
