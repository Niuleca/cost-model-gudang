// Ikon sederhana tools / MHE untuk Landmark VSM (piktogram garis, tanpa merek).
import type { JenisIkon } from '@/lib/vsmSop';

const P: Record<JenisIkon, React.ReactNode> = {
  forklift: <><path d="M3 18V9h6l3 5v4" /><path d="M9 9V5h2" /><path d="M15 4v14h6" /><circle cx="6" cy="19" r="1.8" /><circle cx="12" cy="19" r="1.8" /></>,
  reach: <><path d="M5 19V8h5v11" /><path d="M14 3v16" /><path d="M14 19h7" /><path d="M10 12h4" /><circle cx="7.5" cy="20" r="1.5" /></>,
  handpallet: <><path d="M6 3l2 9" /><path d="M8 12h13v3H8z" /><circle cx="9" cy="18" r="1.6" /><circle cx="19" cy="18" r="1.6" /></>,
  rf: <><rect x="7" y="2.5" width="10" height="19" rx="2" /><rect x="9" y="5" width="6" height="5" /><path d="M9.5 13h1M13.5 13h1M9.5 16h1M13.5 16h1" /></>,
  scanner: <><path d="M4 6h12l2 4-6 3-2 8H7l1-8-4-2z" /><path d="M17 6l4-2" /></>,
  printer: <><rect x="4" y="8" width="16" height="9" rx="1.5" /><path d="M7 8V3h10v5" /><path d="M7 14h10v7H7z" /></>,
  timbangan: <><path d="M12 3v10" /><rect x="9" y="2" width="6" height="3" /><path d="M4 16h16v3H4z" /><path d="M6 19v2M18 19v2" /></>,
  meteran: <><circle cx="10" cy="12" r="7" /><circle cx="10" cy="12" r="2" /><path d="M17 15h5v3h-8" /></>,
  trolley: <><path d="M3 4h3l2 11h11" /><path d="M8 8h12l-1 5H9" /><circle cx="9" cy="19" r="1.6" /><circle cx="18" cy="19" r="1.6" /></>,
  pc: <><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M9 20h6M12 16v4" /></>,
  kertas: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 2h6v3H9z" /><path d="M8 10h8M8 14h8M8 18h5" /></>,
  truk: <><path d="M2 6h12v10H2z" /><path d="M14 9h4l3 4v3h-7" /><circle cx="6" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>,
  wrap: <><path d="M6 4h12v16H6z" /><path d="M6 8l12 4M6 13l12 4" /></>,
  orang: <><circle cx="12" cy="6" r="3" /><path d="M5 21v-4a7 7 0 0114 0v4" /></>,
};

export default function IkonAlat({ jenis, judul, ukuran = 22 }: { jenis: JenisIkon; judul?: string; ukuran?: number }) {
  return (
    <svg width={ukuran} height={ukuran} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={judul ?? jenis}>
      {judul && <title>{judul}</title>}
      {P[jenis]}
    </svg>
  );
}
