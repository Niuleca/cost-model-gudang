// Kalkulator kebutuhan listrik gudang (mengikuti format Excel Esa):
// peralatan (watt/unit, jam pakai/hari) × jumlah per ruang → Wh/bulan → kWh → LWBP/WBP → biaya energi + kVArh + beban kVA.

export interface Alat { id: string; nama: string; watt: number; jam: number }
export interface Ruang { nama: string; qty: Record<string, number> }
export interface DataListrik {
  hariPerBulan: number; allowance: number; porsiLwbp: number; tarifLwbp: number; tarifWbp: number; golongan?: string;
  tarifKvarh: number; porsiKvarh: number; bebanPerKva: number; kvaTerpasang: number; powerFactor: number;
  alat: Alat[]; ruang: Ruang[];
}

export function hitungListrik(d: DataListrik) {
  const perAlat = d.alat.map(a => {
    const qty = d.ruang.reduce((s, r) => s + Number(r.qty[a.id] || 0), 0);
    const totalWatt = qty * Number(a.watt || 0);
    const jamBulan = Number(a.jam || 0) * Number(d.hariPerBulan || 0);
    return { ...a, qty, totalWatt, jamBulan, whBulan: totalWatt * jamBulan };
  });
  const perRuang = d.ruang.map(r => ({ nama: r.nama, watt: d.alat.reduce((s, a) => s + Number(r.qty[a.id] || 0) * Number(a.watt || 0), 0) }));
  const whBulan = perAlat.reduce((s, a) => s + a.whBulan, 0);
  const kwh = whBulan / 1000;
  const kwhPakai = kwh * (1 + Number(d.allowance || 0));
  const lwbp = kwhPakai * d.porsiLwbp, wbp = kwhPakai * (1 - d.porsiLwbp);
  const biayaEnergi = lwbp * d.tarifLwbp + wbp * d.tarifWbp;
  const kvarh = kwhPakai * Number(d.porsiKvarh || 0);
  const biayaKvarh = kvarh * d.tarifKvarh;
  const biayaBeban = d.kvaTerpasang * d.bebanPerKva;
  const dayaW = perAlat.reduce((s, a) => s + a.totalWatt, 0);
  const kvaButuh = d.powerFactor > 0 ? dayaW / d.powerFactor / 1000 : 0;
  return { perAlat, perRuang, whBulan, kwh, kwhPakai, lwbp, wbp, biayaEnergi, kvarh, biayaKvarh, biayaBeban,
    total: biayaEnergi + biayaKvarh + biayaBeban, dayaW, kvaButuh, kurangDaya: kvaButuh > d.kvaTerpasang };
}

