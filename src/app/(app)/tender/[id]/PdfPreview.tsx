'use client';
import { useEffect, useRef, useState } from 'react';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJs = any;
let muatPdfJs: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  muatPdfJs ??= new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = PDFJS; sc.async = true;
    sc.onload = () => { w.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; res(w.pdfjsLib); };
    sc.onerror = () => { muatPdfJs = null; rej(new Error('Gagal memuat penampil PDF')); };
    document.head.appendChild(sc);
  });
  return muatPdfJs;
}

/** Pratinjau PDF di halaman (halaman dirender ke canvas — jalan juga di Chrome Android yang tidak bisa menampilkan PDF inline). */
export default function PdfPreview({ blob, judul, onTutup, onUnduh }: { blob: Blob; judul: string; onTutup: () => void; onUnduh: () => void }) {
  const wadah = useRef<HTMLDivElement>(null);
  const [pesan, setPesan] = useState<string | null>('Menyiapkan pratinjau…');
  const [halaman, setHalaman] = useState(0);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const lib = await pdfjs();
        const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        if (batal || !wadah.current) return;
        wadah.current.innerHTML = '';
        const lebar = Math.min(wadah.current.clientWidth || 800, 900);
        for (let i = 1; i <= doc.numPages; i++) {
          const pg = await doc.getPage(i);
          const v1 = pg.getViewport({ scale: 1 });
          const skala = lebar / v1.width, dpr = Math.min(2, window.devicePixelRatio || 1);
          const vp = pg.getViewport({ scale: skala * dpr });
          const c = document.createElement('canvas');
          c.width = vp.width; c.height = vp.height; c.style.width = `${lebar}px`; c.className = 'pv-hal';
          await pg.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
          if (batal) return;
          wadah.current.appendChild(c);
        }
        setHalaman(doc.numPages); setPesan(null);
      } catch (e) {
        setPesan(`${e instanceof Error ? e.message : 'Gagal menampilkan pratinjau'} — gunakan Unduh PDF.`);
      }
    })();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onTutup(); };
    document.addEventListener('keydown', esc); document.body.style.overflow = 'hidden';
    return () => { batal = true; document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [blob]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pv-latar" role="dialog" aria-modal="true" aria-label={`Pratinjau ${judul}`} onClick={e => { if (e.target === e.currentTarget) onTutup(); }}>
      <div className="pv-kotak">
        <div className="pv-bar">
          <b className="satu-baris">{judul}</b>
          <span className="small muted">{halaman ? `${halaman} halaman` : ''}</span>
          <span style={{ flex: 1 }} />
          <button className="ghost" onClick={onUnduh}>Unduh PDF</button>
          <button onClick={onTutup}>Tutup</button>
        </div>
        {pesan && <p className="small" role="status" style={{ padding: 16 }}>{pesan}</p>}
        <div ref={wadah} className="pv-isi" />
      </div>
    </div>);
}
