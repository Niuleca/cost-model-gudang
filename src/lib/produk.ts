// Master produk / SKU per tender (tab "Produk" di sebelah Volume).
// Isi awal otomatis dari Key assumption & Volume (parameter muatan + konversi), lalu bisa diedit / ditambah / ditempel dari Excel.
// Dipakai sebagai acuan: berat per palet → level rak maksimal (barang berat hanya di level bawah), tinggi muatan vs tinggi
// bukaan rak, zonasi area per kelompok produk, dan SKU nyata di Simulasi Warehouse (putaway mematuhi level & zona).
import type { VolumeInput } from '@/lib/engine/types';
import { PARAM_DEFAULT, type ProfilVolume } from '@/lib/profilVolume';
import { daftarPalet, ringkasPalet, type SpaceExcel } from '@/lib/engine/space';

export const UOM_PRODUK = ['karton', 'case', 'pcs', 'unit', 'roll', 'bag', 'sak', 'pail', 'drum', 'jerigen', 'botol', 'kaleng', 'pack', 'bundle', 'coil', 'ibc', 'palet'] as const;
export const KATEGORI_PRODUK = ['Umum', 'Berat', 'Fragile / mudah pecah', 'B3 / kimia', 'Cair', 'Cold / chiller', 'High value'] as const;
export const SIMPAN = [
  { v: 'otomatis', l: 'Otomatis (dari berat)' }, { v: 'spr', l: 'Rak SPR (selective)' }, { v: 'ddr', l: 'Rak DDR (double deep)' },
  { v: 'block', l: 'Block stack (lantai, tumpuk)' }, { v: 'floor', l: 'Pallet floor (lantai, 1 tumpuk)' }, { v: 'shelving', l: 'Shelving (loose)' },
] as const;
export type CaraSimpan = (typeof SIMPAN)[number]['v'];

export interface ProdukTender {
  id: string;
  kode: string; nama: string;
  uom: string;                 // satuan simpan / handling: karton, pcs, roll, bag, pail, unit, …
  kelasBerat?: string;         // kode kelas berat dari master UoM (mis. bag-50, fibc-1000) — kosong = otomatis dari berat
  p: number; l: number; t: number;   // dimensi per UOM (satuan: satuanDim, default cm)
  satuanDim?: 'cm' | 'mm';     // kosong = otomatis (angka > 2,5 m untuk palet / > 6 m untuk UOM lain dibaca mm)
  cbm?: number | null;         // CBM per UOM — dipakai bila P×L×T kosong
  beratKg: number;             // berat per UOM (kg)
  upp: number;                 // UPP = unit (UOM) per palet
  qty: number;                 // jumlah stok (dalam UOM)
  isiPcs?: number | null;      // 1 UOM = … pcs (opsional)
  kategori?: string;
  zona?: string;               // area penyimpanan (zonasi)
  simpan?: CaraSimpan;
  levelMaks?: number | null;   // override manual level rak maksimal
  tumpukMaks?: number | null;  // khusus lantai: maksimal tumpuk palet
  otomatis?: boolean;          // baris dari key assumption — ikut berubah selama belum diedit
  dimEstimasi?: boolean;       // P×L×T diperkirakan dari CBM per case (belum diukur)
  paletTipe?: string;          // id jenis palet (Key assumption); kosong = jenis dominan
  uppAsli?: number | null;     // UPP yang sengaja dipertahankan sesuai kondisi asli (layer atas tidak penuh) — peringatan disembunyikan selama UPP sama
  catatan?: string;
}

/** Perkiraan dimensi karton dari CBM (rasio umum P : L : T ≈ 1,6 : 1,2 : 1), dibulatkan 0,5 cm. */
export function estimasiDimensi(cbm: number) {
  if (!(cbm > 0)) return { p: 0, l: 0, t: 0 };
  const t = Math.cbrt((cbm * 1e6) / (1.6 * 1.2));
  const r = (x: number) => Math.round(x * 2) / 2;
  return { p: r(1.6 * t), l: r(1.2 * t), t: r(t) };
}

/** Batas berat per palet → level rak tertinggi yang diizinkan (level 1 = lantai / beam terbawah). */
export interface AturanBerat { tarePaletKg: number; kapPosisiKg: number; batas: { kgMaks: number; levelMaks: number }[] }
export const ATURAN_BERAT_DEFAULT: AturanBerat = {
  tarePaletKg: 25,       // berat palet kayu kosong
  kapPosisiKg: 1000,     // kapasitas beam per posisi palet (rak standar ±2.000 kg per pasang beam / 2 palet)
  batas: [
    { kgMaks: 500, levelMaks: 99 },   // ≤ 500 kg: semua level
    { kgMaks: 750, levelMaks: 3 },    // 500–750 kg: maks level 3
    { kgMaks: 900, levelMaks: 2 },    // 750–900 kg: maks level 2
  ],                                  // > 900 kg (± 1 ton): hanya level 1 / lantai
};

