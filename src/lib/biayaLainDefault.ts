// Daftar default Technology & Equipment → Office, Stationery, Consumable, Pallet, HSE & Fire Protection, Services, Asuransi.
// Qty dihitung dari data yang sudah diinput (manpower Value Stream Mapping, luas & office Warehouse Planning, posisi palet,
// volume & order, kategori bisnis, UMK lokasi). Harga dari Price Inquiry (price_items). Semua baris tetap bisa diubah / dihapus.
// Baris default menyimpan `kunci` + `qtyDefault`: selama qty belum diubah manual, qty ikut data tender (sinkronBiaya).
import type { CostLineInput, Kelompok } from './engine/types.ts';
import { hargaUntukMode, type ModeBiaya } from './biayaLain.ts';

export interface ItemHarga { id: number; kategori: string; item: string; satuan: string; harga_beli: number | null; harga_sewa_bulan: number | null; umur_ekonomis_bulan: number | null }

export interface DriverBiaya {
  headcount: number;        // total manpower (direct + indirect)
  userKantor: number;       // admin, SPV, manager, controller, QHSE
  manajer: number;          // SPV / manager / kepala gudang
  luasM2: number;           // luas gudang dipakai cost model
  officeM2: number;         // office + meeting + control tower (0 = belum diisi)
  posisiPalet: number;      // posisi palet simpan (rak + lantai + block)
  paletInBulan: number;     // inbound palet ekuivalen per bulan
  paletOutBulan: number;    // outbound palet ekuivalen per bulan
  orderInBulan: number;     // order / dokumen inbound per bulan (profil order)
  orderOutBulan: number;    // order / DO outbound per bulan (profil order)
  hariKerjaBulan: number;
  kategori: string;         // kategori bisnis (Key Assumption)
  umk: number;              // UMK lokasi (0 = belum ada di master)
  skenarioAset: string;     // Rental / Own Asset / Built-to-Suit
  tipeGudang: string;
  nilaiStokRp: number;      // nilai stok rata-rata untuk asuransi (0 = belum diisi)
}

export type BarisBiaya = CostLineInput & {
  priceItemId?: number; seksi?: string;
  kunci?: string; qtyDefault?: number; dasar?: string; belumDiketahui?: boolean;
  hargaDb?: number;        // harga Price Inquiry saat baris dibuat / diperbarui
  hargaDefault?: number;   // harga hasil default terakhir; hargaSatuan = hargaDefault → ikut perubahan harga / UMK
};

/** Faktor biaya jasa outsourcing per orang terhadap UMK: BPJS ±14,2% + THR 8,3% + seragam & perlengkapan ±3%, × fee vendor 10%. */
export const FAKTOR_OUTSOURCING = 1.38;
const ceil = (v: number) => Math.ceil(Math.max(0, v) - 1e-9);
const rb = (v: number) => Math.round(v).toLocaleString('id-ID');

const KAT_HIGIENIS = ['FMCG', 'Healthcare & Pharma', 'Cold Chain', 'Retail & E-commerce'];
const KAT_NILAI_TINGGI = ['Technology & Electronics', 'Healthcare & Pharma'];
const KAT_DEBU = ['Raw Material & Bulk', 'Building Materials', 'Chemicals (non-DG)', 'Dangerous Goods (DG)'];
const KAT_RAYAP = ['Home Appliances & Furniture', 'Paper, Pulp & Packaging'];
const KAT_FRAGILE = ['Technology & Electronics', 'Home Appliances & Furniture', 'Retail & E-commerce'];

interface Aturan {
  kunci: string; seksi: string; kelompok: Kelompok; mode: ModeBiaya;
  cari: RegExp; kategori?: string[]; pilih?: 'min' | 'max';
  qty: number; dasar: string; belum?: boolean; umur?: number; harga?: number; hargaKet?: string;
}

