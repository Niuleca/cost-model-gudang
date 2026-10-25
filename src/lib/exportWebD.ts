import type { MpBarisXl } from '@/lib/exportWebB';
// Sheet "Hasil" (KPI, red flag, rate card & margin, simulasi, kurs, porsi kategori, opex/capex, kalender, space,
// kebutuhan manpower & MHE, rincian biaya per bulan), "Quotation" dan "0 Ringkasan" (format PNL).
import { R, q, BUCKETS, LAYANAN, NF, C, type Ctx, type Line, type Fmt, type NilaiSel } from '@/lib/exportWebUtil';
import { fRoundup } from '@/lib/exportRumus';

const BK = ['Sto', 'HIn', 'HOut', 'Vas', 'Man'];
const ARUS_B: Record<string, string> = { storage: 'sto', handling_in: 'in', handling_out: 'out', vas: 'vas' };
const RISK = ['Rendah', 'Sedang', 'Tinggi'] as const;
type HasilRc = Ctx['d']['h']['rateCard'][number];

export function tulisHasil(x: Ctx) {
  const { HS, d, a } = x;
  const { h, m, t } = d;
  const SN = `'${HS.nama}'!`;
  HS.lebar(54, 17, 44, 16, 16, 16, 15, 16, 16, 15, 15, 15, 16, 14, 12, 15, 12);
  const s0 = h.simulasi[0];
  // Rate card: layanan dengan biaya > 0 (sama dengan web); tender tanpa volume → Storage / Handling In / Out tetap disiapkan
  type Rc = HasilRc;
  const kosong = (b: string): Rc => ({ bucket: b, uom: d.inp.volumes.find(v => v.arus === (b === 'storage' ? 'storage' : b === 'handling_in' ? 'inbound' : 'outbound'))?.uom ?? 'palet',
    volumeTarif: 0, biayaBulan: 0, biayaPerUnit: 0, gpDefault: 0, hargaSebelumPph: 0, hargaBulan: 0, tarifPerUnit: 0, tarifInclPpn: 0, tarifQuote: 0, gpPersen: 0 } as unknown as Rc);
  const rcList: Rc[] = h.rateCard.length ? h.rateCard : ['storage', 'handling_in', 'handling_out'].map(kosong);
  x.rcList = rcList;
  // ===================== KPI
  HS.h2('Hasil', 'Semua angka di sheet ini rumus dari sheet input. Ubah input (sel putih tulang) → hasil, rate card, quotation & ringkasan ikut berubah.');
  HS.hdr(['Indikator', 'Nilai', 'Keterangan']);
  HS.put(1, 'Cost per bulan', { j: 'txt', b: true }); HS.put(2, { f: 'TotalBiaya', v: h.totalBiayaBulan }, { j: 'out', fmt: 'rp', b: true }); HS.put(3, { f: '"per tahun "&FIXED(TotalBiaya*12,0)' }, { j: 'txt' }); HS.r++;
  HS.put(1, 'Selling per bulan', { j: 'txt', b: true }); HS.put(2, { f: 'Sim_Pend', v: s0?.pendapatanBulan }, { j: 'out', fmt: 'rp', b: true }); HS.put(3, { f: '"per tahun "&FIXED(Sim_Pend*12,0)&" · bersih setelah PPh"' }, { j: 'txt' }); HS.r++;
  HS.put(1, 'Profit per bulan', { j: 'txt', b: true }); HS.put(2, { f: 'Sim_Gp', v: s0?.gp }, { j: 'out', fmt: 'rp', b: true }); HS.put(3, { f: '"per tahun "&FIXED(Sim_Gp*12,0)' }, { j: 'txt' }); HS.r++;
  HS.put(1, 'Margin (GP%)', { j: 'txt', b: true }); HS.put(2, { f: 'Sim_GpPct', v: s0?.gpPersen }, { j: 'out', fmt: 'pct', b: true }); HS.put(3, 'atas volume komitmen', { j: 'txt' }); HS.r++;
  HS.put(1, 'Jumlah manpower', { j: 'txt', b: true }); HS.put(2, { f: 'TotalHeadcount', v: h.totalHeadcount }, { j: 'out', fmt: 'n0', b: true }); HS.put(3, 'orang · headcount setelah rangkap', { j: 'txt' }); HS.r++;
  HS.put(1, 'Luas gudang', { j: 'txt', b: true }); HS.put(2, { f: 'LuasM2', v: h.space.totalM2 }, { j: 'out', fmt: 'n0', b: true }); HS.put(3, { f: 'IF(GdPilih="—","m² · gudang belum dipilih","m² · "&SUBSTITUTE(GdPilih,"(terpilih) ","")&" · dari "&FIXED(GdLuas,0)&" m²")' }, { j: 'txt' }); HS.r++;

  // ===================== Red flag
  HS.r++;
  const fl = [...h.redFlags, ...(d.catatanMaster ?? []).map(c => ({ level: 'peringatan' as const, kode: 'MASTER_DATA', pesan: c }))];
  HS.h2(`Red flag — ${fl.filter(f => f.level === 'kritis').length} kritis`, 'Daftar saat export (dihitung di web). Cek ulang di web setelah mengubah input di Excel.');
  HS.hdr(['Pesan', 'Level', 'Kode']);
  if (!fl.length) { HS.put(1, 'Tidak ada red flag.', { j: 'txt' }); HS.r++; }
  for (const f of fl) { HS.put(1, f.pesan, { j: 'txt', wrap: true }); HS.put(2, f.level.toUpperCase(), { j: 'txt', b: true, color: f.level === 'kritis' ? 'FFB91C1C' : f.level === 'peringatan' ? 'FFB45309' : C.MUTED }); HS.put(3, f.kode, { j: 'txt', size: 9 }); HS.r++; }

  // ===================== Rate card & margin — parameter
  HS.r++;
  const pj = h.pajak;
  HS.h2('Rate card & margin', 'Margin = GP% atas pendapatan per layanan: harga = biaya ÷ (1 − GP%). Kosong = default per kategori risiko (master Finance). PPN bukan pendapatan; PPh 23 dipotong customer.');
  HS.field('PPh 23', pj.pph === 'include' ? 'Include PPh — ditanggung kita' : 'Exclude PPh — ditanggung customer', 'teks', 'in', '', 'Exclude = tarif di-gross-up, pendapatan bersih tetap', 'PphMode', 'L_Pph');
  HS.field('Tarif PPh 23 (master Finance)', m.finance.pphGrossUp, 'pct', 'in', '', '', 'PPh');
  HS.field('Gross-up PPh dipakai', { f: 'IF(LEFT(PphMode,7)="Exclude",PPh,0)' }, 'pct', 'out', '', '', 'GrossUp');
  HS.field('PPN / VAT', pj.ppn === 'include' ? 'Include PPN — sudah termasuk tarif' : 'Exclude PPN — ditambah di invoice', 'teks', 'in', '', '', 'PpnMode', 'L_Ppn');
  HS.field('Tarif PPN efektif', pj.ppnPersen ?? 0.11, 'pct', 'in', '', 'PPN 12% × DPP 11/12 = 11%', 'PPN');
  HS.field('Margin default — risiko Rendah', m.margin.Rendah, 'pct', 'in', 'markup', 'master Finance', 'MRendah');
  HS.field('Margin default — risiko Sedang', m.margin.Sedang, 'pct', 'in', 'markup', '', 'MSedang');
  HS.field('Margin default — risiko Tinggi', m.margin.Tinggi, 'pct', 'in', 'markup', '', 'MTinggi');
  HS.field('Overhead', m.finance.overheadPersen, 'pct', 'in', '', '× subtotal biaya (master Finance)', 'Overhead');
  HS.field('GP minimum (red flag)', m.finance.gpMinimum, 'pct', 'in', '', '', 'GpMin');
  HS.field('Contoh harga Rp100.000', { f: '"tarif "&IF(GrossUp>0,"di-gross-up jadi "&FIXED(100000/(1-GrossUp),0),"tetap 100.000")&" → PPh 23 dipotong "&FIXED(100000/(1-GrossUp)*PPh,0)&" → diterima "&FIXED(100000/(1-GrossUp)*(1-PPh),0)' }, 'teks', 'out');

  // ===================== Rincian biaya per bulan — susun posisi baris lebih dulu (dirujuk rate card)
  const lines = x.lines;
  // revisi manual web (kunci = deskripsi baris) — hanya baris pertama yang cocok & baris MHE dengan unit di web
  const dipakai = new Set<string>();
  for (const l of lines) {
    const rv = a.revisiBiaya?.[l.deskKey];
    const aktif = rv != null && Number.isFinite(rv) && !dipakai.has(l.deskKey) && h.biaya.some(b => b.deskripsi === l.deskKey);
    l.revisi = aktif ? rv : null; if (aktif) dipakai.add(l.deskKey);
  }
  const urutKel = Object.entries(h.perKelompok).sort((p1, p2) => p2[1] - p1[1]).map(([k]) => k);
  for (const l of lines) if (!urutKel.includes(l.kel)) urutKel.push(l.kel);
  const grup = urutKel.map(k => ({ k, rows: lines.filter(l => l.kel === k) })).filter(g0 => g0.rows.length);

  // ===================== Biaya per layanan & kategori risiko
  HS.r++;
  HS.h3('Biaya per layanan & kategori risiko (dasar rate card)');
  HS.note('Σ biaya × alokasi % per layanan (Rincian biaya, kolom alokasi). Manajemen (biaya tetap) disebar ke layanan operasional sesuai porsi biayanya.');
  HS.hdr(['Layanan', 'Rendah', 'Sedang', 'Tinggi', 'Total', 'Porsi ops', '+Man R', '+Man S', '+Man T', 'Rendah ef.', 'Sedang ef.', 'Tinggi ef.', 'Biaya/bln']);
  const bk0 = HS.r;
  const bkRow: Record<string, number> = {};
  for (const [i, b] of BUCKETS.entries()) {
    const r = HS.r; bkRow[b] = r;
    HS.put(1, LAYANAN[b], { j: 'txt', b: true });
    RISK.forEach((k, j) => HS.put(2 + j, { f: `SUMPRODUCT((Rinci_Risk=${q(k)})*Rinci_Biaya*Rinci_Al${BK[i]})` }, { j: 'out', fmt: 'rp' }));
    HS.put(5, { f: `SUM(B${r}:D${r})` }, { j: 'out', fmt: 'rp' });
    HS.r++;
  }
  const opsTot = `SUM($E$${bk0}:$E$${bk0 + 3})`;
  for (const b of BUCKETS) {
    const r = bkRow[b];
    if (b === 'manajemen') { for (let c = 6; c <= 13; c++) HS.put(c, '', { j: 'out' }, r); continue; }
    HS.put(6, { f: `IF(${opsTot}>0,E${r}/${opsTot},0)` }, { j: 'out', fmt: 'pct' }, r);
    RISK.forEach((_, j) => { HS.put(7 + j, { f: `${R(2 + j, bkRow.manajemen)}*F${r}` }, { j: 'out', fmt: 'rp' }, r); HS.put(10 + j, { f: `${R(2 + j, r)}+${R(7 + j, r)}` }, { j: 'out', fmt: 'rp' }, r); });
    HS.put(13, { f: `SUM(J${r}:L${r})`, v: rcList.find(z => z.bucket === b)?.biayaBulan }, { j: 'out', fmt: 'rp', b: true }, r);
  }

  // ===================== Opsi UoM tarif (dasar droplist "Satuan tarif")
  HS.r++;
  HS.h3('Opsi satuan tarif per layanan');
  HS.note('Volume komitmen dikonversi ke tiap satuan (palet / case / pcs / CBM / kg, + m² untuk storage). "Tetap" = basis tidak ikut volume (m², stok rata-rata). Satuan tanpa konversi bernilai 0 (tidak bisa dipilih).');
  HS.hdr(['Layanan', 'UoM', 'Volume / bln', 'Dasar', 'Tetap', 'Kunci']);
  const opsi: Record<string, { r0: number; r1: number }> = {};
  for (const rc of rcList) {
    const b = rc.bucket, k = ARUS_B[b];
    const ix = `MATCH(${q(b === 'storage' ? 'storage' : b === 'handling_in' ? 'inbound' : b === 'handling_out' ? 'outbound' : 'vas')},Vol_Arus,0)`;
    const u1 = `IFERROR(INDEX(Vol_Uom1,${ix}),"")`, u2 = `IFERROR(INDEX(Vol_Uom2,${ix}),"")`, p1 = `IFERROR(N(INDEX(Vol_Per1,${ix})),0)`, p2 = `IFERROR(N(INDEX(Vol_Per2,${ix})),0)`;
    const pal = `OR(LOWER(TRIM(Uom_${k}))="palet",LOWER(TRIM(Uom_${k}))="pallet")`;
    const rows: [NilaiSel, string, string, number][] = [
      [{ f: `Uom_${k}` }, `Km_${k}`, '"volume komitmen "&Uom_' + k, 0],
      [{ f: u1 }, `IF(AND(${p1}>0,${u1}<>""),Km_${k}*${p1},0)`, `Uom_${k}&" × "&${p1}&" "&${u1}`, 0],
      [{ f: u2 }, `IF(AND(${p1}>0,${p2}>0,${u2}<>""),Km_${k}*${p1}*${p2},0)`, `Uom_${k}&" × "&${p1}&" × "&${p2}&" "&${u2}`, 0],
    ];
    if (b === 'storage') rows.push(['m²', 'LuasM2', '"luas gudang (m²)"', 1],
      ['CBM', `IF(StokCbm>0,StokCbm,IF(${pal},Km_${k}*CbmPalet,0))`, `IF(StokCbm>0,"stok rata-rata (CBM)","palet × "&CbmPalet&" CBM")`, -1],
      ['kg', `IF(StokTon>0,StokTon*1000,IF(${pal},Km_${k}*TonPalet*1000,0))`, `IF(StokTon>0,"stok rata-rata (kg)","palet × "&KgPalet&" kg")`, -2],
      ['liter', 'StokLiter', '"stok rata-rata (liter)"', 1]);
    else rows.push(['CBM', `IF(${pal},Km_${k}*CbmPalet,0)`, '"palet × "&CbmPalet&" CBM"', 0], ['kg', `IF(${pal},Km_${k}*TonPalet*1000,0)`, '"palet × "&KgPalet&" kg"', 0]);
    const r0 = HS.r;
    for (const [u, vol, dasar, tetap] of rows) {
      const r = HS.r;
      HS.put(1, LAYANAN[b], { j: 'txt' }); HS.put(2, u, { j: 'out' }); HS.put(3, { f: vol }, { j: 'out', fmt: 'n2' }); HS.put(4, { f: dasar }, { j: 'out', size: 9 });
      HS.put(5, tetap === 1 ? 1 : tetap === -1 ? { f: 'IF(StokCbm>0,1,0)' } : tetap === -2 ? { f: 'IF(StokTon>0,1,0)' } : 0, { j: 'out', fmt: 'n0' });
      HS.put(6, { f: `IF(AND(N(C${r})>0,COUNTIF(F$${r0}:F${r},LOWER(B${r}))=0),LOWER(B${r}),"")`.replace(`F$${r0}:F${r}`, r === r0 ? `F$${r0}:F$${r0}` : `F$${r0}:F${r - 1}`) }, { j: 'out', size: 9 });
      if (r === r0) HS.put(6, { f: `IF(N(C${r})>0,LOWER(B${r}),"")` }, { j: 'out', size: 9 });
      HS.r++;
    }
    opsi[b] = { r0, r1: HS.r - 1 };
  }

  // ===================== Rate card
  HS.r++;
  HS.h3('Rate card');
  HS.hdr(['Layanan', ['Satuan tarif / UoM', true], 'Volume komitmen (tarif)', 'Biaya/bln', 'Biaya/unit', ['GP% (input)', true], 'GP default', 'Harga sblm PPh', 'Harga/bln (gross-up)', 'Tarif excl. PPN', 'PPN', 'Tarif incl. PPN', 'Tarif quotation', 'Tetap', 'Rasio UoM', 'Harga default', 'GP %']);
  const rc0 = HS.r;
  const rcRef: Record<string, Record<string, string>> = {};
  for (const rc of rcList) {
    const r = HS.r, b = rc.bucket, k = ARUS_B[b], o = opsi[b], br = bkRow[b];
    const keys = `$F$${o.r0}:$F$${o.r1}`, idx = `IFERROR(MATCH(LOWER(B${r}),${keys},0),IFERROR(MATCH("?*",${keys},0),1))`;
    HS.put(1, LAYANAN[b], { j: 'txt', b: true });
    HS.put(2, rc.uom, { j: 'in' }); HS.dd(2, `$B$${o.r0}:$B$${o.r1}`);
    HS.put(3, { f: `INDEX($C$${o.r0}:$C$${o.r1},${idx})`, v: rc.volumeTarif }, { j: 'out', fmt: 'n2' });
    HS.put(4, { f: `M${br}`, v: rc.biayaBulan }, { j: 'out', fmt: 'rp' });
    HS.put(5, { f: `IF(C${r}>0,D${r}/C${r},0)`, v: rc.biayaPerUnit }, { j: 'out', fmt: 'rp' });
    const mm = a.marginManual?.[b];
    HS.put(6, mm != null && Number.isFinite(mm) ? Number(mm) : null, { j: 'in', fmt: 'pct' });
    HS.put(16, { f: `J${br}*(1+MRendah)+K${br}*(1+MSedang)+L${br}*(1+MTinggi)` }, { j: 'out', fmt: 'rp' });
    HS.put(7, { f: `IF(P${r}>0,1-D${r}/P${r},0)`, v: rc.gpDefault }, { j: 'out', fmt: 'pct' });
    HS.put(8, { f: `IF(F${r}="",P${r},D${r}/(1-MIN(0.95,F${r})))`, v: rc.hargaSebelumPph }, { j: 'out', fmt: 'rp' });
    HS.put(9, { f: `H${r}/(1-GrossUp)`, v: rc.hargaBulan }, { j: 'out', fmt: 'rp' });
    HS.put(10, { f: fRoundup(`IF(C${r}>0,I${r}/C${r},0)`), v: rc.tarifPerUnit }, { j: 'out', fmt: 'rp', b: true });
    HS.put(12, { f: fRoundup(`J${r}*(1+PPN)`), v: rc.tarifInclPpn }, { j: 'out', fmt: 'rp' });
    HS.put(11, { f: `L${r}-J${r}` }, { j: 'out', fmt: 'rp' });
    HS.put(13, { f: `IF(LEFT(PpnMode,7)="Include",L${r},J${r})`, v: rc.tarifQuote }, { j: 'out', fmt: 'rp', b: true });
    HS.put(14, { f: `INDEX($E$${o.r0}:$E$${o.r1},${idx})` }, { j: 'out', fmt: 'n0' });
    HS.put(15, { f: `IF(AND(Km_${k}>0,N(N${r})=0),C${r}/Km_${k},1)` }, { j: 'out', fmt: 'x' });
    HS.put(17, { f: `IF(H${r}>0,1-D${r}/H${r},0)`, v: rc.gpPersen }, { j: 'out', fmt: 'pct' });
    rcRef[b] = { uom: `${SN}B${r}`, vol: `${SN}C${r}`, tarif: `${SN}J${r}`, incl: `${SN}L${r}`, gp: `${SN}Q${r}`, bpu: `${SN}E${r}`, quote: `${SN}M${r}`, harga: `${SN}I${r}`, tetap: `${SN}N${r}`, rasio: `${SN}O${r}` };
    HS.r++;
  }
  const rc1 = HS.r - 1;
  const mt = h.marginTotal;
  HS.put(1, 'Total (gabungan semua layanan)', { j: 'sub' }); HS.put(2, '', { j: 'sub' }); HS.put(3, '', { j: 'sub' });
  HS.put(4, { f: `SUM(D${rc0}:D${rc1})`, v: mt.biayaBulan }, { j: 'sub', fmt: 'rp' }); HS.put(5, '', { j: 'sub' }); HS.put(6, '', { j: 'sub' }); HS.put(7, '', { j: 'sub' });
  HS.put(8, { f: `SUM(H${rc0}:H${rc1})`, v: mt.hargaSebelumPph }, { j: 'sub', fmt: 'rp' }); HS.put(9, { f: `SUM(I${rc0}:I${rc1})`, v: mt.hargaBulan }, { j: 'sub', fmt: 'rp' });
  HS.put(17, { f: `IF(H${HS.r}>0,1-D${HS.r}/H${HS.r},0)`, v: mt.gpPersen }, { j: 'sub', fmt: 'pct' });
  HS.r++;
  HS.note('Kolom tebal "Tarif quotation" = tarif yang dipakai di quotation (excl./incl. PPN sesuai pilihan PPN). Satuan tarif: pilih dari opsi di atas.');
  const st = rcList.find(z => z.bucket === 'storage');
  if (st) {
    const hg = rcRef.storage.harga;
    HS.field('Storage alternatif · per m²', { f: fRoundup(`${hg}/MAX(1,LuasM2)`) }, 'rp', 'out', 'Rp/m²/bln');
    HS.field('Storage alternatif · per kg', { f: `IF(StokTon>0,${fRoundup(`${hg}/(StokTon*1000)`)},"")` }, 'rp', 'out', 'Rp/kg/bln');
    HS.field('Storage alternatif · per CBM', { f: `IF(StokCbm>0,${fRoundup(`${hg}/StokCbm`)},"")` }, 'rp', 'out', 'Rp/CBM/bln');
    HS.field('Storage alternatif · per liter', { f: `IF(StokLiter>0,${fRoundup(`${hg}/StokLiter`)},"")` }, 'rp', 'out', 'Rp/liter/bln');
  }

  // ===================== Simulasi
  HS.r++;
  HS.h3('Simulasi');
  HS.hdr(['Skenario', 'Pendapatan/bln', 'Biaya/bln', 'GP/bln', 'GP%', 'PPN/bln', 'Invoice incl. PPN/bln', 'Pendapatan/thn', 'Biaya/thn', 'GP/thn', 'GP selama kontrak']);
  for (const [i, [l, key]] of ([['Volume komitmen', 'Km'], ['Volume rata-rata', 'Rt'], ['Volume peak', 'Pk']] as const).entries()) {
    const r = HS.r;
    const pend = rcList.map(rc => { const z = rcRef[rc.bucket]; return `${z.tarif}*IF(${z.tetap}=1,${z.vol},${key}_${ARUS_B[rc.bucket]}*${z.rasio})`; }).join('+') || '0';
    const sim = h.simulasi[i];
    HS.put(1, l, { j: 'txt', b: true });
    HS.put(2, { f: `(${pend})*(1-PPh)`, v: sim?.pendapatanBulan }, { j: 'out', fmt: 'rp' });
    HS.put(3, { f: 'TotalBiaya', v: h.totalBiayaBulan }, { j: 'out', fmt: 'rp' });
    HS.put(4, { f: `B${r}-C${r}`, v: sim?.gp }, { j: 'out', fmt: 'rp' });
    HS.put(5, { f: `IF(B${r}>0,D${r}/B${r},0)`, v: sim?.gpPersen }, { j: 'out', fmt: 'pct', b: true });
    HS.put(6, { f: `(${pend})*PPN` }, { j: 'out', fmt: 'rp' }); HS.put(7, { f: `(${pend})*(1+PPN)` }, { j: 'out', fmt: 'rp' });
    HS.put(8, { f: `B${r}*12` }, { j: 'out', fmt: 'rp' }); HS.put(9, { f: `C${r}*12` }, { j: 'out', fmt: 'rp' }); HS.put(10, { f: `D${r}*12` }, { j: 'out', fmt: 'rp' }); HS.put(11, { f: `D${r}*Kontrak` }, { j: 'out', fmt: 'rp' });
    if (i === 0) { HS.nm('Sim_Pend', 2); HS.nm('Sim_Gp', 4); HS.nm('Sim_GpPct', 5); }
    HS.r++;
  }
  HS.field('Cek GP komitmen vs GP minimum', { f: 'IF(Sim_GpPct<GpMin,"KRITIS: GP di bawah batas "&FIXED((GpMin)*100,1)&"%","OK")' }, 'teks', 'out');
  HS.note('Pendapatan = tarif sebelum PPN × volume, dikurangi PPh 23 (dipotong customer). Per tahun = per bulan × 12.');

  // ===================== Konversi mata uang
  HS.r++;
  HS.h2('Konversi mata uang', 'Pilih mata uang & isi kurs (1 mata uang = Rp …). Cek kembali kurs sebelum dikirim ke customer.');
  HS.field('Mata uang', a.kurs?.kode ?? '—', 'teks', 'in', '', '', 'KursKode', 'L_Kurs');
  HS.field('Kurs: 1 mata uang = Rp', a.kurs?.rupiahPer ?? null, 'n2', 'in', 'Rp', a.kurs?.tanggal ? `kurs ${a.kurs.tanggal}` : '', 'KursNilai');
  HS.hdr(['Tarif (sesuai PPN)', 'IDR', 'Mata uang asing']);
  for (const rc of rcList) { const z = rcRef[rc.bucket];
    HS.put(1, { f: `"${LAYANAN[rc.bucket]} / "&${z.uom}` }, { j: 'txt' }); HS.put(2, { f: z.quote }, { j: 'out', fmt: 'rp' }); HS.put(3, { f: `IF(N(KursNilai)>0,B${HS.r}/KursNilai,"")` }, { j: 'out', fmt: 'n2', b: true }); HS.r++; }
  HS.hdr(['Volume komitmen', 'IDR', 'Mata uang asing']);
  for (const [l, f] of [['Pendapatan/bln', 'Sim_Pend'], ['Biaya/bln', 'TotalBiaya'], ['GP/bln', 'Sim_Gp'], ['Pendapatan/thn', 'Sim_Pend*12'], ['Biaya/thn', 'TotalBiaya*12'], ['GP/thn', 'Sim_Gp*12'], ['Investasi', 'TotalInvestasi']]) {
    HS.put(1, l, { j: 'txt' }); HS.put(2, { f }, { j: 'out', fmt: 'rp' }); HS.put(3, { f: `IF(N(KursNilai)>0,B${HS.r}/KursNilai,"")` }, { j: 'out', fmt: 'n2', b: true }); HS.r++;
  }

  // ===================== Porsi biaya per kategori
  HS.r++;
  HS.h2('Porsi biaya per kategori');
  HS.hdr(['Kategori', 'Biaya/bln', 'Biaya/thn', '%']);
  const pk0 = HS.r;
  for (const g0 of grup) { const r = HS.r;
    HS.put(1, g0.k, { j: 'txt', b: true }); HS.put(2, { f: `SUMIFS(Rinci_Biaya,Rinci_Kel,A${r})`, v: h.perKelompok[g0.k] }, { j: 'out', fmt: 'rp' });
    HS.put(3, { f: `B${r}*12` }, { j: 'out', fmt: 'rp' }); HS.put(4, { f: `IF(TotalBiaya>0,B${r}/TotalBiaya,0)` }, { j: 'out', fmt: 'pct', b: true }); HS.r++; }
  const pk1 = HS.r - 1;
  HS.put(1, 'Total', { j: 'sub' }); HS.put(2, { f: `SUM(B${pk0}:B${pk1})` }, { j: 'sub', fmt: 'rp' }); HS.put(3, { f: `SUM(C${pk0}:C${pk1})` }, { j: 'sub', fmt: 'rp' }); HS.put(4, { f: `SUM(D${pk0}:D${pk1})` }, { j: 'sub', fmt: 'pct' }); HS.r++;
  HS.ws.addConditionalFormatting({ ref: `D${pk0}:D${pk1}`, rules: [{ type: 'dataBar', priority: 1, minLength: 0, maxLength: 100, gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF555555' } }] });

  // ===================== Opex vs capex
  HS.r++;
  HS.h2('Opex vs capex');
  HS.hdr(['Jenis', 'Biaya/bln', 'Biaya/thn', '%', 'Keterangan']);
  const oj0 = HS.r;
  const inv = lines.filter(l => l.nilai && (l.capex || l.kel === 'Startup' || l.kel === 'MHE' || l.kel === 'IT' || l.kel === 'Racking' || l.nilai.startsWith('IF(OR('))).map(l => l.nilai!);
  for (const [l, k, ket] of [['Opex', 'Opex', 'biaya operasional: manpower, sewa gudang/MHE, utilitas, consumable, overhead, dll.'], ['Capex', 'Capex', null], ['Interest cost', 'Interest', 'bunga pinjaman yang dipilih di sheet Interest cost']] as const) {
    const r = HS.r;
    HS.put(1, l, { j: 'txt', b: true }); HS.put(2, { f: `SUMIFS(Rinci_Biaya,Rinci_Jenis,${q(k)})`, v: h.perJenis[k === 'Opex' ? 'opex' : k === 'Capex' ? 'capex' : 'interest'] }, { j: 'out', fmt: 'rp' });
    HS.put(3, { f: `B${r}*12` }, { j: 'out', fmt: 'rp' }); HS.put(4, { f: `IF(TotalBiaya>0,B${r}/TotalBiaya,0)` }, { j: 'out', fmt: 'pct', b: true });
    HS.put(5, ket ?? { f: '"depresiasi/amortisasi investasi (total investasi Rp"&FIXED(TotalInvestasi,0)&")"' }, { j: 'txt', size: 9 });
    HS.r++;
  }
  HS.put(1, 'Total', { j: 'sub' }); HS.put(2, { f: `SUM(B${oj0}:B${HS.r - 1})` }, { j: 'sub', fmt: 'rp' }); HS.put(3, { f: `SUM(C${oj0}:C${HS.r - 1})` }, { j: 'sub', fmt: 'rp' }); HS.put(4, { f: `SUM(D${oj0}:D${HS.r - 1})` }, { j: 'sub', fmt: 'pct' }); HS.r++;
  HS.ws.addConditionalFormatting({ ref: `D${oj0}:D${oj0 + 2}`, rules: [{ type: 'dataBar', priority: 1, minLength: 0, maxLength: 100, gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF555555' } }] });
  HS.field('Total investasi (capex)', { f: inv.length ? inv.map(z => `(${z})`).join('+') : '0', v: h.investasi }, 'rp', 'out', 'Rp', '', 'TotalInvestasi');

  // ===================== Kalender & volume desain
  HS.r++;
  HS.h2('Kalender & volume desain');
  HS.field('Hari kerja kalender', { f: 'NETWORKDAYS.INTL(DATE(Tahun,1,1),DATE(Tahun,12,31),WeekendKode)', v: h.kalender.hariKalenderKerja }, 'n0', 'out', 'hari', 'hari kerja per minggu di Key assumption', 'HariKalKerja');
  HS.field('Libur nasional & cuti bersama di hari kerja', { f: 'SUM(D_LiburHK)', v: h.kalender.liburDiHariKerja }, 'n0', 'out', 'hari', 'dari master hari libur (sheet Daftar)', 'LiburHK');
  HS.field('Hari operasional gudang', { f: 'HariKalKerja-LiburHK', v: h.kalender.hariOperasional }, 'n0', 'out', 'hari', '', 'HariOps');
  HS.field('Hari operasional / bulan', { f: 'HariOps/12', v: h.kalender.hariOperasionalBulan }, 'n2', 'out', 'hari', 'dipakai listrik & volume desain', 'HariOpsBln');
  HS.field('Cuti tahunan per orang', { f: 'Cuti' }, 'n0', 'out', 'hari');
  HS.field('Hari kerja per orang', { f: 'HariOps-Cuti', v: h.kalender.hariKerjaOrang }, 'n0', 'out', 'hari');
  HS.field('Faktor pengganti', { f: 'IF(HariOps-Cuti>0,HariOps/(HariOps-Cuti),1)', v: h.kalender.faktorPengganti }, 'x', 'out', '×');
  HS.hdr(['Arus', 'Peak/bln', 'Faktor peak', 'Desain/hari', 'Desain/shift']);
  for (const [ar, k] of [['inbound', 'in'], ['outbound', 'out'], ['storage', 'sto'], ['vas', 'vas']] as const) {
    if (!d.h.volume.some(v => v.arus === ar)) continue;
    const r = HS.r;
    HS.put(1, { f: `"${ar} ("&Uom_${k}&")"` }, { j: 'txt' }); HS.put(2, { f: `Pk_${k}` }, { j: 'out', fmt: 'n0' }); HS.put(3, { f: `IF(Rt_${k}>0,Pk_${k}/Rt_${k},1)` }, { j: 'out', fmt: 'n2' });
    HS.put(4, { f: ar === 'storage' ? `Pk_${k}` : `IF(HariOpsBln>0,Pk_${k}/HariOpsBln,0)` }, { j: 'out', fmt: 'n1' }); HS.put(5, { f: ar === 'storage' ? `Pk_${k}` : `D${r}/MAX(1,Shift)` }, { j: 'out', fmt: 'n1' });
    HS.r++;
  }

  // ===================== Space
  HS.r++;
  HS.h2('Space');
  HS.field('Posisi palet desain (peak)', { f: 'PP', v: h.space.ppDesain }, 'n0', 'out', 'PP');
  HS.field('m² per posisi', { f: 'IF(PP>0,(SprFp+DdrFp+BlkFp+FlrFp)/PP,0)', v: h.space.m2PerPP }, 'n3', 'out', 'm²');
  HS.field('Area simpan', { f: 'SprFp+DdrFp+BlkFp+FlrFp', v: h.space.storageM2 }, 'n1', 'out', 'm²');
  HS.field('Staging inbound / outbound', { f: 'FIXED(StIFp,1)&" / "&FIXED(StOFp,1)' }, 'teks', 'out', 'm²');
  HS.field('Fasilitas', { f: 'SUM(FasilitasM2)', v: h.space.fasilitasM2 }, 'n1', 'out', 'm²');
  HS.field('Allowance (pembulatan)', { f: 'LuasM2-SpaceSubtotal', v: h.space.allowanceM2 }, 'n1', 'out', 'm²');
  HS.field('Total', { f: 'LuasM2', v: h.space.totalM2 }, 'n0', 'out', 'm²');

  // ===================== Kebutuhan manpower & MHE
  HS.r++;
  HS.h2('Kebutuhan manpower & MHE', 'Hanya jumlah (orang / unit). Biayanya ada di Rincian biaya per bulan (kategori Manpower & MHE).');
  HS.hdr(['Role', 'Jenis', ['FTE', false, 'Dari Man Power Summary'], ['Orang per shift', false, 'Hasil pooling (Man Power Summary)'], ['Headcount', false, 'Manpower di Rincian biaya manpower'], ['Utilisasi', false, 'FTE ÷ headcount'], 'Skema']);
  const AKN = `'Aktivitas & manpower'!`;
  const mpRows = x.mpRows as MpBarisXl[];
  for (const z of mpRows) {
    const r = HS.r, br = z.row, sr = z.sumRow;
    HS.put(1, { f: `${AKN}B${br}` }, { j: 'txt' }); HS.put(2, z.jenis === 'Tetap' ? 'Indirect' : z.jenis, { j: 'txt' });
    HS.put(3, z.jenis === 'Direct' ? { f: `${AKN}C${sr}` } : '—', { j: 'out', fmt: 'n2' });
    HS.put(4, { f: `IF(A${r}="","",TRIM(IF(${AKN}E${sr}>0,"S1: "&ROUND(${AKN}E${sr},1)&"  ","")&IF(${AKN}F${sr}>0,"S2: "&ROUND(${AKN}F${sr},1)&"  ","")&IF(${AKN}G${sr}>0,"S3: "&ROUND(${AKN}G${sr},1),"")))` }, { j: 'out', size: 9 });
    HS.put(5, { f: `${AKN}W${br}` }, { j: 'out', fmt: 'n0', b: true });
    HS.put(6, z.jenis === 'Direct' ? { f: `IF(E${r}>0,${AKN}C${sr}/E${r},0)` } : '—', { j: 'out', fmt: 'pct' });
    HS.put(7, { f: `IF(A${r}="","",IF(${AKN}X${br}="Sharing","sharing "&${AKN}Y${br},"dedicated"))` }, { j: 'txt', size: 9 });
    HS.r++;
  }
  HS.put(1, 'Total', { j: 'sub' }); HS.put(5, { f: 'TotalHeadcount' }, { j: 'sub', fmt: 'n0' }); HS.r++;
  HS.r++;
  HS.h3('MHE');
  HS.hdr(['MHE', 'Mode', 'Unit']);
  const GDN = `'Gudang, space & MHE'!`;
  void GDN;
  for (const l of lines.filter(z => z.kel === 'MHE')) {
    HS.put(1, { f: `${l.sistem.replace(/\$K\$(\d+)/, '$$D$$$1')}&" ("&${l.sistem.replace(/\$K\$(\d+)/, '$$A$$$1')}&")"` }, { j: 'txt' });
    HS.put(2, { f: l.sistem.replace(/\$K\$(\d+)/, '$$E$$$1') }, { j: 'txt' }); HS.put(3, { f: l.sistem.replace(/\$K\$(\d+)/, '$$J$$$1') }, { j: 'out', fmt: 'n0', b: true }); HS.r++;
  }

  // ===================== Rincian biaya per bulan
  HS.r++;
  HS.h2('Rincian biaya per bulan', 'Dikelompokkan per kategori. Biaya sistem = rumus dari sheet sumber; isi "Revisi manual" untuk mengganti (sama dengan revisi di web). Kolom G–N = metadata (kategori, tahap, jenis, alokasi per layanan) untuk rate card.');
  HS.hdr(['Baris', 'Risiko', 'Dasar hitung (saat export)', 'Biaya sistem', ['Revisi manual', true], 'Biaya/bln', 'Kelompok', 'Tahap', 'Jenis', 'Sto', 'HIn', 'HOut', 'VAS', 'Man']);
  const rr0 = HS.r;
  // pass 1: nomor baris
  let rr = rr0;
  for (const g0 of grup) { rr++; for (const l of g0.rows) l.row = rr++; }
  const rr1 = rr - 1;
  for (const g0 of grup) {
    const r = HS.r;
    HS.put(1, { f: `"${g0.k} · "&COUNTIFS($G$${rr0}:$G$${rr1},${q(g0.k)},$A$${rr0}:$A$${rr1},"?*")&" baris · "&FIXED((IF(TotalBiaya>0,F${r}/TotalBiaya,0))*100,1)&"%"` }, { j: 'sub' });
    for (const c of [2, 3, 4, 5]) HS.put(c, '', { j: 'sub' });
    HS.put(6, { f: `SUMIFS($F$${rr0}:$F$${rr1},$G$${rr0}:$G$${rr1},${q(g0.k)})` }, { j: 'sub', fmt: 'rp' });
    HS.r++;
    for (const l of g0.rows) {
      const r2 = HS.r;
      HS.put(1, l.desk, { j: 'txt' });
      HS.put(2, l.risk, { j: 'txt', size: 9 });
      HS.put(3, l.dasar, { j: 'txt', size: 8, wrap: false, color: C.MUTED });
      HS.put(4, { f: `ROUND(${l.sistem},0)`, v: l.v != null && l.revisi == null ? l.v : undefined }, { j: 'out', fmt: 'rp' });
      HS.put(5, l.revisi ?? null, { j: 'in', fmt: 'rp' });
      HS.put(6, { f: `IF(E${r2}<>"",E${r2},D${r2})`, v: l.v }, { j: 'out', fmt: 'rp', b: true });
      HS.put(7, l.kel, { j: 'txt', size: 8 }); HS.put(8, l.tahap, { j: 'txt', fmt: 'n0', size: 8 }); HS.put(9, l.jenis, { j: 'txt', size: 8 });
      const al = l.alokDari?.row ? BUCKETS.map((_, k) => ({ f: R(10 + k, l.alokDari!.row!) } as NilaiSel)) : l.alok;
      al.forEach((v, k) => HS.put(10 + k, v, { j: 'out', fmt: 'pct', size: 8 }));
      HS.r++;
    }
  }
  HS.put(1, 'Total', { j: 'tot' }); for (const c of [2, 3, 4, 5]) HS.put(c, '', { j: 'tot' });
  HS.put(6, { f: `SUMIFS($F$${rr0}:$F$${rr1},$H$${rr0}:$H$${rr1},">=1")`, v: h.totalBiayaBulan }, { j: 'tot', fmt: 'rp' }); HS.nm('TotalBiaya', 6);
  HS.r++;
  HS.nmR('Rinci_Desk', 1, rr0, rr1); HS.nmR('Rinci_Risk', 2, rr0, rr1); HS.nmR('Rinci_Biaya', 6, rr0, rr1); HS.nmR('Rinci_Kel', 7, rr0, rr1); HS.nmR('Rinci_Tahap', 8, rr0, rr1); HS.nmR('Rinci_Jenis', 9, rr0, rr1);
  BK.forEach((k, i) => HS.nmR(`Rinci_Al${k}`, 10 + i, rr0, rr1));
  HS.ws.columns.forEach((c: { outlineLevel?: number }, i: number) => { if (i >= 9 && i <= 13) c.outlineLevel = 1; });
  x.rcRef = rcRef;
  void t; void NF;
}

export function tulisQuotation(x: Ctx) {
  const { QU, d, a } = x;
  const { h, t } = d;
  const rcRef = x.rcRef as Record<string, Record<string, string>>;
  QU.lebar(34, 34, 18, 40);
  QU.h2('Quotation', 'Rate card untuk penawaran (dari sheet Hasil). Nomor, T&C, tanda tangan & PDF tetap dibuat di tab Quotation di web.');
  QU.field('Nomor quotation', d.nomorQuotation ?? '(belum ada)', 'teks', 'in');
  QU.field('Kepada', { f: 'Cust', v: t.customer }, 'teks', 'out');
  QU.field('Lokasi', { f: 'Kab&", "&Prov' }, 'teks', 'out');
  QU.field('Durasi kontrak', { f: 'Kontrak' }, 'n0', 'out', 'bulan');
  QU.field('Payment term', { f: 'PaymentTerm' }, 'n0', 'out', 'hari');
  QU.field('Harga', { f: 'IF(LEFT(PpnMode,7)="Include","sudah termasuk PPN","belum termasuk PPN (ditambah di invoice)")&" · "&IF(LEFT(PphMode,7)="Exclude","PPh 23 ditanggung customer","PPh 23 ditanggung kami")' }, 'teks', 'out');
  QU.r++;
  QU.hdr(['Layanan', 'Satuan', 'Tarif', 'Catatan']);
  const sat: Record<string, string> = { storage: '"per "&{u}&" per bulan"', handling_in: '"per "&{u}&" masuk"', handling_out: '"per "&{u}&" keluar"', vas: '"per "&{u}' };
  for (const rc of (x.rcList as HasilRc[])) {
    const z = rcRef[rc.bucket];
    QU.put(1, LAYANAN[rc.bucket], { j: 'txt', b: true }); QU.put(2, { f: sat[rc.bucket].replace('{u}', z.uom) }, { j: 'out' });
    QU.put(3, { f: z.quote, v: rc.tarifQuote }, { j: 'out', fmt: 'rp', b: true }); QU.put(4, { f: `"volume minimum "&FIXED(${z.vol},0)&" "&${z.uom}&" / bln"` }, { j: 'txt', size: 9 });
    QU.r++;
  }
  QU.r++;
  QU.h3('Tagihan sekali (ditagih terpisah)');
  QU.hdr(['Deskripsi', '', 'Nilai']);
  const tg = (a.it?.lines ?? []).filter(l => l.costType && ['OTC/Unit', 'OTC', 'Cost/Mandays'].includes(l.costType) && l.perlakuanSekali === 'tagih');
  for (const l of tg) { QU.put(1, `IT — ${l.item} (${l.qty} ${l.costType})`, { j: 'txt' }); QU.put(3, l.qty * l.hargaBudget * (l.mataUang === 'USD' ? a.it.kursUsd : 1), { j: 'out', fmt: 'rp' }); QU.r++; }
  QU.put(1, 'Total IT ditagih terpisah', { j: 'sub' }); QU.put(2, '', { j: 'sub' }); QU.put(3, { f: 'ItTagih' }, { j: 'sub', fmt: 'rp' }); QU.r++;
}

/** 0 Ringkasan — format PNL (tidak berubah dari versi sebelumnya), rumus merujuk sheet web. */
export function tulisRingkasan(x: Ctx) {
  const { S0, d } = x;
  const { h, m } = d;
  const n = x.n;
  const rcRef = x.rcRef as Record<string, Record<string, string>>;
  const AKN = `'Aktivitas & manpower'!`, HSN = `'Hasil'!`;
  S0.lebar(22, 46, 16, 16, 18, 18, 20, 50);
  const ws0 = S0.ws;
  const GR = { style: 'thin', color: { argb: 'FF8C8C8C' } };
  const KOTAK = { top: GR, bottom: GR, left: GR, right: GR };
  let nK = 8;
  type Opsi = { b?: boolean; bg?: string };
  const angka = (f?: Fmt) => !!f && f !== 'teks';
  const tulis = (r: number, c: number, v: NilaiSel, fmt?: Fmt, o: Opsi = {}, al?: 'left' | 'center' | 'right') => {
    const cell = ws0.getCell(r, c);
    if (v && typeof v === 'object') cell.value = { formula: v.f, result: v.v ?? undefined }; else cell.value = v ?? null;
    if (fmt && NF[fmt]) cell.numFmt = NF[fmt];
    cell.border = KOTAK;
    cell.font = { size: 10, bold: !!o.b, color: { argb: C.INK } };
    if (o.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.bg } };
    const a2 = al ?? (angka(fmt) ? 'right' : c === 1 ? 'center' : 'left');
    cell.alignment = { vertical: 'middle', horizontal: a2, wrapText: true, indent: a2 === 'center' ? 0 : 1 };
  };
  const judulTabel = (teks: string, lebarTabel: number, kanan = '[Currency : IDR]') => {
    nK = lebarTabel;
    const c = S0.cell(1); c.value = teks; c.font = { bold: true, size: 11, color: { argb: C.INK } };
    if (kanan) { const k = S0.cell(nK); k.value = kanan; k.font = { size: 9, color: { argb: C.MUTED } }; k.alignment = { horizontal: 'right' }; }
    S0.r++;
  };
  const header = (hs: string[]) => { for (let c = 1; c <= nK; c++) tulis(S0.r, c, hs[c - 1] ?? null, undefined, { b: true, bg: C.HDR_RUMUS }, 'center'); ws0.getRow(S0.r).height = 30; S0.r++; };
  const baris = (vals: NilaiSel[], fmts: (Fmt | undefined)[], o: Opsi = {}) => { for (let c = 1; c <= nK; c++) tulis(S0.r, c, vals[c - 1] ?? null, fmts[c - 1], o); return S0.r++; };
  const gabung = (r0: number, r1: number, teks: string) => { if (r1 > r0) ws0.mergeCells(r0, 1, r1, 1); const c = ws0.getCell(r0, 1); c.value = teks; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.font = { size: 10, bold: true }; };
  const bar = (kol: string, a0: number, a1: number) => { if (a1 >= a0) ws0.addConditionalFormatting({ ref: `${kol}${a0}:${kol}${a1}`, rules: [{ type: 'dataBar', priority: 1, minLength: 0, maxLength: 100, gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF555555' } }] }); };
  const RP2: (Fmt | undefined)[] = [undefined, undefined, undefined, undefined, undefined, 'rp', 'rp'];
  const s0 = h.simulasi[0];

  S0.r = 6;
  judulTabel('Hasil utama', 4);
  header(['Category', 'Item', 'Per bulan', 'Per tahun']);
  baris(['Selling', 'Selling (bersih PPh)', { f: 'Sim_Pend', v: s0?.pendapatanBulan }, { f: 'Sim_Pend*12', v: (s0?.pendapatanBulan ?? 0) * 12 }], [undefined, undefined, 'rp', 'rp']);
  baris(['Cost', 'Cost', { f: 'TotalBiaya', v: h.totalBiayaBulan }, { f: 'TotalBiaya*12', v: h.totalBiayaBulan * 12 }], [undefined, undefined, 'rp', 'rp']);
  const hp0 = baris(['', 'Profit', { f: 'Sim_Gp', v: s0?.gp }, { f: 'Sim_Gp*12', v: (s0?.gp ?? 0) * 12 }], [undefined, undefined, 'rp', 'rp'], { b: true, bg: C.HASIL });
  const hp1 = baris(['', 'Margin (GP %)', { f: 'Sim_GpPct', v: s0?.gpPersen }], [undefined, undefined, 'pct'], { b: true, bg: C.HASIL });
  gabung(hp0, hp1, 'Profit');
  const ho0 = baris(['', 'Jumlah manpower', { f: 'TotalHeadcount', v: h.totalHeadcount }], [undefined, undefined, 'n0']);
  const ho1 = baris(['', 'Luas gudang (m²)', { f: 'LuasM2', v: h.space.totalM2 }], [undefined, undefined, 'n0']);
  gabung(ho0, ho1, 'Operasional');
  S0.note('Semua angka merujuk sheet web (Key assumption … Hasil) — ubah input (sel putih tulang) di sana, ringkasan ikut berubah');
  S0.r += 2;

  // 1-1 PNL
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
  for (const rc of (x.rcList as HasilRc[])) {
    const z = rcRef[rc.bucket]; const r = S0.r;
    const vM = (rc.tarifPerUnit ?? 0) * (rc.volumeTarif ?? 0); jualKotor += vM;
    baris(['', LAYANAN[rc.bucket], { f: z.uom, v: rc.uom }, { f: z.vol, v: rc.volumeTarif }, { f: z.tarif, v: rc.tarifPerUnit }, { f: `D${r}*E${r}`, v: vM }, { f: `F${r}*Kontrak`, v: vM * n },
      { f: `"Komitmen / MOQ per bulan · GP "&FIXED((${z.gp})*100,1)&"%"` }], [undefined, undefined, undefined, 'n0', 'rp', 'rp', 'rp']);
  }
  const rSum = sub('Sum (gross)', (x.rcList as HasilRc[]).length ? `SUM(F${sel0}:F${S0.r - 1})` : '0', jualKotor);
  const rPph = S0.r;
  baris(['', 'Potongan PPh 23 (dipotong customer)', '%', { f: 'PPh', v: m.finance.pphGrossUp }, '', { f: `-F${rSum}*PPh` }, { f: `F${rPph}*Kontrak` }, 'Tarif sudah di-gross-up bila PPh exclude'], [undefined, undefined, undefined, 'pct', undefined, 'rp', 'rp']);
  const rNet = sub('Selling bersih', `F${rSum}+F${rPph}`, s0?.pendapatanBulan ?? 0, '= sheet Hasil · simulasi volume komitmen', C.KPI);
  gabung(sel0, rNet, 'Selling');
  const INDIRECT = ['Overhead', 'Interest cost'];
  const kat = Array.from(new Set(x.lines.map(l => l.kel)));
  const katDirect = kat.filter(k => !INDIRECT.includes(k)).sort((p1, p2) => (p1 === 'Manpower' ? -1 : p2 === 'Manpower' ? 1 : (h.perKelompok[p2] ?? 0) - (h.perKelompok[p1] ?? 0)));
  const cost0 = S0.r;
  let vDirect = 0;
  for (const k of katDirect) {
    const v = h.perKelompok[k] ?? 0; const r = S0.r; vDirect += v;
    const qv: NilaiSel = k === 'Manpower' ? { f: 'TotalHeadcount', v: h.totalHeadcount } : k === 'Fasilitas' ? { f: 'LuasM2', v: h.space.totalM2 } : '';
    baris(['', k, k === 'Manpower' ? 'orang' : k === 'Fasilitas' ? 'm²' : 'Set', qv, qv ? { f: `IF(D${r}>0,F${r}/D${r},0)` } : '', { f: `SUMIFS(Rinci_Biaya,Rinci_Kel,B${r})`, v }, { f: `F${r}*Kontrak`, v: v * n },
      k === 'Manpower' ? 'Rincian di 2-1' : k === 'Fasilitas' ? 'Price = rata-rata per m² (sewa + fasilitas)' : 'Rincian di 2-2'], [undefined, undefined, undefined, 'n0', 'rp', 'rp', 'rp']);
  }
  const rCost = sub('Sum', katDirect.length ? `SUM(F${cost0}:F${S0.r - 1})` : '0', vDirect);
  gabung(cost0, rCost, 'Cost');
  const ind0 = S0.r;
  let vInd = 0;
  for (const k of INDIRECT) {
    const v = h.perKelompok[k] ?? 0; vInd += v; const r = S0.r;
    baris(['', k, 'Set', '', '', { f: `SUMIFS(Rinci_Biaya,Rinci_Kel,B${r})`, v }, { f: `F${r}*Kontrak`, v: v * n }, k === 'Overhead' ? '% overhead × subtotal biaya (master Finance)' : 'Bunga pinjaman bank + working capital'], RP2);
  }
  const rInd = sub('Sum', `SUM(F${ind0}:F${S0.r - 1})`, vInd);
  gabung(ind0, rInd, 'Indirect Cost');
  const rTc = S0.r;
  baris(['Total Cost', '', '', '', '', { f: `F${rCost}+F${rInd}`, v: h.totalBiayaBulan }, { f: `F${rTc}*Kontrak`, v: h.totalBiayaBulan * n },
    { f: `IF(ABS(F${rTc}-TotalBiaya)<1,"✓ sama dengan total Rincian biaya (Hasil)","⚠ cek: beda dengan total Rincian biaya")` }], RP2, { b: true, bg: C.HASIL });
  const rGp = S0.r;
  baris(['Gross Profit', '', '', '', '', { f: `F${rNet}-F${rTc}`, v: s0?.gp }, { f: `G${rNet}-G${rTc}`, v: (s0?.gp ?? 0) * n }], RP2, { b: true, bg: C.KPI });
  baris(['(%)', '', '', '', '', { f: `IF(F${rNet}>0,F${rGp}/F${rNet},0)`, v: s0?.gpPersen }, { f: `IF(G${rNet}>0,G${rGp}/G${rNet},0)`, v: s0?.gpPersen }], [undefined, undefined, undefined, undefined, undefined, 'pct', 'pct'], { b: true, bg: C.KPI });
  S0.r += 2;

  // 2. Cost details
  const c2 = S0.cell(1); c2.value = '2. Cost Details'; c2.font = { bold: true, size: 12, color: { argb: C.INK } }; S0.r += 2;
  judulTabel('2-1. Manpower', 8);
  header(['Category', 'Position', 'Rate / org / bln', 'Pax / shift', 'Shift', 'Total manpower', 'Cost / bln', `${n} Month (kontrak)`]);
  const mp0 = S0.r;
  for (const z of x.mpRows as MpBarisXl[]) {
    const br = z.row, sr = z.sumRow; const r = S0.r;
    const ada = `${AKN}B${br}=""`;
    baris([{ f: `IF(${ada},"","${z.jenis === 'Direct' ? 'Direct' : 'Indirect'}")` }, { f: `${AKN}B${br}` }, { f: `IF(F${r}>0,G${r}/F${r},0)` },
      { f: `IF(${ada},"",IF(COUNTIF(${AKN}E${sr}:G${sr},">0")=0,"—",TRIM(IF(${AKN}E${sr}>0,"S1: "&ROUND(${AKN}E${sr},1)&" · ","")&IF(${AKN}F${sr}>0,"S2: "&ROUND(${AKN}F${sr},1)&" · ","")&IF(${AKN}G${sr}>0,"S3: "&ROUND(${AKN}G${sr},1),""))))` },
      { f: `IF(${ada},"",IF(COUNTIF(${AKN}E${sr}:G${sr},">0")=0,ShiftAktif,COUNTIF(${AKN}E${sr}:G${sr},">0")))` }, { f: `${AKN}W${br}` }, { f: `${AKN}AB${br}` }, { f: `G${r}*Kontrak` }],
      [undefined, undefined, 'rp', undefined, 'n0', 'n0', 'rp', 'rp']);
    ws0.getCell(r, 4).alignment = { vertical: 'middle', horizontal: 'center' };
  }
  const mp1 = S0.r - 1;
  baris(['Total', '', '', '', '', { f: `SUM(F${mp0}:F${mp1})` }, { f: `SUM(G${mp0}:G${mp1})` }, { f: `SUM(H${mp0}:H${mp1})` }], [undefined, undefined, undefined, undefined, undefined, 'n0', 'rp', 'rp'], { b: true, bg: C.HASIL });
  S0.r += 2;
  judulTabel('2-2. Other Cost Details', 8);
  header(['Category', 'Item', 'Price', 'Qty', 'Depreciation (bln)', 'Month', `${n} Month (kontrak)`, 'Remarks']);
  const oc0 = S0.r;
  for (const l of x.lines) {
    if (l.kel === 'Manpower' || !l.row) continue;
    const r = S0.r;
    baris([l.kel, { f: `${HSN}A${l.row}` }, l.harga ?? '', l.qty ?? '', l.umur ?? '', { f: `${HSN}F${l.row}`, v: l.v }, { f: `F${r}*Kontrak` }, { f: `${q(`${l.uom ? l.uom + ' · ' : ''}`)}&LOWER(${HSN}I${l.row})&" · "&${HSN}C${l.row}` }],
      [undefined, undefined, 'rp', 'n2', 'n0', 'rp', 'rp']);
  }
  const oc1 = S0.r - 1;
  baris(['Total', '', '', '', '', { f: oc1 >= oc0 ? `SUM(F${oc0}:F${oc1})` : '0' }, { f: oc1 >= oc0 ? `SUM(G${oc0}:G${oc1})` : '0' }], RP2, { b: true, bg: C.HASIL });
  S0.r += 2;

  // 3. Porsi biaya per kategori
  const KET_KAT: Record<string, string> = { Fasilitas: 'sewa gudang & fasilitas', Manpower: 'gaji, BPJS, THR, kompensasi, fee', Startup: 'startup & implementation (amortisasi)', MHE: 'sewa / depresiasi alat', Racking: 'depresiasi rak',
    Consumable: 'bahan habis pakai', Overhead: '% overhead', Utilitas: 'listrik & air', Asuransi: 'asuransi', IT: 'hardware, software, jaringan', 'Interest cost': 'bunga pinjaman & working capital', Office: 'perlengkapan kantor', HSE: 'K3 / safety', Lainnya: 'lain-lain' };
  const FK: (Fmt | undefined)[] = [undefined, undefined, 'rp', 'rp', 'rp', 'pct'];
  judulTabel('3. Porsi biaya per kategori', 6);
  header(['Kategori', 'Keterangan', 'Biaya / bln', 'Biaya / thn', `Biaya kontrak (${n} bln)`, '%']);
  const pk0 = S0.r;
  const katUrut = [...kat].sort((p1, p2) => (h.perKelompok[p2] ?? 0) - (h.perKelompok[p1] ?? 0));
  for (const k of katUrut) { const r = S0.r; const v = h.perKelompok[k] ?? 0;
    baris([k, KET_KAT[k] ?? '', { f: `SUMIFS(Rinci_Biaya,Rinci_Kel,A${r})`, v }, { f: `C${r}*12` }, { f: `C${r}*Kontrak` }, { f: `IF(TotalBiaya>0,C${r}/TotalBiaya,0)` }], FK); }
  const pk1 = S0.r - 1;
  baris(['Total', '', { f: `SUM(C${pk0}:C${pk1})` }, { f: `SUM(D${pk0}:D${pk1})` }, { f: `SUM(E${pk0}:E${pk1})` }, { f: `SUM(F${pk0}:F${pk1})` }], FK, { b: true, bg: C.KPI });
  bar('F', pk0, pk1);
  S0.r += 2;
  // 4. Opex vs capex
  judulTabel('4. Opex vs capex', 6);
  header(['Jenis', 'Keterangan', 'Biaya / bln', 'Biaya / thn', `Biaya kontrak (${n} bln)`, '%']);
  const oj0 = S0.r;
  for (const [l, k, ket] of [['Opex', 'Opex', 'biaya operasional: manpower, sewa gudang/MHE, utilitas, consumable, overhead, dll.'], ['Capex', 'Capex', null], ['Interest cost', 'Interest', 'bunga pinjaman yang dipilih di sheet Interest cost']] as const) {
    const r = S0.r;
    baris([l, ket ?? { f: '"depresiasi/amortisasi investasi (total investasi Rp"&FIXED(TotalInvestasi,0)&")"' }, { f: `SUMIFS(Rinci_Biaya,Rinci_Jenis,${q(k)})` }, { f: `C${r}*12` }, { f: `C${r}*Kontrak` }, { f: `IF(TotalBiaya>0,C${r}/TotalBiaya,0)` }], FK);
    ws0.getCell(r, 1).font = { size: 10, bold: true };
  }
  const oj1 = S0.r - 1;
  baris(['Total', '', { f: `SUM(C${oj0}:C${oj1})` }, { f: `SUM(D${oj0}:D${oj1})` }, { f: `SUM(E${oj0}:E${oj1})` }, { f: `SUM(F${oj0}:F${oj1})` }], FK, { b: true, bg: C.KPI });
  bar('F', oj0, oj1);
  S0.r += 2;
  // 5. Rate card
  judulTabel('5. Rate card', 6);
  header(['Layanan', 'UoM tarif', 'Tarif excl. PPN', 'Tarif incl. PPN', 'Biaya / unit', 'GP %']);
  for (const rc of (x.rcList as HasilRc[])) { const z = rcRef[rc.bucket];
    baris([LAYANAN[rc.bucket], { f: z.uom, v: rc.uom }, { f: z.tarif, v: rc.tarifPerUnit }, { f: z.incl, v: rc.tarifInclPpn }, { f: z.bpu, v: rc.biayaPerUnit }, { f: z.gp, v: rc.gpPersen }], [undefined, undefined, 'rp', 'rp', 'rp', 'pct']); }
  S0.r += 2;
  // 6. Alur & legenda
  judulTabel('6. Alur perhitungan (sama dengan tab web)', 8, '');
  header(['Sheet', 'Isi']); ws0.mergeCells(S0.r - 1, 2, S0.r - 1, nK);
  const alur = ['Key assumption — data tender, UMK, shift, faktor, porsi palletize/loose, working day & workload shift', 'Volume — volume, konversi, ringkasan order, parameter muatan, profil order & kendaraan',
    'Aktivitas & manpower — summary, skema kontrak, rincian biaya manpower, rincian per task, matriks, indirect, VSM', 'Gudang, space & MHE — gudang, space A–E, racking level, biaya space & racking, MHE',
    'Interest cost — pinjaman capex & manual', 'IT — kebutuhan IT format BAP', 'Biaya lain — per klasifikasi, startup otomatis, listrik',
    'Hasil — KPI, rate card & margin, simulasi, kurs, porsi kategori, opex/capex, rincian biaya', 'Quotation — rate card penawaran', 'Daftar — sumber semua droplist & data master'];
  for (const a2 of alur) { const [sh, isi] = a2.split(' — '); const r = baris([sh, isi], []); ws0.mergeCells(r, 2, r, nK); ws0.getCell(r, 1).value = { text: sh, hyperlink: `#'${sh === 'Daftar' ? 'Daftar' : sh}'!A1` }; }
  S0.r += 2;
  judulTabel('Legenda warna', 2, '');
  ([['Header rumus / hasil', C.HDR_RUMUS], ['Header input', C.HDR_INPUT], ['Sel input (boleh diubah)', C.INPUT], ['Sel hasil rumus', C.HASIL]] as const).forEach(([l, w]) => { tulis(S0.r, 1, null, undefined, { bg: w }); tulis(S0.r, 2, l, undefined, {}, 'left'); S0.r++; });
  ws0.pageSetup.printArea = `A1:H${S0.r}`;
}
