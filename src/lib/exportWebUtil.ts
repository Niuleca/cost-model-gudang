// Utilitas bersama export Excel "seperti web" (sheet bergaya kartu, rumus, droplist).
import type { HasilTender } from '@/lib/engine/index.ts';
import type { MasterData, TenderInput, Bucket, KategoriRisiko } from '@/lib/engine/types';
import type { TenderRow } from '@/lib/tender';
import { C, type NilaiSel } from '@/lib/exportRumus';
import type { PD_DEFAULT } from '@/lib/engine/processDesign';
export { C };
export type { NilaiSel };
/* eslint-disable @typescript-eslint/no-explicit-any */
type WB = any; type WS = any;
export type Fmt = 'rp' | 'n0' | 'n1' | 'n2' | 'n3' | 'pct' | 'pct1' | 'x' | 'tgl' | 'teks';
export const NF: Record<Fmt, string | undefined> = { rp: '#,##0;[Red]-#,##0', n0: '#,##0', n1: '#,##0.0', n2: '#,##0.00', n3: '#,##0.000', pct: '0.0%', pct1: '0.0%', x: '0.0000', tgl: 'dd mmm yyyy', teks: undefined };
export type J = 'in' | 'out' | 'hdr' | 'hdrIn' | 'sub' | 'tot' | 'txt' | 'none';
export interface Opt { fmt?: Fmt; j?: J; b?: boolean; al?: 'left' | 'center' | 'right'; wrap?: boolean; size?: number; color?: string; it?: boolean }

export interface ProdDb { id: number; aktivitas: string; tahap: string; tool: string; role_name: string; uom: string; prod_per_jam: number | string }
export interface ItemDb { id: number; kategori: string; item: string; satuan: string; harga_beli: number | null; harga_sewa_bulan: number | null; umur_ekonomis_bulan: number | null; daya_watt?: number | null }
export interface UpahDb { provinsi: string; kab_kota: string; upah_berlaku: number; status_verifikasi: string; tahun: number }
export interface GudangDb { id: string; nama: string; kab_kota: string; provinsi: string; luas_m2: number; harga_sewa_m2_bulan: number | null; harga_per_bulan: number | null }
export interface ItKatalogDb { id: number; kelompok: string; item: string; cost_type: string; harga: number }
export interface DaftarWeb { prods: ProdDb[]; items: ItemDb[]; jabatan: string[]; upah: UpahDb[]; tarif: { golongan: string; tarif_kwh: number }[]; gudang: GudangDb[]; itKatalog: ItKatalogDb[] }
export interface DataWeb { t: TenderRow; h: HasilTender; m: MasterData; inp: TenderInput; daftar?: DaftarWeb; nomorQuotation?: string | null; catatanMaster?: string[] }

export const SHEET_WEB = ['Key assumption', 'Volume', 'Aktivitas & manpower', 'Gudang, space & MHE', 'Interest cost', 'IT', 'Biaya lain', 'Hasil', 'Quotation'] as const;
export const MENU: [string, string][] = [['0 Ringkasan', 'Ringkasan'], ...SHEET_WEB.map(s => [s, s] as [string, string]), ['Daftar', 'Daftar (droplist)']];