/** Aturan default per bagian. `belum` = data pemicu belum ada → baris merah, qty 0. */
export function aturanBiaya(d: DriverBiaya): Aturan[] {
  const A: Aturan[] = [];
  const uk = Math.max(0, d.userKantor), mj = Math.min(uk, Math.max(0, d.manajer)), staf = Math.max(0, uk - mj);
  const hc = Math.max(0, d.headcount), ops = Math.max(0, hc - uk);
  const noMp = hc <= 0, noUk = uk <= 0, noLuas = !(d.luasM2 > 0);
  const officeM2 = d.officeM2 > 0 ? d.officeM2 : uk * 6;
  const gudangM2 = Math.max(0, d.luasM2 - (d.officeM2 || 0));
  const orderTot = d.orderInBulan + d.orderOutBulan;
  const kat = d.kategori;
  const ketMp = 'Manpower belum dihitung (Value Stream Mapping)';
  const ketUk = 'Belum ada role kantor (admin / SPV / manager) di Value Stream Mapping';
  const ketLuas = 'Luas gudang belum ada (Warehouse Planning)';

  // ---------- Office (aset, beli → disusutkan) ----------
  const of = (kunci: string, cari: RegExp, qty: number, dasar: string, belum = false) =>
    A.push({ kunci: `office.${kunci}`, seksi: 'office', kelompok: 'Office', mode: 'beli', kategori: ['Office'], cari, qty, dasar, belum });
  of('meja-staf', /^Meja Kerja Staff/i, staf, noUk ? ketUk : `${staf} staf kantor (admin / controller / QHSE)`, noUk);
  of('meja-spv', /^Meja Kerja Supervisor/i, mj, noUk ? ketUk : `${mj} SPV / manager / kepala gudang`, noUk);
  of('kursi', /^Kursi Kantor/i, uk + 4, noUk ? ketUk : `${uk} user kantor + 4 kursi meeting / tamu`, noUk);
  of('filing', /^Filing Cabinet/i, ceil(uk / 4), '1 per 4 user kantor', noUk);
  of('lemari', /^Lemari Arsip/i, Math.max(1, ceil(uk / 6)), '1 per 6 user kantor (min. 1)', noUk);
  of('rak-dok', /^Rak Buku/i, 1, '1 per office', noUk);
  of('whiteboard', /^Whiteboard/i, uk > 8 ? 2 : 1, 'office + ruang meeting', noUk);
  of('ac', /^AC Split/i, ceil(officeM2 / 15), d.officeM2 > 0 ? `1 PK per 15 m² office (${rb(d.officeM2)} m²)` : `perkiraan office ${uk} orang × 6 m² — isi fasilitas Office di Warehouse Planning`, noUk && !(d.officeM2 > 0));
  of('dispenser', /^Dispenser/i, Math.max(1, ceil(hc / 40)), 'pantry & area istirahat, 1 per 40 orang', noMp);
  of('telepon', /^Telepon Kantor/i, Math.max(1, ceil(uk / 4)), '1 per 4 user kantor (min. 1)', noUk);
  of('jam', /^Jam Dinding/i, 2, 'office + area gudang');
  of('kalkulator', /^Kalkulator Meja/i, uk, 'per user kantor', noUk);
  of('sampah', /^Tempat Sampah Kantor/i, Math.max(2, ceil(uk / 2)), '1 per 2 user kantor (min. 2)', noUk);
  of('papan', /^Papan Struktur/i, 1, '1 per office');
  of('keset', /^Keset/i, 1, '1 paket per office');
  of('kipas', /^Kipas Angin/i, ceil(ops / 25), 'area istirahat operator, 1 per 25 orang', noMp);

  // ---------- Stationery / ATK (habis pakai per bulan) ----------
  const u = Math.max(1, uk);
  const atk = (kunci: string, cari: RegExp, qty: number, dasar: string, belum = noMp, pilih: 'min' | 'max' = 'min') =>
    A.push({ kunci: `atk.${kunci}`, seksi: 'atk', kelompok: 'Consumable', mode: 'bulanan', kategori: ['ATK'], cari, pilih, qty, dasar, belum });
  atk('hvs', /^Kertas HVS A4$/i, ceil(u + orderTot / 1000), `rim/bln: 1 per user kantor (${u})${orderTot ? ` + 1 per 1.000 order (${rb(orderTot)}/bln)` : ''}`);
  atk('pulpen', /^Pulpen$/i, 2 * u + ceil(ops / 2), `2 per user kantor + 1 per 2 operator (checker / picker)`);
  atk('spidol-perm', /^Spidol Permanent$/i, 2 + ceil(ops / 5), 'marking karton / palet: 1 per 5 operator + 2');
  atk('spidol-wb', /^Spidol Whiteboard$/i, 2, 'whiteboard office & briefing', noMp, 'max');
  atk('staples', /^Isi Staples/i, ceil(u / 2), '1 per 2 user kantor');
  atk('map', /^Map Plastik L$/i, 5 * u, '5 per user kantor');
  atk('ordner', /^Ordner$/i, ceil(u / 3), 'arsip dokumen: 1 per 3 user kantor');
  atk('boxfile', /^Box File/i, ceil(u / 4), '1 per 4 user kantor');
  atk('sticky', /^Sticky Notes$/i, ceil(u / 2), '1 per 2 user kantor');
  atk('tipex', /^Correction Tape$/i, ceil(u / 3), '1 per 3 user kantor');
  atk('stabilo', /^Highlighter$/i, ceil(u / 3), '1 per 3 user kantor');
  atk('amplop', /^Amplop Coklat/i, ceil(u / 4), '1 pak per 4 user kantor');
  atk('cutter', /^Isi Cutter Besar$/i, ceil(ops / 4), 'buka karton: 1 per 4 operator', noMp || ops <= 0);
  atk('surat-jalan', /^Nota Surat Jalan$/i, ceil(d.orderOutBulan / 500), d.orderOutBulan > 0 ? `1 pak per 500 DO keluar (${rb(d.orderOutBulan)} DO/bln)` : 'Order outbound belum ada (profil order di tab Volume)', !(d.orderOutBulan > 0));

  // ---------- Consumable gudang (per bulan) ----------
  const cs = (kunci: string, cari: RegExp, qty: number, dasar: string, belum: boolean, kategori = ['Consumable']) =>
    A.push({ kunci: `cons.${kunci}`, seksi: 'consumable', kelompok: 'Consumable', mode: 'bulanan', kategori, cari, qty, dasar, belum });
  const noOut = !(d.paletOutBulan > 0);
  cs('stretch', /^Stretch Film/i, ceil(d.paletOutBulan / 20), noOut ? 'Volume outbound belum ada (tab Volume)' : `wrapping palet keluar: ${rb(d.paletOutBulan)} palet/bln ÷ ±20 palet per roll 300 m`, noOut);
  const lakban = d.orderOutBulan > 0 ? Math.max(5, ceil(d.orderOutBulan / 20)) : ceil(d.paletOutBulan / 10);
  cs('lakban', /^Lakban OPP$/i, lakban, d.orderOutBulan > 0 ? `re-seal & repack: 1 roll per 20 order keluar (min. 5)` : noOut ? 'Volume outbound belum ada (tab Volume)' : '1 roll per 10 palet keluar (profil order belum ada)', d.orderOutBulan <= 0 && noOut);
  if (KAT_FRAGILE.includes(kat)) cs('fragile', /^Lakban Fragile$/i, Math.max(2, ceil((d.orderOutBulan || d.paletOutBulan) / 50)), `kategori ${kat}: barang mudah pecah`, d.orderOutBulan <= 0 && noOut);
  const label = d.paletInBulan + (d.orderOutBulan || d.paletOutBulan);
  cs('label', /^Direct Thermal Label$/i, ceil(label / 500), label > 0 ? `label palet inbound (${rb(d.paletInBulan)}) + label kiriman outbound (${rb(d.orderOutBulan || d.paletOutBulan)}) ÷ ±500 label per roll` : 'Volume inbound / outbound belum ada (tab Volume)', !(label > 0));
  cs('galon', /air minum galon/i, ceil((hc * 1.5 * d.hariKerjaBulan) / 19), `${hc} orang × 1,5 L × ${d.hariKerjaBulan} hari ÷ 19 L`, noMp, ['Konsumsi']);

  // ---------- Pallet ----------
  const plastik = KAT_HIGIENIS.includes(kat) || kat === 'Chemicals (non-DG)' || kat === 'Dangerous Goods (DG)';
  A.push({ kunci: 'palet', seksi: 'palet', kelompok: 'Consumable', mode: 'beli', kategori: ['Palet'], cari: plastik ? /^Pallet Plastik/i : /^Pallet Kayu/i,
    qty: ceil(d.posisiPalet * 1.05), umur: plastik ? 60 : 24,
    dasar: d.posisiPalet > 0 ? `${rb(d.posisiPalet)} posisi palet + 5% cadangan staging · ${plastik ? `plastik (higienis / tahan kimia untuk ${kat}), umur 60 bln` : 'kayu, umur 24 bln'}` : 'Posisi palet belum ada (Warehouse Planning)',
    belum: !(d.posisiPalet > 0) });

  // ---------- HSE & Fire Protection ----------
  const hs = (kunci: string, cari: RegExp, qty: number, dasar: string, belum = false, mode: ModeBiaya = 'beli', umur?: number) =>
    A.push({ kunci: `hse.${kunci}`, seksi: 'hse', kelompok: 'HSE', mode, kategori: ['HSE'], cari, qty, dasar, belum, umur });
  hs('apar', /^APAR/i, Math.max(2, ceil(d.luasM2 / 200)), noLuas ? ketLuas : `jarak antar APAR ≤ 15 m (Permenakertrans Per.04/MEN/1980) → ±1 per 200 m² · ${rb(d.luasM2)} m²`, noLuas);
  hs('p3k', /^P3K Kit/i, Math.max(1, ceil(hc / 25)), noMp ? ketMp : `1 kotak per ≤ 25 pekerja (Permenakertrans Per.15/MEN/VIII/2008) · ${hc} orang`, noMp);
  hs('rambu', /^Safety Sign/i, Math.max(2, ceil(d.luasM2 / 2000)), noLuas ? ketLuas : '1 set per zona ±2.000 m² (min. 2)', noLuas);
  hs('darurat', /^Emergency Lamp/i, Math.max(4, ceil(d.luasM2 / 200)), noLuas ? ketLuas : '1 per 200 m² jalur evakuasi (sama dengan Electrical)', noLuas);
  hs('papan-k3', /^Papan Informasi K3/i, 1, 'papan K3 & struktur P2K3, 1 per site');
  hs('training', /^Training K3/i, Math.max(1, ceil(hc / 30)), noMp ? ketMp : `induction per tahun, 1 batch ≤ 30 orang · ${hc} orang`, noMp, 'beli', 12);
  hs('helm', /^Helm Safety/i, ops, noMp ? ketMp : `${ops} operator gudang · umur 24 bln`, noMp, 'beli', 24);
  hs('sepatu', /^Sepatu Safety/i, hc, noMp ? ketMp : `semua karyawan (${hc}) · ganti tiap 12 bln`, noMp, 'beli', 12);
  hs('rompi', /^Rompi Safety/i, ops, noMp ? ketMp : `${ops} operator gudang · ganti tiap 12 bln`, noMp, 'beli', 12);
  hs('seragam', /^Seragam/i, hc * 2, noMp ? ketMp : `2 stel per orang per tahun · ${hc} orang`, noMp, 'beli', 12);
  hs('sarung', /^Sarung Tangan/i, ceil((ops * 4) / 12), noMp ? ketMp : `per pasang, 4×/tahun per operator (${ops})`, noMp, 'bulanan');
  if (KAT_DEBU.includes(kat) || kat === 'Cold Chain') hs('masker', /^Masker/i, ops, `kategori ${kat}: debu / uap · per operator per bulan`, noMp, 'bulanan');
  if (kat === 'Dangerous Goods (DG)') {
    hs('spill', /^Spill Kit/i, Math.max(1, ceil(d.luasM2 / 1000)), 'B3: 1 per 1.000 m² area simpan', noLuas);
    hs('eyewash', /^Eyewash/i, Math.max(1, ceil(d.luasM2 / 2000)), 'B3: 1 per 2.000 m² (min. 1)', noLuas);
    hs('respirator', /^Respirator/i, ceil(ops / 2), 'B3: 1 per 2 operator', noMp);
    hs('chemsuit', /^Chemical Suit/i, ceil(ops / 4), 'B3: 1 per 4 operator', noMp);
    hs('gas', /^Gas Detector/i, 1, 'B3: 1 per site');
  }
  if (kat === 'Chemicals (non-DG)') {
    hs('spill', /^Spill Kit/i, Math.max(1, ceil(d.luasM2 / 2000)), 'kimia: 1 per 2.000 m²', noLuas);
    hs('eyewash', /^Eyewash/i, 1, 'kimia: 1 per site');
    hs('goggles', /^Kacamata Safety/i, ops, 'kimia: per operator', noMp, 'beli', 24);
  }
  if (kat === 'Cold Chain') {
    hs('jaket', /^Jaket Cold Storage/i, ops, `cold storage: per operator (${ops})`, noMp, 'beli', 24);
    hs('gas', /^Gas Detector/i, 1, 'cold storage amonia: 1 per site');
  }
  if (d.skenarioAset === 'Own Asset') {
    hs('hydrant', /^Hydrant Box/i, Math.max(1, ceil(d.luasM2 / 800)), noLuas ? ketLuas : 'gedung milik sendiri: 1 kotak hidran per 800 m² (Permen PU 26/PRT/M/2008)', noLuas, 'beli', 60);
    hs('detektor', /^Fire Alarm/i, ceil(d.luasM2 / 90), noLuas ? ketLuas : 'gedung milik sendiri: 1 detektor per ±90 m²', noLuas, 'beli', 60);
    hs('sprinkler', /^Sprinkler/i, ceil(d.luasM2 / 9), noLuas ? ketLuas : 'gedung milik sendiri: 1 kepala sprinkler per 9 m² (bahaya kebakaran sedang)', noLuas, 'beli', 60);
  }

  // ---------- Services (kontrak per bulan) ----------
  const hargaOs = d.umk > 0 ? Math.round(d.umk * FAKTOR_OUTSOURCING / 1000) * 1000 : undefined;
  const ketOs = d.umk > 0 ? ` · harga = UMK lokasi ${rb(d.umk)} × ${String(FAKTOR_OUTSOURCING).replace('.', ',')} (BPJS, THR, seragam, fee vendor 10%)` : ' · UMK lokasi belum ada — harga dari Price Inquiry';
  const sv = (kunci: string, cari: RegExp, kategori: string[], qty: number, dasar: string, belum = false, harga?: number) =>
    A.push({ kunci: `svc.${kunci}`, seksi: 'services', kelompok: 'Lainnya', mode: 'bulanan', kategori, cari, qty, dasar, belum, harga });
  const unitPest = Math.max(1, ceil(d.luasM2 / 5000));
  sv('pest', /^Pest Control Umum/i, ['Pest Control'], unitPest, noLuas ? ketLuas : `kontrak per ±5.000 m² (${rb(d.luasM2)} m²)${KAT_HIGIENIS.includes(kat) ? ` · wajib audit higienis ${kat}` : ''}`, noLuas);
  sv('rodent', /^Rodent Control/i, ['Pest Control'], unitPest, noLuas ? ketLuas : 'kontrak per ±5.000 m²', noLuas);
  if (KAT_RAYAP.includes(kat)) sv('rayap', /^Termite/i, ['Pest Control'], 1, `kategori ${kat}: kayu / kertas rawan rayap`);
  const pos = 1 + (d.luasM2 > 10000 ? 1 : 0) + (KAT_NILAI_TINGGI.includes(kat) ? 1 : 0);
  const satpam = pos * 4;
  sv('satpam', /^Security Guard/i, ['Security'], satpam,
    `${pos} pos jaga 24 jam (gerbang${d.luasM2 > 10000 ? ' + patroli gudang > 10.000 m²' : ''}${KAT_NILAI_TINGGI.includes(kat) ? ` + pos barang bernilai tinggi (${kat})` : ''}) × 4 orang (3 shift + 1 cadangan libur)${ketOs}`, false, hargaOs);
  if (satpam >= 8) sv('danru', /^Komandan Regu/i, ['Security'], 1, `komandan regu untuk ${satpam} satpam${d.umk > 0 ? ' · UMK × 1,1 × 1,38' : ''}`, false, d.umk > 0 ? Math.round(d.umk * 1.1 * FAKTOR_OUTSOURCING / 1000) * 1000 : undefined);
  const cleaner = Math.max(1, ceil(gudangM2 / 2500) + ceil(Math.max(d.officeM2, uk > 0 ? 30 : 0) / 300));
  sv('cleaning', /^Cleaning Service/i, ['Cleaning'], cleaner, noLuas ? ketLuas : `gudang ${rb(gudangM2)} m² ÷ 2.500 m² + office & toilet ÷ 300 m²${ketOs}`, noLuas, hargaOs);
  sv('chemical', /^Chemical & perlengkapan kebersihan/i, ['Cleaning'], Math.max(1, ceil(d.luasM2 / 1000)), noLuas ? ketLuas : 'paket per 1.000 m² per bulan', noLuas);
  sv('sampah', /^Pengangkutan sampah/i, ['Cleaning'], 1, 'sampah non-B3, 1 kontrak per site');

  // ---------- Asuransi ----------
  const berikat = /berikat|bonded|plb/i.test(d.tipeGudang);
  const miliar = d.nilaiStokRp / 1e9;
  A.push({ kunci: 'asuransi.stok', seksi: 'asuransi', kelompok: 'Asuransi', mode: 'bulanan', kategori: ['Asuransi'],
    cari: berikat ? /^Asuransi stok — gudang berikat/i : /^Asuransi stok — gudang umum \/ 3PL, konstruksi kelas 1/i,
    qty: Math.round(miliar * 1000) / 1000,
    dasar: d.nilaiStokRp > 0 ? `nilai stok Rp${rb(d.nilaiStokRp)} = ${String(Math.round(miliar * 1000) / 1000).replace('.', ',')} miliar × premi per miliar (${berikat ? 'gudang berikat' : 'gudang umum / 3PL'}, tarif batas bawah SEOJK 6/2017)${kat === 'Dangerous Goods (DG)' ? ' · B3: minta quotation underwriter' : ''}` : 'Nilai stok belum diisi — isi di atas tabel Asuransi',
    belum: !(d.nilaiStokRp > 0) });
  return A;
}

