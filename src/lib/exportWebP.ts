// Sheet "Produk" — sama dengan tab Produk di web: daftar SKU (input) + turunan per baris (rumus), aturan berat → level rak,
// ringkasan tertimbang. Rumus mengikuti src/lib/produk.ts (hitungProduk / turunanProduk).
import { type Ctx } from '@/lib/exportWebUtil';
import { ATURAN_BERAT_DEFAULT, SIMPAN, kelasRakDari, produkEfektif, hitungProduk, paletDariSpace, paletUntuk } from '@/lib/produk';
import { lengkapiSpaceExcel } from '@/lib/engine/space';

export function tulisProduk(x: Ctx) {
  const { PR, a, d } = x;
  PR.lebar(14, 30, 10, 9, 9, 9, 10, 10, 11, 9, 11, 14, 12, 18, 10, 10, 11, 9, 11, 11, 10, 12, 12, 9, 8, 11, 9, 10, 16, 44, 18, 12, 11);
  const at = a.aturanBerat ?? ATURAN_BERAT_DEFAULT;
  const daftar = produkEfektif(a.produk, a.volumes, a.profilVolume, d.t.customer);
  const levelRak = Math.max(1, d.h.space.levelRak || 1);
  const sx = lengkapiSpaceExcel(a.space.excel); const dimPalet = paletDariSpace(sx); const palDom = paletUntuk({}, dimPalet);

  PR.h2('Aturan berat per palet', 'Batas berat per palet → level rak tertinggi (level 1 = lantai / beam terbawah). Berat > kapasitas beam → hanya lantai (block / floor).');
  { const kr = kelasRakDari(at); PR.field('Jenis rak (standar kapasitas)', `${kr.kelas?.nama ?? 'Custom'}${kr.diubah ? ' — angka diubah manual' : ''}`, 'teks', 'out', '', kr.kelas?.ket ?? ''); }
  PR.field('Berat palet kayu kosong (tare)', at.tarePaletKg, 'n1', 'in', 'kg', 'ditambahkan ke berat muatan (kecuali UOM palet)', 'PrTare');
  PR.field('Kapasitas beam per posisi', at.kapPosisiKg, 'n0', 'in', 'kg/posisi', 'lebih berat → lantai saja', 'PrKap');
  PR.field('Level rak (Warehouse Planning)', { f: 'MAX(1,RackLevel)', v: levelRak }, 'n0', 'out', 'level', '', 'PrLevelRak');
  PR.field('Palet default (dominan) — panjang', { f: 'PalP*100', v: palDom.pCm }, 'n1', 'out', 'cm', 'Key assumption → Jenis palet', 'PrPalP');
  PR.field('Palet default (dominan) — lebar', { f: 'PalL*100', v: palDom.lCm }, 'n1', 'out', 'cm', 'dipakai bila kolom Jenis palet kosong', 'PrPalL');
  PR.field('Palet default (dominan) — tebal', { f: 'INDEX(PalTipeT,MATCH(PalDominan,PalTipeNama,0))/10', v: palDom.tinggiCm }, 'n1', 'out', 'cm', '', 'PrPalT');
  PR.hdr([['Berat maks / palet (kg)', true, 'Urutkan dari kecil ke besar'], ['Level maks', true, '99 = semua level']]);
  const batas = [...at.batas].sort((p, q) => p.kgMaks - q.kgMaks);
  const b0 = PR.r;
  for (const r of [...batas, null, null]) { PR.put(1, r?.kgMaks ?? null, { j: 'in', fmt: 'n0' }); PR.put(2, r?.levelMaks ?? null, { j: 'in', fmt: 'n0' }); PR.r++; }
  PR.nmR('PrBatasKg', 1, b0, PR.r - 1); PR.nmR('PrBatasLv', 2, b0, PR.r - 1);
  PR.note('Di atas batas terbesar → level 1 / lantai.');

  PR.r++;
  PR.h2('Daftar produk / SKU', 'Sel putih tulang = input (sama dengan kolom di web). Dimensi per UOM; satuan kosong = otomatis (angka > 250 untuk palet / > 600 untuk UOM lain dibaca mm). UOM palet: UPP = 1, berat = berat kotor 1 palet, tinggi = T.');
  PR.hdr([['Kode', true], ['Nama', true], ['UOM', true], ['P', true], ['L', true], ['T', true], ['Satuan dim', true, 'cm / mm / kosong = otomatis'], ['CBM/UOM manual', true, 'Dipakai bila P×L×T kosong'],
    ['Berat/UOM (kg)', true], ['UPP', true, 'UOM per palet'], ['Qty stok', true], ['Kategori', true], ['Zona', true], ['Cara simpan', true], ['Level maks manual', true],
    ['Satuan ef.', false, 'cm/mm efektif'], ['CBM/UOM', false, 'P×L×T (cm) ÷ 1.000.000'], ['UPP ef.', false, 'UOM palet → 1'], ['Berat/palet (kg)', false, 'UPP × berat + tare (palet: berat)'],
    ['CBM/palet', false, 'UPP × CBM/UOM'], ['Palet', false, 'ROUNDUP(qty ÷ UPP)'], ['Total kg', false], ['Total CBM', false], ['Per layer', false, 'Susunan terbaik di palet jenis terpilih (kolom AE; kosong = dominan)'],
    ['Layer', false, 'ROUNDUP(UPP ÷ per layer)'], ['Tinggi muatan (mm)', false, '(layer × T + tebal palet PrPalT) × 10'], ['Level maks', false, 'Aturan berat / manual, maks level rak'],
    ['Hanya lantai', false, 'Berat/palet > kapasitas beam'], ['Cara simpan ef.', false], ['Catatan (sistem)', false], ['Jenis palet', true, 'Nama dari Key assumption → Jenis palet; kosong = dominan'], ['Isi / layer manual', true, 'Konfigurasi palet; kosong = otomatis (kolom X)'], ['Layer manual', true, 'Konfigurasi palet; kosong = ROUNDUP(UPP ÷ isi/layer)']]);
  const p0 = PR.r;
  const simpanL = (v?: string) => SIMPAN.find(s => s.v === (v ?? 'otomatis'))?.v ?? 'otomatis';
  for (const z of [...daftar, null, null, null]) {
    const r = PR.r;
    PR.put(1, z?.kode ?? null, { j: 'in' }); PR.put(2, z?.nama ?? null, { j: 'in' }); PR.put(3, z?.uom ?? null, { j: 'in' });
    PR.put(4, z?.p ?? null, { j: 'in', fmt: 'n1' }); PR.put(5, z?.l ?? null, { j: 'in', fmt: 'n1' }); PR.put(6, z?.t ?? null, { j: 'in', fmt: 'n1' });
    PR.put(7, z?.satuanDim ?? null, { j: 'in', al: 'center' }); PR.put(8, z?.cbm ?? null, { j: 'in', fmt: 'x' });
    PR.put(9, z?.beratKg ?? null, { j: 'in', fmt: 'n2' }); PR.put(10, z?.upp ?? null, { j: 'in', fmt: 'n0' }); PR.put(11, z?.qty ?? null, { j: 'in', fmt: 'n0' });
    PR.put(12, z?.kategori ?? null, { j: 'in' }); PR.put(13, z?.zona ?? null, { j: 'in' }); PR.put(14, z ? simpanL(z.simpan) : null, { j: 'in' }); PR.put(15, z?.levelMaks || null, { j: 'in', fmt: 'n0' });
    const pal = `ISNUMBER(SEARCH("pal",LOWER(C${r})))`;
    const f = `IF(P${r}="mm",0.1,IF(P${r}="m",100,1))`;
    const dimOk = `AND(N(D${r})>0,N(E${r})>0,N(F${r})>0)`;
    const h = z ? hitungProduk(z, at, levelRak, sx.rak.productMm, dimPalet) : null;
    PR.put(16, { f: `IF(A${r}&B${r}="","",IF(G${r}<>"",G${r},IF(MAX(N(D${r}),N(E${r}),N(F${r}))>IF(${pal},250,600),"mm","cm")))` }, { j: 'out', al: 'center' });
    PR.put(17, { f: `IF(P${r}="",0,IF(${dimOk},N(D${r})*${f}*N(E${r})*${f}*N(F${r})*${f}/1000000,N(H${r})))`, v: h?.cbmUnit }, { j: 'out', fmt: 'x' });
    PR.put(18, { f: `IF(P${r}="",0,IF(${pal},1,MAX(0,N(J${r}))))` }, { j: 'out', fmt: 'n0' });
    PR.put(19, { f: `IF(P${r}="",0,IF(${pal},N(I${r}),R${r}*N(I${r})+IF(R${r}>0,PrTare,0)))`, v: h?.beratPaletKg }, { j: 'out', fmt: 'n1' });
    PR.put(20, { f: `R${r}*Q${r}`, v: h?.cbmPalet }, { j: 'out', fmt: 'n3' });
    PR.put(21, { f: `IF(R${r}>0,ROUNDUP(N(K${r})/R${r}-1E-9,0),0)`, v: h?.palet }, { j: 'out', fmt: 'n0', b: true });
    PR.put(22, { f: `N(K${r})*N(I${r})` }, { j: 'out', fmt: 'n0' });
    PR.put(23, { f: `N(K${r})*Q${r}` }, { j: 'out', fmt: 'n2' });
    const dp = `N(D${r})*${f}`, dl = `N(E${r})*${f}`;
    const jp = z?.paletTipe ? dimPalet.tipe.find(t => t.id === z.paletTipe)?.nama ?? null : null;
    PR.put(31, jp, { j: 'in' }); PR.dd(31, 'PalTipeNama', true, r);
    PR.put(32, z && Number(z.perLayer) > 0 ? z.perLayer! : null, { j: 'in', fmt: 'n0' }); PR.put(33, z && Number(z.layer) > 0 ? z.layer! : null, { j: 'in', fmt: 'n0' });
    const pP = `(IFERROR(INDEX(PalTipeP,MATCH(AE${r},PalTipeNama,0)),PalP)*100)`, pL = `(IFERROR(INDEX(PalTipeL,MATCH(AE${r},PalTipeNama,0)),PalL)*100)`;
    const pT = `(IFERROR(INDEX(PalTipeT,MATCH(AE${r},PalTipeNama,0))/10,PrPalT))`;
    PR.put(24, { f: `IF(P${r}="",0,IF(${pal},IF(${dimOk},1,0),IF(N(AF${r})>0,AF${r},IF(${dimOk},MAX(INT(${pP}/(${dp})+1E-9)*INT(${pL}/(${dl})+1E-9),INT(${pP}/(${dl})+1E-9)*INT(${pL}/(${dp})+1E-9)),0))))`, v: h?.perLayer }, { j: 'out', fmt: 'n0' });
    PR.put(25, { f: `IF(AND(NOT(${pal}),N(AG${r})>0),AG${r},IF(AND(X${r}>0,R${r}>0),ROUNDUP(R${r}/X${r}-1E-9,0),0))`, v: h?.layer }, { j: 'out', fmt: 'n0' });
    PR.put(26, { f: `IF(P${r}="",0,IF(${pal},IF(${dimOk},N(F${r})*${f}*10,0),IF(Y${r}>0,(Y${r}*N(F${r})*${f}+${pT})*10,0)))`, v: h?.tinggiMuatanMm }, { j: 'out', fmt: 'n0' });
    const lvBerat = `IF(S${r}>0,IFERROR(INDEX(PrBatasLv,MATCH(TRUE,INDEX((PrBatasKg>=S${r})*(PrBatasKg<>"")>0,0),0)),1),99)`;
    PR.put(28, { f: `IF(P${r}="","",IF(S${r}>PrKap,"Ya","Tidak"))` }, { j: 'out', al: 'center' });
    PR.put(27, { f: `IF(P${r}="",0,MIN(IF(AB${r}="Ya",1,IF(N(O${r})>0,O${r},${lvBerat})),PrLevelRak))`, v: h?.levelMaks }, { j: 'out', fmt: 'n0', b: true });
    PR.put(29, { f: `IF(P${r}="","",IF(OR(N${r}="",N${r}="otomatis"),IF(AB${r}="Ya","floor","spr"),N${r}))`, v: h?.caraSimpan }, { j: 'out', al: 'center' });
    PR.put(30, h?.peringatan.join(' · ') || null, { j: 'none', size: 8, color: 'FF9A3412', wrap: false });
    PR.r++;
  }
  const p1 = PR.r - 1;
  PR.nmR('PrBeratPal', 19, p0, p1); PR.nmR('PrSimpanEf', 29, p0, p1);
  PR.put(1, 'Total', { j: 'tot' }); PR.put(2, { f: `COUNTIF(B${p0}:B${p1},"?*")&" SKU"` }, { j: 'tot' });
  for (const c of [21, 22, 23]) PR.put(c, { f: `SUM(${String.fromCharCode(64 + c)}${p0}:${String.fromCharCode(64 + c)}${p1})` }, { j: 'tot', fmt: c === 23 ? 'n2' : 'n0' });
  PR.r += 2;
  PR.h2('Turunan (rata-rata tertimbang)', 'Dipakai web untuk mengisi Volume & Parameter muatan saat Produk menjadi sumber data (tombol terapkan / sinkron di tab Produk).');
  PR.field('Total palet', { f: `SUMPRODUCT((R${p0}:R${p1}>0)*U${p0}:U${p1})` }, 'n0', 'out', 'palet', '', 'PrPalet');
  PR.field('Total qty (UOM)', { f: `SUMPRODUCT((R${p0}:R${p1}>0)*K${p0}:K${p1})` }, 'n0', 'out', 'UOM', '', 'PrQty');
  PR.field('Berat rata-rata per UOM', { f: `IF(PrQty>0,SUMPRODUCT((R${p0}:R${p1}>0)*V${p0}:V${p1})/PrQty,0)` }, 'n2', 'out', 'kg', 'tertimbang qty');
  PR.field('CBM rata-rata per UOM', { f: `IF(PrQty>0,SUMPRODUCT((R${p0}:R${p1}>0)*W${p0}:W${p1})/PrQty,0)` }, 'x', 'out', 'm³', 'tertimbang qty');
  PR.field('Berat rata-rata per palet', { f: `IF(PrPalet>0,SUMPRODUCT((R${p0}:R${p1}>0)*U${p0}:U${p1}*S${p0}:S${p1})/PrPalet,0)` }, 'n1', 'out', 'kg', 'tertimbang palet');
  PR.field('CBM rata-rata per palet', { f: `IF(PrPalet>0,SUMPRODUCT((R${p0}:R${p1}>0)*U${p0}:U${p1}*T${p0}:T${p1})/PrPalet,0)` }, 'n3', 'out', 'm³', 'tertimbang palet');
  PR.field('UPP rata-rata', { f: 'IF(PrPalet>0,PrQty/PrPalet,0)' }, 'n1', 'out', 'UOM/palet', 'qty ÷ palet');
  PR.field('Porsi palet di lantai', { f: `IF(PrPalet>0,SUMPRODUCT((R${p0}:R${p1}>0)*U${p0}:U${p1}*((AB${p0}:AB${p1}="Ya")+(AC${p0}:AC${p1}="floor")+(AC${p0}:AC${p1}="block")>0))/PrPalet,0)` }, 'pct', 'out', '', 'hanya lantai / floor / block');
  PR.note(daftar.some(z => z.otomatis) ? 'Baris otomatis = dari Key assumption & Volume (belum ada produk manual di web).' : 'Daftar = produk yang diisi di tab Produk web.');
}
