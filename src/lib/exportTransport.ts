// Export Excel tender Transportation & Intermodal dengan rumus lengkap — angka sama persis dengan sistem:
// harga jual = ROUND(harga beli ÷ (1 − margin), 2) (margin dibatasi −100%…95%), biaya / pendapatan / GP per bulan,
// perbandingan margin per tier, dan catatan review. Sel input (broken white) bisa diubah → semua hasil ikut terhitung ulang.
import type ExcelJSNS from 'exceljs';
import {
  TIER_DEFAULT, hitungIntermodal, hitungRute, labelBasis, marginRute, MODA, NAMA_STAGE, reviewIntermodal, reviewTransport, ringkasIntermodal, ringkasTransport,
  tierIntermodal, tierTransport, type RateTransport, type TenderIntermodal, type TenderTransport,
} from './transport.ts';
import { jarakKm } from './lokasiIndonesia.ts';

type WB = ExcelJSNS.Workbook; type WS = ExcelJSNS.Worksheet; type Cell = ExcelJSNS.Cell;
export interface InfoTenderEkspor {
  kode: string | null; customer: string; industri: string | null; kab_kota: string; provinsi: string;
  durasi_kontrak_bulan: number; payment_term_hari: number; status: string;
}

// skema warna sama dengan export tender gudang
const HDR = 'FFC0C0C0', HDR_INPUT = 'FFE7E6E6', SEL_INPUT = 'FFFAF8F2', SEL_HASIL = 'FFD9D9D9', TINTA = 'FF1F1F1F';
const RP = '#,##0', RP2 = '#,##0.00', PCT = '0.0%';
const isi = (c: Cell, argb: string) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; };
const garis = (c: Cell) => { c.border = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } }, left: { style: 'thin', color: { argb: 'FFBFBFBF' } }, right: { style: 'thin', color: { argb: 'FFBFBFBF' } } }; };
const kol = (n: number) => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
const r2 = (v: number) => Math.round(v * 100) / 100;
const MAKS = 'MIN(0.95,MAX(-1,{m}))';   // batas margin seperti sistem

/** Tulis sel: nilai input, nilai teks, atau rumus (dengan hasil dari sistem supaya langsung tampil sebelum dihitung ulang). */
function sel(ws: WS, ref: string, v: { input?: unknown; teks?: unknown; f?: string; hasil?: number | string; fmt?: string; b?: boolean }) {
  const c = ws.getCell(ref);
  if (v.f) { c.value = { formula: v.f, result: v.hasil as number } as ExcelJSNS.CellFormulaValue; isi(c, SEL_HASIL); }
  else if ('input' in v) { c.value = (v.input ?? null) as ExcelJSNS.CellValue; isi(c, SEL_INPUT); }
  else c.value = (v.teks ?? null) as ExcelJSNS.CellValue;
  if (v.fmt) c.numFmt = v.fmt;
  if (v.b) c.font = { bold: true, color: { argb: TINTA } };
  garis(c);
  return c;
}
function header(ws: WS, baris: number, judul: { t: string; input?: boolean; w?: number }[]) {
  judul.forEach((j, i) => {
    const c = ws.getCell(baris, i + 1); c.value = j.t; isi(c, j.input ? HDR_INPUT : HDR);
    c.font = { bold: true, color: { argb: TINTA } }; c.alignment = { vertical: 'middle', wrapText: true }; garis(c);
    if (j.w) ws.getColumn(i + 1).width = j.w;
  });
  ws.getRow(baris).height = 32;
  ws.views = [{ state: 'frozen', ySplit: baris, xSplit: 1 }];
}
function judul(ws: WS, teks: string, sub: string) {
  ws.getCell('A1').value = teks; ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = sub; ws.getCell('A2').font = { italic: true, color: { argb: 'FF6B6B6B' } };
}
const legenda = (ws: WS, baris: number) => {
  const a = ws.getCell(baris, 1); a.value = 'Input (boleh diubah)'; isi(a, SEL_INPUT); garis(a);
  const b = ws.getCell(baris, 2); b.value = 'Rumus / hasil'; isi(b, SEL_HASIL); garis(b);
};

