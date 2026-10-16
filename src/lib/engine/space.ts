// Kebutuhan space format Excel Esa:
// A. kapasitas (PP) dibagi Selective (SD) / Double Deep (DD) → B/C. footprint per bay ÷ kapasitas per bay = m² per PP
// D. staging inbound/outbound: per bulan → per minggu → per hari → per shift → per sequence × m²/palet
// E. fasilitas → total → dibulatkan ke atas = space rent. Racking level dari tinggi sisi gudang.

export interface RakDim { koridor: number; depth: number; width: number; paletPerLevel: number; deep?: number }
export interface StagingIn { porsiMinggu: number; hariPerMinggu: number; sequence: number; m2PerPalet: number; tumpuk: number; unitPerPalet: number; volumePerShiftManual?: number | null }
export interface Porsi { spr: number; ddr: number; block: number; floor: number }   // porsi PP per metode simpan (total = 100%)
export interface LantaiDim { tumpuk: number; gangPersen: number }                  // block stack / pallet floor
export interface SpaceExcel {
  porsiSd: number;                        // (lama) porsi selective; dipakai bila `porsi` belum ada
  porsi?: Porsi;
  sd: RakDim; dd: RakDim;                 // sd = SPR (selective pallet rack), dd = DDR (double deep rack)
  palet: { panjang: number; lebar: number };   // dimensi palet untuk block stack / pallet floor (m)
  block: LantaiDim; floor: LantaiDim;
  rak: { centerMm: number; sideMm: number; beamMm: number; palletMm: number; productMm: number; clearanceMm: number; levelManual?: number | null };
  inbound: StagingIn; outbound: StagingIn;
  fasilitas: { nama: string; m2: number }[];
  pembulatan: number;                     // dibulatkan ke atas kelipatan (m²)
  cad: { nama: string; m2: number }[];    // pembanding layout CAD
  gangwayM?: number; lebarGudangM?: number;
}

export const SPACE_EXCEL_DEFAULT: SpaceExcel = {
  porsiSd: 0.2,
  porsi: { spr: 0.2, ddr: 0.8, block: 0, floor: 0 },
  palet: { panjang: 1.2, lebar: 1.0 },
  block: { tumpuk: 2, gangPersen: 0.3 },
  floor: { tumpuk: 1, gangPersen: 0.3 },
  sd: { koridor: 1.7, depth: 1.15, width: 2.7, paletPerLevel: 2 },
  dd: { koridor: 1.85, depth: 2.4, width: 2.7, paletPerLevel: 2, deep: 2 },
  rak: { centerMm: 13000, sideMm: 10000, beamMm: 100, palletMm: 150, productMm: 1250, clearanceMm: 100, levelManual: null },
  inbound: { porsiMinggu: 0.25, hariPerMinggu: 7, sequence: 2, m2PerPalet: 1.4, tumpuk: 1, unitPerPalet: 1, volumePerShiftManual: null },
  outbound: { porsiMinggu: 0.45, hariPerMinggu: 6, sequence: 2, m2PerPalet: 1.4, tumpuk: 1, unitPerPalet: 1, volumePerShiftManual: null },
  fasilitas: [
    { nama: 'Facilities (charging, toilet)', m2: 20 }, { nama: 'Control Tower', m2: 0 }, { nama: 'Office + Meeting room', m2: 32 },
    { nama: 'Equipment Storage', m2: 20 }, { nama: 'Locker', m2: 3 }, { nama: 'Prayer room', m2: 0 }, { nama: 'Canteen', m2: 0 }, { nama: 'Pantry', m2: 0 },
  ],
  pembulatan: 100,
  cad: [],
  gangwayM: 18, lebarGudangM: 23,
};

export const lengkapiSpaceExcel = (x?: Partial<SpaceExcel> | null): SpaceExcel => ({
  ...SPACE_EXCEL_DEFAULT, ...(x ?? {}),
  // data lama hanya punya porsiSd → SPR = porsiSd, DDR = sisanya
  porsi: x?.porsi ? { ...{ spr: 0, ddr: 0, block: 0, floor: 0 }, ...x.porsi }
    : x?.porsiSd != null ? { spr: x.porsiSd, ddr: 1 - x.porsiSd, block: 0, floor: 0 } : { ...SPACE_EXCEL_DEFAULT.porsi! },
  palet: { ...SPACE_EXCEL_DEFAULT.palet, ...(x?.palet ?? {}) },
  block: { ...SPACE_EXCEL_DEFAULT.block, ...(x?.block ?? {}) }, floor: { ...SPACE_EXCEL_DEFAULT.floor, ...(x?.floor ?? {}), tumpuk: 1 },
  sd: { ...SPACE_EXCEL_DEFAULT.sd, ...(x?.sd ?? {}) }, dd: { ...SPACE_EXCEL_DEFAULT.dd, ...(x?.dd ?? {}) },
  rak: { ...SPACE_EXCEL_DEFAULT.rak, ...(x?.rak ?? {}) },
  inbound: { ...SPACE_EXCEL_DEFAULT.inbound, ...(x?.inbound ?? {}) }, outbound: { ...SPACE_EXCEL_DEFAULT.outbound, ...(x?.outbound ?? {}) },
  fasilitas: x?.fasilitas ?? SPACE_EXCEL_DEFAULT.fasilitas, cad: x?.cad ?? [],
});

