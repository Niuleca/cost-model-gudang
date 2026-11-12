// Layout editor 2D ⇄ 3D: model data komponen gudang yang bisa diedit, konversi dari layout otomatis,
// hitung kapasitas, cek jarak / tabrakan, dan konversi ke LayoutGudang untuk viewer 3D.
// Satuan meter. X = panjang gudang (0 = dinding dock), Z = lebar gudang (kiri → kanan).
import type { BarisRak, Dock, Fasilitas, LayoutGudang, Lorong, Palet, ParamSim, Zona, JenisZona } from './layout';

export type JenisKomp = 'spr' | 'ddr' | 'areaRak' | 'areaKolom' | 'block' | 'stagingIn' | 'stagingOut' | 'fasilitas' | 'dock' | 'kolom' | 'jalur' | 'zona' | 'gate' | 'platform';
export type SisiDinding = 'depan' | 'belakang' | 'kiri' | 'kanan';
export interface SpekRak {
  arah: 'x' | 'z';          // arah baris memanjang (bay berjejer di sumbu ini)
  hadap: 1 | -1;            // sisi muka lorong (+1 = ke arah sumbu tegak lurus yang lebih besar)
  bayW: number;             // lebar bay (m)
  ppl: number;              // palet per level per bay
  deep: number;             // 1 = SPR, 2 = DDR
  level: number;
  level1Mm: number;         // tinggi level lantai (palet + produk + clearance)
  levelNMm: number;         // tinggi per level di atasnya (beam + palet + produk + clearance)
  beamMm: number;
  lebarLorong: number;      // lebar lorong yang dibutuhkan di muka rak (m)
}
/**
 * Area rak (gaya CLASS "static rack"): satu kotak yang bisa ditarik; baris rak, lorong, dan cross aisle di dalamnya
 * dibentuk otomatis dari parameter. rak.arah = arah baris memanjang; rak.lebarLorong = lebar lorong muka-ke-muka.
 */
export interface SpekArea {
  rak: SpekRak;
  jenisRak: 'spr' | 'ddr';
  konfigurasi: 'single' | 'b2b';   // baris tunggal atau back-to-back
  mulai: 'rak' | 'lorong';         // dari tepi area: mulai dengan baris rak (tunggal di tepi) atau lorong
  dalam: number;                   // kedalaman 1 baris rak (m)
  b2b: number;                     // jarak antar punggung rak back-to-back (m)
  crossAwal: number;               // cross aisle di awal baris (m)
  crossTengah: number;             // lebar tiap cross aisle tengah (m)
  nTengah: number;                 // jumlah cross aisle tengah
  crossAkhir: number;              // cross aisle di ujung baris (m)
  /** Sisa panjang (< 1 bay) ditaruh di mana. otomatis = ke cross aisle tengah bila ada, kalau tidak dibagi rata awal & akhir. */
  sisa?: 'otomatis' | 'awal' | 'akhir';
  /** grid = pola tetap (opsi 1); adaptif = menyesuaikan kolom, dinding, office, ramp & bangunan existing (opsi 2). */
  mode?: 'grid' | 'adaptif';
  kelonggaran?: number;            // adaptif: jarak bebas rak ke kolom tiap sisi (m), spacer = lebar kolom + 2 × ini
  bebasRintangan?: number;         // adaptif: jarak bebas rak ke office / ramp / staging / rintangan lain (m)
  bebasDinding?: number;           // adaptif: jarak bebas rak ke dinding (m)
  /**
   * Sisa ruang melintang (adaptif, di antara garis kolom) ditaruh di mana:
   * akhir (default) = lorong pas sesuai isian, sisa masuk ke lorong terakhir tiap segmen; awal = ke lorong pertama;
   * rata = dibagi rata ke semua lorong (lorong melebar).
   */
  sisaLorong?: 'akhir' | 'awal' | 'rata';
  /** Geser manual baris rak (melintang, m) per nomor baris (urutan dari tepi area) — seperti move di CAD. */
  geserBaris?: Record<string, number>;
}
/**
 * Pola block stack (tumpuk palet di lantai): baris palet memanjang di sumbu `arah`; melintang dari dinding ke dinding:
 * jarak dinding | blok tepi (barisTepi) | lorong pertama | blok (barisPerBlok, dirapatkan celahBaris) | lorong | … | blok tepi | jarak dinding.
 * 1 baris = palet berjejer sepanjang area × `deep` palet ke dalam (row deep), ditumpuk `tumpuk` (di Komponen).
 */
export interface SpekBlok {
  arah: 'x' | 'z';
  paletP: number;        // panjang palet (m) — searah kedalaman baris (row deep)
  paletL: number;        // lebar palet (m) — searah baris (palet berjejer)
  paletT: number;        // tinggi palet + muatan (m)
  deep: number;          // palet ke dalam per baris
  barisPerBlok: number;  // baris yang dirapatkan per blok di antara dua lorong (2 = back-to-back)
  barisTepi: number;     // baris di blok yang menempel dinding
  celahBaris: number;    // celah antar baris dalam satu blok (m)
  lorongAwal: number;    // lebar lorong pertama (m)
  lorong: number;        // lebar lorong berikutnya (m)
  jarakDinding: number;  // jarak bebas ke tepi area / dinding (m)
  celahPalet: number;    // celah antar palet sepanjang baris (m)
  /** gangway (lorong lintang memotong baris, sepanjang arah melintang): di awal, di tengah × n, di akhir baris (m) */
  gangwayAwal?: number; gangwayTengah?: number; nGangway?: number; gangwayAkhir?: number;
}
/**
 * Area kolom (grid pilar sebagai satu kelompok, mirip area rak): kotak yang bisa ditarik; kolom di dalamnya dibentuk
 * otomatis dari bentang as-ke-as. bentangX / bentangZ: 1 nilai = berulang; banyak nilai = per bentang berurutan
 * (sesudah daftar habis, bentang terakhir diulang). As pertama di tepi area (kolom menempel tepi area).
 */
export interface SpekGridKolom {
  bentangX: number[]; bentangZ: number[];
  kolomW: number; kolomD: number;
  /** tambah kolom di ujung area bila sisa bentang terakhir > 0,5 m (kolom dinding). */
  tutupUjung: boolean;
  /** kolom yang dilewati, kunci `i-j` (indeks as X - indeks as Z). */
  lewati?: string[];
}
export const BLOK_DEFAULT: SpekBlok = { arah: 'x', paletP: 1.2, paletL: 1.1, paletT: 1.5, deep: 5, barisPerBlok: 2, barisTepi: 1, celahBaris: 0.5, lorongAwal: 4, lorong: 3.5, jarakDinding: 0.3, celahPalet: 0.1,
  gangwayAwal: 0, gangwayTengah: 3.5, nGangway: 0, gangwayAkhir: 0 };
export interface Komponen {
  id: string; jenis: JenisKomp; label: string;
  x: number; z: number; w: number; d: number;   // kiri-atas (x, z) + ukuran sumbu X (w) & Z (d)
  tinggi: number;                               // m (rak dihitung dari level; lainnya isian)
  warna?: string;
  rak?: SpekRak;
  area?: SpekArea;
  induk?: string;                               // baris rak hasil urai area → id area
  barisKe?: number;                             // baris rak hasil urai area → nomor baris di area (untuk geser baris)
  tumpuk?: number;                              // block / staging
  blok?: SpekBlok;                              // block stack berpola (baris, row deep, lorong)
  gridKolom?: SpekGridKolom;                    // area kolom (grid pilar)
  palet?: number;                               // staging: palet per sequence
  arus?: 'inbound' | 'outbound';                // dock
  sisi?: SisiDinding;                           // gate: dinding tempat pintu (depan = dinding dock x = 0)
}
export interface Ukur { id: string; ax: number; az: number; bx: number; bz: number }
export interface LatarDenah {
  jenis: 'gambar' | 'dxf';
  url?: string;                                  // gambar (data URL, sudah diperkecil)
  garis?: [number, number, number, number][];    // DXF: segmen dalam meter
  x: number; z: number; w: number; d: number;    // posisi & ukuran latar (m)
  opasitas: number; nama: string;
}
/** Bentuk gedung trapesium: lebar depan (dinding dock, x = 0) ≠ lebar belakang (x = L). Dinding sisi `sisi` miring,
 *  sisi lainnya lurus. W gedung = lebar terbesar; bagian di luar dinding miring tidak bisa dipakai. */
export interface Trapesium { lebarDepan: number; lebarBelakang: number; sisi: 'kanan' | 'kiri' }
export interface Gedung { L: number; W: number; sideMm: number; centerMm: number; tinggiDockM?: number; trapesium?: Trapesium | null }

