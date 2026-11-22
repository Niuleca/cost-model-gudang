'use client';
// Simple CM: setiap tabel (.tablewrap) di dalam `akar` mendapat tombol "⤢ Perbesar" saat kursor di atasnya → tabel dibuka di pop-up besar.
// Keterangan (p.small.muted / .klem) dipendekkan jadi satu baris — klik untuk membaca selengkapnya.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function PerbesarTabel({ akar }: { akar: React.RefObject<HTMLElement | null> }) {
  const [sasaran, setSasaran] = useState<{ el: HTMLElement; top: number; right: number } | null>(null);
  const [buka, setBuka] = useState<{ judul: string; klon: HTMLElement } | null>(null);
  const isiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = akar.current; if (!root) return;
    const over = (e: MouseEvent) => {
      const t = (e.target as HTMLElement | null)?.closest?.('.tablewrap') as HTMLElement | null;
      if (!t || !root.contains(t) || t.closest('.pb-modal')) { setSasaran(s => (s ? null : s)); return; }
      const r = t.getBoundingClientRect();
      setSasaran(s => (s && s.el === t && Math.abs(s.top - r.top) < 1 && Math.abs(s.right - r.right) < 1 ? s : { el: t, top: r.top, right: r.right }));
    };
    const klik = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.closest('a, button, input, select, textarea, label, [role="button"]')) return;
      const p = t.closest('p.small.muted, .klem') as HTMLElement | null;
      if (p && root.contains(p)) p.classList.toggle('buka');
    };
    const hilang = () => setSasaran(s => (s ? null : s));
    root.addEventListener('mouseover', over);
    root.addEventListener('click', klik);
    window.addEventListener('scroll', hilang, true);
    window.addEventListener('resize', hilang);
    return () => {
      root.removeEventListener('mouseover', over); root.removeEventListener('click', klik);
      window.removeEventListener('scroll', hilang, true); window.removeEventListener('resize', hilang);
    };
  }, [akar]);

  useEffect(() => {
    if (!buka) return;
    isiRef.current?.replaceChildren(buka.klon);
    const lama = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBuka(null); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = lama; window.removeEventListener('keydown', esc); };
  }, [buka]);

  const perbesar = () => {
    const el = sasaran?.el; if (!el) return;
    const klon = el.cloneNode(true) as HTMLElement;
    // isian (input / select) diganti teks nilainya supaya tampil apa adanya
    const asli = el.querySelectorAll('input, select, textarea'), tiru = klon.querySelectorAll('input, select, textarea');
    asli.forEach((a, i) => {
      const t = tiru[i]; if (!t) return;
      const s = document.createElement('span'); s.className = 'pb-nilai';
      if (a instanceof HTMLSelectElement) s.textContent = a.selectedOptions[0]?.textContent ?? '';
      else if (a instanceof HTMLInputElement && (a.type === 'checkbox' || a.type === 'radio')) s.textContent = a.checked ? '✓' : '–';
      else s.textContent = (a as HTMLInputElement).value || '';
      t.replaceWith(s);
    });
    // tombol aksi (Revisi, Hapus, Tambah …) dibuang; tombol yang berisi label (nama kategori, tautan) dijadikan teks biasa
    klon.querySelectorAll('button, [role="button"]').forEach(b => {
      const teks = (b.textContent ?? '').trim();
      const aksi = b.classList.contains('sc-revisi') || b.classList.contains('danger') || /^(revisi|hapus|[×✕+＋])/i.test(teks) || !teks;
      if (aksi) { b.remove(); return; }
      const s = document.createElement('span'); s.className = b.className; s.innerHTML = b.innerHTML; b.replaceWith(s);
    });
    klon.classList.add('pb-tabel');
    const judul = el.closest('.card, .gf')?.querySelector('h2, h3, .gf-judul b')?.textContent?.trim()
      || document.querySelector('.wiz-judul')?.textContent?.trim() || 'Tabel';
    setSasaran(null);
    setBuka({ judul, klon });
  };

  if (typeof document === 'undefined') return null;
  return <>
    {sasaran && !buka && createPortal(<button type="button" className="pb-tombol" title="Perbesar tabel (pop-up)" aria-label="Perbesar tabel"
      style={{ top: sasaran.top > 70 ? sasaran.top - 24 : sasaran.top + 2, left: sasaran.right - 92 }}
      onMouseDown={e => e.preventDefault()} onClick={perbesar}>⤢ Perbesar</button>, document.body)}
    {buka && createPortal(<div className="pb-lapis" onMouseDown={e => { if (e.target === e.currentTarget) setBuka(null); }}>
      <div className="pb-modal" role="dialog" aria-modal="true" aria-label={buka.judul}>
        <div className="pb-kepala"><div><div className="small muted">Tampilan besar</div><h2 style={{ margin: 0 }}>{buka.judul}</h2></div>
          <span style={{ flex: 1 }} /><button type="button" className="ghost" onClick={() => setBuka(null)}>✕ Tutup</button></div>
        <div ref={isiRef} />
      </div></div>, document.body)}
  </>;
}
