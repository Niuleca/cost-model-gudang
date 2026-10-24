'use client';
// Workbook model ber-RUMUS: setiap angka hasil di web bisa ditelusuri di Excel.
// Urutan sheet = urutan langkah di web: Key assumption → Volume → Process Design → Biaya Manpower → Space & MHE
// → Interest cost → IT & Biaya lain → Rincian biaya → Rate card & Hasil → Ringkasan.
// Warna: header rumus/hasil silver C0C0C0 · header input abu-abu muda E7E6E6 · sel input putih tulang FAF8F2 · sel hasil abu-abu D9D9D9.
import type { HasilTender } from '@/lib/engine/index.ts';
import type { MasterData, TenderInput, Bucket } from '@/lib/engine/types';
import type { TenderRow } from '@/lib/tender';
import type { ParamBiayaMp, RincianBiayaRole } from '@/lib/engine/biayaMp';

/* eslint-disable @typescript-eslint/no-explicit-any */
type WB = any; type WS = any;
export const C = {
  HDR_RUMUS: 'FFC0C0C0', HDR_INPUT: 'FFE7E6E6', INPUT: 'FFFAF8F2', HASIL: 'FFD9D9D9',
  INK: 'FF1F1F1F', MUTED: 'FF6B6B6B', GARIS: 'FFBFBFBF', BANNER: 'FF1F2A37', BANNER_INK: 'FFFFFFFF', AKSEN: 'FF2F6FD0', KPI: 'FFEAF1FB', BAGIAN: 'FFF3F4F6',
};
type Jenis = 'input' | 'hasil' | 'label' | 'teks';
type Fmt = 'rp' | 'n0' | 'n2' | 'n3' | 'pct' | 'teks' | 'x';
const NUMFMT: Record<Fmt, string | undefined> = { rp: '#,##0;[Red]-#,##0', n0: '#,##0', n2: '#,##0.00', n3: '#,##0.000', pct: '0.00%', teks: undefined, x: '0.0000' };
export type NilaiSel = string | number | null | undefined | { f: string; v?: number | string | null };
export interface Kol { h: string; w?: number; fmt?: Fmt; jenis?: Jenis }

const huruf = (c: number) => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
export const ref = (sheet: string, col: number, row: number, abs = true) => `'${sheet}'!${abs ? '$' : ''}${huruf(col)}${abs ? '$' : ''}${row}`;

/** Pembungkus sheet: menulis banner, bagian, tabel, dan mencatat alamat sel. */
export class Lembar {
  ws: WS; nama: string; r = 1; lebar: number[] = []; o = 0;   // o = geser kolom blok parameter
  constructor(public wb: WB, nama: string, public langkah: string, judul: string, sub: string, warnaTab = C.AKSEN) {
    this.nama = nama;
    this.ws = wb.addWorksheet(nama, { views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }], properties: { tabColor: { argb: warnaTab } },
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
    this.ws.headerFooter = { oddFooter: `&L${nama}&RHalaman &P / &N` };
    const ws = this.ws;
    for (let rr = 1; rr <= 3; rr++) for (let c = 1; c <= 16; c++) ws.getCell(rr, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.BANNER } };
    ws.getCell(1, 1).value = `LECA · ${langkah}`; ws.getCell(1, 1).font = { size: 9, bold: true, color: { argb: 'FF9FB6D9' } };
    ws.getCell(2, 1).value = judul; ws.getCell(2, 1).font = { size: 16, bold: true, color: { argb: C.BANNER_INK } };
    ws.getCell(3, 1).value = sub; ws.getCell(3, 1).font = { size: 9, italic: true, color: { argb: 'FFC9D3E0' } };
    ws.getRow(2).height = 24;
    this.r = 5;
  }
  sel(c: number, r = this.r) { return this.ws.getCell(r, c); }
  alamat(c: number, r: number) { return ref(this.nama, c, r); }
  setLebar(...w: number[]) { w.forEach((x, i) => { this.ws.getColumn(i + 1).width = x; }); }
  /** Judul bagian dengan garis aksen. */
  bagian(teks: string, catatan?: string) {
    this.r++;
    const c = this.sel(1); c.value = teks; c.font = { bold: true, size: 12, color: { argb: C.INK } };
    for (let k = 1; k <= 12; k++) this.sel(k).border = { bottom: { style: 'medium', color: { argb: C.AKSEN } } };
    this.r++;
    if (catatan) { const n = this.sel(1); n.value = catatan; n.font = { size: 9, italic: true, color: { argb: C.MUTED } }; this.r++; }
  }
  isi(cell: any, v: NilaiSel, fmt?: Fmt, jenis?: Jenis) {
    if (v && typeof v === 'object') cell.value = { formula: v.f, result: v.v ?? undefined };
    else cell.value = v ?? null;
    const nf = fmt ? NUMFMT[fmt] : undefined;
    if (nf) cell.numFmt = nf;
    const g = { style: 'thin', color: { argb: C.GARIS } };
    if (jenis === 'input' || jenis === 'hasil') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: jenis === 'input' ? C.INPUT : C.HASIL } };
      cell.border = { top: g, bottom: g, left: g, right: g };
    } else if (jenis === 'label') { cell.border = { bottom: { style: 'hair', color: { argb: C.GARIS } } }; }
    if (typeof v === 'string' && v.length > 40) cell.alignment = { wrapText: true, vertical: 'top' };
  }
  /** Baris label | nilai | satuan | keterangan (untuk parameter). Mengembalikan alamat absolut sel nilai. */
  param(label: string, v: NilaiSel, fmt: Fmt, jenis: 'input' | 'hasil', satuan = '', ket = '', nama?: string) {
    const o = this.o;
    this.isi(this.sel(1 + o), label, undefined, 'label');
    this.isi(this.sel(2 + o), v, fmt, jenis);
    if (jenis === 'hasil') this.sel(2 + o).font = { bold: true };
    this.isi(this.sel(3 + o), satuan, undefined, 'label'); this.sel(3 + o).font = { color: { argb: C.MUTED } };
    this.isi(this.sel(4 + o), ket, undefined, 'label'); this.sel(4 + o).font = { size: 9, color: { argb: C.MUTED } };
    const a = this.alamat(2 + o, this.r);
    if (nama) this.wb.definedNames.add(a, nama);
    this.r++;
    return a;
  }
  /** Header tabel. */
  header(kol: Kol[], jenis: 'input' | 'hasil' | 'campur' = 'campur') {
    const g = { style: 'thin', color: { argb: C.GARIS } };
    kol.forEach((k, i) => {
      const c = this.sel(i + 1);
      c.value = k.h;
      const inp = jenis === 'input' || (jenis === 'campur' && k.jenis === 'input');
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: inp ? C.HDR_INPUT : C.HDR_RUMUS } };
      c.font = { bold: true, size: 10, color: { argb: C.INK } };
      c.alignment = { wrapText: true, vertical: 'middle', horizontal: k.fmt && k.fmt !== 'teks' ? 'right' : 'left' };
      c.border = { top: g, bottom: g, left: g, right: g };
    });
    this.ws.getRow(this.r).height = 30;
    this.r++;
    return this.r;   // baris data pertama
  }
  /** Satu baris data sesuai definisi kolom. */
  baris(kol: Kol[], nilai: NilaiSel[], tebal = false) {
    const g = { style: 'thin', color: { argb: C.GARIS } };
    kol.forEach((k, i) => {
      const c = this.sel(i + 1);
      const v = nilai[i];
      const j = k.jenis ?? (v && typeof v === 'object' ? 'hasil' : 'teks');
      this.isi(c, v, k.fmt, j === 'teks' || j === 'label' ? undefined : j);
      if (j === 'teks' || j === 'label') c.border = { top: g, bottom: g, left: g, right: g };
      if (tebal) c.font = { bold: true };
    });
    return this.r++;
  }
  kosong(n = 1) { this.r += n; }
  catatan(teks: string) { const c = this.sel(1); c.value = teks; c.font = { size: 9, italic: true, color: { argb: C.MUTED } }; this.r++; }
}

/** Rumus pembulatan harga jual (sama dengan roundupHarga di web). */
export const fRoundup = (x: string) => `IF(${x}<=0,0,IF(${x}<100,CEILING(${x},1),IF(${x}<1000,CEILING(${x},10),CEILING(${x},100))))`;

export interface DataRumus {
  t: TenderRow; h: HasilTender; m: MasterData; inp: TenderInput; rincianMp: RincianBiayaRole[]; paramMp: ParamBiayaMp;
}

const LAYANAN: Record<string, string> = { storage: 'Storage', handling_in: 'Handling In', handling_out: 'Handling Out', vas: 'VAS', manajemen: 'Manajemen' };
const BUCKETS: Bucket[] = ['storage', 'handling_in', 'handling_out', 'vas', 'manajemen'];
const OPS: Bucket[] = ['storage', 'handling_in', 'handling_out', 'vas'];
const RISIKO = ['Rendah', 'Sedang', 'Tinggi'] as const;