const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const isCase = (u: string) => ['case', 'karton', 'dus', 'carton', 'ctn', 'box'].includes((u ?? '').trim().toLowerCase());
const isPalet = (u: string) => /^pal+et/i.test((u ?? '').trim());
/** Dimensi palet (cm): panjang × lebar dari Key assumption / Warehouse Planning, tinggi = tebal palet kayu (Pallet di Racking level). */
export interface PaletDim { pCm: number; lCm: number; tinggiCm: number }
export const PALET_DEFAULT: PaletDim = { pCm: 120, lCm: 100, tinggiCm: 15 };
/** Semua jenis palet tender (Key assumption) + jenis default (dominan) untuk produk yang belum memilih. */
export interface PaletProduk { tipe: (PaletDim & { id: string; nama: string })[]; dominan: string }
/** Jenis palet dari Space / Key assumption (P, L dalam m; tebal mm) → cm. Kosong → 120 × 100 cm, tebal 15 cm. */
export function paletDariSpace(sx?: Partial<SpaceExcel> | null): PaletProduk {
  const r = ringkasPalet(daftarPalet(sx));
  const tipe = r.list.map(p => ({ id: p.id, nama: p.nama, pCm: Number(p.panjang) > 0 ? Number(p.panjang) * 100 : PALET_DEFAULT.pCm,
    lCm: Number(p.lebar) > 0 ? Number(p.lebar) * 100 : PALET_DEFAULT.lCm, tinggiCm: Number(p.tebalMm) > 0 ? Number(p.tebalMm) / 10 : PALET_DEFAULT.tinggiCm }));
  return { tipe, dominan: r.dominan.id };
}
/** Dimensi palet untuk satu produk: jenis yang dipilih produk, selain itu jenis dominan. */
export function paletUntuk(x: Pick<ProdukTender, 'paletTipe'>, p: PaletDim | PaletProduk = PALET_DEFAULT): PaletDim & { id?: string; nama?: string } {
  if (!('tipe' in p)) return p;
  return p.tipe.find(t => t.id === x.paletTipe) ?? p.tipe.find(t => t.id === p.dominan) ?? p.tipe[0] ?? PALET_DEFAULT;
}
const cm = (x: number) => Math.round(x * 10) / 10;
/** Satuan dimensi yang dipakai: pilihan user, atau otomatis — dimensi yang tidak masuk akal dalam cm (palet > 2,5 m, lainnya > 6 m) dibaca mm. */
export function satuanDimEfektif(x: Pick<ProdukTender, 'p' | 'l' | 't' | 'uom' | 'satuanDim'>): { satuan: 'cm' | 'mm'; otomatis: boolean } {
  if (x.satuanDim) return { satuan: x.satuanDim, otomatis: false };
  const maks = Math.max(n(x.p), n(x.l), n(x.t));
  return { satuan: maks > (isPalet(x.uom) ? 250 : 600) ? 'mm' : 'cm', otomatis: true };
}
/** Dimensi dalam cm (konversi dari mm bila perlu). */
export function dimCm(x: Pick<ProdukTender, 'p' | 'l' | 't' | 'uom' | 'satuanDim'>) {
  const f = satuanDimEfektif(x).satuan === 'mm' ? 0.1 : 1;
  return { p: n(x.p) * f, l: n(x.l) * f, t: n(x.t) * f };
}
/** UOM palet: 1 UOM = 1 palet (UPP = 1). */
export const uppEfektif = (x: Pick<ProdukTender, 'uom' | 'upp'>) => (isPalet(x.uom) ? 1 : Math.max(0, n(x.upp)));

export interface HitungProduk {
  cbmUnit: number; beratPaletKg: number; cbmPalet: number; palet: number; totalKg: number; totalCbm: number;
  perLayer: number; layer: number; tinggiMuatanMm: number;
  levelMaks: number; sumberLevel: string; hanyaLantai: boolean; caraSimpan: CaraSimpan; peringatan: string[];
  saranUpp: SaranUpp | null;
}
/** Usulan UPP bila layer teratas tidak penuh: dibulatkan ke bawah / ke atas ke kelipatan isi per layer. */
export interface OpsiUpp { upp: number; layer: number; tinggiMuatanMm: number; beratPaletKg: number; selisih: number; ok: boolean; alasan?: string }
export interface SaranUpp { upp: number; perLayer: number; sisaAtas: number; diterima: boolean; bawah: OpsiUpp | null; atas: OpsiUpp | null }

