'use client';
// Export lengkap satu tender ke Excel: input → perhitungan → hasil → data master yang dipakai.
// Dibuat di browser dengan exceljs (dimuat saat tombol ditekan).
import type { HasilTender } from '@/lib/engine/index.ts';
import type { MasterData } from '@/lib/engine/types';
import type { TenderRow } from '@/lib/tender';
import type { ParamBiayaMp, RincianBiayaRole } from '@/lib/engine/biayaMp';

type Baris = Record<string, unknown>;
const BIRU = 'FF1F4E79', HASIL = 'FFEAF2FB', HASIL_INK = 'FF17426E', ABU = 'FFF0F0F0';

/** Ratakan objek bertingkat: { alokasi: { storage: 1 } } → { 'alokasi.storage': 1 }; array → teks. */
function ratakan(o: unknown, pre = '', out: Baris = {}): Baris {
  if (o == null || typeof o !== 'object' || Array.isArray(o)) { out[pre || 'nilai'] = Array.isArray(o) ? o.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join('; ') : o; return out; }
  for (const [k, v] of Object.entries(o as Baris)) {
    const key = pre ? `${pre}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) ratakan(v, key, out);
    else out[key] = Array.isArray(v) ? v.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join('; ') : v;
  }
  return out;
}

export interface DataExport {
  t: TenderRow; hasil: HasilTender; master: MasterData; catatanMaster: string[];
  pd: unknown; rincianMp: RincianBiayaRole[]; paramMp: ParamBiayaMp; profil?: unknown; orderAdmin?: unknown;
}

export async function exportTenderLengkap(p: DataExport) {
  const buf = await buatWorkbookTender(p);
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Leca_${(p.t.kode ?? p.t.customer).replace(/[^\w-]+/g, '_')}_lengkap_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function buatWorkbookTender(p: {
  t: TenderRow; hasil: HasilTender; master: MasterData; catatanMaster: string[];
  pd: unknown; rincianMp: RincianBiayaRole[]; paramMp: ParamBiayaMp; profil?: unknown; orderAdmin?: unknown;
}) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Leca — esapanghegar'; wb.created = new Date();
  const { t, hasil: h, master: m } = p;
  type WS = ReturnType<typeof wb.addWorksheet>;

  const gayaHeader = (row: { font: unknown; fill: unknown; alignment: unknown }) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BIRU } };
    row.alignment = { vertical: 'middle', wrapText: true };
  };
  const judul = (ws: WS, teks: string, sub?: string) => {
    const r = ws.addRow([teks]); r.font = { bold: true, size: 14 };
    if (sub) { const s = ws.addRow([sub]); s.font = { italic: true, color: { argb: 'FF6B6B6B' } }; }
    ws.addRow([]);
  };
  const formatAngka = (cell: { value: unknown; numFmt: string }) => {
    if (typeof cell.value === 'number') cell.numFmt = Math.abs(cell.value) >= 1000 || Number.isInteger(cell.value) ? '#,##0' : '#,##0.00';
  };
  /** Tabel generik dari array objek — kolom = gabungan semua key (diratakan). */
  const tabel = (ws: WS, rows: unknown[], judulTabel?: string) => {
    if (judulTabel) { const r = ws.addRow([judulTabel]); r.font = { bold: true, size: 12 }; }
    const flat = rows.map(r => ratakan(r));
    if (!flat.length) { ws.addRow(['(kosong)']); ws.addRow([]); return; }
    const keys: string[] = [];
    for (const f of flat) for (const k of Object.keys(f)) if (!keys.includes(k)) keys.push(k);
    gayaHeader(ws.addRow(keys) as never);
    for (const f of flat) {
      const r = ws.addRow(keys.map(k => { const v = f[k]; return v === undefined ? null : typeof v === 'boolean' ? (v ? 'Ya' : 'Tidak') : v; }));
      r.eachCell(c => formatAngka(c as never));
    }
    ws.addRow([]);
  };
  const kv = (ws: WS, pasangan: [string, unknown][], judulTabel?: string) => {
    if (judulTabel) { const r = ws.addRow([judulTabel]); r.font = { bold: true, size: 12 }; }
    for (const [k, v] of pasangan) {
      const r = ws.addRow([k, v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v]);
      r.getCell(1).font = { bold: true }; r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ABU } };
      formatAngka(r.getCell(2) as never);
    }
    ws.addRow([]);
  };
  const lebar = (ws: WS, w = 18) => { ws.columns.forEach((c, i) => { c.width = i === 0 ? Math.max(w + 10, 28) : w; }); };
  const hasilCell = (c: { fill: unknown; font: unknown }) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HASIL } }; c.font = { bold: true, color: { argb: HASIL_INK } }; };

  // 1. Ringkasan
  {
    const ws = wb.addWorksheet('Ringkasan');
    judul(ws, `${t.kode ?? ''} · ${t.customer}`, `${t.kab_kota}, ${t.provinsi} · ${t.skenario_aset} · ${t.jumlah_shift} shift · kontrak ${t.durasi_kontrak_bulan} bln · diekspor ${new Date().toLocaleString('id-ID')}`);
    const mt = h.marginTotal;
    kv(ws, [
      ['Cost per bulan (Rp)', mt.biayaBulan], ['Selling per bulan (Rp)', mt.hargaBulan], ['Profit per bulan (Rp)', mt.margin], ['GP %', mt.gpPersen],
      ['Cost per tahun (Rp)', mt.biayaBulan * 12], ['Selling per tahun (Rp)', mt.hargaBulan * 12],
      ['Total biaya per bulan (semua baris)', h.totalBiayaBulan], ['Investasi (Rp)', h.investasi],
      ['Total headcount', h.totalHeadcount], ['Luas gudang (m²)', h.space?.totalM2],
      ['Biaya manpower/bln (rata-rata kontrak)', h.eskalasiManpower?.rataBulan], ['Faktor kenaikan manpower', h.eskalasiManpower?.faktor],
      ['Pajak', h.pajak],
    ], 'Hasil utama');
    for (let i = 4; i <= ws.rowCount; i++) { const c = ws.getRow(i).getCell(2); if (typeof c.value === 'number') hasilCell(c as never); }
    tabel(ws, h.rateCard as unknown[], 'Rate card');
    tabel(ws, Object.entries(h.perKelompok).map(([kelompok, biayaBulan]) => ({ kelompok, biayaBulan, porsi: h.totalBiayaBulan ? biayaBulan / h.totalBiayaBulan : 0 })), 'Biaya per kelompok');
    tabel(ws, h.redFlags as unknown[], 'Red flag / catatan');
    if (p.catatanMaster.length) tabel(ws, p.catatanMaster.map(c => ({ catatan: c })), 'Catatan master data');
    lebar(ws, 20);
  }

  // 2. Input — Key assumption & data tender
  {
    const ws = wb.addWorksheet('Input');
    judul(ws, 'Input tender', 'Kolom tabel tenders + asumsi skalar');
    const { asumsi, hasil: _h, ...kol } = t as unknown as Baris & { asumsi: Baris; hasil: unknown };
    kv(ws, Object.entries(kol), 'Data tender');
    kv(ws, Object.entries(asumsi).filter(([, v]) => v == null || typeof v !== 'object'), 'Asumsi (skalar)');
    lebar(ws, 40);
  }

  // 3. Volume & profil order
  {
    const ws = wb.addWorksheet('Volume');
    judul(ws, 'Volume & profil order');
    tabel(ws, t.asumsi.volumes, 'Volume input (per bulan)');
    tabel(ws, h.volume as unknown[], 'Volume desain (hasil mesin)');
    if (p.profil) { tabel(ws, (p.profil as { inbound?: unknown[] }).inbound ?? [], 'Profil order inbound'); tabel(ws, (p.profil as { outbound?: unknown[] }).outbound ?? [], 'Profil order outbound');
      kv(ws, Object.entries(ratakan((p.profil as { param?: unknown }).param ?? {})), 'Parameter profil'); }
    if (p.orderAdmin) kv(ws, Object.entries(ratakan(p.orderAdmin)), 'Order admin (mobil × input)');
    lebar(ws);
  }

  // 4. Process design
  {
    const ws = wb.addWorksheet('Process Design');
    const pd = p.pd as { baris?: unknown[]; mp?: unknown[]; mhe?: unknown[]; indirect?: { rows?: unknown[] }; kalender?: unknown; beban?: unknown } | null;
    judul(ws, 'Process Design & Resource Calculation', 'Workload = volume × %; RfR = workload ÷ (prod × faktor); man hour = RfR ÷ efisiensi; FTE = man hour ÷ jam tersedia');
    tabel(ws, t.asumsi.aktivitas, 'Aktivitas (input)');
    tabel(ws, pd?.baris ?? [], 'Rincian per task');
    tabel(ws, pd?.mp ?? [], 'Man Power Summary (direct)');
    tabel(ws, pd?.indirect?.rows ?? [], 'Indirect & peran tetap');
    tabel(ws, pd?.mhe ?? [], 'MHE Summary');
    kv(ws, Object.entries(ratakan(pd?.kalender ?? {})), 'Kalender kerja');
    lebar(ws);
  }

  // 5. Biaya manpower — format sheet, dengan RUMUS aktif
  {
    const ws = wb.addWorksheet('Biaya Manpower');
    judul(ws, 'Rincian biaya manpower', `UMK ${t.kab_kota}: Rp${Math.round(m.upahMinimum).toLocaleString('id-ID')} · rumus aktif (ubah sel kuning untuk simulasi)`);
    const pm = p.paramMp;
    const par = ws.addRow(['Parameter', 'BPJS TK', 'BPJS KS', 'BPJS Pensiun', 'THR', 'Kompensasi', 'Management fee', 'Batas upah KS', 'Batas upah JP']);
    gayaHeader(par as never);
    const rp = ws.addRow(['Nilai', pm.bpjsTk, pm.bpjsKs, pm.bpjsPensiun, pm.thr, pm.kompensasi, pm.feePersen, pm.batasUpahKs ?? 0, pm.batasUpahPensiun ?? 0]);
    const P = rp.number;
    for (let c = 2; c <= 7; c++) rp.getCell(c).numFmt = '0.00%';
    rp.getCell(8).numFmt = '#,##0'; rp.getCell(9).numFmt = '#,##0';
    for (let c = 2; c <= 9; c++) rp.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    ws.addRow([]);
    const head = ['No', 'Jabatan', 'Level', 'Area', 'UMK', '% level', 'Gaji pokok', 'Hari kerja', 'Actual hari kerja', 'Lisensi + Insentif', 'Sub Total',
      'BPJS TK', 'BPJS KS', 'BPJS Pensiun', 'THR', 'Kompensasi', 'Supervisi & Operasional', 'Total', 'Manpower', 'Porsi (dedicated=1)', 'TOTAL'];
    gayaHeader(ws.addRow(head) as never);
    const awal = ws.rowCount + 1;
    p.rincianMp.forEach((r, i) => {
      const n = ws.rowCount + 1;
      ws.addRow([i + 1, r.role, r.level, r.area, r.umk, r.faktorLevel, r.gajiPokok, r.hariKerja, r.hariAktual, r.lisensi,
        { formula: `G${n}*MIN(1,I${n}/H${n})+J${n}` },
        { formula: `G${n}*$B$${P}` }, { formula: `MIN(G${n},IF($H$${P}>0,$H$${P},G${n}))*$C$${P}` }, { formula: `MIN(G${n},IF($I$${P}>0,$I$${P},G${n}))*$D$${P}` },
        { formula: `G${n}*$E$${P}` }, { formula: `G${n}*$F$${P}` }, r.supervisi,
        { formula: `K${n}+L${n}+M${n}+N${n}+O${n}+P${n}+Q${n}` }, r.qty, r.porsi, { formula: `R${n}*S${n}*T${n}` }]);
      const row = ws.getRow(n);
      row.getCell(6).numFmt = '0%'; row.getCell(20).numFmt = '0.00';
      for (const c of [5, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21]) row.getCell(c).numFmt = '#,##0';
      for (const c of [7, 8, 9, 10, 17, 19, 20]) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      hasilCell(row.getCell(21) as never);
    });
    const akhir = ws.rowCount;
    const s1 = ws.addRow(['', 'Sub Total Biaya-1', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', { formula: `SUM(S${awal}:S${akhir})` }, '', { formula: `SUM(U${awal}:U${akhir})` }]);
    const fee = ws.addRow(['', 'Management Fee', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', { formula: `U${s1.number}*$G$${P}` }]);
    const s2 = ws.addRow(['', 'Sub Total Biaya-2', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', { formula: `U${s1.number}+U${fee.number}` }]);
    for (const r of [s1, fee, s2]) { r.font = { bold: true }; r.getCell(21).numFmt = '#,##0'; hasilCell(r.getCell(21) as never); }
    ws.addRow([]);
    const e = h.eskalasiManpower;
    if (e) {
      tabel(ws, e.tahun.map(y => ({ tahun: y.tahun, periode: `${y.dari} – ${y.sampai}`, bulan: y.bulan, indeks: y.indeks, biayaBulan: y.biayaBulan, total: y.total })),
        `Skema kenaikan upah tiap Januari (${(e.persenTahun * 100).toFixed(1)}%/thn) · mulai ${e.mulai}`);
      kv(ws, [['Total kontrak (Rp)', e.totalKontrak], ['Bulan kontrak', e.kontrakBulan], ['Biaya manpower/bln dipakai (Rp)', e.rataBulan], ['Faktor', e.faktor]]);
    }
    tabel(ws, h.manpower as unknown[], 'Payroll hasil mesin (per role)');
    ws.columns.forEach((c, i) => { c.width = i === 1 ? 26 : 14; });
    ws.views = [{ state: 'frozen', xSplit: 2 }];
  }

  // 6. Space, MHE, biaya, simulasi
  { const ws = wb.addWorksheet('Space & MHE'); judul(ws, 'Space & MHE'); kv(ws, Object.entries(ratakan(h.space ?? {})), 'Space (hasil)'); tabel(ws, h.mhe as unknown[], 'MHE (hasil)'); tabel(ws, t.asumsi.mhe, 'MHE (input)'); lebar(ws); }
  { const ws = wb.addWorksheet('Biaya'); judul(ws, 'Baris biaya per bulan', 'Alokasi = porsi ke bucket storage / handling in / handling out / VAS / manajemen'); tabel(ws, h.biaya as unknown[]); tabel(ws, t.asumsi.costLines, 'Biaya lain (input)'); tabel(ws, t.asumsi.listrik, 'Listrik peralatan (input)'); lebar(ws); }
  { const ws = wb.addWorksheet('Rate & Simulasi'); judul(ws, 'Rate card, margin & simulasi'); tabel(ws, h.rateCard as unknown[], 'Rate card');
    kv(ws, Object.entries(ratakan(h.marginTotal)), 'Margin total'); tabel(ws, h.simulasi as unknown[], 'Simulasi (komitmen / rata-rata / peak)'); tabel(ws, (h.storageAlternatif ?? []) as unknown[], 'Tarif storage alternatif'); lebar(ws); }

  // 7. Master data yang dipakai
  {
    const ws = wb.addWorksheet('Master Data');
    judul(ws, 'Data master yang dipakai saat hitung', 'Dari database Leca (Price Inquiry / HR / Finance)');
    kv(ws, [['UMK / upah minimum (Rp)', m.upahMinimum], ['Status UMK', m.statusUpah], ['Area', `${t.kab_kota}, ${t.provinsi}`]], 'Upah');
    kv(ws, Object.entries(m.payroll), 'Parameter payroll (master)');
    kv(ws, Object.entries(m.finance), 'Parameter finance');
    kv(ws, Object.entries(m.margin), 'Kebijakan margin per risiko');
    tabel(ws, m.jobLevels, 'Jabatan (job levels)');
    tabel(ws, m.holidays, 'Hari libur');
    lebar(ws, 22);
  }

  // 8. Data mentah — seluruh asumsi tender (semua field) & hasil, diratakan
  {
    const ws = wb.addWorksheet('Data Mentah');
    judul(ws, 'Data mentah (path → nilai)', 'Seluruh isi asumsi tender dan hasil hitung, untuk audit');
    gayaHeader(ws.addRow(['Sumber', 'Path', 'Nilai']) as never);
    const tulis = (sumber: string, o: unknown, pre = '') => {
      if (o == null || typeof o !== 'object') { ws.addRow([sumber, pre, o as never]); return; }
      if (Array.isArray(o)) { o.forEach((x, i) => tulis(sumber, x, `${pre}[${i}]`)); return; }
      for (const [k, v] of Object.entries(o as Baris)) tulis(sumber, v, pre ? `${pre}.${k}` : k);
    };
    tulis('asumsi', t.asumsi); tulis('hasil', h);
    ws.columns = [{ width: 10 }, { width: 70 }, { width: 30 }];
  }

  return wb.xlsx.writeBuffer();
}