/** Rentang Z yang ada di dalam gedung pada posisi x (gedung kotak → 0..W). */
export function rentangZ(g: Gedung, x: number): [number, number] {
  const t = g.trapesium; if (!t) return [0, g.W];
  const f = Math.max(0, Math.min(1, x / Math.max(0.001, g.L)));
  const lebar = t.lebarDepan + (t.lebarBelakang - t.lebarDepan) * f;
  return t.sisi === 'kanan' ? [0, lebar] : [g.W - lebar, g.W];
}
/** Dinding miring (garis) — null untuk gedung kotak. */
export function dindingMiring(g: Gedung) {
  const t = g.trapesium; if (!t) return null;
  const [a0, a1] = rentangZ(g, 0), [b0, b1] = rentangZ(g, g.L);
  return t.sisi === 'kanan' ? { x0: 0, z0: a1, x1: g.L, z1: b1 } : { x0: 0, z0: a0, x1: g.L, z1: b0 };
}
/** Area di luar dinding miring (poligon) — untuk arsir di denah & penutup lantai di 3D. */
export function poligonLuar(g: Gedung): { x: number; z: number }[] | null {
  const d = dindingMiring(g); if (!d) return null;
  const tepi = g.trapesium!.sisi === 'kanan' ? g.W : 0;
  if (Math.abs(d.z0 - tepi) < 0.01 && Math.abs(d.z1 - tepi) < 0.01) return null;
  return [{ x: 0, z: d.z0 }, { x: g.L, z: d.z1 }, { x: g.L, z: tepi }, { x: 0, z: tepi }];
}
/** Kotak-kotak bertangga (tiap `langkah` m sepanjang X) yang menutupi area di luar dinding miring — rintangan untuk rak adaptif. */
export function kotakLuar(g: Gedung, langkah = 1): { x0: number; x1: number; z0: number; z1: number }[] {
  if (!poligonLuar(g)) return [];
  const out: { x0: number; x1: number; z0: number; z1: number }[] = [];
  for (let x = 0; x < g.L - 1e-6; x += langkah) {
    const x1 = Math.min(g.L, x + langkah);
    const [a0, a1] = rentangZ(g, x), [b0, b1] = rentangZ(g, x1);
    if (g.trapesium!.sisi === 'kanan') { const z = Math.min(a1, b1); if (z < g.W - 1e-6) out.push({ x0: x, x1, z0: z, z1: g.W }); }
    else { const z = Math.max(a0, b0); if (z > 1e-6) out.push({ x0: x, x1, z0: 0, z1: z }); }
  }
  return out;
}
/** Luas lantai gedung (m²): kotak L × W, trapesium L × (lebar depan + lebar belakang) ÷ 2. */
export const luasGedung = (g: Gedung) => (g.trapesium ? g.L * (g.trapesium.lebarDepan + g.trapesium.lebarBelakang) / 2 : g.L * g.W);
/** Titik di dalam gedung (dengan toleransi). */
export function diDalamGedung(g: Gedung, x: number, z: number, tol = 0.05) {
  if (x < -tol || x > g.L + tol) return false;
  const [z0, z1] = rentangZ(g, Math.max(0, Math.min(g.L, x)));
  return z >= z0 - tol && z <= z1 + tol;
}

export interface LayoutEdit {
  versi: 1;
  gedung: Gedung;
  komponen: Komponen[];
  ukur: Ukur[];
  latar?: LatarDenah | null;
  okupansi: number | null;                       // null = sesuai stok desain
  stokDesain: number;                            // palet (dari tender) — pembanding kapasitas
  tinggiPalet: number;                           // m (palet + produk)
}

/** Gate menempel dinding: posisi sepanjang dinding (m dari ujung kiri / depan) & lebar. */
export function posisiGate(k: Komponen, g: { L: number; W: number }) {
  const sisi = k.sisi ?? 'depan'; const sejajarZ = sisi === 'depan' || sisi === 'belakang';
  const lebar = sejajarZ ? k.d : k.w; const pos = sejajarZ ? k.z : k.x;
  const batas = sejajarZ ? g.W : g.L;
  const p0 = Math.max(0, Math.min(batas - lebar, pos));
  const t = 0.6;   // tebal simbol gate di denah (menumpang di garis dinding)
  return { sisi, pos: p0, lebar, tinggi: k.tinggi || 5, kotak: sisi === 'depan' ? { x: -t / 2, z: p0, w: t, d: lebar } : sisi === 'belakang' ? { x: g.L - t / 2, z: p0, w: t, d: lebar }
    : sisi === 'kiri' ? { x: p0, z: -t / 2, w: lebar, d: t } : { x: p0, z: g.W - t / 2, w: lebar, d: t } };
}
/** Pindahkan gate ke dinding lain (lebar & posisi dipertahankan). */
export function aturSisiGate(k: Komponen, sisi: SisiDinding, g: { L: number; W: number }): Komponen {
  const { pos, lebar } = posisiGate(k, g);
  const sejajarZ = sisi === 'depan' || sisi === 'belakang';
  const b = posisiGate({ ...k, sisi, ...(sejajarZ ? { z: pos, d: lebar } : { x: pos, w: lebar }) }, g).kotak;
  return { ...k, sisi, x: r2(b.x), z: r2(b.z), w: r2(b.w), d: r2(b.d) };
}
/** Pilar grid: daftar bentang as-ke-as ("6" = 6 m berulang sampai ujung; "6; 6; 8" = per bentang) → posisi as kumulatif. */
export function posisiBentang(teks: string, panjang: number, awal = 0) {
  const xs = teks.split(/[;\s]+/).map(t => Number(t.replace(',', '.'))).filter(n => n > 0.5);
  if (!xs.length) return [] as number[];
  const pos = [awal]; let i = 0;
  while (pos.length < 500) { const n = xs.length === 1 ? xs[0] : xs[i]; if (n == null) break; const nx = pos[pos.length - 1] + n; if (nx > panjang + 1e-6) break; pos.push(nx); i++; }
  return pos.map(r2);
}
export const uid = () => Math.random().toString(36).slice(2, 10);

/** Posisi as (pusat kolom) sepanjang satu sumbu area kolom. */
function asSumbu(a0: number, pj: number, bentang: number[], ukuran: number, tutupUjung: boolean) {
  const awal = a0 + ukuran / 2, akhir = a0 + pj - ukuran / 2;
  if (akhir < awal - 1e-6) return [] as number[];
  const xs = [awal]; const bt = bentang.filter(b => b > 0.3);
  if (!bt.length) return xs.map(r2);
  for (let i = 0; xs.length < 400; i++) { const nx = xs[xs.length - 1] + bt[Math.min(i, bt.length - 1)]; if (nx > akhir + 1e-6) break; xs.push(nx); }
  if (tutupUjung && akhir - xs[xs.length - 1] > 0.5) xs.push(akhir);
  return xs.map(r2);
}
/** As X & Z area kolom. */
export function asGridKolom(k: Komponen) {
  const s = k.gridKolom; if (!s) return { xs: [] as number[], zs: [] as number[] };
  return { xs: asSumbu(k.x, k.w, s.bentangX, s.kolomW, s.tutupUjung), zs: asSumbu(k.z, k.d, s.bentangZ, s.kolomD, s.tutupUjung) };
}
/** Bentang aktual (as ke as) yang terbentuk di area kolom. */
export const bentangAktual = (as: number[]) => as.slice(1).map((v, i) => r2(v - as[i]));
/** Area kolom → kolom satuan (dipakai kapasitas, cek, rintangan rak adaptif & 3D). Kolom di luar gedung (trapesium) dilewati. */
export function uraiGridKolom(k: Komponen, g?: Gedung): Komponen[] {
  const s = k.gridKolom; if (!s) return [];
  const { xs, zs } = asGridKolom(k); const lewati = new Set(s.lewati ?? []); const out: Komponen[] = [];
  xs.forEach((x, i) => zs.forEach((z, j) => {
    if (lewati.has(`${i}-${j}`)) return;
    const hx = s.kolomW / 2, hz = s.kolomD / 2;
    if (g?.trapesium && [[x - hx, z - hz], [x + hx, z - hz], [x - hx, z + hz], [x + hx, z + hz]].some(([px, pz]) => !diDalamGedung(g, px, pz, 0.02))) return;
    out.push({ id: `${k.id}~${i}~${j}`, jenis: 'kolom', label: `${k.label} ${String.fromCharCode(65 + (j % 26))}${i + 1}`, x: r2(x - s.kolomW / 2), z: r2(z - s.kolomD / 2), w: s.kolomW, d: s.kolomD, tinggi: k.tinggi, induk: k.id });
  }));
  return out;
}
/** Area kolom → kolom satuan yang bisa diedit / digeser satu per satu. */
export const pecahGridKolom = (k: Komponen, g?: Gedung): Komponen[] => uraiGridKolom(k, g).map(c => ({ ...c, id: uid(), induk: undefined }));
/** Kolom satuan (semua, atau yang dipilih) → 1 area kolom: as dikelompokkan (toleransi 5 cm), bentang diambil dari jarak as. */
export function gabungJadiAreaKolom(e: LayoutEdit, ids?: string[]): { edit: LayoutEdit; id: string; n: number } | null {
  const kol = e.komponen.filter(c => c.jenis === 'kolom' && (!ids?.length || ids.includes(c.id)));
  if (kol.length < 2) return null;
  const grup = (v: number[]) => { const out: number[] = []; for (const x of [...v].sort((a, b) => a - b)) if (!out.length || x - out[out.length - 1] > 0.05) out.push(x); return out; };
  const xs = grup(kol.map(c => c.x + c.w / 2)), zs = grup(kol.map(c => c.z + c.d / 2));
  const w = Math.max(...kol.map(c => c.w)), d = Math.max(...kol.map(c => c.d));
  const cari = (as: number[], v: number) => as.findIndex(a => Math.abs(a - v) <= 0.05);
  const ada = new Set(kol.map(c => `${cari(xs, c.x + c.w / 2)}-${cari(zs, c.z + c.d / 2)}`));
  const lewati: string[] = []; xs.forEach((_, i) => zs.forEach((__, j) => { if (!ada.has(`${i}-${j}`)) lewati.push(`${i}-${j}`); }));
  const nb: Komponen = { id: uid(), jenis: 'areaKolom', label: 'Area kolom', x: r2(xs[0] - w / 2), z: r2(zs[0] - d / 2), w: r2(xs[xs.length - 1] - xs[0] + w), d: r2(zs[zs.length - 1] - zs[0] + d),
    tinggi: Math.max(...kol.map(c => c.tinggi)), gridKolom: { bentangX: bentangAktual(xs).length ? bentangAktual(xs) : [6], bentangZ: bentangAktual(zs).length ? bentangAktual(zs) : [6], kolomW: w, kolomD: d, tutupUjung: false, lewati } };
  const buang = new Set(kol.map(c => c.id));
  return { edit: { ...e, komponen: [...e.komponen.filter(c => !buang.has(c.id)), nb] }, id: nb.id, n: kol.length };
}
/** Komponen mentah dengan area kolom diganti kolom satuannya (rintangan & cek). */
export const denganKolom = (ks: Komponen[], g?: Gedung) => ks.flatMap(k => (k.gridKolom ? uraiGridKolom(k, g) : [k]));
const r2 = (v: number) => Math.round(v * 100) / 100;

