// Excel ⇄ sistem (UAT B14): sheet "Data Input" berisi SEMUA isian tender (kolom tender + seluruh asumsi, path → nilai).
// - Isian yang ada di sheet bergaya web (Key assumption, tabel Volume) ditulis sebagai RUMUS yang menunjuk sel input itu,
//   jadi mengubah angka di Key assumption / Volume otomatis ikut ke Data Input (satu sumber kebenaran).
// - Isian lain diubah langsung di kolom Nilai sheet Data Input (sel putih tulang).
// - Upload: baca Data Input (+ tabel Volume lengkap, termasuk baris baru) → pratinjau perubahan → terapkan → hitung ulang.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TenderRow } from '@/lib/tender';
import { C } from '@/lib/exportRumus';

export const SHEET_INPUT = 'Data Input';

/** Kolom tender (bukan asumsi) yang bisa diubah lewat Excel → nama sel di Key assumption. */
const KOLOM_TENDER: { kolom: keyof TenderRow; nama?: string; jenis: 'teks' | 'angka' | 'tanggal' }[] = [
  { kolom: 'customer', nama: 'Cust', jenis: 'teks' }, { kolom: 'industri', nama: 'Industri', jenis: 'teks' }, { kolom: 'pic', nama: 'PIC', jenis: 'teks' },
  { kolom: 'alamat_lokasi', nama: 'Alamat', jenis: 'teks' }, { kolom: 'provinsi', nama: 'Prov', jenis: 'teks' }, { kolom: 'kab_kota', nama: 'Kab', jenis: 'teks' },
  { kolom: 'skema', nama: 'Skema', jenis: 'teks' }, { kolom: 'skenario_aset', nama: 'Aset', jenis: 'teks' }, { kolom: 'tipe_gudang', jenis: 'teks' },
  { kolom: 'durasi_kontrak_bulan', nama: 'Kontrak', jenis: 'angka' }, { kolom: 'tanggal_go_live', nama: 'GoLive', jenis: 'tanggal' },
  { kolom: 'jumlah_shift', nama: 'Shift', jenis: 'angka' }, { kolom: 'hari_kerja_per_minggu', nama: 'HariMinggu', jenis: 'angka' },
  { kolom: 'jam_kerja_per_shift', nama: 'JamKerja', jenis: 'angka' }, { kolom: 'jam_efektif_per_shift', nama: 'JamEfektif', jenis: 'angka' },
  { kolom: 'payment_term_hari', nama: 'PaymentTerm', jenis: 'angka' },
];
/** Path asumsi → nama sel di Key assumption. */
const NAMA_ASUMSI: Record<string, string> = { cutiTahunanHari: 'Cuti', faktorProduktivitas: 'FProd', efisiensi: 'Efis' };
/** Kolom input tabel Volume (urutan kolom di sheet Volume) → field VolumeInput. */
const KOLOM_VOLUME: { c: number; path: string; jenis: 'teks' | 'angka' }[] = [
  { c: 1, path: 'arus', jenis: 'teks' }, { c: 2, path: 'uom', jenis: 'teks' }, { c: 3, path: 'rataRataBulan', jenis: 'angka' }, { c: 4, path: 'peakBulan', jenis: 'angka' },
  { c: 5, path: 'komitmenBulan', jenis: 'angka' }, { c: 9, path: 'konversi.paletIsi', jenis: 'angka' }, { c: 10, path: 'konversi.per1', jenis: 'angka' },
  { c: 11, path: 'konversi.uom1', jenis: 'teks' }, { c: 12, path: 'konversi.per2', jenis: 'angka' }, { c: 13, path: 'konversi.uom2', jenis: 'teks' },
];
/** Bagian asumsi yang tidak diekspor ke Data Input (data impor Excel lama / analisis project / data turunan). */
const LEWATI = /^(historis|analisis|layoutSim|simulasi3d)(\.|\[|$)/;

const huruf = (c: number) => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };

function ratakan(o: unknown, pre: string, out: [string, unknown][]) {
  if (o == null || typeof o !== 'object') { out.push([pre, o]); return; }
  if (Array.isArray(o)) { if (!o.length) out.push([pre, '[]']); o.forEach((x, i) => ratakan(x, `${pre}[${i}]`, out)); return; }
  const e = Object.entries(o as Record<string, unknown>);
  if (!e.length && pre) out.push([pre, '{}']);
  for (const [k, v] of e) ratakan(v, pre ? `${pre}.${k}` : k, out);
}

