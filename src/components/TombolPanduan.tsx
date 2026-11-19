'use client';
// Satu tombol panduan: klik = baca PDF di tab baru; panah ▾ = pilih format (PDF untuk dibaca / Word untuk diunduh & diedit).
import { useEffect, useRef, useState } from 'react';

export default function TombolPanduan({ label = 'Panduan Leca' }: { label?: string }) {
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!buka) return;
    const tutup = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setBuka(false); };
    document.addEventListener('mousedown', tutup); document.addEventListener('keydown', tutup);
    return () => { document.removeEventListener('mousedown', tutup); document.removeEventListener('keydown', tutup); };
  }, [buka]);
  return (
    <div className="tombol-panduan" ref={ref}>
      <a className="btn ghost" href="/panduan-leca.pdf" target="_blank" rel="noopener" title="Baca panduan (PDF) di tab baru">📘 {label}</a>
      <button type="button" className="ghost" aria-haspopup="menu" aria-expanded={buka} aria-label="Pilih format panduan" onClick={() => setBuka(v => !v)}>▾</button>
      {buka && <div className="tombol-panduan-menu" role="menu">
        <a role="menuitem" href="/panduan-leca.pdf" target="_blank" rel="noopener" onClick={() => setBuka(false)}><b>Baca (PDF)</b><span className="small muted">buka di browser</span></a>
        <a role="menuitem" href="/panduan-leca.docx" download="Panduan_Leca.docx" onClick={() => setBuka(false)}><b>Unduh (Word)</b><span className="small muted">bisa diedit & dicetak</span></a>
      </div>}
    </div>
  );
}
