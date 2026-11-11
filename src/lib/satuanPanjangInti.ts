// Inti satuan panjang (tanpa React) — dipakai juga oleh pesan / teks yang dibuat di lib (mis. peringatan produk).
export type SatuanPanjang = 'm' | 'cm' | 'mm';
export const KE_MM: Record<SatuanPanjang, number> = { m: 1000, cm: 10, mm: 1 };
export const DESIMAL: Record<SatuanPanjang, number> = { m: 3, cm: 1, mm: 0 };
export const konversiPanjang = (nilai: number, dari: SatuanPanjang, ke: SatuanPanjang) => (Number(nilai) || 0) * KE_MM[dari] / KE_MM[ke];

let aktif: SatuanPanjang = 'm';
/** Diatur oleh SatuanProvider saat pengguna memilih satuan di header. */
export const aturSatuanAktif = (s: SatuanPanjang) => { aktif = s; };
export const satuanAktif = () => aktif;
/** Teks panjang dalam satuan aktif, mis. pj(1064, 'mm') → "1,064 m" bila satuan meter. */
export function pj(nilai: number, basis: SatuanPanjang, desimal?: number) {
  const x = konversiPanjang(nilai, basis, aktif);
  return `${x.toLocaleString('id-ID', { maximumFractionDigits: desimal ?? DESIMAL[aktif] })} ${aktif}`;
}
/** Dua dimensi "a × b satuan". */
export const pj2 = (a: number, b: number, basis: SatuanPanjang) => `${pj(a, basis).replace(/ \S+$/, '')} × ${pj(b, basis)}`;