export const huruf = (c: number) => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
export const A = (c: number, r: number) => `$${huruf(c)}$${r}`;
export const R = (c: number, r: number) => `${huruf(c)}${r}`;
export const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
export const g = { style: 'thin', color: { argb: C.GARIS } };
export const KOTAK = { top: g, bottom: g, left: g, right: g };
export const SUB = 'FFEDEDED';
export const LAYANAN: Record<string, string> = { storage: 'Storage', handling_in: 'Handling In', handling_out: 'Handling Out', vas: 'VAS', manajemen: 'Manajemen' };
export const BUCKETS: Bucket[] = ['storage', 'handling_in', 'handling_out', 'vas', 'manajemen'];
export const OPS: Bucket[] = ['storage', 'handling_in', 'handling_out', 'vas'];
export const RISIKO = ['Rendah', 'Sedang', 'Tinggi'] as const;
export const RISIKO_DEFAULT: Record<string, KategoriRisiko> = {
  Manpower: 'Sedang', Fasilitas: 'Rendah', Utilitas: 'Rendah', MHE: 'Sedang', Racking: 'Tinggi', IT: 'Sedang', Office: 'Rendah', Consumable: 'Rendah', HSE: 'Rendah',
  Asuransi: 'Rendah', Startup: 'Tinggi', Finance: 'Rendah', 'Interest cost': 'Rendah', Overhead: 'Rendah', Lainnya: 'Sedang',
};
export const ALOKASI: [string, Partial<Record<Bucket, number>>][] = [
  ['Manajemen (overhead)', { manajemen: 1 }], ['Merata', { storage: 0.4, handling_in: 0.3, handling_out: 0.3 }], ['Storage', { storage: 1 }],
  ['Handling in+out', { handling_in: 0.5, handling_out: 0.5 }], ['Inbound', { handling_in: 1 }], ['Outbound', { handling_out: 1 }], ['VAS', { vas: 1 }],
];
export const kunciAlok = (a: Partial<Record<Bucket, number>>) => BUCKETS.map(b => +(Number(a[b] ?? 0)).toFixed(6)).join('|');
export const normAlok = (a: Partial<Record<Bucket, number>> | undefined, fb: Partial<Record<Bucket, number>>) => {
  const src = a && Object.values(a).some(v => (v ?? 0) > 0) ? a : fb;
  const tot = BUCKETS.reduce((s, b) => s + (src[b] ?? 0), 0) || 1;
  return Object.fromEntries(BUCKETS.map(b => [b, (src[b] ?? 0) / tot])) as Record<Bucket, number>;
};
export const namaAlok = (a: Partial<Record<Bucket, number>> | undefined, fb: Partial<Record<Bucket, number>>) => {
  const n = normAlok(a, fb); return ALOKASI.find(([, v]) => kunciAlok(normAlok(v, v)) === kunciAlok(n))?.[0] ?? null;
};
export const TOOLS = ['Manual', 'FL Counter Balance', 'FL Reach Truck SPR', 'FL Reach Truck DD', 'CBT', 'RT', 'Pallet Mover', 'Hand Pallet', 'Trolley', 'PC', 'Laptop', 'HT', 'Printer', 'Scanner RDT', 'RF', 'Wrapping Machine'];
export const UOM = ['palet', 'case', 'karton', 'pcs', 'bag', 'ton', 'cbm', 'liter', 'pail', 'pack', 'roll', 'order', 'line', 'lokasi'];
export const UOM_ISI = ['case', 'karton', 'dus', 'inner', 'bag', 'sak', 'pack', 'pail', 'pcs', 'botol', 'kaleng', 'sachet', 'unit', 'kg', 'liter'];
export const INDUSTRI = ['Retail-Consumer', 'Tech', 'Fashion Retail', 'Healthcare', 'Healthcare + Cold Chain', 'E-Commerce', 'FMCG', 'Bahan bangunan', 'Otomotif', 'Kimia'];
export const MATA_UANG = ['USD', 'SGD', 'MYR', 'THB', 'VND', 'PHP', 'KRW', 'JPY', 'CNY', 'HKD', 'TWD', 'INR', 'AUD', 'EUR', 'GBP'];
export const KELAS_UOM: [string, string][] = [['case', 'case'], ['karton', 'case'], ['dus', 'case'], ['carton', 'case'], ['ctn', 'case'], ['box', 'case'],
  ['pcs', 'pcs'], ['pc', 'pcs'], ['piece', 'pcs'], ['unit', 'pcs'], ['ea', 'pcs'], ['palet', 'palet'], ['pallet', 'palet']];