const kol = (n: number) => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/** Export ke Excel dengan rumus aktif, tata letak sama seperti Excel asal (peralatan = kolom, ruang = baris). */
export async function exportListrikExcel(nama: string, d: DataListrik) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Kebutuhan Listrik');
  const c0 = 3;                                   // kolom D = indeks 3
  const n = d.alat.length;
  const kAkhir = kol(c0 + n - 1);
  const kTot = kol(c0 + n + 1);                   // kolom total watt per ruang
  const isi = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFCD5B4' } };
  const kepala = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F4E79' } };
  ws.getCell('A2').value = 'No.'; ws.getCell('C2').value = 'Nama Ruang';
  ws.mergeCells(`D2:${kAkhir}2`); ws.getCell('D2').value = 'Jumlah Peralatan Listrik'; ws.getCell('D2').alignment = { horizontal: 'center' };
  ws.getCell(`${kTot}3`).value = 'Total watt';
  d.alat.forEach((a, i) => {
    const k = kol(c0 + i);
    ws.getCell(`${k}3`).value = a.nama; ws.getCell(`${k}3`).alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
    ws.getCell(`${k}4`).value = Number(a.watt || 0); ws.getCell(`${k}4`).numFmt = '#,##0" W"';
    ws.getColumn(c0 + i + 1).width = 11;
  });
  ['A2', 'C2', 'D2', `${kTot}3`].forEach(a => { ws.getCell(a).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getCell(a).fill = kepala; });
  for (let i = 0; i < n; i++) { const c = ws.getCell(`${kol(c0 + i)}3`); c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = kepala; }
  ws.getRow(3).height = 42; ws.getColumn(1).width = 26; ws.getColumn(3).width = 18;

  let r = 5;
  const barisWatt: number[] = [];
  d.ruang.forEach((ru, i) => {
    ws.getCell(`A${r}`).value = i + 1; ws.getCell(`C${r}`).value = ru.nama;
    d.alat.forEach((a, j) => {
      const k = kol(c0 + j);
      const q = ws.getCell(`${k}${r}`); q.value = Number(ru.qty[a.id] || 0) || null; q.fill = isi;
      ws.getCell(`${k}${r + 1}`).value = { formula: `${k}${r}*${k}$4` }; ws.getCell(`${k}${r + 1}`).numFmt = '#,##0;-#,##0;"-"';
    });
    ws.getCell(`${kTot}${r + 1}`).value = { formula: `SUM(D${r + 1}:${kAkhir}${r + 1})` }; ws.getCell(`${kTot}${r + 1}`).numFmt = '#,##0';
    barisWatt.push(r + 1); r += 2;
  });
  const rTot = r, rJam = r + 1, rJamBln = r + 2, rWh = r + 3;
  ws.getCell(`C${rTot}`).value = 'Total watt'; ws.getCell(`C${rTot}`).font = { bold: true };
  ws.getCell(`A${rJam}`).value = 'Usage/day (hour)'; ws.getCell(`A${rJamBln}`).value = 'Usage/mo (hour)';
  ws.getCell(`B${rJamBln}`).value = Number(d.hariPerBulan); ws.getCell(`B${rJamBln}`).fill = isi;
  ws.getCell(`C${rJamBln}`).value = '← hari kerja/bulan';
  ws.getCell(`A${rWh}`).value = 'Usage/mo (watt-hour)';
  d.alat.forEach((a, j) => {
    const k = kol(c0 + j);
    ws.getCell(`${k}${rTot}`).value = { formula: barisWatt.map(b => `${k}${b}`).join('+') || '0' };
    ws.getCell(`${k}${rTot}`).font = { bold: true }; ws.getCell(`${k}${rTot}`).numFmt = '#,##0;-#,##0;"-"';
    ws.getCell(`${k}${rJam}`).value = Number(a.jam || 0); ws.getCell(`${k}${rJam}`).fill = isi;
    ws.getCell(`${k}${rJamBln}`).value = { formula: `${k}${rJam}*$B$${rJamBln}` };
    ws.getCell(`${k}${rWh}`).value = { formula: `${k}${rTot}*${k}${rJamBln}` }; ws.getCell(`${k}${rWh}`).numFmt = '#,##0;-#,##0;"-"';
  });
  ws.getCell(`${kTot}${rTot}`).value = { formula: `SUM(D${rTot}:${kAkhir}${rTot})` }; ws.getCell(`${kTot}${rTot}`).numFmt = '#,##0';

  // Ringkasan biaya (kolom A label, C persen/input, D nilai)
  let s = rWh + 2;
  const baris = (label: string, nilai: unknown, fmt = '#,##0', input?: { c: unknown; fmt?: string }, satuan?: string) => {
    ws.getCell(`A${s}`).value = label;
    if (input) { ws.getCell(`C${s}`).value = input.c as number; ws.getCell(`C${s}`).fill = isi; if (input.fmt) ws.getCell(`C${s}`).numFmt = input.fmt; }
    ws.getCell(`D${s}`).value = nilai as number; ws.getCell(`D${s}`).numFmt = fmt;
    if (satuan) ws.getCell(`E${s}`).value = satuan;
    return s++;
  };
  const rGWh = baris('Grand Total Kebutuhan Listrik', { formula: `SUM(D${rWh}:${kAkhir}${rWh})` }, '#,##0', undefined, 'Wh/bulan');
  const rKwh = baris('', { formula: `D${rGWh}/1000` }, '#,##0', undefined, 'kWh');
  const rAll = baris('Allowance pemakaian listrik', { formula: `D${rKwh}*(1+C${s})` }, '#,##0', { c: d.allowance, fmt: '0%' });
  const rL = baris('Pemakaian listrik LWBP', { formula: `D${rAll}*C${s}` }, '#,##0', { c: d.porsiLwbp, fmt: '0%' });
  const rW = baris('Pemakaian listrik WBP', { formula: `D${rAll}*C${s}` }, '#,##0', { c: { formula: `1-C${rL}` }, fmt: '0%' });
  const rTL = baris('Tarif per kWh (LWBP)', d.tarifLwbp, '#,##0.00', undefined, d.golongan ?? '');
  const rTW = baris('Tarif per kWh (WBP)', d.tarifWbp, '#,##0.00');
  ws.getCell(`D${rTL}`).fill = isi; ws.getCell(`D${rTW}`).fill = isi;
  const rE = baris('Estimasi biaya listrik', { formula: `D${rL}*D${rTL}+D${rW}*D${rTW}` });
  const rTk = baris('Tarif kVArh', d.tarifKvarh); ws.getCell(`D${rTk}`).fill = isi;
  const rKv = baris('Konsumsi kVArh', { formula: `D${rAll}*C${s}` }, '#,##0', { c: d.porsiKvarh, fmt: '0%' });
  const rBk = baris('Biaya kVArh', { formula: `D${rKv}*D${rTk}` });
  const rBp = baris('Biaya bulanan per kVA', d.bebanPerKva); ws.getCell(`D${rBp}`).fill = isi;
  const rTp = baris('Listrik terpasang kVA', { formula: `C${s}*D${rBp}` }, '#,##0', { c: d.kvaTerpasang, fmt: '#,##0.0' });
  s++;
  const rT = baris('Total biaya listrik / bulan', { formula: `D${rE}+D${rBk}+D${rTp}` });
  ws.getCell(`A${rT}`).font = { bold: true }; ws.getCell(`D${rT}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getCell(`D${rT}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  s++;
  const rPf = baris('Power factor', d.powerFactor, '0.00'); ws.getCell(`D${rPf}`).fill = isi;
  baris('Kebutuhan daya (kVA)', { formula: `${kTot}${rTot}/D${rPf}/1000` }, '#,##0.00', undefined, 'bandingkan dengan kVA terpasang');
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 4 }];

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const el = document.createElement('a');
  el.href = url; el.download = `Kebutuhan_Listrik_${nama.replace(/[^\w]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`; el.click();
  URL.revokeObjectURL(url);
}