/** Hitungan turunan satu produk (CBM, berat per palet, level maks, tinggi muatan, cara simpan). */
export function hitungProduk(x: ProdukTender, aturan: AturanBerat = ATURAN_BERAT_DEFAULT, levelRak = 99, bukaanMm?: number, sumberPalet: PaletDim | PaletProduk = PALET_DEFAULT): HitungProduk {
  const dimPalet = paletUntuk(x, sumberPalet);
  const PALET_CM = { p: dimPalet.pCm, l: dimPalet.lCm, tinggiKayu: dimPalet.tinggiCm };
  const d = dimCm(x), palUom = isPalet(x.uom);
  const dimOk = d.p > 0 && d.l > 0 && d.t > 0;
  const cbmUnit = dimOk ? (d.p * d.l * d.t) / 1e6 : n(x.cbm);
  const upp = uppEfektif(x);
  // UOM palet: berat / UOM = berat kotor 1 palet (sudah termasuk palet kayu) → tanpa tambahan tare
  const beratPaletKg = palUom ? n(x.beratKg) : upp * n(x.beratKg) + (upp > 0 ? aturan.tarePaletKg : 0);
  const cbmPalet = upp * cbmUnit;
  const palet = upp > 0 && n(x.qty) > 0 ? Math.ceil(n(x.qty) / upp - 1e-9) : 0;   // qty kosong → 0 (bukan -0)
  // susunan per layer di palet P × L (default 120 × 100 cm, orientasi terbaik), tinggi muatan = layer × tinggi unit + palet.
  // UOM palet: tinggi muatan = T (sudah termasuk palet kayu).
  const perLayer = palUom ? (dimOk ? 1 : 0) : dimOk ? Math.max(Math.floor(PALET_CM.p / d.p + 1e-9) * Math.floor(PALET_CM.l / d.l + 1e-9), Math.floor(PALET_CM.p / d.l + 1e-9) * Math.floor(PALET_CM.l / d.p + 1e-9)) : 0;
  const layer = perLayer > 0 && upp > 0 ? Math.ceil(upp / perLayer - 1e-9) : 0;
  const tinggiMuatanMm = palUom ? (dimOk ? d.t * 10 : 0) : layer > 0 ? (layer * d.t + PALET_CM.tinggiKayu) * 10 : 0;
  const peringatan: string[] = [];
  if (dimOk && !palUom && perLayer === 0) peringatan.push(`Unit ${d.p} × ${d.l} cm lebih besar dari palet ${cm(PALET_CM.p)} × ${cm(PALET_CM.l)} cm — cek dimensi / satuan (cm atau mm), atau pakai UOM palet / simpan di lantai.`);
  if (dimOk && palUom && (Math.max(d.p, d.l) > Math.max(PALET_CM.p, PALET_CM.l) + 10 || Math.min(d.p, d.l) > Math.min(PALET_CM.p, PALET_CM.l) + 15)) peringatan.push(`Palet ${Math.round(d.p)} × ${Math.round(d.l)} cm lebih besar dari palet ${cm(PALET_CM.p)} × ${cm(PALET_CM.l)} cm — cek dimensi / satuan (cm atau mm).`);

  let levelMaks = 99, sumberLevel = 'semua level';
  if (x.levelMaks && x.levelMaks > 0) { levelMaks = x.levelMaks; sumberLevel = 'manual'; }
  else if (beratPaletKg > 0) {
    const b = [...aturan.batas].sort((a, c) => a.kgMaks - c.kgMaks).find(r => beratPaletKg <= r.kgMaks);
    levelMaks = b ? b.levelMaks : 1;
    sumberLevel = b ? (b.levelMaks >= 99 ? `≤ ${b.kgMaks} kg/palet` : `≤ ${b.kgMaks} kg/palet → maks level ${b.levelMaks}`) : `> ${Math.max(0, ...aturan.batas.map(r => r.kgMaks))} kg/palet → level 1 / lantai`;
  }
  const hanyaLantai = beratPaletKg > aturan.kapPosisiKg;
  if (hanyaLantai) { levelMaks = 1; peringatan.push(`Berat ${Math.round(beratPaletKg)} kg/palet melebihi kapasitas beam ${aturan.kapPosisiKg} kg/posisi — simpan di lantai (block / floor).`); }
  levelMaks = Math.min(levelMaks, levelRak);

  let caraSimpan: CaraSimpan = x.simpan && x.simpan !== 'otomatis' ? x.simpan : hanyaLantai ? 'floor' : 'spr';
  if (x.simpan && x.simpan !== 'otomatis' && ['spr', 'ddr'].includes(x.simpan) && hanyaLantai) peringatan.push('Dipilih rak, tetapi berat per palet melebihi kapasitas beam.');
  if (x.simpan === 'otomatis' || !x.simpan) caraSimpan = hanyaLantai ? 'floor' : 'spr';
  // bukaan di Space = tinggi produk saja (palet kayu dihitung terpisah)
  const tinggiProdukMm = tinggiMuatanMm > 0 ? tinggiMuatanMm - PALET_CM.tinggiKayu * 10 : 0;
  if (bukaanMm && tinggiProdukMm > bukaanMm + 0.5 && ['spr', 'ddr'].includes(caraSimpan)) peringatan.push(`Tinggi produk di palet ${Math.round(tinggiProdukMm)} mm > bukaan rak ${Math.round(bukaanMm)} mm (Warehouse Planning → Product) — kurangi UPP / layer atau naikkan Product di Warehouse Planning.`);
  let saranUpp: SaranUpp | null = null;
  if (!palUom && upp > 0 && perLayer > 0 && upp % perLayer && layer > 1) {
    const sisaAtas = upp % perLayer, diterima = Number(x.uppAsli) === upp;
    const opsi = (u: number): OpsiUpp | null => {
      if (!(u > 0)) return null;
      const ly = Math.ceil(u / perLayer - 1e-9), tMm = (ly * d.t + PALET_CM.tinggiKayu) * 10, kg = u * n(x.beratKg) + aturan.tarePaletKg;
      const tProdMm = tMm - PALET_CM.tinggiKayu * 10;
      const diRak = ['spr', 'ddr'].includes(caraSimpan);
      const alasan = diRak && kg > aturan.kapPosisiKg ? `berat ${Math.round(kg)} kg > kapasitas beam ${aturan.kapPosisiKg} kg`
        : diRak && bukaanMm && tProdMm > bukaanMm + 0.5 && tProdMm > tinggiProdukMm ? `tinggi ${Math.round(tProdMm)} mm > bukaan rak ${Math.round(bukaanMm)} mm` : undefined;
      return { upp: u, layer: ly, tinggiMuatanMm: tMm, beratPaletKg: kg, selisih: u - upp, ok: !alasan, alasan };
    };
    saranUpp = { upp, perLayer, sisaAtas, diterima, bawah: opsi(Math.floor(upp / perLayer) * perLayer), atas: opsi(Math.ceil(upp / perLayer) * perLayer) };
    if (!diterima) peringatan.push(`UPP ${upp} tidak pas kelipatan ${perLayer}/layer — layer teratas hanya ${sisaAtas} dari ${perLayer} ${x.uom || 'unit'}.`);
  }
  if (dimOk && cbmPalet > (PALET_CM.p * PALET_CM.l / 1e4) * 1.85) peringatan.push(`CBM muatan ${cbmPalet.toFixed(2)} m³/palet tidak wajar untuk palet ${cm(PALET_CM.p)} × ${cm(PALET_CM.l)} cm — cek UPP / dimensi (satuan cm atau mm).`);
  if (!upp && n(x.qty) > 0) peringatan.push('UPP belum diisi — jumlah palet tidak bisa dihitung.');
  return { cbmUnit, beratPaletKg, cbmPalet, palet, totalKg: n(x.qty) * n(x.beratKg), totalCbm: n(x.qty) * cbmUnit, perLayer, layer, tinggiMuatanMm, levelMaks, sumberLevel, hanyaLantai, caraSimpan, peringatan, saranUpp };
}

