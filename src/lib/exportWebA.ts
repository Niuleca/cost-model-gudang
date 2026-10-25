// Sheet "Key assumption" & "Volume" — urutan kartu sama dengan tab web.
import { R, A, q, isCase, type Ctx } from '@/lib/exportWebUtil';
import { PROSES_MUAT, PORSI_MUAT_DEFAULT } from '@/lib/porsiMuat';
import { PARAM_DEFAULT, KENDARAAN_DEFAULT, KENDARAAN_AWAL, MODA, MUATAN, isKontainer, muatanBaris } from '@/lib/profilVolume';
import { volumeEfektif } from '@/lib/engine/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function tulisKeyAssumption(x: Ctx) {
  const { KA, d, a, pdIn, pd } = x;
  const t = d.t, inp = d.inp;
  KA.lebar(46, 24, 14, 16, 16, 14, 12, 12, 12, 12, 12);
  KA.h2('Key assumption', 'Sel putih tulang = input (boleh diubah) · sel abu-abu = hasil rumus · droplist sama dengan web');
  KA.field('Customer', t.customer, 'teks', 'in', '', '', 'Cust');
  KA.field('Industri (benchmark produktivitas)', t.industri || '—', 'teks', 'in', '', '', 'Industri', 'L_Industri');
  KA.field('PIC / account', t.pic ?? '', 'teks', 'in');
  KA.field('Alamat / site', t.alamat_lokasi ?? '', 'teks', 'in');
  KA.field('Provinsi project', t.provinsi, 'teks', 'in', '', 'pilih provinsi → daftar kab/kota menyesuaikan', 'Prov', 'L_Prov');
  KA.field('Area / kab-kota (menentukan UMK)', t.kab_kota, 'teks', 'in', '', 'pilihan hanya kab/kota di provinsi terpilih', 'Kab', 'OFFSET(D_UpKab,MATCH(Prov,D_UpProv,0)-1,0,COUNTIF(D_UpProv,Prov),1)');
  KA.field('UMK area project', { f: 'SUMIFS(D_UpUmk,D_UpProv,Prov,D_UpKab,Kab)', v: d.m.upahMinimum }, 'rp', 'out', 'Rp/bln', '→ dari master UMK · dipakai sebagai gaji pokok default di Rincian biaya manpower', 'UMK');
  KA.field('Status UMK', { f: `IFERROR(INDEX(D_UpStatus,MATCH(1,INDEX((D_UpProv=Prov)*(D_UpKab=Kab),0),0)),"Asumsi")`, v: d.m.statusUpah }, 'teks', 'out');
  KA.field('Skema', t.skema, 'teks', 'in', '', '', 'Skema', 'L_Skema');
  KA.field('Skenario aset', t.skenario_aset, 'teks', 'in', '', 'Rental = sewa gudang dihitung', 'Aset', 'L_Aset');
  KA.field('Durasi kontrak', t.durasi_kontrak_bulan, 'n0', 'in', 'bulan', 'dipakai untuk depresiasi, amortisasi, interest & eskalasi', 'Kontrak');
  const gl = t.tanggal_go_live ? t.tanggal_go_live.split('-').map(Number) : null;
  KA.field('Go-live (menentukan tahun kalender & UMK)', gl ? { f: `DATE(${gl[0]},${gl[1]},${gl[2]})`, v: t.tanggal_go_live } : null, 'tgl', 'in', '', 'kosong = tahun berjalan', 'GoLive');
  KA.field('Tahun kalender', { f: 'IF(GoLive="",YEAR(TODAY()),YEAR(GoLive))', v: inp.tahun }, 'teks', 'out', '', '', 'Tahun');
  KA.field('Jumlah shift', t.jumlah_shift, 'n0', 'in', 'shift', '', 'Shift', 'L_Shift');
  KA.field('Hari kerja per minggu', t.hari_kerja_per_minggu, 'n0', 'in', 'hari', '5 = Senin–Jumat · 6 = Senin–Sabtu · 7 = setiap hari', 'HariMinggu', 'L_HariMinggu');
  KA.field('Kode akhir pekan (otomatis)', { f: 'CHOOSE(MAX(1,MIN(3,HariMinggu-4)),"0000011","0000001","0000000")' }, 'teks', 'out', '', 'dipakai NETWORKDAYS.INTL', 'WeekendKode');
  KA.field('Jam kerja per shift', Number(t.jam_kerja_per_shift), 'n2', 'in', 'jam');
  KA.field('Jam efektif per shift', Number(t.jam_efektif_per_shift), 'n2', 'in', 'jam', 'Setelah istirahat, briefing, ganti baterai', 'JamEfektif');
  KA.field('Payment term', t.payment_term_hari, 'n0', 'in', 'hari', '', 'PaymentTerm');
  KA.field('Cuti tahunan per orang', a.cutiTahunanHari, 'n0', 'in', 'hari', 'Masuk ke faktor pengganti headcount', 'Cuti');
  KA.field('Faktor produktivitas', a.faktorProduktivitas, 'pct', 'in', '', 'pengali produktivitas standar', 'FProd');
  KA.field('Efisiensi kerja', a.efisiensi, 'pct', 'in', '', 'Man hour = RfR ÷ efisiensi', 'Efis');

  // ---- Workload palletize vs loose
  const pm = { ...PORSI_MUAT_DEFAULT, ...(a.porsiMuat ?? {}) };
  KA.h2('Workload palletize vs loose', 'Porsi volume palletize vs loose per proses. Aktivitas yang kolom "Sumber % volume"-nya "Porsi …" otomatis memakai angka ini. Replenishment dihitung dari volume case picking (outbound × loose picking).');
  KA.hdr(['Proses', ['Palletize', true], 'Loose', 'Keterangan', '', '', 'Kode']);
  const p0 = KA.r;
  for (const p of PROSES_MUAT) {
    const r = KA.r;
    KA.put(1, p.l, { j: 'txt', b: true }); KA.put(2, pm[p.v], { j: 'in', fmt: 'pct' }); KA.put(3, { f: `1-B${r}`, v: 1 - pm[p.v] }, { j: 'out', fmt: 'pct' });
    KA.put(4, p.v === 'replenishment' ? { f: `"${p.ket} · basis "&FIXED((1-Porsi_picking)*100,1)&"%"&" outbound"` } : p.ket, { j: 'txt', wrap: false });
    KA.put(7, p.v, { j: 'none', color: 'FF9CA3AF' });
    KA.nm(`Porsi_${p.v}`, 2);
    KA.r++;
  }
  KA.nmR('PorsiKode', 7, p0, KA.r - 1); KA.nmR('PorsiPal', 2, p0, KA.r - 1);

  // ---- Process Design
  KA.h2('Process Design & Resource Calculation', 'Matriks multi-skill (siapa boleh merangkap siapa) ada di sheet Aktivitas & manpower.');
  KA.h3('Working day');
  KA.hdr(['Working day', 'Man Power', 'MHE', 'Satuan']);
  const kr: Record<string, number> = {};
  const kal = (label: string, key: string | null, sat: string, f?: (c: number) => string, tebal = false) => {
    const r = KA.r; kr[label] = r;
    KA.put(1, label, { j: tebal ? 'tot' : 'txt' });
    for (const [c, src] of [[2, pdIn.mp], [3, pdIn.mhe]] as const) {
      if (key) KA.put(c, Number((src as any)[key]) || 0, { j: 'in', fmt: 'n2' });
      else KA.put(c, { f: f!(c) }, { j: tebal ? 'tot' : 'out', fmt: 'n2' });
    }
    KA.put(4, sat, { j: 'none', color: 'FF6B6B6B' });
    KA.r++; return r;
  };
  const rT = kal('Total hari per tahun', 'totalHari', 'hari');
  const rM = kal('Minggu (libur)', 'minggu', 'hari');
  const rC = kal('Cuti tahunan', 'cuti', 'hari');
  const rL = kal('Libur nasional', 'libur', 'hari');
  const rS = kal('Sakit / repair', 'sakit', 'hari');
  const rOff = kal('Sub total tidak kerja', null, 'hari', c => `SUM(${R(c, rM)}:${R(c, rS)})`);
  const rHt = kal('Hari kerja per tahun', null, 'hari', c => `${R(c, rT)}-${R(c, rOff)}`);
  const rHb = kal('Hari kerja per bulan', null, 'hari', c => `${R(c, rHt)}/12`);
  const rSt = kal('Sabtu kerja per tahun', 'sabtuPerTahun', 'hari');
  const rSb = kal('Sabtu per bulan', null, 'hari', c => `MIN(${R(c, rHb)},${R(c, rSt)}/12)`);
  const rWb = kal('Weekday per bulan', null, 'hari', c => `${R(c, rHb)}-${R(c, rSb)}`);
  const rJs = kal('Jam efektif Sabtu', 'jamSabtu', 'jam/hari');
  const rJw = kal('Jam efektif weekday', 'jamWeekday', 'jam/hari');
  const rMs = kal('Man hour Sabtu', null, 'jam', c => `${R(c, rSb)}*${R(c, rJs)}`);
  const rMw = kal('Man hour weekday', null, 'jam', c => `${R(c, rWb)}*${R(c, rJw)}`);
  const rJb = kal('Man hours per bulan', null, 'jam', c => `${R(c, rMs)}+${R(c, rMw)}`, true);
  KA.nm('JamMP', 2, rJb); KA.nm('JamMHE', 3, rJb); KA.nm('HariMP', 2, rHb); KA.nm('HariMHE', 3, rHb);
  void rC; void rL;
  KA.r++;
  KA.h3('Workload shift');
  KA.field('Number of working shift', { f: 'Shift', v: d.inp.jumlahShift }, 'n0', 'out', 'shift', 'ubah di Jumlah shift (atas)');
  KA.field('Working Days', pdIn.hariKerjaBulan ?? 25, 'n2', 'in', 'hari/bln', 'hari operasional gudang per bulan (profil order, ringkasan order)', 'HariKerjaBln');
  KA.field('Working Days Employee', pdIn.hariKerjaKaryawan ?? 25, 'n2', 'in', 'hari/bln', 'hari kerja default di Rincian biaya manpower', 'HariKaryawan');
  KA.field('Group', pdIn.group ?? 1, 'n0', 'in', 'group');
  KA.r++;
  KA.h3('Workload per shift');
  KA.hdr(['Shift', ['Inbound', true], ['Outbound', true], ['Storage / VAS', true], 'Gabungan', 'Aktif', 'In (norm)', 'Out (norm)', 'Sto (norm)', 'Union']);
  const bIn = pdIn.bebanShiftInbound ?? pdIn.bebanShift, bOut = pdIn.bebanShiftOutbound ?? pdIn.bebanShift, bSt = pdIn.bebanShift;
  const w0 = KA.r;
  for (let i = 0; i < 3; i++) {
    const r = KA.r;
    KA.put(1, `Shift ${i + 1}`, { j: 'txt' });
    KA.put(2, Number(bIn[i] ?? 0), { j: 'in', fmt: 'pct' }); KA.put(3, Number(bOut[i] ?? 0), { j: 'in', fmt: 'pct' }); KA.put(4, Number(bSt[i] ?? 0), { j: 'in', fmt: 'pct' });
    KA.put(6, { f: `IF(${i + 1}<=Shift,1,0)` }, { j: 'out', fmt: 'n0' });
    [2, 3, 4].forEach((c, k) => { const tot = `SUMPRODUCT($F$${w0}:$F$${w0 + 2},${A(c, w0)}:${A(c, w0 + 2)})`;
      KA.put(7 + k, { f: `IF(F${r}=0,0,IF(${tot}>0,MAX(0,N(${R(c, r)}))/${tot},1/Shift))` }, { j: 'out', fmt: 'pct' }); });
    KA.put(5, { f: `IF(F${r}=0,0,IF(JamArus_tot>0,(JamArus_in*G${r}+JamArus_out*H${r}+(JamArus_sto+JamArus_vas)*I${r})/JamArus_tot,I${r}))`, v: pd.beban[i] ?? 0 }, { j: 'out', fmt: 'pct', b: true });
    KA.put(10, { f: `IF(F${r}=0,0,IF(OR(G${r}>0,H${r}>0,I${r}>0),1,0))` }, { j: 'out', fmt: 'n0' });
    KA.r++;
  }
  KA.put(1, 'Total (shift aktif)', { j: 'sub' });
  [2, 3, 4].forEach(c => KA.put(c, { f: `SUMPRODUCT($F$${w0}:$F$${w0 + 2},${A(c, w0)}:${A(c, w0 + 2)})` }, { j: 'sub', fmt: 'pct' }));
  KA.r++;
  KA.nmR('BebanGab', 5, w0, w0 + 2); KA.nmR('BebanIn', 7, w0, w0 + 2); KA.nmR('BebanOut', 8, w0, w0 + 2); KA.nmR('BebanSto', 9, w0, w0 + 2);
  KA.note('Inbound & outbound bisa berbeda per shift. Total tiap kolom sebaiknya 100% (bila tidak, dinormalkan otomatis — kolom "norm"). Gabungan = tertimbang man hour per arus.');
  KA.r++;
  KA.h3('Faktor');
  KA.field('Produktivitas faktor', { f: 'FProd', v: a.faktorProduktivitas }, 'pct', 'out', '', 'ubah di Faktor produktivitas (atas)');
  KA.field('Efficiency', { f: 'Efis', v: a.efisiensi }, 'pct', 'out', '', 'ubah di Efisiensi kerja (atas)');
  KA.field('Operating (alat dipakai bergantian)', { f: `MAX(1,SUM(J${w0}:J${w0 + 2}))`, v: pd.operating }, 'n0', 'out', 'shift', 'otomatis = jumlah shift aktif', 'Operating');
  KA.field('Shift aktif (beban gabungan > 0)', { f: `MAX(1,COUNTIF(BebanGab,">0"))`, v: pd.beban.filter(w => w > 0).length || 1 }, 'n0', 'out', 'shift', 'dipakai supervisor & peran tetap per shift', 'ShiftAktif');
  KA.note('Resources man power = FTE × workload shift per shift aktif, dibulatkan dengan multi-skill pooling (matriks rangkap di sheet Aktivitas & manpower).');
}

