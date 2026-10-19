// Profil order inbound & outbound — mengikuti volume di tabel Volume:
// volume/bln (palet eq.) ÷ hari operasional = palet/hari → dipecah per moda dengan % →
// dikonversi ke satuan moda (kontainer / palet / case / pcs) → jumlah mobil per hari (cek palet, CBM, ton).
import type { AktivitasInput, VolumeInput } from '@/lib/engine/types';

export type ModaOrder = 'cont20' | 'cont40' | 'cont40hc' | 'palet' | 'case' | 'unit';
export type BasisVolume = 'peakBulan' | 'rataRataBulan' | 'komitmenBulan';

export const MODA: { v: ModaOrder; l: string; satuan: string }[] = [
  { v: 'cont20', l: 'Kontainer 20ft', satuan: 'kontainer' },
  { v: 'cont40', l: 'Kontainer 40ft', satuan: 'kontainer' },
  { v: 'cont40hc', l: 'Kontainer 40HC', satuan: 'kontainer' },
  { v: 'palet', l: 'Land transport · palletize', satuan: 'palet' },
  { v: 'case', l: 'Land transport · case / karton (loose)', satuan: 'case' },
  { v: 'unit', l: 'Land transport · pcs / roll / liter / CBM', satuan: 'unit' },
];
/** Cara muat: palletize (dibatasi jumlah palet, CBM, berat) atau loose case/karton/pcs (dibatasi CBM & berat). */
export type MuatanOrder = 'palet' | 'case' | 'unit';
export const MUATAN: { v: MuatanOrder; l: string }[] = [
  { v: 'palet', l: 'Palletize' }, { v: 'case', l: 'Loose case / karton' }, { v: 'unit', l: 'Loose pcs / unit' }];
export const isKontainer = (m: ModaOrder) => m === 'cont20' || m === 'cont40' || m === 'cont40hc';
/** Muatan efektif baris: land transport = modanya; kontainer = pilihan muatan (default loose case). */
export const muatanBaris = (r: { moda: ModaOrder; muatan?: MuatanOrder }): MuatanOrder => isKontainer(r.moda) ? (r.muatan ?? 'case') : r.moda as MuatanOrder;
export const SATUAN_UNIT = ['pcs', 'roll', 'liter', 'cbm', 'kg', 'botol', 'pack', 'bag', 'unit'];

/** Muatan default per kontainer (ton) — asumsi umum, bisa diubah per baris. */
export const TON_KONTAINER: Record<'cont20' | 'cont40' | 'cont40hc', number> = { cont20: 18, cont40: 24, cont40hc: 26 };

export interface Kendaraan { nama: string; palet: number; cbm: number; ton: number }
/** Kapasitas kendaraan default (Indonesia, kira-kira) — bisa diubah per tender. */
export const KENDARAAN_DEFAULT: Kendaraan[] = [
  { nama: 'CDE (engkel box)', palet: 4, cbm: 9, ton: 2.5 },
  { nama: 'CDD box', palet: 6, cbm: 17, ton: 5 },
  { nama: 'CDD long box', palet: 8, cbm: 22, ton: 5 },
  { nama: 'Fuso box', palet: 10, cbm: 31, ton: 8 },
  { nama: 'Tronton wingbox', palet: 16, cbm: 55, ton: 15 },
  { nama: 'Trailer / kontainer 20ft', palet: 10, cbm: 33, ton: 21 },
  { nama: 'Trailer / kontainer 40ft', palet: 20, cbm: 67, ton: 26 },
  { nama: 'Kontainer 40HC', palet: 20, cbm: 76, ton: 26 },
];

export interface BarisProfil {
  moda: ModaOrder;
  persen: number;              // porsi volume arus (0..1)
  satuanUnit?: string;         // untuk moda 'unit'
  tonPerKontainer?: number;    // untuk kontainer (override kapasitas berat)
  muatan?: MuatanOrder;        // untuk kontainer: palletize / loose case / loose pcs
  casePerPalet?: number;       // default dari konversi Volume
  unitPerCase?: number;        // default dari konversi Volume
  kendaraan?: string;          // palet / case / unit
  /** lama (versi qty/bln) — diabaikan */
  qty?: number;
}
/** Parameter muatan (satu sumber untuk profil order & tarif storage alternatif). tonPerPalet disimpan dalam ton, ditampilkan sebagai kg. */
export interface ParamProfil { tonPerPalet: number; cbmPerPalet: number; cbmPerCase: number; kgPerCase: number; literPerPalet?: number; inputAdminPerMobil?: number }
export interface ProfilVolume {
  inbound: BarisProfil[];
  outbound: BarisProfil[];
  param: ParamProfil;
  basis?: BasisVolume;
  kendaraan?: Kendaraan[];
}
export const PARAM_DEFAULT: ParamProfil = { tonPerPalet: 0.8, cbmPerPalet: 1.5, cbmPerCase: 0.04, kgPerCase: 12, inputAdminPerMobil: 2 };