/** Sheet Ringkasan: info tender + margin global (input) + total dari sheet Rute. Kembalikan alamat sel margin global & kontrak. */
function ringkasan(wb: WB, t: InfoTenderEkspor, jenis: string, marginGlobal: number, ring: ReturnType<typeof ringkasTransport>, kolom: { biaya: string; pend: string; n: number }) {
  const ws = wb.addWorksheet('Ringkasan');
  judul(ws, `${jenis} — ${t.customer}`, `Leca · ${t.kode ?? ''} · diekspor ${new Date().toLocaleString('id-ID')} · rumus sama dengan sistem`);
  ws.getColumn(1).width = 34; ws.getColumn(2).width = 22; ws.getColumn(3).width = 70;
  const info: [string, unknown][] = [['Kode tender', t.kode ?? '-'], ['Customer', t.customer], ['Business category', t.industri ?? '-'], ['Lokasi customer', [t.kab_kota, t.provinsi].filter(x => x && x !== '-').join(', ') || '-'], ['Status', t.status], ['Payment term (hari)', t.payment_term_hari]];
  let r = 4;
  for (const [k, v] of info) { sel(ws, `A${r}`, { teks: k }); sel(ws, `B${r}`, { teks: v }); r++; }
  sel(ws, `A${r}`, { teks: 'Durasi kontrak (bulan)', b: true }); sel(ws, `B${r}`, { input: t.durasi_kontrak_bulan }); const KONTRAK = `Ringkasan!$B$${r}`; r++;
  sel(ws, `A${r}`, { teks: 'Margin global (GP% atas harga jual)', b: true }); sel(ws, `B${r}`, { input: marginGlobal, fmt: PCT }); const MG = `Ringkasan!$B$${r}`;
  sel(ws, `C${r}`, { teks: 'Dipakai semua rute yang kolom "Margin khusus"-nya kosong.' }); r += 2;
  const a = 5, b = a + kolom.n - 1, rg = (c: string) => `Rute!$${c}$${a}:$${c}$${Math.max(a, b)}`;
  const baris = [
    ['Jumlah rute', `COUNT(${rg('A')})`, ring.jumlahRute, '0'],
    ['Biaya beli / bulan', `SUM(${rg(kolom.biaya)})`, ring.biayaBulan, RP],
    ['Pendapatan / bulan', `SUM(${rg(kolom.pend)})`, ring.pendapatanBulan, RP],
  ] as const;
  const alamat: Record<string, string> = {};
  for (const [k, f, h, fmt] of baris) { sel(ws, `A${r}`, { teks: k, b: true }); sel(ws, `B${r}`, { f, hasil: h, fmt }); alamat[k] = `B${r}`; r++; }
  sel(ws, `A${r}`, { teks: 'Gross profit / bulan', b: true }); sel(ws, `B${r}`, { f: `${alamat['Pendapatan / bulan']}-${alamat['Biaya beli / bulan']}`, hasil: ring.gp, fmt: RP }); const gp = `B${r}`; r++;
  sel(ws, `A${r}`, { teks: 'GP %', b: true }); sel(ws, `B${r}`, { f: `IF(${alamat['Pendapatan / bulan']}>0,${gp}/${alamat['Pendapatan / bulan']},0)`, hasil: ring.gpPersen, fmt: PCT }); r++;
  sel(ws, `A${r}`, { teks: 'Nilai kontrak', b: true }); sel(ws, `B${r}`, { f: `${alamat['Pendapatan / bulan']}*${KONTRAK.replace('Ringkasan!', '')}`, hasil: ring.pendapatanBulan * t.durasi_kontrak_bulan, fmt: RP }); r += 2;
  ['Cara hitung (sama dengan sistem Leca):',
    '• Margin = GP% atas harga jual. Harga jual = ROUND(harga beli ÷ (1 − margin), 2); margin dibatasi −100% s/d 95%.',
    '• Margin dipakai = margin khusus rute bila diisi, selain itu margin global di sheet ini.',
    '• Biaya / bulan = harga beli × volume; pendapatan / bulan = harga jual × volume; GP = pendapatan − biaya; GP% = GP ÷ pendapatan.',
    '• Ubah sel berwarna broken white (input) — semua rumus di sheet Rute, Perbandingan Margin & ringkasan ikut berubah.',
  ].forEach((x, i) => { const c = ws.getCell(r + i, 1); c.value = x; if (i === 0) c.font = { bold: true }; });
  legenda(ws, r + 6);
  return { MG, KONTRAK };
}