/** Satu baris produk otomatis dari Key assumption: Volume (UoM & konversi) + Parameter muatan (berat/CBM per case & per palet). */
export function produkOtomatis(volumes: VolumeInput[], profil: ProfilVolume | undefined, nama?: string): ProdukTender | null {
  const pr = { ...PARAM_DEFAULT, ...(profil?.param ?? {}) };
  const vSt = volumes.find(v => v.arus === 'storage'), vOut = volumes.find(v => v.arus === 'outbound'), vIn = volumes.find(v => v.arus === 'inbound');
  const v = vSt ?? vOut ?? vIn;
  if (!v) return null;
  const k = v.konversi;
  let uom = v.uom, upp = 0;
  if (isCase(v.uom)) { upp = n(k?.paletIsi); }
  else if (isPalet(v.uom)) { uom = k?.uom1 && n(k.per1) > 0 ? k.uom1 : 'karton'; upp = n(k?.per1); }
  if (!(upp > 0)) upp = pr.cbmPerCase > 0 ? Math.floor(pr.cbmPerPalet / pr.cbmPerCase + 1e-9) : 0;
  // stok (posisi) dalam UOM produk: storage peak; bila tidak ada storage → outbound peak (perkiraan)
  const basis = n(v.peakBulan) || n(v.rataRataBulan);
  const qty = isPalet(v.uom) ? basis * upp : basis;
  const isiPcs = isCase(uom) || isCase(k?.uom1 ?? '') ? n(k?.per2) || null : null;
  const beratKg = isCase(uom) || !isPalet(v.uom) ? pr.kgPerCase : upp > 0 ? (pr.tonPerPalet * 1000) / upp : pr.kgPerCase;
  const cbm = isCase(uom) || !isPalet(v.uom) ? pr.cbmPerCase : upp > 0 ? pr.cbmPerPalet / upp : pr.cbmPerCase;
  const dim = estimasiDimensi(cbm);
  const kgPalet = upp * beratKg;
  const selisih = pr.tonPerPalet > 0 && kgPalet > 0 && Math.abs(kgPalet - pr.tonPerPalet * 1000) / (pr.tonPerPalet * 1000) > 0.2
    ? `Berat per palet di Parameter muatan ${Math.round(pr.tonPerPalet * 1000)} kg ≠ UPP ${Math.round(upp)} × ${beratKg} kg = ${Math.round(kgPalet)} kg — periksa salah satunya.` : undefined;
  return { id: 'auto-1', kode: 'AUTO-01', nama: nama ? `Produk utama — ${nama}` : 'Produk utama (dari Key assumption)', uom, ...dim, dimEstimasi: dim.p > 0, cbm: Math.round(cbm * 1e5) / 1e5,
    beratKg: Math.round(beratKg * 100) / 100, upp: Math.round(upp), qty: Math.round(qty), isiPcs, kategori: 'Umum', zona: 'A', simpan: 'otomatis', otomatis: true, catatan: selisih };
}