/** Pilih item harga: cocok regex & kategori; bila ada beberapa (mis. ATK dengan kemasan berbeda) ambil harga termurah / termahal. */
function cariItem(items: ItemHarga[], a: Aturan) {
  const cocok = items.filter(x => (!a.kategori || a.kategori.includes(x.kategori)) && a.cari.test(x.item));
  if (cocok.length <= 1) return cocok[0];
  const h = (x: ItemHarga) => Number(x.harga_beli ?? x.harga_sewa_bulan ?? 0);
  return [...cocok].sort((p, q) => (a.pilih === 'max' ? h(q) - h(p) : h(p) - h(q)))[0];
}

/** Baris default lengkap (dengan harga & umur dari Price Inquiry). Aturan yang itemnya belum ada di database dilewati. */
export function biayaLainDefault(d: DriverBiaya, items: ItemHarga[]): BarisBiaya[] {
  const out: BarisBiaya[] = [];
  for (const a of aturanBiaya(d)) {
    const it = cariItem(items, a);
    if (!it) continue;
    if (!a.belum && !(a.qty > 0)) continue;
    const hargaDb = hargaUntukMode(it, a.mode);
    out.push({
      priceItemId: it.id, deskripsi: it.item, kelompok: a.kelompok, seksi: a.seksi, mode: a.mode,
      qty: a.belum ? 0 : a.qty, hargaSatuan: a.harga ?? hargaDb, hargaDb, hargaDefault: a.harga ?? hargaDb,
      ...(a.mode === 'beli' ? { umurBulan: a.umur ?? it.umur_ekonomis_bulan ?? 60 } : {}),
      kunci: a.kunci, qtyDefault: a.belum ? 0 : a.qty, dasar: a.dasar, belumDiketahui: a.belum || undefined,
    });
  }
  return out;
}

