// PDF A4 dari blok dokumen sederhana (sama dengan buatDocx) — dipakai SOP Landmark VSM.
import type { BlokDocx } from '@/lib/docxSederhana';

// Font standar PDF (WinAnsi) tidak punya beberapa simbol → ganti padanan teks
const aman = (s: string) => s.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/▲/g, '^').replace(/[→⟶]/g, '->').replace(/[←]/g, '<-').replace(/✓/g, 'v').replace(/✗|✕/g, 'x')
  .replace(/²/g, '2').replace(/³/g, '3').replace(/[📎]/g, '').replace(/[^\x00-\xFF—–‘’“”•…€]/g, '');
const bersih = (b: BlokDocx): BlokDocx => {
  if (b.t === 'list') return { ...b, item: b.item.map(aman) };
  if (b.t === 'tabel') return { ...b, kolom: b.kolom?.map(aman), baris: b.baris.map(r => r.map(aman)) };
  if (b.t === 'halaman') return b;
  return { ...b, teks: aman(b.teks) } as BlokDocx;
};

export async function buatPdf(blokAsli: BlokDocx[], judulDok: string): Promise<Blob> {
  const blok = blokAsli.map(bersih); judulDok = aman(judulDok);
  const { jsPDF } = await import('jspdf');
  // interop ESM/CJS: fungsi bisa di .default, .default.default, atau .autoTable
  const m = await import('jspdf-autotable') as unknown as Record<string, unknown> & { default?: unknown };
  const d = m.default as (Record<string, unknown> & { default?: unknown }) | ((...a: unknown[]) => void) | undefined;
  const autoTable = (typeof d === 'function' ? d : typeof d?.default === 'function' ? d.default : m.autoTable ?? (d as Record<string, unknown> | undefined)?.autoTable) as (doc: unknown, opt: Record<string, unknown>) => void;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 16, W = 210 - 2 * M, BAWAH = 297 - 16;
  let y = M;
  const baru = () => { doc.addPage(); y = M; };
  const cukup = (h: number) => { if (y + h > BAWAH) baru(); };
  const teks = (s: string, size: number, gaya: 'normal' | 'bold' | 'italic' = 'normal', indent = 0, warna: [number, number, number] = [20, 20, 20], spasi = 1.5) => {
    doc.setFont('helvetica', gaya); doc.setFontSize(size); doc.setTextColor(...warna);
    const baris = doc.splitTextToSize(s, W - indent) as string[];
    const lh = size * 0.42;
    for (const b of baris) { cukup(lh); doc.text(b, M + indent, y + lh * 0.8); y += lh; }
    y += spasi;
  };
  for (const b of blok) {
    if (b.t === 'halaman') { if (y > M + 2) baru(); continue; }
    if (b.t === 'judul') { teks(b.teks, 16, 'bold', 0, [15, 23, 42], 2); continue; }
    if (b.t === 'h1') { cukup(14); y += 2; teks(b.teks, 13, 'bold', 0, [29, 78, 216], 1.5); continue; }
    if (b.t === 'h2') { cukup(12); y += 1.5; teks(b.teks, 11.5, 'bold', 0, [15, 23, 42], 1.2); continue; }
    if (b.t === 'h3') { cukup(10); y += 1; teks(b.teks, 10, 'bold', 0, [51, 65, 85], 0.8); continue; }
    if (b.t === 'p') { teks(b.teks, b.kecil ? 8.5 : 9.5, b.tebal ? 'bold' : b.miring ? 'italic' : 'normal', 0, b.kecil ? [100, 116, 139] : [20, 20, 20]); continue; }
    if (b.t === 'list') {
      b.item.filter(s => s.trim()).forEach((s, i) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
        const pfx = b.nomor ? `${i + 1}.` : '•';
        const baris = doc.splitTextToSize(s, W - 7) as string[];
        baris.forEach((t2, k) => { cukup(4.2); if (k === 0) doc.text(pfx, M + 1, y + 3.3); doc.text(t2, M + 7, y + 3.3); y += 4.2; });
      });
      y += 1.5; continue;
    }
    if (b.t === 'tabel') {
      const n = Math.max(b.kolom?.length ?? 0, ...b.baris.map(r => r.length));
      const lebar = b.lebar ?? Array.from({ length: n }, () => 1 / n);
      autoTable(doc, {
        startY: y, margin: { left: M, right: M, top: M, bottom: 16 }, head: b.kolom ? [b.kolom] : undefined, body: b.baris,
        styles: { fontSize: 8.5, cellPadding: 1.6, valign: 'top', lineColor: [203, 213, 225], lineWidth: 0.2, textColor: [20, 20, 20] },
        headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: 'bold' },
        columnStyles: Object.fromEntries(lebar.map((l, i) => [i, { cellWidth: l * W, ...(b.kolom ? {} : i === 0 ? { fontStyle: 'bold', fillColor: [241, 245, 249] } : {}) }])),
        theme: 'grid',
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
    }
  }
  // nomor halaman & judul di kaki
  const nHal = doc.getNumberOfPages();
  for (let i = 1; i <= nHal; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
    doc.text(judulDok, M, 297 - 8); doc.text(`Hal. ${i} / ${nHal}`, 210 - M, 297 - 8, { align: 'right' });
  }
  return doc.output('blob');
}
