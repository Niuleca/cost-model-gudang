'use client';
// Pengganti <input type="number">: keyboard angka di HP berbahasa Indonesia hanya punya koma (",") sebagai desimal,
// sedangkan input type="number" menolak koma → "1,1" tidak bisa diketik. Komponen ini input teks (inputMode decimal)
// yang menerima koma ATAU titik sebagai desimal; onChange tetap menerima e.target.value yang sudah dinormalisasi ("1.1").
import { useEffect, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';

/** "1,1" → "1.1"; "1.250,5" → "1250.5" (titik = ribuan bila ada koma). */
export function normalDesimal(x: string) {
  let t = x.trim().replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '');
  return t.replace(',', '.');
}
/** Teks angka setengah jadi ("-", ".", "1,") yang belum perlu diteruskan / tidak boleh menimpa ketikan. */
const setengah = (n: string) => n === '-' || n === '.' || n === '-.';
const sama = (teks: string, value: unknown) => {
  const n = normalDesimal(teks);
  if (value == null || value === '') return n === '' || setengah(n);
  return n !== '' && !setengah(n) && Number(n) === Number(value);
};

/** Event dengan e.target.value ternormalisasi (koma → titik) supaya handler lama (Number(e.target.value)) tetap benar. */
function eventNormal<E extends { target: EventTarget }>(e: E, n: string): E {
  const el = e.target as HTMLInputElement;
  const target = new Proxy(el, {
    get(o, k) {
      if (k === 'value') return n;
      if (k === 'valueAsNumber') return n === '' ? NaN : Number(n);
      const v = Reflect.get(o, k, o);
      return typeof v === 'function' ? v.bind(o) : v;
    },
  });
  return Object.create(e, { target: { value: target }, currentTarget: { value: target } }) as E;
}

export default function InputDesimal({ value, onChange, onBlur, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const keTeks = (v: unknown) => (v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '' : String(v));
  const [teks, setTeks] = useState(keTeks(value));
  // nilai dari luar berubah (bukan karena ketikan ini) → tampilkan nilai baru
  // kolom dikosongkan saat mengetik & induk mengisi 0 → tetap kosong (tidak jadi "0" lalu "01,1")
  useEffect(() => { if (!sama(teks, value) && !(teks.trim() === '' && Number(value) === 0)) setTeks(keTeks(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input {...rest} type="text" inputMode="decimal" autoComplete="off" className={className ? `${className} input-angka` : 'input-angka'} value={teks}
    onChange={(e: ChangeEvent<HTMLInputElement>) => {
      const x = e.target.value;
      if (!/^[-\d.,\s]*$/.test(x)) return;            // huruf ditolak, seperti input angka biasa
      setTeks(x);
      const n = normalDesimal(x);
      if (setengah(n) || !onChange) return;
      onChange(eventNormal(e, n));
    }}
    onBlur={e => {
      // rapikan sisa ketikan ("1," / "-") atau nilai yang dibatasi dari luar
      if (!sama(teks, value) || /[.,]$/.test(teks.trim()) || teks.trim() === '') setTeks(keTeks(value));
      onBlur?.(eventNormal(e, normalDesimal(e.target.value)));
    }} />;
}
