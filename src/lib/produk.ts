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
  kelasBerat?: string;         // kode kelas berat dari master UoM (mis. bag-50, fibc-1000) — kosong = otomatis dari berat
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
  dimEstimasi?: boolean;       // P×L×T diperkirakan dari CBM per case (belum diukur)
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
  // bukaan di Space = tinggi produk saja (palet kayu dihitung terpisah)
  const tinggiProdukMm = tinggiMuatanMm > 0 ? tinggiMuatanMm - PALET_CM.tinggiKayu * 10 : 0;
  if (bukaanMm && tinggiProdukMm > bukaanMm + 0.5 && ['spr', 'ddr'].includes(caraSimpan)) peringatan.push(`Tinggi produk di palet ${Math.round(tinggiProdukMm)} mm > tinggi produk di rak ${Math.round(bukaanMm)} mm (Space) — kurangi UPP / layer atau naikkan bukaan rak.`);
  if (upp > 0 && perLayer > 0 && upp % perLayer && layer > 1) peringatan.push(`UPP ${upp} tidak pas kelipatan ${perLayer}/layer — layer teratas tidak penuh.`);
  if (dimOk && cbmPalet > 2.2) peringatan.push(`CBM muatan ${cbmPalet.toFixed(2)} m³/palet tidak wajar untuk palet 1,2 × 1,0 m — cek UPP / dimensi.`);
  if (!upp && n(x.qty) > 0) peringatan.push('UPP belum diisi — jumlah palet tidak bisa dihitung.');
  return { cbmUnit, beratPaletKg, cbmPalet, palet, totalKg: n(x.qty) * n(x.beratKg), totalCbm: n(x.qty) * cbmUnit, perLayer, layer, tinggiMuatanMm, levelMaks, sumberLevel, hanyaLantai, caraSimpan, peringatan };
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


/** Produk manual (bukan baris otomatis) sudah ada → produk menjadi sumber data tender. */
export const adaProdukNyata = (daftar: ProdukTender[] | undefined) => (daftar ?? []).some(x => !x.otomatis && Number(x.upp) > 0 && Number(x.qty) > 0);

export interface TurunanProduk {
  palet: number; qty: number; kgPerUnit: number; cbmPerUnit: number; upp: number; isiPcs: number | null;
  kgPerPalet: number; cbmPerPalet: number; tinggiMaksMm: number; porsiLantai: number;
}
/** Rata-rata tertimbang dari daftar produk: berat & CBM per unit (tertimbang qty), per palet (tertimbang palet), UPP = qty ÷ palet. */
export function turunanProduk(daftar: ProdukTender[], aturan: AturanBerat = ATURAN_BERAT_DEFAULT, levelRak = 99): TurunanProduk | null {
  const xs = daftar.filter(x => Number(x.upp) > 0 && Number(x.qty) > 0).map(x => ({ x, h: hitungProduk(x, aturan, levelRak) }));
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

const r3 = (x: number) => Math.round(x * 1000) / 1000;
export interface PerubahanTender { bagian: string; item: string; dari: string; ke: string }
/**
 * Terapkan data produk ke asumsi tender (Volume, Parameter muatan, Space). Dipanggil setiap daftar produk berubah
 * selama "produk jadi sumber data" aktif dan ada produk manual. Mengembalikan patch asumsi + daftar perubahan.
 */
export function terapkanProduk<A extends { volumes: VolumeInput[]; profilVolume?: ProfilVolume; space: object }>(
  a: A, daftar: ProdukTender[], aturan: AturanBerat = ATURAN_BERAT_DEFAULT, levelRak = 99,
): { patch: Partial<A>; perubahan: PerubahanTender[] } {
  const d = turunanProduk(daftar, aturan, levelRak);
  if (!d) return { patch: {}, perubahan: [] };
  const per: PerubahanTender[] = [];
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
  // Space: tinggi produk di rak (bukaan) & porsi pallet floor untuk palet yang melebihi beam
  const sx = ((a.space as { excel?: unknown }).excel ?? {}) as Record<string, unknown> & { rak?: Record<string, number>; porsi?: Record<string, number> };
  let excel: Record<string, unknown> | undefined;
  if (sx && typeof sx === 'object') {
    const rak = { ...(sx.rak ?? {}) } as Record<string, number>;
    const tinggi = d.tinggiMaksMm > 0 ? Math.ceil((d.tinggiMaksMm - PALET_CM.tinggiKayu * 10) / 50 - 1e-9) * 50 : 0;   // tanpa tebal palet kayu
    excel = { ...sx };
    if (tinggi > 0 && tinggi !== Number(rak.productMm ?? 1250)) {
      per.push({ bagian: 'Gudang, space & MHE', item: 'Tinggi produk di rak (bukaan level)', dari: `${f(Number(rak.productMm ?? 1250), 0)} mm`, ke: `${f(tinggi, 0)} mm` });
      excel.rak = { ...rak, productMm: tinggi };
    }
    const pr0 = sx.porsi as Record<string, number> | undefined;
    if (pr0 && d.porsiLantai > 0) {
      const lantai = Math.round(d.porsiLantai * 1000) / 1000;
      const floor0 = Number(pr0.floor ?? 0) + Number(pr0.block ?? 0);
      if (lantai > floor0 + 0.0005) {
        const sisa = Math.max(0, 1 - lantai - Number(pr0.block ?? 0));
        const rakTot = Number(pr0.spr ?? 0) + Number(pr0.ddr ?? 0) || 1;
        excel.porsi = { ...pr0, floor: lantai, spr: Math.round((Number(pr0.spr ?? 0) / rakTot) * sisa * 1000) / 1000, ddr: Math.round((Number(pr0.ddr ?? 0) / rakTot) * sisa * 1000) / 1000 };
        per.push({ bagian: 'Gudang, space & MHE', item: 'Porsi pallet floor (palet > kapasitas beam)', dari: `${f(floor0 * 100, 1)}%`, ke: `${f(lantai * 100, 1)}%` });
      }
    }
  }
  const patch = { profilVolume, volumes, ...(excel ? { space: { ...a.space, excel } } : {}) } as unknown as Partial<A>;
  return { patch, perubahan: per };
}