export function tulisVolume(x: Ctx) {
  const { VO, d, a, lk, normU, isPal } = x;
  const inp = d.inp, h = d.h;
  VO.lebar(16, 12, 14, 14, 14, 14, 14, 11, 14, 12, 12, 12, 12, 14, 11, 11, 11, 11, 11);
  VO.h2('Volume', 'Sizing memakai peak. Tarif dihitung dari volume komitmen (MGV). Storage diisi jumlah stok (posisi), arus lain per bulan. Peak/komitmen kosong (0) → dihitung memakai rata-rata (kolom efektif).');
  VO.hdr([['Arus', true], ['UoM', true], ['Rata-rata/bln', true], ['Peak/bln', true], ['Komitmen/bln', true], 'Peak efektif', 'Komitmen efektif', 'Faktor peak',
    ['1 palet = … (UoM case)', true], ['Isi per UoM', true], ['UoM isi', true], ['Isi kecil', true], ['UoM isi kecil', true], 'Palet eq./bln (peak)', 'nUoM', 'nIsi', 'nKecil', 'Ke palet']);
  const v0 = VO.r;
  const rows = [...a.volumes, ...Array.from({ length: 2 }, () => null)];
  rows.forEach(v => {
    const r = VO.r;
    VO.put(1, v?.arus ?? null, { j: 'in' }); VO.dd(1, 'L_Arus');
    VO.put(2, v?.uom ?? null, { j: 'in' }); VO.dd(2, 'L_Uom', false);
    VO.put(3, v?.rataRataBulan ?? null, { j: 'in', fmt: 'n0' }); VO.put(4, v?.peakBulan ?? null, { j: 'in', fmt: 'n0' }); VO.put(5, v?.komitmenBulan ?? null, { j: 'in', fmt: 'n0' });
    const ve = v ? volumeEfektif([v])[0] : null;
    VO.put(6, { f: `IF(D${r}>0,D${r},IF(C${r}>0,C${r},N(E${r})))`, v: ve?.peakBulan }, { j: 'out', fmt: 'n0' });
    VO.put(7, { f: `IF(E${r}>0,E${r},IF(C${r}>0,C${r},N(D${r})))`, v: ve?.komitmenBulan }, { j: 'out', fmt: 'n0' });
    VO.put(8, { f: `IF(C${r}>0,F${r}/C${r},1)` }, { j: 'out', fmt: 'n2' });
    const k = v?.konversi;
    VO.put(9, k?.paletIsi || null, { j: 'in', fmt: 'n0' }); VO.put(10, k?.per1 || null, { j: 'in', fmt: 'n2' }); VO.put(11, k?.uom1 ?? (v ? 'case' : null), { j: 'in' }); VO.dd(11, 'L_UomIsi', false);
    VO.put(12, k?.per2 || null, { j: 'in', fmt: 'n2' }); VO.put(13, k?.uom2 ?? (v ? 'pcs' : null), { j: 'in' }); VO.dd(13, 'L_UomIsi', false);
    VO.put(15, { f: normU(`B${r}`) }, { j: 'out' }); VO.put(16, { f: normU(`K${r}`) }, { j: 'out' }); VO.put(17, { f: normU(`M${r}`) }, { j: 'out' });
    // faktor ke palet (paletEkuivalen): palet = 1 · case: 1/isi palet (0 bila kosong) · isi = palet → per1 · lainnya 1 (tidak ok)
    VO.put(18, { f: `IF(${isPal(`B${r}`)},1,IF(O${r}="case",IF(N(I${r})>0,1/I${r},0),IF(AND(P${r}="palet",N(J${r})>0),J${r},IF(AND(Q${r}="palet",N(J${r})>0,N(L${r})>0),J${r}*L${r},1))))` }, { j: 'out', fmt: 'x' });
    VO.put(14, { f: `F${r}*R${r}` }, { j: 'out', fmt: 'n0' });
    VO.r++;
  });
  const v1 = VO.r - 1;
  for (const [nm, c] of [['Vol_Arus', 1], ['Vol_Uom', 2], ['Vol_Rata', 3], ['Vol_Peak', 6], ['Vol_Komit', 7], ['Vol_PaletIsi', 9], ['Vol_Per1', 10], ['Vol_Uom1', 11], ['Vol_Per2', 12], ['Vol_Uom2', 13],
    ['Vol_nU', 15], ['Vol_nU1', 16], ['Vol_nU2', 17], ['Vol_FPal', 18], ['Vol_PalEq', 14]] as const) VO.nmR(nm, c, v0, v1);
  VO.note('Isi per UoM: UoM palet → "Isi per UoM" (1 palet = … case) + isi kecil (1 case = … pcs). UoM case/karton → isi kolom "1 palet = …" agar bisa dihitung ke palet (staging/rak), dan isi kecil (1 case = … pcs).');
  // Rujukan per arus (baris pertama arus tsb, sama dengan web)
  VO.r++;
  VO.h3('Rujukan per arus (dipakai sheet lain)');
  VO.hdr(['Arus', 'UoM', 'Rata-rata', 'Peak ef.', 'Komitmen ef.', 'Palet eq. (peak)', 'Ke palet', 'Ada?', 'Palet ok?']);
  for (const ar of ['inbound', 'outbound', 'storage', 'vas']) {
    const r = VO.r; const k = ar === 'inbound' ? 'in' : ar === 'outbound' ? 'out' : ar === 'storage' ? 'sto' : 'vas';
    const ix = `MATCH(${q(ar)},Vol_Arus,0)`;
    VO.put(1, ar, { j: 'txt' });
    VO.put(2, { f: `IFERROR(INDEX(Vol_Uom,${ix}),"-")` }, { j: 'out' });
    VO.put(3, { f: `IFERROR(INDEX(Vol_Rata,${ix}),0)` }, { j: 'out', fmt: 'n0' });
    VO.put(4, { f: `IFERROR(INDEX(Vol_Peak,${ix}),0)`, v: h.volume.find(v => v.arus === ar)?.peakBulan ?? 0 }, { j: 'out', fmt: 'n0' });
    VO.put(5, { f: `IFERROR(INDEX(Vol_Komit,${ix}),0)`, v: h.volume.find(v => v.arus === ar)?.komitmenBulan ?? 0 }, { j: 'out', fmt: 'n0' });
    VO.put(6, { f: `IFERROR(INDEX(Vol_PalEq,${ix}),0)` }, { j: 'out', fmt: 'n0' });
    VO.put(7, { f: `IFERROR(INDEX(Vol_FPal,${ix}),0)` }, { j: 'out', fmt: 'x' });
    VO.put(8, { f: `IF(ISNUMBER(${ix}),1,0)` }, { j: 'out', fmt: 'n0' });
    VO.put(9, { f: `IF(H${r}=0,0,IF(OR(${isPal(`B${r}`)},AND(IFERROR(INDEX(Vol_nU,${ix}),"")="case",IFERROR(INDEX(Vol_PaletIsi,${ix}),0)>0)),1,0))` }, { j: 'out', fmt: 'n0' });
    VO.nm(`Uom_${k}`, 2); VO.nm(`Rt_${k}`, 3); VO.nm(`Pk_${k}`, 4); VO.nm(`Km_${k}`, 5); VO.nm(`Pal_${k}`, 6); VO.nm(`Ada_${k}`, 8);
    VO.r++;
  }
  // ---- Ringkasan order
  VO.r++;
  VO.h3('Ringkasan order');
  VO.field('Basis', 'Peak (sizing)', 'teks', 'in', '', '', 'BasisRingkas', 'L_Basis');
  VO.hdr(['Arus', 'UoM', 'Per hari', 'Per bulan', 'Per tahun', 'Palet / bln', 'Isi / bln', 'UoM isi', 'Isi kecil / bln', 'UoM kecil']);
  rows.forEach((v, i) => {
    if (!v) return;
    const r = VO.r, rv = v0 + i;
    const bln = `CHOOSE(MATCH(BasisRingkas,L_Basis,0),'Volume'!F${rv},'Volume'!C${rv},'Volume'!G${rv})`.replace(/'Volume'!/g, '');
    VO.put(1, { f: `A${rv}` }, { j: 'out' }); VO.put(2, { f: `B${rv}` }, { j: 'out' });
    VO.put(4, { f: bln }, { j: 'out', fmt: 'n0' });
    VO.put(3, { f: `IF(A${rv}="storage","–",IF(HariKerjaBln>0,D${r}/HariKerjaBln,0))` }, { j: 'out', fmt: 'n1' });
    VO.put(5, { f: `IF(A${rv}="storage","–",D${r}*12)` }, { j: 'out', fmt: 'n0' });
    VO.put(6, { f: `IF(O${rv}="case",IF(N(I${rv})>0,D${r}/I${rv},""),"")` }, { j: 'out', fmt: 'n1' });
    VO.put(7, { f: `IF(O${rv}="case","",IF(N(J${rv})>0,D${r}*J${rv},""))` }, { j: 'out', fmt: 'n0' });
    VO.put(8, { f: `IF(O${rv}="case","",K${rv})` }, { j: 'out' });
    VO.put(9, { f: `IF(O${rv}="case",IF(N(L${rv})>0,D${r}*L${rv},""),IF(AND(N(J${rv})>0,N(L${rv})>0),D${r}*J${rv}*L${rv},""))` }, { j: 'out', fmt: 'n0' });
    VO.put(10, { f: `M${rv}` }, { j: 'out' });
    VO.r++;
  });
  VO.note('Per hari = per bulan ÷ Working Days (Process Design, sheet Key assumption); per tahun = per bulan × 12. Storage = stok tersimpan (posisi), bukan arus.');

  // ---- Parameter muatan
  const pp = { ...PARAM_DEFAULT, ...(a.profilVolume?.param ?? {}) };
  VO.r++;
  VO.h3('Parameter muatan');
  VO.note('Satu sumber untuk tarif storage alternatif (per kg / CBM / liter) dan Profil order (cek muatan kendaraan).');
  VO.field('Berat per palet', pp.tonPerPalet * 1000, 'n2', 'in', 'kg', '', 'KgPalet');
  VO.field('Volume per palet', pp.cbmPerPalet, 'n3', 'in', 'CBM', '', 'CbmPalet');
  VO.field('Isi cair per palet', pp.literPerPalet ?? 0, 'n2', 'in', 'liter, opsional', '', 'LtrPalet');
  VO.field('Berat per case', pp.kgPerCase, 'n2', 'in', 'kg', '', 'KgCase');
  VO.field('Volume per case', pp.cbmPerCase, 'n3', 'in', 'CBM', '', 'CbmCase');
  VO.field('Ton per palet (otomatis)', { f: 'KgPalet/1000' }, 'n3', 'out', 'ton', '', 'TonPalet');
  VO.field('Stok rata-rata', { f: `IF(${isPal('Uom_sto')},Rt_sto,0)` }, 'n0', 'out', 'palet', 'storage UoM palet × rata-rata', 'StokPalet');
  VO.field('Berat stok', { f: `StokPalet*KgPalet` }, 'n0', 'out', 'kg');
  VO.field('Volume stok', { f: `StokPalet*CbmPalet` }, 'n1', 'out', 'CBM');
  VO.field('Cair stok', { f: `StokPalet*LtrPalet` }, 'n0', 'out', 'liter');
  VO.field('Stok ton (dipakai tarif)', { f: `IF(StokPalet>0,StokPalet*TonPalet,${Number(a.stokTon ?? 0)})` }, 'n3', 'out', 'ton', 'storage bukan palet → nilai asumsi lama', 'StokTon');
  VO.field('Stok CBM (dipakai tarif)', { f: `IF(StokPalet>0,StokPalet*CbmPalet,${Number(a.stokCbm ?? 0)})` }, 'n1', 'out', 'CBM', '', 'StokCbm');
  VO.field('Stok liter (dipakai tarif)', { f: `IF(StokPalet>0,StokPalet*LtrPalet,${Number(a.stokLiter ?? 0)})` }, 'n0', 'out', 'liter', '', 'StokLiter');

  // ---- Profil order inbound & outbound
  const pv = a.profilVolume;
  VO.r++;
  VO.h2('Profil order inbound & outbound (per hari)', 'Volume per bulan ÷ hari operasional = palet per hari, dipecah per moda sesuai porsi (%). Kontainer/mobil per hari = kebutuhan terbesar antara palet, CBM, dan berat dibanding kapasitas (dibulatkan ke atas per moda).');
  VO.field('Basis volume', pv?.basis === 'rataRataBulan' ? 'Rata-rata' : pv?.basis === 'komitmenBulan' ? 'Komitmen (MGV)' : 'Peak (sizing)', 'teks', 'in', '', '', 'BasisProfil', 'L_Basis');
  VO.field('Input admin per mobil', pp.inputAdminPerMobil ?? 2, 'n0', 'in', 'order', 'inbound: barang masuk + put away · outbound: picking + barang keluar', 'AdminPerMobil');
  VO.field('Pemakaian ruang muat (CBM)', pp.utilCbm ?? 0.9, 'pct', 'in', '', 'CBM efektif = CBM kendaraan × pemakaian; sisanya toleransi', 'UtilCbm');
  VO.field('Hari operasional', { f: 'HariKerjaBln' }, 'n2', 'out', 'hari/bln', 'Working Days di Process Design');

  // Kapasitas kendaraan dulu dinamai (tabel ditulis di bawah)
  const kend = pv?.kendaraan?.length ? pv.kendaraan : KENDARAAN_DEFAULT;
  const order: Record<string, string> = {};
  for (const arus of ['inbound', 'outbound'] as const) {
    const k = arus === 'inbound' ? 'in' : 'out';
    const rowsP = [...(pv?.[arus] ?? []), null, null];
    VO.r++;
    VO.h3(arus === 'inbound' ? 'Inbound (penerimaan · kontainer / land transport)' : 'Outbound (pengiriman · kontainer / land transport)');
    // volumePalet: palet/bln sesuai basis + default isi case/palet & unit/case
    const ix = `MATCH(${q(arus)},Vol_Arus,0)`;
    const qv = `IFERROR(CHOOSE(MATCH(BasisProfil,L_Basis,0),INDEX(Vol_Peak,${ix}),INDEX(Vol_Rata,${ix}),INDEX(Vol_Komit,${ix})),0)`;
    const nu = `IFERROR(INDEX(Vol_nU,${ix}),"")`, pi = `IFERROR(INDEX(Vol_PaletIsi,${ix}),0)`, p1 = `IFERROR(INDEX(Vol_Per1,${ix}),0)`, p2 = `IFERROR(INDEX(Vol_Per2,${ix}),0)`, n1 = `IFERROR(INDEX(Vol_nU1,${ix}),"")`;
    const est = `IF(CbmCase>0,INT(CbmPalet/CbmCase),0)`;
    const cA = VO.field('Volume / bln (basis)', { f: qv }, 'n0', 'out', '', '', `PvQ_${k}`);
    VO.field('Palet / bln', { f: `IF(${nu}="palet",PvQ_${k},IF(${nu}="case",IF(${pi}>0,PvQ_${k}/${pi},IF(${est}>0,PvQ_${k}/${est},0)),0))` }, 'n1', 'out', 'palet', 'UoM case tanpa isi per palet → perkiraan CBM palet ÷ CBM case', `PvPal_${k}`);
    VO.field('Palet / hari', { f: `IF(HariKerjaBln>0,PvPal_${k}/HariKerjaBln,0)` }, 'n2', 'out', 'palet', '', `PvHari_${k}`);
    VO.field('Default case / palet', { f: `IF(${nu}="palet",IF(AND(${n1}="case",${p1}>0),${p1},0),IF(${nu}="case",IF(${pi}>0,${pi},${est}),IF(AND(${n1}="case",${p1}>0),${p1},0)))` }, 'n0', 'out', 'case', '', `PvCpp_${k}`);
    VO.field('Default unit / case', { f: `IF(${p2}>0,${p2},0)` }, 'n0', 'out', 'unit', '', `PvUpc_${k}`);
    void cA;
    VO.hdr([['Moda', true], ['Cara muat (kontainer)', true], ['Satuan unit', true], ['Porsi', true], 'Palet/hari', ['Case/palet', true], ['Unit/case', true], 'Qty/hari', 'Satuan',
      ['Kendaraan (land)', true], ['Kg maks/kont', true], 'Kendaraan dipakai', 'Kap. palet', 'Kap. CBM', 'Kap. kg', 'CBM/hari', 'Kg/hari', 'CBM efektif', 'Case/mobil', 'n palet', 'n CBM', 'n berat', 'Mobil/hari', 'Mobil/hari (bulat)', 'Mobil/bln', 'Pembatas', 'Cek CBM', 'Cek berat', 'Kode moda', 'Muatan']);
    const r0p = VO.r;
    for (const p of rowsP) {
      const r = VO.r;
      const moda = p ? MODA.find(o => o.v === p.moda)!.l : null;
      VO.put(1, moda, { j: 'in' }); VO.dd(1, 'L_Moda');
      VO.put(2, p && isKontainer(p.moda) ? MUATAN.find(o => o.v === muatanBaris(p))!.l : null, { j: 'in' }); VO.dd(2, 'L_Muatan');
      VO.put(3, p?.satuanUnit ?? (p ? 'pcs' : null), { j: 'in' }); VO.dd(3, 'L_SatuanUnit', false);
      VO.put(4, p ? Number(p.persen) || 0 : null, { j: 'in', fmt: 'pct' });
      const kode = `AC${r}`, mu = `AD${r}`;
      VO.put(29, { f: `IFERROR(INDEX(D_ModaKode,MATCH(A${r},D_ModaLabel,0)),"")` }, { j: 'out' });
      VO.put(30, { f: `IF(OR(${kode}="cont20",${kode}="cont40",${kode}="cont40hc"),IFERROR(INDEX(D_MuKode,MATCH(B${r},D_MuLabel,0)),"case"),${kode})` }, { j: 'out' });
      VO.put(5, { f: `PvHari_${k}*MAX(0,N(D${r}))` }, { j: 'out', fmt: 'n2' });
      VO.put(6, p?.casePerPalet || null, { j: 'in', fmt: 'n0' }); VO.put(7, p?.unitPerCase || null, { j: 'in', fmt: 'n0' });
      const cpp = `IF(N(F${r})>0,F${r},PvCpp_${k})`, upc = `IF(N(G${r})>0,G${r},PvUpc_${k})`;
      VO.put(8, { f: `IF(${mu}="palet",E${r},IF(${mu}="case",E${r}*${cpp},E${r}*${cpp}*${upc}))` }, { j: 'out', fmt: 'n1' });
      VO.put(9, { f: `IF(${mu}="palet","palet",IF(${mu}="case","case",C${r}))` }, { j: 'out' });
      VO.put(10, p && !isKontainer(p.moda) ? (kend.some(z => z.nama === p.kendaraan) ? p.kendaraan! : (kend.find(z => z.nama === KENDARAAN_AWAL) ?? kend[0]).nama) : null, { j: 'in' }); VO.dd(10, 'Kend_Nama');
      VO.put(11, p?.tonPerKontainer ? p.tonPerKontainer * 1000 : null, { j: 'in', fmt: 'n0' });
      const kont = `OR(${kode}="cont20",${kode}="cont40",${kode}="cont40hc")`;
      VO.put(12, { f: `IF(${kont},IFERROR(INDEX(Kend_Nama,MATCH(IF(${kode}="cont20","*20ft*",IF(${kode}="cont40hc","*40HC*","*40ft*")),Kend_Nama,0)),""),IF(J${r}="",${q((kend.find(z => z.nama === KENDARAAN_AWAL) ?? kend[0]).nama)},J${r}))` }, { j: 'out' });
      const kap = (nmK: string) => `IFERROR(INDEX(${nmK},MATCH(L${r},Kend_Nama,0)),0)`;
      VO.put(13, { f: kap('Kend_Palet') }, { j: 'out', fmt: 'n0' }); VO.put(14, { f: kap('Kend_Cbm') }, { j: 'out', fmt: 'n1' });
      VO.put(15, { f: `IF(AND(${kont},N(K${r})>0),K${r},${kap('Kend_Kg')})` }, { j: 'out', fmt: 'n0' });
      VO.put(16, { f: `IF(${mu}="palet",E${r}*CbmPalet,E${r}*${cpp}*CbmCase)` }, { j: 'out', fmt: 'n2' });
      VO.put(17, { f: `IF(${mu}="palet",E${r}*KgPalet,E${r}*${cpp}*KgCase)` }, { j: 'out', fmt: 'n0' });
      VO.put(18, { f: `N(${R(14, r)})*MIN(1,MAX(0.01,UtilCbm))` }, { j: 'out', fmt: 'n1' });
      VO.put(19, { f: `IF(AND(${mu}<>"palet",CbmCase>0),INT(R${r}/CbmCase+1E-9),0)` }, { j: 'out', fmt: 'n0' });
      VO.put(20, { f: `IF(${mu}="palet",IF(M${r}>0,E${r}/M${r},0),0)` }, { j: 'out', fmt: 'n2' });
      VO.put(21, { f: `IF(AND(${mu}<>"palet",S${r}>0,${cpp}>0),E${r}*${cpp}/S${r},IF(R${r}>0,P${r}/R${r},0))` }, { j: 'out', fmt: 'n2' });
      VO.put(22, { f: `IF(O${r}>0,Q${r}/O${r},0)` }, { j: 'out', fmt: 'n2' });
      VO.put(23, { f: `IF(AND(L${r}<>"",E${r}>0),MAX(T${r},U${r},V${r}),0)` }, { j: 'out', fmt: 'n2' });
      VO.put(24, { f: `IF(W${r}>0,ROUNDUP(W${r}-1E-9,0),0)` }, { j: 'out', fmt: 'n0', b: true });
      VO.put(25, { f: `IF(W${r}>0,ROUNDUP(W${r}*HariKerjaBln-1E-9,0),0)` }, { j: 'out', fmt: 'n0' });
      VO.put(26, { f: `IF(W${r}=0,"",IF(W${r}=T${r},"palet",IF(W${r}=U${r},"CBM","berat")))` }, { j: 'out' });
      VO.put(27, { f: `IF(W${r}=0,"",IF(P${r}/MAX(1,X${r})<=R${r}+1E-9,"cukup","tidak cukup"))` }, { j: 'out' });
      VO.put(28, { f: `IF(W${r}=0,"",IF(Q${r}/MAX(1,X${r})<=O${r}+1E-9,"cukup","overload"))` }, { j: 'out' });
      VO.r++;
    }
    const r1p = VO.r - 1;
    VO.put(1, 'Total', { j: 'sub' }); VO.put(4, { f: `SUM(D${r0p}:D${r1p})` }, { j: 'sub', fmt: 'pct' }); VO.put(5, { f: `SUM(E${r0p}:E${r1p})` }, { j: 'sub', fmt: 'n2' });
    VO.put(24, { f: `SUM(X${r0p}:X${r1p})` }, { j: 'sub', fmt: 'n0' }); VO.nm(`Mobil_${k}`, 24);
    VO.r++;
    order[k] = `Mobil_${k}`;
  }
  VO.r++;
  VO.h3('Volume admin (order)');
  VO.hdr(['Arus', 'Mobil/hari', 'Input admin per mobil', 'Order/hari', 'Order/bln', 'Keterangan']);
  for (const [k, l, ket] of [['in', 'Inbound', 'barang masuk + put away'], ['out', 'Outbound', 'picking + barang keluar']] as const) {
    const r = VO.r;
    VO.put(1, l, { j: 'txt' }); VO.put(2, { f: `Mobil_${k}` }, { j: 'out', fmt: 'n0' }); VO.put(3, { f: 'AdminPerMobil' }, { j: 'out', fmt: 'n0' });
    VO.put(4, { f: `B${r}*C${r}` }, { j: 'out', fmt: 'n0' }); VO.put(5, { f: `D${r}*HariKerjaBln` }, { j: 'out', fmt: 'n0', b: true }); VO.put(6, ket, { j: 'txt' });
    VO.nm(`OrderBln_${k}`, 5);
    VO.r++;
  }
  VO.note('Order/bln otomatis menjadi volume aktivitas admin (role Admin, UoM order/line) di sheet Aktivitas & manpower bila Volume/bln-nya kosong; dibagi rata bila ada beberapa aktivitas admin di satu arus.');
  VO.r++;
  VO.h3(`Kapasitas kendaraan (bisa diubah / ditambah) · ${kend.length} jenis`);
  VO.hdr([['Kendaraan', true], ['Palet', true], ['CBM', true], ['Berat (kg)', true]]);
  const k0 = VO.r;
  for (const kd of [...kend, null, null, null]) {
    VO.put(1, kd?.nama ?? null, { j: 'in' }); VO.put(2, kd?.palet ?? null, { j: 'in', fmt: 'n0' }); VO.put(3, kd?.cbm ?? null, { j: 'in', fmt: 'n1' }); VO.put(4, kd ? kd.ton * 1000 : null, { j: 'in', fmt: 'n0' });
    VO.r++;
  }
  VO.nmR('Kend_Nama', 1, k0, VO.r - 1); VO.nmR('Kend_Palet', 2, k0, VO.r - 1); VO.nmR('Kend_Cbm', 3, k0, VO.r - 1); VO.nmR('Kend_Kg', 4, k0, VO.r - 1);
  VO.note('Nama kontainer (20ft / 40ft / 40HC) dipakai otomatis untuk moda kontainer.');
  void isCase;
}