const sama = (b: BarisBiaya, d: BarisBiaya) => (b.kunci && b.kunci === d.kunci) || (!b.kunci && b.priceItemId != null && b.priceItemId === d.priceItemId);

/** Tambahkan baris default yang belum ada (per bagian bila `seksi` diisi). Baris lama dengan item yang sama tidak diduplikasi. */
export function tambahDefault(lines: BarisBiaya[], def: BarisBiaya[], seksi?: string): BarisBiaya[] {
  const baru = def.filter(d => (!seksi || d.seksi === seksi) && !lines.some(b => sama(b, d)));
  return [...lines, ...baru];
}
export const kurangDefault = (lines: BarisBiaya[], def: BarisBiaya[], seksi?: string) =>
  def.filter(d => (!seksi || d.seksi === seksi) && !lines.some(b => sama(b, d)));

/** Baris default yang qty-nya belum diubah manual (qty = qtyDefault) ikut hitungan terbaru: qty, dasar, tanda merah,
 *  dan harga jasa berbasis UMK. Mengembalikan null bila tidak ada perubahan. */
export function sinkronBiaya(lines: BarisBiaya[], def: BarisBiaya[]): BarisBiaya[] | null {
  let ubah = false;
  const out = lines.map(b => {
    if (!b.kunci) return b;
    const d = def.find(x => x.kunci === b.kunci);
    if (!d) return b;
    const ikut = b.qtyDefault != null && b.qty === b.qtyDefault;
    const patch: Partial<BarisBiaya> = {};
    if (ikut && b.qty !== d.qty) { patch.qty = d.qty; patch.qtyDefault = d.qty; }
    if (b.dasar !== d.dasar) patch.dasar = d.dasar;
    if (!!b.belumDiketahui !== !!d.belumDiketahui) patch.belumDiketahui = d.belumDiketahui;
    // harga default (Price Inquiry / UMK lokasi) ikut berubah selama harga belum diubah manual dan itemnya sama
    if (b.priceItemId === d.priceItemId && b.hargaDefault != null && b.hargaSatuan === b.hargaDefault && b.hargaDefault !== d.hargaDefault) {
      patch.hargaSatuan = d.hargaDefault; patch.hargaDefault = d.hargaDefault; patch.hargaDb = d.hargaDb;
    }
    if (!Object.keys(patch).length) return b;
    ubah = true;
    return { ...b, ...patch };
  });
  return ubah ? out : null;
}
