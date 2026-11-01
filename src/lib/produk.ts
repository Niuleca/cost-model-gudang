// Master produk / SKU per tender (tab "Produk" di sebelah Volume).
// Isi awal otomatis dari Key assumption & Volume (parameter muatan + konversi), lalu bisa diedit / ditambah / ditempel dari Excel.
// Dipakai sebagai acuan: berat per palet → level rak maksimal (barang berat hanya di level bawah), tinggi muatan vs tinggi
// bukaan rak, zonasi area per kelompok produk, dan SKU nyata di Simulasi Warehouse (putaway mematuhi level & zona).
import type { VolumeInput } from '@/lib/engine/types';
import { PARAM_DEFAULT, type ProfilVolume } from '@/lib/profilVolume';

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
  p: number; l: number; t: number;   // dimensi per UOM (cm)
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
  catatan?: string;
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
const PALET_CM = { p: 120, l: 100, tinggiKayu: 15 };

export interface HitungProduk {
  cbmUnit: number; beratPaletKg: number; cbmPalet: number; palet: number; totalKg: number; totalCbm: number;
  perLayer: number; layer: number; tinggiMuatanMm: number;
  levelMaks: number; sumberLevel: string; hanyaLantai: boolean; caraSimpan: CaraSimpan; peringatan: string[];
}

/** Hitungan turunan satu produk (CBM, berat per palet, level maks, tinggi muatan, cara simpan). */
export function hitungProduk(x: ProdukTender, aturan: AturanBerat = ATURAN_BERAT_DEFAULT, levelRak = 99, bukaanMm?: number): HitungProduk {
  const dimOk = n(x.p) > 0 && n(x.l) > 0 && n(x.t) > 0;
  const cbmUnit = dimOk ? (n(x.p) * n(x.l) * n(x.t)) / 1e6 : n(x.cbm);
  const upp = Math.max(0, n(x.upp));
  const beratPaletKg = upp * n(x.beratKg) + (upp > 0 ? aturan.tarePaletKg : 0);
  const cbmPalet = upp * cbmUnit;
  const palet = upp > 0 ? Math.ceil(n(x.qty) / upp - 1e-9) : 0;
  // susunan per layer di palet 120 × 100 cm (orientasi terbaik), tinggi muatan = layer × tinggi unit + palet
  const perLayer = dimOk ? Math.max(Math.floor(PALET_CM.p / n(x.p)) * Math.floor(PALET_CM.l / n(x.l)), Math.floor(PALET_CM.p / n(x.l)) * Math.floor(PALET_CM.l / n(x.p))) : 0;
  const layer = perLayer > 0 && upp > 0 ? Math.ceil(upp / perLayer - 1e-9) : 0;
  const tinggiMuatanMm = layer > 0 ? (layer * n(x.t) + PALET_CM.tinggiKayu) * 10 : 0;
  const peringatan: string[] = [];

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
  if (bukaanMm && tinggiMuatanMm > bukaanMm && ['spr', 'ddr'].includes(caraSimpan)) peringatan.push(`Tinggi muatan ${Math.round(tinggiMuatanMm)} mm > tinggi produk di rak ${Math.round(bukaanMm)} mm (Space) — kurangi UPP / layer atau naikkan bukaan rak.`);
  if (upp > 0 && perLayer > 0 && upp % perLayer && layer > 1) peringatan.push(`UPP ${upp} tidak pas kelipatan ${perLayer}/layer — layer teratas tidak penuh.`);
  if (dimOk && cbmPalet > 2.2) peringatan.push(`CBM muatan ${cbmPalet.toFixed(2)} m³/palet tidak wajar untuk palet 1,2 × 1,0 m — cek UPP / dimensi.`);
  if (!upp && n(x.qty) > 0) peringatan.push('UPP belum diisi — jumlah palet tidak bisa dihitung.');
  return { cbmUnit, beratPaletKg, cbmPalet, palet, totalKg: n(x.qty) * n(x.beratKg), totalCbm: n(x.qty) * cbmUnit, perLayer, layer, tinggiMuatanMm, levelMaks, sumberLevel, hanyaLantai, caraSimpan, peringatan };
}

/** Satu baris produk otomatis dari Key assumption: Volume (UoM & konversi) + Parameter muatan (berat/CBM per case & per palet). */
export function produkOtomatis(volumes: VolumeInput[], profil: ProfilVolume | undefined): ProdukTender | null {
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
  return { id: 'auto-1', kode: 'AUTO-01', nama: 'Produk utama (dari Key assumption)', uom, p: 0, l: 0, t: 0, cbm: Math.round(cbm * 1e5) / 1e5,
    beratKg: Math.round(beratKg * 100) / 100, upp: Math.round(upp), qty: Math.round(qty), isiPcs, kategori: 'Umum', zona: 'A', simpan: 'otomatis', otomatis: true };
}

/** Daftar produk efektif: belum pernah diisi → baris otomatis; baris otomatis disegarkan dari key assumption. */
export function produkEfektif(daftar: ProdukTender[] | undefined, volumes: VolumeInput[], profil: ProfilVolume | undefined): ProdukTender[] {
  const auto = produkOtomatis(volumes, profil);
  if (!daftar) return auto ? [auto] : [];
  return daftar.map(x => (x.otomatis && auto ? { ...auto, id: x.id, kode: x.kode, nama: x.nama, kategori: x.kategori, zona: x.zona, simpan: x.simpan, levelMaks: x.levelMaks, catatan: x.catatan, otomatis: true } : x));
}

/** Zonasi otomatis: kelompokkan produk menurut kategori & kelas berat; zona diberi huruf A, B, C … */
export function zonasiOtomatis(daftar: ProdukTender[], aturan: AturanBerat = ATURAN_BERAT_DEFAULT, levelRak = 99): ProdukTender[] {
  const kunci = (x: ProdukTender) => {
    const h = hitungProduk(x, aturan, levelRak);
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
export function ringkasZona(daftar: ProdukTender[], aturan: AturanBerat = ATURAN_BERAT_DEFAULT, levelRak = 99): RingkasZona[] {
  const m = new Map<string, RingkasZona>();
  for (const x of daftar) {
    const h = hitungProduk(x, aturan, levelRak); const z = x.zona?.trim() || '(tanpa zona)';
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
