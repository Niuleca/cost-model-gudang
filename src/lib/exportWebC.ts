// Sheet "Gudang, space & MHE", "IT", "Biaya lain" (+ listrik) dan "Interest cost".
import { R, q, BUCKETS, ALOKASI, normAlok, namaAlok, RISIKO_DEFAULT, type Ctx, type Line } from '@/lib/exportWebUtil';
import { lengkapiSpaceExcel } from '@/lib/engine/space';
import { KELOMPOK_ASET, basisDari, perlakuanDari, UMUR_IT_DEFAULT } from '@/lib/it';
import { SEKSI_BIAYA, seksiDari } from '@/lib/biayaLain';

const MERATA = [0.4, 0.3, 0.3, 0, 0];
const alokAngka = (a: Partial<Record<string, number>>) => BUCKETS.map(b => a[b] ?? 0);

export function tulisGudang(x: Ctx) {
  const { GD, d, a } = x;
  const { h, inp } = d;
  const SN = `'${GD.nama}'!`;
  GD.lebar(46, 18, 16, 16, 14, 14, 14, 14, 14, 14, 14, 14, 14);
  // ===================== Gudang
  const g0 = a.gudang;
  GD.h2('Gudang', 'Pilih gudang dari master Procurement (sheet Daftar). "(terpilih)" = data gudang saat dipilih di web. Tarif sewa & luas tersedia ikut ke perhitungan.');
  GD.field('Gudang', g0 ? `(terpilih) ${g0.nama}` : '—', 'teks', 'in', '', '— = belum memilih gudang (isi tarif manual di Biaya space)', 'GdPilih', 'L_Gudang');
  GD.field('Mode sewa', g0?.sewaUtuh ? 'Sewa utuh' : 'Per m²', 'teks', 'in', '', 'Per m² = luas Space Rent × tarif · Sewa utuh = harga per bulan gudang', 'GdMode', 'L_GudangMode');
  const lkG = (k: string) => `IFERROR(INDEX(D_Gd${k},MATCH(GdPilih,D_GdNama,0)),"")`;
  GD.field('Lokasi', { f: `IF(GdPilih="—","",${lkG('Kab')}&", "&${lkG('Prov')})` }, 'teks', 'out');
  GD.field('Luas tersedia', { f: `N(${lkG('Luas')})` }, 'n0', 'out', 'm²', '', 'GdLuas');
  GD.field('Tarif database', { f: `IF(GdPilih="—",0,ROUND(IF(N(${lkG('TarifM2')})>0,${lkG('TarifM2')},N(${lkG('HargaBln')})/MAX(1,GdLuas)),0))` }, 'rp', 'out', 'Rp/m²/bln', '', 'GdTarifDb');
  GD.field('Harga sewa utuh database', { f: `IF(GdPilih="—",0,IF(N(${lkG('HargaBln')})>0,${lkG('HargaBln')},N(${lkG('TarifM2')})*GdLuas))` }, 'rp', 'out', 'Rp/bln', '', 'GdHargaBln');
  GD.field('Kebutuhan vs luas tersedia', { f: `IF(GdLuas=0,"",IF(LuasM2>GdLuas,"KURANG: kebutuhan "&TEXT(LuasM2,"#,##0")&" m²","OK: kebutuhan "&TEXT(LuasM2,"#,##0")&" m²"))` }, 'teks', 'out');

  // ===================== Space
  const sx = lengkapiSpaceExcel(a.space.excel);
  const p = sx.porsi!;
  GD.r++;
  GD.h2('Space', 'Kebutuhan space format Excel (A–E). Semua sel putih tulang bisa diubah; luas Space Rent dipakai sewa gudang, staging, IT default, dll.');
  const B = (l: string, v: NilaiX, fmt: Fmt, j: 'in' | 'out', u = '', nama?: string) => GD.field(l, v, fmt, j, u, '', nama);
  type NilaiX = Parameters<typeof GD.field>[1]; type Fmt = Parameters<typeof GD.field>[2];
  GD.h3('A  Capacity Requirement');
  B('Total posisi palet (dari Volume storage peak)', { f: 'Pal_sto', v: h.space.ppDesain }, 'n0', 'out', 'PP', 'PP');
  B('Porsi SPR (selective pallet rack)', p.spr, 'pct', 'in', '', 'PorsiSpr');
  B('Porsi DDR (double deep rack)', p.ddr, 'pct', 'in', '', 'PorsiDdr');
  B('Porsi block stack (palet ditumpuk)', p.block, 'pct', 'in', '', 'PorsiBlock');
  B('Porsi pallet floor (palet di lantai)', p.floor, 'pct', 'in', '', 'PorsiFloor');
  GD.field('Total porsi', { f: 'PorsiSpr+PorsiDdr+PorsiBlock+PorsiFloor' }, 'pct', 'out', '', 'harus 100%');
  const rak = (k: 'sd' | 'dd', judul: string, pre: string, porsi: string) => {
    const dd = sx[k];
    GD.r++; GD.h3(judul);
    B('Corridor (½ lebar gang)', dd.koridor, 'n2', 'in', 'm', `${pre}Kor`);
    B('Depth', dd.depth, 'n2', 'in', 'm', `${pre}Dep`);
    B('Width (lebar bay)', dd.width, 'n2', 'in', 'm', `${pre}Wid`);
    B('Palet per level per bay', dd.paletPerLevel, 'n0', 'in', 'palet', `${pre}Ppl`);
    if (k === 'dd') B('Kedalaman (deep)', dd.deep ?? 2, 'n0', 'in', 'palet', `${pre}Deep`);
    B('Foot print rack per bay', { f: `${pre}Dep*${pre}Wid` }, 'n2', 'out', 'm²', `${pre}RakBay`);
    B('Foot print corridor per bay', { f: `${pre}Kor*${pre}Wid` }, 'n2', 'out', 'm²', `${pre}KorBay`);
    B('Foot print total per bay', { f: `${pre}RakBay+${pre}KorBay` }, 'n2', 'out', 'm²', `${pre}TotBay`);
    B('Level of rack', { f: 'RackLevel' }, 'n1', 'out', 'level');
    B(`${k === 'sd' ? 'SPR' : 'DDR'} capacity per bay`, { f: `${pre}Ppl*${k === 'dd' ? `${pre}Deep` : 1}*RackLevel` }, 'n1', 'out', 'palet', `${pre}Kap`);
    B('Space required per pallet position', { f: `IF(${pre}Kap>0,${pre}TotBay/${pre}Kap,0)` }, 'n3', 'out', 'm²', `${pre}M2pp`);
    B('Capacity required', { f: `PP*MAX(0,${porsi})` }, 'n1', 'out', 'PP', `${pre}Req`);
    B('Bay', { f: `IF(${pre}Kap>0,MAX(0,ROUNDUP(${pre}Req/${pre}Kap-1E-9,0)),0)` }, 'n0', 'out', 'bay');
    B('Foot print', { f: `${pre}Req*${pre}M2pp` }, 'n1', 'out', 'm²', `${pre}Fp`);
  };
  rak('sd', 'B  Racking space (SPR · Selective Pallet Rack)', 'Spr', 'PorsiSpr');
  rak('dd', 'C  Racking space (DDR · Double Deep Rack)', 'Ddr', 'PorsiDdr');
  GD.r++; GD.h3('C2  Block stack');
  B('Dimensi palet — panjang', sx.palet.panjang, 'n2', 'in', 'm', 'PalP');
  B('Dimensi palet — lebar', sx.palet.lebar, 'n2', 'in', 'm', 'PalL');
  B('Tumpukan (stacking)', sx.block.tumpuk, 'n0', 'in', 'level', 'BlkTumpuk');
  B('Allowance gang / akses', sx.block.gangPersen, 'pct', 'in', 'dari luas palet', 'BlkGang');
  B('Space required per pallet position', { f: 'PalP*PalL/MAX(1,BlkTumpuk)*(1+MAX(0,BlkGang))' }, 'n3', 'out', 'm²', 'BlkM2pp');
  B('Capacity required', { f: 'PP*MAX(0,PorsiBlock)' }, 'n1', 'out', 'PP', 'BlkReq');
  B('Tapak palet', { f: 'MAX(0,ROUNDUP(BlkReq/MAX(1,BlkTumpuk)-1E-9,0))' }, 'n0', 'out', 'tapak');
  B('Foot print', { f: 'BlkReq*BlkM2pp' }, 'n1', 'out', 'm²', 'BlkFp');
  GD.r++; GD.h3('C3  Pallet floor');
  GD.field('Tumpukan', 1, 'n0', 'out', 'level', 'palet di lantai, tidak ditumpuk');
  B('Allowance gang / akses', sx.floor.gangPersen, 'pct', 'in', 'dari luas palet', 'FlrGang');
  B('Space required per pallet position', { f: 'PalP*PalL*(1+MAX(0,FlrGang))' }, 'n3', 'out', 'm²', 'FlrM2pp');
  B('Capacity required', { f: 'PP*MAX(0,PorsiFloor)' }, 'n1', 'out', 'PP', 'FlrReq');
  B('Foot print', { f: 'FlrReq*FlrM2pp' }, 'n1', 'out', 'm²', 'FlrFp');
  const stg = (k: 'inbound' | 'outbound', judul: string, pre: string, vol: string) => {
    const s = sx[k];
    GD.r++; GD.h3(judul);
    B(`${k === 'inbound' ? 'Inbound' : 'Outbound'} per month (palet eq., peak)`, { f: vol }, 'n0', 'out', 'palet');
    B('Unit per palet', s.unitPerPalet, 'n2', 'in', 'unit', `${pre}Upp`);
    B('Palet per month', { f: `${vol}/MAX(1E-9,IF(N(${pre}Upp)=0,1,${pre}Upp))` }, 'n1', 'out', 'palet', `${pre}Pal`);
    B(k === 'inbound' ? 'Porsi per minggu (rata-rata = 25%)' : 'Highest throughput week (porsi)', s.porsiMinggu, 'pct', 'in', '', `${pre}Pm`);
    B('Palet per minggu', { f: `${pre}Pal*${pre}Pm` }, 'n1', 'out', 'palet');
    B('Hari kerja per minggu', s.hariPerMinggu, 'n0', 'in', 'hari', `${pre}Hpm`);
    B('Daily', { f: `IF(${pre}Hpm>0,${pre}Pal*${pre}Pm/${pre}Hpm,0)` }, 'n1', 'out', 'palet', `${pre}Har`);
    B('Number of shift', { f: 'Shift' }, 'n0', 'out', 'shift');
    B('Volume per shift (hitung)', { f: `${pre}Har/MAX(1,Shift)` }, 'n1', 'out', 'palet', `${pre}PsH`);
    B('Volume per shift (manual, kosong = otomatis)', s.volumePerShiftManual ?? null, 'n1', 'in', 'palet', `${pre}PsM`);
    B('Sequence per shift', s.sequence, 'n0', 'in', 'times', `${pre}Seq`);
    B('Throughput per sequence', { f: `IF(${pre}PsM<>"",${pre}PsM,${pre}PsH)/MAX(1,${pre}Seq)` }, 'n1', 'out', 'PP', `${pre}PSeq`);
    B('Tumpuk di staging', s.tumpuk, 'n0', 'in', 'level', `${pre}Tum`);
    B('m² per palet staging', s.m2PerPalet, 'n2', 'in', 'm²', `${pre}M2`);
    B('Foot print', { f: `${pre}PSeq/MAX(1,${pre}Tum)*${pre}M2` }, 'n1', 'out', 'm²', `${pre}Fp`);
  };
  stg('inbound', 'D  Receiving & Staging', 'StI', 'Pal_in');
  stg('outbound', 'D  Outbound & Staging', 'StO', 'Pal_out');
  GD.r++; GD.h3('E  Foot Print Requirement (TOTAL)');
  GD.hdr(['Area', 'm²']);
  const e0 = GD.r;
  for (const [l, f] of [['Racking space (SPR)', 'SprFp'], ['Racking space (DDR)', 'DdrFp'], ['Block stack', 'BlkFp'], ['Pallet floor', 'FlrFp'], ['Receiving & Staging', 'StIFp'], ['Outbound & Staging', 'StOFp']]) {
    GD.put(1, l, { j: 'txt' }); GD.put(2, { f }, { j: 'out', fmt: 'n1' }); GD.r++;
  }
  const fa0 = GD.r;
  for (const fa of [...sx.fasilitas, null, null, null]) { GD.put(1, fa?.nama ?? null, { j: 'in' }); GD.put(2, fa ? Number(fa.m2) || 0 : null, { j: 'in', fmt: 'n1' }); GD.r++; }
  GD.nmR('FasilitasM2', 2, fa0, GD.r - 1);
  GD.put(1, 'Total', { j: 'sub' }); GD.put(2, { f: `SUM(B${e0}:B${GD.r - 1})`, v: h.space.excel.subtotal }, { j: 'sub', fmt: 'n1' }); GD.nm('SpaceSubtotal', 2); GD.r++;
  GD.field('Dibulatkan ke atas kelipatan', sx.pembulatan, 'n0', 'in', 'm²', '', 'Pembulatan');
  GD.field('Space Rent', { f: 'IF(SpaceSubtotal<=0,0,CEILING(SpaceSubtotal-1E-9,MAX(1,Pembulatan)))', v: h.space.totalM2 }, 'n0', 'out', 'm²', 'luas yang disewa / dihitung', 'LuasM2');
  for (const c of [...sx.cad, null]) GD.field(`Based on CAD${c ? ` · ${c.nama}` : ' (pembanding)'}`, c ? Number(c.m2) || 0 : null, 'n0', 'in', 'm²');
  GD.field('Gangway', sx.gangwayM ?? null, 'n1', 'in', 'm');
  GD.field('Desain gudang (kiri-kanan)', sx.lebarGudangM ?? null, 'n1', 'in', 'm');

  GD.r++; GD.h3('RACKING LEVEL');
  GD.field('Center height', sx.rak.centerMm, 'n0', 'in', 'mm', '', 'RkCenter');
  GD.field('Side height', sx.rak.sideMm, 'n0', 'in', 'mm', '', 'RkSide');
  GD.field('Beam', sx.rak.beamMm, 'n0', 'in', 'mm', '', 'RkBeam');
  GD.field('Pallet', sx.rak.palletMm, 'n0', 'in', 'mm', '', 'RkPallet');
  GD.field('Product', sx.rak.productMm, 'n0', 'in', 'mm', '', 'RkProduct');
  GD.field('Clearance', sx.rak.clearanceMm, 'n0', 'in', 'mm', '', 'RkClear');
  GD.field('Total height / pallet (level 2 up)', { f: 'RkBeam+RkPallet+RkProduct+RkClear' }, 'n0', 'out', 'mm', '', 'RkLvN');
  GD.field('Total height / pallet (level 1)', { f: 'RkPallet+RkProduct+RkClear' }, 'n0', 'out', 'mm', '', 'RkLv1');
  GD.field('Level otomatis', { f: 'IF(AND(RkSide>=RkLv1,RkLvN>0),1+INT((RkSide-RkLv1)/RkLvN+1E-9),0)' }, 'n0', 'out', 'level', '', 'RkAuto');
  GD.field('Level manual (opsional)', sx.rak.levelManual ?? null, 'n0', 'in', 'level', 'kosong = otomatis', 'RkManual');
  GD.field('Rack Level', { f: 'IF(N(RkManual)>0,RkManual,RkAuto)', v: h.space.levelRak }, 'n1', 'out', 'level', '', 'RackLevel');
  GD.field('Total height', { f: 'IF(RackLevel>0,RkLv1+(RackLevel-1)*RkLvN,0)' }, 'n0', 'out', 'mm', '', 'RkTinggi');
  GD.field('Cek tinggi', { f: 'IF(RkTinggi<=RkSide,"OK","Melebihi tinggi sisi gudang")' }, 'teks', 'out');

  GD.r++; GD.h3('Komposisi luas');
  GD.hdr(['Area', 'm²', '%']);
  const k0 = GD.r;
  for (const [l, f] of [['SPR', 'SprFp'], ['DDR', 'DdrFp'], ['Block stack', 'BlkFp'], ['Pallet floor', 'FlrFp'], ['Receiving & staging', 'StIFp'], ['Outbound & staging', 'StOFp'], ['Fasilitas', 'SUM(FasilitasM2)'], ['Pembulatan', 'LuasM2-SpaceSubtotal']]) {
    const r = GD.r; GD.put(1, l, { j: 'txt' }); GD.put(2, { f }, { j: 'out', fmt: 'n0' }); GD.put(3, { f: `IF(LuasM2>0,B${r}/LuasM2,0)` }, { j: 'out', fmt: 'pct' }); GD.r++;
  }
  GD.ws.addConditionalFormatting({ ref: `C${k0}:C${GD.r - 1}`, rules: [{ type: 'dataBar', priority: 1, minLength: 0, maxLength: 100, gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF555555' } }] });

  // ===================== Biaya space & racking
  GD.r++;
  GD.h2('Biaya space & racking', 'Sewa gudang mengikuti skenario aset Rental. Racking: posisi dari sheet Space × harga per posisi ÷ MIN(umur, kontrak) — bunga hanya lewat sheet Interest cost.');
  GD.field('Luas sewa (Space Rent)', { f: 'LuasM2' }, 'n0', 'out', 'm²');
  GD.field('Sumber tarif sewa', g0 && !a.space.tarifManual ? 'Database' : 'Manual', 'teks', 'in', '', 'Database = tarif gudang terpilih', 'TarifSrc', 'L_TarifSrc');
  GD.field('Tarif sewa manual', a.space.tarifManual || !g0 ? a.space.tarifSewaM2Bulan : inp.space.tarifSewaM2Bulan, 'rp', 'in', 'Rp/m²/bln', '', 'TarifManual');
  GD.field('Tarif sewa dipakai', { f: 'IF(AND(GdPilih<>"—",TarifSrc="Database"),GdTarifDb,TarifManual)', v: inp.space.tarifSewaM2Bulan }, 'rp', 'out', 'Rp/m²/bln', '', 'TarifSewa');
  GD.field('Disewa utuh?', { f: 'IF(AND(GdPilih<>"—",GdMode="Sewa utuh"),"Ya","Tidak")' }, 'teks', 'out', '', '', 'SewaUtuh');
  const sw = h.biaya.find(b => b.kelompok === 'Fasilitas' && b.deskripsi.startsWith('Sewa gudang'));
  const rSw = GD.r;
  GD.field('Sewa gudang per bulan', { f: 'IF(Aset<>"Rental",0,IF(SewaUtuh="Ya",GdHargaBln,LuasM2*TarifSewa))', v: sw?.biayaSistem ?? sw?.biayaBulan ?? 0 }, 'rp', 'out', 'Rp/bln', '', 'SewaBln');
  x.lines.push({ kel: 'Fasilitas', tahap: 1, desk: { f: `IF(GdPilih="—","Sewa gudang","Sewa gudang — "&SUBSTITUTE(GdPilih,"(terpilih) ",""))`, v: sw?.deskripsi ?? 'Sewa gudang' }, deskKey: sw?.deskripsi ?? 'Sewa gudang',
    jenis: 'Opex', risk: 'Rendah', sistem: 'SewaBln', alok: [1, 0, 0, 0, 0], dasar: sw?.dasar ?? '', v: sw?.biayaBulan,
    qty: { f: 'IF(SewaUtuh="Ya",1,LuasM2)' }, harga: { f: 'IF(SewaUtuh="Ya",GdHargaBln,TarifSewa)' }, uom: 'm²' });
  void rSw;
  GD.r++;
  GD.hdr(['Racking', ['Item (Price Inquiry)', true], 'Posisi', ['Harga / posisi', true], ['Umur (bln)', true], 'Harga DB', 'Nilai investasi', 'Depresiasi / bln']);
  for (const [j, l, req] of [['spr', 'SPR · Selective Pallet Rack', 'SprReq'], ['ddr', 'DDR · Double Deep Rack', 'DdrReq']] as const) {
    const r = GD.r;
    const hr = a.space.rak?.[j] ?? { harga: a.space.hargaRakPerPosisi ?? 0, umurBulan: a.space.umurRakBulan ?? 120 };
    GD.put(1, l, { j: 'txt', b: true }); GD.put(2, (hr as { nama?: string }).nama ?? 'Manual', { j: 'in' }); GD.dd(2, 'L_ItemRak', false);
    GD.put(3, { f: `MAX(0,ROUNDUP(${req}-1E-9,0))` }, { j: 'out', fmt: 'n0' });
    GD.put(4, hr.harga || 0, { j: 'in', fmt: 'rp' }); GD.put(5, hr.umurBulan || 0, { j: 'in', fmt: 'n0' });
    GD.put(6, { f: `IFERROR(INDEX(D_ItBeli,MATCH(B${r},D_ItItem,0)),"")` }, { j: 'out', fmt: 'rp' });
    GD.put(7, { f: `IF(AND(C${r}>0,D${r}>0),C${r}*D${r},0)` }, { j: 'out', fmt: 'rp' });
    GD.put(8, { f: `IF(G${r}>0,G${r}/MIN(IF(N(E${r})>0,E${r},Kontrak),Kontrak),0)` }, { j: 'out', fmt: 'rp', b: true });
    const lab = j === 'spr' ? 'SPR' : 'DDR';
    const eng = h.biaya.find(b => b.deskripsi.startsWith(`Racking ${lab} (`));
    x.lines.push({ kel: 'Racking', tahap: 1, desk: { f: `"Racking ${lab} ("&${SN}C${r}&" posisi) — depresiasi"`, v: eng?.deskripsi }, deskKey: eng?.deskripsi ?? `Racking ${lab}`,
      jenis: 'Capex', risk: 'Tinggi', sistem: `${SN}$H$${r}`, alok: [1, 0, 0, 0, 0], dasar: eng?.dasar ?? '', v: eng?.biayaBulan, nilai: `${SN}$G$${r}`,
      qty: { f: `${SN}C${r}` }, harga: { f: `${SN}D${r}` }, umur: { f: `MIN(IF(N(${SN}E${r})>0,${SN}E${r},Kontrak),Kontrak)` }, uom: 'posisi', capex: true });
    GD.r++;
  }

  // ===================== Kebutuhan MHE
  GD.r++;
  GD.h2('Kebutuhan MHE', 'Daftar alat dari Aktivitas & manpower (Equipment & Alat pendukung). Unit = MHE Summary + spare. Pilih item harga supaya biayanya masuk cost model; alat tanpa harga = tanpa biaya. Sewa = unit × harga · Beli = unit × harga ÷ MIN(umur, kontrak).');
  GD.hdr(['Equipment (dari aktivitas)', 'FTE', 'Unit kebutuhan', ['Item harga', true], ['Mode', true], ['Harga', true], ['Umur (bln)', true], ['Spare %', true], 'Spare', 'Total unit', 'Biaya/bln', 'Nilai investasi', 'Harga DB (sesuai mode)']);
  const tools = Array.from(new Set([...x.pd.mhe.map(e => e.nama), ...a.mhe.map(m => m.tool)]));
  const m0 = GD.r;
  for (const tl of tools) {
    const r = GD.r;
    const mi = a.mhe.find(m => m.tool === tl);
    GD.put(1, tl, { j: 'txt', b: true });
    GD.put(2, { f: `IFERROR(INDEX(MheSum_Fte,MATCH(TRUE,INDEX(EXACT(MheSum_Nama,A${r}),0),0)),0)` }, { j: 'out', fmt: 'n2' });
    GD.put(3, { f: `IFERROR(INDEX(MheSum_Res,MATCH(TRUE,INDEX(EXACT(MheSum_Nama,A${r}),0),0)),0)` }, { j: 'out', fmt: 'n0' });
    GD.put(4, mi?.nama || '—', { j: 'in' }); GD.dd(4, 'L_ItemMhe', false);
    GD.put(5, mi?.mode ?? 'sewa', { j: 'in' }); GD.dd(5, 'L_ModeMhe');
    GD.put(6, mi?.harga ?? null, { j: 'in', fmt: 'rp' }); GD.put(7, mi?.umurBulan ?? null, { j: 'in', fmt: 'n0' }); GD.put(8, mi?.sparePersen ?? 0, { j: 'in', fmt: 'pct' });
    GD.put(9, { f: `IF(C${r}>0,MAX(0,ROUNDUP(C${r}*N(H${r})-1E-9,0)),0)` }, { j: 'out', fmt: 'n0' });
    GD.put(10, { f: `C${r}+I${r}`, v: h.mhe.find(m => m.tool === tl)?.unit }, { j: 'out', fmt: 'n0', b: true });
    GD.put(11, { f: `IF(N(F${r})<=0,0,IF(E${r}="sewa",J${r}*F${r},J${r}*F${r}/MIN(IF(N(G${r})>0,G${r},Kontrak),Kontrak)))` }, { j: 'out', fmt: 'rp', b: true });
    GD.put(12, { f: `IF(E${r}="beli",J${r}*N(F${r}),0)` }, { j: 'out', fmt: 'rp' });
    GD.put(13, { f: `IFERROR(INDEX(IF(E${r}="sewa",D_ItSewa,D_ItBeli),MATCH(D${r},D_ItItem,0)),"")` }, { j: 'out', fmt: 'rp' });
    const hm = h.mhe.find(m => m.tool === tl);
    const eng = h.biaya.find(b => b.kelompok === 'MHE' && mi && (b.deskripsi.startsWith(`${mi.nama} — sewa`) || b.deskripsi.startsWith(`${mi.nama} (`)));
    const nm = `IF(${SN}D${r}="—","",${SN}D${r})`;
    x.lines.push({ kel: 'MHE', tahap: 1, desk: { f: `IF(${SN}E${r}="sewa",${nm}&" — sewa ("&${SN}J${r}&" unit)",${nm}&" ("&${SN}J${r}&" unit) — depresiasi")`, v: eng?.deskripsi }, deskKey: eng?.deskripsi ?? `${mi?.nama ?? tl}`,
      jenis: { f: `IF(${SN}E${r}="beli","Capex","Opex")` }, risk: 'Sedang', sistem: `${SN}$K$${r}`, alok: hm ? alokAngka(hm.alokasi) : MERATA, dasar: eng?.dasar ?? '', v: eng?.biayaBulan,
      nilai: `${SN}$L$${r}`, qty: { f: `${SN}J${r}` }, harga: { f: `${SN}F${r}` }, umur: { f: `IF(${SN}E${r}="beli",MIN(IF(N(${SN}G${r})>0,${SN}G${r},Kontrak),Kontrak),"")` }, uom: 'unit', capex: mi?.mode === 'beli' });
    GD.r++;
  }
  GD.put(1, 'Total estimasi biaya MHE / bulan', { j: 'tot' }); GD.put(11, { f: `SUM(K${m0}:K${Math.max(m0, GD.r - 1)})` }, { j: 'tot', fmt: 'rp' }); GD.r++;
  GD.note('Alat baru di aktivitas: tambahkan di web lalu export ulang (daftar alat mengikuti MHE Summary saat export).');
  void R; void q; void normAlok; void namaAlok;
}

export function tulisIt(x: Ctx) {
  const { IT, a } = x;
  const SN = `'${IT.nama}'!`;
  const it = a.it ?? { kursUsd: 16000, lines: [] };
  IT.lebar(24, 34, 16, 9, 10, 15, 15, 15, 15, 15, 10, 15, 34, 12, 14, 12, 14);
  IT.h2('Kebutuhan IT (format BAP)', 'Bulanan (PUPM, PDPM, Cost/Month, Monthly/Site) & transaksi = biaya bulanan; Yearly ÷ 12; OTC perangkat (hardware, CCTV, device) didepresiasi MIN(umur, kontrak); development, cabling & mandays diamortisasi selama kontrak; atau ditagih terpisah di quotation. Bunga hanya lewat sheet Interest cost.');
  IT.field('Nomor BAP', it.nomorBap ?? '', 'teks', 'in');
  IT.field('Kurs USD (Rp)', it.kursUsd, 'rp', 'in', 'Rp', '', 'KursUsd');
  IT.r++;
  IT.hdr([['Kelompok', true], ['Item', true], ['Cost type', true], ['Qty', true], ['Mata uang', true], ['Harga budget', true], 'Total budget', ['Harga aktual', true], 'Total aktual', ['Perlakuan (OTC)', true], ['Umur (bln)', true], 'Biaya/bln', ['Catatan', true], 'Basis', 'Harga (Rp)', 'Mode', 'Nilai investasi']);
  const r0 = IT.r;
  const aset = KELOMPOK_ASET.map(k => `A{r}=${q(k)}`);
  for (const l of [...it.lines, ...Array.from({ length: 5 }, () => null)]) {
    const r = IT.r;
    IT.put(1, l?.kelompok ?? null, { j: 'in' }); IT.dd(1, 'L_KelompokIT', false);
    IT.put(2, l?.item ?? null, { j: 'in' }); IT.dd(2, 'L_ItKatalog', false);
    IT.put(3, l?.costType ?? null, { j: 'in' }); IT.dd(3, 'L_CostType');
    IT.put(4, l?.qty ?? null, { j: 'in', fmt: 'n2' });
    IT.put(5, l?.mataUang ?? 'IDR', { j: 'in' }); IT.dd(5, 'L_MataUang');
    IT.put(6, l?.hargaBudget ?? null, { j: 'in', fmt: 'rp' });
    IT.put(14, { f: `IF(C${r}="","",IFERROR(INDEX(D_CtBasis,MATCH(C${r},D_CtKode,0)),"Bulanan"))` }, { j: 'out' });
    IT.put(15, { f: `N(F${r})*IF(E${r}="USD",KursUsd,1)` }, { j: 'out', fmt: 'rp' });
    IT.put(7, { f: `N(D${r})*O${r}` }, { j: 'out', fmt: 'rp' });
    IT.put(8, l?.hargaAktual ?? null, { j: 'in', fmt: 'rp' });
    IT.put(9, { f: `IF(H${r}="","—",N(D${r})*H${r}*IF(E${r}="USD",KursUsd,1))` }, { j: 'out', fmt: 'rp' });
    const sekali = l && basisDari(l.costType) === 'Sekali';
    IT.put(10, sekali ? ({ depresiasi: 'Depresiasi', amortisasi: 'Amortisasi', tagih: 'Tagih terpisah' } as const)[perlakuanDari(l)] : null, { j: 'in' }); IT.dd(10, 'L_Perlakuan');
    IT.put(11, sekali ? (l!.umurBulan ?? UMUR_IT_DEFAULT) : null, { j: 'in', fmt: 'n0' });
    const pl = `IF(J${r}<>"",J${r},IF(OR(${aset.map(s => s.replace('{r}', String(r))).join(',')}),"Depresiasi","Amortisasi"))`;
    IT.put(16, { f: `IF(N${r}="","",IF(OR(N${r}="Bulanan",N${r}="Transaksi",N${r}="Tahunan"),"bulanan",IF(${pl}="Depresiasi","beli",IF(${pl}="Amortisasi","sekali","tagih"))))` }, { j: 'out' });
    IT.put(12, { f: `IF(OR(N(D${r})<=0,N(F${r})<=0),0,IF(OR(N${r}="Bulanan",N${r}="Transaksi"),D${r}*O${r},IF(N${r}="Tahunan",D${r}*O${r}/12,IF(P${r}="beli",D${r}*O${r}/MIN(IF(N(K${r})>0,K${r},${UMUR_IT_DEFAULT}),Kontrak),IF(P${r}="sekali",D${r}*O${r}/Kontrak,0)))))` }, { j: 'out', fmt: 'rp', b: true });
    IT.put(13, l?.catatan ?? null, { j: 'in', size: 9 });
    IT.put(17, { f: `IF(AND(N(D${r})>0,N(F${r})>0,OR(P${r}="beli",P${r}="sekali")),D${r}*O${r},0)` }, { j: 'out', fmt: 'rp' });
    const key = l ? (basisDari(l.costType) === 'Tahunan' ? `IT — ${l.item} (tahunan ÷ 12)` : basisDari(l.costType) === 'Sekali' ? `IT — ${l.item} — ${perlakuanDari(l) === 'depresiasi' ? 'depresiasi' : 'amortisasi'}` : `IT — ${l.item}`) : '';
    const eng = d0(x).find(b => b.deskripsi === key);
    x.lines.push({ kel: 'IT', tahap: 1, desk: { f: `IF(${SN}B${r}="","",\"IT — \"&${SN}B${r}&IF(${SN}N${r}="Tahunan"," (tahunan ÷ 12)","")&IF(${SN}P${r}="beli"," — depresiasi",IF(${SN}P${r}="sekali"," — amortisasi","")))`, v: eng?.deskripsi ?? '' }, deskKey: key,
      jenis: { f: `IF(OR(${SN}P${r}="beli",${SN}P${r}="sekali"),"Capex","Opex")` }, risk: 'Rendah', sistem: `${SN}$L$${r}`, alok: [0, 0, 0, 0, 1], dasar: eng?.dasar ?? '', v: eng?.biayaBulan,
      nilai: `${SN}$Q$${r}`, qty: { f: `${SN}D${r}` }, harga: { f: `${SN}O${r}` }, umur: { f: `IF(${SN}P${r}="beli",MIN(IF(N(${SN}K${r})>0,${SN}K${r},${UMUR_IT_DEFAULT}),Kontrak),IF(${SN}P${r}="sekali",Kontrak,""))` }, uom: 'IT', capex: !!l && basisDari(l.costType) === 'Sekali' && perlakuanDari(l) !== 'tagih' });
    IT.r++;
  }
  const r1 = IT.r - 1;
  IT.nmR('It_Basis', 14, r0, r1); IT.nmR('It_Total', 7, r0, r1); IT.nmR('It_Aktual', 9, r0, r1); IT.nmR('It_Biaya', 12, r0, r1); IT.nmR('It_Mode', 16, r0, r1); IT.nmR('It_Item', 2, r0, r1); IT.nmR('It_Nilai', 17, r0, r1);
  IT.r++;
  IT.hdr(['Ringkasan', 'Budget', 'Aktual', 'Selisih']);
  const ring = (l: string, fb: string, fa: string | null) => { const r = IT.r; IT.put(1, l, { j: 'txt' }); IT.put(2, { f: fb }, { j: 'out', fmt: 'rp' }); if (fa) { IT.put(3, { f: fa }, { j: 'out', fmt: 'rp' }); IT.put(4, { f: `C${r}-B${r}` }, { j: 'out', fmt: 'rp' }); } IT.r++; };
  ring('Biaya bulanan (termasuk transaksi)', 'SUMIFS(It_Total,It_Basis,"Bulanan")+SUMIFS(It_Total,It_Basis,"Transaksi")', 'SUMIFS(It_Aktual,It_Basis,"Bulanan")+SUMIFS(It_Aktual,It_Basis,"Transaksi")');
  ring('Biaya tahunan', 'SUMIFS(It_Total,It_Basis,"Tahunan")', 'SUMIFS(It_Aktual,It_Basis,"Tahunan")');
  ring('One time charge (OTC + mandays)', 'SUMIFS(It_Total,It_Basis,"Sekali")', 'SUMIFS(It_Aktual,It_Basis,"Sekali")');
  IT.put(1, 'Biaya IT per bulan (masuk cost model)', { j: 'sub' }); IT.put(2, '', { j: 'sub' }); IT.r++;
  ring('Bulanan + tahunan ÷ 12', 'SUMIFS(It_Biaya,It_Mode,"bulanan")', null);
  ring('Depresiasi perangkat', 'SUMIFS(It_Biaya,It_Mode,"beli")', null);
  ring('Amortisasi OTC / mandays', 'SUMIFS(It_Biaya,It_Mode,"sekali")', null);
  IT.put(1, 'Total IT per bulan', { j: 'tot' }); IT.put(2, { f: 'SUM(It_Biaya)' }, { j: 'tot', fmt: 'rp' }); IT.r++;
  ring('Ditagih terpisah di quotation', 'SUMIFS(It_Total,It_Mode,"tagih")', null);
  IT.nm('ItTagih', 2, IT.r - 1);
}
const d0 = (x: Ctx) => x.d.h.biaya;

export function tulisBiayaLain(x: Ctx) {
  const { BL, a, d } = x;
  const SN = `'${BL.nama}'!`;
  BL.lebar(40, 40, 15, 9, 15, 10, 15, 15, 11, 18, 14, 10, 12, 10, 8, 8, 8, 8, 8);
  BL.h2('Biaya lain', 'Dipisah per klasifikasi sesuai Price Inquiry. Bulanan/sewa = qty × harga per bulan · Beli = nilai ÷ MIN(umur, kontrak) · Sekali = nilai ÷ kontrak. Tanpa bunga — pilih di sheet Interest cost. IT dari sheet IT ikut otomatis (jangan diinput dua kali).');
  // ringkasan per klasifikasi di atas (diisi setelah tabel)
  BL.h3('Ringkasan per klasifikasi');
  BL.hdr(['Klasifikasi', 'Item', 'Nilai (qty × harga)', 'Biaya/bln']);
  const ring0 = BL.r; BL.r += SEKSI_BIAYA.length + 1;
  const itemKat = (id?: number) => x.L0.items.find(z => z.id === id)?.kategori;
  const seksiRows: Record<string, number[]> = {};
  for (const s of SEKSI_BIAYA) {
    const rows = a.costLines.map((c, i) => ({ c, i })).filter(z => seksiDari(z.c, itemKat((z.c as { priceItemId?: number }).priceItemId)) === s.id);
    BL.r++;
    BL.h2(`${s.label}`, s.ket);
    if (s.id === 'startup') {
      const sa = a.startupAuto ?? { aktif: true, persenOpex: 0.5, persenManpower: 0.5 };
      BL.field('Hitung otomatis (startup & implementation)', sa.aktif ? 'Ya' : 'Tidak', 'teks', 'in', '', 'biaya sekali, diamortisasi selama kontrak', 'StartupAktif', 'L_YaTidak');
      BL.field('Startup cost — % dari OPEX per bulan', sa.persenOpex, 'pct', 'in', '', 'OPEX = semua biaya operasi (tahap 1) di luar startup', 'PStartOpex');
      BL.field('OPEX per bulan (dasar)', { f: 'SUMIFS(Rinci_Biaya,Rinci_Tahap,1,Rinci_Kel,"<>Startup")' }, 'rp', 'out', 'Rp/bln', '', 'OpexDasar');
      BL.field('Nilai startup cost', { f: 'PStartOpex*OpexDasar' }, 'rp', 'out', 'Rp', '', 'NilaiStartup');
      BL.field('Startup cost — amortisasi / bln', { f: 'IF(StartupAktif="Ya",ROUND(NilaiStartup/Kontrak,0),0)' }, 'rp', 'out', 'Rp/bln', '', 'StartupBln');
      BL.field('Implementation cost — % dari biaya manpower per bulan', sa.persenManpower, 'pct', 'in', '', 'biaya manpower/bln dasar (sebelum eskalasi)', 'PStartMp');
      BL.field('Nilai implementation cost', { f: 'PStartMp*MpDasarTot' }, 'rp', 'out', 'Rp', '', 'NilaiImpl');
      BL.field('Implementation cost — amortisasi / bln', { f: 'IF(StartupAktif="Ya",ROUND(NilaiImpl/Kontrak,0),0)' }, 'rp', 'out', 'Rp/bln', '', 'ImplBln');
      BL.r++;
    }
    if (s.id === 'consumable') BL.note(`Galon minum bulanan (web): headcount × 1,5 L × ${x.pdIn.hariKerjaBulan ?? 25} hari ÷ 19 L — tambahkan sebagai baris "Air minum galon" bila perlu.`);
    BL.hdr([['Item', true], ['Deskripsi', true], ['Mode', true], ['Qty', true], ['Harga satuan', true], ['Umur (bln)', true], 'Nilai', 'Biaya/bln', ['Risiko', true], ['Alokasi', true], 'Harga DB', 'Seksi', 'Kelompok', 'Risiko ef.', 'Sto', 'HIn', 'HOut', 'VAS', 'Man']);
    const sr: number[] = []; seksiRows[s.id] = sr;
    for (const z of [...rows, null, null]) {
      const r = BL.r; sr.push(r);
      const c = z?.c as (typeof a.costLines)[number] | undefined;
      const item = c ? x.L0.items.find(y => y.id === (c as { priceItemId?: number }).priceItemId)?.item ?? 'Manual' : 'Manual';
      BL.put(1, item, { j: 'in' }); BL.dd(1, `L_Seksi_${s.id}`, false);
      BL.put(2, c?.deskripsi ?? null, { j: 'in' });
      BL.put(3, c?.mode ?? s.mode, { j: 'in' }); BL.dd(3, 'L_Mode');
      BL.put(4, c?.qty ?? null, { j: 'in', fmt: 'n2' }); BL.put(5, c?.hargaSatuan ?? null, { j: 'in', fmt: 'rp' });
      BL.put(6, c?.umurBulan ?? (s.mode === 'beli' && !c ? 60 : null), { j: 'in', fmt: 'n0' });
      BL.put(7, { f: `N(D${r})*N(E${r})` }, { j: 'out', fmt: 'rp' });
      BL.put(8, { f: `IF(OR(C${r}="bulanan",C${r}="sewa"),G${r},IF(C${r}="beli",IF(G${r}>0,G${r}/MIN(IF(N(F${r})>0,F${r},Kontrak),Kontrak),0),IF(C${r}="sekali",G${r}/Kontrak,0)))` }, { j: 'out', fmt: 'rp', b: true });
      BL.put(9, c?.kategoriRisiko ?? 'Default', { j: 'in' }); BL.dd(9, 'L_Risiko');
      const nmA = c ? namaAlok(c.alokasi, { storage: 0.4, handling_in: 0.3, handling_out: 0.3 }) : 'Merata';
      BL.put(10, nmA ?? 'Kustom (dari web)', { j: 'in' }); BL.dd(10, 'L_Alokasi');
      BL.put(11, { f: `IFERROR(INDEX(IF(OR(C${r}="sewa",C${r}="bulanan"),D_ItSewa,D_ItBeli),MATCH(A${r},D_ItItem,0)),"")` }, { j: 'out', fmt: 'rp' });
      BL.put(12, s.id, { j: 'out', size: 8 }); const kel = c?.kelompok ?? s.kelompok; BL.put(13, kel, { j: 'out', size: 8 });
      BL.put(14, { f: `IF(OR(I${r}="Default",I${r}=""),IF(C${r}="sekali","Tinggi",IFERROR(INDEX(D_RiskRisiko,MATCH(M${r},D_RiskKelompok,0)),"Sedang")),I${r})` }, { j: 'out', size: 9 });
      const kus = normAlok(c?.alokasi, { storage: 0.4, handling_in: 0.3, handling_out: 0.3 });
      const kolAl = ['Storage', 'HIn', 'HOut', 'Vas', 'Man'];
      BUCKETS.forEach((b, k) => BL.put(15 + k, { f: `IF(J${r}="Kustom (dari web)",${+kus[b].toFixed(6)},IFERROR(INDEX(D_Al${kolAl[k]},MATCH(J${r},D_AlNama,0)),${MERATA[k]}))` }, { j: 'out', fmt: 'pct', size: 8 }));
      const key = c ? (c.mode === 'beli' ? `${c.deskripsi} — depresiasi` : c.mode === 'sekali' ? `${c.deskripsi} — amortisasi` : c.deskripsi) : '';
      const eng = d.h.biaya.find(b => b.deskripsi === key);
      x.lines.push({ kel, tahap: 1, desk: { f: `IF(${SN}B${r}="","",${SN}B${r}&IF(${SN}C${r}="beli"," — depresiasi",IF(${SN}C${r}="sekali"," — amortisasi","")))`, v: key }, deskKey: key,
        jenis: { f: `IF(OR(${SN}C${r}="beli",${SN}C${r}="sekali"),"Capex","Opex")` }, risk: { f: `${SN}N${r}` }, sistem: `${SN}$H$${r}`,
        alok: BUCKETS.map((_, k) => ({ f: `${SN}${R(15 + k, r)}` })), dasar: eng?.dasar ?? '', v: eng?.biayaBulan, nilai: `IF(OR(${SN}C${r}="beli",${SN}C${r}="sekali"),${SN}$G$${r},0)`,
        qty: { f: `${SN}D${r}` }, harga: { f: `${SN}E${r}` }, umur: { f: `IF(${SN}C${r}="beli",MIN(IF(N(${SN}F${r})>0,${SN}F${r},Kontrak),Kontrak),IF(${SN}C${r}="sekali",Kontrak,""))` }, uom: c?.mode ?? s.mode,
        capex: !!c && (c.mode === 'beli' || c.mode === 'sekali') });
      BL.r++;
    }
    BL.put(1, { f: `"${s.label.split(' (')[0]}: "&COUNTIF(B${sr[0]}:B${sr[sr.length - 1]},"?*")&" item"` }, { j: 'sub' });
    BL.put(8, { f: `SUM(H${sr[0]}:H${sr[sr.length - 1]})` }, { j: 'sub', fmt: 'rp' }); BL.r++;
  }
  // baris ringkasan
  let rr = ring0;
  for (const s of SEKSI_BIAYA) {
    const sr = seksiRows[s.id];
    BL.put(1, s.label, { j: 'txt' }, rr); BL.put(2, { f: `COUNTIF(B${sr[0]}:B${sr[sr.length - 1]},"?*")` }, { j: 'out', fmt: 'n0' }, rr);
    BL.put(3, { f: `SUM(G${sr[0]}:G${sr[sr.length - 1]})` }, { j: 'out', fmt: 'rp' }, rr); BL.put(4, { f: `SUM(H${sr[0]}:H${sr[sr.length - 1]})` }, { j: 'out', fmt: 'rp' }, rr); rr++;
  }
  BL.put(1, 'Total biaya lain per bulan (tanpa bunga)', { j: 'tot' }, rr); BL.put(2, '', { j: 'tot' }, rr); BL.put(3, '', { j: 'tot' }, rr); BL.put(4, { f: `SUM(D${ring0}:D${rr - 1})` }, { j: 'tot', fmt: 'rp' }, rr);
  // startup otomatis → baris biaya tahap 2
  const st = d.h.biaya.find(b => b.deskripsi === 'Startup cost (otomatis) — amortisasi'), im = d.h.biaya.find(b => b.deskripsi === 'Implementation cost (otomatis) — amortisasi');
  x.lines.push({ kel: 'Startup', tahap: 2, desk: 'Startup cost (otomatis) — amortisasi', deskKey: 'Startup cost (otomatis) — amortisasi', jenis: 'Capex', risk: 'Tinggi', sistem: 'StartupBln', alok: MERATA, dasar: st?.dasar ?? '', v: st?.biayaBulan, nilai: 'IF(StartupAktif="Ya",NilaiStartup,0)', capex: true, umur: { f: 'Kontrak' }, qty: 1, harga: { f: 'NilaiStartup' }, uom: 'sekali' });
  x.lines.push({ kel: 'Startup', tahap: 2, desk: 'Implementation cost (otomatis) — amortisasi', deskKey: 'Implementation cost (otomatis) — amortisasi', jenis: 'Capex', risk: 'Tinggi', sistem: 'ImplBln', alok: MERATA, dasar: im?.dasar ?? '', v: im?.biayaBulan, nilai: 'IF(StartupAktif="Ya",NilaiImpl,0)', capex: true, umur: { f: 'Kontrak' }, qty: 1, harga: { f: 'NilaiImpl' }, uom: 'sekali' });

  // ===================== Listrik
  BL.r++;
  BL.h2('Listrik', 'Simulasi Utilities (Price Inquiry) atau peralatan per titik. Peralatan: Σ watt × qty × jam/hari × hari operasional/bln ÷ 1000 × tarif.');
  const sim = a.listrikSimulasi;
  BL.field('Sumber biaya listrik', sim ? 'Simulasi Utilities (Price Inquiry)' : 'Pilih peralatan per titik', 'teks', 'in', '', '', 'ListrikSumber', 'L_ListrikSumber');
  BL.field('Simulasi — nama', sim?.nama ?? '', 'teks', 'in', '', 'dari kalkulator listrik (Price Inquiry › Utilities)', 'SimNama');
  BL.field('Simulasi — biaya listrik per bulan', sim?.totalBulan ?? null, 'rp', 'in', 'Rp/bln', 'energi + kVArh + beban', 'SimTotal');
  BL.field('Simulasi — pemakaian', sim?.kwhBulan ?? null, 'n0', 'in', 'kWh/bln', '', 'SimKwh');
  BL.field('Golongan tarif PLN', a.golonganListrik, 'teks', 'in', '', '', 'Golongan', 'L_Golongan', false);
  const tDb = x.L0.tarif.find(z => z.golongan === a.golonganListrik)?.tarif_kwh;
  BL.field('Tarif per kWh (manual, kosong = golongan)', tDb != null && Math.abs(Number(tDb) - a.tarifListrikKwh) < 1e-6 ? null : a.tarifListrikKwh, 'n2', 'in', 'Rp/kWh', '', 'TarifKwhManual');
  BL.field('Tarif per kWh dipakai', { f: `IF(TarifKwhManual<>"",TarifKwhManual,IFERROR(INDEX(D_PlnTarif,MATCH(Golongan,D_PlnGolongan,0)),${a.tarifListrikKwh}))`, v: a.tarifListrikKwh }, 'n2', 'out', 'Rp/kWh', '', 'TarifKwh');
  BL.hdr([['Peralatan', true], ['Watt', true], ['Qty', true], ['Jam/hari', true], 'kWh/hari', 'Watt DB']);
  const l0 = BL.r;
  for (const l of [...a.listrik, null, null, null]) {
    const r = BL.r;
    BL.put(1, l?.item ?? null, { j: 'in' }); BL.dd(1, 'L_AlatListrik', false);
    BL.put(2, l?.watt ?? null, { j: 'in', fmt: 'n0' }); BL.put(3, l?.qty ?? null, { j: 'in', fmt: 'n0' }); BL.put(4, l?.jamPerHari ?? null, { j: 'in', fmt: 'n1' });
    BL.put(5, { f: `N(B${r})*N(C${r})*N(D${r})/1000` }, { j: 'out', fmt: 'n2' });
    BL.put(6, { f: `IFERROR(INDEX(D_ItWatt,MATCH(A${r},D_ItItem,0)),"")` }, { j: 'out', fmt: 'n0' });
    BL.r++;
  }
  BL.put(1, 'Total kWh per hari', { j: 'sub' }); BL.put(5, { f: `SUM(E${l0}:E${BL.r - 1})` }, { j: 'sub', fmt: 'n2' }); BL.nm('KwhHari', 5); BL.r++;
  BL.field('Pemakaian per bulan (peralatan)', { f: 'KwhHari*HariOpsBln' }, 'n0', 'out', 'kWh/bln', '× hari operasional/bln (kalender, sheet Hasil)', 'KwhBln');
  const pakaiSim = 'AND(LEFT(ListrikSumber,8)="Simulasi",N(SimTotal)>0)';
  const ls = d.h.biaya.find(b => b.kelompok === 'Utilitas');
  BL.field('Biaya listrik per bulan (masuk cost model)', { f: `IF(${pakaiSim},SimTotal,KwhBln*TarifKwh)`, v: ls?.biayaSistem ?? ls?.biayaBulan }, 'rp', 'out', 'Rp/bln', '', 'ListrikBln');
  x.lines.push({ kel: 'Utilitas', tahap: 1, desk: { f: `IF(${pakaiSim},"Listrik — "&SimNama,"Listrik")`, v: ls?.deskripsi ?? 'Listrik' }, deskKey: ls?.deskripsi ?? 'Listrik', jenis: 'Opex', risk: 'Rendah', sistem: 'ListrikBln',
    alok: [0.6, 0.2, 0.2, 0, 0], dasar: ls?.dasar ?? '', v: ls?.biayaBulan, qty: { f: `IF(${pakaiSim},SimKwh,KwhBln)` }, harga: { f: `IF(${pakaiSim},"",TarifKwh)` }, uom: 'kWh/bln' });
  void RISIKO_DEFAULT; void ALOKASI;
}

export function tulisInterest(x: Ctx) {
  const { IC, a, d } = x;
  const SN = `'${IC.nama}'!`;
  const ic = { bungaTahun: 0.09, metode: 'flat' as const, items: [] as NonNullable<typeof a.interestCost>['items'], ...(a.interestCost ?? {}) };
  IC.lebar(10, 56, 14, 15, 17, 16, 12, 16, 10, 15, 15, 16);
  IC.h2('Interest cost — simulasi pinjaman bank', `Bunga tidak dihitung otomatis — hanya capex / baris manual yang dipilih di sini. Flat: total bunga = pokok × bunga/12 × tenor · Menurun: pokok × bunga/12 × (tenor+1) ÷ 2 · Interest/bln = total bunga ÷ kontrak. Ikut ke total cost, rate card, quotation.`);
  IC.field('Bunga pinjaman (%/tahun)', ic.bungaTahun, 'pct', 'in', '/thn', '', 'BungaBank');
  IC.field('Metode bunga', ic.metode === 'menurun' ? 'Menurun' : 'Flat', 'teks', 'in', '', 'Flat = bunga atas pokok penuh · Menurun = pokok dicicil rata', 'MetodeBunga', 'L_Metode');
  IC.field('Ikutkan bunga working capital', ic.workingCapital ? 'Ya' : 'Tidak', 'teks', 'in', '', 'selisih payment term customer vs AP supplier × bunga modal (master Finance)', 'WCap', 'L_YaTidak');
  IC.field('Bunga modal (master Finance)', d.m.finance.bungaModalTahun, 'pct', 'in', '/thn', 'dipakai working capital', 'BungaModal');
  IC.field('AP supplier (master Finance)', d.m.finance.apHari, 'n0', 'in', 'hari', '', 'APHari');
  IC.field('Contoh 1 bulan: Rp100 jt × bunga ÷ 12', { f: '100000000*BungaBank/12' }, 'rp', 'out', 'Rp/bln');
  IC.r++;
  IC.h3('1 · Pilih capex & 2 · Pinjaman yang disimulasikan');
  IC.note('Hanya capex (barang dibeli → depresiasi, biaya sekali → amortisasi). Pokok default = nilai investasinya; isi "Pokok (manual)" / "Tenor (manual)" untuk mengganti. Tenor kosong = durasi kontrak.');
  IC.hdr([['Pilih', true], 'Capex', 'Kelompok', 'Biaya/bln', 'Nilai capex (pokok default)', ['Pokok (manual)', true], ['Tenor (manual)', true], 'Pokok', 'Tenor', 'Bunga/bln awal', 'Total bunga', 'Interest cost/bln']);
  const i0 = IC.r;
  const kandidat = x.lines.filter(l => l.capex && l.nilai);
  const rowInt = (r: number) => {
    IC.put(10, { f: `H${r}*BungaBank/12` }, { j: 'out', fmt: 'rp' }, r);
    IC.put(11, { f: `IF(MetodeBunga="Menurun",H${r}*BungaBank/12*(I${r}+1)/2,H${r}*BungaBank/12*I${r})` }, { j: 'out', fmt: 'rp' }, r);
    IC.put(12, { f: `IF(A${r}="Ya",ROUND(K${r}/Kontrak,0),0)` }, { j: 'out', fmt: 'rp', b: true }, r);
  };
  for (const l of kandidat) {
    const r = IC.r;
    const it = ic.items.find(z => z.sumber === l.deskKey);
    IC.put(1, it && it.aktif ? 'Ya' : 'Tidak', { j: 'in', al: 'center' }); IC.dd(1, 'L_YaTidak');
    IC.put(2, l.desk && typeof l.desk === 'object' ? { f: l.desk.f, v: l.desk.v } : l.desk, { j: 'out' });
    IC.put(3, l.kel, { j: 'txt' }); IC.put(4, { f: l.sistem }, { j: 'out', fmt: 'rp' }); IC.put(5, { f: l.nilai! }, { j: 'out', fmt: 'rp' });
    IC.put(6, it?.pokok ?? null, { j: 'in', fmt: 'rp' }); IC.put(7, it?.tenorBulan ?? null, { j: 'in', fmt: 'n0' });
    IC.put(8, { f: `IF(F${r}<>"",F${r},E${r})` }, { j: 'out', fmt: 'rp' }); IC.put(9, { f: `IF(N(G${r})>0,G${r},Kontrak)` }, { j: 'out', fmt: 'n0' });
    rowInt(r);
    const eng = it ? d.h.biaya.find(b => b.deskripsi === `Interest cost — ${it.deskripsi}`) : undefined;
    x.lines.push({ kel: 'Interest cost', tahap: 3, desk: { f: `"Interest cost — "&${SN}B${r}`, v: `Interest cost — ${l.deskKey}` }, deskKey: `Interest cost — ${it?.deskripsi ?? l.deskKey}`, jenis: 'Interest', risk: 'Rendah',
      sistem: `${SN}$L$${r}`, alok: [], alokDari: l, dasar: eng?.dasar ?? '', v: eng?.biayaBulan, qty: { f: `${SN}H${r}` }, harga: { f: `${SN}K${r}` }, umur: { f: `${SN}I${r}` }, uom: 'pokok' } as Line);
    IC.r++;
  }
  IC.r++;
  IC.h3('Baris manual (pinjaman lain, mis. sewa gudang dibayar di muka)');
  IC.hdr([['Aktif', true], ['Deskripsi', true], '', '', '', ['Pokok', true], ['Tenor (manual)', true], 'Pokok', 'Tenor', 'Bunga/bln awal', 'Total bunga', 'Interest cost/bln']);
  for (const it of [...ic.items.filter(z => !z.sumber), null, null, null]) {
    const r = IC.r;
    IC.put(1, it ? (it.aktif ? 'Ya' : 'Tidak') : 'Tidak', { j: 'in', al: 'center' }); IC.dd(1, 'L_YaTidak');
    IC.put(2, it?.deskripsi ?? null, { j: 'in' });
    IC.put(6, it?.pokok ?? null, { j: 'in', fmt: 'rp' }); IC.put(7, it?.tenorBulan ?? null, { j: 'in', fmt: 'n0' });
    IC.put(8, { f: `N(F${r})` }, { j: 'out', fmt: 'rp' }); IC.put(9, { f: `IF(N(G${r})>0,G${r},Kontrak)` }, { j: 'out', fmt: 'n0' });
    rowInt(r);
    const eng = it ? d.h.biaya.find(b => b.deskripsi === `Interest cost — ${it.deskripsi}`) : undefined;
    x.lines.push({ kel: 'Interest cost', tahap: 3, desk: { f: `IF(${SN}B${r}="","","Interest cost — "&${SN}B${r})`, v: eng?.deskripsi ?? '' }, deskKey: `Interest cost — ${it?.deskripsi ?? ''}`, jenis: 'Interest', risk: 'Rendah',
      sistem: `${SN}$L$${r}`, alok: MERATA, dasar: eng?.dasar ?? '', v: eng?.biayaBulan, qty: { f: `${SN}H${r}` }, harga: { f: `${SN}K${r}` }, umur: { f: `${SN}I${r}` }, uom: 'pokok' });
    IC.r++;
  }
  IC.r++;
  IC.field('Total pokok dipilih', { f: `SUMIFS(H${i0}:H${IC.r - 2},A${i0}:A${IC.r - 2},"Ya")` }, 'rp', 'out', 'Rp');
  IC.field('Total interest cost / bln', { f: `SUM(L${i0}:L${IC.r - 3})`, v: d.h.interestCost.biayaBulan }, 'rp', 'out', 'Rp/bln', '', 'InterestBln');
  IC.field('Selama kontrak', { f: 'InterestBln*Kontrak' }, 'rp', 'out', 'Rp');
  // Working capital (tahap 4) & overhead (tahap 5)
  const wc = d.h.biaya.find(b => b.deskripsi === 'Interest cost — working capital (payment term)');
  x.lines.push({ kel: 'Interest cost', tahap: 4, desk: 'Interest cost — working capital (payment term)', deskKey: 'Interest cost — working capital (payment term)', jenis: 'Interest', risk: 'Rendah',
    sistem: 'IF(AND(WCap="Ya",PaymentTerm-APHari>0),SUMIFS(Rinci_Biaya,Rinci_Tahap,"<=3")*(PaymentTerm-APHari)/30*BungaModal/12,0)', alok: MERATA, dasar: wc?.dasar ?? 'biaya bulanan × (payment term − AP) ÷ 30 × bunga modal/12', v: wc?.biayaBulan });
  const oh = d.h.biaya.find(b => b.kelompok === 'Overhead');
  x.lines.push({ kel: 'Overhead', tahap: 5, desk: 'Overhead', deskKey: 'Overhead', jenis: 'Opex', risk: 'Rendah', sistem: 'SUMIFS(Rinci_Biaya,Rinci_Tahap,"<=4")*Overhead', alok: MERATA, dasar: oh?.dasar ?? '% overhead × subtotal', v: oh?.biayaBulan });
}
