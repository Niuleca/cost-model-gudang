// Rincian biaya manpower — format sheet Esa:
// Gaji pokok · Hari kerja · Actual hari kerja · Lisensi + Insentif → Sub Total
// + BPJS TK (4,24%) + BPJS KS (4%) + BPJS Pensiun (2%) + THR (1/12) + Kompensasi (1/12) + Supervisi & Operasional → Total
// × Manpower = TOTAL; Σ = Sub Total Biaya-1; + Management Fee (%) = Sub Total Biaya-2.
import type { JobLevel, MasterData } from './types';

export interface ParamBiayaMp {
  bpjsTk: number;        // 0.0424
  bpjsKs: number;        // 0.04
  bpjsPensiun: number;   // 0.02
  thr: number;           // 1/12
  kompensasi: number;    // 1/12
  feePersen: number;     // management fee 0.11
}
export const PARAM_BIAYA_MP_DEFAULT: ParamBiayaMp = { bpjsTk: 0.0424, bpjsKs: 0.04, bpjsPensiun: 0.02, thr: 1 / 12, kompensasi: 1 / 12, feePersen: 0.11 };

/** Isian per role (kosong = default). */
export interface InputBiayaRole {
  area?: string;
  gajiPokok?: number;
  hariKerja?: number;
  hariAktual?: number;
  lisensi?: number;        // lisensi + insentif
  supervisi?: number;      // supervisi & operasional
}

export function rincianBiayaRole(role: string, qty: number, m: MasterData | null, input: InputBiayaRole | undefined,
  param: ParamBiayaMp, hariDefault: number, areaDefault: string) {
  const j: JobLevel | undefined = m?.jobLevels.find(x => x.roleName === role);
  const gajiDefault = m ? Math.round(m.upahMinimum * (j?.faktorUmk ?? 1)) : 0;
  const gajiPokok = input?.gajiPokok && input.gajiPokok > 0 ? input.gajiPokok : gajiDefault;
  const hariKerja = input?.hariKerja && input.hariKerja > 0 ? input.hariKerja : hariDefault;
  const hariAktual = input?.hariAktual != null && input.hariAktual >= 0 ? input.hariAktual : hariKerja;
  const lisensi = input?.lisensi != null ? input.lisensi : (j?.tunjanganBulan ?? 0);
  const supervisi = input?.supervisi ?? 0;
  const gajiDibayar = hariKerja > 0 ? gajiPokok * Math.min(1, hariAktual / hariKerja) : gajiPokok;
  const subTotal = gajiDibayar + lisensi;
  const bpjsTk = gajiPokok * param.bpjsTk;
  const bpjsKs = gajiPokok * param.bpjsKs;
  const bpjsPensiun = gajiPokok * param.bpjsPensiun;
  const thr = gajiPokok * param.thr;
  const kompensasi = gajiPokok * param.kompensasi;
  const total = subTotal + bpjsTk + bpjsKs + bpjsPensiun + thr + kompensasi + supervisi;
  return {
    role, area: input?.area || areaDefault, gajiPokok, gajiDefault, hariKerja, hariAktual, lisensi, supervisi,
    subTotal, bpjsTk, bpjsKs, bpjsPensiun, thr, kompensasi, total, qty, totalQty: total * qty,
    manual: !!(input && Object.values(input).some(v => v != null && v !== '')),
  };
}
export type RincianBiayaRole = ReturnType<typeof rincianBiayaRole>;

export function ringkasBiayaMp(rows: RincianBiayaRole[], param: ParamBiayaMp) {
  const sub1 = rows.reduce((s, r) => s + r.totalQty, 0);
  const fee = sub1 * param.feePersen;
  return { sub1, fee, sub2: sub1 + fee, faktorFee: 1 + param.feePersen };
}