const isCase = (u: string) => ['case', 'karton', 'dus', 'carton', 'ctn', 'box'].includes(u.trim().toLowerCase());

/** Volume arus per bulan dalam palet ekuivalen + default isi case/pcs dari konversi Volume. */
export function volumePalet(v: VolumeInput | undefined, basis: BasisVolume) {
  const k = v?.konversi;
  const cppDef = k && k.per1 > 0 && isCase(k.uom1) ? k.per1 : 0;
  const upcDef = k && k.per2 > 0 ? k.per2 : 0;
  if (!v) return { paletBulan: 0, cpp: cppDef, upc: upcDef, ok: false, ket: 'arus belum ada di tabel Volume' };
  const q = Number(v[basis]) || 0;
  const u = v.uom.trim().toLowerCase();
  if (u === 'palet' || u === 'pallet') return { paletBulan: q, cpp: cppDef, upc: upcDef, ok: true, ket: '' };
  // UoM volume bukan palet: konversi ke palet butuh isi case per palet (k.per1 = isi per uom volume tidak membantu)
  return { paletBulan: 0, cpp: cppDef, upc: upcDef, ok: false, ket: `UoM volume ${v.uom} — ubah ke palet agar bisa dipecah` };
}

export interface HasilBaris {
  paletHari: number; qtyHari: number; satuan: string; ket: string;
  mobil?: { kendaraan: string; perHari: number; bulat: number; perBulan: number; pembatas: 'palet' | 'cbm' | 'ton';
    paletTrip: number; cbmTrip: number; tonTrip: number; kap: Kendaraan; cbmCukup: boolean; tonCukup: boolean; maksPaletCbm: number };
}

export function hitungProfil(rows: BarisProfil[], paletHari: number, param: ParamProfil, kendaraan: Kendaraan[],
  def: { cpp: number; upc: number }, hariBulan: number) {
  const tp = param.tonPerPalet > 0 ? param.tonPerPalet : 0;
  const hasil: HasilBaris[] = rows.map(r => {
    const pr = Math.max(0, Number(r.persen) || 0);
    const palet = paletHari * pr;
    const cpp = r.casePerPalet || def.cpp || 0;
    const upc = r.unitPerCase || def.upc || 0;
    const isKont = isKontainer(r.moda);
    const muatan = muatanBaris(r);
    // Volume per hari dalam satuan muat → CBM & berat
    let qty = palet, satuan = 'palet', ket = `${f(palet)} palet`;
    let cbm = palet * param.cbmPerPalet, ton = palet * tp;
    if (muatan === 'case' || muatan === 'unit') {
      const cs = palet * cpp;
      cbm = cs * param.cbmPerCase; ton = cs * param.kgPerCase / 1000;
      if (muatan === 'case') { qty = cs; satuan = 'case'; ket = cpp > 0 ? `${f(palet)} plt × ${f(cpp)} case/plt` : 'isi case per palet'; }
      else { qty = cs * upc; satuan = r.satuanUnit ?? 'pcs'; ket = cpp > 0 && upc > 0 ? `${f(palet)} plt × ${f(cpp)} case × ${f(upc)} ${satuan}/case` : 'isi case per palet & unit per case'; }
    }
    const kDasar = isKont
      ? kendaraan.find(x => r.moda === 'cont20' ? /20ft/i.test(x.nama) : r.moda === 'cont40hc' ? /40HC/i.test(x.nama) : /40ft/i.test(x.nama) && !/HC/i.test(x.nama))
      : kendaraan.find(x => x.nama === r.kendaraan) ?? kendaraan[0];
    const k = kDasar && isKont && r.tonPerKontainer ? { ...kDasar, ton: r.tonPerKontainer } : kDasar;
    const h: HasilBaris = { paletHari: palet, qtyHari: qty, satuan, ket };
    if (k && palet > 0) {
      const loose = muatan !== 'palet';
      const nPalet = loose ? 0 : (k.palet > 0 ? palet / k.palet : 0);
      const nCbm = k.cbm > 0 ? cbm / k.cbm : 0;
      const nTon = k.ton > 0 ? ton / k.ton : 0;
      const top = [{ p: 'palet' as const, n: nPalet }, { p: 'cbm' as const, n: nCbm }, { p: 'ton' as const, n: nTon }].sort((a, b) => b.n - a.n)[0];
      const perHari = top.n;
      const bulat = Math.ceil(perHari - 1e-9);
      const trip = bulat || 1;
      h.mobil = { kendaraan: k.nama, perHari, bulat, perBulan: perHari * hariBulan, pembatas: top.p,
        paletTrip: loose ? 0 : palet / trip, cbmTrip: cbm / trip, tonTrip: ton / trip, kap: k,
        cbmCukup: cbm / trip <= k.cbm + 1e-9, tonCukup: ton / trip <= k.ton + 1e-9,
        maksPaletCbm: param.cbmPerPalet > 0 ? Math.floor(k.cbm / param.cbmPerPalet) : 0 };
      if (isKont) h.ket = `${ket} → ${f(cbm)} CBM · ${f(ton * 1000)} kg (kap. ${k.cbm} CBM · ${f(k.ton * 1000)} kg${loose ? '' : ` · ${k.palet} plt`})`;
    }
    return h;
  });
  const totalPersen = rows.reduce((s, r) => s + (Number(r.persen) || 0), 0);
  return {
    hasil, totalPersen,
    totalPaletHari: hasil.reduce((s, h) => s + h.paletHari, 0),
    totalMobilHari: hasil.reduce((s, h) => s + (h.mobil?.perHari ?? 0), 0),
    totalMobilBulat: hasil.reduce((s, h) => s + (h.mobil?.bulat ?? 0), 0),
  };
}