export const tinggiRak = (r: SpekRak) => (r.level1Mm + Math.max(0, r.level - 1) * r.levelNMm) / 1000;
export const levelDariTinggi = (r: SpekRak, tinggiM: number) => Math.max(1, 1 + Math.floor((tinggiM * 1000 - r.level1Mm) / Math.max(1, r.levelNMm) + 1e-9));
/** Panjang & kedalaman rak menurut arah. */
export const dimRak = (k: Komponen) => (k.rak?.arah === 'z' ? { panjang: k.d, dalam: k.w } : { panjang: k.w, dalam: k.d });
export const nBay = (k: Komponen) => (k.rak ? Math.max(0, Math.floor(dimRak(k).panjang / k.rak.bayW + 1e-6)) : 0);
export const kapasitasRak = (k: Komponen) => (k.rak ? nBay(k) * k.rak.ppl * k.rak.deep * k.rak.level : 0);
export interface BarisBlok { x: number; z: number; w: number; d: number; nPalet: number; deep: number; hadap: 1 | -1 | 0 }
export interface UraiBlok {
  baris: BarisBlok[]; lorong: { x: number; z: number; w: number; d: number; lebar: number }[];
  gangway: { x: number; z: number; w: number; d: number; lebar: number }[];
  /** nBaris = jumlah garis baris melintang; nPaletBaris = palet sepanjang satu garis baris (semua segmen) */
  nBaris: number; segmen: number[]; urutanPanjang: { jenis: 'dinding' | 'palet' | 'gangway' | 'sisa'; m: number; n?: number }[];
  tapak: number; nPaletBaris: number; urutan: { jenis: 'dinding' | 'baris' | 'celah' | 'lorong' | 'sisa'; m: number; n?: number }[]; sisa: number;
}
/** Bentuk baris & lorong block stack dari pola (lihat SpekBlok). */
export function uraiBlok(k: Komponen): UraiBlok {
  const b = { ...BLOK_DEFAULT, ...(k.blok ?? {}) };
  const ax = b.arah === 'x';
  const A0 = ax ? k.x : k.z, B0 = ax ? k.z : k.x, PA = ax ? k.w : k.d, PB = ax ? k.d : k.w;
  const jd = Math.max(0, b.jarakDinding), pL = Math.max(0.1, b.paletL), pP = Math.max(0.1, b.paletP), cp = Math.max(0, b.celahPalet);
  // sepanjang baris: jarak dinding | gangway awal | segmen palet | gangway tengah | segmen … | gangway akhir | jarak dinding
  const gA = Math.max(0, b.gangwayAwal ?? 0), gT = Math.max(0, b.gangwayTengah ?? 0), nG = Math.max(0, Math.round(b.nGangway ?? 0)), gZ = Math.max(0, b.gangwayAkhir ?? 0);
  const panjangSeg = (PA - 2 * jd - gA - gZ - nG * gT) / (nG + 1);
  const nSeg = panjangSeg > 0 ? Math.max(0, Math.floor((panjangSeg + cp) / (pL + cp) + 1e-6)) : 0;
  const segmen = Array.from({ length: nG + 1 }, () => nSeg);
  const nPalet = nSeg * (nG + 1);
  const lebarSeg = Math.max(0, nSeg * pL + Math.max(0, nSeg - 1) * cp);
  const mulaiSeg = segmen.map((_, i) => A0 + jd + gA + i * (panjangSeg + gT));
  const urutanPanjang: UraiBlok['urutanPanjang'] = [{ jenis: 'dinding', m: jd }];
  if (gA > 0) urutanPanjang.push({ jenis: 'gangway', m: gA });
  segmen.forEach((n, i) => {
    if (i > 0) urutanPanjang.push({ jenis: 'gangway', m: gT });
    urutanPanjang.push({ jenis: 'palet', m: r2(lebarSeg), n });
    if (panjangSeg - lebarSeg > 0.05) urutanPanjang.push({ jenis: 'sisa', m: r2(panjangSeg - lebarSeg) });
  });
  if (gZ > 0) urutanPanjang.push({ jenis: 'gangway', m: gZ });
  urutanPanjang.push({ jenis: 'dinding', m: jd });
  const deep = Math.max(1, Math.round(b.deep)), perBlok = Math.max(1, Math.round(b.barisPerBlok)), tepi = Math.max(1, Math.round(b.barisTepi));
  const dBaris = deep * pP;
  const dBlok = (n: number) => n * dBaris + Math.max(0, n - 1) * b.celahBaris;
  const lebarLorong = (i: number) => (i === 0 ? b.lorongAwal : b.lorong);
  const tersedia = PB - 2 * jd;
  // susunan blok melintang: [tepi] (lorong [perBlok])* lorong [tepi]; bila tidak muat, kurangi
  let blok: number[] = [];
  const total = (bs: number[]) => bs.reduce((s, n, i) => s + dBlok(n) + (i > 0 ? lebarLorong(i - 1) : 0), 0);
  if (dBlok(tepi) <= tersedia + 1e-6) {
    blok = [tepi];
    for (;;) {
      // tambah blok tengah selama masih ada ruang untuk blok tepi penutup; sisanya diisi blok sebanyak-banyaknya baris yang muat
      if (total([...blok, perBlok, tepi]) <= tersedia + 1e-6) { blok.push(perBlok); continue; }
      for (let n = Math.max(perBlok, tepi); n >= 1; n--) if (total([...blok, n]) <= tersedia + 1e-6) { blok.push(n); break; }
      break;
    }
  }
  const baris: BarisBlok[] = []; const lorong: UraiBlok['lorong'] = []; const urutan: UraiBlok['urutan'] = [{ jenis: 'dinding', m: jd }];
  let pos = B0 + jd;
  const panjangPenuh = segmen.length ? mulaiSeg[mulaiSeg.length - 1] + lebarSeg - (A0 + jd) : 0;
  const kotak = (b0: number, tebal: number, a0 = A0 + jd, pj = panjangPenuh) => (ax ? { x: a0, z: b0, w: Math.max(0, pj), d: tebal } : { x: b0, z: a0, w: tebal, d: Math.max(0, pj) });
  blok.forEach((n, i) => {
    if (i > 0) { const lb = lebarLorong(i - 1); lorong.push({ ...kotak(pos, lb), lebar: lb }); urutan.push({ jenis: 'lorong', m: lb }); pos += lb; }
    for (let r = 0; r < n; r++) {
      if (r > 0) { urutan.push({ jenis: 'celah', m: b.celahBaris }); pos += b.celahBaris; }
      // muka baris: menghadap lorong terdekat (baris pertama blok → lorong sebelumnya, baris terakhir → lorong sesudahnya)
      const adaSebelum = i > 0, adaSesudah = i < blok.length - 1;
      const hadap: 1 | -1 | 0 = r === n - 1 && adaSesudah ? 1 : r === 0 && adaSebelum ? -1 : 0;
      if (nSeg > 0) segmen.forEach((n, sg) => baris.push({ ...kotak(pos, dBaris, mulaiSeg[sg], lebarSeg), nPalet: n, deep, hadap }));
      urutan.push({ jenis: 'baris', m: dBaris, n: 1 });
      pos += dBaris;
    }
  });
  const sisa = Math.max(0, B0 + PB - jd - pos);
  if (blok.length) { if (sisa > 0.005) urutan.push({ jenis: 'sisa', m: r2(sisa) }); urutan.push({ jenis: 'dinding', m: jd }); }
  // gangway: memotong semua baris, selebar area melintang (di dalam jarak dinding)
  const gangway: UraiBlok['gangway'] = [];
  const pasang = (a0: number, lb: number) => { if (lb > 0) gangway.push({ ...(ax ? { x: a0, z: B0 + jd, w: lb, d: Math.max(0, PB - 2 * jd) } : { x: B0 + jd, z: a0, w: Math.max(0, PB - 2 * jd), d: lb }), lebar: lb }); };
  if (blok.length) {
    pasang(A0 + jd, gA);
    for (let i = 1; i < segmen.length; i++) pasang(mulaiSeg[i] - gT, gT);
    pasang(A0 + PA - jd - gZ, gZ);
  }
  const nBaris = blok.reduce((a, n) => a + n, 0);
  return { baris, lorong, gangway, nBaris: nSeg > 0 ? nBaris : 0, segmen, urutanPanjang, tapak: baris.reduce((a, r) => a + r.nPalet * r.deep, 0), nPaletBaris: nPalet, urutan, sisa };
}
export const tapakBlok = (k: Komponen) => (k.blok ? uraiBlok(k).tapak : Math.max(0, Math.floor(k.w / 1.3 + 1e-6)) * Math.max(0, Math.floor(k.d / 1.1 + 1e-6)));

export const DEFAULT_RAK = (p: ParamSim, ddr: boolean): SpekRak => {
  const d = ddr ? p.ddr : p.spr;
  const level1 = p.palletMm + p.productMm + p.clearanceMm, levelN = p.beamMm + level1;
  const lvAuto = p.sideMm >= level1 ? 1 + Math.floor((p.sideMm - level1) / levelN + 1e-9) : 1;
  return { arah: 'x', hadap: 1, bayW: d.width, ppl: Math.round(d.ppl), deep: ddr ? Math.max(1, Math.round(p.ddr.deep)) : 1,
    level: p.levelManual && p.levelManual > 0 ? p.levelManual : lvAuto, level1Mm: level1, levelNMm: levelN, beamMm: p.beamMm, lebarLorong: r2(2 * d.koridor) };
};

