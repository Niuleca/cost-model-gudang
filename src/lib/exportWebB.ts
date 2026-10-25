// Sheet "Aktivitas & manpower" — semua hidup dari rumus:
// VSM → Rincian per task (FTE) → daftar role & alat otomatis → multi-skill pooling per shift (rumus, ikut matriks)
// → Man Power & MHE Summary (+ remarks otomatis) → Rincian biaya manpower → baris biaya di sheet Hasil.
import { R, A, q, BUCKETS, ALOKASI, type Ctx } from '@/lib/exportWebUtil';
import { rincianBiayaRole, LEVEL_JABATAN, LEVEL_GAJI_DEFAULT, PARAM_BIAYA_MP_DEFAULT } from '@/lib/engine/biayaMp';
import { labelTag } from '@/lib/porsiMuat';
import { isAktivitasAdmin } from '@/lib/profilVolume';

const LEVEL_LABEL = Object.fromEntries(LEVEL_JABATAN.map(L => [L.v, L.l.split(' (')[0]])) as Record<string, string>;

export interface MpBarisXl { row: number; jenis: 'Direct' | 'Indirect' | 'Tetap'; sumRow: number; idx: number }

/** Rumus kategori role untuk matriks default (sama dengan aturan web). */
const fKat = (c: string) => {
  const s = (t: string) => `ISNUMBER(SEARCH(${q(t)},${c}))`;
  const w = (t: string) => `ISNUMBER(SEARCH(${q(` ${t} `)}," "&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${c},"("," "),")"," "),"/"," "),"-"," "),","," "),"."," ")&" "))`;
  const tk = `OR(${['tkbm', 'kuli', 'bongkar muat', 'buruh', 'helper', 'daily worker', 'harian'].map(s).join(',')})`;
  const op = `AND(NOT(${s('admin')}),OR(${s('reach truck')},${s('forklift')},${w('rt')},${w('cb')},${w('cbt')}))`;
  return { tk, kat: `IF(${c}="","",IF(${tk},"nonkaryawan",IF(${s('admin')},"admin",IF(${op},"operator",IF(${s('checker')},"checker",IF(${s('picker')},"picker","lain"))))))` };
};
/** Level jabatan default dari nama (sama dengan web). */
const fLevel = (c: string) => {
  const s = (t: string) => `ISNUMBER(SEARCH(${q(t)},${c}))`;
  return `IF(OR(${['manager', 'manajer', 'kepala', 'ka gudang', 'ka.gudang', 'ka. gudang', 'kagudang', 'head', 'wh m', 'whm'].map(s).join(',')}),${q(LEVEL_LABEL.manager)},`
    + `IF(OR(${['spv', 'supervisor', 'leader', 'koordinator', 'coordinator', 'foreman', 'mandor'].map(s).join(',')}),${q(LEVEL_LABEL.supervisor)},`
    + `IF(OR(${['admin', 'staff', 'controller', 'inventory', 'qhse', 'k3', 'hse', 'clerk'].map(s).join(',')}),${q(LEVEL_LABEL.admin)},${q(LEVEL_LABEL.operasional)})))`;
};