/** Sheet Perbandingan Margin: kolom "Saat ini" (dari sheet Rute) + tiap tier (input di baris 4). */
function perbandingan(wb: WB, p: {
  baris: { nama: string; satuan: string; beliRef: string; volRef: string; qtyRef?: string; kiniJual: string; kiniGp: string; beli: number; vol: number; qty?: number }[];
  tiers: number[]; hasil: ReturnType<typeof tierTransport>; kontrak: string; kontrakN: number; intermodal: boolean;
}) {
  const ws = wb.addWorksheet('Perbandingan Margin');
  judul(ws, 'Perbandingan margin', p.intermodal ? 'Harga jual per satuan jual; GP / bulan = (jual per shipment − beli per shipment) × shipment / bulan.' : 'Harga jual per basis rute; GP / bulan = (jual − beli) × volume / bulan.');
  const H = 5, a = H + 1, b = H + p.baris.length;
  const tetap = p.intermodal ? [{ t: 'Rute', w: 30 }, { t: 'Satuan jual', w: 16 }, { t: 'Beli / shipment', w: 16 }, { t: 'Shipment / bln', w: 12 }, { t: 'Qty jual / shipment', w: 12 }]
    : [{ t: 'Rute', w: 30 }, { t: 'Armada · basis', w: 24 }, { t: 'Harga beli', w: 14 }, { t: 'Volume / bln', w: 12 }];
  const n0 = tetap.length; const grup = ['Saat ini', ...p.tiers.map((_, i) => `Tier ${i + 1}`)];
  header(ws, H, [...tetap, ...grup.flatMap(g => [{ t: `${g} · harga jual`, w: 16 }, { t: `${g} · GP / bln`, w: 16 }])]);
  // baris 4: margin tiap tier (input)
  sel(ws, 'A4', { teks: 'Margin tier (GP%) →', b: true });
  p.tiers.forEach((m, i) => { const c = n0 + 3 + i * 2; sel(ws, `${kol(c)}4`, { input: m, fmt: PCT }); });
  const totalR = b + 1;
  p.baris.forEach((x, i) => {
    const r = a + i;
    sel(ws, `A${r}`, { teks: x.nama }); sel(ws, `B${r}`, { teks: x.satuan });
    sel(ws, `C${r}`, { f: x.beliRef, hasil: x.beli, fmt: RP });
    sel(ws, `D${r}`, { f: x.volRef, hasil: x.vol, fmt: '#,##0.##' });
    if (p.intermodal && x.qtyRef) sel(ws, `E${r}`, { f: x.qtyRef, hasil: x.qty ?? 0, fmt: '#,##0.##' });
    const c0 = n0 + 1;
    sel(ws, `${kol(c0)}${r}`, { f: x.kiniJual, hasil: p.hasil.baris[i].jual[0], fmt: RP2 });
    sel(ws, `${kol(c0 + 1)}${r}`, { f: x.kiniGp, hasil: p.hasil.baris[i].gpBulan[0], fmt: RP });
    p.tiers.forEach((_, k) => {
      const cj = n0 + 3 + k * 2, m = `${kol(cj)}$4`, jualShip = `ROUND($C${r}/(1-${MAKS.replace('{m}', m)}),2)`;
      const jual = p.intermodal ? `ROUND(${jualShip}/IF($E${r}>0,$E${r},1),2)` : jualShip;
      sel(ws, `${kol(cj)}${r}`, { f: jual, hasil: p.hasil.baris[i].jual[k + 1], fmt: RP2 });
      sel(ws, `${kol(cj + 1)}${r}`, { f: `(${jualShip}-$C${r})*$D${r}`, hasil: p.hasil.baris[i].gpBulan[k + 1], fmt: RP });
    });
  });
  // total per kolom
  const lab = ['Biaya beli / bulan', 'Pendapatan / bulan', 'Gross profit / bulan', 'GP %', 'Selisih pendapatan vs saat ini / bulan', 'Nilai kontrak'];
  lab.forEach((l, j) => sel(ws, `A${totalR + j}`, { teks: l, b: true }));
  const rg = (c: string) => `${c}${a}:${c}${Math.max(a, b)}`;
  grup.forEach((_, k) => {
    const cG = kol(n0 + 2 + k * 2), cJ = kol(n0 + 1 + k * 2), t = p.hasil.total[k];
    const biaya = `SUMPRODUCT(${rg('$C')},${rg('$D')})`;
    sel(ws, `${cJ}${totalR}`, { f: biaya, hasil: t.biayaBulan, fmt: RP });
    sel(ws, `${cJ}${totalR + 1}`, { f: `${cJ}${totalR}+SUM(${rg(cG)})`, hasil: t.pendapatanBulan, fmt: RP });
    sel(ws, `${cJ}${totalR + 2}`, { f: `${cJ}${totalR + 1}-${cJ}${totalR}`, hasil: t.gp, fmt: RP });
    sel(ws, `${cJ}${totalR + 3}`, { f: `IF(${cJ}${totalR + 1}>0,${cJ}${totalR + 2}/${cJ}${totalR + 1},0)`, hasil: t.gpPersen, fmt: PCT });
    const k0 = kol(n0 + 1);
    sel(ws, `${cJ}${totalR + 4}`, k === 0 ? { teks: '—' } : { f: `${cJ}${totalR + 1}-$${k0}$${totalR + 1}`, hasil: t.pendapatanBulan - p.hasil.total[0].pendapatanBulan, fmt: RP });
    sel(ws, `${cJ}${totalR + 5}`, { f: `${cJ}${totalR + 1}*${p.kontrak}`, hasil: t.pendapatanBulan * p.kontrakN, fmt: RP });
  });
  legenda(ws, totalR + 7);
  return ws;
}

