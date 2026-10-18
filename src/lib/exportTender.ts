'use client';
// Export lengkap satu tender ke Excel: input → perhitungan → hasil → data master yang dipakai.
// Dibuat di browser dengan exceljs (dimuat saat tombol ditekan).
import type { HasilTender } from '@/lib/engine/index.ts';
import type { MasterData } from '@/lib/engine/types';
import type { TenderRow } from '@/lib/tender';
import type { ParamBiayaMp, RincianBiayaRole } from '@/lib/engine/biayaMp';

type Baris = Record<string, unknown>;
// Skema warna Excel: header rumus/hasil = silver, header input = abu-abu muda, sel input = broken white, sel hasil = abu-abu
const HDR_RUMUS = 'FFC0C0C0', HDR_INPUT = 'FFE7E6E6', SEL_INPUT = 'FFFAF8F2', SEL_HASIL = 'FFD9D9D9', TINTA = 'FF1F1F1F';
const HASIL = SEL_HASIL, HASIL_INK = TINTA;
type Jenis = 'input' | 'hasil' | 'netral';

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

export async function exportTenderLengkap(p: DataExport, sheets?: string[]) {
  const buf = await buatWorkbookTender(p, sheets);
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Leca_${(p.t.kode ?? p.t.customer).replace(/[^\w-]+/g, '_')}_lengkap_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const SHEET_EXPORT = ['Ringkasan', 'Input', 'Volume', 'Process Design', 'Biaya Manpower', 'Space & MHE', 'Biaya', 'Rate & Simulasi', 'Master Data', 'Data Mentah'] as const;

/** Pratinjau isi workbook: per sheet → baris nilai (formula ditampilkan hasilnya). */
export type GayaSel = { bg?: string; b?: boolean; pct?: boolean } | null;
/** Pratinjau isi workbook: per sheet → baris nilai (formula ditampilkan hasilnya) + warna/huruf tebal sel. */
export async function pratinjauWorkbook(p: DataExport, maksBaris = 400) {
  const wb = await susunWorkbook(p);
  return wb.worksheets.map(ws => {
    const rows: (string | number | null)[][] = [];
    const gaya: GayaSel[][] = [];
    let lebar = 0;
    ws.eachRow({ includeEmpty: true }, (row, i) => {
      if (i > maksBaris) return;
      const v = (row.values as unknown[]).slice(1).map(c => {
        if (c == null) return null;
        if (typeof c === 'object') { const o = c as { result?: unknown; formula?: string; text?: string }; return (o.result ?? o.text ?? (o.formula ? `=${o.formula}` : null)) as string | number | null; }
        return c as string | number;
      });
      const n = Math.max(v.length, row.cellCount);
      const g: GayaSel[] = [];
      for (let c = 1; c <= n; c++) {
        const cell = row.getCell(c);
        const argb = (cell.fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;
        const b = !!(cell.font as { bold?: boolean } | undefined)?.bold || !!(row.font as { bold?: boolean } | undefined)?.bold;
        const pct = typeof cell.numFmt === 'string' && cell.numFmt.includes('%');
        g.push(argb || b || pct ? { bg: argb ? `#${argb.slice(-6)}` : undefined, b, pct } : null);
      }
      lebar = Math.max(lebar, n); rows.push(v); gaya.push(g);
    });
    return { nama: ws.name, baris: ws.rowCount, kolom: lebar, rows, gaya };
  });
}

export async function buatWorkbookTender(p: DataExport, sheets?: string[]) {
  const wb = await susunWorkbook(p);
  if (sheets?.length) for (const ws of [...wb.worksheets]) if (!sheets.includes(ws.name)) wb.removeWorksheet(ws.id);
  return wb.xlsx.writeBuffer();
}

async function susunWorkbook(p: DataExport) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Leca — esapanghegar'; wb.created = new Date();
  const { t, hasil: h, master: m } = p;
  type WS = ReturnType<typeof wb.addWorksheet>;

  const gayaHeader = (row: { font: unknown; fill: unknown; alignment: unknown }) => {
    row.font = { bold: true, color: { argb: TINTA } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_RUMUS } };
    row.alignment = { vertical: 'middle', wrapText: true };
  };
  const judul = (ws: WS, teks: string, sub?: string) => {
    const r = ws.addRow([teks]); r.font = { bold: true, size: 14 };
    if (sub) { const s = ws.addRow([sub]); s.font = { italic: true, color: { argb: 'FF6B6B6B' } }; }
    ws.addRow([]);
  };
  const formatAngka = (cell: { value: unknown; numFmt: string }) => {
    if (typeof cell.value === 'number') cell.numFmt = Math.abs(cell.value) >= 10000 ? '#,##0' : Number.isInteger(cell.value) ? '0' : '#,##0.00';
  };
  /** Tabel generik dari array objek — kolom = gabungan semua key (diratakan). */
  // Semua data ditulis sebagai Excel Table (header + filter + baris selang-seling) agar mudah difilter & di-pivot.
  let nTabel = 0;
  const namaTabel = (judul?: string) => `T${++nTabel}_${(judul ?? 'Data').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30)}`;
  const nilaiSel = (v: unknown) => v == null ? null : typeof v === 'boolean' ? (v ? 'Ya' : 'Tidak') : typeof v === 'object' ? JSON.stringify(v) : (v as string | number);
  const isi = (c: { fill: unknown }, argb: string) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; };
  const garis = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
  const tulisTabel = (ws: WS, judulTabel: string | undefined, header: string[], data: unknown[][], jenis: Jenis = 'hasil') => {
    if (judulTabel) { const r = ws.addRow([judulTabel]); r.font = { bold: true, size: 12 }; }
    // header unik (syarat Excel Table)
    const seen = new Map<string, number>();
    const cols = header.map(h0 => { const h1 = String(h0 || 'Kolom'); const n = (seen.get(h1) ?? 0) + 1; seen.set(h1, n); return n > 1 ? `${h1} (${n})` : h1; });
    const awal = ws.rowCount + 1;
    const nBaris = Math.max(1, data.length);
    ws.addTable({ name: namaTabel(judulTabel), ref: `A${awal}`, headerRow: true, totalsRow: false,
      style: { theme: 'TableStyleLight1' as never, showRowStripes: false },
      columns: cols.map(name => ({ name, filterButton: true })),
      rows: data.length ? data.map(r => cols.map((_, i) => nilaiSel(r[i]))) : [cols.map(() => null)] });
    // Warna: header silver (rumus/hasil) / abu-abu muda (input); isi abu-abu (hasil) / broken white (input)
    const hdr = ws.getRow(awal);
    for (let c = 1; c <= cols.length; c++) { const cell = hdr.getCell(c); isi(cell as never, jenis === 'input' ? HDR_INPUT : HDR_RUMUS);
      cell.font = { bold: true, color: { argb: TINTA } }; cell.border = { top: garis, bottom: garis, left: garis, right: garis }; cell.alignment = { vertical: 'middle', wrapText: true }; }
    for (let i = awal + 1; i <= awal + nBaris; i++) {
      const row = ws.getRow(i);
      const label = String(row.getCell(1).value ?? '');
      for (let c = 1; c <= cols.length; c++) { const cell = row.getCell(c); formatAngka(cell as never);
        // Persentase: kolom ber-header persen/GP/margin/porsi, atau baris kv yang labelnya persen
        const kunci = cols.length === 2 && c === 2 ? label : cols[c - 1];
        if (typeof cell.value === 'number' && Math.abs(cell.value) <= 2 && /persen|%|gp|margin|markup|porsi|utilisasi|efisiensi|faktorproduktivitas/i.test(kunci) && !/rp\)|bulan|biaya|harga|pendapatan/i.test(kunci)) cell.numFmt = '0.00%';
        if (jenis !== 'netral') isi(cell as never, jenis === 'input' ? SEL_INPUT : SEL_HASIL);
        cell.border = { top: garis, bottom: garis, left: garis, right: garis }; }
    }
    ws.addRow([]); ws.addRow([]);
  };
  const tabel = (ws: WS, rows: unknown[], judulTabel?: string, jenis: Jenis = 'hasil') => {
    const flat = rows.map(r => ratakan(r));
    if (!flat.length) { if (judulTabel) { const r = ws.addRow([judulTabel]); r.font = { bold: true, size: 12 }; } ws.addRow(['(kosong)']); ws.addRow([]); return; }
    const keys: string[] = [];
    for (const f of flat) for (const k of Object.keys(f)) if (!keys.includes(k)) keys.push(k);
    tulisTabel(ws, judulTabel, keys, flat.map(f => keys.map(k => f[k])), jenis);
  };
  const kv = (ws: WS, pasangan: [string, unknown][], judulTabel?: string, jenis: Jenis = 'hasil') => {
    tulisTabel(ws, judulTabel, ['Item', 'Nilai'], pasangan.map(([k, v]) => [k, v]), jenis);
  };
  const lebar = (ws: WS, w = 18) => { ws.columns.forEach((c, i) => { c.width = i === 0 ? Math.max(w + 10, 28) : w; }); };
  const hasilCell = (c: { fill: unknown; font: unknown }) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HASIL } }; c.font = { bold: true, color: { argb: HASIL_INK } }; };

  // 1. Ringkasan
  {
    const ws = wb.addWorksheet('Ringkasan');
    judul(ws, `${t.kode ?? ''} · ${t.customer}`, `${t.kab_kota}, ${t.provinsi} · ${t.skenario_aset} · ${t.jumlah_shift} shift · kontrak ${t.durasi_kontrak_bulan} bln · diekspor ${new Date().toLocaleString('id-ID')}`);
    // Legenda warna
    const lg = ws.addRow(['Legenda warna:', 'Header rumus/hasil', 'Header input', 'Isi input', 'Isi hasil']);
    lg.getCell(1).font = { bold: true };
    isi(lg.getCell(2) as never, HDR_RUMUS); isi(lg.getCell(3) as never, HDR_INPUT); isi(lg.getCell(4) as never, SEL_INPUT); isi(lg.getCell(5) as never, SEL_HASIL);
    for (let c = 2; c <= 5; c++) lg.getCell(c).border = { top: garis, bottom: garis, left: garis, right: garis };
    ws.addRow([]);
    const mt = h.marginTotal;
    kv(ws, [
      ['Cost per bulan (Rp)', mt.biayaBulan], ['Selling per bulan (Rp)', mt.hargaBulan], ['Profit per bulan (Rp)', mt.hargaBulan - mt.biayaBulan], ['GP %', mt.gpPersen], ['Markup %', mt.margin],
      ['Cost per tahun (Rp)', mt.biayaBulan * 12], ['Selling per tahun (Rp)', mt.hargaBulan * 12],
      ['Total biaya per bulan (semua baris)', h.totalBiayaBulan], ['Investasi (Rp)', h.investasi],
      ['Total headcount', h.totalHeadcount], ['Luas gudang (m²)', h.space?.totalM2],
      ['Biaya manpower/bln (rata-rata kontrak)', h.eskalasiManpower?.rataBulan], ['Faktor kenaikan manpower', h.eskalasiManpower?.faktor],
      ['Pajak', `PPh ${h.pajak?.pph ?? '-'} (${((h.pajak?.pphPersen ?? 0) * 100).toLocaleString('id-ID')}%) · PPN ${h.pajak?.ppn ?? '-'} (${((h.pajak?.ppnPersen ?? 0) * 100).toLocaleString('id-ID')}%)`],
    ], 'Hasil utama');
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
    kv(ws, Object.entries(kol), 'Data tender', 'input');
    kv(ws, Object.entries(asumsi).filter(([, v]) => v == null || typeof v !== 'object'), 'Asumsi (skalar)', 'input');
    lebar(ws, 40);
  }

  // 3. Volume & profil order
  {
    const ws = wb.addWorksheet('Volume');
    judul(ws, 'Volume & profil order');
    tabel(ws, t.asumsi.volumes, 'Volume input (per bulan)', 'input');
    tabel(ws, h.volume as unknown[], 'Volume desain (hasil mesin)');
    if (p.profil) { tabel(ws, (p.profil as { inbound?: unknown[] }).inbound ?? [], 'Profil order inbound', 'input'); tabel(ws, (p.profil as { outbound?: unknown[] }).outbound ?? [], 'Profil order outbound', 'input');
      kv(ws, Object.entries(ratakan((p.profil as { param?: unknown }).param ?? {})), 'Parameter profil', 'input'); }
    if (p.orderAdmin) kv(ws, Object.entries(ratakan(p.orderAdmin)), 'Order admin (mobil × input)');
    lebar(ws);
  }

  // 4. Process design
  {
    const ws = wb.addWorksheet('Process Design');
    const pd = p.pd as { baris?: unknown[]; mp?: unknown[]; mhe?: unknown[]; indirect?: { rows?: unknown[] }; kalender?: unknown; beban?: unknown } | null;
    judul(ws, 'Process Design & Resource Calculation', 'Workload = volume × %; RfR = workload ÷ (prod × faktor); man hour = RfR ÷ efisiensi; FTE = man hour ÷ jam tersedia');
    tabel(ws, t.asumsi.aktivitas, 'Aktivitas (input)', 'input');
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
    judul(ws, 'Rincian biaya manpower', `UMK ${t.kab_kota}: Rp${Math.round(m.upahMinimum).toLocaleString('id-ID')} · rumus aktif (ubah sel putih tulang untuk simulasi; sel abu-abu = hasil rumus)`);
    const pm = p.paramMp;
    const par = ws.addRow(['Parameter', 'BPJS TK', 'BPJS KS', 'BPJS Pensiun', 'THR', 'Kompensasi', 'Management fee', 'Batas upah KS', 'Batas upah JP']);
    gayaHeader(par as never); par.eachCell(c => isi(c as never, HDR_INPUT));
    const rp = ws.addRow(['Nilai', pm.bpjsTk, pm.bpjsKs, pm.bpjsPensiun, pm.thr, pm.kompensasi, pm.feePersen, pm.batasUpahKs ?? 0, pm.batasUpahPensiun ?? 0]);
    const P = rp.number;
    for (let c = 2; c <= 7; c++) rp.getCell(c).numFmt = '0.00%';
    rp.getCell(8).numFmt = '#,##0'; rp.getCell(9).numFmt = '#,##0';
    for (let c = 2; c <= 9; c++) isi(rp.getCell(c) as never, SEL_INPUT);
    ws.addRow([]);
    const head = ['No', 'Jabatan', 'Level', 'Area', 'UMK', '% level', 'Gaji pokok', 'Hari kerja', 'Actual hari kerja', 'Lisensi + Insentif', 'Sub Total',
      'BPJS TK', 'BPJS KS', 'BPJS Pensiun', 'THR', 'Kompensasi', 'Supervisi & Operasional', 'Total', 'Manpower', 'Porsi (dedicated=1)', 'TOTAL'];
    gayaHeader(ws.addRow(head) as never);
    const awal = ws.rowCount + 1;
    p.rincianMp.forEach((r, i) => {
      const n = ws.rowCount + 1;
      ws.addRow([i + 1, r.role, r.level, r.area, r.umk, r.faktorLevel, r.gajiPokok, r.hariKerja, r.hariAktual, r.lisensi,
        { formula: `G${n}*MIN(1,I${n}/H${n})+J${n}`, result: r.subTotal },
        { formula: `G${n}*$B$${P}`, result: r.bpjsTk }, { formula: `MIN(G${n},IF($H$${P}>0,$H$${P},G${n}))*$C$${P}`, result: r.bpjsKs }, { formula: `MIN(G${n},IF($I$${P}>0,$I$${P},G${n}))*$D$${P}`, result: r.bpjsPensiun },
        { formula: `G${n}*$E$${P}`, result: r.thr }, { formula: `G${n}*$F$${P}`, result: r.kompensasi }, r.supervisi,
        { formula: `K${n}+L${n}+M${n}+N${n}+O${n}+P${n}+Q${n}`, result: r.total }, r.qty, r.porsi, { formula: `R${n}*S${n}*T${n}`, result: r.totalQty }]);
      const row = ws.getRow(n);
      row.getCell(6).numFmt = '0%'; row.getCell(20).numFmt = '0.00';
      for (const c of [5, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21]) row.getCell(c).numFmt = '#,##0';
      for (const c of [7, 8, 9, 10, 17, 19, 20]) isi(row.getCell(c) as never, SEL_INPUT);
      for (const c of [11, 12, 13, 14, 15, 16, 18, 21]) isi(row.getCell(c) as never, SEL_HASIL);
      hasilCell(row.getCell(21) as never);
    });
    const akhir = ws.rowCount;
    ws.autoFilter = { from: { row: awal - 1, column: 1 }, to: { row: akhir, column: 21 } };
    for (let i = awal - 1; i <= akhir; i++) for (let c = 1; c <= 21; c++) {
      const cell = ws.getRow(i).getCell(c);
      cell.border = { top: garis, bottom: garis, left: garis, right: garis };
    }
    const sub1 = p.rincianMp.reduce((x, r) => x + r.totalQty, 0);
    const s1 = ws.addRow(['', 'Sub Total Biaya-1', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', { formula: `SUM(S${awal}:S${akhir})`, result: p.rincianMp.reduce((x, r) => x + r.qty, 0) }, '', { formula: `SUM(U${awal}:U${akhir})`, result: sub1 }]);
    const fee = ws.addRow(['', 'Management Fee', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', { formula: `U${s1.number}*$G$${P}`, result: sub1 * pm.feePersen }]);
    const s2 = ws.addRow(['', 'Sub Total Biaya-2', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', { formula: `U${s1.number}+U${fee.number}`, result: sub1 * (1 + pm.feePersen) }]);
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
  { const ws = wb.addWorksheet('Space & MHE'); judul(ws, 'Space & MHE'); kv(ws, Object.entries(ratakan(h.space ?? {})), 'Space (hasil)'); tabel(ws, h.mhe as unknown[], 'MHE (hasil)'); tabel(ws, t.asumsi.mhe, 'MHE (input)', 'input'); lebar(ws); }
  { const ws = wb.addWorksheet('Biaya'); judul(ws, 'Baris biaya per bulan', 'Alokasi = porsi ke bucket storage / handling in / handling out / VAS / manajemen'); tabel(ws, h.biaya as unknown[]); tabel(ws, t.asumsi.costLines, 'Biaya lain (input)', 'input'); tabel(ws, t.asumsi.listrik, 'Listrik peralatan (input)', 'input'); lebar(ws); }
  { const ws = wb.addWorksheet('Rate & Simulasi'); judul(ws, 'Rate card, margin & simulasi'); tabel(ws, h.rateCard as unknown[], 'Rate card');
    kv(ws, Object.entries(ratakan(h.marginTotal)), 'Margin total'); tabel(ws, h.simulasi as unknown[], 'Simulasi (komitmen / rata-rata / peak)'); tabel(ws, (h.storageAlternatif ?? []) as unknown[], 'Tarif storage alternatif'); lebar(ws); }

  // 7. Master data yang dipakai
  {
    const ws = wb.addWorksheet('Master Data');
    judul(ws, 'Data master yang dipakai saat hitung', 'Dari database Leca (Price Inquiry / HR / Finance)');
    kv(ws, [['UMK / upah minimum (Rp)', m.upahMinimum], ['Status UMK', m.statusUpah], ['Area', `${t.kab_kota}, ${t.provinsi}`]], 'Upah', 'input');
    kv(ws, Object.entries(m.payroll), 'Parameter payroll (master)', 'input');
    kv(ws, Object.entries(m.finance), 'Parameter finance', 'input');
    kv(ws, Object.entries(m.margin), 'Kebijakan margin per risiko', 'input');
    tabel(ws, m.jobLevels, 'Jabatan (job levels)', 'input');
    tabel(ws, m.holidays, 'Hari libur', 'input');
    lebar(ws, 22);
  }

  // 8. Data mentah — seluruh asumsi tender (semua field) & hasil, diratakan
  {
    const ws = wb.addWorksheet('Data Mentah');
    judul(ws, 'Data mentah (path → nilai)', 'Seluruh isi asumsi tender dan hasil hitung, untuk audit');
    const dm: unknown[][] = [];
    const tulis = (sumber: string, o: unknown, pre = '') => {
      if (o == null || typeof o !== 'object') { dm.push([sumber, pre, o]); return; }
      if (Array.isArray(o)) { o.forEach((x, i) => tulis(sumber, x, `${pre}[${i}]`)); return; }
      for (const [k, v] of Object.entries(o as Baris)) tulis(sumber, v, pre ? `${pre}.${k}` : k);
    };
    tulis('asumsi', t.asumsi); tulis('hasil', h);
    tulisTabel(ws, undefined, ['Sumber', 'Path', 'Nilai'], dm, 'netral');
    ws.columns = [{ width: 10 }, { width: 70 }, { width: 30 }];
  }

  return wb;
}