/** Titik awal: layout otomatis (dari data tender) → komponen yang bisa diedit. */
export function dariOtomatis(L: LayoutGudang, p: ParamSim, stokDesain: number): LayoutEdit {
  const k: Komponen[] = [];
  for (const z of L.zona) {
    if (z.jenis === 'stagingIn' || z.jenis === 'stagingOut') {
      const n = L.palet.filter(pl => pl.jenis === z.jenis && pl.y === 0).length;
      k.push({ id: uid(), jenis: z.jenis, label: z.label, x: r2(z.x0 + 3.5), z: r2(z.z0), w: r2(z.x1 - z.x0 - 3.5), d: r2(z.z1 - z.z0), tinggi: 0, palet: n, tumpuk: 1 });
    } else if (z.jenis === 'jalur') k.push({ id: uid(), jenis: 'jalur', label: z.label, x: r2(z.x0), z: 0, w: r2(z.x1 - z.x0), d: r2(L.W), tinggi: 0 });
    else if (z.jenis === 'block' || z.jenis === 'floor') {
      const tumpuk = z.jenis === 'block' ? Math.max(1, Math.round(p.blockTumpuk)) : 1;
      k.push({ id: uid(), jenis: 'block', label: z.label, x: r2(z.x0 + 1), z: 1, w: r2(z.x1 - z.x0 - 2), d: r2(L.W - 2), tinggi: r2(tumpuk * L.tinggiPalet), tumpuk });
    }
  }
  for (const r of L.rak) {
    const spek = DEFAULT_RAK(p, r.jenis === 'ddr'); spek.hadap = r.hadap; spek.level = r.level;
    const lor = L.lorong.find(lo => Math.abs(lo.z0 - (r.hadap === 1 ? r.z0 + r.depth : r.z0)) < (spek.lebarLorong / 2 + 0.6));
    if (lor) spek.lebarLorong = r2(spek.lebarLorong);
    k.push({ id: uid(), jenis: r.jenis, label: r.jenis === 'spr' ? 'Rak SPR' : 'Rak DDR', x: r2(r.x0), z: r2(r.z0), w: r2(r.nBay * r.bayW), d: r2(r.depth), tinggi: r2(tinggiRak(spek)), rak: spek });
  }
  for (const f of L.fasilitas) k.push({ id: uid(), jenis: 'fasilitas', label: f.nama, x: r2(f.x0), z: r2(f.z0), w: r2(f.x1 - f.x0), d: r2(f.z1 - f.z0), tinggi: 3 });
  for (const d of L.dock) k.push({ id: uid(), jenis: 'dock', label: d.arus === 'inbound' ? 'Dock IN' : 'Dock OUT', x: 0, z: r2(Math.min(Math.max(0, d.z - 1.6), L.W - 3.2)), w: 0.3, d: 3.2, tinggi: 4.2, arus: d.arus });
  return { versi: 1, gedung: { L: r2(L.L), W: r2(L.W), sideMm: p.sideMm, centerMm: p.centerMm }, komponen: k, ukur: [], latar: null, okupansi: null, stokDesain, tinggiPalet: L.tinggiPalet };
}

/** Konteks area untuk mode adaptif: rintangan (komponen lain) & ukuran gedung. */
type KonteksArea = Pick<LayoutEdit, 'komponen' | 'gedung'> | undefined;

/** Rentang sepanjang baris (A) yang dipakai: mode adaptif dipotong ke dalam gedung dikurangi jarak bebas dinding. */
function rentangA(k: Komponen, e: KonteksArea) {
  const a = k.area!; const ax = a.rak.arah === 'x';
  let A0 = ax ? k.x : k.z, A1 = A0 + (ax ? k.w : k.d);
  if (a.mode === 'adaptif' && e) { const m = Math.max(0, a.bebasDinding ?? 0.5), Lb = ax ? e.gedung.L : e.gedung.W; A0 = Math.max(A0, m); A1 = Math.min(A1, Lb - m); }
  return { A0, A: Math.max(0, A1 - A0) };
}

/**
 * Cross aisle aktual sepanjang baris: jumlah bay per segmen (selisih maks 1 bay) dan lebar awal / tengah / akhir
 * setelah sisa panjang (< 1 bay) ditaruh sesuai pilihan.
 */
export function celahArea(k: Komponen, e?: KonteksArea): { a0: number; awal: number; tengah: number; akhir: number; bay: number[]; sisa: number } | null {
  const a = k.area; if (!a) return null;
  const s = a.rak; const { A0, A } = rentangA(k, e);
  const nT = Math.max(0, Math.round(a.nTengah)), nSeg = nT + 1;
  const awal = Math.max(0, a.crossAwal), akhir = Math.max(0, a.crossAkhir), tengah = Math.max(0, a.crossTengah);
  const pakai = A - awal - akhir - nT * tengah;
  const nbTot = Math.floor(pakai / s.bayW + 1e-6);
  if (nbTot < nSeg) return null;
  const bay = Array.from({ length: nSeg }, (_, i) => Math.floor(nbTot / nSeg) + (i < nbTot % nSeg ? 1 : 0));
  const sisa = Math.max(0, pakai - nbTot * s.bayW);
  const mode = a.sisa ?? 'otomatis';
  const g = { awal, tengah, akhir };
  if (mode === 'awal') g.awal += sisa; else if (mode === 'akhir') g.akhir += sisa;
  else if (nT > 0) g.tengah += sisa / nT; else { g.awal += sisa / 2; g.akhir += sisa / 2; }
  return { a0: A0, ...g, bay, sisa };
}

const JENIS_RINTANGAN = ['kolom', 'fasilitas', 'block', 'stagingIn', 'stagingOut', 'jalur', 'zona', 'spr', 'ddr', 'areaRak'];

/**
 * Baris rak di dalam satu area rak (dibentuk ulang setiap kali area ditarik / parameternya diubah).
 * Mode grid (1): pola tetap. Mode adaptif (2): dipotong ke dalam gedung, garis kolom diletakkan di row spacer
 * (lebar spacer = lebar kolom + kelonggaran kiri-kanan) dengan lorong melebar seperlunya (≥ lebar minimum),
 * dan baris dipotong di sekitar kolom / office / ramp / rintangan lain sehingga rak tetap berdiri maksimal.
 */
function susunBaris(k: Komponen, e?: KonteksArea) {
  const a = k.area; if (!a) return null;
  const s = a.rak; const ax = s.arah === 'x'; const adaptif = a.mode === 'adaptif';
  let B0 = ax ? k.z : k.x, B1 = B0 + (ax ? k.d : k.w);
  const D = Math.max(0.3, a.dalam), Lor = Math.max(0, s.lebarLorong), gap0 = Math.max(0, a.b2b);
  const kel = Math.max(0, a.kelonggaran ?? 0.1), bebas = Math.max(0, a.bebasRintangan ?? 0.3);
  if (adaptif && e) { const m = Math.max(0, a.bebasDinding ?? 0.5), Wb = ax ? e.gedung.W : e.gedung.L; B0 = Math.max(B0, m); B1 = Math.min(B1, Wb - m); }
  const c = celahArea(k, e); if (!c) return null;
  const seg: { p: number; pj: number }[] = []; for (let i = 0, p = c.a0 + c.awal; i < c.bay.length; p += c.bay[i] * s.bayW + c.tengah, i++) seg.push({ p, pj: c.bay[i] * s.bayW });
  // rintangan (mode adaptif): kotak di koordinat A (sepanjang baris) & B (melintang), sudah ditambah kelonggaran
  const { A0 } = rentangA(k, e); const A1 = A0 + rentangA(k, e).A;
  const rint = adaptif && e ? denganKolom(e.komponen, e.gedung).filter(o => o.id !== k.id && JENIS_RINTANGAN.includes(o.jenis)).map(o => {
    const m = o.jenis === 'kolom' ? kel : o.jenis === 'jalur' ? 0 : bebas;
    const oa0 = ax ? o.x : o.z, oa1 = oa0 + (ax ? o.w : o.d), ob0 = ax ? o.z : o.x, ob1 = ob0 + (ax ? o.d : o.w);
    return { a0: oa0 - m, a1: oa1 + m, b0: ob0 - m, b1: ob1 + m, kolom: o.jenis === 'kolom', inti: { b0: ob0, b1: ob1 } };
  }).concat(kotakLuar(e.gedung).map(o => {
    // area di luar dinding miring (gedung trapesium) diperlakukan sebagai rintangan + jarak bebas dinding
    const m = Math.max(0, a.bebasDinding ?? 0.5);
    const oa0 = ax ? o.x0 : o.z0, oa1 = ax ? o.x1 : o.z1, ob0 = ax ? o.z0 : o.x0, ob1 = ax ? o.z1 : o.x1;
    return { a0: oa0 - m, a1: oa1 + m, b0: ob0 - m, b1: ob1 + m, kolom: false, inti: { b0: ob0, b1: ob1 } };
  })).filter(r => r.a1 > A0 && r.a0 < A1 && r.b1 > B0 && r.b0 < B1) : [];
  // garis kolom melintang (dikelompokkan bila bertumpuk), untuk diletakkan di row spacer
  const garisKolom: { b0: number; b1: number }[] = [];
  for (const r of rint.filter(x => x.kolom).sort((p, q) => p.inti.b0 - q.inti.b0)) {
    const g = garisKolom[garisKolom.length - 1];
    if (g && r.inti.b0 <= g.b1 + 0.05) g.b1 = Math.max(g.b1, r.inti.b1); else garisKolom.push({ ...r.inti });
  }
  // kolom tepi (menempel / dekat dinding): rak tepi digeser melewati kolom (+ kelonggaran), bukan dipotong
  if (adaptif) {
    const dekat = 0.3 + kel;
    for (const g of garisKolom) if (g.b0 <= B0 + dekat && g.b1 + kel > B0) B0 = g.b1 + kel;
    for (const g of [...garisKolom].reverse()) if (g.b1 >= B1 - dekat && g.b0 - kel < B1) B1 = g.b0 - kel;
    for (let i = garisKolom.length - 1; i >= 0; i--) if (garisKolom[i].b1 <= B0 || garisKolom[i].b0 >= B1) garisKolom.splice(i, 1);
  }
  const B = B1 - B0; if (D > B + 1e-6) return null;
  // melintang: [tepi tunggal] lorong [pasangan / tunggal] lorong ... [sisa tunggal]
  const baris: { b: number; hadap: 1 | -1 }[] = [];
  const pair = 2 * D + gap0;
  if (adaptif && a.konfigurasi === 'b2b' && garisKolom.length) {
    // tiap garis kolom = jangkar pasangan back-to-back (kolom di row spacer); ruang di antara jangkar diisi pasangan rak,
    // sisa ruang dibagi rata ke lorong (lorong melebar, tidak pernah < minimum)
    const awalRak = a.mulai !== 'lorong';
    let jangkar = garisKolom.map(g => { const g2 = Math.max(gap0, g.b1 - g.b0 + 2 * kel); const P = (g.b0 + g.b1) / 2 - g2 / 2 - D; return { P, E: P + 2 * D + g2, g2 }; })
      .filter(j => j.P >= B0 - 1e-6 && j.E <= B1 + 1e-6);
    const pilih: typeof jangkar = [];
    for (const j of jangkar) { const lo = pilih.length ? pilih[pilih.length - 1].E : B0; if (j.P - lo >= Lor - 1e-6) pilih.push(j); }
    while (pilih.length && B1 - pilih[pilih.length - 1].E < Lor - 1e-6) pilih.pop();
    jangkar = pilih;
    const isi = (lo: number, hi: number, tepiAwal: boolean, tepiAkhir: boolean) => {
      const Lr = hi - lo; let tetap = tepiAwal && Lr - D >= Lor - 1e-6 ? D : 0;
      if (Lr - tetap < Lor - 1e-6) return;
      const n = Math.max(0, Math.floor((Lr - tetap - Lor + 1e-6) / (pair + Lor)));
      let sisa = Lr - tetap - n * pair - (n + 1) * Lor;
      // sisa yang tidak cukup untuk pasangan: isi baris single (masing-masing dengan lorongnya sendiri)
      const m = Math.max(0, Math.floor((sisa + 1e-6) / (D + Lor))); sisa -= m * (D + Lor);
      const akhirS = tepiAkhir && sisa >= D - 1e-6; if (akhirS) sisa -= D;
      // sisa ruang: pas (lorong = isian, sisa ke lorong terakhir / pertama) atau dibagi rata
      const cara = a.sisaLorong ?? 'akhir';
      const lor = cara === 'rata' ? Lor + sisa / (n + m + 1) : Lor;
      let q2 = lo;
      if (tetap) { baris.push({ b: q2, hadap: 1 }); q2 += D; }
      q2 += lor + (cara === 'awal' ? sisa : 0);
      for (let i = 0; i < n; i++) { baris.push({ b: q2, hadap: -1 }, { b: q2 + D + gap0, hadap: 1 }); q2 += pair + lor; }
      for (let i = 0; i < m; i++) { baris.push({ b: q2, hadap: -1 }); q2 += D + lor; }
      if (akhirS) baris.push({ b: q2, hadap: -1 });
    };
    let lo = B0;
    jangkar.forEach((j, i) => { isi(lo, j.P, i === 0 && awalRak, false); baris.push({ b: j.P, hadap: -1 }, { b: j.P + D + j.g2, hadap: 1 }); lo = j.E; });
    isi(lo, B1, !jangkar.length && awalRak, true);
  } else {
    let q = B0;
    if (a.mulai === 'lorong') q += Lor; else { baris.push({ b: q, hadap: 1 }); q = q + D + Lor; }
    for (let iter = 0; iter < 500; iter++) {
      const unit = a.konfigurasi === 'b2b' ? pair : D;
      if (q + unit > B1 + 1e-6) break;
      if (a.konfigurasi === 'b2b') baris.push({ b: q, hadap: -1 }, { b: q + D + gap0, hadap: 1 }); else baris.push({ b: q, hadap: 1 });
      q += unit + Lor;
    }
    if (q + D <= B1 + 1e-6) baris.push({ b: q, hadap: -1 });             // sisa: tunggal menghadap lorong sebelumnya
  }
  // geser manual per baris (melintang) — dari panel / seret baris di denah
  const gb = a.geserBaris ?? {};
  const asli = baris.map(br => br.b);
  baris.forEach((br, ix) => { const d0 = Number(gb[ix]) || 0; if (d0) br.b += d0; });
  return { a, s, ax, D, Lor, rint, seg, baris, asli };
}

