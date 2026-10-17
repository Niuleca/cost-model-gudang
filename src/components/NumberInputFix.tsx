'use client';
import { useEffect } from 'react';

/** Perbaikan global kolom angka: saat difokus isi terpilih (ketikan menimpa "0"), saat ditinggal nol di depan dibuang (011 → 11). */
export default function NumberInputFix() {
  useEffect(() => {
    const isNum = (t: EventTarget | null): t is HTMLInputElement => t instanceof HTMLInputElement && t.type === 'number';
    const onFocus = (e: FocusEvent) => { const t = e.target; if (isNum(t)) requestAnimationFrame(() => { try { t.select(); } catch { /* abaikan */ } }); };
    const rapikan = (t: HTMLInputElement) => {
      const v = t.value;
      if (/^-?0\d/.test(v)) {
        const bersih = String(Number(v));
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        set?.call(t, bersih);
        t.dispatchEvent(new Event('input', { bubbles: true }));   // beri tahu React
      }
    };
    const onInput = (e: Event) => { const t = e.target; if (isNum(t) && /^-?0\d/.test(t.value)) rapikan(t); };
    const onBlur = (e: FocusEvent) => { const t = e.target; if (isNum(t)) rapikan(t); };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('input', onInput, true);
    document.addEventListener('focusout', onBlur);
    return () => { document.removeEventListener('focusin', onFocus); document.removeEventListener('input', onInput, true); document.removeEventListener('focusout', onBlur); };
  }, []);
  return null;
}