/** Daftar produk efektif: belum pernah diisi → baris otomatis; baris otomatis disegarkan dari key assumption. */
export function produkEfektif(daftar: ProdukTender[] | undefined, volumes: VolumeInput[], profil: ProfilVolume | undefined, nama?: string): ProdukTender[] {
  const auto = produkOtomatis(volumes, profil, nama);
  if (!daftar) return auto ? [auto] : [];
  return daftar.map(x => (x.otomatis && auto ? { ...auto, id: x.id, kode: x.kode, nama: x.nama, kategori: x.kategori, zona: x.zona, simpan: x.simpan, levelMaks: x.levelMaks, otomatis: true } : x));
}

/** Zonasi otomatis: kelompokkan produk menurut kategori & kelas berat; zona diberi huruf A, B, C … */
export function zonasiOtomatis(daftar: ProdukTender[], aturan: AturanBerat = ATURAN_BERAT_DEFAULT, levelRak = 99, palet: PaletDim | PaletProduk = PALET_DEFAULT): ProdukTender[] {
  const kunci = (x: ProdukTender) => {
    const h = hitungProduk(x, aturan, levelRak, undefined, palet);
    const kat = x.kategori && x.kategori !== 'Umum' && x.kategori !== 'Berat' ? x.kategori : h.levelMaks <= 1 ? 'Berat (level 1 / lantai)' : h.levelMaks < 99 && h.levelMaks < levelRak ? `Menengah (≤ level ${h.levelMaks})` : 'Umum';
    return kat;
  };
  const urutKat = ['B3 / kimia', 'Cold / chiller', 'Berat (level 1 / lantai)', 'High value', 'Fragile / mudah pecah', 'Cair'];
  const grup = Array.from(new Set(daftar.map(kunci))).sort((a, b) => (urutKat.indexOf(a) + 1 || 50) - (urutKat.indexOf(b) + 1 || 50) || a.localeCompare(b));
  const huruf = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '');
  const kodeZona = new Map(grup.map((g, i) => [g, `${huruf(i)} · ${g}`]));
  return daftar.map(x => ({ ...x, zona: kodeZona.get(kunci(x)) }));
}

export interface RingkasZona { zona: string; sku: number; palet: number; kg: number; cbm: number; levelMaks: number; paletLevel1: number }
/** Ringkasan per zona + kebutuhan posisi level 1 (produk yang hanya boleh di level 1 / lantai). */
export function ringkasZona(daftar: ProdukTender[], aturan: AturanBerat = ATURAN_BERAT_DEFAULT, levelRak = 99, palet: PaletDim | PaletProduk = PALET_DEFAULT): RingkasZona[] {
  const m = new Map<string, RingkasZona>();
  for (const x of daftar) {
    const h = hitungProduk(x, aturan, levelRak, undefined, palet); const z = x.zona?.trim() || '(tanpa zona)';
    const r = m.get(z) ?? { zona: z, sku: 0, palet: 0, kg: 0, cbm: 0, levelMaks: 0, paletLevel1: 0 };
    r.sku++; r.palet += h.palet; r.kg += h.totalKg; r.cbm += h.totalCbm; r.levelMaks = Math.max(r.levelMaks, h.levelMaks);
    if (h.levelMaks <= 1) r.paletLevel1 += h.palet;
    m.set(z, r);
  }
  return Array.from(m.values()).sort((a, b) => a.zona.localeCompare(b.zona));
}