export function tulisAktivitas(x: Ctx) {
  const { AK, d, a, pd, lk, normU, isPal } = x;
  const { h, m, inp, t } = d;
  const SN = `'${AK.nama}'!`;
  AK.lebar(30, 40, 12, 12, 12, 12, 12, 12, 14, 14, 13, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 13, 11, 13, 10, 15, 16, 16, 11, 10, 9, 9, 9, 9, 9, 10);
  const aktRows = [...a.aktivitas, ...Array.from({ length: 5 }, () => null)];
  const nAlat = aktRows.map(z => Math.max(1, (z?.alatTambahan ?? []).filter(Boolean).length));
  const ptRows = [...a.peranTetap, null, null, null];
  const N = Math.max(3, pd.mp.length + 3);          // slot role direct (otomatis dari VSM)
  const M = Math.max(3, pd.mhe.length + 3);         // slot alat (otomatis dari Rincian per task + alat indirect)
  const mpRows: MpBarisXl[] = [];

  // ===================== Man Power Summary
  AK.h2('Man Power Summary', 'Role otomatis dari kolom Role di Aktivitas (VSM) sesuai urutan muncul. FTE = Σ FTE role di Rincian per task. Shift 1–3 = hasil multi-skill pooling (bagian "Perhitungan multi-skill pooling" di bawah). Remarks otomatis.');
  AK.hdr(['Description', 'Remarks (otomatis)', ['FTE', false, 'Σ FTE role ini di Rincian per task (jenis Man Power)'], ['Man hour / bln', false, 'Σ man hour role ini di Rincian per task'],
    ['Shift 1', false, 'Orang di shift 1 = orang tetap (bagian bulat FTE shift) + orang baru dari pooling. Lihat tabel pooling Shift 1.'], ['Shift 2', false, 'Sama dengan Shift 1, untuk shift 2'], ['Shift 3', false, 'Sama dengan Shift 1, untuk shift 3'],
    ['Resources', false, 'Shift 1 + Shift 2 + Shift 3'], ['Biaya/orang/bln (incl. fee)', false, 'Total per orang di Rincian biaya manpower × porsi × (1 + management fee)'], ['Total/bln', false, 'Biaya/orang × Resources'], ['ROUNDUP(FTE) tanpa pooling', false, 'Pembanding: jumlah orang bila tiap role dibulatkan sendiri tanpa multi-skill']]);
  const d0 = AK.r;
  for (let i = 1; i <= N; i++) {
    const r = AK.r;
    AK.put(1, { f: `IFERROR(INDEX(VSM_Role,MATCH(${i},VSM_RoleNo,0)),"")`, v: pd.mp[i - 1]?.nama ?? '' }, { j: 'txt', b: true });
    AK.put(2, { f: `IF(A${r}="","",INDEX(PoolStatus,${i})&INDEX(Pool_K1,${i})&INDEX(Pool_K2,${i})&INDEX(Pool_K3,${i}))` }, { j: 'txt', size: 8, wrap: true });
    AK.put(3, { f: `IF(A${r}="",0,SUMIFS(PD_FTE,PD_Res,A${r},PD_Jenis,"Man Power"))`, v: pd.mp[i - 1]?.fte }, { j: 'out', fmt: 'n2' });
    AK.put(4, { f: `IF(A${r}="",0,SUMIFS(PD_MH,PD_Res,A${r},PD_Jenis,"Man Power"))` }, { j: 'out', fmt: 'n1' });
    for (let s = 1; s <= 3; s++) AK.put(4 + s, { f: `IF(A${r}="",0,INDEX(Pool_O${s},${i}))`, v: pd.mp[i - 1]?.perShift?.[s - 1] ?? 0 }, { j: 'out', fmt: 'n0' });
    AK.put(8, { f: `SUM(E${r}:G${r})`, v: pd.mp[i - 1]?.resources ?? 0 }, { j: 'out', fmt: 'n0', b: true });
    AK.put(11, { f: `IF(C${r}>0,ROUNDUP(C${r}-1E-9,0),0)` }, { j: 'out', fmt: 'n0' });
    AK.ws.getRow(r).height = 54;
    AK.r++;
  }
  const d1 = AK.r - 1;
  AK.nmR('MpRole', 1, d0, d1); AK.nmR('MpFte', 3, d0, d1); AK.nmR('MpRes', 8, d0, d1);
  const rSubD = AK.r;
  AK.put(1, 'Subtotal direct', { j: 'sub' }); AK.put(2, '', { j: 'sub' });
  AK.put(3, { f: `SUM(C${d0}:C${d1})`, v: pd.totalFteMp }, { j: 'sub', fmt: 'n2' }); AK.put(4, { f: `SUM(D${d0}:D${d1})` }, { j: 'sub', fmt: 'n1' });
  for (let c = 5; c <= 8; c++) AK.put(c, { f: `SUM(${R(c, d0)}:${R(c, d1)})` }, { j: 'sub', fmt: 'n0' });
  AK.put(10, { f: `SUM(J${d0}:J${d1})` }, { j: 'sub', fmt: 'rp' });
  AK.r++;
  const i0 = AK.r;
  const rSpv = AK.r;
  AK.put(1, { f: 'IF(COUNTIF(PT_Role,RoleSpv)>0,"",RoleSpv)', v: a.roleSupervisor }, { j: 'txt', b: true });
  AK.put(2, { f: `IF(A${rSpv}="","Supervisor diisi di peran tetap","Indirect · Span 1:"&Span&" · ROUNDUP("&DirectPerShift&" ÷ "&Span&") × "&ShiftAktif&" shift"&IF(AlatSpv<>""," · alat: "&AlatSpv,""))` }, { j: 'txt', size: 8 });
  AK.put(3, '–', { j: 'out', al: 'right' }); AK.put(4, '', { j: 'out' });
  for (let s = 0; s < 3; s++) AK.put(5 + s, { f: `IF(INDEX(BebanGab,${s + 1})>0,H${rSpv}/ShiftAktif,0)` }, { j: 'out', fmt: 'n1' });
  AK.put(8, { f: `IF(OR(COUNTIF(PT_Role,RoleSpv)>0,N(Span)<=0),0,IF(DirectPerShift>0,ROUNDUP(DirectPerShift/Span,0)*ShiftAktif,0))`, v: pd.indirect.spv }, { j: 'out', fmt: 'n0', b: true });
  AK.nm('SpvQty', 8);
  AK.r++;
  const ptSum: number[] = [];
  ptRows.forEach((_, j) => {
    const r = AK.r; ptSum.push(r);
    AK.put(1, { f: `IF(PT_${j + 1}_Role="","",PT_${j + 1}_Role)` }, { j: 'txt', b: true });
    AK.put(2, { f: `IF(PT_${j + 1}_Role="","",IF(PT_${j + 1}_Basis="Per shift","Peran tetap · "&PT_${j + 1}_Hc&"/shift × "&ShiftAktif&" shift","Peran tetap · total (non-shift)")&IF(PT_${j + 1}_Alat<>""," · alat: "&PT_${j + 1}_Alat,""))` }, { j: 'txt', size: 8 });
    AK.put(3, '–', { j: 'out', al: 'right' }); AK.put(4, '', { j: 'out' });
    for (let s = 0; s < 3; s++) AK.put(5 + s, { f: `IF(PT_${j + 1}_Basis="Per shift",IF(INDEX(BebanGab,${s + 1})>0,PT_${j + 1}_Hc,0),0)` }, { j: 'out', fmt: 'n0' });
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
  AK.field('Direct per shift (dasar supervisor)', { f: `SUMPRODUCT((MpRes>0)*ROUNDUP(MpRes/ShiftAktif-1E-9,0))`, v: pd.indirect.directPerShift }, 'n0', 'out', 'orang', 'Σ ROUNDUP(resources role ÷ shift aktif)', 'DirectPerShift');
  AK.note('FTE (Full Time Equivalent) = man hour dibutuhkan ÷ jam kerja tersedia per orang per bulan (Man hours per bulan di Key assumption).');

  // ===================== MHE Summary
  AK.r++;
  AK.h2('MHE Summary', 'Alat otomatis dari Rincian per task (Equipment & alat pendukung aktivitas) + alat pendukung supervisor / peran tetap. Unit = ROUNDUP(FTE alat) + unit indirect (1 unit per orang).');
  AK.hdr(['Description', 'Remarks', ['FTE', false, 'Σ FTE alat ini di Rincian per task (jenis Equipment)'], ['Man hour / bln', false, 'Σ man hour alat'], ['Unit indirect', false, 'Jumlah supervisor/peran tetap yang alat pendukungnya memuat alat ini (1 unit per orang)'], ['Resources', false, 'ROUNDUP(FTE) + unit indirect']]);
  const e0 = AK.r;
  for (let i = 1; i <= M; i++) {
    const r = AK.r; const e = pd.mhe[i - 1];
    AK.put(1, { f: `IF(${i}<=PdEqN,IFERROR(INDEX(PD_Res,MATCH(${i},PD_EqIdx,0)),""),IFERROR(INDEX(Tok_Name,MATCH(${i}-PdEqN,Tok_Idx,0)),""))`, v: e?.nama ?? '' }, { j: 'txt', b: true });
    AK.put(2, { f: `IF(A${r}="","",IF(C${r}>0,"Equipment · ROUNDUP("&FIXED(C${r},2)&")","Alat pendukung indirect")&IF(E${r}>0," + "&E${r}&" unit indirect","")&IF(SUMPRODUCT(EXACT(MheHarga_Tool,A${r})*(MheHarga_Biaya>0))=0," · ⚠ belum ada harga (Gudang, space & MHE)",""))` }, { j: 'txt', size: 9 });
    AK.put(3, { f: `IF(A${r}="",0,SUMIFS(PD_FTE,PD_Res,A${r},PD_Jenis,"Equipment"))`, v: e?.fte }, { j: 'out', fmt: 'n2' });
    AK.put(4, { f: `IF(A${r}="",0,SUMIFS(PD_MH,PD_Res,A${r},PD_Jenis,"Equipment"))` }, { j: 'out', fmt: 'n1' });
    const has = (rg: string) => `ISNUMBER(SEARCH(","&A${r}&",",","&SUBSTITUTE(${rg},", ",",")&","))`;
    AK.put(5, { f: `IF(A${r}="",0,IF(${has('AlatSpv')},SpvQty,0)+SUMPRODUCT(${has('PT_Alat')}*PT_Total))`, v: e?.unitIndirect }, { j: 'out', fmt: 'n0' });
    AK.put(6, { f: `IF(C${r}>0,ROUNDUP(C${r}-1E-9,0),0)+E${r}`, v: e?.resources }, { j: 'out', fmt: 'n0', b: true });
    AK.r++;
  }
  AK.nmR('MheSum_Nama', 1, e0, AK.r - 1); AK.nmR('MheSum_Res', 6, e0, AK.r - 1); AK.nmR('MheSum_Fte', 3, e0, AK.r - 1);
  AK.put(1, 'Total', { j: 'tot' }); AK.put(2, 'Equipment', { j: 'tot' }); AK.put(3, { f: `SUM(C${e0}:C${AK.r - 1})` }, { j: 'tot', fmt: 'n2' });
  AK.put(4, '', { j: 'tot' }); AK.put(5, '', { j: 'tot' }); AK.put(6, { f: `SUM(F${e0}:F${AK.r - 1})` }, { j: 'tot', fmt: 'n0' });
  AK.r++;
  x.mheSlot = pd.mhe.map(e => e.nama);

  // ===================== Skema biaya manpower selama kontrak (eskalasi)
  const es = h.eskalasiManpower;
  AK.r++;
  AK.h2('Skema biaya manpower selama kontrak', 'Upah naik setiap Januari (UMK baru) dan bertingkat: indeks = (1 + kenaikan)^(jumlah Januari yang dilewati). Biaya/bln dipakai = Σ (bulan × indeks) ÷ bulan kontrak × biaya dasar.');
  const ml = a.eskalasiManpower?.mulai && /^(\d{4})-(\d{2})/.exec(a.eskalasiManpower.mulai);
  AK.field('Mulai kontrak (manual)', ml ? { f: `DATE(${ml[1]},${Number(ml[2])},1)` } : null, 'tgl', 'in', '', 'kosong = bulan go-live; go-live kosong = Januari tahun ini', 'EskManual');
  AK.field('Mulai kontrak dipakai', { f: 'IF(EskManual<>"",DATE(YEAR(EskManual),MONTH(EskManual),1),IF(GoLive<>"",DATE(YEAR(GoLive),MONTH(GoLive),1),DATE(YEAR(TODAY()),1,1)))' }, 'tgl', 'out', '', '', 'EskTgl');
  AK.field('Kenaikan upah tiap Januari', es.persenTahun, 'pct', 'in', '/thn', 'kebijakan UMK, umumnya 5–7%', 'Eskalasi');
  AK.hdr(['Periode (tahun)', 'Tahun ke-', ['Bulan', false, 'Jumlah bulan kontrak yang jatuh di tahun ini'], ['Indeks', false, '(1 + kenaikan) ^ tahun ke-'], 'Bulan × indeks', ['Biaya/bln', false, 'Biaya manpower/bln dasar × indeks'], 'Total periode']);
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
  AK.field('Faktor eskalasi (rata-rata kontrak)', { f: `IF(Kontrak>0,SUM(E${y0}:E${y1})/Kontrak,1)`, v: es.faktor }, 'x', 'out', '×', 'Σ (bulan × indeks) ÷ bulan kontrak', 'FaktorEsk');
  AK.field('Biaya manpower/bln dipakai di cost model', { f: 'MpDasarTot*FaktorEsk', v: es.rataBulan }, 'rp', 'out', 'Rp/bln', 'biaya dasar × faktor eskalasi');

  // ===================== Rincian biaya manpower
  const pm = { ...PARAM_BIAYA_MP_DEFAULT, ...h.paramBiayaMp };
  const lg = { ...LEVEL_GAJI_DEFAULT, ...(a.levelGaji ?? {}) };
  AK.r++;
  AK.h2('Rincian biaya manpower', 'Baris jabatan otomatis dari Man Power Summary (direct), supervisor & peran tetap. Isian khusus per jabatan (gaji, hari kerja, lisensi, sharing, level) diisi di tabel "Isian manual per jabatan"; kosong = default.');
  AK.field('UMK area project', { f: 'UMK', v: m.upahMinimum }, 'rp', 'out', 'Rp/bln', 'ganti area di Key assumption');
  AK.field('Area', { f: 'Kab', v: t.kab_kota }, 'teks', 'out');
  AK.h3('% gaji pokok per level jabatan');
  AK.hdr(['Level', 'Contoh jabatan', ['% dari UMK', true], ['Gaji pokok/bln', false, 'UMK × % level'], 'Jabatan di tender ini']);
  const lv0 = AK.r;
  for (const L of LEVEL_JABATAN) {
    const r = AK.r;
    AK.put(1, L.l.split(' (')[0], { j: 'txt', b: true }); AK.put(2, L.contoh, { j: 'txt', size: 8 }); AK.put(3, lg[L.v], { j: 'in', fmt: 'pct' });
    AK.put(4, { f: `UMK*C${r}` }, { j: 'out', fmt: 'rp' });
    AK.put(5, { f: `COUNTIFS(BMP_Level,A${r},BMP_Role,"<>")&" jabatan"` }, { j: 'txt', size: 9 });
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
  // Isian manual per jabatan (kunci = nama jabatan; sama dengan isian per baris di web)
  AK.h3('Isian manual per jabatan (kosong = default)');
  AK.hdr([['Jabatan', true], ['Level', true, 'Kosong = level dari nama jabatan'], ['Gaji pokok', true, 'Kosong = UMK × % level'], ['Hari kerja', true, 'Kosong = Working Days Employee'], ['Actual hari kerja', true, 'Kosong = hari kerja'],
    ['Lisensi + insentif', true, 'Kosong = tunjangan jabatan (master)'], ['Supervisi & operasional', true], ['Dedicated / Sharing', true], ['Porsi sharing', true, '0,5 = pegang 2 project']]);
  const is0 = AK.r;
  const roleIsi = Array.from(new Set([...h.manpower.map(p => p.roleName), ...Object.keys(a.rincianBiayaMp ?? {}), ...Object.keys(a.levelRole ?? {})]));
  for (const role of [...roleIsi, ...Array.from({ length: 5 }, () => '')]) {
    const ri = role ? a.rincianBiayaMp?.[role] : undefined;
    const rc = role ? rincianBiayaRole(role, 1, m, ri, pm, inp.processDesign?.hariKerjaKaryawan ?? 25, t.kab_kota, { levelGaji: a.levelGaji, levelRole: a.levelRole }) : null;
    AK.put(1, role || null, { j: 'in' }); AK.dd(1, 'L_Role', false);
    AK.put(2, rc ? LEVEL_LABEL[rc.level] : null, { j: 'in' }); AK.dd(2, 'L_Level');
    AK.put(3, ri?.gajiPokok && ri.gajiPokok > 0 ? ri.gajiPokok : null, { j: 'in', fmt: 'rp' });
    AK.put(4, ri?.hariKerja && ri.hariKerja > 0 ? ri.hariKerja : null, { j: 'in', fmt: 'n0' });
    AK.put(5, ri?.hariAktual != null && ri.hariAktual >= 0 ? ri.hariAktual : null, { j: 'in', fmt: 'n0' });
    AK.put(6, ri?.lisensi != null ? ri.lisensi : null, { j: 'in', fmt: 'rp' });
    AK.put(7, ri?.supervisi ?? null, { j: 'in', fmt: 'rp' });
    AK.put(8, rc?.skema === 'sharing' ? 'Sharing' : role ? 'Dedicated' : null, { j: 'in' }); AK.dd(8, 'L_Skema2');
    AK.put(9, rc?.skema === 'sharing' ? rc.porsi : null, { j: 'in', fmt: 'n2' });
    AK.r++;
  }
  ['Role', 'Level', 'Gaji', 'Hari', 'Aktual', 'Lisensi', 'Supervisi', 'Skema', 'Porsi'].forEach((k, j) => AK.nmR(`Isi_${k}`, 1 + j, is0, AK.r - 1));
  AK.r++;
  AK.hdr(['No', 'Jabatan', 'Area', 'UMK', ['Level', false, 'Isian manual, kosong = dari nama jabatan'], '% level', 'Gaji pokok (manual)', ['Gaji pokok', false, 'Manual bila diisi, kosong = ROUND(UMK × % level)'], 'Hari kerja (manual)', 'Hari kerja',
    'Actual (manual)', 'Actual hari kerja', 'Lisensi + insentif (manual)', 'Lisensi + insentif', ['Sub total', false, 'Gaji × MIN(1, actual ÷ hari kerja) + lisensi'], ['BPJS TK', false, 'Gaji × BPJS TK'], ['BPJS KS', false, 'MIN(gaji, batas) × BPJS KS'],
    ['BPJS Pensiun', false, 'MIN(gaji, batas JP) × BPJS JP'], ['THR', false, 'Gaji × THR'], ['Kompensasi', false, 'Gaji × kompensasi'], 'Supervisi & operasional', ['Total', false, 'Sub total + BPJS + THR + kompensasi + supervisi'], ['Manpower', false, 'Dari Man Power Summary / supervisor / peran tetap (0 bila jabatan tidak ada di master)'],
    'Dedicated / Sharing', 'Porsi sharing', ['TOTAL', false, 'Total × manpower × porsi'], ['Biaya/bln dasar (+fee)', false, 'Total × (1 + fee) × manpower × porsi'], ['Biaya/bln (× eskalasi)', false, 'ROUND(dasar × faktor eskalasi) → masuk Rincian biaya (Hasil)'], 'Jenis', 'Baris isian',
    ['Sto', false, 'Alokasi biaya ke Storage = man hour arus storage ÷ total man hour role'], 'HIn', 'HOut', 'VAS', 'Man']);
  const b0 = AK.r;
  const rowJ = (kind: 'D' | 'I' | 'T', idx: number) => {
    const r = AK.r;
    const role = kind === 'D' ? `IFERROR(INDEX(MpRole,${idx}),"")` : kind === 'I' ? 'IF(SpvQty>0,RoleSpv,"")' : `PT_${idx}_Role`;
    const mp = kind === 'D' ? `IF(OR(B${r}="",COUNTIF(D_JabRole,B${r})=0),0,INDEX(MpRes,${idx}))` : kind === 'I' ? 'SpvQty' : `PT_${idx}_Total`;
    AK.put(1, AK.r - b0 + 1, { j: 'txt', fmt: 'n0' }); AK.put(2, { f: role }, { j: 'txt', b: true }); AK.put(3, { f: 'Kab' }, { j: 'out' }); AK.put(4, { f: 'UMK' }, { j: 'out', fmt: 'rp' });
    AK.put(30, { f: `IF(B${r}="","",IFERROR(MATCH(B${r},Isi_Role,0),""))` }, { j: 'out', fmt: 'n0' });
    const isi = (nm: string) => `IF(ISNUMBER(AD${r}),IF(ISBLANK(INDEX(${nm},AD${r})),"",INDEX(${nm},AD${r})),"")`;
    AK.put(5, { f: `IF(B${r}="","",IF(${isi('Isi_Level')}<>"",${isi('Isi_Level')},${fLevel(`B${r}`)}))` }, { j: 'out' });
    AK.put(6, { f: `IFERROR(INDEX(LvPct,MATCH(E${r},LvLabel,0)),1)` }, { j: 'out', fmt: 'pct' });
    AK.put(7, { f: isi('Isi_Gaji') }, { j: 'out', fmt: 'rp' });
    AK.put(8, { f: `IF(N(G${r})>0,G${r},ROUND(D${r}*F${r},0))` }, { j: 'out', fmt: 'rp' });
    AK.put(9, { f: isi('Isi_Hari') }, { j: 'out', fmt: 'n0' });
    AK.put(10, { f: `IF(N(I${r})>0,I${r},HariKaryawan)` }, { j: 'out', fmt: 'n0' });
    AK.put(11, { f: isi('Isi_Aktual') }, { j: 'out', fmt: 'n0' });
    AK.put(12, { f: `IF(K${r}<>"",K${r},J${r})` }, { j: 'out', fmt: 'n0' });
    AK.put(13, { f: isi('Isi_Lisensi') }, { j: 'out', fmt: 'rp' });
    AK.put(14, { f: `IF(M${r}<>"",M${r},${lk('D_Jab', `B${r}`, 'Role', 'Tunjangan', 0)})` }, { j: 'out', fmt: 'rp' });
    AK.put(15, { f: `H${r}*MIN(1,IF(J${r}>0,L${r}/J${r},1))+N${r}` }, { j: 'out', fmt: 'rp' });
    AK.put(16, { f: `H${r}*BpjsTk` }, { j: 'out', fmt: 'rp' });
    AK.put(17, { f: `MIN(H${r},IF(BatasKs>0,BatasKs,H${r}))*BpjsKs` }, { j: 'out', fmt: 'rp' });
    AK.put(18, { f: `MIN(H${r},IF(BatasJp>0,BatasJp,H${r}))*BpjsJp` }, { j: 'out', fmt: 'rp' });
    AK.put(19, { f: `H${r}*Thr` }, { j: 'out', fmt: 'rp' }); AK.put(20, { f: `H${r}*Kompensasi` }, { j: 'out', fmt: 'rp' });
    AK.put(21, { f: `N(${isi('Isi_Supervisi')})` }, { j: 'out', fmt: 'rp' });
    AK.put(22, { f: `SUM(O${r}:U${r})` }, { j: 'out', fmt: 'rp', b: true });
    AK.put(23, { f: mp }, { j: 'out', fmt: 'n0' });
    AK.put(24, { f: `IF(${isi('Isi_Skema')}="Sharing","Sharing","Dedicated")` }, { j: 'out' });
    AK.put(25, { f: `IF(X${r}="Sharing",MIN(1,MAX(0,IF(${isi('Isi_Porsi')}="",0.5,${isi('Isi_Porsi')}))),1)` }, { j: 'out', fmt: 'n2' });
    AK.put(26, { f: `V${r}*W${r}*Y${r}` }, { j: 'out', fmt: 'rp', b: true });
    AK.put(27, { f: `V${r}*(1+Fee)*W${r}*Y${r}` }, { j: 'out', fmt: 'rp' });
    AK.put(28, { f: `ROUND(AA${r}*FaktorEsk,0)` }, { j: 'out', fmt: 'rp', b: true });
    AK.put(29, kind === 'D' ? 'Direct' : kind === 'I' ? 'Indirect' : 'Tetap', { j: 'txt', size: 9 });
    const mhA = (ar: string) => `IFERROR(SUMIFS(PD_MH,PD_Res,B${r},PD_Jenis,"Man Power",PD_Arus,"${ar}")/SUMIFS(PD_MH,PD_Res,B${r},PD_Jenis,"Man Power"),0)`;
    const kolAl = ['Storage', 'HIn', 'HOut', 'Vas', 'Man'];
    BUCKETS.forEach((_, k) => AK.put(31 + k, kind === 'D' ? { f: k === 4 ? '0' : mhA(['storage', 'inbound', 'outbound', 'vas'][k]) } : kind === 'I' ? [0.2, 0.4, 0.4, 0, 0][k]
      : { f: `IFERROR(INDEX(D_Al${kolAl[k]},MATCH(PT_${idx}_Alok,D_AlNama,0)),${k === 4 ? 1 : 0})` }, { j: 'out', fmt: 'pct', size: 8 }));
    AK.r++;
    return r;
  };
  for (let i = 1; i <= N; i++) mpRows.push({ row: rowJ('D', i), jenis: 'Direct', sumRow: d0 + i - 1, idx: i });
  mpRows.push({ row: rowJ('I', 0), jenis: 'Indirect', sumRow: rSpv, idx: 0 });
  ptRows.forEach((_, j) => mpRows.push({ row: rowJ('T', j + 1), jenis: 'Tetap', sumRow: ptSum[j], idx: j + 1 }));
  const b1 = AK.r - 1;
  AK.nmR('BMP_Level', 5, b0, b1); AK.nmR('BMP_Role', 2, b0, b1); AK.nmR('BMP_Per', 22, b0, b1);
  AK.put(2, 'Sub Total Biaya-1', { j: 'sub' }); AK.put(23, { f: `SUM(W${b0}:W${b1})`, v: h.totalHeadcount }, { j: 'sub', fmt: 'n0' }); AK.put(26, { f: `SUM(Z${b0}:Z${b1})` }, { j: 'sub', fmt: 'rp' });
  AK.put(27, { f: `SUM(AA${b0}:AA${b1})`, v: h.manpower.reduce((s, p) => s + p.biayaBulanDasar, 0) }, { j: 'sub', fmt: 'rp' }); AK.put(28, { f: `SUM(AB${b0}:AB${b1})` }, { j: 'sub', fmt: 'rp' });
  AK.nm('TotalHeadcount', 23); AK.nm('MpDasarTot', 27); const rSt1 = AK.r;
  AK.r++;
  AK.put(2, { f: `"Management Fee "&FIXED(Fee*100,2)&"%"` }, { j: 'txt' }); AK.put(26, { f: `Z${rSt1}*Fee` }, { j: 'out', fmt: 'rp' }); AK.r++;
  AK.put(2, 'Sub Total Biaya-2 (masuk cost model, sebelum kenaikan tahunan)', { j: 'tot' }); AK.put(26, { f: `Z${rSt1}+Z${rSt1 + 1}` }, { j: 'tot', fmt: 'rp' }); AK.r++;
  AK.note('Jabatan yang belum ada di master Jabatan (job level) tidak dibiayai (Manpower = 0), sama dengan web — tambahkan di master lalu export ulang.');
  // biaya per orang di Man Power Summary
  for (const z of mpRows) {
    AK.put(9, { f: `V${z.row}*Y${z.row}*(1+Fee)` }, { j: 'out', fmt: 'rp' }, z.sumRow);
    AK.put(10, { f: `I${z.sumRow}*H${z.sumRow}` }, { j: 'out', fmt: 'rp' }, z.sumRow);
  }
  // baris biaya manpower → Rincian biaya (Hasil)
  for (const z of mpRows) {
    const role0 = z.jenis === 'Direct' ? pd.mp[z.idx - 1]?.nama : z.jenis === 'Indirect' ? a.roleSupervisor : a.peranTetap[z.idx - 1]?.roleName;
    const p = role0 ? h.manpower.find(y => y.roleName === role0 && y.jenis === z.jenis) : undefined;
    const key = p ? `Manpower — ${p.roleName} (${p.headcount} org)` : '';
    const r = z.row;
    x.lines.push({ kel: 'Manpower', tahap: 1, desk: { f: `IF(${SN}B${r}="","","Manpower — "&${SN}B${r}&" ("&${SN}W${r}&" org)")`, v: key }, deskKey: key,
      jenis: 'Opex', risk: 'Sedang', sistem: `${SN}$AB$${r}`, alok: BUCKETS.map((_, k) => ({ f: `${SN}${R(31 + k, r)}` })), dasar: h.biaya.find(b0 => b0.deskripsi === key)?.dasar ?? '',
      v: p?.biayaBulan, qty: { f: `${SN}W${r}` }, harga: { f: `${SN}V${r}*(1+Fee)` }, uom: 'orang' });
  }
  x.mpRows = mpRows;

  // ===================== Rincian per task
  AK.r++;
  AK.h2('Rincian per task', 'Satu baris per resource: equipment, tiap alat pendukung, lalu role. Workload = volume × % · RfR = workload ÷ (prod × faktor) · Man hour = RfR ÷ efisiensi · FTE = man hour ÷ (man hours tersedia × operating).');
  AK.hdr(['No', 'Task', 'Workload driver', 'Equipment / role', 'Resources', 'Arus', ['Volume/bln', false, 'Volume dipakai di Aktivitas (VSM)'], 'UoM', ['%', false, '% volume dipakai di VSM'], ['Workload', false, 'Volume × %'],
    ['Productivity', false, 'Prod/jam × faktor produktivitas'], ['RfR (MH)', false, 'Workload ÷ productivity'], 'Efficiency', ['Man hour', false, 'RfR ÷ efisiensi'], ['Man hours tersedia', false, 'Man Power: JamMP · Equipment: JamMHE (Key assumption)'],
    ['Operating', false, 'Equipment: jumlah shift aktif (alat dipakai bergantian) · Man Power: 1'], ['FTE', false, 'Man hour ÷ (man hours tersedia × operating)'], 'Prod. per man', ['Alat pertama?', false, '1 = baris pertama alat ini (dasar daftar MHE Summary)'], 'No alat']);
  const pr0 = AK.r;
  const pending: { r: number; i: number; jenis: 'E' | 'A' | 'M'; k: number }[] = [];
  aktRows.forEach((_, i) => {
    pending.push({ r: AK.r++, i, jenis: 'E', k: 0 });
    for (let k = 1; k <= nAlat[i]; k++) pending.push({ r: AK.r++, i, jenis: 'A', k });
    pending.push({ r: AK.r++, i, jenis: 'M', k: 0 });
  });
  const pr1 = AK.r - 1;
  AK.nmR('PD_Res', 4, pr0, pr1); AK.nmR('PD_Jenis', 5, pr0, pr1); AK.nmR('PD_Arus', 6, pr0, pr1); AK.nmR('PD_MH', 14, pr0, pr1); AK.nmR('PD_FTE', 17, pr0, pr1); AK.nmR('PD_EqIdx', 20, pr0, pr1);
  AK.put(1, 'Total', { j: 'tot' }); AK.put(4, '', { j: 'tot' });
  AK.put(14, { f: `SUM(N${pr0}:N${pr1})` }, { j: 'tot', fmt: 'n0' }); AK.put(17, { f: `SUM(Q${pr0}:Q${pr1})` }, { j: 'tot', fmt: 'n2' });
  AK.r++;
  AK.field('Jumlah alat dari aktivitas', { f: 'IFERROR(MAX(PD_EqIdx),0)' }, 'n0', 'out', 'alat', '', 'PdEqN');
  AK.field('Man hour inbound', { f: 'SUMIFS(PD_MH,PD_Arus,"inbound",PD_Res,"<>")' }, 'n1', 'out', 'jam', 'dipakai bobot workload gabungan per shift (Key assumption)', 'JamArus_in');
  AK.field('Man hour outbound', { f: 'SUMIFS(PD_MH,PD_Arus,"outbound",PD_Res,"<>")' }, 'n1', 'out', 'jam', '', 'JamArus_out');
  AK.field('Man hour storage', { f: 'SUMIFS(PD_MH,PD_Arus,"storage",PD_Res,"<>")' }, 'n1', 'out', 'jam', '', 'JamArus_sto');
  AK.field('Man hour VAS', { f: 'SUMIFS(PD_MH,PD_Arus,"vas",PD_Res,"<>")' }, 'n1', 'out', 'jam', '', 'JamArus_vas');
  AK.field('Man hour total', { f: 'JamArus_in+JamArus_out+JamArus_sto+JamArus_vas' }, 'n1', 'out', 'jam', '', 'JamArus_tot');

  // ===================== Matriks multi-skill
  AK.r++;
  AK.h2('Matriks multi-skill (siapa boleh merangkap siapa)', 'Gunanya: menentukan jumlah orang per shift. Sisa FTE (pecahan) sebuah role boleh dikerjakan orang role lain yang masih punya sisa waktu HANYA bila di matriks ini "boleh". Makin banyak "Ya", makin sedikit orang (lebih efisien) — sesuaikan dengan kompetensi & SOP.');
  AK.note('Isi sel: Default = aturan khusus per role (bila ada) atau aturan standar · hasil akhirnya di "Matriks efektif" (kanan) · Ya = boleh · Tidak = tidak boleh. Default: Checker ↔ Picker ↔ Operator RT/CB; Admin hanya Picker & Checker; Operator hanya sesama operator; TKBM & Helper (non-karyawan) tidak merangkap dan tidak dirangkap.');
  AK.note('Contoh: Picker FTE 0,85 di satu shift → 0 orang tetap + sisa 0,85. Bila Operator Reach Truck masih punya sisa waktu ≥ 0,85 dan boleh merangkap Picker → Picker dirangkap (0 orang). Bila tidak → +1 orang Picker.');
  // Aturan khusus per nama role (sama dengan matriks yang disimpan di web). Role yang punya aturan di sini HANYA boleh merangkap role yang terdaftar.
  AK.h3('Aturan khusus per role (dari web, berdasarkan nama — tetap benar walau urutan role berubah)');
  AK.hdr([['Role yang merangkap', true], ['Boleh merangkap role', true], 'Keterangan']);
  const rk0 = AK.r;
  const aturan = Object.entries(x.pdIn.rangkap ?? {}).flatMap(([ra, lst]) => lst.length ? lst.map(rb => [ra, rb]) : [[ra, '(tidak ada)']]);
  for (const [ra, rb] of [...aturan, ...Array.from({ length: 8 }, () => [null, null])]) {
    const r = AK.r;
    AK.put(1, ra, { j: 'in' }); AK.dd(1, 'L_Role', false); AK.put(2, rb, { j: 'in' }); AK.dd(2, 'L_Role', false);
    AK.put(3, { f: `IF(A${r}="","",A${r}&" boleh mengerjakan sisa FTE "&B${r})` }, { j: 'txt', size: 9 });
    AK.r++;
  }
  AK.nmR('Rk_A', 1, rk0, AK.r - 1); AK.nmR('Rk_B', 2, rk0, AK.r - 1);
  AK.note('Role yang tidak punya aturan di atas memakai aturan default per kategori (tabel "Aturan rangkap default" di sheet Daftar). Tabel di bawah: isi Ya / Tidak untuk mengubah satu pasangan dengan cepat (mengalahkan aturan di atas).');
  AK.r++;
  const mat0 = AK.r + 1;
  const cEf = N + 4;   // kolom awal matriks efektif
  AK.hdr(['Merangkap ↓ / dirangkap →', ...Array.from({ length: N }, () => '')]);
  AK.put(cEf - 1, '', { j: 'none' }, mat0 - 1);
  AK.put(cEf, 'Matriks efektif (1 = boleh)', { j: 'hdr', al: 'center' }, mat0 - 1);
  for (let j = 1; j <= N; j++) {
    AK.put(1 + j, { f: `INDEX(MpRole,${j})`, v: pd.mp[j - 1]?.nama ?? '' }, { j: 'hdr', al: 'center' }, mat0 - 1);
    AK.put(cEf + j, { f: `INDEX(MpRole,${j})` }, { j: 'hdr', al: 'center' }, mat0 - 1);
  }
  for (let i = 1; i <= N; i++) {
    const r = AK.r; const ra = pd.mp[i - 1]?.nama;
    AK.put(1, { f: `INDEX(MpRole,${i})`, v: ra ?? '' }, { j: 'txt', b: true });
    AK.put(cEf, { f: `INDEX(MpRole,${i})` }, { j: 'txt', b: true });
    for (let j = 1; j <= N; j++) {
      const rb = pd.mp[j - 1]?.nama;
      if (i === j) AK.put(1 + j, '—', { j: 'out', al: 'center' });
      else { AK.put(1 + j, 'Default', { j: 'in', al: 'center' }); AK.dd(1 + j, 'L_Rangkap'); }
      const ki = `INDEX(PoolKat,${i})`, kj = `INDEX(PoolKat,${j})`;
      AK.put(cEf + j, { f: i === j ? `IF(INDEX(MpRole,${i})="",0,1)` : `IF(OR(INDEX(MpRole,${i})="",INDEX(MpRole,${j})=""),0,IF(OR(INDEX(PoolTk,${i})=1,INDEX(PoolTk,${j})=1),0,IF(${R(1 + j, r)}="Ya",1,IF(${R(1 + j, r)}="Tidak",0,IF(COUNTIF(Rk_A,INDEX(MpRole,${i}))>0,IF(COUNTIFS(Rk_A,INDEX(MpRole,${i}),Rk_B,INDEX(MpRole,${j}))>0,1,0),IFERROR(INDEX(D_RkGrid,MATCH(${ki},D_RkKat,0),MATCH(${kj},D_RkKol,0)),0))))))` }, { j: 'out', fmt: 'n0', al: 'center' });
    }
    AK.r++;
  }
  AK.wb.definedNames.add(`${SN}${A(cEf + 1, mat0)}:${A(cEf + N, mat0 + N - 1)}`, 'MatEf');

  // ===================== Perhitungan multi-skill pooling (rumus, sama dengan algoritma web)
  AK.r++;
  AK.h2('Perhitungan multi-skill pooling per shift', 'Langkah (sama dengan web): 1) FTE shift = Σ FTE role per arus × % workload arus di shift itu. 2) Orang tetap = bagian bulat FTE (TKBM/Helper: dibulatkan ke atas, tidak dirangkap). 3) Sisa (pecahan) diurutkan dari terbesar. 4) Tiap sisa ditumpangkan ke orang yang sudah ada, masih punya sisa waktu ≥ sisa tsb & boleh merangkap (matriks) — dipilih yang sisa waktunya paling kecil; bila tidak ada → +1 orang baru (sisa waktunya = 1 − sisa).');
  AK.h3('Data role');
  AK.hdr(['No', 'Role', ['Kategori', false, 'Dari nama role: admin / operator / checker / picker / nonkaryawan (TKBM, helper) / lain'], ['TKBM / helper?', false, '1 = non-karyawan: dibulatkan sendiri, tidak merangkap/dirangkap'],
    ['FTE inbound', false, 'SUMIFS FTE role arus inbound (Rincian per task)'], 'FTE outbound', 'FTE storage + VAS', ['Status', false, 'Dipakai Remarks di Man Power Summary']]);
  const dr0 = AK.r;
  for (let i = 1; i <= N; i++) {
    const r = AK.r;
    AK.put(1, i, { j: 'txt', fmt: 'n0' });
    AK.put(2, { f: `INDEX(MpRole,${i})` }, { j: 'txt', b: true });
    const fk = fKat(`B${r}`);
    AK.put(3, { f: fk.kat }, { j: 'out' });
    AK.put(4, { f: `IF(C${r}="nonkaryawan",1,0)` }, { j: 'out', fmt: 'n0' });
    const fa = (ar: string) => `IF(B${r}="",0,SUMIFS(PD_FTE,PD_Res,B${r},PD_Jenis,"Man Power",PD_Arus,"${ar}"))`;
    AK.put(5, { f: fa('inbound') }, { j: 'out', fmt: 'n3' }); AK.put(6, { f: fa('outbound') }, { j: 'out', fmt: 'n3' }); AK.put(7, { f: `${fa('storage')}+${fa('vas')}` }, { j: 'out', fmt: 'n3' });
    const hs = (s: number) => `INDEX(Pool_H${s},${i})`;
    const hosts = `MID(IF(${hs(1)}<>"",", "&${hs(1)},"")&IF(AND(${hs(2)}<>"",${hs(2)}<>${hs(1)}),", "&${hs(2)},"")&IF(AND(${hs(3)}<>"",${hs(3)}<>${hs(1)},${hs(3)}<>${hs(2)}),", "&${hs(3)},""),3,200)`;
    const anyM = `INDEX(Pool_M1,${i})&INDEX(Pool_M2,${i})&INDEX(Pool_M3,${i})<>""`;
    AK.put(8, { f: `IF(B${r}="","",IF(D${r}=1,IF(OR(ISNUMBER(SEARCH("helper",B${r})),ISNUMBER(SEARCH("daily",B${r})),ISNUMBER(SEARCH("harian",B${r}))),"Daily worker","TKBM"),IF(INDEX(MpFte,${i})<=1E-9,"Tidak ada workload",IF(INDEX(MpRes,${i})=0,"Dirangkap "&${hosts},IF(${anyM},"Direct · multi-skill",IF(${hosts}<>"","Direct · sisa dirangkap "&${hosts},"Direct"))))))` }, { j: 'out', size: 9 });
    AK.r++;
  }
  AK.nmR('PoolKat', 3, dr0, AK.r - 1); AK.nmR('PoolTk', 4, dr0, AK.r - 1); AK.nmR('PoolStatus', 8, dr0, AK.r - 1);
  for (let s = 1; s <= 3; s++) {
    AK.r++;
    AK.h3(`Shift ${s}`);
    AK.field(`Workload gabungan shift ${s}`, { f: `INDEX(BebanGab,${s})` }, 'pct', 'out', '', '0% = shift tidak aktif (semua 0 orang)');
    const c0 = 12;   // tabel langkah mulai kolom L
    AK.hdr(['Role', ['FTE shift', false, `FTE inbound × % inbound shift ${s} + FTE outbound × % outbound + FTE storage/VAS × % storage (dinormalkan)`], ['Orang tetap', false, 'INT(FTE shift) · TKBM: ROUNDUP'], ['Sisa FTE', false, 'FTE shift − orang tetap (bila > 0,000001)'],
      ['Urutan', false, 'Urutan sisa dari terbesar (sama besar → urutan role)'], ['+1 orang baru', false, '1 bila sisanya tidak bisa ditumpangkan ke orang lain'], ['Dirangkap oleh', false, 'Role yang menampung sisa FTE ini'], ['Merangkap', false, 'Sisa FTE role lain yang ditampung orang baru role ini'], ['Orang shift ini', false, 'Orang tetap + orang baru'], 'Keterangan', '',
      ['Langkah', false, 'Diproses berurutan dari sisa terbesar'], 'Role', 'Sisa', ...Array.from({ length: N }, (_, j) => [`Kandidat ${j + 1}`, false, `Sisa waktu orang dari langkah ${j + 1} bila boleh & cukup; 9 = tidak bisa`] as [string, boolean, string]),
      ['Kandidat terkecil', false, 'MIN kandidat (best fit)'], ['Dipilih (langkah)', false, '0 = tidak ada → orang baru'], 'Dirangkap oleh', 'Orang baru?', ...Array.from({ length: N }, (_, j) => [`Sisa waktu orang ${j + 1}`, false, `Sisa kapasitas orang baru dari langkah ${j + 1} setelah langkah ini`] as [string, boolean, string])], 1);
    const rb0 = AK.r, rb1 = rb0 + N - 1;
    const cand = (j: number) => c0 + 2 + j, cMin = c0 + 3 + N, cPick = c0 + 4 + N, cHost = c0 + 5 + N, cBaru = c0 + 6 + N, cap = (j: number) => c0 + 6 + N + j;
    for (let i = 1; i <= N; i++) {
      const r = rb0 + i - 1, dr = dr0 + i - 1;
      // ---- tabel role
      AK.put(1, { f: `INDEX(MpRole,${i})` }, { j: 'txt', b: true }, r);
      AK.put(2, { f: `IF(OR(A${r}="",INDEX(BebanGab,${s})<=0),0,E${dr}*INDEX(BebanIn,${s})+F${dr}*INDEX(BebanOut,${s})+G${dr}*INDEX(BebanSto,${s}))` }, { j: 'out', fmt: 'n3' }, r);
      AK.put(3, { f: `IF(B${r}<=1E-9,0,IF(D${dr}=1,ROUNDUP(B${r}-1E-9,0),INT(B${r}+1E-9)))` }, { j: 'out', fmt: 'n0' }, r);
      AK.put(4, { f: `IF(OR(B${r}<=1E-9,D${dr}=1),0,IF(B${r}-INT(B${r}+1E-9)>1E-6,B${r}-INT(B${r}+1E-9),0))` }, { j: 'out', fmt: 'n3' }, r);
      AK.put(5, { f: `SUMPRODUCT(--($D$${rb0}:$D$${rb1}>D${r}))+SUMPRODUCT(($D$${rb0}:$D$${rb1}=D${r})*(ROW($D$${rb0}:$D$${rb1})<ROW(D${r})))+1` }, { j: 'out', fmt: 'n0' }, r);
      AK.put(6, { f: `INDEX(${A(cBaru, rb0)}:${A(cBaru, rb1)},E${r})` }, { j: 'out', fmt: 'n0' }, r);
      AK.put(7, { f: `INDEX(${A(cHost, rb0)}:${A(cHost, rb1)},E${r})` }, { j: 'out' }, r);
      const mr = Array.from({ length: N }, (_, k) => `IF(${A(cPick, rb0 + k)}=E${r},${A(c0 + 1, rb0 + k)}&" ("&FIXED(${A(c0 + 2, rb0 + k)},2)&"), ","")`).join('&');
      AK.put(8, { f: `IFERROR(LEFT(${mr},LEN(${mr})-2),"")` }, { j: 'out', size: 9 }, r);
      AK.put(9, { f: `C${r}+F${r}` }, { j: 'out', fmt: 'n0', b: true }, r);
      AK.put(10, { f: `IF(B${r}<=1E-9,""," · S${s}: FTE "&FIXED(B${r},2)&IF(D${dr}=1," → "&C${r}&" orang (ROUNDUP, non-karyawan)"," → "&C${r}&" tetap"&IF(F${r}=1," +1 orang (sisa "&FIXED(D${r},2)&")","")&IF(G${r}<>""," · sisa "&FIXED(D${r},2)&" dirangkap "&G${r},"")&IF(H${r}<>""," · merangkap "&H${r},"")))` }, { j: 'out', size: 8 }, r);
      // ---- tabel langkah (langkah k = i)
      const k = i;
      AK.put(c0, k, { j: 'txt', fmt: 'n0' }, r);
      AK.put(c0 + 1, { f: `IFERROR(INDEX($A$${rb0}:$A$${rb1},MATCH(${k},$E$${rb0}:$E$${rb1},0)),"")` }, { j: 'out' }, r);
      AK.put(c0 + 2, { f: `IFERROR(INDEX($D$${rb0}:$D$${rb1},MATCH(${k},$E$${rb0}:$E$${rb1},0)),0)` }, { j: 'out', fmt: 'n3' }, r);
      for (let j = 1; j <= N; j++) {
        if (j >= k) { AK.put(cand(j), 9, { j: 'out', fmt: 'n0', color: 'FF9CA3AF' }, r); continue; }
        const rj = rb0 + j - 1, prev = R(cap(j), r - 1);
        AK.put(cand(j), { f: `IFERROR(IF(AND(${R(c0 + 2, r)}>1E-6,${R(cBaru, rj)}=1,INDEX(MatEf,MATCH(${R(c0 + 1, rj)},MpRole,0),MATCH(${R(c0 + 1, r)},MpRole,0))=1,${prev}>=${R(c0 + 2, r)}-1E-9),${prev},9),9)` }, { j: 'out', fmt: 'n3' }, r);
      }
      AK.put(cMin, { f: `MIN(${R(cand(1), r)}:${R(cand(N), r)})` }, { j: 'out', fmt: 'n3' }, r);
      AK.put(cPick, { f: `IF(${R(cMin, r)}<9,MATCH(${R(cMin, r)},${R(cand(1), r)}:${R(cand(N), r)},0),0)` }, { j: 'out', fmt: 'n0' }, r);
      AK.put(cHost, { f: `IF(${R(cPick, r)}>0,INDEX(${A(c0 + 1, rb0)}:${A(c0 + 1, rb1)},${R(cPick, r)}),"")` }, { j: 'out' }, r);
      AK.put(cBaru, { f: `IF(AND(${R(c0 + 2, r)}>1E-6,${R(cPick, r)}=0),1,0)` }, { j: 'out', fmt: 'n0' }, r);
      for (let j = 1; j <= N; j++) {
        const f = j < k ? `${R(cap(j), r - 1)}-IF(${R(cPick, r)}=${j},${R(c0 + 2, r)},0)` : j === k ? `IF(${R(cBaru, r)}=1,1-${R(c0 + 2, r)},0)` : null;
        AK.put(cap(j), f ? { f } : 0, { j: 'out', fmt: 'n3', color: f ? undefined : 'FF9CA3AF' }, r);
      }
    }
    AK.r = rb1 + 1;
    AK.nmR(`Pool_O${s}`, 9, rb0, rb1); AK.nmR(`Pool_H${s}`, 7, rb0, rb1); AK.nmR(`Pool_M${s}`, 8, rb0, rb1); AK.nmR(`Pool_K${s}`, 10, rb0, rb1);
  }

  // ===================== Indirect & peran tetap
  AK.r++;
  AK.h2('Indirect & peran tetap', 'Supervisor otomatis = ROUNDUP(direct per shift ÷ span) × shift aktif — kecuali role supervisor sudah diisi di tabel peran tetap. Span 0 = mematikan perhitungan otomatis. Peran tetap: Headcount + Basis (per shift / total). Alat pendukung 1 unit per orang (pisahkan koma) → MHE Summary.');
  AK.field('Span of control', a.spanOfControl, 'n0', 'in', 'direct per supervisor', 'umumnya 10–20', 'Span');
  AK.field('Role supervisor (hanya role SPV / Leader / Manager)', a.roleSupervisor, 'teks', 'in', '', '', 'RoleSpv', 'L_Spv', false);
  AK.field('Alat pendukung supervisor', (a.alatSupervisor ?? []).join(', '), 'teks', 'in', '', 'mis. PC, HT', 'AlatSpv');
  AK.hdr([['Role', true], ['Headcount', true], ['Basis', true], ['Total orang', false, 'Headcount × shift aktif (per shift) atau headcount (total)'], ['Alat pendukung', true], ['Alokasi biaya', true]]);
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
  // alat pendukung indirect yang tidak dipakai aktivitas → tambahan baris MHE Summary
  AK.r++;
  AK.h3('Alat pendukung indirect (dasar tambahan MHE Summary)');
  AK.hdr(['Sumber', 'Alat', ['Aktif?', false, 'Alat terisi dan sumbernya ada (supervisor > 0 / role peran tetap terisi)'], ['Sudah di aktivitas?', false, 'Alat sudah muncul sebagai equipment di Rincian per task'], 'Baru?', 'No']);
  const tk0 = AK.r;
  const sumber: [string, string, string][] = [];
  for (let k2 = 1; k2 <= 3; k2++) sumber.push(['Supervisor', 'AlatSpv', 'SpvQty>0']);
  ptRows.forEach((_, j) => { for (let k2 = 1; k2 <= 3; k2++) sumber.push([`Peran tetap ${j + 1}`, `PT_${j + 1}_Alat`, `PT_${j + 1}_Role<>""`]); });
  sumber.forEach(([lab, src, syarat], i) => {
    const r = AK.r, kk = (i % 3) + 1;
    AK.put(1, lab, { j: 'txt', size: 9 });
    AK.put(2, { f: `TRIM(MID(SUBSTITUTE(${src},",",REPT(" ",200)),${(kk - 1) * 200 + 1},200))` }, { j: 'out' });
    AK.put(3, { f: `IF(AND(B${r}<>"",${syarat}),1,0)` }, { j: 'out', fmt: 'n0' });
    AK.put(4, { f: `IF(B${r}="",0,IF(COUNTIFS(PD_Res,B${r},PD_Jenis,"Equipment")>0,1,0))` }, { j: 'out', fmt: 'n0' });
    AK.put(5, { f: `IF(AND(C${r}=1,D${r}=0,COUNTIFS($B$${tk0}:B${r},B${r},$C$${tk0}:C${r},1)=1),1,0)` }, { j: 'out', fmt: 'n0' });
    AK.put(6, { f: `IF(E${r}=1,COUNTIF($E$${tk0}:E${r},1),"")` }, { j: 'out', fmt: 'n0' });
    AK.r++;
  });
  AK.nmR('Tok_Name', 2, tk0, AK.r - 1); AK.nmR('Tok_Idx', 6, tk0, AK.r - 1);

  // ===================== Aktivitas (VSM) & manpower
  AK.r++;
  AK.h2('Aktivitas (VSM) & manpower', 'Kolom input (putih tulang) bisa diubah; semua kolom hasil (abu-abu) & sheet lain ikut berubah otomatis. Volume/bln kosong = volume peak arus × pengali efektif (admin: order dari Profil order). Kolom bantu di kanan menunjukkan langkah rumusnya.');
  AK.hdr(['Urutan', ['Task / tahap', true], ['Aktivitas (workload driver)', true], ['Equipment', true], ['Alat pendukung', true, 'Pisahkan dengan koma'], ['Role (man power)', true], ['Prod/jam', true], ['UoM', true], ['Arus', true],
    ['Volume/bln (manual)', true, 'Kosong = volume auto'], ['Sumber % volume', true, '% manual atau ikut porsi palletize/loose (Key assumption)'], ['% manual', true], ['% volume dipakai', false, '% manual, atau porsi proses (palet / loose = 1 − palet; replenishment × (1 − porsi picking palet))'],
    ['Pengali UoM', true, '≠ 1 dipakai langsung; 1 = pakai konversi di sheet Volume'], ['Volume auto', false, 'Admin (order/line): order/bln profil ÷ jumlah aktivitas admin di arus itu · lainnya: peak arus × pengali efektif'], ['Volume dipakai', false, 'Manual bila diisi, kosong = volume auto'],
    ['Prod DB', false, 'Produktivitas di database Productivity (bila aktivitas dari DB)'], 'Status vs DB', 'Id DB', ['Admin?', false, 'Role mengandung "admin", UoM order/line/dokumen, arus inbound/outbound'], 'Proses', 'Muat',
    ['Baris volume', false, 'Nomor baris arus ini di tabel Volume'], ['UoM arus', false, 'UoM volume arus (dinormalkan: case/karton/dus = case)'], ['UoM aktivitas', false, 'UoM aktivitas (dinormalkan)'], ['Isi palet', false, '1 palet = … case (Volume)'],
    ['Isi per UoM', false, 'per1 (Volume)'], 'UoM isi', ['Isi kecil', false, 'per2 (Volume)'], 'UoM kecil', ['Faktor UoM', false, 'Sama = 1 · case→palet = 1 ÷ isi palet · UoM isi = isi per UoM · UoM kecil = isi × isi kecil · x = tidak dikenal'],
    ['Pengali efektif', false, 'Pengali manual bila ≠ 1, kalau tidak faktor UoM (x → 1)'], ['Peak arus', false, 'Peak efektif arus (Volume)'], ['Role pertama?', false, '1 = baris pertama role ini (dasar daftar Man Power Summary)'], 'No role', ['Bobot alat', false, 'Peak × % × pengali ÷ prod — dasar alokasi biaya MHE per arus (sama dengan web)']]);
  const vs0 = AK.r, vs1 = vs0 + aktRows.length - 1;
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
    // kolom bantu
    AK.put(19, (z as { productivityId?: number } | null)?.productivityId ?? null, { j: 'out', fmt: 'n0' });
    const adm = ['order', 'line', 'dokumen', 'doc', 'do', 'transaksi'].map(u => `LOWER(TRIM(H${r}))="${u}"`).join(',');
    AK.put(20, { f: `IF(AND(ISNUMBER(SEARCH("admin",F${r})),OR(${adm}),OR(I${r}="inbound",I${r}="outbound")),1,0)`, v: z && isAktivitasAdmin(z) ? 1 : 0 }, { j: 'out', fmt: 'n0' });
    AK.put(21, { f: `IF(OR(K${r}="% manual",K${r}=""),"",IFERROR(INDEX(D_TagProses,MATCH(K${r},D_TagLabel,0)),""))` }, { j: 'out' });
    AK.put(22, { f: `IF(OR(K${r}="% manual",K${r}=""),"",IFERROR(INDEX(D_TagMuat,MATCH(K${r},D_TagLabel,0)),""))` }, { j: 'out' });
    AK.put(23, { f: `IFERROR(MATCH(I${r},Vol_Arus,0),0)` }, { j: 'out', fmt: 'n0' });
    const ix = (nm: string) => `IF(W${r}=0,"",INDEX(${nm},W${r}))`;
    AK.put(24, { f: ix('Vol_nU') }, { j: 'out' }); AK.put(25, { f: normU(`H${r}`) }, { j: 'out' });
    AK.put(26, { f: `N(${ix('Vol_PaletIsi')})` }, { j: 'out', fmt: 'n0' }); AK.put(27, { f: `N(${ix('Vol_Per1')})` }, { j: 'out', fmt: 'n2' }); AK.put(28, { f: ix('Vol_nU1') }, { j: 'out' });
    AK.put(29, { f: `N(${ix('Vol_Per2')})` }, { j: 'out', fmt: 'n2' }); AK.put(30, { f: ix('Vol_nU2') }, { j: 'out' });
    const umum = `IF(AND(AB${r}=Y${r},AA${r}>0),AA${r},IF(AND(AD${r}=Y${r},AA${r}>0,AC${r}>0),AA${r}*AC${r},"x"))`;
    AK.put(31, { f: `IF(W${r}=0,"x",IF(Y${r}=X${r},1,IF(X${r}="case",IF(${isPal(`H${r}`)},IF(Z${r}>0,1/Z${r},"x"),IF(AND(AD${r}=Y${r},AC${r}>0),AC${r},${umum})),${umum})))` }, { j: 'out', fmt: 'x' });
    AK.put(32, { f: `IF(AND(N(N${r})<>0,N(N${r})<>1),N${r},IF(AE${r}="x",1,AE${r}))` }, { j: 'out', fmt: 'x' });
    AK.put(33, { f: `IF(W${r}=0,0,N(INDEX(Vol_Peak,W${r})))` }, { j: 'out', fmt: 'n0' });
    const ordr = `IF(I${r}="inbound",OrderBln_in,OrderBln_out)`;
    AK.put(15, { f: `IF(AND(T${r}=1,J${r}="",${ordr}>0),${ordr}/COUNTIFS($T$${vs0}:$T$${vs1},1,$I$${vs0}:$I$${vs1},I${r},$J$${vs0}:$J$${vs1},""),AG${r}*AF${r})` }, { j: 'out', fmt: 'n0' });
    AK.put(16, { f: `IF(J${r}<>"",J${r},O${r})`, v: pd.baris.find(b => b.no === i + 1)?.volume }, { j: 'out', fmt: 'n0', b: true });
    AK.put(17, { f: `IF(S${r}="","",IFERROR(INDEX(D_ProdProd,MATCH(S${r},D_ProdId,0)),""))` }, { j: 'out', fmt: 'n2' });
    AK.put(18, { f: `IF(Q${r}="","manual",IF(AND(Q${r}=G${r},IFERROR(INDEX(D_ProdRole,MATCH(S${r},D_ProdId,0)),"")=F${r},IFERROR(INDEX(D_ProdTool,MATCH(S${r},D_ProdId,0)),"")=D${r},IFERROR(INDEX(D_ProdUom,MATCH(S${r},D_ProdId,0)),"")=H${r}),"sama","beda dengan DB"))` }, { j: 'out', size: 9 });
    AK.put(34, { f: `IF(AND(F${r}<>"",COUNTIF($F$${vs0}:F${r},F${r})=1),1,0)` }, { j: 'out', fmt: 'n0' });
    AK.put(35, { f: `IF(AH${r}=1,COUNTIF($AH$${vs0}:AH${r},1),"")` }, { j: 'out', fmt: 'n0' });
    AK.put(36, { f: `IF(OR(D${r}="",D${r}="Manual",N(G${r})<=0),0,AG${r}*M${r}*AF${r}/G${r})` }, { j: 'out', fmt: 'n2' });
    AK.r++;
  });
  AK.nmR('VSM_Role', 6, vs0, vs1); AK.nmR('VSM_RoleNo', 35, vs0, vs1); AK.nmR('VSM_Tool', 4, vs0, vs1); AK.nmR('VSM_Arus', 9, vs0, vs1); AK.nmR('VSM_Bobot', 36, vs0, vs1);
  AK.note(`${a.aktivitas.length} aktivitas + 5 baris kosong untuk tambahan. Role / alat baru di VSM otomatis masuk Man Power Summary, MHE Summary, pooling & biaya (selama slot masih ada: ${N} role, ${M} alat).`);
  // Rincian per task — rumus (rujuk baris VSM)
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
    AK.put(19, alat ? { f: `IF(AND(D${r}<>"",COUNTIFS($D$${pr0}:D${r},D${r},$E$${pr0}:E${r},"Equipment")=1),1,0)` } : 0, { j: 'out', fmt: 'n0' }, r);
    AK.put(20, { f: `IF(S${r}=1,COUNTIF($S$${pr0}:S${r},1),"")` }, { j: 'out', fmt: 'n0' }, r);
  }
}