/** Baris rak di area (posisi melintang setelah geser manual) — dipakai seret / panel baris. */
export function barisArea(k: Komponen, e?: KonteksArea): { b: number; hadap: 1 | -1; asli: number }[] {
  const h = susunBaris(k, e); if (!h) return [];
  return h.baris.map((br, i) => ({ b: br.b, hadap: br.hadap, asli: h.asli[i] }));
}

/** Nomor baris yang satu unit dengan baris `i` (pasangan back-to-back: celah < lebar lorong). */
export function unitBaris(k: Komponen, e: KonteksArea, i: number): number[] {
  const h = susunBaris(k, e); if (!h || !h.baris[i]) return [i];
  const out = [i]; const bs = h.baris;
  const celah = (p: number, q: number) => bs[q].b - (bs[p].b + h.D);
  if (i > 0 && bs[i].hadap === 1 && bs[i - 1].hadap === -1 && celah(i - 1, i) < h.Lor - 0.05) out.unshift(i - 1);
  if (i + 1 < bs.length && bs[i].hadap === -1 && bs[i + 1].hadap === 1 && celah(i, i + 1) < h.Lor - 0.05) out.push(i + 1);
  return out;
}

/**
 * Celah melintang di depan & di belakang unit baris `idx` (pasangan / tunggal): sebelum = dari baris sebelumnya,
 * sesudah = ke baris berikutnya (null bila tidak ada). awal / akhir = tepi unit (koordinat melintang).
 */
export function celahBaris(k: Komponen, e: KonteksArea, idx: number[]): { sebelum: number | null; sesudah: number | null; awal: number; akhir: number; prevAkhir: number | null; nextAwal: number | null } | null {
  const h = susunBaris(k, e); if (!h || !idx.length) return null;
  const bs = h.baris; const i0 = Math.min(...idx), i1 = Math.max(...idx); if (!bs[i0] || !bs[i1]) return null;
  const awal = bs[i0].b, akhir = bs[i1].b + h.D;
  const prevAkhir = i0 > 0 ? bs[i0 - 1].b + h.D : null, nextAwal = i1 + 1 < bs.length ? bs[i1 + 1].b : null;
  return { sebelum: prevAkhir == null ? null : r2(awal - prevAkhir), sesudah: nextAwal == null ? null : r2(nextAwal - akhir), awal, akhir, prevAkhir, nextAwal };
}
/** Tambah geser manual (m, melintang) ke baris-baris `idx`; nilai ≈ 0 dibuang. */
export function geserBarisArea(a: SpekArea, idx: number[], delta: number, dasar?: Record<string, number>): SpekArea {
  const g = { ...(a.geserBaris ?? {}) };
  for (const i of idx) { const v = r2((Number((dasar ?? a.geserBaris ?? {})[i]) || 0) + delta); if (Math.abs(v) < 0.005) delete g[i]; else g[i] = v; }
  return { ...a, geserBaris: Object.keys(g).length ? g : undefined };
}

export function uraiArea(k: Komponen, e?: KonteksArea): Komponen[] {
  const h = susunBaris(k, e); if (!h) return [];
  const { a, s, ax, D, rint, seg, baris } = h;
  // sepanjang baris: potong segmen di sekitar rintangan yang menyentuh baris ini (mode adaptif), bay penuh, tanpa panjang minimum
  const out: Komponen[] = []; let i = 0;
  const tinggi = r2(tinggiRak(s));
  for (const [bk, br] of baris.entries()) {
    const kena = rint.filter(r => r.b1 > br.b + 1e-6 && r.b0 < br.b + D - 1e-6);
    for (const sa of seg) {
      let bebasA: [number, number][] = [[sa.p, sa.p + sa.pj]];
      for (const r of kena) bebasA = bebasA.flatMap(([x0, x1]) => (r.a1 <= x0 || r.a0 >= x1 ? [[x0, x1]] : [[x0, r.a0], [r.a1, x1]]).filter(([u, v]) => v - u > 1e-6) as [number, number][]);
      for (const [x0, x1] of bebasA) {
        const nb = Math.floor((x1 - x0) / s.bayW + 1e-6); if (nb < 1) continue;
        const pj = r2(nb * s.bayW);
        const pos = ax ? { x: r2(x0), z: r2(br.b), w: pj, d: r2(D) } : { x: r2(br.b), z: r2(x0), w: r2(D), d: pj };
        out.push({ id: `${k.id}~${i++}`, jenis: a.jenisRak, label: k.label, ...pos, tinggi, rak: { ...s, hadap: br.hadap }, induk: k.id, barisKe: bk });
      }
    }
  }
  return out;
}
/** Semua komponen dengan area rak diganti baris-baris raknya (dipakai kapasitas, cek, dan 3D). */
export const uraiKomponen = (ks: Komponen[], e?: KonteksArea) => ks.flatMap(k => (k.area ? uraiArea(k, e ?? { komponen: ks, gedung: { L: 1e6, W: 1e6, sideMm: 0, centerMm: 0 } })
  : k.gridKolom ? uraiGridKolom(k, e?.gedung) : [k]));
export const ringkasArea = (k: Komponen, e?: KonteksArea) => {
  const rows = uraiArea(k, e); const per = new Set(rows.map(r => (k.area!.rak.arah === 'x' ? r.z : r.x)));
  return { baris: per.size, bay: rows.reduce((a, r) => a + nBay(r), 0), posisi: rows.reduce((a, r) => a + kapasitasRak(r), 0) };
};
/**
 * Lorong & row spacer aktual di dalam area (dari baris yang terbentuk): lebar melintang, posisi garis ukur sepanjang baris.
 * jenis 'lorong' = jarak antarbaris ≥ lebar lorong minimum; 'spacer' = celah back-to-back (termasuk spacer kolom).
 */
