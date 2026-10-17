'use client';
// Membuat file PDF quotation di browser (UC18), termasuk data gudang, biaya sekali, dan nomor revisi.

export interface InfoGudangPdf {
  nama: string; alamat: string; kota: string; luasM2: number; luasDipakaiM2: number;
  tinggiM: number | null; dock: number | null; tipe: string; gmaps: string | null;
}

export interface QuotationPdfData {
  nomor: string; tanggal: string; berlakuSampai: string; kepada: string; customer: string; lokasi: string;
  perihal: string; rateCard: { layanan: string; satuan: string; tarif: number; catatan?: string }[];
  tagihanSekali?: { deskripsi: string; nilai: number }[];
  gudang?: InfoGudangPdf | null; catatanRevisi?: string | null; durasiBulan?: number; termasukPpn?: boolean; ppnPersen?: number;
  termCondition: string; penandatangan: string; jabatan: string; perusahaan: string;
  logo?: GambarPdf | null; ttd?: GambarPdf | null; watermark?: string;
}
export interface GambarPdf { dataUrl: string; format: string; w: number; h: number }
/** Ukuran gambar (mm) dalam kotak maksimum, aspek dijaga. */
const muat = (g: GambarPdf, maxW: number, maxH: number) => { const r = Math.min(maxW / g.w, maxH / g.h); return { w: g.w * r, h: g.h * r }; };