/** Order admin per arus: mobil/hari (dibulatkan per moda) × input admin per mobil
 *  (inbound: barang masuk + put away; outbound: picking + barang keluar) → per bulan × hari operasional. */
export function orderAdmin(profil: ProfilVolume | undefined, volumes: VolumeInput[], hariBulan: number) {
  const kosong = { mobilHari: 0, orderHari: 0, orderBulan: 0 };
  if (!profil) return { inbound: kosong, outbound: kosong, perMobil: 2 };
  const param = { ...PARAM_DEFAULT, ...(profil.param ?? {}) };
  const perMobil = param.inputAdminPerMobil ?? 2;
  const kendaraan = profil.kendaraan?.length ? profil.kendaraan : KENDARAAN_DEFAULT;
  const satu = (arus: 'inbound' | 'outbound') => {
    const rows = profil[arus] ?? [];
    if (!rows.length) return kosong;
    const vp = volumePalet(volumes.find(v => v.arus === arus), profil.basis ?? 'peakBulan');
    const h = hitungProfil(rows, hariBulan > 0 ? vp.paletBulan / hariBulan : 0, param, kendaraan, { cpp: vp.cpp, upc: vp.upc }, hariBulan);
    const mobilHari = h.totalMobilBulat, orderHari = mobilHari * perMobil;
    return { mobilHari, orderHari, orderBulan: orderHari * hariBulan };
  };
  return { inbound: satu('inbound'), outbound: satu('outbound'), perMobil };
}

/** Aktivitas admin (role mengandung "admin", UoM order/line/dokumen, arus inbound/outbound, volume/bln kosong)
 *  mendapat volume dari order admin profil — dibagi rata bila ada beberapa aktivitas admin di arus yang sama. */
export const isAktivitasAdmin = (a: Pick<AktivitasInput, 'roleName' | 'uom' | 'arus'>) =>
  /admin/i.test(a.roleName) && /^(order|line|dokumen|doc|do|transaksi)$/i.test(a.uom.trim()) && (a.arus === 'inbound' || a.arus === 'outbound');

export function aktivitasDenganOrderAdmin<T extends AktivitasInput>(aktivitas: T[], volumes: VolumeInput[], profil: ProfilVolume | undefined, hariBulan: number): (T & { volumeDariProfil?: boolean })[] {
  const oa = orderAdmin(profil, volumes, hariBulan);
  const target = (a: T) => isAktivitasAdmin(a) && (a.volumeManual == null || !Number.isFinite(a.volumeManual));
  const n = { inbound: 0, outbound: 0 } as Record<'inbound' | 'outbound', number>;
  for (const a of aktivitas) if (target(a)) n[a.arus as 'inbound' | 'outbound']++;
  return aktivitas.map(a => {
    if (!target(a)) return a;
    const arus = a.arus as 'inbound' | 'outbound';
    const total = oa[arus].orderBulan;
    if (!total) return a;
    return { ...a, volumeManual: total / n[arus], volumeDariProfil: true };
  });
}

const f = (x: number) => (Math.round(x * 100) / 100).toLocaleString('id-ID');

/** Stok rata-rata dalam kg/ton, CBM, liter = stok palet (baris Storage, rata-rata) × parameter muatan per palet. */
export function stokDariPalet(volumes: VolumeInput[], profil: ProfilVolume | undefined) {
  const param = { ...PARAM_DEFAULT, ...(profil?.param ?? {}) };
  const st = volumes.find(v => v.arus === 'storage');
  const palet = st && /^pal(l)?et$/i.test(st.uom.trim()) ? Number(st.rataRataBulan) || 0 : 0;
  return { palet, ton: palet * param.tonPerPalet, kg: palet * param.tonPerPalet * 1000, cbm: palet * param.cbmPerPalet, liter: palet * (param.literPerPalet ?? 0), param };
}