export function lorongArea(k: Komponen, e?: KonteksArea): { jenis: 'lorong' | 'spacer' | 'sisa'; b0: number; b1: number; lebar: number; a: number }[] {
  const a = k.area; if (!a) return [];
  const ax = a.rak.arah === 'x'; const D = Math.max(0.3, a.dalam); const Lor = Math.max(0, a.rak.lebarLorong);
  const strip = new Map<number, { b: number; a0: number; a1: number; hadap: number }>();
  for (const r of uraiArea(k, e)) {
    const b = ax ? r.z : r.x, a0 = ax ? r.x : r.z, a1 = a0 + (ax ? r.w : r.d);
    const t = strip.get(b); if (t) { t.a0 = Math.min(t.a0, a0); t.a1 = Math.max(t.a1, a1); } else strip.set(b, { b, a0, a1, hadap: r.rak!.hadap });
  }
  const st = [...strip.values()].sort((p, q) => p.b - q.b); const out: ReturnType<typeof lorongArea> = [];
  const tepi = e ? (ax ? e.gedung.W : e.gedung.L) : Infinity;
  const tambah = (jenis: 'lorong' | 'spacer' | 'sisa', b0: number, b1: number, a0: number, a1: number) => {
    const lebar = r2(b1 - b0); if (lebar < 0.01) return;
    out.push({ jenis, b0, b1, lebar, a: a1 - a0 > 2.4 ? a0 + 1.2 : (a0 + a1) / 2 });
  };
  // lorong ke dinding: bagian selebar isian menempel muka rak, sisanya ditandai sisa
  const keDinding = (b0: number, b1: number, mukaDiAkhir: boolean, a0: number, a1: number) => {
    if (a.sisaLorong === 'rata' || b1 - b0 <= Lor + 0.05) { tambah('lorong', b0, b1, a0, a1); return; }
    if (mukaDiAkhir) { tambah('sisa', b0, b1 - Lor, a0, a1); tambah('lorong', b1 - Lor, b1, a0, a1); }
    else { tambah('lorong', b0, b0 + Lor, a0, a1); tambah('sisa', b0 + Lor, b1, a0, a1); }
  };
  if (st.length && st[0].hadap === -1 && st[0].b >= Lor - 0.05 && st[0].b < Lor * 3) keDinding(0, st[0].b, true, st[0].a0, st[0].a1);
  for (let i = 0; i + 1 < st.length; i++) {
    const p = st[i], q = st[i + 1]; const b0 = p.b + D, b1 = q.b; if (b1 - b0 < 0.01) continue;
    const a0 = Math.max(p.a0, q.a0), a1 = Math.min(p.a1, q.a1);
    const pa0 = a1 > a0 ? a0 : p.a0, pa1 = a1 > a0 ? a1 : p.a1;
    if (b1 - b0 < Lor - 0.05) { tambah('spacer', b0, b1, pa0, pa1); continue; }
    // lorong lebih lebar dari isian (sisa ruang melintang): tampil sebagai lorong = isian + sisa, kecuali mode "dibagi rata"
    if (a.sisaLorong !== 'rata' && b1 - b0 > Lor + 0.05) {
      const sisaDulu = a.sisaLorong === 'awal';
      if (sisaDulu) { tambah('sisa', b0, b1 - Lor, pa0, pa1); tambah('lorong', b1 - Lor, b1, pa0, pa1); }
      else { tambah('lorong', b0, b0 + Lor, pa0, pa1); tambah('sisa', b0 + Lor, b1, pa0, pa1); }
    } else tambah('lorong', b0, b1, pa0, pa1);
  }
  const l = st[st.length - 1];
  if (l && l.hadap === 1 && tepi - (l.b + D) >= Lor - 0.05 && tepi - (l.b + D) < Lor * 3) keDinding(l.b + D, tepi, false, l.a0, l.a1);
  return out;
}
/** Area rak → baris rak satuan (bisa diedit satu per satu). */
export const pecahArea = (k: Komponen, e?: KonteksArea): Komponen[] => uraiArea(k, e).map(r => ({ ...r, id: uid(), induk: undefined, barisKe: undefined, label: r.jenis === 'ddr' ? 'Rak DDR' : 'Rak SPR' }));

/**
 * Rak satuan → area rak: semua rak sejenis & searah yang sekolom dengan rak terpilih (rentang sepanjang baris sama)
 * digabung jadi satu area; parameter (bay, kedalaman, lorong, jarak back-to-back) diambil dari rak yang ada.
 */
export function gabungJadiArea(e: LayoutEdit, id: string): { edit: LayoutEdit; id: string } | null {
  const k = e.komponen.find(c => c.id === id); if (!k?.rak) return null;
  const s = k.rak; const ax = s.arah === 'x';
  const sp = (c: Komponen) => (ax ? [c.x, c.w] : [c.z, c.d]), lt = (c: Komponen) => (ax ? [c.z, c.d] : [c.x, c.w]);
  const [a0, pj] = sp(k);
  const grup = e.komponen.filter(c => c.rak && c.jenis === k.jenis && c.rak.arah === s.arah && Math.abs(sp(c)[0] - a0) < 0.05 && Math.abs(sp(c)[1] - pj) < 0.05)
    .sort((p, q) => lt(p)[0] - lt(q)[0]);
  const dalam = lt(k)[1];
  const b0 = lt(grup[0])[0], b1 = Math.max(...grup.map(c => lt(c)[0] + lt(c)[1]));
  // jarak back-to-back = celah terkecil antar baris yang saling membelakangi; lorong = celah terkecil antar muka
  let gap = Infinity, lorong = s.lebarLorong;
  for (let i = 1; i < grup.length; i++) { const c = lt(grup[i])[0] - (lt(grup[i - 1])[0] + lt(grup[i - 1])[1]); if (grup[i - 1].rak!.hadap === -1 && grup[i].rak!.hadap === 1) gap = Math.min(gap, c); else if (c > 0.5) lorong = Math.min(lorong, c); }
  const area: SpekArea = { rak: { ...s, hadap: 1 }, jenisRak: k.jenis as 'spr' | 'ddr', konfigurasi: Number.isFinite(gap) ? 'b2b' : 'single', mulai: grup[0].rak!.hadap === 1 ? 'rak' : 'lorong',
    dalam, b2b: Number.isFinite(gap) ? r2(Math.max(0, gap)) : 0.3, crossAwal: 0, crossTengah: 3, nTengah: 0, crossAkhir: 0 };
  area.rak.lebarLorong = r2(lorong);
  const nb: Komponen = { id: uid(), jenis: 'areaRak', label: `Area ${k.jenis === 'ddr' ? 'DDR' : 'SPR'}`, ...(ax ? { x: a0, w: pj, z: b0, d: r2(b1 - b0) } : { z: a0, d: pj, x: b0, w: r2(b1 - b0) }), tinggi: r2(tinggiRak(s)), area };
  const ids = new Set(grup.map(c => c.id));
  return { edit: { ...e, komponen: [...e.komponen.filter(c => !ids.has(c.id)), nb] }, id: nb.id };
}

/** Komponen baru dari palet alat. */
export function komponenBaru(jenis: JenisKomp, p: ParamSim, pusat: { x: number; z: number }, tinggiPalet: number): Komponen[] {
  const dasar = { id: uid(), x: r2(pusat.x), z: r2(pusat.z) };
  switch (jenis) {
    case 'spr': case 'ddr': {
      const s = DEFAULT_RAK(p, jenis === 'ddr'); const depth = jenis === 'ddr' ? p.ddr.depth : p.spr.depth;
      return [{ ...dasar, jenis, label: jenis === 'spr' ? 'Rak SPR' : 'Rak DDR', w: r2(10 * s.bayW), d: depth, tinggi: r2(tinggiRak(s)), rak: s }];
    }
    case 'areaRak': {
      const s = DEFAULT_RAK(p, false);
      return [{ ...dasar, jenis, label: 'Area rak SPR', w: 30, d: 20, tinggi: r2(tinggiRak(s)),
        area: { rak: s, jenisRak: 'spr', konfigurasi: 'b2b', mulai: 'rak', dalam: p.spr.depth, b2b: 0.3, crossAwal: 3, crossTengah: 3, nTengah: 0, crossAkhir: 3 } }];
    }
    case 'block': {
      const tumpuk = Math.max(1, Math.round(p.blockTumpuk) || 2); void tinggiPalet;
      return [{ ...dasar, jenis, label: 'Block stack', w: 24, d: 23.4, tumpuk, tinggi: r2(tumpuk * BLOK_DEFAULT.paletT), blok: { ...BLOK_DEFAULT } }];
    }
    case 'stagingIn': return [{ ...dasar, jenis, label: 'Staging inbound', w: 8, d: 8, palet: 20, tumpuk: 1, tinggi: 0 }];
    case 'stagingOut': return [{ ...dasar, jenis, label: 'Staging outbound', w: 8, d: 8, palet: 20, tumpuk: 1, tinggi: 0 }];
    case 'fasilitas': return [{ ...dasar, jenis, label: 'Office', w: 6, d: 5, tinggi: 3 }];
    case 'dock': return [{ ...dasar, x: 0, jenis, label: 'Dock', w: 0.3, d: 3.2, tinggi: 4.2, arus: 'inbound' }];
    case 'kolom': return [{ ...dasar, jenis, label: 'Kolom', w: 0.4, d: 0.4, tinggi: p.sideMm / 1000 }];
    case 'areaKolom': return [{ ...dasar, jenis, label: 'Area kolom', w: 36.5, d: 24.5, tinggi: p.sideMm / 1000, gridKolom: { bentangX: [12], bentangZ: [12], kolomW: 0.5, kolomD: 0.5, tutupUjung: true } }];
    case 'gate': return [{ ...dasar, x: -0.3, jenis, label: 'Gate', w: 0.6, d: 4, tinggi: 5, sisi: 'depan' }];
    case 'platform': return [{ ...dasar, x: -4, jenis, label: 'Loading dock', w: 4, d: 20, tinggi: 1.2, palet: 8 }];
    case 'jalur': return [{ ...dasar, jenis, label: 'Jalur', w: 10, d: 3.5, tinggi: 0 }];
    default: return [{ ...dasar, jenis: 'zona', label: 'Zona', w: 6, d: 6, tinggi: 0, warna: '#0ea5e9' }];
  }
}