function sheetReview(wb: WB, catatan: ReturnType<typeof reviewTransport>) {
  const ws = wb.addWorksheet('Review');
  judul(ws, 'Review sebelum quotation', catatan.some(c => c.level === 'kritis') ? 'Masih ada catatan kritis — selesaikan sebelum membuat quotation.' : 'Tidak ada catatan kritis.');
  header(ws, 4, [{ t: 'Level', w: 12 }, { t: 'Rute', w: 34 }, { t: 'Catatan', w: 90 }]);
  catatan.forEach((c, i) => { sel(ws, `A${5 + i}`, { teks: c.level }); sel(ws, `B${5 + i}`, { teks: c.rute ?? '—' }); sel(ws, `C${5 + i}`, { teks: c.pesan }); });
  if (!catatan.length) ws.getCell('A5').value = 'Tidak ada catatan.';
}

/** Workbook tender Transportation. */
export async function workbookTransport(t: InfoTenderEkspor, tr: TenderTransport, rates: RateTransport[] = []) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); wb.creator = 'Leca — esapanghegar'; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const ring = ringkasTransport(tr);
  const { MG, KONTRAK } = ringkasan(wb, t, 'Transportation Tender', tr.marginGlobal, ring, { biaya: 'P', pend: 'Q', n: tr.rute.length });
  const ws = wb.addWorksheet('Rute');
  judul(ws, 'Rute & harga', 'Harga jual = ROUND(harga beli ÷ (1 − margin dipakai), 2). Margin khusus kosong = margin global (sheet Ringkasan).');
  header(ws, 4, [{ t: 'No', w: 5 }, { t: 'Origin', w: 18 }, { t: 'Destination', w: 18 }, { t: 'Jarak ± km (perkiraan)', w: 11 }, { t: 'Armada', w: 18 }, { t: 'Buying basis', w: 11 },
    { t: 'Volume / bln (input)', input: true, w: 12 }, { t: 'Vendor', w: 18 }, { t: 'Sumber harga', w: 12 }, { t: 'Harga beli (input)', input: true, w: 14 }, { t: 'Margin khusus (input, kosong = global)', input: true, w: 13 },
    { t: 'Margin dipakai', w: 10 }, { t: 'Harga jual', w: 15 }, { t: 'GP / unit', w: 13 }, { t: 'GP %', w: 9 }, { t: 'Biaya beli / bln', w: 16 }, { t: 'Pendapatan / bln', w: 16 }, { t: 'GP / bln', w: 15 }, { t: 'Lead time (hari)', w: 10 }]);
  tr.rute.forEach((x, i) => {
    const r = 5 + i, h = hitungRute(x, tr.marginGlobal);
    sel(ws, `A${r}`, { teks: i + 1 }); sel(ws, `B${r}`, { teks: x.origin }); sel(ws, `C${r}`, { teks: x.destination }); sel(ws, `D${r}`, { teks: jarakKm(x.origin, x.destination, 'darat') ?? '' });
    sel(ws, `E${r}`, { teks: x.armada }); sel(ws, `F${r}`, { teks: labelBasis(x.basis) }); sel(ws, `G${r}`, { input: x.volumeBulan || 0, fmt: '#,##0.##' });
    sel(ws, `H${r}`, { teks: x.vendor }); sel(ws, `I${r}`, { teks: x.sumberHarga ?? 'manual' }); sel(ws, `J${r}`, { input: x.hargaBeli || 0, fmt: RP });
    sel(ws, `K${r}`, { input: x.marginPersen ?? null, fmt: PCT });
    sel(ws, `L${r}`, { f: `IF(K${r}="",${MG},K${r})`, hasil: marginRute(x.marginPersen, tr.marginGlobal), fmt: PCT });
    sel(ws, `M${r}`, { f: `ROUND(J${r}/(1-${MAKS.replace('{m}', `L${r}`)}),2)`, hasil: h.jual, fmt: RP2 });
    sel(ws, `N${r}`, { f: `M${r}-J${r}`, hasil: r2(h.jual - x.hargaBeli), fmt: RP2 });
    sel(ws, `O${r}`, { f: `IF(M${r}>0,N${r}/M${r},0)`, hasil: h.gpPersen, fmt: PCT });
    sel(ws, `P${r}`, { f: `J${r}*G${r}`, hasil: h.biayaBulan, fmt: RP });
    sel(ws, `Q${r}`, { f: `M${r}*G${r}`, hasil: h.pendapatanBulan, fmt: RP });
    sel(ws, `R${r}`, { f: `Q${r}-P${r}`, hasil: h.gp, fmt: RP });
    sel(ws, `S${r}`, { teks: x.leadTimeHari ?? '' });
  });
  const tot = 5 + tr.rute.length, a = 5, b = Math.max(5, tot - 1), kosong = !tr.rute.length;
  sel(ws, `A${tot}`, { teks: 'Total', b: true });
  for (const [c, h] of [['P', ring.biayaBulan], ['Q', ring.pendapatanBulan], ['R', ring.gp]] as const) sel(ws, `${c}${tot}`, kosong ? { teks: 0 } : { f: `SUM(${c}${a}:${c}${b})`, hasil: h, fmt: RP, b: true });
  sel(ws, `O${tot}`, { f: `IF(Q${tot}>0,R${tot}/Q${tot},0)`, hasil: ring.gpPersen, fmt: PCT, b: true });
  legenda(ws, tot + 2);
  const tiers = tr.tierMargin ?? TIER_DEFAULT;
  perbandingan(wb, {
    baris: tr.rute.map((x, i) => ({ nama: `${x.origin} → ${x.destination}`, satuan: `${x.armada} · ${labelBasis(x.basis)}`, beliRef: `Rute!J${5 + i}`, volRef: `Rute!G${5 + i}`, kiniJual: `Rute!M${5 + i}`, kiniGp: `Rute!R${5 + i}`, beli: x.hargaBeli || 0, vol: x.volumeBulan || 0 })),
    tiers, hasil: tierTransport(tr, tiers), kontrak: KONTRAK, kontrakN: t.durasi_kontrak_bulan, intermodal: false,
  });
  sheetReview(wb, reviewTransport(tr, rates));
  return wb;
}