/** Susun dokumen PDF (dipakai untuk unduh dan pratinjau). Tata letak A4, margin 18 mm, palet netral. */
export async function buatQuotationPdf(d: QuotationPdfData) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const kiri = 18, kanan = 192, lebar = kanan - kiri, bawahAman = 272;
  const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const tgl = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  // Font standar PDF tidak punya glyph ² ³ → tulis m2 / m3 supaya tidak hilang
  const ascii = (t: string) => t.replace(/²/g, '2').replace(/³/g, '3');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const akhirTabel = () => (doc as any).lastAutoTable.finalY as number;
  const GELAP: [number, number, number] = [43, 43, 43], ABU: [number, number, number] = [240, 240, 240], GARIS: [number, number, number] = [210, 210, 210];
  const teks = (c: number) => doc.setTextColor(c);
  const garis = (yy: number) => { doc.setDrawColor(...GARIS); doc.setLineWidth(0.3); doc.line(kiri, yy, kanan, yy); };
  const judulBagian = (t: string, yy: number) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); teks(30); doc.text(t, kiri, yy); return yy + 5; };
  const tabelStyle = {
    margin: { left: kiri, right: 210 - kanan, top: 20, bottom: 25 },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 }, textColor: 30, lineColor: GARIS, lineWidth: 0.1 },
    headStyles: { fillColor: GELAP, textColor: 255, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [249, 249, 249] as [number, number, number] },
  };

  // ---- Kop ----
  let xNama = kiri;
  if (d.logo) {
    const u = muat(d.logo, 38, 15);
    try { doc.addImage(d.logo.dataUrl, d.logo.format, kiri, 12 + (15 - u.h) / 2, u.w, u.h); xNama = kiri + u.w + 5; } catch { /* format tidak didukung */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); teks(20); doc.text(d.perusahaan, xNama, 18.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); teks(110); doc.text('Warehousing & Distribution', xNama, 23.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); teks(30); doc.text('QUOTATION', kanan, 18.5, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); teks(110); doc.text(d.nomor, kanan, 23.5, { align: 'right' });
  doc.setDrawColor(...GELAP); doc.setLineWidth(0.6); doc.line(kiri, 30, kanan, 30);

  // ---- Info dua kolom ----
  let y = 38;
  const kolom = (pasangan: [string, string][], x: number, w: number, y0: number) => {
    let yy = y0;
    for (const [k, v] of pasangan) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); teks(120); doc.text(k.toUpperCase(), x, yy);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); teks(25);
      const l = doc.splitTextToSize(v, w); doc.text(l, x, yy + 4.2); yy += 4.2 + l.length * 4.4 + 2.2;
    }
    return yy;
  };
  const kiriInfo: [string, string][] = [['Kepada', d.kepada || d.customer], ['Perihal', d.perihal], ['Lokasi', d.lokasi]];
  const kananInfo: [string, string][] = [['Tanggal', tgl(d.tanggal)], ['Berlaku sampai', tgl(d.berlakuSampai)], ...(d.durasiBulan ? [['Masa kontrak', `${d.durasiBulan} bulan`] as [string, string]] : [])];
  y = Math.max(kolom(kiriInfo, kiri, 100, y), kolom(kananInfo, 130, kanan - 130, y)) + 1;

  if (d.catatanRevisi) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); teks(90);
    const l = doc.splitTextToSize(`Perubahan dari penawaran sebelumnya: ${d.catatanRevisi}`, lebar);
    doc.text(l, kiri, y); y += l.length * 4 + 2;
  }
  garis(y); y += 6;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); teks(30);
  const pembuka = doc.splitTextToSize(ascii(`Dengan hormat, bersama ini kami sampaikan penawaran harga jasa pergudangan untuk ${d.customer} di ${d.lokasi} dengan rincian sebagai berikut:`), lebar);
  doc.text(pembuka, kiri, y); y += pembuka.length * 4.6 + 3;

  // ---- Lokasi gudang ----
  if (d.gudang) {
    const g = d.gudang;
    y = judulBagian('Lokasi gudang', y);
    const pasang: [string, string][] = [
      ['Nama gudang', g.nama], ['Tipe', g.tipe],
      ['Luas dialokasikan', `${g.luasDipakaiM2.toLocaleString('id-ID')} m2 dari ${g.luasM2.toLocaleString('id-ID')} m2`],
      ...(g.tinggiM ? [['Tinggi bersih', `${g.tinggiM} m`] as [string, string]] : []),
      ...(g.dock ? [['Jumlah dock', String(g.dock)] as [string, string]] : []),
    ];
    const body: (string | { content: string; colSpan: number })[][] = [];
    for (let i = 0; i < pasang.length; i += 2) body.push([pasang[i][0], pasang[i][1], pasang[i + 1]?.[0] ?? '', pasang[i + 1]?.[1] ?? '']);
    body.push(['Alamat', { content: g.alamat, colSpan: 3 }]);
    if (g.gmaps) body.push(['Peta', { content: g.gmaps, colSpan: 3 }]);
    autoTable(doc, {
      ...tabelStyle, startY: y, theme: 'plain', body,
      styles: { ...tabelStyle.styles, lineWidth: 0, cellPadding: { top: 1.2, bottom: 1.2, left: 2.5, right: 2.5 } },
      columnStyles: { 0: { cellWidth: 32, textColor: 110 }, 1: { cellWidth: 55, textColor: 25 }, 2: { cellWidth: 28, textColor: 110 }, 3: { textColor: 25 } },
      didParseCell: c => {
        if (c.section !== 'body') return;
        if (c.row.index % 2 === 0) c.cell.styles.fillColor = [249, 249, 249];
      },
      didDrawCell: c => {
        if (g.gmaps && c.section === 'body' && c.column.index === 1 && (c.cell.raw as { content?: string })?.content === g.gmaps)
          doc.link(c.cell.x, c.cell.y, c.cell.width, c.cell.height, { url: g.gmaps });
      },
    });
    y = akhirTabel() + 7;
  }

  // ---- Rate card ----
  y = judulBagian('Tarif layanan', y);
  autoTable(doc, {
    ...tabelStyle, startY: y,
    head: [['No', 'Layanan', 'Satuan', d.termasukPpn ? `Tarif (incl. PPN ${Math.round((d.ppnPersen ?? 0.11) * 1000) / 10}%)` : 'Tarif (excl. PPN)', 'Keterangan']],
    body: d.rateCard.map((r, i) => [String(i + 1), ascii(r.layanan), ascii(r.satuan), rp(r.tarif), ascii(r.catatan ?? '')]),
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 38, fontStyle: 'bold' }, 2: { cellWidth: 38 }, 3: { cellWidth: 32, halign: 'right' } },
    didParseCell: c => { if (c.section === 'head' && c.column.index === 3) c.cell.styles.halign = 'right'; if (c.section === 'head' && c.column.index === 0) c.cell.styles.halign = 'center'; },
  });
  y = akhirTabel() + 7;

  if (d.tagihanSekali?.length) {
    if (y > bawahAman - 25) { doc.addPage(); y = 20; }
    y = judulBagian('Biaya sekali (one time charge)', y);
    autoTable(doc, {
      ...tabelStyle, startY: y,
      head: [['Deskripsi', d.termasukPpn ? 'Nilai (incl. PPN)' : 'Nilai (excl. PPN)']],
      body: d.tagihanSekali.map(x => [ascii(x.deskripsi), rp(x.nilai)]),
      foot: [['Total', rp(d.tagihanSekali.reduce((s2, x) => s2 + x.nilai, 0))]],
      footStyles: { fillColor: ABU, textColor: 20, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
      didParseCell: c => { if ((c.section === 'head' || c.section === 'foot') && c.column.index === 1) c.cell.styles.halign = 'right'; },
    });
    y = akhirTabel() + 7;
  }

  // ---- Syarat & ketentuan: mengalir dari halaman yang sama; 2 poin terakhir selalu satu halaman dengan tanda tangan ----
  const tcBaris = ascii(d.termCondition).split('\n').map(t => t.trim()).filter(Boolean);
  const tinggiTtd = 44, LH = 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
  const item = tcBaris.map(b2 => { const m = b2.match(/^(\d+[.)])\s*(.*)$/); const l = doc.splitTextToSize(m ? m[2] : b2, lebar - 6) as string[]; return { no: m ? m[1] : '•', l, h: l.length * LH + 1.3 }; });
  if (y > bawahAman - 18) { doc.addPage(); y = 20; }
  y = judulBagian('Syarat dan ketentuan', y);
  item.forEach((it, i) => {
    const ekor = i === Math.max(0, item.length - 2) ? item.slice(i).reduce((s2, x) => s2 + x.h, 0) + 6 + tinggiTtd : it.h;
    if (y + ekor > bawahAman) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); teks(45);
    doc.text(it.no, kiri, y); doc.text(it.l, kiri + 6, y); y += it.h;
  });

  // ---- Tanda tangan: dua kolom (penyedia & customer), tidak terpotong halaman ----
  y += 6;
  if (y + tinggiTtd > bawahAman) { doc.addPage(); y = 24; }   // hanya terjadi bila T&C kosong
  const kol2 = 118;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); teks(30);
  doc.text('Hormat kami,', kiri, y); doc.text('Disetujui oleh,', kol2, y);
  doc.setFont('helvetica', 'bold'); doc.text(d.perusahaan, kiri, y + 4.8); doc.text(d.customer, kol2, y + 4.8);
  if (d.ttd) {
    const u = muat(d.ttd, 48, 20);
    try { doc.addImage(d.ttd.dataUrl, d.ttd.format, kiri, y + 7 + (20 - u.h) / 2, u.w, u.h); } catch { /* abaikan */ }
  }
  const yNama = y + 33;
  doc.setDrawColor(...GARIS); doc.setLineWidth(0.3); doc.line(kiri, yNama - 4, kiri + 62, yNama - 4); doc.line(kol2, yNama - 4, kol2 + 62, yNama - 4);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); teks(25); doc.text(d.penandatangan, kiri, yNama);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); teks(110); doc.text(d.jabatan, kiri, yNama + 4.4);
  doc.text('Nama, jabatan & tanggal', kol2, yNama);

  // ---- Footer & watermark ----
  const halaman = doc.getNumberOfPages();
  for (let i = 1; i <= halaman; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GARIS); doc.setLineWidth(0.3); doc.line(kiri, 282, kanan, 282);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); teks(130);
    doc.text(d.perusahaan, kiri, 286.5);
    doc.text(`${d.nomor}  ·  Halaman ${i} dari ${halaman}`, kanan, 286.5, { align: 'right' });
  }
  if (d.watermark) for (let i = 1; i <= halaman; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'bold'); doc.setFontSize(80); teks(150);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const D = doc as any; if (D.GState) D.setGState(new D.GState({ opacity: 0.1 }));
    doc.text(d.watermark, 105, 170, { align: 'center', angle: 35 });
    if (D.GState) D.setGState(new D.GState({ opacity: 1 }));
  }
  return doc;
}
export const namaFilePdf = (nomor: string) => `${nomor.replace(/[^\w-]+/g, '_')}.pdf`;
export async function unduhQuotationPdf(d: QuotationPdfData) {
  (await buatQuotationPdf(d)).save(namaFilePdf(d.nomor));
}
/** PDF sebagai Blob untuk pratinjau di halaman. */
export async function blobQuotationPdf(d: QuotationPdfData) {
  return (await buatQuotationPdf(d)).output('blob') as Blob;
}
