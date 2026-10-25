'use client';
// Export Excel "seperti web": satu sheet per tab tender (urutan, kartu, kolom, droplist sama dengan web),
// semua angka berupa rumus hidup yang saling terhubung. Pengecualian (bersifat algoritma di web):
// headcount hasil multi-skill pooling & per shift → ditulis sebagai sel input (bisa diubah), alokasi biaya
// manpower/MHE per layanan → nilai dari web. Rumus memakai fungsi yang kompatibel Excel 2016+ / 365.
import { MENU, SHEET_WEB, S, BUCKETS, RISIKO_DEFAULT, ALOKASI, TOOLS, UOM, UOM_ISI, INDUSTRI, MATA_UANG, KELAS_UOM, R, C, type Ctx, type DataWeb, type Fmt } from '@/lib/exportWebUtil';
import { LEVEL_JABATAN } from '@/lib/engine/biayaMp';
import { MODA, MUATAN, SATUAN_UNIT } from '@/lib/profilVolume';
import { OPSI_TAG, labelTag } from '@/lib/porsiMuat';
import { COST_TYPES, KELOMPOK_IT } from '@/lib/it';
import { SEKSI_BIAYA } from '@/lib/biayaLain';
import { PD_DEFAULT } from '@/lib/engine/processDesign';
import { tulisKeyAssumption, tulisVolume } from '@/lib/exportWebA';
import { tulisAktivitas } from '@/lib/exportWebB';
import { tulisGudang, tulisIt, tulisBiayaLain, tulisInterest } from '@/lib/exportWebC';
import { tulisHasil, tulisQuotation, tulisRingkasan } from '@/lib/exportWebD';
export { SHEET_WEB, MENU };
export type { DataWeb };