/** Alamat awal (sheet, baris pertama, kolom) dari nama range, mis. Vol_Arus → { sheet: 'Volume', r0: 12, r1: 17 }. */
function rangeNama(wb: any, nama: string): { sheet: string; c: number; r0: number; r1: number } | null {
  const rg = wb.definedNames.getRanges(nama)?.ranges?.[0] as string | undefined;
  const m = rg && /^'?(.+?)'?!\$?([A-Z]+)\$?(\d+)(?::\$?[A-Z]+\$?(\d+))?$/.exec(rg);
  if (!m) return null;
  const c = [...m[2]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return { sheet: m[1], c, r0: Number(m[3]), r1: Number(m[4] ?? m[3]) };
}

/** Tulis sheet Data Input. Dipanggil setelah semua sheet model ditulis (supaya nama sel sudah ada). */
export function tulisDataInput(wb: any, t: TenderRow) {
  const ws = wb.addWorksheet(SHEET_INPUT, { properties: { tabColor: { argb: 'FF2F6FD0' } }, views: [{ state: 'frozen', ySplit: 5 }] });
  ws.columns = [{ width: 12 }, { width: 58 }, { width: 34 }, { width: 34 }];
  const b1 = ws.getCell(1, 1); b1.value = 'Data Input — semua isian tender (upload kembali ke Leca)'; b1.font = { bold: true, size: 14 };
  const b2 = ws.getCell(2, 1);
  b2.value = 'Kolom Nilai: sel putih tulang = ubah langsung di sini · sel biru = terhubung ke sel input di sheet lain (ubah di sheet itu). Simpan file lalu upload di tab Export → "Upload Excel". Baris baru boleh ditambah dengan path berindeks berikutnya, mis. costLines[12].qty.';
  b2.font = { italic: true, size: 9, color: { argb: 'FF6B6B6B' } };
  const b3 = ws.getCell(3, 1); b3.value = `Tender ${t.kode ?? ''} · ${t.customer} · id ${t.id}`; b3.font = { size: 9, color: { argb: 'FF6B6B6B' } };
  const hdr = ['Sumber', 'Path', 'Nilai', 'Terhubung ke'];
  hdr.forEach((h, i) => { const c = ws.getCell(5, i + 1); c.value = h; c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.HDR_INPUT } }; });
  let r = 6;
  const garis = { style: 'thin', color: { argb: C.GARIS } };
  const tulis = (sumber: string, path: string, v: unknown, link?: string) => {
    ws.getCell(r, 1).value = sumber; ws.getCell(r, 2).value = path;
    const c = ws.getCell(r, 3);
    const nilai = v == null ? null : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'object' ? JSON.stringify(v) : v;
    c.value = link ? { formula: link, result: nilai ?? undefined } : nilai;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: link ? 'FFEAF1FB' : C.INPUT } };
    c.border = { top: garis, bottom: garis, left: garis, right: garis };
    if (typeof nilai === 'number' && !Number.isInteger(nilai)) c.numFmt = '0.######';
    ws.getCell(r, 4).value = link ? link.replace(/\$/g, '') : '';
    ws.getCell(r, 4).font = { size: 9, color: { argb: 'FF6B6B6B' } };
    r++;
  };
  const ada = (nama: string) => !!wb.definedNames.getRanges(nama)?.ranges?.length;
  for (const k of KOLOM_TENDER) tulis('tender', k.kolom, (t as any)[k.kolom], k.nama && ada(k.nama) ? k.nama : undefined);
  // volume: terhubung ke tabel Volume
  const vol = rangeNama(wb, 'Vol_Arus');
  const asumsi = (t.asumsi ?? {}) as unknown as Record<string, unknown>;
  const daun: [string, unknown][] = [];
  ratakan(asumsi, '', daun);
  for (const [path, v] of daun) {
    if (LEWATI.test(path)) continue;
    const mv = /^volumes\[(\d+)\]\.(.+)$/.exec(path);
    if (mv && vol) {
      const kv = KOLOM_VOLUME.find(x => x.path === mv[2]);
      const row = vol.r0 + Number(mv[1]);
      if (kv && row <= vol.r1) { tulis('asumsi', path, v, `'${vol.sheet}'!$${huruf(kv.c)}$${row}`); continue; }
    }
    const mp = /^porsiMuat\.(\w+)$/.exec(path);
    const nama = mp ? `Porsi_${mp[1]}` : NAMA_ASUMSI[path];
    tulis('asumsi', path, v, nama && ada(nama) ? nama : undefined);
  }
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(6, r - 1), column: 4 } };
}

