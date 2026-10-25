// Sheet "Aktivitas & manpower": Man Power & MHE Summary, skema biaya kontrak, rincian biaya manpower,
// rincian per task, matriks multi-skill, indirect & peran tetap, Aktivitas (VSM) — urutan sama dengan web.
import { R, A, q, BUCKETS, ALOKASI, type Ctx } from '@/lib/exportWebUtil';
import { rincianBiayaRole, LEVEL_JABATAN, LEVEL_GAJI_DEFAULT, PARAM_BIAYA_MP_DEFAULT } from '@/lib/engine/biayaMp';
import { labelTag } from '@/lib/porsiMuat';
import { isTkbm, bolehRangkap } from '@/lib/engine/processDesign';
import { isAktivitasAdmin } from '@/lib/profilVolume';

export function tulisAktivitas(x: Ctx) {
  const { AK, d, a, pd, lk, normU, isPal } = x;
  const { h, m, inp, t } = d;
  const SN = `'${AK.nama}'!`;
  AK.lebar(30, 34, 12, 12, 12, 12, 12, 12, 14, 14, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 13, 11, 13, 10, 15, 16, 16, 11);
  const nAkt = a.aktivitas.length;
  const aktRows = [...a.aktivitas, ...Array.from({ length: 5 }, () => null)];
  // Jumlah alat pendukung per baris → baris rincian per task: [equipment] + [alat 1..k] + [role]
  const nAlat = aktRows.map(z => Math.max(1, (z?.alatTambahan ?? []).filter(Boolean).length));
  const ptRows = [...a.peranTetap, null, null, null];
  const spvManual = a.peranTetap.some(p => p.roleName === a.roleSupervisor);

  // ===================== Man Power Summary
  AK.h2('Man Power Summary', 'FTE = Σ FTE per role dari Rincian per task (rumus). Kolom Shift 1–3 = hasil multi-skill pooling dari web (input, bisa diubah); Resources = jumlah shift. Supervisor & peran tetap dihitung rumus.');
  AK.hdr(['Description', 'Remarks', 'FTE', 'Man hour / bln', ['Shift 1', true], ['Shift 2', true], ['Shift 3', true], 'Resources', 'Biaya/orang/bln (incl. fee)', 'Total/bln', 'ROUNDUP(FTE) tanpa pooling']);
  const d0 = AK.r;
  const mpRow = new Map<string, number>();
  for (const r0 of pd.mp) {
    const r = AK.r; mpRow.set(r0.nama, r);
    const status = r0.tkbm ? (/helper|daily|harian/i.test(r0.nama) ? 'Daily worker' : 'TKBM') : r0.fte <= 1e-9 ? 'Tidak ada workload' : r0.resources === 0 ? `Dirangkap ${r0.dirangkapOleh.join(', ')}`
      : r0.merangkap.length ? `Direct · multi-skill (merangkap ${r0.merangkap.join(', ')})` : r0.dirangkap ? `Direct · sisa dirangkap ${r0.dirangkapOleh.join(', ')}` : 'Direct';
    AK.put(1, r0.nama, { j: 'txt', b: true });
    AK.put(2, `${status}${r0.catatan.length ? ' — ' + r0.catatan.join(' · ') : ''}`, { j: 'txt', size: 8, wrap: true });
    AK.put(3, { f: `SUMIFS(PD_FTE,PD_Res,A${r},PD_Jenis,"Man Power")`, v: r0.fte }, { j: 'out', fmt: 'n2' });
    AK.put(4, { f: `SUMIFS(PD_MH,PD_Res,A${r},PD_Jenis,"Man Power")`, v: r0.manHour }, { j: 'out', fmt: 'n1' });
    for (let s = 0; s < 3; s++) AK.put(5 + s, r0.perShift?.[s] ?? 0, { j: 'in', fmt: 'n0' });
    AK.put(8, { f: `SUM(E${r}:G${r})`, v: r0.resources }, { j: 'out', fmt: 'n0', b: true });
    AK.put(11, { f: `IF(C${r}>0,ROUNDUP(C${r}-1E-9,0),0)` }, { j: 'out', fmt: 'n0' });
    AK.ws.getRow(r).height = Math.min(80, 13 * Math.max(1, Math.ceil(String(AK.cell(2, r).value ?? '').length / 45)));
    AK.r++;
  }
  const d1 = AK.r - 1;
  const rSubD = AK.r;
  AK.put(1, 'Subtotal direct', { j: 'sub' }); AK.put(2, '', { j: 'sub' });
  AK.put(3, { f: `SUM(C${d0}:C${d1})`, v: pd.totalFteMp }, { j: 'sub', fmt: 'n2' }); AK.put(4, { f: `SUM(D${d0}:D${d1})` }, { j: 'sub', fmt: 'n1' });
  for (let c = 5; c <= 8; c++) AK.put(c, { f: `SUM(${R(c, d0)}:${R(c, d1)})` }, { j: 'sub', fmt: 'n0' });
  AK.put(10, { f: `SUM(J${d0}:J${d1})` }, { j: 'sub', fmt: 'rp' });
  AK.nmR('MpDirect_Res', 8, d0, d1);
  AK.r++;
  // supervisor otomatis (span of control) + peran tetap
  const i0 = AK.r;
  let rSpv = 0;
  if (!spvManual) {
    rSpv = AK.r;
    AK.put(1, { f: 'RoleSpv', v: a.roleSupervisor }, { j: 'txt', b: true });
    AK.put(2, { f: `"Indirect · Span 1:"&Span&IF(AlatSpv<>""," · alat: "&AlatSpv,"")` }, { j: 'txt', size: 8 });
    AK.put(3, '–', { j: 'out', al: 'right' }); AK.put(4, '', { j: 'out' });
    for (let s = 0; s < 3; s++) AK.put(5 + s, { f: `IF(INDEX(BebanGab,${s + 1})>0,H${rSpv}/ShiftAktif,0)` }, { j: 'out', fmt: 'n1' });
    AK.put(8, { f: `IF(OR(COUNTIF(PT_Role,RoleSpv)>0,N(Span)<=0),0,IF(DirectPerShift>0,ROUNDUP(DirectPerShift/Span,0)*ShiftAktif,0))`, v: pd.indirect.spv }, { j: 'out', fmt: 'n0', b: true });
    AK.nm('SpvQty', 8);
    AK.r++;
  }
  const ptSum: number[] = [];
  ptRows.forEach((_, j) => {
    const r = AK.r; ptSum.push(r);
    AK.put(1, { f: `IF(PT_${j + 1}_Role="","",PT_${j + 1}_Role)` }, { j: 'txt', b: true });
    AK.put(2, { f: `IF(PT_${j + 1}_Role="","",IF(PT_${j + 1}_Basis="Per shift","Peran tetap · "&PT_${j + 1}_Hc&"/shift × "&ShiftAktif&" shift","Peran tetap · total (non-shift)")&IF(PT_${j + 1}_Alat<>""," · alat: "&PT_${j + 1}_Alat,""))` }, { j: 'txt', size: 8 });
    AK.put(3, '–', { j: 'out', al: 'right' }); AK.put(4, '', { j: 'out' });
    for (let s = 0; s < 3; s++) AK.put(5 + s, { f: `IF(PT_${j + 1}_Basis="Per shift",IF(INDEX(BebanGab,${s + 1})>0,PT_${j + 1}_Hc,0),"–")` }, { j: 'out', fmt: 'n0', al: 'right' });
    AK.put(8, { f: `PT_${j + 1}_Total` }, { j: 'out', fmt: 'n0', b: true });
    AK.r++;
  });
  const i1 = AK.r - 1;
  AK.put(1, 'Subtotal indirect & peran tetap', { j: 'sub' }); AK.put(2, '', { j: 'sub' }); AK.put(3, '–', { j: 'sub', al: 'right' }); AK.put(4, '', { j: 'sub' });
  for (let c = 5; c <= 8; c++) AK.put(c, { f: `SUM(${R(c, i0)}:${R(c, i1)})` }, { j: 'sub', fmt: 'n0' });
  AK.put(10, { f: `SUM(J${i0}:J${i1})` }, { j: 'sub', fmt: 'rp' });
  const rSubI = AK.r; AK.r++;
  AK.put(1, 'Total', { j: 'tot' }); AK.put(2, 'Head Count', { j: 'tot' }); AK.put(3, { f: `C${rSubD}` }, { j: 'tot', fmt: 'n2' }); AK.put(4, '', { j: 'tot' });
  for (let c = 5; c <= 8; c++) AK.put(c, { f: `${R(c, rSubD)}+${R(c, rSubI)}` }, { j: 'tot', fmt: 'n0' });
  AK.put(9, '', { j: 'tot' }); AK.put(10, { f: `J${rSubD}+J${rSubI}` }, { j: 'tot', fmt: 'rp' });
  AK.r++;
  // DirectPerShift = Σ ROUNDUP(resources ÷ shift aktif)
  AK.field('Direct per shift (dasar supervisor)', { f: `SUMPRODUCT((MpDirect_Res>0)*ROUNDUP(MpDirect_Res/ShiftAktif-1E-9,0))`, v: pd.indirect.directPerShift }, 'n0', 'out', 'orang', 'Σ ROUNDUP(resources ÷ shift aktif)', 'DirectPerShift');
  AK.note('FTE (Full Time Equivalent) = man hour dibutuhkan ÷ jam kerja tersedia per orang per bulan (Man hours per bulan di Key assumption). Ubah Shift 1–3 bila FTE berubah dan pooling perlu disesuaikan.');

  // ===================== MHE Summary
  AK.r++;
  AK.h2('MHE Summary', 'Unit = ROUNDUP(FTE alat) + unit pendukung indirect (alat pendukung supervisor & peran tetap, 1 unit per orang).');
  AK.hdr(['Description', 'Remarks', 'FTE', 'Man hour / bln', 'Unit indirect', 'Resources']);
  const e0 = AK.r;
  for (const e of pd.mhe) {
    const r = AK.r;
    AK.put(1, e.nama, { j: 'txt', b: true }); AK.put(2, 'Equipment', { j: 'txt', size: 9 });
    AK.put(3, { f: `SUMIFS(PD_FTE,PD_Res,A${r},PD_Jenis,"Equipment")`, v: e.fte }, { j: 'out', fmt: 'n2' });
    AK.put(4, { f: `SUMIFS(PD_MH,PD_Res,A${r},PD_Jenis,"Equipment")` }, { j: 'out', fmt: 'n1' });
    const has = (rg: string) => `ISNUMBER(SEARCH(","&A${r}&",",","&SUBSTITUTE(${rg},", ",",")&","))`;
    AK.put(5, { f: `${spvManual ? '0' : `IF(${has('AlatSpv')},SpvQty,0)`}+SUMPRODUCT(${has('PT_Alat')}*PT_Total)`, v: e.unitIndirect }, { j: 'out', fmt: 'n0' });
    AK.put(6, { f: `IF(C${r}>0,ROUNDUP(C${r}-1E-9,0),0)+E${r}`, v: e.resources }, { j: 'out', fmt: 'n0', b: true });
    AK.r++;
  }
  AK.nmR('MheSum_Nama', 1, e0, Math.max(e0, AK.r - 1)); AK.nmR('MheSum_Res', 6, e0, Math.max(e0, AK.r - 1)); AK.nmR('MheSum_Fte', 3, e0, Math.max(e0, AK.r - 1));
  AK.put(1, 'Total', { j: 'tot' }); AK.put(2, 'Equipment', { j: 'tot' }); AK.put(3, { f: `SUM(C${e0}:C${Math.max(e0, AK.r - 1)})` }, { j: 'tot', fmt: 'n2' });
  AK.put(4, '', { j: 'tot' }); AK.put(5, '', { j: 'tot' }); AK.put(6, { f: `SUM(F${e0}:F${Math.max(e0, AK.r - 1)})` }, { j: 'tot', fmt: 'n0' });
  AK.r++;

  // ===================== Skema biaya manpower selama kontrak (eskalasi)
  const es = h.eskalasiManpower;
  AK.r++;
  AK.h2('Skema biaya manpower selama kontrak', 'Upah naik setiap Januari (UMK baru) dan bertingkat: indeks = (1 + kenaikan)^(jumlah Januari yang dilewati). Biaya/bln dipakai = total kontrak ÷ bulan kontrak.');
  const mulai = a.eskalasiManpower?.mulai;
  const ml = mulai && /^(\d{4})-(\d{2})/.exec(mulai);
  AK.field('Mulai kontrak (manual)', ml ? { f: `DATE(${ml[1]},${Number(ml[2])},1)` } : null, 'tgl', 'in', '', 'kosong = bulan go-live; go-live kosong = Januari tahun ini', 'EskManual');
  AK.field('Mulai kontrak dipakai', { f: 'IF(EskManual<>"",DATE(YEAR(EskManual),MONTH(EskManual),1),IF(GoLive<>"",DATE(YEAR(GoLive),MONTH(GoLive),1),DATE(YEAR(TODAY()),1,1)))' }, 'tgl', 'out', '', '', 'EskTgl');
  AK.field('Kenaikan upah tiap Januari', es.persenTahun, 'pct', 'in', '/thn', 'kebijakan UMK, umumnya 5–7%', 'Eskalasi');
  AK.hdr(['Periode (tahun)', 'Tahun ke-', 'Bulan', 'Indeks', 'Bulan × indeks', 'Biaya/bln', 'Total periode']);
  const y0 = AK.r; const nY = Math.ceil(x.n / 12) + 1;
  for (let k = 0; k < nY; k++) {
    const r = AK.r;
    AK.put(1, { f: `YEAR(EskTgl)+${k}` }, { j: 'out', fmt: 'teks', al: 'left' }); AK.put(2, k, { j: 'out', fmt: 'n0' });
    AK.put(3, { f: `MAX(0,MIN(${12 * k + 12},MONTH(EskTgl)-1+Kontrak)-MAX(${12 * k},MONTH(EskTgl)-1))` }, { j: 'out', fmt: 'n0' });
    AK.put(4, { f: `(1+Eskalasi)^B${r}` }, { j: 'out', fmt: 'x' }); AK.put(5, { f: `C${r}*D${r}` }, { j: 'out', fmt: 'x' });
    AK.put(6, { f: `MpDasarTot*D${r}` }, { j: 'out', fmt: 'rp' }); AK.put(7, { f: `F${r}*C${r}` }, { j: 'out', fmt: 'rp' });
    AK.r++;
  }
  const y1 = AK.r - 1;
  AK.put(1, 'Total kontrak', { j: 'sub' }); AK.put(2, '', { j: 'sub' }); AK.put(3, { f: `SUM(C${y0}:C${y1})` }, { j: 'sub', fmt: 'n0' }); AK.put(4, '', { j: 'sub' }); AK.put(5, { f: `SUM(E${y0}:E${y1})` }, { j: 'sub', fmt: 'x' });
  AK.put(6, '', { j: 'sub' }); AK.put(7, { f: `SUM(G${y0}:G${y1})` }, { j: 'sub', fmt: 'rp' });
  AK.r++;
  AK.field('Faktor eskalasi (rata-rata kontrak)', { f: `IF(Kontrak>0,SUM(E${y0}:E${y1})/Kontrak,1)`, v: es.faktor }, 'x', 'out', '×', '', 'FaktorEsk');
  AK.field('Biaya manpower/bln dipakai di cost model', { f: 'MpDasarTot*FaktorEsk', v: es.rataBulan }, 'rp', 'out', 'Rp/bln', 'total kontrak ÷ bulan kontrak');

  // ===================== Rincian biaya manpower
  const pm = { ...PARAM_BIAYA_MP_DEFAULT, ...h.paramBiayaMp };
  const lg = { ...LEVEL_GAJI_DEFAULT, ...(a.levelGaji ?? {}) };
  AK.r++;
  AK.h2('Rincian biaya manpower', 'Jumlah orang dari Man Power Summary. Kolom "manual" kosong = default (gaji pokok = UMK area × % level; lisensi = tunjangan jabatan; hari kerja = Working Days Employee). Sharing = biaya dibagi beberapa project.');
  AK.field('UMK area project', { f: 'UMK', v: m.upahMinimum }, 'rp', 'out', 'Rp/bln', 'ganti area di Key assumption');
  AK.field('Area', { f: 'Kab', v: t.kab_kota }, 'teks', 'out');
  AK.h3('% gaji pokok per level jabatan');
  AK.hdr(['Level', 'Contoh jabatan', ['% dari UMK', true], 'Gaji pokok/bln', 'Jabatan di tender ini']);
  const lv0 = AK.r;
  for (const L of LEVEL_JABATAN) {
    const r = AK.r;
    AK.put(1, L.l.split(' (')[0], { j: 'txt', b: true }); AK.put(2, L.contoh, { j: 'txt', size: 8 }); AK.put(3, lg[L.v], { j: 'in', fmt: 'pct' });
    AK.put(4, { f: `UMK*C${r}` }, { j: 'out', fmt: 'rp' });
    AK.put(5, { f: `IFERROR(""&COUNTIF(BMP_Level,A${r})&" jabatan","")` }, { j: 'txt', size: 9 });
    AK.r++;
  }
  AK.nmR('LvLabel', 1, lv0, AK.r - 1); AK.nmR('LvPct', 3, lv0, AK.r - 1);
  AK.r++;
  AK.h3('Parameter (aturan pemerintah, bisa diubah)');
  AK.field('BPJS TK (JHT 3,7% + JKK 1,27% + JKM 0,3%)', pm.bpjsTk, 'pct', 'in', '', 'PP 44/2015, PP 46/2015', 'BpjsTk');
  AK.field('BPJS Kesehatan', pm.bpjsKs, 'pct', 'in', '', 'Perpres 64/2020', 'BpjsKs');
  AK.field('Batas upah BPJS Kesehatan', pm.batasUpahKs ?? 12000000, 'rp', 'in', 'Rp', '', 'BatasKs');
  AK.field('BPJS Pensiun (JP)', pm.bpjsPensiun, 'pct', 'in', '', 'PP 45/2015', 'BpjsJp');
  AK.field('Batas upah JP', pm.batasUpahPensiun ?? 10547400, 'rp', 'in', 'Rp', '', 'BatasJp');
  AK.field('THR', pm.thr, 'pct', 'in', '', 'Permenaker 6/2016 (1/12)', 'Thr');
  AK.field('Kompensasi PKWT', pm.kompensasi, 'pct', 'in', '', 'PP 35/2021 (1/12)', 'Kompensasi');
  AK.field('Management fee', pm.feePersen, 'pct', 'in', '', 'bukan aturan pemerintah — kebijakan perusahaan', 'Fee');
  AK.r++;
  AK.hdr(['No', 'Jabatan', 'Area', 'UMK', ['Level', true], '% level', ['Gaji pokok (manual)', true], 'Gaji pokok', ['Hari kerja (manual)', true], 'Hari kerja', ['Actual (manual)', true], 'Actual hari kerja',
    ['Lisensi + insentif (manual)', true], 'Lisensi + insentif', 'Sub total', 'BPJS TK', 'BPJS KS', 'BPJS Pensiun', 'THR', 'Kompensasi', ['Supervisi & operasional', true], 'Total', 'Manpower',
    ['Dedicated / Sharing', true], ['Porsi sharing', true], 'TOTAL', 'Biaya/bln dasar (+fee)', 'Biaya/bln (× eskalasi)', 'Jenis']);
  const b0 = AK.r;
  const bmpRow: number[] = [];
  h.manpower.forEach((p, i) => {
    const r = AK.r; bmpRow.push(r);
    const ri = a.rincianBiayaMp?.[p.roleName];
    const rc = rincianBiayaRole(p.roleName, p.headcount, m, ri, pm, inp.processDesign?.hariKerjaKaryawan ?? 25, t.kab_kota, { levelGaji: a.levelGaji, levelRole: a.levelRole });
    AK.put(1, i + 1, { j: 'txt', fmt: 'n0' }); AK.put(2, p.roleName, { j: 'txt', b: true }); AK.put(3, { f: 'Kab' }, { j: 'out' }); AK.put(4, { f: 'UMK' }, { j: 'out', fmt: 'rp' });
    AK.put(5, LEVEL_JABATAN.find(L => L.v === rc.level)!.l.split(' (')[0], { j: 'in' }); AK.dd(5, 'L_Level');
    AK.put(6, { f: `IFERROR(INDEX(LvPct,MATCH(E${r},LvLabel,0)),1)`, v: rc.faktorLevel }, { j: 'out', fmt: 'pct' });
    AK.put(7, ri?.gajiPokok && ri.gajiPokok > 0 ? ri.gajiPokok : null, { j: 'in', fmt: 'rp' });
    AK.put(8, { f: `IF(N(G${r})>0,G${r},ROUND(D${r}*F${r},0))`, v: rc.gajiPokok }, { j: 'out', fmt: 'rp' });
    AK.put(9, ri?.hariKerja && ri.hariKerja > 0 ? ri.hariKerja : null, { j: 'in', fmt: 'n0' });
    AK.put(10, { f: `IF(N(I${r})>0,I${r},HariKaryawan)` }, { j: 'out', fmt: 'n0' });
    AK.put(11, ri?.hariAktual != null && ri.hariAktual >= 0 ? ri.hariAktual : null, { j: 'in', fmt: 'n0' });
    AK.put(12, { f: `IF(K${r}<>"",K${r},J${r})` }, { j: 'out', fmt: 'n0' });
    AK.put(13, ri?.lisensi != null ? ri.lisensi : null, { j: 'in', fmt: 'rp' });
    AK.put(14, { f: `IF(M${r}<>"",M${r},${lk('D_Jab', `B${r}`, 'Role', 'Tunjangan', 0)})` }, { j: 'out', fmt: 'rp' });
    AK.put(15, { f: `H${r}*MIN(1,IF(J${r}>0,L${r}/J${r},1))+N${r}`, v: rc.subTotal }, { j: 'out', fmt: 'rp' });
    AK.put(16, { f: `H${r}*BpjsTk` }, { j: 'out', fmt: 'rp' });
    AK.put(17, { f: `MIN(H${r},IF(BatasKs>0,BatasKs,H${r}))*BpjsKs` }, { j: 'out', fmt: 'rp' });
    AK.put(18, { f: `MIN(H${r},IF(BatasJp>0,BatasJp,H${r}))*BpjsJp` }, { j: 'out', fmt: 'rp' });
    AK.put(19, { f: `H${r}*Thr` }, { j: 'out', fmt: 'rp' }); AK.put(20, { f: `H${r}*Kompensasi` }, { j: 'out', fmt: 'rp' });
    AK.put(21, ri?.supervisi ?? null, { j: 'in', fmt: 'rp' });
    AK.put(22, { f: `SUM(O${r}:U${r})`, v: rc.total }, { j: 'out', fmt: 'rp', b: true });
    // Manpower: direct → Man Power Summary · supervisor → span of control · peran tetap → tabel peran tetap
    const tetapIdx = p.jenis === 'Tetap' ? h.manpower.slice(0, i + 1).filter(z => z.jenis === 'Tetap').length - 1 : -1;
    const mpF = p.jenis === 'Direct' && mpRow.has(p.roleName) ? `H${mpRow.get(p.roleName)}` : p.jenis === 'Indirect' && rSpv ? `H${rSpv}` : tetapIdx >= 0 ? `PT_${tetapIdx + 1}_Total` : String(p.headcount);
    AK.put(23, { f: mpF, v: p.headcount }, { j: 'out', fmt: 'n0' });
    AK.put(24, rc.skema === 'sharing' ? 'Sharing' : 'Dedicated', { j: 'in' }); AK.dd(24, 'L_Skema2');
    AK.put(25, rc.skema === 'sharing' ? rc.porsi : null, { j: 'in', fmt: 'n2' });
    const porsi = `IF(X${r}="Sharing",MIN(1,MAX(0,IF(Y${r}="",0.5,Y${r}))),1)`;
    AK.put(26, { f: `V${r}*W${r}*${porsi}`, v: rc.total * p.headcount * rc.porsi }, { j: 'out', fmt: 'rp', b: true });
    AK.put(27, { f: `V${r}*(1+Fee)*W${r}*${porsi}`, v: p.biayaBulanDasar }, { j: 'out', fmt: 'rp' });
    AK.put(28, { f: `ROUND(AA${r}*FaktorEsk,0)`, v: p.biayaBulan }, { j: 'out', fmt: 'rp', b: true });
    AK.put(29, p.jenis, { j: 'txt', size: 9 });
    AK.r++;
  });
  const b1 = Math.max(b0, AK.r - 1);
  AK.nmR('BMP_Level', 5, b0, b1); AK.nmR('BMP_Role', 2, b0, b1); AK.nmR('BMP_Per', 22, b0, b1); AK.nmR('BMP_Porsi', 25, b0, b1); AK.nmR('BMP_Skema', 24, b0, b1); AK.nmR('BMP_Jenis', 29, b0, b1);
  AK.put(2, 'Sub Total Biaya-1', { j: 'sub' }); AK.put(23, { f: `SUM(W${b0}:W${b1})`, v: h.totalHeadcount }, { j: 'sub', fmt: 'n0' }); AK.put(26, { f: `SUM(Z${b0}:Z${b1})` }, { j: 'sub', fmt: 'rp' });
  AK.put(27, { f: `SUM(AA${b0}:AA${b1})`, v: h.manpower.reduce((s, p) => s + p.biayaBulanDasar, 0) }, { j: 'sub', fmt: 'rp' }); AK.put(28, { f: `SUM(AB${b0}:AB${b1})` }, { j: 'sub', fmt: 'rp' });
  AK.nm('TotalHeadcount', 23); AK.nm('MpDasarTot', 27); const rSt1 = AK.r;
  AK.r++;
  AK.put(2, { f: `"Management Fee "&TEXT(Fee,"0.00%")` }, { j: 'txt' }); AK.put(26, { f: `Z${rSt1}*Fee` }, { j: 'out', fmt: 'rp' }); AK.r++;
  AK.put(2, 'Sub Total Biaya-2 (masuk cost model, sebelum kenaikan tahunan)', { j: 'tot' }); AK.put(26, { f: `Z${rSt1}+Z${rSt1 + 1}` }, { j: 'tot', fmt: 'rp' }); AK.r++;
  // biaya per orang (incl. fee, × porsi) di Man Power Summary
  for (const [role, r] of mpRow) {
    const i = h.manpower.findIndex(p => p.roleName === role && p.jenis === 'Direct');
    AK.put(9, i >= 0 ? { f: `V${bmpRow[i]}*IF(X${bmpRow[i]}="Sharing",MIN(1,MAX(0,IF(Y${bmpRow[i]}="",0.5,Y${bmpRow[i]}))),1)*(1+Fee)` } : 0, { j: 'out', fmt: 'rp' }, r);
    AK.put(10, { f: `I${r}*H${r}` }, { j: 'out', fmt: 'rp' }, r);
  }
  if (rSpv) { const i = h.manpower.findIndex(p => p.jenis === 'Indirect');
    AK.put(9, i >= 0 ? { f: `V${bmpRow[i]}*IF(X${bmpRow[i]}="Sharing",MIN(1,MAX(0,IF(Y${bmpRow[i]}="",0.5,Y${bmpRow[i]}))),1)*(1+Fee)` } : 0, { j: 'out', fmt: 'rp' }, rSpv);
    AK.put(10, { f: `I${rSpv}*H${rSpv}` }, { j: 'out', fmt: 'rp' }, rSpv); }
  ptSum.forEach((r, j) => {
    AK.put(9, { f: `IFERROR(INDEX(BMP_Per,MATCH(A${r},BMP_Role,0))*(1+Fee),0)` }, { j: 'out', fmt: 'rp' }, r);
    AK.put(10, { f: `N(I${r})*N(H${r})` }, { j: 'out', fmt: 'rp' }, r); void j;
  });
  // Baris biaya manpower → Rincian biaya (Hasil)
  h.manpower.forEach((p, i) => {
    const r = bmpRow[i];
    x.lines.push({ kel: 'Manpower', tahap: 1, desk: { f: `"Manpower — "&${SN}B${r}&" ("&${SN}W${r}&" org)"`, v: `Manpower — ${p.roleName} (${p.headcount} org)` }, deskKey: `Manpower — ${p.roleName} (${p.headcount} org)`,
      jenis: 'Opex', risk: 'Sedang', sistem: `${SN}$AB$${r}`, alok: BUCKETS.map(b => p.alokasi[b] ?? 0), dasar: h.biaya.find(z => z.deskripsi === `Manpower — ${p.roleName} (${p.headcount} org)`)?.dasar ?? '',
      v: p.biayaBulan, qty: { f: `${SN}W${r}` }, harga: { f: `${SN}V${r}*(1+Fee)` }, uom: 'orang' });
  });
  x.bmpRow = bmpRow; x.mpRow = mpRow;

  // ===================== Rincian per task
  AK.r++;
  AK.h2('Rincian per task', 'Workload = volume/bln × %. RfR (MH) = workload ÷ (produktivitas × faktor). Man hour = RfR ÷ efisiensi. FTE = man hour ÷ man hours per bulan (Man Power) atau ÷ (man hours MHE × operating) untuk equipment.');
  AK.hdr(['No', 'Task', 'Workload driver', 'Equipment / role', 'Resources', 'Arus', 'Volume/bln', 'UoM', '%', 'Workload', 'Productivity', 'RfR (MH)', 'Efficiency', 'Man hour', 'Man hours tersedia', 'Operating', 'FTE', 'Prod. per man']);
  const pr0 = AK.r;
  // baris Aktivitas (VSM) ditulis di bawah; nomor barisnya dihitung lebih dulu
  const prRows = aktRows.reduce((s, _, i) => s + 2 + nAlat[i], 0);
  const vsmStart = pr0 + prRows + 1 /* total */ + 2 + (pd.mp.length >= 2 ? 4 + pd.mp.length : 0) + 0;
  void vsmStart;
  const pending: { r: number; i: number; jenis: 'E' | 'A' | 'M'; k: number }[] = [];
  aktRows.forEach((_, i) => {
    pending.push({ r: AK.r++, i, jenis: 'E', k: 0 });
    for (let k = 1; k <= nAlat[i]; k++) pending.push({ r: AK.r++, i, jenis: 'A', k });
    pending.push({ r: AK.r++, i, jenis: 'M', k: 0 });
  });
  const pr1 = AK.r - 1;
  AK.nmR('PD_Res', 4, pr0, pr1); AK.nmR('PD_Jenis', 5, pr0, pr1); AK.nmR('PD_Arus', 6, pr0, pr1); AK.nmR('PD_MH', 14, pr0, pr1); AK.nmR('PD_FTE', 17, pr0, pr1);
  AK.put(1, 'Total', { j: 'tot' }); AK.put(4, '', { j: 'tot' });
  AK.put(14, { f: `SUM(N${pr0}:N${pr1})` }, { j: 'tot', fmt: 'n0' }); AK.put(17, { f: `SUM(Q${pr0}:Q${pr1})` }, { j: 'tot', fmt: 'n2' });
  AK.r++;
  AK.field('Man hour inbound', { f: 'SUMIFS(PD_MH,PD_Arus,"inbound",PD_Res,"<>")' }, 'n1', 'out', 'jam', 'dipakai bobot workload gabungan per shift', 'JamArus_in');
  AK.field('Man hour outbound', { f: 'SUMIFS(PD_MH,PD_Arus,"outbound",PD_Res,"<>")' }, 'n1', 'out', 'jam', '', 'JamArus_out');
  AK.field('Man hour storage', { f: 'SUMIFS(PD_MH,PD_Arus,"storage",PD_Res,"<>")' }, 'n1', 'out', 'jam', '', 'JamArus_sto');
  AK.field('Man hour VAS', { f: 'SUMIFS(PD_MH,PD_Arus,"vas",PD_Res,"<>")' }, 'n1', 'out', 'jam', '', 'JamArus_vas');
  AK.field('Man hour total', { f: 'JamArus_in+JamArus_out+JamArus_sto+JamArus_vas' }, 'n1', 'out', 'jam', '', 'JamArus_tot');

  // ===================== Matriks multi-skill
  if (pd.mp.length >= 2) {
    AK.r++;
    AK.h2('Matriks multi-skill (siapa boleh merangkap siapa)', 'Ya = role di baris boleh merangkap pekerjaan role di kolom. Default: Checker ↔ Picker ↔ Operator RT/CB; Admin hanya Picker & Checker; Operator hanya sesama operator; TKBM & Helper tidak merangkap/dirangkap. Pooling di file ini mengikuti kolom Shift (input) di Man Power Summary.');
    const roles = pd.mp.map(z => z.nama);
    AK.hdr(['Merangkap ↓ / dirangkap →', ...roles]);
    for (const ra of roles) {
      AK.put(1, ra + (isTkbm(ra) ? ' (non-karyawan)' : ''), { j: 'txt', b: true });
      roles.forEach((rb, j) => { if (ra === rb) AK.put(2 + j, '—', { j: 'out', al: 'center' }); else { AK.put(2 + j, bolehRangkap(ra, rb, x.pdIn.rangkap) ? 'Ya' : 'Tidak', { j: 'in', al: 'center' }); AK.dd(2 + j, 'L_YaTidak'); } });
      AK.r++;
    }
  }

  // ===================== Indirect & peran tetap
  AK.r++;
  AK.h2('Indirect & peran tetap', 'Supervisor otomatis = ROUNDUP(direct per shift ÷ span) × shift aktif — kecuali role supervisor sudah diisi di tabel peran tetap. Span 0 = mematikan perhitungan otomatis. Peran tetap: Headcount + Basis (per shift / total). Alat pendukung 1 unit per orang (pisahkan koma) → MHE Summary.');
  AK.field('Span of control', a.spanOfControl, 'n0', 'in', 'direct per supervisor', 'umumnya 10–20', 'Span');
  AK.field('Role supervisor (hanya role SPV / Leader / Manager)', a.roleSupervisor, 'teks', 'in', '', '', 'RoleSpv', 'L_Spv', false);
  AK.field('Alat pendukung supervisor', (a.alatSupervisor ?? []).join(', '), 'teks', 'in', '', 'mis. PC, HT', 'AlatSpv');
  AK.hdr([['Role', true], ['Headcount', true], ['Basis', true], 'Total orang', ['Alat pendukung', true], ['Alokasi biaya', true]]);
  const t0 = AK.r;
  ptRows.forEach((p, j) => {
    const r = AK.r;
    AK.put(1, p?.roleName ?? null, { j: 'in' }); AK.dd(1, 'L_Role', false);
    AK.put(2, p ? Number(p.qty) || 0 : null, { j: 'in', fmt: 'n0' });
    AK.put(3, p ? (p.perShift ? 'Per shift' : 'Total') : 'Total', { j: 'in' }); AK.dd(3, 'L_BasisPT');
    AK.put(4, { f: `IF(A${r}="",0,MAX(0,N(B${r}))*IF(C${r}="Per shift",MAX(1,ShiftAktif),1))` }, { j: 'out', fmt: 'n0', b: true });
    AK.put(5, (p?.alat ?? []).join(', '), { j: 'in' });
    const al = p ? (ALOKASI.find(([, v]) => BUCKETS.every(b => Math.abs((v[b] ?? 0) - ((p.alokasi ?? { manajemen: 1 })[b] ?? 0)) < 1e-9))?.[0] ?? 'Manajemen (overhead)') : 'Manajemen (overhead)';
    AK.put(6, al, { j: 'in' }); AK.dd(6, 'L_Alokasi');
    for (const [nm, c] of [['Role', 1], ['Hc', 2], ['Basis', 3], ['Total', 4], ['Alat', 5], ['Alok', 6]] as const) AK.nm(`PT_${j + 1}_${nm}`, c);
    AK.r++;
  });
  AK.nmR('PT_Role', 1, t0, AK.r - 1); AK.nmR('PT_Total', 4, t0, AK.r - 1); AK.nmR('PT_Alat', 5, t0, AK.r - 1);
  AK.note('Dropdown role menampilkan semua jabatan; role yang dipakai sebagai direct di Aktivitas sebaiknya tidak dipakai di sini (sama dengan web).');

  // ===================== Aktivitas (VSM) & manpower
  AK.r++;
  AK.h2('Aktivitas (VSM) & manpower', 'Kolom kuning (input) bisa diubah: task, aktivitas, equipment, alat pendukung, role, produktivitas, UoM, arus, volume, % dan pengali. Volume/bln kosong = volume peak arus × pengali (admin: order dari Profil order). Urutan = nomor baris; sisipkan/geser baris di Excel bila perlu.');
  AK.hdr(['Urutan', ['Task / tahap', true], ['Aktivitas (workload driver)', true], ['Equipment', true], ['Alat pendukung', true], ['Role (man power)', true], ['Prod/jam', true], ['UoM', true], ['Arus', true],
    ['Volume/bln (manual)', true], ['Sumber % volume', true], ['% manual', true], '% volume dipakai', ['Pengali UoM', true], 'Volume auto', 'Volume dipakai', 'Prod DB', 'Status vs DB', 'Id DB', 'Admin?', 'Proses', 'Muat', 'Faktor UoM', 'Pengali efektif', 'Baris volume']);
  const vs0 = AK.r;
  const aktEf = h.aktivitas;
  aktRows.forEach((z, i) => {
    const r = AK.r;
    AK.put(1, i + 1, { j: 'txt', fmt: 'n0' });
    AK.put(2, z?.tahap ?? null, { j: 'in' }); AK.dd(2, 'L_Tahap', false);
    AK.put(3, z?.aktivitas ?? null, { j: 'in' }); AK.dd(3, 'D_ProdAktivitas', false);
    AK.put(4, z?.tool ?? null, { j: 'in' }); AK.dd(4, 'L_Tool', false);
    AK.put(5, (z?.alatTambahan ?? []).filter(Boolean).join(', '), { j: 'in' });
    AK.put(6, z?.roleName ?? null, { j: 'in' }); AK.dd(6, 'L_Role', false);
    AK.put(7, z ? Number(z.prodPerJam) : null, { j: 'in', fmt: 'n2' });
    AK.put(8, z?.uom ?? null, { j: 'in' }); AK.dd(8, 'L_Uom', false);
    AK.put(9, z?.arus ?? null, { j: 'in' }); AK.dd(9, 'L_Arus');
    AK.put(10, z?.volumeManual != null && Number.isFinite(z.volumeManual) ? Number(z.volumeManual) : null, { j: 'in', fmt: 'n0' });
    AK.put(11, z?.porsiMuat ? `Porsi ${labelTag(z.porsiMuat)}` : '% manual', { j: 'in' }); AK.dd(11, 'L_Sumber');
    AK.put(12, z && !z.porsiMuat ? Number(z.persenVolume) : null, { j: 'in', fmt: 'pct' });
    const pal = `IFERROR(INDEX(PorsiPal,MATCH(U${r},PorsiKode,0)),0)`;
    AK.put(13, { f: `IF(OR(K${r}="% manual",K${r}=""),N(L${r}),IF(U${r}="replenishment",1-Porsi_picking,1)*IF(V${r}="palet",${pal},IF(V${r}="loose",1-${pal},1)))`, v: aktEf[i]?.persenVolume }, { j: 'out', fmt: 'pct' });
    AK.put(14, z ? Number(z.pengaliUom) || 1 : null, { j: 'in', fmt: 'n2' });
    const vi = `Y${r}`;
    const ix = (nm: string) => `INDEX(${nm},${vi})`;
    AK.put(25, { f: `IFERROR(MATCH(I${r},Vol_Arus,0),0)` }, { j: 'out', fmt: 'n0' });
    AK.put(20, { f: `IF(AND(ISNUMBER(SEARCH("admin",F${r})),OR(LOWER(TRIM(H${r}))="order",LOWER(TRIM(H${r}))="line",LOWER(TRIM(H${r}))="dokumen",LOWER(TRIM(H${r}))="doc",LOWER(TRIM(H${r}))="do",LOWER(TRIM(H${r}))="transaksi"),OR(I${r}="inbound",I${r}="outbound")),1,0)`, v: z && isAktivitasAdmin(z) ? 1 : 0 }, { j: 'out', fmt: 'n0' });
    AK.put(21, { f: `IF(OR(K${r}="% manual",K${r}=""),"",IFERROR(INDEX(D_TagProses,MATCH(K${r},D_TagLabel,0)),""))` }, { j: 'out' });
    AK.put(22, { f: `IF(OR(K${r}="% manual",K${r}=""),"",IFERROR(INDEX(D_TagMuat,MATCH(K${r},D_TagLabel,0)),""))` }, { j: 'out' });
    const nu = normU(`H${r}`), nv = ix('Vol_nU'), p1 = `N(${ix('Vol_Per1')})`, p2 = `N(${ix('Vol_Per2')})`, pi = `N(${ix('Vol_PaletIsi')})`, n1 = ix('Vol_nU1'), n2 = ix('Vol_nU2');
    const umum = `IF(AND(${n1}=${nu},${p1}>0),${p1},IF(AND(${n2}=${nu},${p1}>0,${p2}>0),${p1}*${p2},"x"))`;
    AK.put(23, { f: `IF(${vi}=0,"x",IF(${nu}=${nv},1,IF(${nv}="case",IF(${isPal(`H${r}`)},IF(${pi}>0,1/${pi},"x"),IF(AND(${n2}=${nu},${p2}>0),${p2},${umum})),${umum})))` }, { j: 'out', fmt: 'x' });
    AK.put(24, { f: `IF(AND(N(N${r})<>0,N(N${r})<>1),N${r},IF(W${r}="x",1,W${r}))` }, { j: 'out', fmt: 'x' });
    const ordr = `IF(I${r}="inbound",OrderBln_in,OrderBln_out)`;
    AK.put(15, { f: `IF(AND(T${r}=1,J${r}="",${ordr}>0),${ordr}/COUNTIFS($T$${vs0}:$T$${vs0 + aktRows.length - 1},1,$I$${vs0}:$I$${vs0 + aktRows.length - 1},I${r},$J$${vs0}:$J$${vs0 + aktRows.length - 1},""),IF(${vi}=0,0,N(${ix('Vol_Peak')}))*X${r})` }, { j: 'out', fmt: 'n0' });
    AK.put(16, { f: `IF(J${r}<>"",J${r},O${r})`, v: pd.baris.find(b => b.no === i + 1)?.volume }, { j: 'out', fmt: 'n0', b: true });
    const pid = (z as { productivityId?: number } | null)?.productivityId;
    AK.put(19, pid ?? null, { j: 'out', fmt: 'n0' });
    AK.put(17, { f: `IF(S${r}="","",IFERROR(INDEX(D_ProdProd,MATCH(S${r},D_ProdId,0)),""))` }, { j: 'out', fmt: 'n2' });
    AK.put(18, { f: `IF(Q${r}="","manual",IF(AND(Q${r}=G${r},IFERROR(INDEX(D_ProdRole,MATCH(S${r},D_ProdId,0)),"")=F${r},IFERROR(INDEX(D_ProdTool,MATCH(S${r},D_ProdId,0)),"")=D${r},IFERROR(INDEX(D_ProdUom,MATCH(S${r},D_ProdId,0)),"")=H${r}),"sama","beda dengan DB"))` }, { j: 'out', size: 9 });
    AK.r++;
  });
  AK.note(`${nAkt} aktivitas + 5 baris kosong untuk tambahan. "Status vs DB" = beda bila role/equipment/UoM/produktivitas berbeda dengan database Productivity (seperti notifikasi sinkron di web).`);
  // Rincian per task — isi rumus (rujuk baris VSM)
  for (const p of pending) {
    const r = p.r, v = vs0 + p.i;
    const res = p.jenis === 'E' ? `IF(OR(TRIM(D${v})="",D${v}="Manual"),"",D${v})` : p.jenis === 'A' ? `TRIM(MID(SUBSTITUTE(E${v},",",REPT(" ",200)),${(p.k - 1) * 200 + 1},200))` : `F${v}`;
    const alat = p.jenis !== 'M';
    if (p.jenis === 'E') { AK.put(1, { f: `IF(C${v}="","",A${v})` }, { j: 'txt', fmt: 'n0' }, r); AK.put(2, { f: `IF(C${v}="","",B${v})` }, { j: 'txt', b: true }, r); AK.put(3, { f: `IF(C${v}="","",C${v})` }, { j: 'txt' }, r); }
    else for (const c of [1, 2, 3]) AK.put(c, '', { j: 'txt' }, r);
    AK.put(4, { f: res }, { j: 'txt' }, r);
    AK.put(5, alat ? 'Equipment' : 'Man Power', { j: 'txt', size: 9 }, r);
    AK.put(6, { f: `I${v}` }, { j: 'out' }, r);
    AK.put(7, { f: `P${v}` }, { j: 'out', fmt: 'n0' }, r); AK.put(8, { f: `H${v}` }, { j: 'out' }, r); AK.put(9, { f: `M${v}` }, { j: 'out', fmt: 'pct' }, r);
    AK.put(10, { f: `G${r}*I${r}` }, { j: 'out', fmt: 'n0' }, r);
    AK.put(11, { f: `N(G${v})*FProd` }, { j: 'out', fmt: 'n1' }, r);
    AK.put(12, { f: `IF(K${r}>0,J${r}/K${r},0)` }, { j: 'out', fmt: 'n1' }, r);
    AK.put(13, { f: 'Efis' }, { j: 'out', fmt: 'pct' }, r);
    AK.put(14, { f: `IF(OR(D${r}="",M${r}<=0),0,L${r}/M${r})` }, { j: 'out', fmt: 'n1' }, r);
    AK.put(15, { f: alat ? 'JamMHE' : 'JamMP' }, { j: 'out', fmt: 'n0' }, r);
    AK.put(16, { f: alat ? 'Operating' : '1' }, { j: 'out', fmt: 'n0' }, r);
    AK.put(17, { f: `IF(OR(D${r}="",O${r}<=0),0,N${r}/(O${r}*P${r}))`, v: pd.baris.find(b => b.no === p.i + 1 && (alat ? b.jenis === 'Equipment' : b.jenis === 'Man Power'))?.fte }, { j: 'out', fmt: 'n2', b: true }, r);
    AK.put(18, { f: `N(G${v})` }, { j: 'out', fmt: 'n1' }, r);
  }
  void A; void q; void lk;
}