/* eslint-disable @typescript-eslint/no-explicit-any */
type WB = any;
export function tulisModelWeb(wb: WB, d: DataWeb) {
  const { t, h, m, inp } = d;
  const a = t.asumsi;
  const pd = h.processDesign!;
  const n = inp.durasiKontrakBulan;
  const L0 = d.daftar ?? { prods: [], items: [], jabatan: [], upah: [], tarif: [], gudang: [], itKatalog: [] };
  const nShift = Math.max(1, inp.jumlahShift || 1);
  const pdIn = { ...PD_DEFAULT, ...(inp.processDesign ?? {}), mp: { ...PD_DEFAULT.mp, ...(inp.processDesign?.mp ?? {}) }, mhe: { ...PD_DEFAULT.mhe, ...(inp.processDesign?.mhe ?? {}) } };
  const sub0 = `${t.customer} · ${t.kode ?? ''} · ${t.kab_kota}, ${t.provinsi} · kontrak ${n} bln · diekspor ${new Date().toLocaleString('id-ID')}`;

  // Sheet dibuat sesuai urutan tab web; isi ditulis setelahnya (rujukan antar-sheet memakai nama/alamat).
  const S0 = new S(wb, '0 Ringkasan', `${t.customer} — ${t.kode ?? ''}`, sub0, 'FF1F2A37');
  const KA = new S(wb, 'Key assumption', 'Key assumption', sub0);
  const VO = new S(wb, 'Volume', 'Volume', sub0);
  const AK = new S(wb, 'Aktivitas & manpower', 'Aktivitas & manpower', sub0);
  const GD = new S(wb, 'Gudang, space & MHE', 'Gudang, space & MHE', sub0);
  const IC = new S(wb, 'Interest cost', 'Interest cost — simulasi pinjaman bank', sub0);
  const IT = new S(wb, 'IT', 'Kebutuhan IT (format BAP)', sub0);
  const BL = new S(wb, 'Biaya lain', 'Biaya lain', sub0);
  const HS = new S(wb, 'Hasil', 'Hasil', sub0, 'FF2F6FD0');
  const QU = new S(wb, 'Quotation', 'Quotation', sub0);
  const DF = new S(wb, 'Daftar', 'Daftar pilihan (droplist) & data master', 'Sumber semua droplist di sheet lain — boleh ditambah di bawah tiap daftar', 'FF9CA3AF');

  // ===================================================================================== Daftar
  // Tiap daftar = satu blok kolom; dinamai L_… (dipakai Data Validation) atau tabel D_… (dipakai INDEX/MATCH).
  let kolDf = 1;
  const daftarList = (nama: string, judul: string, isi: (string | number)[], ekstra = 10) => {
    const c = kolDf++;
    DF.put(c, judul, { j: 'hdr', al: 'center' }, 6);
    isi.forEach((v, i) => DF.put(c, v, { j: 'in' }, 7 + i));
    for (let i = isi.length; i < isi.length + ekstra; i++) DF.put(c, null, { j: 'in' }, 7 + i);
    DF.ws.getColumn(c).width = Math.min(46, Math.max(14, ...isi.map(x => String(x).length + 2), judul.length + 2));
    DF.nmR(nama, c, 7, 7 + Math.max(0, isi.length - 1));
    return { c, r0: 7, r1: 7 + Math.max(0, isi.length - 1) };
  };
  /** Tabel beberapa kolom; tiap kolom dinamai `${pref}${kolom}`. */
  const daftarTabel = (pref: string, judul: string, kolom: string[], rows: (string | number | null)[][], fmt: (Fmt | undefined)[] = []) => {
    const c0 = kolDf; kolDf += kolom.length + 1;
    DF.put(c0, judul, { b: true, size: 11, j: 'none' }, 5);
    kolom.forEach((k, j) => { DF.put(c0 + j, k, { j: 'hdr', al: 'center' }, 6); DF.ws.getColumn(c0 + j).width = Math.min(40, Math.max(12, k.length + 2, ...rows.map(r => String(r[j] ?? '').length * (fmt[j] ? 0.9 : 1) + 2))); });
    rows.forEach((r, i) => r.forEach((v, j) => DF.put(c0 + j, v, { j: 'in', fmt: fmt[j] }, 7 + i)));
    const r1 = 7 + Math.max(0, rows.length - 1);
    kolom.forEach((k, j) => DF.nmR(`${pref}${k.replace(/[^A-Za-z0-9]/g, '')}`, c0 + j, 7, r1));
    return { c0, r1 };
  };
  daftarList('L_Arus', 'Arus', ['inbound', 'outbound', 'storage', 'vas'], 0);
  daftarList('L_Uom', 'UoM', Array.from(new Set([...UOM, ...a.volumes.map(v => v.uom), ...a.aktivitas.map(x => x.uom)])));
  daftarList('L_UomIsi', 'UoM isi', UOM_ISI);
  daftarList('L_Tool', 'Equipment', Array.from(new Set([...TOOLS, ...L0.prods.map(p => p.tool), ...a.mhe.map(x => x.tool), ...a.aktivitas.map(x => x.tool)].filter(Boolean))));
  const jabSemua = Array.from(new Set([...L0.jabatan, ...m.jobLevels.map(j => j.roleName), ...L0.prods.map(p => p.role_name), ...a.aktivitas.map(x => x.roleName), ...a.peranTetap.map(p => p.roleName), a.roleSupervisor].filter(Boolean))).sort();
  daftarList('L_Role', 'Role / jabatan', jabSemua);
  daftarList('L_Tahap', 'Task / tahap', Array.from(new Set([...L0.prods.map(p => p.tahap), ...a.aktivitas.map(x => x.tahap)].filter(Boolean))));
  daftarList('L_Industri', 'Industri', ['—', ...INDUSTRI], 3);
  daftarList('L_Skema', 'Skema', ['Dedicated', 'Shared'], 0);
  daftarList('L_Aset', 'Skenario aset', ['Rental', 'Own Asset', 'Built-to-Suit'], 0);
  daftarList('L_Shift', 'Jumlah shift', [1, 2, 3], 0);
  daftarList('L_HariMinggu', 'Hari kerja/minggu', [5, 6, 7], 0);
  daftarList('L_YaTidak', 'Ya / Tidak', ['Ya', 'Tidak'], 0);
  daftarList('L_BasisPT', 'Basis headcount', ['Total', 'Per shift'], 0);
  daftarList('L_Mode', 'Mode biaya', ['bulanan', 'sewa', 'beli', 'sekali'], 0);
  daftarList('L_ModeMhe', 'Mode MHE', ['sewa', 'beli'], 0);
  daftarList('L_Risiko', 'Risiko', ['Default', 'Rendah', 'Sedang', 'Tinggi'], 0);
  daftarList('L_Skema2', 'Dedicated / Sharing', ['Dedicated', 'Sharing'], 0);
  daftarList('L_MataUang', 'Mata uang IT', ['IDR', 'USD'], 0);
  daftarList('L_Perlakuan', 'Perlakuan OTC', ['Depresiasi', 'Amortisasi', 'Tagih terpisah'], 0);
  daftarList('L_KelompokIT', 'Kelompok IT', KELOMPOK_IT);
  daftarList('L_Kurs', 'Mata uang (konversi)', ['—', ...MATA_UANG], 0);
  daftarList('L_Pph', 'PPh 23', ['Exclude PPh — ditanggung customer', 'Include PPh — ditanggung kita'], 0);
  daftarList('L_Ppn', 'PPN / VAT', ['Exclude PPN — ditambah di invoice', 'Include PPN — sudah termasuk tarif'], 0);
  daftarList('L_Metode', 'Metode bunga', ['Flat', 'Menurun'], 0);
  daftarList('L_Basis', 'Basis volume', ['Peak (sizing)', 'Rata-rata', 'Komitmen (MGV)'], 0);
  daftarList('L_Muatan', 'Cara muat', MUATAN.map(x => x.l), 0);
  daftarList('L_SatuanUnit', 'Satuan unit', SATUAN_UNIT, 3);
  daftarList('L_ListrikSumber', 'Sumber listrik', ['Simulasi Utilities (Price Inquiry)', 'Pilih peralatan per titik'], 0);
  daftarList('L_TarifSrc', 'Tarif sewa', ['Database', 'Manual'], 0);
  daftarList('L_GudangMode', 'Mode sewa gudang', ['Per m²', 'Sewa utuh'], 0);
  daftarList('L_Level', 'Level jabatan', LEVEL_JABATAN.map(x => x.l.split(' (')[0]), 0);
  daftarList('L_Sumber', 'Sumber % volume', ['% manual', ...OPSI_TAG.map(o => `Porsi ${labelTag(o.t)}`)], 0);
  daftarList('L_Moda', 'Moda', MODA.map(x => x.l), 0);
  daftarList('L_CostType', 'Cost type IT', COST_TYPES.map(x => x.v), 0);
  daftarList('L_Alokasi', 'Alokasi biaya', [...ALOKASI.map(x => x[0]), 'Kustom (dari web)'], 0);
  daftarList('L_Spv', 'Role supervisor', jabSemua.filter(j => /\b(spv|supervisor|leader|koordinator|coordinator|kepala|ka\b|manager|foreman|head|chief|mandor)/i.test(j)));
  const itemsKat = (kat: string[]) => L0.items.filter(x => kat.includes(x.kategori)).map(x => x.item);
  daftarList('L_ItemMhe', 'Item harga MHE / IT', ['—', ...itemsKat(['MHE', 'IT'])]);
  daftarList('L_ItemRak', 'Item racking', ['Manual', ...itemsKat(['Racking'])]);
  for (const s of SEKSI_BIAYA) daftarList(`L_Seksi_${s.id}`, `Item ${s.label.split(' (')[0]}`,
    ['Manual', ...(s.id === 'lainnya' ? L0.items.filter(x => !SEKSI_BIAYA.some(z => z.kategori.includes(x.kategori)) && !['MHE', 'Racking', 'Gudang', 'IT'].includes(x.kategori)).map(x => x.item) : itemsKat(s.kategori))]);
  daftarList('L_AlatListrik', 'Peralatan listrik', Array.from(new Set([...a.listrik.map(l => l.item), ...L0.items.filter(x => x.daya_watt).map(x => x.item)])));
  daftarList('L_ItKatalog', 'Katalog IT', L0.itKatalog.map(k => k.item));
  // Tabel lookup
  daftarTabel('D_Kelas', 'Normalisasi UoM', ['Uom', 'Kelas'], KELAS_UOM);
  daftarTabel('D_Ct', 'Cost type IT', ['Kode', 'Basis'], COST_TYPES.map(c => [c.v, c.basis]));
  daftarTabel('D_Al', 'Alokasi (preset)', ['Nama', 'Storage', 'HIn', 'HOut', 'Vas', 'Man'], ALOKASI.map(([k, v]) => [k, ...BUCKETS.map(b => v[b] ?? 0)]), [undefined, 'pct', 'pct', 'pct', 'pct', 'pct']);
  daftarTabel('D_Tag', 'Sumber % volume', ['Label', 'Proses', 'Muat'], OPSI_TAG.map(o => [`Porsi ${labelTag(o.t)}`, o.t.proses, o.t.muat]));
  daftarTabel('D_Moda', 'Moda', ['Label', 'Kode'], MODA.map(x => [x.l, x.v]));
  daftarTabel('D_Mu', 'Cara muat', ['Label', 'Kode'], MUATAN.map(x => [x.l, x.v]));
  daftarTabel('D_Lv', 'Level jabatan', ['Label', 'Kode'], LEVEL_JABATAN.map(x => [x.l.split(' (')[0], x.v]));
  daftarTabel('D_Risk', 'Risiko default', ['Kelompok', 'Risiko'], Object.entries(RISIKO_DEFAULT));
  const upahUrut = [...L0.upah].sort((x, y) => x.provinsi.localeCompare(y.provinsi) || x.kab_kota.localeCompare(y.kab_kota));
  if (!upahUrut.some(u => u.provinsi === t.provinsi && u.kab_kota === t.kab_kota)) upahUrut.push({ provinsi: t.provinsi, kab_kota: t.kab_kota, upah_berlaku: m.upahMinimum, status_verifikasi: m.statusUpah, tahun: inp.tahun });
  upahUrut.sort((x, y) => x.provinsi.localeCompare(y.provinsi) || x.kab_kota.localeCompare(y.kab_kota));
  const upT = daftarTabel('D_Up', 'UMK per kab/kota', ['Prov', 'Kab', 'Umk', 'Status'], upahUrut.map(u => [u.provinsi, u.kab_kota, Number(u.upah_berlaku), u.status_verifikasi]), [undefined, undefined, 'rp']);
  daftarList('L_Prov', 'Provinsi', Array.from(new Set(upahUrut.map(u => u.provinsi))), 0);
  daftarTabel('D_Jab', 'Jabatan (master)', ['Role', 'Tunjangan'], m.jobLevels.map(j => [j.roleName, j.tunjanganBulan]), [undefined, 'rp']);
  daftarTabel('D_Prod', 'Database produktivitas', ['Id', 'Tahap', 'Aktivitas', 'Tool', 'Role', 'Uom', 'Prod'], L0.prods.map(p => [p.id, p.tahap, p.aktivitas, p.tool, p.role_name, p.uom, Number(p.prod_per_jam)]));
  daftarTabel('D_It', 'Item harga (Price Inquiry)', ['Item', 'Kategori', 'Satuan', 'Beli', 'Sewa', 'Umur', 'Watt'],
    L0.items.map(x => [x.item, x.kategori, x.satuan, x.harga_beli, x.harga_sewa_bulan, x.umur_ekonomis_bulan, x.daya_watt ?? null]), [undefined, undefined, undefined, 'rp', 'rp', 'n0', 'n0']);
  const gdSnap = a.gudang;
  const gdRows: (string | number | null)[][] = [['—', '', '', null, null, null]];
  if (gdSnap) gdRows.push([`(terpilih) ${gdSnap.nama}`, gdSnap.kab_kota, gdSnap.provinsi, Number(gdSnap.luas_m2), gdSnap.harga_sewa_m2_bulan, gdSnap.harga_per_bulan]);
  for (const w of L0.gudang) gdRows.push([`${w.nama} · ${w.kab_kota}`, w.kab_kota, w.provinsi, Number(w.luas_m2), w.harga_sewa_m2_bulan, w.harga_per_bulan]);
  daftarTabel('D_Gd', 'Gudang (master Procurement)', ['Nama', 'Kab', 'Prov', 'Luas', 'TarifM2', 'HargaBln'], gdRows, [undefined, undefined, undefined, 'n0', 'rp', 'rp']);
  DF.nmR('L_Gudang', kolDf - 7, 7, 7 + gdRows.length - 1);
  const tarifRows = L0.tarif.length ? L0.tarif.map(x => [x.golongan, Number(x.tarif_kwh)]) : [[a.golonganListrik, a.tarifListrikKwh]];
  daftarTabel('D_Pln', 'Tarif PLN', ['Golongan', 'Tarif'], tarifRows, [undefined, 'n2']);
  DF.nmR('L_Golongan', kolDf - 3, 7, 7 + tarifRows.length - 1);
  // Hari libur tahun go-live (dipakai kalender operasional)
  const libT = kolDf; kolDf += 4;
  DF.put(libT, 'Hari libur (master)', { b: true, size: 11, j: 'none' }, 5);
  ['Tanggal', 'Nama', 'Hari kerja?'].forEach((k, j) => DF.put(libT + j, k, { j: 'hdr', al: 'center' }, 6));
  const libur = Array.from(new Set(m.holidays.map(x => x.tanggal))).map(tg => ({ tanggal: tg, nama: m.holidays.find(x => x.tanggal === tg)!.nama }));
  libur.forEach((x, i) => {
    const r = 7 + i; const [y, mo, dd] = x.tanggal.split('-').map(Number);
    DF.put(libT, { f: `DATE(${y},${mo},${dd})`, v: x.tanggal }, { j: 'in', fmt: 'tgl' }, r); DF.put(libT + 1, x.nama, { j: 'in' }, r);
    DF.put(libT + 2, { f: `IF(YEAR(${R(libT, r)})=Tahun,NETWORKDAYS.INTL(${R(libT, r)},${R(libT, r)},WeekendKode),0)` }, { j: 'out', fmt: 'n0' }, r);
  });
  DF.ws.getColumn(libT).width = 14; DF.ws.getColumn(libT + 1).width = 34; DF.ws.getColumn(libT + 2).width = 11;
  const libR1 = 7 + Math.max(0, libur.length - 1);
  DF.nmR('D_LiburHK', libT + 2, 7, libR1);
  DF.note('Daftar di sheet ini = isi droplist (Data Validation) di sheet lain. Tambahkan pilihan baru di sel kosong di bawah daftar.');
  void upT;

  // Helper rumus umum
  const lk = (tabel: string, kunci: string, kolomCari: string, kolomAmbil: string, def: string | number = 0) => `IFERROR(INDEX(${tabel}${kolomAmbil},MATCH(${kunci},${tabel}${kolomCari},0)),${typeof def === 'string' ? def : def})`;
  const normU = (x: string) => `IFERROR(INDEX(D_KelasKelas,MATCH(LOWER(TRIM(${x})),D_KelasUom,0)),LOWER(TRIM(${x})))`;
  const isPal = (x: string) => `OR(LOWER(TRIM(${x}))="palet",LOWER(TRIM(${x}))="pallet")`;

  const ctx: Ctx = { wb, d, a, pd, n, nShift, pdIn, L0, KA, VO, AK, GD, IC, IT, BL, HS, QU, S0, DF, lk, normU, isPal, lines: [], later: [] };
  tulisKeyAssumption(ctx);
  tulisVolume(ctx);
  tulisAktivitas(ctx);
  tulisGudang(ctx);
  tulisIt(ctx);
  tulisBiayaLain(ctx);
  tulisInterest(ctx);
  tulisHasil(ctx);
  tulisQuotation(ctx);
  tulisRingkasan(ctx);
  wb.calcProperties = { fullCalcOnLoad: true };
  return wb;
}

