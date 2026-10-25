'use client';
// Export lengkap satu tender ke Excel: input → perhitungan → hasil → data master yang dipakai.
// Dibuat di browser dengan exceljs (dimuat saat tombol ditekan).
import type { HasilTender } from '@/lib/engine/index.ts';
import type { MasterData } from '@/lib/engine/types';
import type { TenderRow } from '@/lib/tender';
import type { ParamBiayaMp, RincianBiayaRole } from '@/lib/engine/biayaMp';
import { keInput } from '@/lib/tender';
import { tulisModelWeb } from '@/lib/exportWeb';
import type { DaftarWeb } from '@/lib/exportWebUtil';

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
  pd: unknown; rincianMp: RincianBiayaRole[]; paramMp: ParamBiayaMp; profil?: unknown; orderAdmin?: unknown; nomorQuotation?: string | null; daftar?: DaftarWeb;
}

/** Nama file: Leca_Costmodel_nomor-quotation — "/" diganti "-" karena tidak boleh di nama file. Tanpa quotation → kode tender. */
export const namaFileExport = (nomor: string | null | undefined, cadangan: string) =>
  `Leca_Costmodel_${(nomor || cadangan).trim().replace(/[\\/:*?"<>|()\s-]+/g, '_').replace(/^_+|_+$/g, '')}.xlsx`;

export async function exportTenderLengkap(p: DataExport, sheets?: string[]) {
  const buf = await buatWorkbookTender(p, sheets);
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = namaFileExport(p.nomorQuotation, p.t.kode ?? p.t.customer);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const SHEET_EXPORT = ['0 Ringkasan', 'Key assumption', 'Volume', 'Aktivitas & manpower', 'Gudang, space & MHE', 'Interest cost', 'IT', 'Biaya lain', 'Hasil', 'Quotation', 'Daftar', 'Master Data', 'Data Mentah'] as const;

/** Pratinjau isi workbook: per sheet → baris nilai (formula ditampilkan hasilnya). */
export type GayaSel = { bg?: string; b?: boolean; pct?: boolean; c?: string; al?: 'left' | 'center' | 'right'; span?: number } | null;
/** Pratinjau isi workbook: per sheet → baris nilai (formula ditampilkan hasilnya) + warna/huruf tebal/perataan sel. */
export async function pratinjauWorkbook(p: DataExport, maksBaris = 400) {
  const wb = await susunWorkbook(p);
  return wb.worksheets.map(ws => {
    const rows: (string | number | null)[][] = [];
    const gaya: GayaSel[][] = [];
    let lebar = 0;
    ws.eachRow({ includeEmpty: true }, (row, i) => {
      if (i > maksBaris) return;
      const n = row.cellCount;
      const v: (string | number | null)[] = [];
      const g: GayaSel[] = [];
      for (let c = 1; c <= n; c++) {
        const cell = row.getCell(c);
        const slave = cell.isMerged && cell.master !== cell;   // sel gabungan: nilai hanya di sel utama
        const raw = slave ? null : (cell.value as unknown);
        let val: string | number | null = null;
        if (raw != null) {
          if (typeof raw === 'object' && !(raw instanceof Date)) { const o = raw as { result?: unknown; formula?: string; text?: string; richText?: { text: string }[] };
            val = (o.result ?? o.text ?? (o.richText ? o.richText.map(x => x.text).join('') : null) ?? (o.formula ? `=${o.formula.length > 40 ? o.formula.slice(0, 40) + '…' : o.formula}` : null)) as string | number | null; }   // belum ada hasil cache → tampilkan rumusnya
          else val = raw instanceof Date ? raw.toLocaleDateString('id-ID') : raw as string | number;
        }
        v.push(val);
        const argb = (cell.fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;
        const font = cell.font as { bold?: boolean; color?: { argb?: string } } | undefined;
        const b = !!font?.bold || !!(row.font as { bold?: boolean } | undefined)?.bold;
        const pct = typeof cell.numFmt === 'string' && cell.numFmt.includes('%');
        const warna = font?.color?.argb;
        const al = (cell.alignment as { horizontal?: string } | undefined)?.horizontal;
        g.push(argb || b || pct || warna || al ? { bg: argb ? `#${argb.slice(-6)}` : undefined, b, pct, c: warna ? `#${warna.slice(-6)}` : undefined,
          al: al === 'center' || al === 'right' || al === 'left' ? al : undefined } : null);
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
  const LAYANAN: Record<string, string> = { storage: 'Storage', handling_in: 'Handling In', handling_out: 'Handling Out', vas: 'VAS', manajemen: 'Manajemen' };
  /** Rate card rapi: kolom yang dibaca orang di depan (layanan, satuan, volume, biaya, GP, tarif). */
  const rateCardRapi = () => (h.rateCard as unknown as Baris[]).map(r => ({
    'Layanan': LAYANAN[String(r.bucket)] ?? r.bucket,
    'Satuan tarif / UoM': r.bucket === 'storage' ? `${r.uom}/bulan` : r.uom,
    'Volume tarif/bln': r.volumeTarif ?? r.volumeKomitmen,
    'Biaya/bln (Rp)': r.biayaBulan, 'Biaya/unit (Rp)': r.biayaPerUnit,
    'GP %': r.gpPersen, 'Harga/bln (Rp)': r.hargaBulan,
    'Tarif excl. PPN (Rp)': r.tarifPerUnit, 'PPN/unit (Rp)': r.ppnPerUnit, 'Tarif incl. PPN (Rp)': r.tarifInclPpn,
    'Tarif quotation (Rp)': r.tarifQuote,
    'Pilihan satuan lain': Array.isArray(r.opsiUom) ? (r.opsiUom as Baris[]).map(o => `${o.uom}: Rp${Math.round(Number(o.tarifExcl ?? 0)).toLocaleString('id-ID')}`).join(' · ') : '',
  }));
  const lebar = (ws: WS, w = 18) => { ws.columns.forEach((c, i) => { c.width = i === 0 ? Math.max(w + 10, 28) : w; }); };
  const hasilCell = (c: { fill: unknown; font: unknown }) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HASIL } }; c.font = { bold: true, color: { argb: HASIL_INK } }; };

  // Sheet sama dengan tab web (rumus hidup + droplist) — 0 Ringkasan format PNL
  tulisModelWeb(wb, { t, h, m, inp: keInput(t), daftar: p.daftar, nomorQuotation: p.nomorQuotation, catatanMaster: p.catatanMaster });
  void rateCardRapi; void kv; void tabel; void lebar; void hasilCell; void gayaHeader; void judul;

  // 7. Master data yang dipakai
  {
    const ws = wb.addWorksheet('Master Data', { properties: { tabColor: { argb: 'FF9CA3AF' } } });
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
    const ws = wb.addWorksheet('Data Mentah', { properties: { tabColor: { argb: 'FF9CA3AF' } } });
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