// ---------------------------------------------------------------- upload

export interface Perubahan { sumber: 'tender' | 'asumsi'; path: string; lama: unknown; baru: unknown }
export interface HasilUpload { kolom: Partial<TenderRow>; asumsi: Record<string, unknown>; perubahan: Perubahan[]; peringatan: string[]; idFile: string | null }

const nilaiSel = (c: any): unknown => {
  const v = c?.value;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) {
      if (v.result instanceof Date) return v.result;
      if (v.result != null) return v.result;
      // rumus tanpa nilai tersimpan (file disimpan aplikasi yang tidak menghitung ulang): DATE(y,m,d) dihitung sendiri
      const d = /^DATE\((\d{4}),(\d{1,2}),(\d{1,2})\)$/.exec(String(v.formula ?? '').replace(/\s/g, ''));
      return d ? `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}` : null;
    }
    if ('richText' in v) return (v.richText as { text: string }[]).map(x => x.text).join('');
    if ('text' in v) return v.text;
    if ('error' in v) return null;
  }
  return v;
};
const tgl = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);

/** Ubah nilai sel ke tipe yang sama dengan nilai lama (angka tetap angka, boolean tetap boolean, objek/array JSON). */
function samakanTipe(baru: unknown, lama: unknown): unknown {
  if (baru instanceof Date) return tgl(baru);
  if (baru === '' || baru == null) return lama === undefined ? undefined : typeof lama === 'string' ? '' : null;
  if (baru === '[]') return [];
  if (baru === '{}') return {};
  if (typeof lama === 'number') { const x = Number(String(baru).replace(',', '.')); return Number.isFinite(x) ? x : lama; }
  if (typeof lama === 'boolean') return /^(true|ya|1)$/i.test(String(baru));
  if (lama != null && typeof lama === 'object') { try { return JSON.parse(String(baru)); } catch { return lama; } }
  if (lama === undefined || lama === null) {
    if (typeof baru === 'number' || typeof baru === 'boolean') return baru;
    const s = String(baru);
    if (/^(TRUE|FALSE)$/.test(s)) return s === 'TRUE';
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }
  return typeof baru === 'string' ? baru : String(baru);
}

const bagianPath = (path: string) => path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
function ambil(o: unknown, path: string): unknown {
  let x: any = o; for (const k of bagianPath(path)) { if (x == null) return undefined; x = x[k]; } return x;
}
function pasang(o: any, path: string, v: unknown) {
  const ks = bagianPath(path); let x = o;
  ks.forEach((k, i) => {
    if (i === ks.length - 1) { if (v === undefined) return; x[k] = v; return; }
    if (x[k] == null || typeof x[k] !== 'object') x[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    x = x[k];
  });
}
const sama = (a: unknown, b: unknown) => (a == null && b == null) || JSON.stringify(a) === JSON.stringify(b)
  || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a)));

/** Pembaca .xlsx ringan (JSZip + XML): hanya nilai sel, rumus & nama range. Lebih toleran daripada exceljs untuk file
 *  yang sudah disimpan ulang oleh Excel / Google Sheets / LibreOffice / openpyxl (catatan, ekstensi, format bersyarat). */
