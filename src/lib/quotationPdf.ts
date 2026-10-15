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
  gudang?: InfoGudangPdf | null; catatanRevisi?: string | null; durasiBulan?: number;
  termCondition: string; penandatangan: string; jabatan: string; perusahaan: string;
}

export async function unduhQuotationPdf(d: QuotationPdfData) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const kiri = 18, lebar = 210 - 36;
  const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const tgl = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const akhirTabel = () => (doc as any).lastAutoTable.finalY as number;

  // Kop
  doc.setFillColor(31, 78, 121); doc.rect(0, 0, 210, 6, 'F');
  doc.setFillColor(232, 181, 0); doc.rect(0, 6, 210, 1.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(d.perusahaan, kiri, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  doc.text('Warehousing & Distribution', kiri, 25);
  doc.setTextColor(20);

  doc.setFontSize(10);
  const info: [string, string][] = [
    ['Nomor', d.nomor], ['Tanggal', tgl(d.tanggal)], ['Berlaku sampai', tgl(d.berlakuSampai)],
    ['Kepada', d.kepada || d.customer], ['Perihal', d.perihal],
  ];
  if (d.durasiBulan) info.push(['Masa kontrak', `${d.durasiBulan} bulan`]);
  let y = 36;
  for (const [k, v] of info) { doc.setFont('helvetica', 'bold'); doc.text(k, kiri, y); doc.setFont('helvetica', 'normal'); doc.text(': ' + v, kiri + 32, y); y += 5.5; }

  if (d.catatanRevisi) {
    y += 2; doc.setFontSize(9); doc.setTextColor(90);
    const l = doc.splitTextToSize(`Perubahan dari penawaran sebelumnya: ${d.catatanRevisi}`, lebar);
    doc.text(l, kiri, y); y += l.length * 4.5; doc.setTextColor(20); doc.setFontSize(10);
  }

  y += 3;
  const pembuka = doc.splitTextToSize(`Dengan hormat, bersama ini kami sampaikan penawaran harga jasa pergudangan untuk ${d.customer} di ${d.lokasi} dengan rincian sebagai berikut:`, lebar);
  doc.text(pembuka, kiri, y);
  y += pembuka.length * 5 + 2;

  if (d.gudang) {
    const g = d.gudang;
    autoTable(doc, {
      startY: y, margin: { left: kiri, right: kiri }, theme: 'plain',
      head: [[{ content: 'Lokasi gudang', colSpan: 2 }]],
      body: [
        ['Nama gudang', g.nama], ['Alamat', g.alamat], ['Tipe', g.tipe],
        ['Luas dialokasikan', `${g.luasDipakaiM2.toLocaleString('id-ID')} m² (luas gudang ${g.luasM2.toLocaleString('id-ID')} m²)`],
        ...(g.tinggiM ? [['Tinggi bersih', `${g.tinggiM} m`]] : []),
        ...(g.dock ? [['Jumlah dock', String(g.dock)]] : []),
        ...(g.gmaps ? [['Peta', g.gmaps]] : []),
      ],
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6 },
      headStyles: { fillColor: [238, 240, 236], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } },
      didDrawCell: data => {
        if (g.gmaps && data.section === 'body' && data.column.index === 1 && data.cell.raw === g.gmaps)
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: g.gmaps });
      },
    });
    y = akhirTabel() + 6;
  }

  autoTable(doc, {
    startY: y, margin: { left: kiri, right: kiri },
    head: [['No', 'Layanan', 'Satuan', 'Tarif (belum PPN)', 'Keterangan']],
    body: d.rateCard.map((r, i) => [String(i + 1), r.layanan, r.satuan, rp(r.tarif), r.catatan ?? '']),
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: [31, 78, 121], textColor: 255 },
    columnStyles: { 0: { cellWidth: 10 }, 3: { halign: 'right', cellWidth: 36 } },
  });
  y = akhirTabel() + 6;

  if (d.tagihanSekali?.length) {
    autoTable(doc, {
      startY: y, margin: { left: kiri, right: kiri },
      head: [['Biaya sekali (one time charge)', 'Nilai (belum PPN)']],
      body: [...d.tagihanSekali.map(x => [x.deskripsi, rp(x.nilai)]), ['Total', rp(d.tagihanSekali.reduce((s, x) => s + x.nilai, 0))]],
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2 },
      headStyles: { fillColor: [31, 78, 121], textColor: 255 },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
    });
    y = akhirTabel() + 8;
  } else y += 2;

  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Syarat dan ketentuan', kiri, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  for (const baris of d.termCondition.split('\n')) {
    const lines = doc.splitTextToSize(baris, lebar);
    if (y + lines.length * 4.5 > 270) { doc.addPage(); y = 20; }
    doc.text(lines, kiri, y); y += lines.length * 4.5 + 1;
  }

  if (y > 240) { doc.addPage(); y = 20; }
  y += 8; doc.setFontSize(10);
  doc.text('Hormat kami,', kiri, y);
  doc.text(d.penandatangan, kiri, y + 25); doc.setFontSize(9); doc.setTextColor(90); doc.text(d.jabatan, kiri, y + 30);

  const halaman = doc.getNumberOfPages();
  for (let i = 1; i <= halaman; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`${d.nomor} · Halaman ${i} dari ${halaman}`, 210 - kiri, 290, { align: 'right' });
  }
  doc.save(`${d.nomor.replace(/[^\w-]+/g, '_')}.pdf`);
}