export function hitungLevelRak(r: SpaceExcel['rak']) {
  const level1 = r.palletMm + r.productMm + r.clearanceMm;              // level lantai tanpa beam
  const levelN = r.beamMm + r.palletMm + r.productMm + r.clearanceMm;   // level 2 ke atas
  const auto = r.sideMm >= level1 && levelN > 0 ? 1 + Math.floor((r.sideMm - level1) / levelN + 1e-9) : 0;
  const level = r.levelManual && r.levelManual > 0 ? r.levelManual : auto;
  const tinggi = level > 0 ? level1 + (level - 1) * levelN : 0;
  return { level1, levelN, auto, level, tinggi, ok: tinggi <= r.sideMm };
}

function rak(ppReq: number, d: RakDim, level: number) {
  const rakBay = d.depth * d.width, koridorBay = d.koridor * d.width, totalBay = rakBay + koridorBay;
  const kapBay = d.paletPerLevel * (d.deep ?? 1) * level;
  const m2PerPP = kapBay > 0 ? totalBay / kapBay : 0;
  return { ...d, rakBay, koridorBay, totalBay, level, kapBay, m2PerPP, ppReq, bay: kapBay > 0 ? Math.ceil(ppReq / kapBay - 1e-9) : 0, footprint: ppReq * m2PerPP };
}

/** Block stack / pallet floor: m² per PP = luas palet ÷ tumpuk × (1 + gang%). */
function lantai(ppReq: number, p: SpaceExcel['palet'], d: LantaiDim) {
  const luasPalet = p.panjang * p.lebar, tumpuk = Math.max(1, d.tumpuk || 1);
  const m2PerPP = (luasPalet / tumpuk) * (1 + Math.max(0, d.gangPersen));
  return { ...d, tumpuk, luasPalet, m2PerPP, ppReq, tapak: Math.ceil(ppReq / tumpuk - 1e-9), footprint: ppReq * m2PerPP };
}

function staging(volBulan: number, s: StagingIn, shift: number) {
  const palet = volBulan / Math.max(1e-9, s.unitPerPalet || 1);
  const mingguan = palet * s.porsiMinggu;
  const harian = s.hariPerMinggu > 0 ? mingguan / s.hariPerMinggu : 0;
  const perShiftHitung = harian / Math.max(1, shift);
  const perShift = s.volumePerShiftManual != null && Number.isFinite(s.volumePerShiftManual) ? Number(s.volumePerShiftManual) : perShiftHitung;
  const perSequence = perShift / Math.max(1, s.sequence);
  return { ...s, palet, mingguan, harian, shift, perShiftHitung, perShift, perSequence, footprint: (perSequence / Math.max(1, s.tumpuk)) * s.m2PerPalet };
}

export function hitungSpaceExcel(x: SpaceExcel, ppTotal: number, inboundBulan: number, outboundBulan: number, jumlahShift: number, allowancePersen = 0) {
  const lv = hitungLevelRak(x.rak);
  const pr = x.porsi ?? { spr: x.porsiSd, ddr: 1 - x.porsiSd, block: 0, floor: 0 };
  const c = (v: number) => Math.max(0, Number(v) || 0);
  const totalPorsi = c(pr.spr) + c(pr.ddr) + c(pr.block) + c(pr.floor);
  const sd = rak(ppTotal * c(pr.spr), x.sd, lv.level);
  const dd = rak(ppTotal * c(pr.ddr), { ...x.dd, deep: x.dd.deep ?? 2 }, lv.level);
  const block = lantai(ppTotal * c(pr.block), x.palet, x.block);
  const floor = lantai(ppTotal * c(pr.floor), x.palet, { ...x.floor, tumpuk: 1 });
  const inbound = staging(inboundBulan, x.inbound, jumlahShift);
  const outbound = staging(outboundBulan, x.outbound, jumlahShift);
  const fasilitasM2 = x.fasilitas.reduce((s, f) => s + Number(f.m2 || 0), 0);
  const subtotal = sd.footprint + dd.footprint + block.footprint + floor.footprint + inbound.footprint + outbound.footprint + fasilitasM2;
  const denganAllowance = subtotal * (1 + allowancePersen);
  const kelipatan = x.pembulatan > 0 ? x.pembulatan : 1;
  const spaceRent = Math.ceil(denganAllowance / kelipatan - 1e-9) * kelipatan;
  const cadTotal = x.cad.reduce((s, c) => s + Number(c.m2 || 0), 0);
  return { level: lv, ppTotal, porsi: pr, totalPorsi, porsiOk: Math.abs(totalPorsi - 1) < 0.0005, posisiRak: Math.ceil(sd.ppReq + dd.ppReq - 1e-9), sd, dd, block, floor, inbound, outbound, fasilitasM2, subtotal, allowanceM2: denganAllowance - subtotal, spaceRent, cadTotal };
}
export type HasilSpaceExcel = ReturnType<typeof hitungSpaceExcel>;