export const isCase = (u: string) => ['case', 'karton', 'dus', 'carton', 'ctn', 'box'].includes((u ?? '').trim().toLowerCase());

/** Satu sheet bergaya kartu web: banner (1–3), menu tab (4, dibekukan), isi mulai baris 6. */
export class S {
  ws: WS; r = 6;
  constructor(public wb: WB, public nama: string, public judul: string, sub: string, warna = C.AKSEN) {
    this.ws = wb.addWorksheet(nama, { views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }], properties: { tabColor: { argb: warna } },
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
    this.ws.headerFooter = { oddFooter: `&L${nama}&RHalaman &P / &N` };
    for (let rr = 1; rr <= 3; rr++) for (let c = 1; c <= 24; c++) this.ws.getCell(rr, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.BANNER } };
    const c1 = this.ws.getCell(1, 1); c1.value = 'LECA · TENDER'; c1.font = { size: 9, bold: true, color: { argb: 'FF9FB6D9' } };
    const c2 = this.ws.getCell(2, 1); c2.value = judul; c2.font = { size: 16, bold: true, color: { argb: C.BANNER_INK } };
    const c3 = this.ws.getCell(3, 1); c3.value = sub; c3.font = { size: 9, italic: true, color: { argb: 'FFC9D3E0' } };
    this.ws.getRow(2).height = 24;
    MENU.forEach(([sh, l], i) => {
      const c = this.ws.getCell(4, i + 1);
      c.value = { text: l, hyperlink: `#'${sh}'!A1` };
      const on = sh === nama;
      c.font = { size: 9, bold: on, underline: !on, color: { argb: on ? 'FFFFFFFF' : 'FF1F2A37' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: on ? 'FF1F2A37' : 'FFE5E7EB' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
      c.border = { left: { style: 'thin', color: { argb: 'FFFFFFFF' } }, right: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
    });
    this.ws.getRow(4).height = 20;
  }
  cell(c: number, r = this.r) { return this.ws.getCell(r, c); }
  a(c: number, r = this.r) { return `'${this.nama}'!${A(c, r)}`; }
  rg(c: number, r0: number, r1: number) { return `'${this.nama}'!${A(c, r0)}:${A(c, Math.max(r0, r1))}`; }
  put(c: number, v: NilaiSel, o: Opt = {}, r = this.r) {
    const cell = this.ws.getCell(r, c);
    if (v && typeof v === 'object') cell.value = { formula: v.f, result: v.v ?? undefined };
    else cell.value = v ?? null;
    if (o.fmt && NF[o.fmt]) cell.numFmt = NF[o.fmt];
    const fill = o.j === 'in' ? C.INPUT : o.j === 'out' ? C.HASIL : o.j === 'hdr' ? C.HDR_RUMUS : o.j === 'hdrIn' ? C.HDR_INPUT : o.j === 'sub' ? SUB : o.j === 'tot' ? C.KPI : null;
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    if (o.j && o.j !== 'none') cell.border = KOTAK;
    const bold = o.b ?? (o.j === 'hdr' || o.j === 'hdrIn' || o.j === 'sub' || o.j === 'tot');
    cell.font = { size: o.size ?? 10, bold, italic: o.it, color: { argb: o.color ?? C.INK } };
    const al = o.al ?? (o.fmt && o.fmt !== 'teks' && o.fmt !== 'tgl' ? 'right' : 'left');
    cell.alignment = { vertical: o.j === 'hdr' || o.j === 'hdrIn' ? 'middle' : 'top', horizontal: al, wrapText: o.wrap ?? (o.j === 'hdr' || o.j === 'hdrIn' || (typeof v === 'string' && v.length > 45)) };
    return cell;
  }
  /** Judul kartu (h2) + catatan. */
  h2(t: string, note?: string, lebar = 12) {
    this.r++;
    const c = this.cell(1); c.value = t; c.font = { bold: true, size: 13, color: { argb: C.INK } };
    for (let k = 1; k <= lebar; k++) this.cell(k).border = { bottom: { style: 'medium', color: { argb: C.AKSEN } } };
    this.r++;
    if (note) this.note(note);
  }
  h3(t: string) { const c = this.cell(1); c.value = t; c.font = { bold: true, size: 11, color: { argb: C.INK } }; this.r++; }
  note(t: string) { const c = this.cell(1); c.value = t; c.font = { size: 9, italic: true, color: { argb: C.MUTED } }; this.r++; }
  /** Header tabel: teks, atau [teks, input?, catatan rumus] — catatan tampil saat sel header disorot. */
  hdr(cols: (string | [string, boolean] | [string, boolean, string])[], c0 = 1) {
    cols.forEach((h, i) => {
      const [t, inp, ket] = Array.isArray(h) ? [h[0], h[1], (h as [string, boolean, string])[2]] : [h, false, undefined];
      const c = this.put(c0 + i, t, { j: inp ? 'hdrIn' : 'hdr', al: 'center' });
      if (ket) c.note = { texts: [{ text: ket }], margins: { insetmode: 'auto' } };
    });
    this.ws.getRow(this.r).height = 30; return ++this.r;
  }
  /** Baris label | nilai | satuan | keterangan. */
  field(label: string, v: NilaiSel, fmt: Fmt, j: 'in' | 'out', satuan = '', ket = '', nama?: string, list?: string, strict = true) {
    this.put(1, label, { j: 'txt' }); this.put(2, v, { fmt, j, b: j === 'out' }); this.put(3, satuan, { j: 'none', color: C.MUTED }); this.put(4, ket, { j: 'none', size: 9, color: C.MUTED, wrap: false });
    if (nama) this.nm(nama, 2);
    if (list) this.dd(2, list, strict);
    return this.a(2, this.r++);
  }
  nm(nama: string, c: number, r = this.r) { this.wb.definedNames.add(this.a(c, r), nama); }
  nmR(nama: string, c: number, r0: number, r1: number) { this.wb.definedNames.add(this.rg(c, r0, r1), nama); }
  dd(c: number, list: string, strict = true, r = this.r) {
    this.ws.getCell(r, c).dataValidation = { type: 'list', allowBlank: true, formulae: [list], showErrorMessage: strict, errorStyle: strict ? 'stop' : 'warning',
      errorTitle: 'Pilihan', error: strict ? 'Pilih dari daftar (sama dengan droplist di web).' : 'Tidak ada di daftar — tetap dipakai sebagai isian manual.' };
  }
  lebar(...w: number[]) { w.forEach((x, i) => { this.ws.getColumn(i + 1).width = x; }); }
}

/** Baris biaya di Rincian biaya (Hasil): rumus biaya sistem + metadata untuk ringkasan & interest. */
export interface Line {
  kel: string; tahap: number; desk: NilaiSel; deskKey: string; jenis: NilaiSel; risk: NilaiSel; sistem: string; alok: NilaiSel[];
  dasar: string; v?: number; nilai?: string; qty?: NilaiSel; harga?: NilaiSel; umur?: NilaiSel; uom?: string; capex?: boolean; revisi?: number | null;
  row?: number; /* diisi saat ditulis */
  alokDari?: Line;
}


export interface Ctx {
  wb: WB; d: DataWeb; a: TenderRow['asumsi']; pd: NonNullable<HasilTender['processDesign']>; n: number; nShift: number; pdIn: typeof PD_DEFAULT;
  L0: DaftarWeb; DF: S; KA: S; VO: S; AK: S; GD: S; IC: S; IT: S; BL: S; HS: S; QU: S; S0: S;
  lk: (tabel: string, kunci: string, kolomCari: string, kolomAmbil: string, def?: string | number) => string;
  normU: (x: string) => string; isPal: (x: string) => string;
  lines: Line[];
  later: (() => void)[];
  [k: string]: unknown;
}