/** Tempel dari Excel: kolom Kode, Nama, UOM, P, L, T (cm), Berat (kg), UPP, Qty[, Kategori, Zona]. Baris judul dilewati. */
export function dariTempel(teks: string): ProdukTender[] {
  const baris = teks.split(/\r?\n/).map(r => r.split('\t').length > 1 ? r.split('\t') : r.split(/;|,(?=\s*\S)/)).filter(r => r.some(c => c.trim()));
  const angka = (s: string) => { const t = (s ?? '').trim().replace(/\s/g, ''); if (!t) return 0;
    // 1.234,5 (ID) atau 1,234.5 (EN)
    const v = /,\d{1,3}$/.test(t) && t.includes('.') ? t.replace(/\./g, '').replace(',', '.') : /,\d{1,3}$/.test(t) && !t.includes('.') ? t.replace(',', '.') : t.replace(/,/g, '');
    return Number(v) || 0; };
  const out: ProdukTender[] = [];
  for (const r of baris) {
    if (r.length < 3) continue;
    if (!/\d/.test(r.slice(3).join('')) && out.length === 0) continue;   // judul
    const [kode, nama, uom, p, l, t, berat, upp, qty, kategori, zona] = r.map(c => (c ?? '').trim());
    out.push({ id: `p-${Date.now().toString(36)}-${out.length}`, kode, nama: nama || kode, uom: (uom || 'karton').toLowerCase(), p: angka(p), l: angka(l), t: angka(t),
      beratKg: angka(berat), upp: Math.round(angka(upp)), qty: Math.round(angka(qty)), kategori: kategori || 'Umum', zona: zona || undefined, simpan: 'otomatis' });
  }
  return out;
}


/** Produk manual (bukan baris otomatis) sudah ada → produk menjadi sumber data tender. */
export const adaProdukNyata = (daftar: ProdukTender[] | undefined) => (daftar ?? []).some(x => !x.otomatis && uppEfektif(x) > 0 && Number(x.qty) > 0);

export interface TurunanProduk {
  palet: number; qty: number; kgPerUnit: number; cbmPerUnit: number; upp: number; isiPcs: number | null;
  kgPerPalet: number; cbmPerPalet: number; tinggiMaksMm: number; porsiLantai: number;
}
/** Rata-rata tertimbang dari daftar produk: berat & CBM per unit (tertimbang qty), per palet (tertimbang palet), UPP = qty ÷ palet. */
export function turunanProduk(daftar: ProdukTender[], aturan: AturanBerat = ATURAN_BERAT_DEFAULT, levelRak = 99, dimPalet: PaletDim | PaletProduk = PALET_DEFAULT): TurunanProduk | null {
  const xs = daftar.filter(x => uppEfektif(x) > 0 && Number(x.qty) > 0).map(x => ({ x, h: hitungProduk(x, aturan, levelRak, undefined, dimPalet) }));
  if (!xs.length) return null;
  const qty = xs.reduce((a, r) => a + Number(r.x.qty), 0), palet = xs.reduce((a, r) => a + r.h.palet, 0);
  if (!(qty > 0) || !(palet > 0)) return null;
  const kgPerUnit = xs.reduce((a, r) => a + Number(r.x.qty) * Number(r.x.beratKg || 0), 0) / qty;
  const cbmPerUnit = xs.reduce((a, r) => a + Number(r.x.qty) * r.h.cbmUnit, 0) / qty;
  const kgPerPalet = xs.reduce((a, r) => a + r.h.palet * r.h.beratPaletKg, 0) / palet;
  const cbmPerPalet = xs.reduce((a, r) => a + r.h.palet * r.h.cbmPalet, 0) / palet;
  const pcs = xs.filter(r => Number(r.x.isiPcs) > 0);
  const isiPcs = pcs.length ? pcs.reduce((a, r) => a + Number(r.x.qty) * Number(r.x.isiPcs), 0) / pcs.reduce((a, r) => a + Number(r.x.qty), 0) : null;
  const rak = xs.filter(r => r.h.caraSimpan === 'spr' || r.h.caraSimpan === 'ddr');
  const tinggiMaksMm = rak.reduce((a, r) => Math.max(a, r.h.tinggiMuatanMm), 0);
  const porsiLantai = xs.reduce((a, r) => a + (r.h.hanyaLantai || r.h.caraSimpan === 'floor' || r.h.caraSimpan === 'block' ? r.h.palet : 0), 0) / palet;
  return { palet, qty, kgPerUnit, cbmPerUnit, upp: qty / palet, isiPcs, kgPerPalet, cbmPerPalet, tinggiMaksMm, porsiLantai };
}

