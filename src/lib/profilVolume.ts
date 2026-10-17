// Profil order inbound & outbound: setiap moda (kontainer, palletize, case, pcs/roll/liter/cbm)
// dikonversi ke palet ekuivalen. Untuk outbound juga dihitung jumlah trip kendaraan + cek palet/CBM/ton.

export type ModaOrder = 'cont20' | 'cont40' | 'cont40hc' | 'palet' | 'case' | 'unit';

export const MODA: { v: ModaOrder; l: string; satuan: string }[] = [
  { v: 'cont20', l: 'Kontainer 20ft', satuan: 'kontainer' },
  { v: 'cont40', l: 'Kontainer 40ft', satuan: 'kontainer' },
  { v: 'cont40hc', l: 'Kontainer 40HC', satuan: 'kontainer' },
  { v: 'palet', l: 'Palletize', satuan: 'palet' },
  { v: 'case', l: 'Case / karton (loose)', satuan: 'case' },
  { v: 'unit', l: 'Pcs / roll / liter / CBM', satuan: 'unit' },
];
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
  qty: number;                 // jumlah per bulan dalam satuan moda (kontainer / palet / case / unit)
  satuanUnit?: string;         // untuk moda 'unit'
  tonPerKontainer?: number;    // untuk kontainer
  casePerPalet?: number;       // case & unit (default dari konversi Volume)
  unitPerCase?: number;        // unit (default dari konversi Volume)
  kendaraan?: string;          // outbound palet/case
}
export interface ParamProfil { tonPerPalet: number; cbmPerPalet: number; cbmPerCase: number; kgPerCase: number }
export interface ProfilVolume {
  inbound: BarisProfil[];
  outbound: BarisProfil[];
  param: ParamProfil;
  kendaraan?: Kendaraan[];
}
export const PARAM_DEFAULT: ParamProfil = { tonPerPalet: 0.8, cbmPerPalet: 1.5, cbmPerCase: 0.04, kgPerCase: 12 };

export interface HasilBaris {
  palet: number; persen: number; ket: string;
  trip?: { kendaraan: string; trip: number; tripHari: number; pembatas: 'palet' | 'cbm' | 'ton'; muatPalet: number;
    cbmMuat: number; cbmKap: number; tonMuat: number; tonKap: number; cbmCukup: boolean; tonCukup: boolean };
}

export function hitungProfil(rows: BarisProfil[], param: ParamProfil, outbound: boolean, kendaraan: Kendaraan[],
  def: { casePerPalet: number; unitPerCase: number }, hariBulan: number) {
  const tp = param.tonPerPalet > 0 ? param.tonPerPalet : 0;
  const hasil: HasilBaris[] = rows.map(r => {
    const q = Math.max(0, Number(r.qty) || 0);
    const cpp = r.casePerPalet || def.casePerPalet || 0;
    const upc = r.unitPerCase || def.unitPerCase || 0;
    let palet = 0, ket = '';
    let cbmTotal = 0, tonTotal = 0;
    if (r.moda === 'cont20' || r.moda === 'cont40' || r.moda === 'cont40hc') {
      const t = (r.tonPerKontainer ?? TON_KONTAINER[r.moda]) * q;
      palet = tp > 0 ? t / tp : 0; tonTotal = t;
      ket = `${fmt(q)} kont × ${fmt(r.tonPerKontainer ?? TON_KONTAINER[r.moda])} t = ${fmt(t)} t ÷ ${fmt(tp)} t/palet`;
    } else if (r.moda === 'palet') {
      palet = q; cbmTotal = q * param.cbmPerPalet; tonTotal = q * param.tonPerPalet; ket = `${fmt(q)} palet`;
    } else if (r.moda === 'case') {
      palet = cpp > 0 ? q / cpp : 0; cbmTotal = q * param.cbmPerCase; tonTotal = q * param.kgPerCase / 1000;
      ket = cpp > 0 ? `${fmt(q)} case ÷ ${fmt(cpp)} case/palet` : 'isi case per palet';
    } else {
      const cs = upc > 0 ? q / upc : 0;
      palet = cpp > 0 ? cs / cpp : 0; cbmTotal = cs * param.cbmPerCase; tonTotal = cs * param.kgPerCase / 1000;
      ket = upc > 0 && cpp > 0 ? `${fmt(q)} ${r.satuanUnit ?? 'unit'} ÷ ${fmt(upc)}/case ÷ ${fmt(cpp)} case/palet` : 'isi unit per case & case per palet';
    }
    const h: HasilBaris = { palet, persen: 0, ket };
    // Outbound: kontainer export = trip per kontainer; palet/case/unit = pilih kendaraan
    if (outbound) {
      const isKont = r.moda.startsWith('cont');
      const k = isKont
        ? kendaraan.find(x => r.moda === 'cont20' ? /20ft/i.test(x.nama) : r.moda === 'cont40hc' ? /40HC/i.test(x.nama) : /40ft/i.test(x.nama))
        : kendaraan.find(x => x.nama === r.kendaraan) ?? kendaraan[0];
      if (k) {
        const loose = r.moda === 'case' || r.moda === 'unit';
        if (isKont) { cbmTotal = palet * param.cbmPerPalet; }
        const nPalet = isKont ? q : loose ? 0 : (k.palet > 0 ? palet / k.palet : 0);
        const nCbm = k.cbm > 0 ? cbmTotal / k.cbm : 0;
        const nTon = k.ton > 0 ? tonTotal / k.ton : 0;
        const kandidat = [{ p: 'palet' as const, n: nPalet }, { p: 'cbm' as const, n: nCbm }, { p: 'ton' as const, n: nTon }].sort((a, b) => b.n - a.n)[0];
        const trip = isKont ? Math.ceil(q - 1e-9) : Math.ceil(kandidat.n - 1e-9);
        const muatPalet = loose ? 0 : Math.min(k.palet, palet);
        // Per trip penuh: CBM & ton muatan bila diisi kapasitas palet penuh (palletize) atau dibagi rata (loose)
        const cbmMuat = loose ? (trip ? cbmTotal / trip : 0) : muatPalet * param.cbmPerPalet;
        const tonMuat = loose ? (trip ? tonTotal / trip : 0) : muatPalet * param.tonPerPalet;
        h.trip = { kendaraan: k.nama, trip, tripHari: hariBulan > 0 ? trip / hariBulan : 0, pembatas: isKont ? 'palet' : kandidat.p,
          muatPalet, cbmMuat, cbmKap: k.cbm, tonMuat, tonKap: k.ton, cbmCukup: cbmMuat <= k.cbm + 1e-9, tonCukup: tonMuat <= k.ton + 1e-9 };
      }
    }
    return h;
  });
  const total = hasil.reduce((s, h) => s + h.palet, 0);
  for (const h of hasil) h.persen = total > 0 ? h.palet / total : 0;
  return { hasil, totalPalet: total, totalTrip: hasil.reduce((s, h) => s + (h.trip?.trip ?? 0), 0) };
}

const fmt = (x: number) => (Math.round(x * 100) / 100).toLocaleString('id-ID');
