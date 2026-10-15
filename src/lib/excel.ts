'use client';
// Export / import Excel (.xlsx) di browser. exceljs dimuat hanya saat tombol ditekan.

export interface KolomExcel {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'percent' | 'date' | 'bool' | 'list';
  width?: number;
}

const ambil = (r: Record<string, unknown>, key: string): unknown => {
  const i = key.indexOf('.');
  if (i <= 0) return r[key];
  const induk = r[key.slice(0, i)] as Record<string, unknown> | null | undefined;
  return induk?.[key.slice(i + 1)];
};

/** Unduh baris sebagai .xlsx. Header = label kolom; kolom pertama "ID" bila idKey diberikan (untuk import balik). */
export async function exportExcel(namaFile: string, sheet: string, kolom: KolomExcel[], rows: Record<string, unknown>[], idKey?: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Cost Model Gudang';
  const ws = wb.addWorksheet(sheet.slice(0, 31));
  const cols = [...(idKey ? [{ key: idKey, label: 'ID', type: 'text' as const, width: 10 }] : []), ...kolom];
  ws.columns = cols.map(k => ({ header: k.label, key: k.key, width: k.width ? Math.max(10, Math.round(k.width / 7)) : k.type === 'number' ? 14 : 22 }));
  for (const r of rows) {
    ws.addRow(cols.map(k => {
      const v = ambil(r, k.key);
      if (v == null || v === '') return null;
      if (k.type === 'number' || k.type === 'percent') return Number(v);
      if (k.type === 'bool') return v ? 'Ya' : 'Tidak';
      if (k.type === 'date') return String(v).slice(0, 10);
      if (k.type === 'list' || Array.isArray(v)) return (v as unknown[]).join(', ');
      return typeof v === 'object' ? JSON.stringify(v) : v;
    }));
  }
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  cols.forEach((k, i) => {
    const c = ws.getColumn(i + 1);
    if (k.type === 'number') c.numFmt = '#,##0.##';
    if (k.type === 'percent') c.numFmt = '0.00%';
    if (idKey && i === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF0EC' } };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${namaFile}_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Baca sheet pertama. Header dicocokkan ke label ATAU key kolom (tidak peka huruf besar/spasi). */
export async function importExcel(file: File, kolom: KolomExcel[], idKey?: string): Promise<{ rows: Record<string, unknown>[]; dikenali: string[]; diabaikan: string[] }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('File tidak berisi sheet.');
  const cols = [...(idKey ? [{ key: idKey, label: 'ID', type: 'text' as const }] : []), ...kolom];
  const peta = new Map<number, KolomExcel>();
  const dikenali: string[] = [], diabaikan: string[] = [];
  ws.getRow(1).eachCell((cell, i) => {
    const h = norm(String(cell.value ?? ''));
    const k = cols.find(c => norm(c.label) === h || norm(c.key) === h);
    if (k) { peta.set(i, k); dikenali.push(k.label); } else if (h) diabaikan.push(String(cell.value));
  });
  if (!peta.size) throw new Error('Tidak ada header yang cocok. Gunakan file hasil Export sebagai template.');
  const rows: Record<string, unknown>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const o: Record<string, unknown> = {};
    let isi = false;
    peta.forEach((k, i) => {
      let v: unknown = row.getCell(i).value;
      if (v && typeof v === 'object' && 'result' in (v as object)) v = (v as { result: unknown }).result;       // sel rumus
      if (v && typeof v === 'object' && 'text' in (v as object)) v = (v as { text: unknown }).text;             // hyperlink
      if (v && typeof v === 'object' && 'richText' in (v as object)) v = (v as { richText: { text: string }[] }).richText.map(t => t.text).join('');
      if (v === '' || v === undefined) v = null;
      if (v != null) {
        isi = true;
        if (k.type === 'number' || k.type === 'percent') { const t = String(v).trim(); const x = typeof v === 'number' ? v : /^-?\d+\.\d{1,2}$/.test(t) ? Number(t) : Number(t.replace(/\./g, '').replace(',', '.')); v = isFinite(x) ? x : null; }
        else if (k.type === 'bool') v = ['ya', 'yes', 'true', '1', 'y'].includes(String(v).toLowerCase());
        else if (k.type === 'date') v = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
        else if (k.type === 'list') v = String(v).split(',').map(s => s.trim()).filter(Boolean);
        else v = String(v).trim();
      }
      o[k.key] = v;
    });
    if (isi) rows.push(o);
  });
  return { rows, dikenali, diabaikan };
}