/** Workbook tender Intermodal (stage per rute + rute + perbandingan margin + review). */
export async function workbookIntermodal(t: InfoTenderEkspor, im: TenderIntermodal, rates: RateTransport[] = []) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); wb.creator = 'Leca — esapanghegar'; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const ring = ringkasIntermodal(im);
  const { MG, KONTRAK } = ringkasan(wb, t, 'Intermodal Tender', im.marginGlobal, ring, { biaya: 'N', pend: 'O', n: im.rute.length });
  // sheet Stage
  const st = wb.addWorksheet('Stage');
  judul(st, 'Stage per rute (pickup → main leg → delivery)', 'Biaya / shipment = harga beli × qty per shipment.');
  header(st, 4, [{ t: 'Rute no', w: 7 }, { t: 'Rute', w: 26 }, { t: 'Stage', w: 30 }, { t: 'Moda', w: 12 }, { t: 'Dari', w: 20 }, { t: 'Ke', w: 20 }, { t: 'Armada', w: 18 }, { t: 'Basis', w: 12 },
    { t: 'Qty / shipment (input)', input: true, w: 11 }, { t: 'Harga beli (input)', input: true, w: 14 }, { t: 'Vendor', w: 18 }, { t: 'Sumber harga', w: 12 }, { t: 'Lead time hari (input)', input: true, w: 10 }, { t: 'Biaya / shipment', w: 16 }]);
  let r = 5;
  im.rute.forEach((x, i) => x.stage.forEach((s, k) => {
    sel(st, `A${r}`, { teks: i + 1 }); sel(st, `B${r}`, { teks: `${x.origin} → ${x.destination}` }); sel(st, `C${r}`, { teks: NAMA_STAGE[k] });
    sel(st, `D${r}`, { teks: MODA.find(m => m.v === s.moda)?.l ?? s.moda }); sel(st, `E${r}`, { teks: s.dari }); sel(st, `F${r}`, { teks: s.ke }); sel(st, `G${r}`, { teks: s.armada }); sel(st, `H${r}`, { teks: labelBasis(s.basis) });
    sel(st, `I${r}`, { input: s.qty || 0, fmt: '#,##0.##' }); sel(st, `J${r}`, { input: s.harga || 0, fmt: RP }); sel(st, `K${r}`, { teks: s.vendor }); sel(st, `L${r}`, { teks: s.sumberHarga ?? 'manual' });
    sel(st, `M${r}`, { input: Number(s.leadTimeHari) || 0, fmt: '0.##' }); sel(st, `N${r}`, { f: `J${r}*I${r}`, hasil: (s.harga || 0) * (s.qty || 0), fmt: RP });
    r++;
  }));
  const s0 = 5, s1 = Math.max(5, r - 1), rs = (c: string) => `Stage!$${c}$${s0}:$${c}$${s1}`;
  legenda(st, r + 1);
  // sheet Rute
  const ws = wb.addWorksheet('Rute');
  judul(ws, 'Rute door to door', 'Beli / shipment = Σ biaya stage + biaya lain. Harga jual = ROUND(beli ÷ (1 − margin), 2); per satuan jual = ROUND(÷ qty jual, 2).');
  header(ws, 4, [{ t: 'No', w: 5 }, { t: 'Origin', w: 18 }, { t: 'Destination', w: 18 }, { t: 'Shipment / bln (input)', input: true, w: 11 }, { t: 'Satuan jual', w: 14 }, { t: 'Qty jual / shipment (input)', input: true, w: 11 },
    { t: 'Biaya lain / shipment (input)', input: true, w: 14 }, { t: 'Beli / shipment', w: 16 }, { t: 'Margin khusus (input, kosong = global)', input: true, w: 13 }, { t: 'Margin dipakai', w: 10 },
    { t: 'Jual / shipment', w: 16 }, { t: 'Beli / satuan', w: 14 }, { t: 'Jual / satuan', w: 14 }, { t: 'Biaya / bln', w: 16 }, { t: 'Pendapatan / bln', w: 16 }, { t: 'GP / bln', w: 15 }, { t: 'GP %', w: 9 }, { t: 'Lead time (hari)', w: 10 }]);
  im.rute.forEach((x, i) => {
    const rr = 5 + i, h = hitungIntermodal(x, im.marginGlobal);
    sel(ws, `A${rr}`, { teks: i + 1 }); sel(ws, `B${rr}`, { teks: x.origin }); sel(ws, `C${rr}`, { teks: x.destination });
    sel(ws, `D${rr}`, { input: x.shipmentBulan || 0, fmt: '#,##0.##' }); sel(ws, `E${rr}`, { teks: labelBasis(x.satuanJual) }); sel(ws, `F${rr}`, { input: x.qtyJual || 0, fmt: '#,##0.##' });
    sel(ws, `G${rr}`, { input: x.biayaLain || 0, fmt: RP });
    sel(ws, `H${rr}`, { f: `SUMIF(${rs('A')},A${rr},${rs('N')})+G${rr}`, hasil: h.beliShipment, fmt: RP });
    sel(ws, `I${rr}`, { input: x.marginPersen ?? null, fmt: PCT });
    sel(ws, `J${rr}`, { f: `IF(I${rr}="",${MG},I${rr})`, hasil: h.margin, fmt: PCT });
    sel(ws, `K${rr}`, { f: `ROUND(H${rr}/(1-${MAKS.replace('{m}', `J${rr}`)}),2)`, hasil: h.jualShipment, fmt: RP2 });
    sel(ws, `L${rr}`, { f: `ROUND(H${rr}/IF(F${rr}>0,F${rr},1),2)`, hasil: h.beliPerSatuan, fmt: RP2 });
    sel(ws, `M${rr}`, { f: `ROUND(K${rr}/IF(F${rr}>0,F${rr},1),2)`, hasil: h.jualPerSatuan, fmt: RP2 });
    sel(ws, `N${rr}`, { f: `H${rr}*D${rr}`, hasil: h.biayaBulan, fmt: RP });
    sel(ws, `O${rr}`, { f: `K${rr}*D${rr}`, hasil: h.pendapatanBulan, fmt: RP });
    sel(ws, `P${rr}`, { f: `O${rr}-N${rr}`, hasil: h.gp, fmt: RP });
    sel(ws, `Q${rr}`, { f: `IF(K${rr}>0,(K${rr}-H${rr})/K${rr},0)`, hasil: h.gpPersen, fmt: PCT });
    sel(ws, `R${rr}`, { f: `SUMIF(${rs('A')},A${rr},${rs('M')})`, hasil: h.leadTimeHari, fmt: '0.##' });
  });
  const tot = 5 + im.rute.length, a = 5, b = Math.max(5, tot - 1), kosong = !im.rute.length;
  sel(ws, `A${tot}`, { teks: 'Total', b: true });
  for (const [c, h] of [['N', ring.biayaBulan], ['O', ring.pendapatanBulan], ['P', ring.gp]] as const) sel(ws, `${c}${tot}`, kosong ? { teks: 0 } : { f: `SUM(${c}${a}:${c}${b})`, hasil: h, fmt: RP, b: true });
  sel(ws, `Q${tot}`, { f: `IF(O${tot}>0,P${tot}/O${tot},0)`, hasil: ring.gpPersen, fmt: PCT, b: true });
  legenda(ws, tot + 2);
  const tiers = im.tierMargin ?? TIER_DEFAULT;
  perbandingan(wb, {
    baris: im.rute.map((x, i) => ({ nama: `${x.origin} → ${x.destination}`, satuan: labelBasis(x.satuanJual), beliRef: `Rute!H${5 + i}`, volRef: `Rute!D${5 + i}`, qtyRef: `Rute!F${5 + i}`, kiniJual: `Rute!M${5 + i}`, kiniGp: `Rute!P${5 + i}`, beli: hitungIntermodal(x, im.marginGlobal).beliShipment, vol: x.shipmentBulan || 0, qty: x.qtyJual || 0 })),
    tiers, hasil: tierIntermodal(im, tiers), kontrak: KONTRAK, kontrakN: t.durasi_kontrak_bulan, intermodal: true,
  });
  sheetReview(wb, reviewIntermodal(im, rates));
  return wb;
}

export const namaFileTr = (jenis: 'transportation' | 'intermodal', t: InfoTenderEkspor) =>
  `Leca_${jenis === 'transportation' ? 'Transport' : 'Intermodal'}_${(t.kode || t.customer).replace(/[\\/:*?"<>|()\s-]+/g, '_').replace(/^_+|_+$/g, '')}.xlsx`;

/** Unduh di browser. */
export async function unduhExcelTr(jenis: 'transportation' | 'intermodal', t: InfoTenderEkspor, data: TenderTransport | TenderIntermodal, rates: RateTransport[] = []) {
  const wb = jenis === 'transportation' ? await workbookTransport(t, data as TenderTransport, rates) : await workbookIntermodal(t, data as TenderIntermodal, rates);
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = namaFileTr(jenis, t); a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