/** Pasangan rak back-to-back (dua baris saling membelakangi). */
export function pasanganRak(p: ParamSim, ddr: boolean, pusat: { x: number; z: number }): Komponen[] {
  const [a] = komponenBaru(ddr ? 'ddr' : 'spr', p, pusat, 1.4);
  const b: Komponen = { ...a, id: uid(), z: r2(a.z + a.d), rak: { ...a.rak!, hadap: 1 } };
  a.rak = { ...a.rak!, hadap: -1 };
  return [a, b];
}

/** Putar 90°: tukar ukuran X/Z; rak ganti arah baris. */
export function putar(k: Komponen): Komponen {
  const n: Komponen = { ...k, w: k.d, d: k.w };
  if (k.rak) n.rak = { ...k.rak, arah: k.rak.arah === 'x' ? 'z' : 'x' };
  if (k.area) n.area = { ...k.area, rak: { ...k.area.rak, arah: k.area.rak.arah === 'x' ? 'z' : 'x' } };
  if (k.gridKolom) n.gridKolom = { ...k.gridKolom, bentangX: k.gridKolom.bentangZ, bentangZ: k.gridKolom.bentangX, kolomW: k.gridKolom.kolomD, kolomD: k.gridKolom.kolomW, lewati: k.gridKolom.lewati?.map(x => x.split('-').reverse().join('-')) };
  return n;
}

/**
 * Tarik rak otomatis: setiap baris rak dipanjangkan (atau dipendekkan) searah barisnya sampai rintangan terdekat
 * (komponen lain yang sejajar: jalur, staging, block, office, rak lain, kolom, zona) atau dinding dikurangi jarak bebas,
 * lalu dibulatkan ke kelipatan bay penuh. Rak arah X (memanjang menjauhi dock) tetap di titik awalnya dan ditarik ke dinding belakang;
 * rak arah Z ditarik ke dua sisi. Rak diproses berurutan sehingga rak segaris tidak saling tumpang.
 */
export function tarikRak(e: LayoutEdit, opsi: { ids?: string[]; jarakDinding: number }): { edit: LayoutEdit; n: number; bayAwal: number; bayAkhir: number; posAwal: number; posAkhir: number } {
  const g = e.gedung; const m = Math.max(0, opsi.jarakDinding);
  const komp = e.komponen.map(k => ({ ...k }));
  let n = 0, bayAwal = 0, bayAkhir = 0, posAwal = 0, posAkhir = 0;
  for (const k of komp) {
    if (!k.rak || (opsi.ids && !opsi.ids.includes(k.id))) continue;
    const s = k.rak; const ax = s.arah === 'x';
    // sumbu sepanjang baris (a) & melintang (b)
    const a0 = ax ? k.x : k.z, b0 = ax ? k.z : k.x, lb = ax ? k.d : k.w, batas = ax ? g.L : g.W;
    let mulai = m, akhir = batas - m;
    for (const o of denganKolom(komp, g)) {
      if (o.id === k.id || o.jenis === 'dock') continue;
      const oa = ax ? o.x : o.z, op = ax ? o.w : o.d, ob = ax ? o.z : o.x, ol = ax ? o.d : o.w;
      if (!(ob < b0 + lb - EPS && b0 < ob + ol - EPS)) continue;      // tidak sejajar dengan baris ini
      if (oa + op <= a0 + EPS) mulai = Math.max(mulai, oa + op);      // di belakang titik awal
      else if (oa > a0 + EPS) akhir = Math.min(akhir, oa);             // di depan (termasuk yang sekarang tertabrak)
      else akhir = Math.min(akhir, a0);                                 // tumpang di titik awal → tidak bisa ditarik
    }
    const awal = ax ? a0 : mulai;                                       // arah X: tetap di titik awal
    const nb = Math.floor((akhir - awal) / s.bayW + 1e-6);
    const nbLama = nBay(k), kapLama = kapasitasRak(k);
    if (nb < 1) continue;
    const pjBaru = r2(nb * s.bayW);
    if (ax) { k.x = r2(awal); k.w = pjBaru; } else { k.z = r2(awal); k.d = pjBaru; }
    n++; bayAwal += nbLama; bayAkhir += nb; posAwal += kapLama; posAkhir += kapasitasRak(k);
  }
  return { edit: { ...e, komponen: komp }, n, bayAwal, bayAkhir, posAwal, posAkhir };
}

const solid = (k: Komponen) => ['spr', 'ddr', 'areaRak', 'block', 'fasilitas', 'kolom'].includes(k.jenis);
const EPS = 0.02;   // toleransi pembulatan (cm)
const tumpang = (a: Komponen, b: Komponen) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.z < b.z + b.d - EPS && b.z < a.z + a.d - EPS;

/** Jarak bebas dari tepi komponen ke rintangan terdekat (atau dinding) di 4 arah — dipakai garis ukur otomatis & cek lorong. */
export function jarakBebas(e: LayoutEdit, k: Komponen) {
  const lain = denganKolom(e.komponen, e.gedung).filter(o => o.id !== k.id && solid(o));
  const g = e.gedung;
  const ke = (arah: 'x-' | 'x+' | 'z-' | 'z+') => {
    let jarak = arah === 'x-' ? k.x : arah === 'x+' ? g.L - (k.x + k.w) : arah === 'z-' ? k.z : g.W - (k.z + k.d);
    let oleh: Komponen | null = null;
    for (const o of lain) {
      const overlapZ = o.z < k.z + k.d && k.z < o.z + o.d, overlapX = o.x < k.x + k.w && k.x < o.x + o.w;
      if ((arah === 'x-' || arah === 'x+') && !overlapZ) continue;
      if ((arah === 'z-' || arah === 'z+') && !overlapX) continue;
      const j = arah === 'x-' ? k.x - (o.x + o.w) : arah === 'x+' ? o.x - (k.x + k.w) : arah === 'z-' ? k.z - (o.z + o.d) : o.z - (k.z + k.d);
      if (j >= -1e-6 && j < jarak) { jarak = j; oleh = o; }
    }
    return { jarak: Math.max(0, jarak), oleh };
  };
  return { kiri: ke('z-'), kanan: ke('z+'), depan: ke('x-'), belakang: ke('x+') };
}

export interface Ringkasan {
  posisiSpr: number; posisiDdr: number; posisiBlock: number; posisiStaging: number; totalRak: number;
  luasGedung: number; luasRak: number; luasBlock: number; luasStaging: number; luasFasilitas: number; luasJalur: number;
  okupansi: number; paletDitampilkan: number;
  peringatan: { level: 'kritis' | 'peringatan'; pesan: string; id?: string }[];
}

export function ringkas(e0: LayoutEdit): Ringkasan {
  const ks = uraiKomponen(e0.komponen, e0); const e = { ...e0, komponen: ks }; const g = e.gedung;
  const posisiSpr = ks.filter(k => k.jenis === 'spr').reduce((s, k) => s + kapasitasRak(k), 0);
  const posisiDdr = ks.filter(k => k.jenis === 'ddr').reduce((s, k) => s + kapasitasRak(k), 0);
  const posisiBlock = ks.filter(k => k.jenis === 'block').reduce((s, k) => s + tapakBlok(k) * Math.max(1, k.tumpuk ?? 1), 0);
  const posisiStaging = ks.filter(k => k.jenis === 'stagingIn' || k.jenis === 'stagingOut').reduce((s, k) => s + (k.palet ?? 0), 0);
  const luas = (f: (k: Komponen) => boolean) => ks.filter(f).reduce((s, k) => s + k.w * k.d, 0);
  const totalRak = posisiSpr + posisiDdr + posisiBlock;
  const okupansi = e.okupansi != null ? e.okupansi : totalRak > 0 ? Math.min(1, e.stokDesain / totalRak) : 0;
  const peringatan: Ringkasan['peringatan'] = [];
  const sideM = g.sideMm / 1000;
  for (const k of e0.komponen) if (k.area && uraiArea(k, e0).length === 0) peringatan.push({ level: 'peringatan', pesan: `${k.label}: area terlalu kecil untuk 1 baris rak.`, id: k.id });
  for (const k of ks) {
    if (k.jenis !== 'gate' && k.jenis !== 'platform' && (k.x < -EPS || k.z < -EPS || k.x + k.w > g.L + EPS || k.z + k.d > g.W + EPS)) peringatan.push({ level: 'kritis', pesan: `${k.label} keluar dari batas gedung.`, id: k.induk ?? k.id });
    else if (g.trapesium && !['gate', 'platform', 'dock', 'areaRak'].includes(k.jenis) && [[k.x, k.z], [k.x + k.w, k.z], [k.x, k.z + k.d], [k.x + k.w, k.z + k.d]].some(([x, z]) => !diDalamGedung(g, x, z)))
      peringatan.push({ level: 'kritis', pesan: `${k.label} melewati dinding miring (gedung trapesium).`, id: k.induk ?? k.id });
    if (k.rak && tinggiRak(k.rak) > sideM + 1e-6) peringatan.push({ level: 'kritis', pesan: `${k.label}: tinggi rak ${r2(tinggiRak(k.rak))} m melebihi side height ${r2(sideM)} m.`, id: k.induk ?? k.id });
    if (k.rak) {
      const jb = jarakBebas(e, k);
      const muka = k.rak.arah === 'x' ? (k.rak.hadap === 1 ? jb.kanan : jb.kiri) : (k.rak.hadap === 1 ? jb.belakang : jb.depan);
      if (muka.jarak + 1e-6 < k.rak.lebarLorong) peringatan.push({ level: 'peringatan', pesan: `${k.label}: lorong di muka rak ${r2(muka.jarak)} m < kebutuhan ${r2(k.rak.lebarLorong)} m.`, id: k.induk ?? k.id });
      const sisa = dimRak(k).panjang - nBay(k) * k.rak.bayW;
      if (sisa > 0.05) peringatan.push({ level: 'peringatan', pesan: `${k.label}: panjang tidak pas kelipatan bay (sisa ${r2(sisa)} m).`, id: k.induk ?? k.id });
    }
  }
  const pad = ks.filter(solid);
  for (let i = 0; i < pad.length; i++) for (let j = i + 1; j < pad.length; j++)
    if (tumpang(pad[i], pad[j])) peringatan.push({ level: 'kritis', pesan: `${pad[i].label} bertabrakan dengan ${pad[j].label}.`, id: pad[i].induk ?? pad[i].id });
  if (totalRak > 0 && e.stokDesain > totalRak) peringatan.push({ level: 'kritis', pesan: `Kapasitas ${totalRak.toLocaleString('id-ID')} posisi < stok desain ${e.stokDesain.toLocaleString('id-ID')} palet.` });
  return { posisiSpr, posisiDdr, posisiBlock, posisiStaging, totalRak, luasGedung: luasGedung(g), luasRak: luas(k => !!k.rak), luasBlock: luas(k => k.jenis === 'block'),
    luasStaging: luas(k => k.jenis === 'stagingIn' || k.jenis === 'stagingOut'), luasFasilitas: luas(k => k.jenis === 'fasilitas'), luasJalur: luas(k => k.jenis === 'jalur'),
    okupansi, paletDitampilkan: Math.round(okupansi * totalRak), peringatan };
}