/** Tulis semua sheet model ber-rumus ke workbook. */
export function tulisModelRumus(wb: WB, d: DataRumus) {
  const { t, h, m, inp } = d;
  const pd = h.processDesign!;  // metode manpower selalu process design
  const n = inp.durasiKontrakBulan;
  /** deskripsi baris biaya → alamat sel biaya/bln di sheet sumber (rumus). */
  const sumber = new Map<string, string>();
  /** deskripsi baris biaya → rujukan qty / harga / umur untuk ringkasan (2-2 Other cost details). */
  const rinci = new Map<string, { qty?: NilaiSel; harga?: NilaiSel; umur?: NilaiSel; uom?: string }>();
  /** deskripsi baris capex (… — depresiasi / — amortisasi) → alamat nilai investasi. */
  const nilaiCapex = new Map<string, string>();

  // ================= 0. Ringkasan (diisi paling akhir, tapi dibuat pertama supaya jadi sheet pertama) =================
  const S0 = new Lembar(wb, '0 Ringkasan', 'RINGKASAN', `${t.customer} — ${t.kode ?? ''}`,
    `${t.kab_kota}, ${t.provinsi} · ${t.skenario_aset} · ${t.jumlah_shift} shift · kontrak ${n} bln · diekspor ${new Date().toLocaleString('id-ID')}`, 'FF1F2A37');

  // ================= 1. Key assumption =================
  const S1 = new Lembar(wb, '1 Key Assumption', 'LANGKAH 1 · KEY ASSUMPTION', 'Key assumption', 'Sel putih tulang = input (boleh diubah untuk simulasi) · sel abu-abu = hasil rumus');
  S1.setLebar(44, 18, 12, 70);
  S1.bagian('Data tender');
  S1.param('Customer', t.customer, 'teks', 'input');
  S1.param('Lokasi', `${t.kab_kota}, ${t.provinsi}`, 'teks', 'input');
  S1.param('Skenario aset', t.skenario_aset, 'teks', 'input');
  S1.param('Durasi kontrak', n, 'n0', 'input', 'bulan', 'Dipakai untuk depresiasi, amortisasi, interest & eskalasi', 'Kontrak');
  S1.param('Jumlah shift', inp.jumlahShift, 'n0', 'input', 'shift', '', 'Shift');
  S1.param('Jam efektif per shift', inp.jamEfektifPerShift, 'n2', 'input', 'jam');
  S1.param('Payment term customer', inp.paymentTermHari, 'n0', 'input', 'hari', '', 'PaymentTerm');
  S1.bagian('Kalender operasional', 'Hari kerja kalender − libur nasional & cuti bersama (dari master hari libur)');
  S1.param('Hari kerja kalender / tahun', h.kalender.hariKalenderKerja, 'n0', 'input', 'hari');
  const aLibur = S1.param('Libur nasional di hari kerja', h.kalender.liburDiHariKerja, 'n0', 'input', 'hari');
  const aHariKal = ref(S1.nama, 2, S1.r - 2);
  S1.param('Hari operasional gudang / tahun', { f: `${aHariKal}-${aLibur}`, v: h.kalender.hariOperasional }, 'n0', 'hasil', 'hari', '→ hari kerja kalender − libur', 'HariOps');
  S1.param('Hari operasional / bulan', { f: 'HariOps/12', v: h.kalender.hariOperasionalBulan }, 'n2', 'hasil', 'hari', '→ hari operasional ÷ 12', 'HariOpsBln');
  S1.bagian('Produktivitas');
  S1.param('Faktor produktivitas', inp.faktorProduktivitas, 'pct', 'input', '', 'Pengali produktivitas standar', 'FProd');
  S1.param('Efisiensi', inp.efisiensi, 'pct', 'input', '', 'Man hour = RfR ÷ efisiensi', 'Efis');
  const kal = (judul: string, k: typeof pd.kalender.mp, src: any, nama: string) => {
    S1.bagian(judul, 'Jam tersedia per bulan = (hari kerja/bln − Sabtu) × jam weekday + Sabtu × jam Sabtu');
    const aT = S1.param('Total hari / tahun', src.totalHari, 'n0', 'input', 'hari');
    const aM = S1.param('Minggu (libur)', src.minggu, 'n0', 'input', 'hari');
    const aC = S1.param('Cuti tahunan', src.cuti, 'n0', 'input', 'hari');
    const aL = S1.param('Libur nasional', src.libur, 'n0', 'input', 'hari');
    const aS = S1.param(nama === 'JamMHE' ? 'Repair & maintenance' : 'Sakit', src.sakit, 'n0', 'input', 'hari');
    const aSt = S1.param('Sabtu kerja / tahun', src.sabtuPerTahun, 'n0', 'input', 'hari');
    const aJs = S1.param('Jam kerja Sabtu', src.jamSabtu, 'n2', 'input', 'jam');
    const aJw = S1.param('Jam kerja weekday', src.jamWeekday, 'n2', 'input', 'jam');
    const aHb = S1.param('Hari kerja / bulan', { f: `(${aT}-${aM}-${aC}-${aL}-${aS})/12`, v: k.hariBulan }, 'n2', 'hasil', 'hari', '→ (total − off) ÷ 12');
    const aSb = S1.param('Sabtu / bulan', { f: `MIN(${aHb},${aSt}/12)`, v: k.sabtuBulan }, 'n2', 'hasil', 'hari');
    S1.param('Jam tersedia / bulan', { f: `(${aHb}-${aSb})*${aJw}+${aSb}*${aJs}`, v: k.jamBulan }, 'n2', 'hasil', 'jam', '', nama);
  };
  kal('Kalender Man Power', pd.kalender.mp, inp.processDesign?.mp, 'JamMP');
  kal('Kalender MHE', pd.kalender.mhe, inp.processDesign?.mhe, 'JamMHE');
  S1.bagian('Shift & alat');
  S1.param('Shift aktif (beban > 0)', pd.beban.filter(w => w > 0).length || 1, 'n0', 'input', 'shift', 'Dari distribusi beban shift', 'ShiftAktif');
  S1.param('Operating alat (dipakai bergantian)', pd.operating, 'n0', 'input', 'shift', 'Otomatis = jumlah shift aktif', 'Operating');
  S1.param('Span of control supervisor', inp.spanOfControl, 'n0', 'input', 'orang/spv');
  const aSpan = ref(S1.nama, 2, S1.r - 1);
  S1.bagian('Keuangan & pajak (master Finance)');
  S1.param('Overhead', m.finance.overheadPersen, 'pct', 'input', '', '× subtotal biaya', 'Overhead');
  S1.param('Bunga modal (working capital)', m.finance.bungaModalTahun, 'pct', 'input', '/thn', '', 'BungaModal');
  S1.param('AP supplier', m.finance.apHari, 'n0', 'input', 'hari', '', 'APHari');
  S1.param('PPh 23', m.finance.pphGrossUp, 'pct', 'input', '', '', 'PPh');
  const pph = h.pajak?.pph ?? 'exclude';
  S1.param('PPh exclude (gross-up tarif)?', pph === 'exclude' ? 1 : 0, 'n0', 'input', '1/0', '1 = harga belum termasuk PPh → tarif di-gross-up', 'PPhExcl');
  S1.param('Gross-up PPh dipakai', { f: 'PPh*PPhExcl', v: pph === 'exclude' ? m.finance.pphGrossUp : 0 }, 'pct', 'hasil', '', '', 'GrossUp');
  S1.param('PPN', h.pajak?.ppnPersen ?? 0.11, 'pct', 'input', '', '', 'PPN');
  S1.bagian('Margin per kategori risiko (master Finance)', 'Harga = Σ biaya per risiko × (1 + margin), kecuali GP manual diisi di sheet 9');
  for (const k of RISIKO) S1.param(`Margin ${k}`, m.margin[k], 'pct', 'input', 'markup', '', `M${k}`);
  S1.bagian('Upah');
  S1.param(`UMK ${t.kab_kota}`, m.upahMinimum, 'rp', 'input', 'Rp/bln', m.statusUpah, 'UMK');

  // ================= 2. Volume =================
  const S2 = new Lembar(wb, '2 Volume', 'LANGKAH 2 · VOLUME', 'Volume & profil order', 'Faktor peak = peak ÷ rata-rata · per hari = peak ÷ hari operasional/bln · per shift = per hari ÷ shift');
  S2.setLebar(16, 10, 16, 16, 16, 12, 16, 16);
  S2.bagian('Volume per bulan');
  const kv: Kol[] = [{ h: 'Arus' }, { h: 'UoM' }, { h: 'Rata-rata / bln', fmt: 'n0', jenis: 'input' }, { h: 'Peak / bln', fmt: 'n0', jenis: 'input' }, { h: 'Komitmen (MGV) / bln', fmt: 'n0', jenis: 'input' },
    { h: 'Faktor peak', fmt: 'n2' }, { h: 'Desain / hari', fmt: 'n2' }, { h: 'Desain / shift', fmt: 'n2' }];
  S2.header(kv);
  const vol: Record<string, { peak: string; komit: string; rata: string; perShift: string; row: number }> = {};
  for (const v of h.volume) {
    const r = S2.r;
    const C3 = ref(S2.nama, 3, r), C4 = ref(S2.nama, 4, r);
    S2.baris(kv, [v.arus, v.uom, v.rataRataBulan, v.peakBulan, v.komitmenBulan,
      { f: `IF(${C3}>0,${C4}/${C3},1)`, v: v.faktorPeak },
      { f: v.arus === 'storage' ? `${C4}` : `${C4}/HariOpsBln`, v: v.desainPerHari },
      { f: v.arus === 'storage' ? `${C4}` : `${ref(S2.nama, 7, r)}/Shift`, v: v.desainPerShift }]);
    vol[v.arus] = { peak: C4, komit: ref(S2.nama, 5, r), rata: C3, perShift: ref(S2.nama, 8, r), row: r };
  }
  S2.catatan('Storage = posisi/stok (tidak dibagi hari). Volume komitmen dipakai sebagai dasar tarif (sheet 9).');

  // ================= 3. Process design =================
  const S3 = new Lembar(wb, '3 Process Design', 'LANGKAH 3 · AKTIVITAS & MANPOWER', 'Process Design & resource calculation',
    'Workload = volume × % · RfR = workload ÷ (prod × faktor) · Man hour = RfR ÷ efisiensi · FTE = man hour ÷ (jam tersedia × operating)');
  S3.setLebar(5, 16, 30, 10, 26, 12, 13, 8, 9, 13, 11, 11, 12, 9, 12, 11, 9, 9);
  S3.bagian('Rincian per task & resource');
  const kp: Kol[] = [{ h: 'No', fmt: 'n0' }, { h: 'Tahap' }, { h: 'Aktivitas' }, { h: 'Arus' }, { h: 'Resource' }, { h: 'Jenis' },
    { h: 'Volume / bln', fmt: 'n0' }, { h: 'UoM' }, { h: '% volume', fmt: 'pct', jenis: 'input' }, { h: 'Workload', fmt: 'n2' }, { h: 'Prod dasar / jam', fmt: 'n2', jenis: 'input' },
    { h: 'Prod × faktor', fmt: 'n2' }, { h: 'RfR (jam)', fmt: 'n2' }, { h: 'Efisiensi', fmt: 'pct' }, { h: 'Man hour', fmt: 'n2' }, { h: 'Jam tersedia', fmt: 'n2' }, { h: 'Operating', fmt: 'n0' }, { h: 'FTE', fmt: 'n3' }];
  const p0 = S3.header(kp);
  for (const b of pd.baris) {
    const r = S3.r;
    const a = (c: number) => ref(S3.nama, c, r, false);
    const v = vol[b.arus];
    const pengali = v && (h.volume.find(x => x.arus === b.arus)?.peakBulan ?? 0) > 0 ? b.volume / (h.volume.find(x => x.arus === b.arus)!.peakBulan) : null;
    const volF: NilaiSel = v && pengali != null && Math.abs(pengali - Math.round(pengali * 1e6) / 1e6) < 1e-9
      ? { f: Math.abs(pengali - 1) < 1e-9 ? `${v.peak}` : `${v.peak}*${+pengali.toFixed(6)}`, v: b.volume } : b.volume;
    S3.baris(kp, [b.no, b.tahap, b.aktivitas, b.arus, b.resource, b.jenis, volF, b.uom, b.persen, { f: `${a(7)}*${a(9)}`, v: b.workload }, b.prodDasar,
      { f: `${a(11)}*FProd`, v: b.prod }, { f: `IF(${a(12)}>0,${a(10)}/${a(12)},0)`, v: b.rfr }, { f: 'Efis', v: b.efisiensi }, { f: `IF(${a(14)}>0,${a(13)}/${a(14)},0)`, v: b.manHour },
      { f: b.jenis === 'Equipment' ? 'JamMHE' : 'JamMP', v: b.jamTersedia }, { f: b.jenis === 'Equipment' ? 'Operating' : '1', v: b.operating },
      { f: `IF(${a(16)}>0,${a(15)}/(${a(16)}*${a(17)}),0)`, v: b.fte }]);
    if (typeof volF !== 'object') S3.sel(7, r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.INPUT } };
  }
  const p1 = S3.r - 1;
  const rgRes = `'${S3.nama}'!$E$${p0}:$E$${p1}`, rgJenis = `'${S3.nama}'!$F$${p0}:$F$${p1}`, rgFte = `'${S3.nama}'!$R$${p0}:$R$${p1}`, rgMh = `'${S3.nama}'!$O$${p0}:$O$${p1}`;
  S3.kosong();
  S3.bagian('Man Power Summary (direct)', 'FTE = Σ FTE per role · Headcount = hasil pooling multi-skill di web (bagian bulat FTE + sisa dirangkap sesuai matriks)');
  const km: Kol[] = [{ h: '' }, { h: 'Role' }, { h: 'FTE', fmt: 'n3' }, { h: 'Man hour / bln', fmt: 'n2' }, { h: 'ROUNDUP(FTE)', fmt: 'n0' }, { h: 'Headcount (pooling)', fmt: 'n0', jenis: 'input' }, { h: 'Utilisasi', fmt: 'pct' }, { h: 'Catatan rangkap' }];
  const m0 = S3.header(km);
  S3.ws.mergeCells(m0 - 1, 8, m0 - 1, 18);
  const hcRole = new Map<string, string>();
  for (const r0 of pd.mp) {
    const r = S3.r; const a = (c: number) => ref(S3.nama, c, r, false);
    S3.baris(km, ['', r0.nama, { f: `SUMIFS(${rgFte},${rgRes},${a(2)},${rgJenis},"Man Power")`, v: r0.fte }, { f: `SUMIFS(${rgMh},${rgRes},${a(2)},${rgJenis},"Man Power")`, v: r0.manHour },
      { f: `MAX(0,ROUNDUP(${a(3)}-1E-9,0))`, v: Math.ceil(r0.fte - 1e-9) }, r0.resources, { f: `IF(${a(6)}>0,${a(3)}/${a(6)},0)`, v: r0.resources ? r0.fte / r0.resources : 0 },
      r0.catatan.join(' · ')]);
    S3.ws.mergeCells(r, 8, r, 18);
    S3.sel(8, r).alignment = { wrapText: true, vertical: 'top' }; S3.sel(8, r).font = { size: 9 };
    S3.ws.getRow(r).height = Math.min(90, 15 * Math.max(1, Math.ceil(r0.catatan.join(' · ').length / 150)));
    hcRole.set(r0.nama, ref(S3.nama, 6, r));
  }
  const m1 = S3.r - 1;
  S3.baris(km, ['', 'Total direct', { f: `SUM(C${m0}:C${m1})`, v: pd.totalFteMp }, { f: `SUM(D${m0}:D${m1})`, v: pd.mp.reduce((x, y) => x + y.manHour, 0) }, { f: `SUM(E${m0}:E${m1})`, v: pd.mp.reduce((x, y) => x + Math.ceil(y.fte - 1e-9), 0) }, { f: `SUM(F${m0}:F${m1})`, v: pd.totalMp }, '', ''], true);
  S3.kosong();
  S3.bagian('Indirect & peran tetap', 'Supervisor = ROUNDUP(Σ ROUNDUP(headcount ÷ shift aktif) ÷ span) × shift aktif — bila supervisor tidak diisi manual');
  const ki: Kol[] = [{ h: '' }, { h: 'Role' }, { h: 'Keterangan' }, { h: 'Qty', fmt: 'n0' }];
  S3.header(ki);
  for (const r0 of pd.indirect.rows) {
    const r = S3.r;
    const spv = r0.ket.startsWith('Span');
    S3.baris(ki, ['', r0.nama, r0.ket, spv ? { f: `ROUNDUP(SUMPRODUCT(ROUNDUP(F${m0}:F${m1}/ShiftAktif-1E-9,0)*(F${m0}:F${m1}>0))/${aSpan},0)*ShiftAktif`, v: r0.qty } : r0.qty]);
    if (!spv) S3.sel(4, r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.INPUT } };
    const prev = hcRole.get(r0.nama);
    hcRole.set(r0.nama, prev ? `${prev}+${ref(S3.nama, 4, r)}` : ref(S3.nama, 4, r));
  }
  S3.kosong();
  S3.bagian('MHE Summary', 'Unit dasar = ROUNDUP(FTE alat) + unit pendukung indirect · Spare = ROUNDUP(unit × % spare) · Unit total = dasar + spare');
  const ke: Kol[] = [{ h: '' }, { h: 'Alat (tool)' }, { h: 'FTE', fmt: 'n3' }, { h: 'Unit indirect', fmt: 'n0', jenis: 'input' }, { h: 'Unit dasar', fmt: 'n0' }, { h: '% spare', fmt: 'pct', jenis: 'input' }, { h: 'Spare', fmt: 'n0' }, { h: 'Unit total', fmt: 'n0' }];
  S3.header(ke);
  const unitTool = new Map<string, string>();
  for (const e of pd.mhe) {
    const r = S3.r; const a = (c: number) => ref(S3.nama, c, r, false);
    const x = inp.mhe.find(y => y.tool === e.nama);
    const hm = h.mhe.find(y => y.tool === e.nama);
    S3.baris(ke, ['', e.nama, { f: `SUMIFS(${rgFte},${rgRes},${a(2)},${rgJenis},"Equipment")`, v: e.fte }, e.unitIndirect,
      { f: `IF(${a(3)}>0,MAX(0,ROUNDUP(${a(3)}-1E-9,0)),0)+${a(4)}`, v: e.resources }, x?.sparePersen ?? 0,
      { f: `IF(${a(5)}>0,MAX(0,ROUNDUP(${a(5)}*${a(6)}-1E-9,0)),0)`, v: hm?.spare ?? 0 }, { f: `${a(5)}+${a(7)}`, v: hm?.unit ?? e.resources }]);
    unitTool.set(e.nama, ref(S3.nama, 8, r));
  }

  // ================= 4. Biaya manpower =================
  const S4 = new Lembar(wb, '4 Biaya Manpower', 'LANGKAH 3b · BIAYA MANPOWER', 'Rincian biaya manpower',
    `Gaji pokok = UMK × % level · BPJS TK/KS/JP · THR & kompensasi 1/12 · × manpower × porsi · + management fee · × faktor eskalasi`);
  S4.setLebar(5, 40, 13, 14, 12, 14, 8, 8, 14, 14, 13, 13, 13, 13, 13, 13, 14, 9, 9, 15, 15, 16);
  const pm = d.paramMp;
  S4.o = 1;
  S4.bagian('Parameter (aturan pemerintah, bisa diubah)');
  S4.param('BPJS TK (JHT 3,7% + JKK 1,27% + JKM 0,3%)', pm.bpjsTk, 'pct', 'input', '', 'PP 44/2015, PP 46/2015', 'BpjsTk');
  S4.param('BPJS Kesehatan', pm.bpjsKs, 'pct', 'input', '', 'Perpres 64/2020', 'BpjsKs');
  S4.param('Batas upah BPJS Kesehatan', pm.batasUpahKs ?? 12000000, 'rp', 'input', 'Rp', '', 'BatasKs');
  S4.param('BPJS Pensiun (JP)', pm.bpjsPensiun, 'pct', 'input', '', 'PP 45/2015', 'BpjsJp');
  S4.param('Batas upah JP', pm.batasUpahPensiun ?? 10547400, 'rp', 'input', 'Rp', '', 'BatasJp');
  S4.param('THR', pm.thr, 'pct', 'input', '', 'Permenaker 6/2016 (1/12)', 'Thr');
  S4.param('Kompensasi PKWT', pm.kompensasi, 'pct', 'input', '', 'PP 35/2021 (1/12)', 'Kompensasi');
  S4.param('Management fee', pm.feePersen, 'pct', 'input', '', '', 'Fee');
  const e = h.eskalasiManpower;
  S4.bagian(`Skema kenaikan upah tiap Januari (mulai ${e.mulai})`, 'Indeks tahun ke-k = (1 + kenaikan)^k · Faktor = Σ(bulan × indeks) ÷ bulan kontrak');
  const aEsk = S4.param('Kenaikan per tahun', e.persenTahun, 'pct', 'input', '/thn', '', 'Eskalasi');
  const kEs: Kol[] = [{ h: '' }, { h: 'Tahun · periode' }, { h: 'Tahun ke-', fmt: 'n0' }, { h: 'Bulan', fmt: 'n0', jenis: 'input' }, { h: 'Indeks', fmt: 'x' }, { h: 'Bulan × indeks', fmt: 'x' }];
  const e0 = S4.header(kEs);
  for (const y of e.tahun) { const r = S4.r; S4.baris(kEs, ['', `${y.tahun} · ${y.dari} – ${y.sampai}`, y.ke, y.bulan, { f: `(1+${aEsk})^C${r}`, v: y.indeks }, { f: `D${r}*E${r}`, v: y.bulan * y.indeks }]); }
  const e1 = S4.r - 1;
  S4.param('Faktor eskalasi (rata-rata kontrak)', { f: `SUM(F${e0}:F${e1})/SUM(D${e0}:D${e1})`, v: e.faktor }, 'x', 'hasil', '', '', 'FaktorEsk');
  S4.o = 0;
  S4.kosong();
  S4.bagian('Rincian per jabatan', 'Gaji pokok = UMK × % level (kecuali diisi manual) · Sub total = gaji × MIN(1, actual ÷ hari kerja) + lisensi · Total = sub total + BPJS + THR + kompensasi + supervisi');
  const kb: Kol[] = [{ h: 'No', fmt: 'n0' }, { h: 'Jabatan' }, { h: 'Level' }, { h: 'UMK', fmt: 'rp' }, { h: '% level', fmt: 'pct', jenis: 'input' }, { h: 'Gaji pokok', fmt: 'rp' },
    { h: 'Hari kerja', fmt: 'n0', jenis: 'input' }, { h: 'Actual', fmt: 'n0', jenis: 'input' }, { h: 'Lisensi + insentif', fmt: 'rp', jenis: 'input' }, { h: 'Sub total', fmt: 'rp' },
    { h: 'BPJS TK', fmt: 'rp' }, { h: 'BPJS KS', fmt: 'rp' }, { h: 'BPJS Pensiun', fmt: 'rp' }, { h: 'THR', fmt: 'rp' }, { h: 'Kompensasi', fmt: 'rp' }, { h: 'Supervisi & ops', fmt: 'rp', jenis: 'input' },
    { h: 'Total / orang', fmt: 'rp' }, { h: 'Manpower', fmt: 'n0' }, { h: 'Porsi', fmt: 'n2', jenis: 'input' }, { h: 'Biaya / bln dasar (+fee)', fmt: 'rp' }, { h: 'Biaya / bln (× eskalasi)', fmt: 'rp' }];
  const b0 = S4.header(kb);
  const rowMp = new Map<string, number>();
  h.manpower.forEach((p, i) => {
    const r = S4.r; const a = (c: number) => `${huruf(c)}${r}`;
    rowMp.set(p.roleName, r);
    const rc = d.rincianMp.find(x => x.role === p.roleName);
    const gajiOtomatis = !rc || Math.round(rc.gajiPokok) === Math.round(rc.gajiDefault);
    const hc = hcRole.get(p.roleName);
    S4.baris(kb, [i + 1, p.roleName, rc?.level ?? '', { f: 'UMK', v: m.upahMinimum }, rc?.faktorLevel ?? 1,
      gajiOtomatis ? { f: `ROUND(${a(4)}*${a(5)},0)`, v: p.upah } : p.upah, rc?.hariKerja ?? 25, rc?.hariAktual ?? rc?.hariKerja ?? 25, p.lisensi,
      { f: `${a(6)}*MIN(1,IF(${a(7)}>0,${a(8)}/${a(7)},1))+${a(9)}`, v: p.subTotal }, { f: `${a(6)}*BpjsTk`, v: p.bpjsTk },
      { f: `MIN(${a(6)},IF(BatasKs>0,BatasKs,${a(6)}))*BpjsKs`, v: p.bpjsKes }, { f: `MIN(${a(6)},IF(BatasJp>0,BatasJp,${a(6)}))*BpjsJp`, v: p.bpjsPensiun },
      { f: `${a(6)}*Thr`, v: p.thr }, { f: `${a(6)}*Kompensasi`, v: p.kompensasi }, p.supervisi,
      { f: `SUM(${a(10)}:${a(16)})`, v: p.totalSebelumFee }, hc ? { f: hc, v: p.headcount } : p.headcount, p.porsi,
      { f: `${a(17)}*(1+Fee)*${a(18)}*${a(19)}`, v: p.biayaBulanDasar }, { f: `${a(20)}*FaktorEsk`, v: p.biayaBulan }]);
    if (!gajiOtomatis) S4.sel(6, r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.INPUT } };
    if (!hc) S4.sel(18, r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.INPUT } };
    sumber.set(`Manpower — ${p.roleName} (${p.headcount} org)`, ref(S4.nama, 21, r));
  });
  const b1 = S4.r - 1;
  S4.baris(kb, ['', 'TOTAL', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', { f: `SUM(R${b0}:R${b1})`, v: h.totalHeadcount }, '', { f: `SUM(T${b0}:T${b1})`, v: h.manpower.reduce((x, y) => x + y.biayaBulanDasar, 0) }, { f: `SUM(U${b0}:U${b1})`, v: h.manpower.reduce((x, y) => x + y.biayaBulan, 0) }], true);
  const aMpDasar = ref(S4.nama, 20, S4.r - 1);
  S4.ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 2, ySplit: 4 }];

  // ================= 5. Space & MHE =================
  const S5 = new Lembar(wb, '5 Space & MHE', 'LANGKAH 4 · GUDANG, SPACE & MHE', 'Space, sewa gudang, racking & MHE',
    'Total space = pembulatan ke atas (subtotal) · Sewa = m² × tarif (atau sewa utuh) · MHE sewa = unit × harga · beli = unit × harga ÷ MIN(umur, kontrak)');
  S5.setLebar(46, 16, 14, 14, 14, 16, 16);
  S5.bagian('Space (m²)', 'Footprint rak/lantai & staging dihitung dari sheet Space di web (dimensi rak, bay, aisle) — nilainya ditulis di sini');
  const sx = h.space.excel;
  const aPp = S5.param('Posisi palet desain (peak storage)', vol.storage ? { f: vol.storage.peak, v: h.space.ppDesain } : h.space.ppDesain, 'n0', vol.storage ? 'hasil' : 'input', 'posisi');
  const fp: [string, number][] = [['Footprint selective rack (SPR)', sx.sd.footprint], ['Footprint double deep (DDR)', sx.dd.footprint], ['Footprint block stack', sx.block.footprint], ['Footprint pallet floor', sx.floor.footprint],
    ['Staging inbound', sx.inbound.footprint], ['Staging outbound', sx.outbound.footprint], ['Fasilitas (office, toilet, charging, dll.)', sx.fasilitasM2]];
  const fp0 = S5.r;
  for (const [l, v] of fp) S5.param(l, v, 'n2', 'input', 'm²');
  const aSub = S5.param('Subtotal', { f: `SUM(B${fp0}:B${S5.r - 1})`, v: sx.subtotal }, 'n2', 'hasil', 'm²');
  const aKel = S5.param('Pembulatan ke kelipatan', (t.asumsi.space.excel as any)?.pembulatan || 1, 'n0', 'input', 'm²');
  const aTot = S5.param('Total space (space rent)', { f: `CEILING(${aSub}-1E-9,${aKel})`, v: h.space.totalM2 }, 'n0', 'hasil', 'm²', '', 'LuasM2');
  S5.param('m² per posisi palet', { f: `IF(${aPp}>0,SUM(B${fp0}:B${fp0 + 3})/${aPp},0)`, v: h.space.m2PerPP }, 'n3', 'hasil', 'm²');
  S5.bagian('Sewa gudang');
  const sw = h.biaya.find(b => b.kelompok === 'Fasilitas' && b.deskripsi.startsWith('Sewa gudang'));
  if (sw) {
    if (inp.space.sewaTetapBulan && inp.skenarioAset === 'Rental') {
      const a = S5.param('Sewa gudang utuh / bln', inp.space.sewaTetapBulan, 'rp', 'input', 'Rp/bln', `${inp.space.luasTersediaM2 ?? '?'} m² disewa utuh`);
      sumber.set(sw.deskripsi, a);
      rinci.set(sw.deskripsi, { qty: 1, harga: { f: a, v: inp.space.sewaTetapBulan }, uom: 'bulan (sewa utuh)' });
    } else {
      const aT = S5.param('Tarif sewa / m² / bln', inp.space.tarifSewaM2Bulan, 'rp', 'input', 'Rp/m²');
      sumber.set(sw.deskripsi, S5.param(sw.deskripsi, { f: `LuasM2*${aT}`, v: sw.biayaBulan }, 'rp', 'hasil', 'Rp/bln', '→ total space × tarif'));
      rinci.set(sw.deskripsi, { qty: { f: 'LuasM2', v: h.space.totalM2 }, harga: { f: aT, v: inp.space.tarifSewaM2Bulan }, uom: 'm²' });
    }
  }
  const rk = h.biaya.filter(b => b.kelompok === 'Racking' && b.deskripsi.endsWith('— depresiasi'));
  if (rk.length) {
    S5.bagian('Racking (capex)', 'Depresiasi / bln = posisi × harga ÷ MIN(umur, kontrak)');
    const kr: Kol[] = [{ h: 'Item' }, { h: 'Posisi', fmt: 'n0', jenis: 'input' }, { h: 'Harga / posisi', fmt: 'rp', jenis: 'input' }, { h: 'Umur (bln)', fmt: 'n0', jenis: 'input' }, { h: 'Nilai investasi', fmt: 'rp' }, { h: 'Depresiasi / bln', fmt: 'rp' }];
    S5.header(kr);
    for (const b of rk) {
      const nm = /Racking (\w+) \((\d+) posisi\)/.exec(b.deskripsi);
      const jenis = nm?.[1] === 'DDR' ? 'ddr' : 'spr';
      const hr = (inp.space as any).rak?.[jenis] ?? { harga: inp.space.hargaRakPerPosisi ?? 0, umurBulan: inp.space.umurRakBulan ?? 120 };
      const r = S5.r;
      S5.baris(kr, [b.deskripsi.replace(' — depresiasi', ''), Number(nm?.[2] ?? 0), hr.harga, hr.umurBulan || n, { f: `B${r}*C${r}`, v: Number(nm?.[2] ?? 0) * hr.harga }, { f: `E${r}/MIN(D${r},Kontrak)`, v: b.biayaBulan }]);
      sumber.set(b.deskripsi, ref(S5.nama, 6, r)); nilaiCapex.set(b.deskripsi, ref(S5.nama, 5, r));
      rinci.set(b.deskripsi, { qty: { f: ref(S5.nama, 2, r) }, harga: { f: ref(S5.nama, 3, r) }, umur: { f: `MIN(${ref(S5.nama, 4, r)},Kontrak)` }, uom: 'posisi' });
    }
  }
  S5.bagian('MHE', 'Unit diambil dari MHE Summary (sheet 3)');
  const kmh: Kol[] = [{ h: 'MHE' }, { h: 'Tool' }, { h: 'Mode' }, { h: 'Unit', fmt: 'n0' }, { h: 'Harga sewa/bln atau beli', fmt: 'rp', jenis: 'input' }, { h: 'Umur (bln)', fmt: 'n0', jenis: 'input' }, { h: 'Biaya / bln', fmt: 'rp' }, { h: 'Nilai investasi', fmt: 'rp' }];
  S5.header(kmh);
  for (const x of h.mhe) {
    if (x.unit === 0) continue;
    const r = S5.r;
    const u = unitTool.get(x.tool);
    const desk = x.mode === 'sewa' ? `${x.nama} — sewa (${x.unit} unit)` : `${x.nama} (${x.unit} unit) — depresiasi`;
    S5.baris(kmh, [x.nama, x.tool, x.mode, u ? { f: u, v: x.unit } : x.unit, x.harga, x.umurBulan || n,
      { f: x.mode === 'sewa' ? `D${r}*E${r}` : `D${r}*E${r}/MIN(F${r},Kontrak)`, v: h.biaya.find(b => b.deskripsi === desk)?.biayaSistem ?? h.biaya.find(b => b.deskripsi === desk)?.biayaBulan }, x.mode === 'sewa' ? '' : { f: `D${r}*E${r}`, v: x.unit * x.harga }]);
    sumber.set(desk, ref(S5.nama, 7, r));
    if (x.mode !== 'sewa') nilaiCapex.set(desk, ref(S5.nama, 8, r));
    rinci.set(desk, { qty: { f: ref(S5.nama, 4, r), v: x.unit }, harga: { f: ref(S5.nama, 5, r), v: x.harga }, umur: x.mode === 'sewa' ? '' : { f: `MIN(${ref(S5.nama, 6, r)},Kontrak)` }, uom: x.mode === 'sewa' ? 'unit · sewa/bln' : 'unit · beli' });
  }
  const ls = h.biaya.find(b => b.kelompok === 'Utilitas');
  if (ls) {
    S5.bagian('Listrik');
    if (inp.listrikSimulasi && inp.listrikSimulasi.totalBulan > 0) sumber.set(ls.deskripsi, S5.param(ls.deskripsi, inp.listrikSimulasi.totalBulan, 'rp', 'input', 'Rp/bln', `simulasi Utilities ${Math.round(inp.listrikSimulasi.kwhBulan).toLocaleString('id-ID')} kWh/bln`));
    else {
      const kwh = inp.listrik.reduce((s, l) => s + l.watt * l.qty * l.jamPerHari, 0) * h.kalender.hariOperasionalBulan / 1000;
      const aK = S5.param('Pemakaian listrik', kwh, 'n0', 'input', 'kWh/bln', 'Σ watt × qty × jam/hari × hari ops/bln ÷ 1000');
      const aTr = S5.param('Tarif listrik', inp.tarifListrikKwh, 'n2', 'input', 'Rp/kWh');
      sumber.set(ls.deskripsi, S5.param('Biaya listrik / bln', { f: `${aK}*${aTr}`, v: ls.biayaBulan }, 'rp', 'hasil', 'Rp/bln'));
      rinci.set(ls.deskripsi, { qty: { f: aK, v: kwh }, harga: { f: aTr, v: inp.tarifListrikKwh }, uom: 'kWh/bln' });
    }
  }

  // ================= 7. IT & biaya lain (dibuat sebelum 6 karena interest merujuk nilai capex) =================
  const S6 = new Lembar(wb, '6 Interest cost', 'LANGKAH 5 · INTEREST COST', 'Interest cost — simulasi pinjaman bank',
    'Flat: total bunga = pokok × bunga/12 × tenor · Menurun: pokok × bunga/12 × (tenor+1) ÷ 2 · Interest/bln = total bunga ÷ kontrak');
  const S7 = new Lembar(wb, '7 IT & Biaya lain', 'LANGKAH 6 · IT & BIAYA LAIN', 'IT, office, HSE, consumable, startup',
    'Bulanan/sewa = qty × harga · Beli = qty × harga ÷ MIN(umur, kontrak) (depresiasi) · Sekali = qty × harga ÷ kontrak (amortisasi)');
  S7.setLebar(46, 13, 10, 9, 14, 9, 15, 15);
  S7.bagian('Baris biaya (input dari tab IT & Biaya lain)');
  const kc: Kol[] = [{ h: 'Deskripsi' }, { h: 'Kelompok' }, { h: 'Mode' }, { h: 'Qty', fmt: 'n2', jenis: 'input' }, { h: 'Harga satuan', fmt: 'rp', jenis: 'input' }, { h: 'Umur (bln)', fmt: 'n0', jenis: 'input' }, { h: 'Nilai investasi', fmt: 'rp' }, { h: 'Biaya / bln', fmt: 'rp' }];
  S7.header(kc);
  for (const c of inp.costLines) {
    const r = S7.r;
    const desk = c.mode === 'beli' ? `${c.deskripsi} — depresiasi` : c.mode === 'sekali' ? `${c.deskripsi} — amortisasi` : c.deskripsi;
    const bb = h.biaya.find(b => b.deskripsi === desk);
    S7.baris(kc, [c.deskripsi, c.kelompok, c.mode, c.qty, c.hargaSatuan, c.mode === 'beli' ? (c.umurBulan || n) : '',
      c.mode === 'beli' || c.mode === 'sekali' ? { f: `D${r}*E${r}`, v: c.qty * c.hargaSatuan } : '',
      { f: c.mode === 'beli' ? `G${r}/MIN(F${r},Kontrak)` : c.mode === 'sekali' ? `G${r}/Kontrak` : `D${r}*E${r}`, v: bb?.biayaBulan }]);
    if (bb) sumber.set(desk, ref(S7.nama, 8, r));
    rinci.set(desk, { qty: { f: ref(S7.nama, 4, r), v: c.qty }, harga: { f: ref(S7.nama, 5, r), v: c.hargaSatuan },
      umur: c.mode === 'beli' ? { f: `MIN(${ref(S7.nama, 6, r)},Kontrak)` } : c.mode === 'sekali' ? { f: 'Kontrak', v: n } : '', uom: c.mode });
    if (c.mode === 'beli' || c.mode === 'sekali') nilaiCapex.set(desk, ref(S7.nama, 7, r));
  }
  const RB = '8 Rincian Biaya';
  let patchOpex: any = null;
  const sa = inp.startupAuto;
  if (sa?.aktif) {
    S7.kosong();
    S7.bagian('Startup & implementation otomatis', 'Startup = % × OPEX/bln (semua baris tahap 1 kecuali Startup) · Implementation = % × biaya manpower/bln dasar · ÷ kontrak');
    const aPo = S7.param('% startup dari OPEX/bln', sa.persenOpex, 'pct', 'input');
    const aOpex = S7.param('OPEX/bln dasar', { f: '0' }, 'rp', 'hasil', 'Rp/bln', '→ Σ biaya tahap 1 kecuali kelompok Startup (sheet 8)');
    patchOpex = S7.sel(2, S7.r - 1);
    const aNs = S7.param('Nilai startup cost', { f: `${aPo}*${aOpex}` }, 'rp', 'hasil', 'Rp');
    const st = h.biaya.find(b => b.deskripsi === 'Startup cost (otomatis) — amortisasi');
    if (st) { sumber.set(st.deskripsi, S7.param('Startup cost — amortisasi / bln', { f: `${aNs}/Kontrak`, v: st.biayaBulan }, 'rp', 'hasil', 'Rp/bln')); nilaiCapex.set(st.deskripsi, aNs); }
    const aPm = S7.param('% implementation dari biaya manpower/bln', sa.persenManpower, 'pct', 'input');
    const aNi = S7.param('Nilai implementation cost', { f: `${aPm}*${aMpDasar}` }, 'rp', 'hasil', 'Rp', '→ % × biaya manpower/bln dasar (sheet 4)');
    const im = h.biaya.find(b => b.deskripsi === 'Implementation cost (otomatis) — amortisasi');
    if (im) { sumber.set(im.deskripsi, S7.param('Implementation cost — amortisasi / bln', { f: `${aNi}/Kontrak`, v: im.biayaBulan }, 'rp', 'hasil', 'Rp/bln')); nilaiCapex.set(im.deskripsi, aNi); }
  }

  // ================= 6. Interest =================
  S6.setLebar(48, 16, 12, 10, 16, 16, 16);
  const ic = h.interestCost;
  S6.bagian('Parameter pinjaman');
  S6.param('Bunga pinjaman', ic.bungaTahun, 'pct', 'input', '/thn', '', 'BungaBank');
  S6.param('Metode (1 = flat, 0 = menurun)', ic.metode === 'menurun' ? 0 : 1, 'n0', 'input', '', '', 'Flat');
  S6.bagian('Pinjaman yang disimulasikan', 'Pokok default = nilai capex (rujuk sheet 5/7) — bisa diganti angka');
  const ki2: Kol[] = [{ h: 'Deskripsi' }, { h: 'Pokok pinjaman', fmt: 'rp' }, { h: 'Tenor (bln)', fmt: 'n0', jenis: 'input' }, { h: 'Bunga / bln awal', fmt: 'rp' }, { h: 'Total bunga', fmt: 'rp' }, { h: 'Interest cost / bln', fmt: 'rp' }];
  const i0 = S6.header(ki2);
  for (const it of ic.items) {
    const r = S6.r;
    const nc = it.sumber ? nilaiCapex.get(it.sumber) : undefined;
    const pakaiRef = !!nc && inp.interestCost?.items.find(x => x.id === it.id)?.pokok == null;
    S6.baris(ki2, [it.deskripsi, pakaiRef ? { f: nc!, v: it.pokok } : it.pokok, it.tenorBulan, { f: `B${r}*BungaBank/12`, v: it.bungaBulanAwal },
      { f: `IF(Flat=1,B${r}*BungaBank/12*C${r},B${r}*BungaBank/12*(C${r}+1)/2)`, v: it.totalBunga }, { f: `E${r}/Kontrak`, v: it.biayaBulan }]);
    if (!pakaiRef) S6.sel(2, r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.INPUT } };
    sumber.set(`Interest cost — ${it.deskripsi}`, ref(S6.nama, 6, r));
    rinci.set(`Interest cost — ${it.deskripsi}`, { qty: 1, harga: { f: ref(S6.nama, 5, r), v: it.totalBunga }, umur: { f: 'Kontrak', v: n }, uom: 'total bunga' });
  }
  if (ic.items.length) S6.baris(ki2, ['Total', { f: `SUM(B${i0}:B${S6.r - 1})`, v: ic.totalPokok }, '', '', { f: `SUM(E${i0}:E${S6.r - 1})`, v: ic.totalBunga }, { f: `SUM(F${i0}:F${S6.r - 1})`, v: ic.biayaBulan }], true);
  else S6.catatan('Tidak ada pinjaman yang dipilih — bunga tidak dihitung otomatis.');

  // ================= 8. Rincian biaya =================
  const S8 = new Lembar(wb, RB, 'LANGKAH 7 · RINCIAN BIAYA', 'Rincian biaya per bulan',
    'Setiap baris merujuk sheet sumbernya · alokasi % menyebar biaya ke Storage / Handling In / Handling Out / VAS / Manajemen');
  S8.setLebar(5, 13, 52, 9, 7, 9, 14, 16, 9, 9, 9, 9, 9, 14, 14, 14, 14, 14, 40);
  S8.bagian('Baris biaya', 'Tahap: 1 = biaya dasar · 2 = startup otomatis · 3 = interest · 4 = working capital · 5 = overhead');
  const k8: Kol[] = [{ h: 'No', fmt: 'n0' }, { h: 'Kelompok' }, { h: 'Deskripsi' }, { h: 'Risiko' }, { h: 'Tahap', fmt: 'n0' }, { h: 'Jenis' }, { h: 'Biaya sistem', fmt: 'rp' }, { h: 'Biaya / bln', fmt: 'rp' },
    ...BUCKETS.map(b => ({ h: `% ${LAYANAN[b]}`, fmt: 'pct' as Fmt, jenis: 'input' as Jenis })), ...BUCKETS.map(b => ({ h: LAYANAN[b], fmt: 'rp' as Fmt })), { h: 'Dasar hitung' }];
  const r0 = S8.header(k8);
  const tahapOf = (b: (typeof h.biaya)[number]) => b.deskripsi.startsWith('Startup cost (otomatis)') || b.deskripsi.startsWith('Implementation cost (otomatis)') ? 2
    : b.deskripsi.startsWith('Interest cost — working capital') ? 4 : b.kelompok === 'Interest cost' ? 3 : b.kelompok === 'Overhead' ? 5 : 1;
  const nBaris = h.biaya.length;
  const r1 = r0 + nBaris - 1;
  h.biaya.forEach((b, i) => {
    const r = S8.r;
    const tp = tahapOf(b);
    let sys: NilaiSel;
    const src = sumber.get(b.deskripsi);
    if (src) sys = { f: src, v: b.biayaSistem ?? b.biayaBulan };
    else if (tp === 5) sys = { f: `SUM($H$${r0}:$H$${r - 1})*Overhead`, v: b.biayaBulan };
    else if (tp === 4) sys = { f: `SUM($H$${r0}:$H$${r - 1})*MAX(0,PaymentTerm-APHari)/30*BungaModal/12`, v: b.biayaBulan };
    else sys = b.biayaSistem ?? b.biayaBulan;
    const direvisi = b.biayaSistem != null;
    S8.baris(k8, [i + 1, b.kelompok, b.deskripsi, b.kategoriRisiko, tp, b.jenis === 'capex' ? 'Capex' : b.jenis === 'interest' ? 'Interest' : 'Opex', sys,
      direvisi ? b.biayaBulan : { f: `G${r}`, v: b.biayaBulan },
      ...BUCKETS.map(k => b.alokasi[k] ?? 0), ...BUCKETS.map((k, j) => ({ f: `$H${r}*${huruf(9 + j)}${r}`, v: b.biayaBulan * (b.alokasi[k] ?? 0) })), b.dasar]);
    if (typeof sys !== 'object') S8.sel(7, r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.INPUT } };
    if (direvisi) { S8.sel(8, r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.INPUT } }; S8.sel(8, r).note = 'Direvisi manual di web (nilai sistem di kolom G)'; }
  });
  const aTotal = ref(S8.nama, 8, S8.r);
  // baris tahap 1 berurutan di awal → OPEX dasar startup tanpa referensi melingkar
  const nT1 = h.biaya.filter(b => tahapOf(b) === 1).length;
  if (patchOpex) { const v = h.biaya.filter(b => tahapOf(b) === 1 && b.kelompok !== 'Startup').reduce((x, b) => x + b.biayaBulan, 0);
    patchOpex.value = { formula: `SUMIFS('${RB}'!$H$${r0}:$H$${r0 + nT1 - 1},'${RB}'!$B$${r0}:$B$${r0 + nT1 - 1},"<>Startup")`, result: v }; }
  S8.baris(k8, ['', '', 'TOTAL BIAYA / BLN', '', '', '', { f: `SUM(G${r0}:G${r1})`, v: h.biaya.reduce((x, b) => x + (b.biayaSistem ?? b.biayaBulan), 0) }, { f: `SUM(H${r0}:H${r1})`, v: h.totalBiayaBulan }, '', '', '', '', '',
    ...BUCKETS.map((k, j) => ({ f: `SUM(${huruf(14 + j)}${r0}:${huruf(14 + j)}${r1})`, v: h.biaya.reduce((x, b) => x + b.biayaBulan * (b.alokasi[k] ?? 0), 0) })), ''], true);
  wb.definedNames.add(aTotal, 'TotalBiaya');
  S8.kosong();
  S8.bagian('Porsi biaya per kategori');
  const kk: Kol[] = [{ h: '' }, { h: 'Kategori' }, { h: '' }, { h: '' }, { h: '' }, { h: '' }, { h: 'Biaya / thn', fmt: 'rp' }, { h: 'Biaya / bln', fmt: 'rp' }, { h: '%', fmt: 'pct' }];
  S8.header(kk);
  const kat = Object.entries(h.perKelompok).sort((a, b) => b[1] - a[1]);
  const kat0 = S8.r;
  for (const [k, v] of kat) { const r = S8.r; S8.baris(kk, ['', k, '', '', '', '', { f: `H${r}*12`, v: v * 12 }, { f: `SUMIFS($H$${r0}:$H$${r1},$B$${r0}:$B$${r1},B${r})`, v }, { f: `IF(TotalBiaya>0,H${r}/TotalBiaya,0)`, v: h.totalBiayaBulan ? v / h.totalBiayaBulan : 0 }]); }
  const katRange = { r0: kat0, r1: S8.r - 1 };
  S8.kosong();
  S8.bagian('Opex vs capex');
  const jen0 = S8.header(kk);
  for (const [l, k, j] of [['Opex', 'Opex', 'opex'], ['Capex', 'Capex', 'capex'], ['Interest cost', 'Interest', 'interest']] as const) { const r = S8.r; const v = h.perJenis[j];
    S8.baris(kk, ['', l, '', '', '', '', { f: `H${r}*12`, v: v * 12 }, { f: `SUMIFS($H$${r0}:$H$${r1},$F$${r0}:$F$${r1},"${k}")`, v }, { f: `IF(TotalBiaya>0,H${r}/TotalBiaya,0)`, v: h.totalBiayaBulan ? v / h.totalBiayaBulan : 0 }]); }
  const jenRange = { r0: jen0, r1: S8.r - 1 };

  // ================= 9. Rate card & hasil =================
  const S9 = new Lembar(wb, '9 Rate Card', 'LANGKAH 8 · HASIL', 'Rate card, margin & simulasi',
    'Biaya bucket per risiko + manajemen disebar sesuai porsi · Harga = Σ biaya × (1 + margin) atau biaya ÷ (1 − GP manual) · ÷ (1 − PPh gross-up) · Tarif = harga ÷ volume (dibulatkan ke atas)');
  S9.setLebar(16, 15, 15, 15, 15, 15, 15, 11, 15, 15, 13, 14, 13, 14, 14, 11, 16);
  S9.bagian('Biaya per layanan & kategori risiko', 'Manajemen (biaya tetap) disebar ke layanan operasional sesuai porsi biaya masing-masing');
  const kr9: Kol[] = [{ h: 'Layanan' }, { h: 'Rendah', fmt: 'rp' }, { h: 'Sedang', fmt: 'rp' }, { h: 'Tinggi', fmt: 'rp' }, { h: 'Porsi ops', fmt: 'pct' },
    { h: '+ Manajemen R', fmt: 'rp' }, { h: '+ Manajemen S', fmt: 'rp' }, { h: '+ Manajemen T', fmt: 'rp' }, { h: 'Biaya / bln', fmt: 'rp' }];
  const q0 = S9.header(kr9);
  const kolB = (b: Bucket) => `'${RB}'!$${huruf(14 + BUCKETS.indexOf(b))}$${r0}:$${huruf(14 + BUCKETS.indexOf(b))}$${r1}`;
  const rgR = `'${RB}'!$D$${r0}:$D$${r1}`;
  const opsTot = OPS.map(b => `SUM(${kolB(b)})`).join('+');
  const rowB = new Map<Bucket, number>();
  const pre = (b: Bucket, k?: string) => h.biaya.filter(x => !k || x.kategoriRisiko === k).reduce((y, x) => y + x.biayaBulan * (x.alokasi[b] ?? 0), 0);
  const totOps = OPS.reduce((y, b) => y + pre(b), 0) || 1;
  for (const b of OPS) {
    const r = S9.r; rowB.set(b, r);
    S9.baris(kr9, [LAYANAN[b], ...RISIKO.map(k => ({ f: `SUMIFS(${kolB(b)},${rgR},"${k}")`, v: pre(b, k) })), { f: `IF((${opsTot})>0,SUM(${kolB(b)})/(${opsTot}),0)`, v: pre(b) / totOps },
      ...RISIKO.map((k, j) => ({ f: `${huruf(2 + j)}${r}+SUMIFS(${kolB('manajemen')},${rgR},"${k}")*E${r}`, v: h.biayaPerBucket[b][k] })), { f: `SUM(F${r}:H${r})`, v: h.rateCard.find(x => x.bucket === b)?.biayaBulan ?? 0 }]);
  }
  S9.kosong();
  S9.bagian('Rate card', 'GP manual kosong = pakai margin per risiko · Tarif excl = ROUNDUP(harga ÷ volume tarif) ke 1 / 10 / 100');
  const kt: Kol[] = [{ h: 'Layanan' }, { h: 'Biaya / bln', fmt: 'rp' }, { h: 'Harga default', fmt: 'rp' }, { h: 'GP manual', fmt: 'pct', jenis: 'input' }, { h: 'Harga sblm PPh', fmt: 'rp' }, { h: 'Harga / bln (gross-up)', fmt: 'rp' },
    { h: 'GP %', fmt: 'pct' }, { h: 'UoM tarif' }, { h: 'Volume komitmen arus', fmt: 'n0' }, { h: 'Rasio UoM', fmt: 'x', jenis: 'input' }, { h: 'Volume tarif', fmt: 'n2' },
    { h: 'Tarif excl. PPN', fmt: 'rp' }, { h: 'PPN / unit', fmt: 'rp' }, { h: 'Tarif incl. PPN', fmt: 'rp' }, { h: 'Biaya / unit', fmt: 'rp' }];
  const t0 = S9.header(kt);
  const rowT = new Map<Bucket, number>();
  for (const rc of h.rateCard) {
    const r = S9.r; rowT.set(rc.bucket, r);
    const rb = rowB.get(rc.bucket)!;
    const v = vol[rc.bucket === 'storage' ? 'storage' : rc.bucket === 'handling_in' ? 'inbound' : rc.bucket === 'handling_out' ? 'outbound' : 'vas'];
    const mm = t.asumsi.marginManual?.[rc.bucket];
    S9.baris(kt, [LAYANAN[rc.bucket], { f: `I${rb}`, v: rc.biayaBulan }, { f: `F${rb}*(1+MRendah)+G${rb}*(1+MSedang)+H${rb}*(1+MTinggi)`, v: RISIKO.reduce((y, k) => y + h.biayaPerBucket[rc.bucket][k] * (1 + m.margin[k]), 0) }, mm != null && Number.isFinite(mm) ? Number(mm) : null,
      { f: `IF(D${r}="",C${r},B${r}/(1-MIN(0.95,D${r})))`, v: rc.hargaSebelumPph }, { f: `E${r}/(1-GrossUp)`, v: rc.hargaBulan }, { f: `IF(E${r}>0,1-B${r}/E${r},0)`, v: rc.gpPersen },
      rc.uom, v ? { f: v.komit, v: rc.volumeKomitmenArus } : rc.volumeKomitmenArus, rc.volumeTetap ? null : rc.rasioUom,
      rc.volumeTetap ? rc.volumeTarif : { f: `I${r}*J${r}`, v: rc.volumeTarif },
      { f: fRoundup(`IF(K${r}>0,F${r}/K${r},0)`), v: rc.tarifPerUnit }, { f: `N${r}-L${r}`, v: rc.ppnPerUnit }, { f: fRoundup(`L${r}*(1+PPN)`), v: rc.tarifInclPpn }, { f: `IF(K${r}>0,B${r}/K${r},0)`, v: rc.biayaPerUnit }]);
    if (rc.volumeTetap) S9.sel(11, r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.INPUT } };
  }
  const t1 = S9.r - 1;
  S9.baris(kt, ['TOTAL', { f: `SUM(B${t0}:B${t1})`, v: h.marginTotal.biayaBulan }, { f: `SUM(C${t0}:C${t1})` }, '', { f: `SUM(E${t0}:E${t1})`, v: h.marginTotal.hargaSebelumPph }, { f: `SUM(F${t0}:F${t1})`, v: h.marginTotal.hargaBulan },
    { f: `IF(E${S9.r}>0,1-B${S9.r}/E${S9.r},0)`, v: h.marginTotal.gpPersen }, '', '', '', '', '', '', '', ''], true);
  const aTotRc = S9.r - 1;
  S9.kosong();
  S9.bagian('Simulasi pendapatan', 'Pendapatan = Σ tarif × volume skenario × rasio UoM × (1 − PPh) · GP = pendapatan − total biaya');
  const ks: Kol[] = [{ h: 'Skenario' }, { h: 'Pendapatan bersih / bln', fmt: 'rp' }, { h: 'Invoice incl. PPN', fmt: 'rp' }, { h: 'Total biaya / bln', fmt: 'rp' }, { h: 'GP / bln', fmt: 'rp' }, { h: 'GP %', fmt: 'pct' }];
  S9.header(ks);
  const sk: [string, 'rata' | 'peak' | 'komit'][] = [['Volume komitmen', 'komit'], ['Volume rata-rata', 'rata'], ['Volume peak', 'peak']];
  const simRow: number[] = [];
  sk.forEach(([l, key], i) => {
    const r = S9.r; simRow.push(r);
    const suku = h.rateCard.map(rc => {
      const rr = rowT.get(rc.bucket)!;
      const v = vol[rc.bucket === 'storage' ? 'storage' : rc.bucket === 'handling_in' ? 'inbound' : rc.bucket === 'handling_out' ? 'outbound' : 'vas'];
      return rc.volumeTetap || !v ? `L${rr}*K${rr}` : `L${rr}*${v[key]}*J${rr}`;
    }).join('+') || '0';
    const sim = h.simulasi[i];
    S9.baris(ks, [l, { f: `(${suku})*(1-PPh)`, v: sim?.pendapatanBulan }, { f: `(${suku})*(1+PPN)`, v: sim?.invoiceInclPpn }, { f: 'TotalBiaya', v: h.totalBiayaBulan },
      { f: `B${r}-D${r}`, v: sim?.gp }, { f: `IF(B${r}>0,E${r}/B${r},0)`, v: sim?.gpPersen }]);
  });
  if (h.storageAlternatif.length > 1) {
    S9.kosong();
    S9.bagian('Tarif storage alternatif', '→ harga storage / bln ÷ basis (m², kg, CBM, liter)');
    const rs = rowT.get('storage')!;
    const kal2: Kol[] = [{ h: 'Basis' }, { h: 'Volume basis', fmt: 'n2', jenis: 'input' }, { h: 'Tarif / bln', fmt: 'rp' }];
    S9.header(kal2);
    for (const alt of h.storageAlternatif.slice(1)) {
      const r = S9.r;
      const basis = alt.uom === 'm²' ? { f: 'LuasM2', v: h.space.totalM2 } : alt.uom === 'kg' ? (inp.stokTon ?? 0) * 1000 : alt.uom === 'CBM' ? inp.stokCbm ?? 0 : inp.stokLiter ?? 0;
      S9.baris(kal2, [alt.uom, basis, { f: fRoundup(`IF(B${r}>0,$F$${rs}/MAX(1,B${r}),0)`), v: alt.tarif }]);
    }
  }

  // ================= 0. Ringkasan (isi) — tabel bergaris ala PNL =================
  // Hasil utama · 1-1 PNL · 2-1 Manpower · 2-2 Other cost · 3 Porsi kategori · 4 Opex vs capex · 5 Rate card · 6 Alur · legenda — semua rumus ke sheet 1–9.
  S0.setLebar(22, 46, 16, 16, 18, 18, 20, 50);
  const ws0 = S0.ws;
  for (let rr = 1; rr <= 3; rr++) for (let c = 9; c <= 16; c++) ws0.getCell(rr, c).fill = { type: 'pattern', pattern: 'none' };   // banner selebar tabel
  const R9 = '9 Rate Card', R4 = '4 Biaya Manpower';
  const GR = { style: 'thin', color: { argb: 'FF8C8C8C' } };
  const KOTAK = { top: GR, bottom: GR, left: GR, right: GR };
  let nK = 8;
  type Opsi = { b?: boolean; bg?: string };
  const angka = (f?: Fmt) => !!f && f !== 'teks';
  const tulis = (r: number, c: number, v: NilaiSel, fmt?: Fmt, o: Opsi = {}, al?: 'left' | 'center' | 'right') => {
    const cell = ws0.getCell(r, c);
    S0.isi(cell, v, fmt);
    cell.border = KOTAK;
    cell.font = { size: 10, bold: !!o.b, color: { argb: C.INK } };
    if (o.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.bg } };
    const a = al ?? (angka(fmt) ? 'right' : c === 1 ? 'center' : 'left');
    cell.alignment = { vertical: 'middle', horizontal: a, wrapText: true, indent: a === 'center' ? 0 : 1 };
  };
  const judulTabel = (teks: string, lebarTabel: number, kanan = '[Currency : IDR]') => {
    nK = lebarTabel;
    const c = S0.sel(1); c.value = teks; c.font = { bold: true, size: 11, color: { argb: C.INK } };
    if (kanan) { const k = S0.sel(nK); k.value = kanan; k.font = { size: 9, color: { argb: C.MUTED } }; k.alignment = { horizontal: 'right' }; }
    S0.r++;
  };
  const header = (hs: string[]) => { for (let c = 1; c <= nK; c++) tulis(S0.r, c, hs[c - 1] ?? null, undefined, { b: true, bg: C.HDR_RUMUS }, 'center'); ws0.getRow(S0.r).height = 30; S0.r++; };
  const baris = (vals: NilaiSel[], fmts: (Fmt | undefined)[], o: Opsi = {}) => { for (let c = 1; c <= nK; c++) tulis(S0.r, c, vals[c - 1] ?? null, fmts[c - 1], o); return S0.r++; };
  const gabung = (r0: number, r1: number, teks: string) => { if (r1 > r0) ws0.mergeCells(r0, 1, r1, 1); const c = ws0.getCell(r0, 1); c.value = teks; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.font = { size: 10, bold: true }; };
  const bar = (kol: string, a0: number, a1: number) => { if (a1 >= a0) ws0.addConditionalFormatting({ ref: `${kol}${a0}:${kol}${a1}`, rules: [{ type: 'dataBar', priority: 1, minLength: 0, maxLength: 100, gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF555555' } }] }); };
  const RP2: (Fmt | undefined)[] = [undefined, undefined, undefined, undefined, undefined, 'rp', 'rp'];

  S0.r = 6;
  // ---------- Hasil utama ----------
  judulTabel('Hasil utama', 4);
  header(['Category', 'Item', 'Per bulan', 'Per tahun']);
  const s0 = h.simulasi[0];
  baris(['Selling', 'Selling (bersih PPh)', { f: `'${R9}'!B${simRow[0]}`, v: s0?.pendapatanBulan }, { f: `'${R9}'!B${simRow[0]}*12`, v: (s0?.pendapatanBulan ?? 0) * 12 }], [undefined, undefined, 'rp', 'rp']);
  baris(['Cost', 'Cost', { f: 'TotalBiaya', v: h.totalBiayaBulan }, { f: 'TotalBiaya*12', v: h.totalBiayaBulan * 12 }], [undefined, undefined, 'rp', 'rp']);
  const hp0 = baris(['', 'Profit', { f: `'${R9}'!E${simRow[0]}`, v: s0?.gp }, { f: `'${R9}'!E${simRow[0]}*12`, v: (s0?.gp ?? 0) * 12 }], [undefined, undefined, 'rp', 'rp'], { b: true, bg: C.HASIL });
  const hp1 = baris(['', 'Margin (GP %)', { f: `'${R9}'!F${simRow[0]}`, v: s0?.gpPersen }], [undefined, undefined, 'pct'], { b: true, bg: C.HASIL });
  gabung(hp0, hp1, 'Profit');
  const ho0 = baris(['', 'Jumlah manpower', { f: `'${R4}'!R${b1 + 1}`, v: h.totalHeadcount }], [undefined, undefined, 'n0']);
  const ho1 = baris(['', 'Luas gudang (m²)', { f: 'LuasM2', v: h.space.totalM2 }], [undefined, undefined, 'n0']);
  gabung(ho0, ho1, 'Operasional');
  S0.catatan('Semua angka merujuk sheet perhitungan — ubah input (sel putih tulang) di sheet 1–9, ringkasan ikut berubah');
  S0.r += 2;

  // ---------- 1-1. PNL ----------
  judulTabel(`1-1. PNL (kontrak ${n} bulan)`, 8);
  header(['Category', 'Item', 'UOM', 'Qty', 'Price', 'Month', `${n} Month (kontrak)`, 'Remarks']);
  const sub = (label: string, fM: string, vM: number, ket = '', bg = C.HASIL) => {
    const r = S0.r;
    baris(['', label, '', '', '', { f: fM, v: vM }, { f: `F${r}*Kontrak`, v: vM * n }, ket], RP2, { b: true, bg });
    ws0.getCell(r, 1).fill = { type: 'pattern', pattern: 'none' };
    return r;
  };
  const sel0 = S0.r;
  let jualKotor = 0;
  for (const rc of h.rateCard) {
    const rr = rowT.get(rc.bucket)!; const r = S0.r;
    const vM = (rc.tarifPerUnit ?? 0) * (rc.volumeTarif ?? 0); jualKotor += vM;
    baris(['', LAYANAN[rc.bucket], { f: `'${R9}'!H${rr}`, v: rc.uom }, { f: `'${R9}'!K${rr}`, v: rc.volumeTarif }, { f: `'${R9}'!L${rr}`, v: rc.tarifPerUnit },
      { f: `D${r}*E${r}`, v: vM }, { f: `F${r}*Kontrak`, v: vM * n }, `Komitmen / MOQ per bulan · GP ${((rc.gpPersen ?? 0) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`],
      [undefined, undefined, undefined, 'n0', 'rp', 'rp', 'rp']);
  }
  const rSum = sub('Sum (gross)', h.rateCard.length ? `SUM(F${sel0}:F${S0.r - 1})` : '0', jualKotor);
  const rPph = S0.r;
  baris(['', 'Potongan PPh 23 (dipotong customer)', '%', { f: 'PPh', v: m.finance.pphGrossUp }, '', { f: `-F${rSum}*PPh`, v: -jualKotor * m.finance.pphGrossUp }, { f: `F${rPph}*Kontrak`, v: -jualKotor * m.finance.pphGrossUp * n }, 'Tarif sudah di-gross-up bila PPh exclude'],
    [undefined, undefined, undefined, 'pct', undefined, 'rp', 'rp']);
  const rNet = sub('Selling bersih', `F${rSum}+F${rPph}`, s0?.pendapatanBulan ?? 0, `= sheet 9 simulasi volume komitmen`, C.KPI);
  gabung(sel0, rNet, 'Selling');
  const rgKel = `'${RB}'!$B$${r0}:$B$${r1}`, rgBiaya = `'${RB}'!$H$${r0}:$H$${r1}`;
  const INDIRECT = ['Overhead', 'Interest cost'];
  const katDirect = kat.filter(([k]) => !INDIRECT.includes(k)).sort((a, b) => (a[0] === 'Manpower' ? -1 : b[0] === 'Manpower' ? 1 : b[1] - a[1]));
  const cost0 = S0.r;
  let vDirect = 0;
  for (const [k, v] of katDirect) {
    const r = S0.r; vDirect += v;
    const q: NilaiSel = k === 'Manpower' ? { f: `'${R4}'!R${b1 + 1}`, v: h.totalHeadcount } : k === 'Fasilitas' ? { f: 'LuasM2', v: h.space.totalM2 } : '';
    baris(['', k, k === 'Manpower' ? 'orang' : k === 'Fasilitas' ? 'm²' : 'Set', q, q ? { f: `IF(D${r}>0,F${r}/D${r},0)` } : '',
      { f: `SUMIFS(${rgBiaya},${rgKel},B${r})`, v }, { f: `F${r}*Kontrak`, v: v * n },
      k === 'Manpower' ? 'Rincian di 2-1' : k === 'Fasilitas' ? 'Price = rata-rata per m² (sewa + fasilitas)' : 'Rincian di 2-2'], [undefined, undefined, undefined, 'n0', 'rp', 'rp', 'rp']);
  }
  const rCost = sub('Sum', katDirect.length ? `SUM(F${cost0}:F${S0.r - 1})` : '0', vDirect);
  gabung(cost0, rCost, 'Cost');
  const ind0 = S0.r;
  let vInd = 0;
  for (const k of INDIRECT) {
    const v = (h.perKelompok as Record<string, number>)[k] ?? 0; vInd += v; const r = S0.r;
    baris(['', k, 'Set', '', '', { f: `SUMIFS(${rgBiaya},${rgKel},B${r})`, v }, { f: `F${r}*Kontrak`, v: v * n },
      k === 'Overhead' ? '% overhead × subtotal biaya (master Finance)' : 'Bunga pinjaman bank + working capital'], RP2);
  }
  const rInd = sub('Sum', `SUM(F${ind0}:F${S0.r - 1})`, vInd);
  gabung(ind0, rInd, 'Indirect Cost');
  const rTc = S0.r;
  baris(['Total Cost', '', '', '', '', { f: `F${rCost}+F${rInd}`, v: h.totalBiayaBulan }, { f: `F${rTc}*Kontrak`, v: h.totalBiayaBulan * n },
    { f: `IF(ABS(F${rTc}-TotalBiaya)<1,"✓ sama dengan total sheet 8","⚠ cek: beda dengan total sheet 8")` }], RP2, { b: true, bg: C.HASIL });
  const rGp = S0.r;
  baris(['Gross Profit', '', '', '', '', { f: `F${rNet}-F${rTc}`, v: s0?.gp }, { f: `G${rNet}-G${rTc}`, v: (s0?.gp ?? 0) * n }], RP2, { b: true, bg: C.KPI });
  baris(['(%)', '', '', '', '', { f: `IF(F${rNet}>0,F${rGp}/F${rNet},0)`, v: s0?.gpPersen }, { f: `IF(G${rNet}>0,G${rGp}/G${rNet},0)`, v: s0?.gpPersen }],
    [undefined, undefined, undefined, undefined, undefined, 'pct', 'pct'], { b: true, bg: C.KPI });
  S0.r += 2;

  // ---------- 2. Cost details ----------
  const c2 = S0.sel(1); c2.value = '2. Cost Details'; c2.font = { bold: true, size: 12, color: { argb: C.INK } }; S0.r += 2;
  judulTabel('2-1. Manpower', 8);
  header(['Category', 'Position', 'Rate / org / bln', 'Pax / shift', 'Shift', 'Total manpower', 'Cost / bln', `${n} Month (kontrak)`]);
  const shiftOf = new Map<string, number[]>();
  const tambahShift = (nama: string, ps: number[] | null | undefined) => { if (!ps) return; const a = shiftOf.get(nama) ?? ps.map(() => 0); ps.forEach((x, i) => { a[i] = (a[i] ?? 0) + x; }); shiftOf.set(nama, a); };
  for (const x of pd.mp) tambahShift(x.nama, (x as any).perShift);
  for (const x of pd.indirect.rows) tambahShift(x.nama, (x as any).perShift);
  const direct = new Set(pd.mp.filter(x => x.resources > 0).map(x => x.nama));
  const mp0 = S0.r;
  for (const p of [...h.manpower].sort((a, b) => Number(direct.has(b.roleName)) - Number(direct.has(a.roleName)))) {
    const r4 = rowMp.get(p.roleName)!; const r = S0.r;
    const ps = shiftOf.get(p.roleName);
    const aktif = ps ? ps.filter(x => x > 0).length : 0;
    const teks = ps && aktif ? ps.map((x, i) => x > 0 ? `S${i + 1}: ${Math.round(x * 10) / 10}` : null).filter(Boolean).join(' · ') : '—';
    baris([direct.has(p.roleName) ? 'Direct' : 'Indirect', p.roleName, { f: `IF(F${r}>0,G${r}/F${r},0)`, v: p.headcount ? p.biayaBulan / p.headcount : 0 }, teks,
      aktif || { f: 'ShiftAktif', v: pd.beban.filter(w => w > 0).length || 1 }, { f: `'${R4}'!R${r4}`, v: p.headcount }, { f: `'${R4}'!U${r4}`, v: p.biayaBulan }, { f: `G${r}*Kontrak`, v: p.biayaBulan * n }],
      [undefined, undefined, 'rp', undefined, 'n0', 'n0', 'rp', 'rp']);
    ws0.getCell(r, 4).alignment = { vertical: 'middle', horizontal: 'center' };
  }
  const mp1 = S0.r - 1;
  const tMp = h.manpower.reduce((x, y) => x + y.biayaBulan, 0);
  baris(['Total', '', '', '', '', { f: `SUM(F${mp0}:F${mp1})`, v: h.totalHeadcount }, { f: `SUM(G${mp0}:G${mp1})`, v: tMp }, { f: `SUM(H${mp0}:H${mp1})`, v: tMp * n }],
    [undefined, undefined, undefined, undefined, undefined, 'n0', 'rp', 'rp'], { b: true, bg: C.HASIL });
  S0.r += 2;

  judulTabel('2-2. Other Cost Details', 8);
  header(['Category', 'Item', 'Price', 'Qty', 'Depreciation (bln)', 'Month', `${n} Month (kontrak)`, 'Remarks']);
  const oc0 = S0.r;
  let vOc = 0;
  h.biaya.forEach((b, i) => {
    if (b.kelompok === 'Manpower') return;
    const r = S0.r; vOc += b.biayaBulan;
    const d0 = rinci.get(b.deskripsi);
    baris([b.kelompok, b.deskripsi.replace(/ — (depresiasi|amortisasi)$/, ''), d0?.harga ?? '', d0?.qty ?? '', d0?.umur ?? '', { f: `'${RB}'!H${r0 + i}`, v: b.biayaBulan }, { f: `F${r}*Kontrak`, v: b.biayaBulan * n },
      [d0?.uom, b.jenis === 'capex' ? 'capex' : b.jenis === 'interest' ? 'interest' : 'opex', b.dasar].filter(Boolean).join(' · ')], [undefined, undefined, 'rp', 'n2', 'n0', 'rp', 'rp']);
  });
  const oc1 = S0.r - 1;
  baris(['Total', '', '', '', '', { f: oc1 >= oc0 ? `SUM(F${oc0}:F${oc1})` : '0', v: vOc }, { f: oc1 >= oc0 ? `SUM(G${oc0}:G${oc1})` : '0', v: vOc * n }], RP2, { b: true, bg: C.HASIL });
  S0.r += 2;

  // ---------- 3. Porsi biaya per kategori ----------
  const KET_KAT: Record<string, string> = { Fasilitas: 'sewa gudang & fasilitas', Manpower: 'gaji, BPJS, THR, kompensasi, fee', Startup: 'startup & implementation (amortisasi)', MHE: 'sewa / depresiasi alat', Racking: 'depresiasi rak',
    Consumable: 'bahan habis pakai', Overhead: '% overhead', Utilitas: 'listrik & air', Asuransi: 'asuransi', IT: 'hardware, software, jaringan', 'Interest cost': 'bunga pinjaman & working capital', Office: 'perlengkapan kantor', HSE: 'K3 / safety', Lainnya: 'lain-lain' };
  const FK: (Fmt | undefined)[] = [undefined, undefined, 'rp', 'rp', 'rp', 'pct'];
  judulTabel('3. Porsi biaya per kategori', 6);
  header(['Kategori', 'Keterangan', 'Biaya / bln', 'Biaya / thn', `Biaya kontrak (${n} bln)`, '%']);
  const pk0 = S0.r;
  kat.forEach(([k, v], i) => { const rr = katRange.r0 + i; const r = S0.r;
    baris([{ f: `'${RB}'!B${rr}`, v: k }, KET_KAT[k] ?? '', { f: `'${RB}'!H${rr}`, v }, { f: `C${r}*12`, v: v * 12 }, { f: `C${r}*Kontrak`, v: v * n }, { f: `'${RB}'!I${rr}`, v: h.totalBiayaBulan ? v / h.totalBiayaBulan : 0 }], FK); });
  const pk1 = S0.r - 1;
  baris(['Total', '', { f: `SUM(C${pk0}:C${pk1})`, v: h.totalBiayaBulan }, { f: `SUM(D${pk0}:D${pk1})`, v: h.totalBiayaBulan * 12 }, { f: `SUM(E${pk0}:E${pk1})`, v: h.totalBiayaBulan * n }, { f: `SUM(F${pk0}:F${pk1})`, v: 1 }], FK, { b: true, bg: C.KPI });
  bar('F', pk0, pk1);
  S0.r += 2;

  // ---------- 4. Opex vs capex ----------
  judulTabel('4. Opex vs capex', 6);
  header(['Jenis', 'Keterangan', 'Biaya / bln', 'Biaya / thn', `Biaya kontrak (${n} bln)`, '%']);
  const inv = [...nilaiCapex.values()];
  const ketJ: Record<string, NilaiSel> = {
    opex: 'biaya operasional: manpower, sewa gudang/MHE, utilitas, consumable, overhead, dll.',
    capex: inv.length ? { f: `"depresiasi/amortisasi investasi (total investasi Rp"&TEXT(${inv.join('+')},"#,##0")&")"` } : 'depresiasi/amortisasi investasi',
    interest: 'bunga pinjaman yang dipilih di tab Interest cost',
  };
  const oj0 = S0.r;
  (['opex', 'capex', 'interest'] as const).forEach((j, i) => { const rr = jenRange.r0 + i; const v = h.perJenis[j]; const r = S0.r;
    baris([{ f: `'${RB}'!B${rr}`, v: ['Opex', 'Capex', 'Interest cost'][i] }, ketJ[j], { f: `'${RB}'!H${rr}`, v }, { f: `C${r}*12`, v: v * 12 }, { f: `C${r}*Kontrak`, v: v * n }, { f: `'${RB}'!I${rr}`, v: h.totalBiayaBulan ? v / h.totalBiayaBulan : 0 }], FK);
    ws0.getCell(r, 1).font = { size: 10, bold: true }; });
  const oj1 = S0.r - 1;
  baris(['Total', '', { f: `SUM(C${oj0}:C${oj1})`, v: h.totalBiayaBulan }, { f: `SUM(D${oj0}:D${oj1})`, v: h.totalBiayaBulan * 12 }, { f: `SUM(E${oj0}:E${oj1})`, v: h.totalBiayaBulan * n }, { f: `SUM(F${oj0}:F${oj1})`, v: 1 }], FK, { b: true, bg: C.KPI });
  bar('F', oj0, oj1);
  S0.r += 2;

  // ---------- 5. Rate card ----------
  judulTabel('5. Rate card', 6);
  header(['Layanan', 'UoM tarif', 'Tarif excl. PPN', 'Tarif incl. PPN', 'Biaya / unit', 'GP %']);
  for (const rc of h.rateCard) { const rr = rowT.get(rc.bucket)!;
    baris([LAYANAN[rc.bucket], { f: `'${R9}'!H${rr}`, v: rc.uom }, { f: `'${R9}'!L${rr}`, v: rc.tarifPerUnit }, { f: `'${R9}'!N${rr}`, v: rc.tarifInclPpn }, { f: `'${R9}'!O${rr}`, v: rc.biayaPerUnit }, { f: `'${R9}'!G${rr}`, v: rc.gpPersen }],
      [undefined, undefined, 'rp', 'rp', 'rp', 'pct']); }
  if (!h.rateCard.length) S0.catatan('Rate card kosong — isi volume & hitung tender dulu.');
  S0.r += 2;

  // ---------- 6. Alur & legenda ----------
  judulTabel('6. Alur perhitungan (sama dengan langkah di web)', 8, '');
  header(['Sheet', 'Isi']); ws0.mergeCells(S0.r - 1, 2, S0.r - 1, nK);
  const alur = ['1 Key Assumption — kontrak, shift, kalender, produktivitas, keuangan, margin, UMK', '2 Volume — rata-rata, peak, komitmen → volume desain per hari/shift',
    '3 Process Design — workload → RfR → man hour → FTE → headcount & unit MHE', '4 Biaya Manpower — gaji, BPJS, THR, kompensasi, fee, eskalasi',
    '5 Space & MHE — luas, sewa gudang, racking, MHE, listrik', '6 Interest cost — bunga pinjaman yang dipilih', '7 IT & Biaya lain — bulanan, depresiasi, amortisasi, startup',
    '8 Rincian Biaya — semua baris + alokasi ke layanan', '9 Rate Card — margin, PPh, tarif, simulasi pendapatan'];
  for (const a of alur) { const [sh, isi] = a.split(' — '); const r = baris([sh, isi], []); ws0.mergeCells(r, 2, r, nK); }
  S0.r += 2;
  judulTabel('Legenda warna', 2, '');
  ([['Header rumus / hasil', C.HDR_RUMUS], ['Header input', C.HDR_INPUT], ['Sel input (boleh diubah)', C.INPUT], ['Sel hasil rumus', C.HASIL]] as const).forEach(([l, w]) => {
    tulis(S0.r, 1, null, undefined, { bg: w }); tulis(S0.r, 2, l); S0.r++;
  });
  ws0.pageSetup.printArea = `A1:H${S0.r}`;
  void aTotRc; void kal; void kv;
  return wb;
}
