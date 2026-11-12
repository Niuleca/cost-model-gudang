'use client';
// Satuan panjang global (m / cm / mm) — satu pilihan di header berlaku untuk semua isian & tampilan panjang di web.
// Data tetap disimpan dalam satuan dasarnya masing-masing (mis. palet m, tinggi rak mm, dimensi produk cm/mm);
// konversi hanya di tampilan sehingga data lama & export Excel tidak berubah.
import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type InputHTMLAttributes } from 'react';

import { DESIMAL, aturSatuanAktif, konversiPanjang, type SatuanPanjang } from '@/lib/satuanPanjangInti';
export { DESIMAL, konversiPanjang, type SatuanPanjang };
export const SATUAN_PANJANG: { v: SatuanPanjang; l: string }[] = [{ v: 'm', l: 'm' }, { v: 'cm', l: 'cm' }, { v: 'mm', l: 'mm' }];
const bulat = (x: number, d: number) => { const f = 10 ** d; return Math.round(x * f) / f; };

const KUNCI = 'leca.satuanPanjang';
const Ctx = createContext<{ satuan: SatuanPanjang; setSatuan: (s: SatuanPanjang) => void }>({ satuan: 'm', setSatuan: () => {} });

export function SatuanProvider({ children }: { children: React.ReactNode }) {
  const [satuan, setS] = useState<SatuanPanjang>('m');
  useEffect(() => { try { const s = localStorage.getItem(KUNCI) as SatuanPanjang | null; if (s && ['m', 'cm', 'mm'].includes(s)) { aturSatuanAktif(s); setS(s); } } catch { /* abaikan */ } }, []);
  const setSatuan = useCallback((s: SatuanPanjang) => { aturSatuanAktif(s); setS(s); try { localStorage.setItem(KUNCI, s); } catch { /* abaikan */ } }, []);
  return <Ctx.Provider value={{ satuan, setSatuan }}>{children}</Ctx.Provider>;
}

/** Satuan aktif + konversi dari / ke satuan dasar sebuah field. */
export function useSatuanPanjang() {
  const { satuan, setSatuan } = useContext(Ctx);
  /** nilai dalam satuan dasar → angka tampilan (dibulatkan sesuai satuan aktif) */
  const tampil = useCallback((nilai: number, basis: SatuanPanjang, desimal = DESIMAL[satuan]) => bulat(konversiPanjang(nilai, basis, satuan), desimal), [satuan]);
  /** angka yang diketik (satuan aktif) → satuan dasar */
  const simpan = useCallback((nilai: number, basis: SatuanPanjang) => konversiPanjang(nilai, satuan, basis), [satuan]);
  /** teks berformat Indonesia + satuan, mis. "1,2 m" / "1.200 mm" */
  const fmt = useCallback((nilai: number, basis: SatuanPanjang, opt: { tanpaSatuan?: boolean; desimal?: number } = {}) => {
    const x = konversiPanjang(nilai, basis, satuan);
    const s = x.toLocaleString('id-ID', { maximumFractionDigits: opt.desimal ?? DESIMAL[satuan] });
    return opt.tanpaSatuan ? s : `${s} ${satuan}`;
  }, [satuan]);
  return { satuan, setSatuan, tampil, simpan, fmt };
}

/**
 * Isian panjang: menampilkan & menerima angka dalam satuan aktif, menyimpan dalam satuan dasar `basis`.
 * `kosong`: isian boleh dikosongkan (nilai null) — dipakai untuk override "kosong = otomatis".
 */
export function InputPanjang({ nilai, basis, onNilai, kosong, style, placeholderDasar, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  nilai: number | null | undefined; basis: SatuanPanjang; onNilai: (v: number | null) => void; kosong?: boolean; style?: CSSProperties;
  /** placeholder dalam satuan dasar (dikonversi ke satuan aktif), mis. nilai otomatis */
  placeholderDasar?: number | null;
}) {
  const { satuan, tampil, simpan } = useSatuanPanjang();
  const keTeks = (v: number | null | undefined) => (v == null || (kosong && !Number(v)) ? '' : String(tampil(Number(v), basis)));
  const [teks, setTeks] = useState(keTeks(nilai));
  // sinkron bila nilai berubah dari luar atau satuan diganti
  useEffect(() => {
    const n = Number(teks.replace(',', '.'));
    const dariTeks = teks === '' ? null : simpan(n, basis);
    const beda = nilai == null || (kosong && !Number(nilai)) ? teks !== '' : dariTeks == null || Math.abs(dariTeks - Number(nilai)) > 1e-9 * Math.max(1, Math.abs(Number(nilai)));
    if (beda) setTeks(keTeks(nilai));
  }, [nilai, satuan]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input {...rest} type="number" step="any" inputMode="decimal" value={teks}
    placeholder={placeholderDasar != null && Number.isFinite(placeholderDasar) ? String(tampil(placeholderDasar, basis)) : rest.placeholder}
    style={style}
    onChange={e => {
      const x = e.target.value; setTeks(x);
      if (x === '') { onNilai(kosong ? null : 0); return; }
      const n = Number(x.replace(',', '.')); if (Number.isFinite(n)) onNilai(simpan(n, basis));
    }} />;
}

/** Pilihan satuan panjang (dipakai di header). */
export function PilihSatuanPanjang({ className }: { className?: string }) {
  const { satuan, setSatuan } = useSatuanPanjang();
  return <label className={className} title="Satuan panjang untuk semua isian & tampilan (m / cm / mm)"><span aria-hidden="true">📏</span>
    <select aria-label="Satuan panjang" value={satuan} onChange={e => setSatuan(e.target.value as SatuanPanjang)}>
      {SATUAN_PANJANG.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select></label>;
}