/** Space (Warehouse Planning): tinggi produk di rak (bukaan) & porsi pallet floor untuk palet yang melebihi beam. */
function spaceDariProduk(space: object, tinggiRakMm: number, porsiLantai: number, per: PerubahanTender[]): Record<string, unknown> | undefined {
  const f = (x: number, n = 2) => (Math.round(x * 10 ** n) / 10 ** n).toLocaleString('id-ID');
  // Space: tinggi produk di rak (bukaan) & porsi pallet floor untuk palet yang melebihi beam
  const sx = ((space as { excel?: unknown }).excel ?? {}) as Record<string, unknown> & { rak?: Record<string, number>; porsi?: Record<string, number> };
  let excel: Record<string, unknown> | undefined;
  if (sx && typeof sx === 'object') {
    const rak = { ...(sx.rak ?? {}) } as Record<string, number>;
    const tinggi = tinggiRakMm > 0 ? Math.ceil(tinggiRakMm / 50 - 1e-9) * 50 : 0;   // tinggi produk saja (tanpa tebal palet), dibulatkan 50 mm
    excel = { ...sx };
    if (tinggi > 0 && tinggi !== Number(rak.productMm ?? 1250)) {
      per.push({ bagian: 'Warehouse Planning', item: 'Tinggi produk di rak (bukaan level)', dari: `${f(Number(rak.productMm ?? 1250), 0)} mm`, ke: `${f(tinggi, 0)} mm` });
      excel.rak = { ...rak, productMm: tinggi };
    }
    const pr0 = sx.porsi as Record<string, number> | undefined;
    if (pr0 && porsiLantai > 0) {
      const lantai = Math.round(porsiLantai * 1000) / 1000;
      const floor0 = Number(pr0.floor ?? 0) + Number(pr0.block ?? 0);
      if (lantai > floor0 + 0.0005) {
        const sisa = Math.max(0, 1 - lantai - Number(pr0.block ?? 0));
        const rakTot = Number(pr0.spr ?? 0) + Number(pr0.ddr ?? 0) || 1;
        excel.porsi = { ...pr0, floor: lantai, spr: Math.round((Number(pr0.spr ?? 0) / rakTot) * sisa * 1000) / 1000, ddr: Math.round((Number(pr0.ddr ?? 0) / rakTot) * sisa * 1000) / 1000 };
        per.push({ bagian: 'Warehouse Planning', item: 'Porsi pallet floor (palet > kapasitas beam)', dari: `${f(floor0 * 100, 1)}%`, ke: `${f(lantai * 100, 1)}%` });
      }
    }
  }
  return excel;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
export interface PerubahanTender { bagian: string; item: string; dari: string; ke: string }
/**
 * Terapkan data produk ke asumsi tender (Volume, Parameter muatan, Space). Dipanggil setiap daftar produk berubah
 * selama "produk jadi sumber data" aktif dan ada produk manual. Mengembalikan patch asumsi + daftar perubahan.
 */
export function terapkanProduk<A extends { volumes: VolumeInput[]; profilVolume?: ProfilVolume; space: object }>(
  a: A, daftar: ProdukTender[], aturan: AturanBerat = ATURAN_BERAT_DEFAULT, levelRak = 99,
): { patch: Partial<A>; perubahan: PerubahanTender[] } {
  const palet = paletDariSpace((a.space as { excel?: never }).excel);
  const d = turunanProduk(daftar, aturan, levelRak, palet);
  // tinggi produk di rak (bukaan) tidak bergantung qty: tinggi produk (tanpa palet) tertinggi dari produk rak yang dimensi & UPP-nya lengkap
  const tinggiRakMm = daftar.filter(x => uppEfektif(x) > 0).map(x => ({ h: hitungProduk(x, aturan, levelRak, undefined, palet), tebalMm: paletUntuk(x, palet).tinggiCm * 10 }))
    .filter(r => (r.h.caraSimpan === 'spr' || r.h.caraSimpan === 'ddr') && r.h.tinggiMuatanMm > 0).reduce((a, r) => Math.max(a, r.h.tinggiMuatanMm - r.tebalMm), 0);   // tinggi produk tanpa palet
  const per: PerubahanTender[] = [];
  if (!d) {
    // belum ada qty: hanya tinggi bukaan rak yang bisa diterapkan
    const excel = tinggiRakMm > 0 ? spaceDariProduk(a.space, tinggiRakMm, 0, per) : undefined;
    return { patch: (excel && per.length ? { space: { ...a.space, excel } } : {}) as unknown as Partial<A>, perubahan: per };
  }
  const f = (x: number, n = 2) => (Math.round(x * 10 ** n) / 10 ** n).toLocaleString('id-ID');
  // Parameter muatan
  const p0 = { ...PARAM_DEFAULT, ...(a.profilVolume?.param ?? {}) };
  const p1 = { ...p0, kgPerCase: Math.round(d.kgPerUnit * 100) / 100, cbmPerCase: d.cbmPerUnit > 0 ? Math.round(d.cbmPerUnit * 1e5) / 1e5 : p0.cbmPerCase,
    tonPerPalet: r3(d.kgPerPalet / 1000), cbmPerPalet: d.cbmPerPalet > 0 ? Math.round(d.cbmPerPalet * 100) / 100 : p0.cbmPerPalet };
  if (Math.abs(p1.kgPerCase - p0.kgPerCase) > 0.005) per.push({ bagian: 'Volume · Parameter muatan', item: 'Berat per case/unit', dari: `${f(p0.kgPerCase)} kg`, ke: `${f(p1.kgPerCase)} kg` });
  if (Math.abs(p1.cbmPerCase - p0.cbmPerCase) > 1e-5) per.push({ bagian: 'Volume · Parameter muatan', item: 'Volume per case/unit', dari: `${f(p0.cbmPerCase, 4)} CBM`, ke: `${f(p1.cbmPerCase, 4)} CBM` });
  if (Math.abs(p1.tonPerPalet - p0.tonPerPalet) > 0.0005) per.push({ bagian: 'Volume · Parameter muatan', item: 'Berat per palet', dari: `${f(p0.tonPerPalet * 1000, 0)} kg`, ke: `${f(p1.tonPerPalet * 1000, 0)} kg` });
  if (Math.abs(p1.cbmPerPalet - p0.cbmPerPalet) > 0.005) per.push({ bagian: 'Volume · Parameter muatan', item: 'Volume per palet', dari: `${f(p0.cbmPerPalet)} CBM`, ke: `${f(p1.cbmPerPalet)} CBM` });
  const profilVolume = { inbound: [], outbound: [], ...(a.profilVolume ?? {}), param: p1 } as ProfilVolume;
  // Volume: isi per palet (UPP rata-rata) & stok storage (palet)
  const upp = Math.round(d.upp);
  const volumes = a.volumes.map(v => {
    const k = v.konversi ?? { uom1: 'case', per1: 0, uom2: 'pcs', per2: 0 };
    let k1 = { ...k };
    if (isCase(v.uom)) k1 = { ...k1, paletIsi: upp };
    else if (isPalet(v.uom)) k1 = { ...k1, uom1: isCase(k.uom1) || !k.uom1 ? (k.uom1 || 'case') : k.uom1, per1: upp };
    if (d.isiPcs) k1 = { ...k1, per2: Math.round(d.isiPcs * 100) / 100 };
    const lama = isCase(v.uom) ? k.paletIsi : k.per1;
    const baru = isCase(v.uom) ? k1.paletIsi : k1.per1;
    if ((isCase(v.uom) || isPalet(v.uom)) && Number(lama || 0) !== Number(baru || 0)) per.push({ bagian: 'Volume', item: `Isi per palet (${v.arus})`, dari: `${f(Number(lama || 0), 0)} ${isCase(v.uom) ? v.uom : k.uom1 || 'case'}`, ke: `${f(Number(baru || 0), 0)}` });
    let v1: VolumeInput = { ...v, konversi: k1 };
    if (v.arus === 'storage' && isPalet(v.uom)) {
      const pal = Math.round(d.palet);
      if (Number(v.peakBulan) !== pal) {
        per.push({ bagian: 'Volume', item: 'Stok storage (peak)', dari: `${f(Number(v.peakBulan), 0)} palet`, ke: `${f(pal, 0)} palet` });
        v1 = { ...v1, peakBulan: pal, rataRataBulan: Number(v.rataRataBulan) === Number(v.peakBulan) || !(Number(v.rataRataBulan) > 0) ? pal : v.rataRataBulan,
          komitmenBulan: Number(v.komitmenBulan) === Number(v.peakBulan) || !(Number(v.komitmenBulan) > 0) ? pal : v.komitmenBulan };
      }
    }
    return v1;
  });
  const excel = spaceDariProduk(a.space, tinggiRakMm, d.porsiLantai, per);
  const patch = { profilVolume, volumes, ...(excel ? { space: { ...a.space, excel } } : {}) } as unknown as Partial<A>;
  return { patch, perubahan: per };
}