function acak(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Layout edit → LayoutGudang untuk viewer 3D (MHE, manpower, aktivitas diambil dari layout otomatis). */
export function keLayoutGudang(e: LayoutEdit, dasar: LayoutGudang): LayoutGudang & { kolom: { x: number; z: number; w: number; d: number; tinggi: number }[] } {
  const g = e.gedung; const ks = uraiKomponen(e.komponen, e); const rk = ringkas(e);
  const zona: Zona[] = []; const rak: BarisRak[] = []; const palet: Palet[] = []; const lorong: Lorong[] = []; const dock: Dock[] = []; const fasilitas: Fasilitas[] = [];
  const kolom: { x: number; z: number; w: number; d: number; tinggi: number }[] = [];
  const gate: NonNullable<LayoutGudang['gate']> = []; const platform: NonNullable<LayoutGudang['platform']> = [];
  const tp = e.tinggiPalet || 1.4;
  const slot: Palet[] = [];
  let maxTinggi = 0;
  for (const k of ks) {
    const box = { x0: k.x, x1: k.x + k.w, z0: k.z, z1: k.z + k.d };
    if (k.rak) {
      const s = k.rak; const { dalam } = dimRak(k); const nb = nBay(k);
      const levelY = [0]; for (let l = 1; l < s.level; l++) levelY.push((s.level1Mm + (l - 1) * s.levelNMm + s.beamMm) / 1000);
      const tinggi = tinggiRak(s); maxTinggi = Math.max(maxTinggi, tinggi);
      rak.push({ jenis: k.jenis as 'spr' | 'ddr', x0: k.x, z0: k.z, depth: dalam, hadap: s.hadap, nBay: nb, bayW: s.bayW, level: s.level, deep: s.deep, ppl: s.ppl, arah: s.arah, levelY, tinggi });
      zona.push({ id: k.id, jenis: k.jenis as JenisZona, label: k.label, ...box, ket: `${nb} bay · ${s.level} level · ${kapasitasRak(k)} posisi` });
      for (let b = 0; b < nb; b++) for (let l = 0; l < s.level; l++) for (let j = 0; j < s.ppl; j++) for (let q = 0; q < s.deep; q++) {
        const sepanjang = b * s.bayW + (j + 0.5) * (s.bayW / s.ppl);
        const dPos = (q + 0.5) * (dalam / s.deep);
        const melintang = s.hadap === 1 ? dalam - dPos : dPos;
        slot.push(s.arah === 'x' ? { x: k.x + sepanjang, y: levelY[l], z: k.z + melintang, jenis: k.jenis as 'spr', rot: true } : { x: k.x + melintang, y: levelY[l], z: k.z + sepanjang, jenis: k.jenis as 'spr', rot: false });
      }
      // lorong di muka rak
      const L2 = s.lebarLorong / 2;
      if (s.arah === 'x') { const zc = s.hadap === 1 ? k.z + k.d + L2 : k.z - L2; lorong.push({ x0: k.x - 1.5, z0: zc, x1: k.x + k.w, z1: zc, zona: k.jenis as 'spr' }); }
      else { const xc = s.hadap === 1 ? k.x + k.w + L2 : k.x - L2; lorong.push({ x0: xc, z0: k.z - 1.5, x1: xc, z1: k.z + k.d, zona: k.jenis as 'spr' }); }
    } else if (k.jenis === 'block' && k.blok) {
      const tumpuk = Math.max(1, k.tumpuk ?? 1); const b = { ...BLOK_DEFAULT, ...k.blok }; const u0 = uraiBlok(k);
      const ax = b.arah === 'x';
      for (const r of u0.baris) for (let a = 0; a < r.nPalet; a++) for (let q = 0; q < r.deep; q++) for (let u = 0; u < tumpuk; u++) {
        const sepanjang = a * (b.paletL + b.celahPalet) + b.paletL / 2, dalam = (q + 0.5) * b.paletP;
        slot.push(ax ? { x: r.x + sepanjang, y: u * b.paletT, z: r.z + dalam, jenis: 'block', rot: true } : { x: r.x + dalam, y: u * b.paletT, z: r.z + sepanjang, jenis: 'block' });
      }
      zona.push({ id: k.id, jenis: 'block', label: k.label, ...box, ket: `${u0.nBaris} baris × ${u0.nPaletBaris} palet × ${b.deep} deep × ${tumpuk} tumpuk = ${u0.tapak * tumpuk} posisi` });
    } else if (k.jenis === 'block') {
      const tumpuk = Math.max(1, k.tumpuk ?? 1);
      const nx = Math.floor(k.w / 1.3 + 1e-6), nz = Math.floor(k.d / 1.1 + 1e-6);
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) for (let u = 0; u < tumpuk; u++) slot.push({ x: k.x + a * 1.3 + 0.65, y: u * tp, z: k.z + b * 1.1 + 0.55, jenis: 'block' });
      zona.push({ id: k.id, jenis: 'block', label: k.label, ...box, ket: `${nx * nz} tapak × ${tumpuk}` });
    } else if (k.jenis === 'stagingIn' || k.jenis === 'stagingOut') {
      const nk = Math.max(1, Math.floor(k.d / 1.1 + 1e-6)); const tumpuk = Math.max(1, k.tumpuk ?? 1);
      const tapak = Math.ceil((k.palet ?? 0) / tumpuk);
      for (let i = 0; i < tapak; i++) {
        const baris = Math.floor(i / nk), kk = i % nk; const x = k.x + k.w - 0.8 - baris * 1.3; if (x < k.x + 0.5) break;
        for (let u = 0; u < tumpuk; u++) palet.push({ x, y: u * tp, z: k.z + 0.55 + kk * 1.1, jenis: k.jenis });
      }
      zona.push({ id: k.id, jenis: k.jenis, label: k.label, ...box, ket: `${k.palet ?? 0} palet` });
    } else if (k.jenis === 'fasilitas') { fasilitas.push({ nama: k.label, x0: k.x, x1: k.x + k.w, z0: k.z, z1: k.z + k.d, tinggi: k.tinggi }); }
    else if (k.jenis === 'dock') dock.push({ z: k.z + k.d / 2, arus: k.arus ?? 'inbound' });
    else if (k.jenis === 'kolom') kolom.push({ x: k.x, z: k.z, w: k.w, d: k.d, tinggi: k.tinggi || g.sideMm / 1000 });
    else if (k.jenis === 'gate') { const pg = posisiGate(k, g); gate.push({ sisi: pg.sisi, pos: pg.pos, lebar: pg.lebar, tinggi: pg.tinggi, arus: k.arus, label: k.label }); }
    else if (k.jenis === 'platform') platform.push({ x0: k.x, x1: k.x + k.w, z0: k.z, z1: k.z + k.d, tinggi: k.tinggi || (g.tinggiDockM ?? 1.2), palet: k.palet ?? 0, label: k.label });
    else zona.push({ id: k.id, jenis: k.jenis === 'jalur' ? 'jalur' : 'custom', label: k.label, ...box, ket: `${r2(k.w)} × ${r2(k.d)} m`, warna: k.warna });
  }
  const rnd = acak(7); for (let i = slot.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [slot[i], slot[j]] = [slot[j], slot[i]]; }
  palet.push(...slot.slice(0, rk.paletDitampilkan));
  const stagingIn = (() => { const k = ks.find(c => c.jenis === 'stagingIn'); return k ? { x0: k.x, x1: k.x + k.w, z0: k.z, z1: k.z + k.d } : { x0: 0, x1: 6, z0: 0, z1: g.W / 2 }; })();
  const stagingOut = (() => { const k = ks.find(c => c.jenis === 'stagingOut'); return k ? { x0: k.x, x1: k.x + k.w, z0: k.z, z1: k.z + k.d } : { x0: 0, x1: 6, z0: g.W / 2, z1: g.W }; })();
  const ringkasan = [
    { label: 'Gedung', nilai: g.trapesium ? `trapesium ${r2(g.L)} m × lebar ${r2(g.trapesium.lebarDepan)} → ${r2(g.trapesium.lebarBelakang)} m = ${Math.round(luasGedung(g)).toLocaleString('id-ID')} m²` : `${r2(g.L)} × ${r2(g.W)} m = ${Math.round(g.L * g.W).toLocaleString('id-ID')} m²` },
    { label: 'Posisi SPR / DDR / block', nilai: `${rk.posisiSpr} / ${rk.posisiDdr} / ${rk.posisiBlock}` },
    { label: 'Okupansi', nilai: `${Math.round(rk.okupansi * 100)}%` },
  ];
  return { ...dasar, L: g.L, W: g.W, H: g.sideMm / 1000, puncak: Math.max(g.sideMm, g.centerMm) / 1000, luasLayout: luasGedung(g), trapesium: g.trapesium ?? undefined,
    zona, rak, palet, lorong, dock, fasilitas, kolom, gate, platform, tinggiDock: g.tinggiDockM ?? 1.2, tinggiPalet: tp, tinggiRak: Math.max(maxTinggi, 1), stagingIn, stagingOut,
    ringkas: ringkasan, asumsi: rk.peringatan.map(p => p.pesan) };
}