export async function bukaXlsx(buf: ArrayBuffer | Uint8Array) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const baca = async (p: string) => (await zip.file(p)?.async('string')) ?? '';
  const ent = (x: string) => x.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => e[0] === '#'
    ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()]);
  const attr = (tag: string, n: string) => new RegExp(`\\s${n.replace(':', '\\:')}="([^"]*)"`).exec(tag)?.[1] ?? '';
  const wbx = await baca('xl/workbook.xml'), rel = await baca('xl/_rels/workbook.xml.rels');
  const target = new Map([...rel.matchAll(/<Relationship\b[^>]*>/g)].map(m => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const fileSheet = new Map([...wbx.matchAll(/<sheet\b[^>]*>/g)].map(m => {
    const tgt = target.get(attr(m[0], 'r:id')) ?? '';
    return [ent(attr(m[0], 'name')), tgt.startsWith('/') ? tgt.slice(1) : `xl/${tgt.replace(/^\.\//, '')}`] as [string, string];
  }));
  const names = new Map([...wbx.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)].filter(m => !/localSheetId/.test(m[1])).map(m => [ent(attr(` ${m[1]}`, 'name')), ent(m[2])] as [string, string]));
  const ss: string[] = [];
  for (const m of (await baca('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)) ss.push(ent([...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
  const kolomKe = (h: string) => [...h].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const sheets = new Map<string, { getCell: (r: number, c: number) => { value: any }; rowCount: number }>();
  const perlu = new Set<string>([SHEET_INPUT, ...[...names.values()].map(v => /^'?(.+?)'?!/.exec(v)?.[1]).filter((x): x is string => !!x)]);
  for (const nama of perlu) {
    const f = fileSheet.get(nama); if (!f) continue;
    const x = await baca(f); const sel = new Map<string, any>(); let maxR = 0;
    for (const m of x.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const r = Number(m[2]); maxR = Math.max(maxR, r);
      const tp = attr(m[3], 't'), isi = m[4] ?? '';
      const v0 = /<v>([\s\S]*?)<\/v>/.exec(isi)?.[1]; const v = v0 === '' ? undefined : v0;
      const fm = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(isi)?.[1];
      const val = tp === 's' ? (v != null ? ss[Number(v)] ?? null : null) : tp === 'str' ? (v != null ? ent(v) : null)
        : tp === 'inlineStr' ? ent([...isi.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(y => y[1]).join('')) : tp === 'b' ? v === '1' : tp === 'e' ? null : v != null ? Number(v) : null;
      sel.set(`${kolomKe(m[1])},${r}`, fm != null && fm !== '' ? { formula: ent(fm), result: val ?? undefined } : val);
    }
    sheets.set(nama, { getCell: (r, c) => ({ value: sel.get(`${c},${r}`) ?? null }), rowCount: maxR });
  }
  return {
    getWorksheet: (n: string) => sheets.get(n),
    definedNames: { getRanges: (n: string) => ({ ranges: names.has(n) ? [names.get(n)!] : [] }) },
  };
}

/** Baca file Excel hasil export (yang sudah diubah) → perubahan terhadap tender saat ini. */
export async function bacaUpload(file: File | Blob, t: TenderRow): Promise<HasilUpload> {
  const wb = await bukaXlsx(await file.arrayBuffer());
  const ws = wb.getWorksheet(SHEET_INPUT);
  if (!ws) throw new Error(`Sheet "${SHEET_INPUT}" tidak ditemukan — pakai file hasil Export Excel dari Leca (versi terbaru).`);
  const peringatan: string[] = [];
  const idFile = /id ([0-9a-f-]{36})/.exec(String(nilaiSel(ws.getCell(3, 1)) ?? ''))?.[1] ?? null;
  if (idFile && idFile !== t.id) peringatan.push('File ini diekspor dari tender lain — pastikan memang ingin menimpa tender ini.');
  const asumsiLama = (t.asumsi ?? {}) as unknown as Record<string, unknown>;
  const asumsi = JSON.parse(JSON.stringify(asumsiLama)) as Record<string, unknown>;
  const kolom: Partial<TenderRow> = {};
  const perubahan: Perubahan[] = [];

  // 1) tabel Volume lengkap (termasuk baris baru di baris kosong tabel)
  const vol = rangeNama(wb, 'Vol_Arus');
  let volBaru: Record<string, unknown>[] | null = null;
  if (vol) {
    const wv = wb.getWorksheet(vol.sheet);
    if (wv) {
      volBaru = [];
      for (let r = vol.r0; r <= vol.r1; r++) {
        const arus = nilaiSel(wv.getCell(r, 1));
        if (!arus) continue;
        const i = volBaru.length;
        const lamaBaris = ((asumsiLama.volumes as unknown[] | undefined) ?? [])[i] as Record<string, unknown> | undefined;
        const v: Record<string, unknown> = lamaBaris ? JSON.parse(JSON.stringify(lamaBaris)) : {};
        for (const k of KOLOM_VOLUME) {
          const raw = nilaiSel(wv.getCell(r, k.c));
          const lama = ambil(lamaBaris, k.path);
          // UoM isi default yang ditulis export (case / pcs) bukan perubahan bila sebelumnya kosong
          if (lama === undefined && ((k.path === 'konversi.uom1' && raw === 'case') || (k.path === 'konversi.uom2' && raw === 'pcs'))) continue;
          const nb = k.jenis === 'angka' ? (raw == null || raw === '' ? (lama === undefined ? undefined : 0) : Number(raw)) : raw == null ? (lama === undefined ? undefined : '') : String(raw);
          if (nb !== undefined) pasang(v, k.path, nb);
        }
        volBaru.push(v);
      }
    }
  }

  // Sel Data Input yang berisi rumus penghubung dibaca langsung dari sel tujuannya (sel input di sheet lain),
  // jadi tetap benar walau file disimpan oleh aplikasi yang tidak menghitung ulang rumus.
  const selTujuan = (f: string) => {
    const m = /^'?(.+?)'?!\$?([A-Z]+)\$?(\d+)$/.exec(f.trim());
    if (m) { const w = wb.getWorksheet(m[1]); return w ? w.getCell(Number(m[3]), [...m[2]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)) : null; }
    if (/^[A-Za-z_][\w.]*$/.test(f.trim())) { const rg = rangeNama(wb, f.trim()); const w = rg && wb.getWorksheet(rg.sheet); return w ? w.getCell(rg.r0, rg.c) : null; }
    return null;
  };
  const bacaNilai = (r: number) => {
    const c = ws.getCell(r, 3); const v = c.value as any;
    if (v && typeof v === 'object' && typeof v.formula === 'string') { const tj = selTujuan(v.formula); if (tj) return nilaiSel(tj); }
    return nilaiSel(c);
  };

  // 2) Data Input: path → nilai
  for (let r = 6; r <= ws.rowCount; r++) {
    const sumber = String(nilaiSel(ws.getCell(r, 1)) ?? '').trim();
    const path = String(nilaiSel(ws.getCell(r, 2)) ?? '').trim();
    if (!path || (sumber !== 'tender' && sumber !== 'asumsi')) continue;
    const raw = bacaNilai(r);
    if (sumber === 'tender') {
      const def = KOLOM_TENDER.find(k => k.kolom === path);
      if (!def) { peringatan.push(`Kolom tender "${path}" tidak dikenal — dilewati.`); continue; }
      const lama = (t as any)[path];
      const baru = def.jenis === 'tanggal' ? tgl(raw) : def.jenis === 'angka' ? (raw == null || raw === '' ? lama : Number(raw)) : raw == null || raw === '—' || raw === '' ? (lama === '' ? '' : null) : String(raw);
      if (def.jenis === 'angka' && !Number.isFinite(baru as number)) { peringatan.push(`${path}: "${String(raw)}" bukan angka — dilewati.`); continue; }
      if (!sama(lama, baru)) { (kolom as any)[path] = baru; perubahan.push({ sumber: 'tender', path, lama, baru }); }
      continue;
    }
    if (LEWATI.test(path) || (volBaru && /^volumes(\[|$)/.test(path))) continue;
    const lama = ambil(asumsiLama, path);
    const baru = samakanTipe(raw, lama);
    if (baru === undefined || sama(lama, baru)) continue;
    pasang(asumsi, path, baru);
    perubahan.push({ sumber: 'asumsi', path, lama, baru });
  }
  if (volBaru) {
    const lamaV = (asumsiLama.volumes as unknown[] | undefined) ?? [];
    for (let i = 0; i < Math.max(lamaV.length, volBaru.length); i++) {
      const a = lamaV[i], b = volBaru[i];
      if (!sama(a, b)) perubahan.push({ sumber: 'asumsi', path: `volumes[${i}]`, lama: a ?? null, baru: b ?? '(dihapus)' });
    }
    asumsi.volumes = volBaru;
  }
  return { kolom, asumsi, perubahan, peringatan, idFile };
}

export const ringkasNilai = (v: unknown) => {
  if (v == null) return '—';
  if (typeof v === 'number') return v.toLocaleString('id-ID', { maximumFractionDigits: 4 });
  if (typeof v === 'object') { const s = JSON.stringify(v); return s.length > 90 ? `${s.slice(0, 90)}…` : s; }
  return String(v);
};
