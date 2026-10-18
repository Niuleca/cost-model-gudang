// Rincian biaya manpower — format sheet Esa:
// Gaji pokok · Hari kerja · Actual hari kerja · Lisensi + Insentif → Sub Total
// + BPJS TK (5,27%) + BPJS KS (4%, maks. upah Rp12 jt) + BPJS Pensiun (2%, maks. batas upah JP) + THR (1/12) + Kompensasi (1/12) + Supervisi & Operasional → Total
// × Manpower = TOTAL; Σ = Sub Total Biaya-1; + Management Fee (%) = Sub Total Biaya-2.
import type { JobLevel, MasterData } from './types';

export interface ParamBiayaMp {
  bpjsTk: number;        // 0.0527 (JHT 3,7 + JKK 1,27 + JKM 0,3)
  bpjsKs: number;        // 0.04
  bpjsPensiun: number;   // 0.02
  thr: number;           // 1/12
  kompensasi: number;    // 1/12
  feePersen: number;     // management fee 0.11
  batasUpahPensiun?: number; // batas upah iuran JP (Rp)
  batasUpahKs?: number;      // batas upah iuran BPJS Kesehatan (Rp)
}
/** Default sesuai aturan pemerintah untuk gudang:
 *  BPJS TK pemberi kerja = JHT 3,7% (PP 46/2015) + JKK 1,27% (PP 44/2015 Lampiran I: penimbunan barang/veem = Kelompok IV risiko tinggi)
 *  + JKM 0,3% = 5,27%  (0,14% JKK direkomposisi ke JKP — PP 6/2025 — tanpa tambahan iuran);
 *  BPJS Kesehatan 4% s.d. upah Rp12 jt (Perpres 64/2020); Jaminan Pensiun 2% s.d. batas upah JP (PP 45/2015; Rp10.547.400);
 *  THR 1/12 (Permenaker 6/2016); kompensasi PKWT 1/12 (PP 35/2021 Pasal 15–16). */
export const PARAM_BIAYA_MP_DEFAULT: ParamBiayaMp = {
  bpjsTk: 0.0527, bpjsKs: 0.04, bpjsPensiun: 0.02, thr: 1 / 12, kompensasi: 1 / 12, feePersen: 0.11,
  batasUpahPensiun: 10547400, batasUpahKs: 12000000,
};

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
  param: ParamBiayaMp, hariDefault: number, areaDefault: string,
  level?: { levelGaji?: Partial<Record<LevelJabatan, number>>; levelRole?: Record<string, LevelJabatan> }) {
  const j: JobLevel | undefined = m?.jobLevels.find(x => x.roleName === role);
  const lv = faktorGajiRole(role, level?.levelGaji, level?.levelRole);
  // Gaji pokok default = UMK area project (Key assumption) × % level jabatan
  const gajiDefault = m ? Math.round(m.upahMinimum * lv.faktor) : 0;
  const gajiPokok = input?.gajiPokok && input.gajiPokok > 0 ? input.gajiPokok : gajiDefault;
  const hariKerja = input?.hariKerja && input.hariKerja > 0 ? input.hariKerja : hariDefault;
  const hariAktual = input?.hariAktual != null && input.hariAktual >= 0 ? input.hariAktual : hariKerja;
  const lisensi = input?.lisensi != null ? input.lisensi : (j?.tunjanganBulan ?? 0);
  const supervisi = input?.supervisi ?? 0;
  const gajiDibayar = hariKerja > 0 ? gajiPokok * Math.min(1, hariAktual / hariKerja) : gajiPokok;
  const subTotal = gajiDibayar + lisensi;
  const bpjsTk = gajiPokok * param.bpjsTk;
  const bpjsKs = Math.min(gajiPokok, param.batasUpahKs || Infinity) * param.bpjsKs;
  const bpjsPensiun = Math.min(gajiPokok, param.batasUpahPensiun || Infinity) * param.bpjsPensiun;
  const thr = gajiPokok * param.thr;
  const kompensasi = gajiPokok * param.kompensasi;
  const total = subTotal + bpjsTk + bpjsKs + bpjsPensiun + thr + kompensasi + supervisi;
  return {
    role, level: lv.level, faktorLevel: lv.faktor, umk: m?.upahMinimum ?? 0, area: input?.area || areaDefault, gajiPokok, gajiDefault, hariKerja, hariAktual, lisensi, supervisi,
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

// ---- Level jabatan → gaji pokok = UMK area project × % level ----
export type LevelJabatan = 'operasional' | 'admin' | 'supervisor' | 'manager';
export const LEVEL_JABATAN: { v: LevelJabatan; l: string; contoh: string }[] = [
  { v: 'operasional', l: 'Operasional (di bawah admin)', contoh: 'Checker, Picker, Packer, Operator RT/Forklift, Helper, TKBM, Security' },
  { v: 'admin', l: 'Admin / Staff', contoh: 'Admin Inbound/Outbound, Inventory Controller, Stock Controller, QHSE' },
  { v: 'supervisor', l: 'Supervisor / Leader', contoh: 'Operational SPV, Team Leader, Koordinator' },
  { v: 'manager', l: 'Manager / Kepala Gudang', contoh: 'Warehouse Manager, Ka Gudang' },
];
/** % dari UMK — default, bisa diubah per tender. */
export const LEVEL_GAJI_DEFAULT: Record<LevelJabatan, number> = { operasional: 1, admin: 1.1, supervisor: 1.5, manager: 2.5 };

export function levelDefault(role: string): LevelJabatan {
  const r = role.toLowerCase();
  if (/manager|manajer|kepala|ka\.? ?gudang|head|wh ?m\b/.test(r)) return 'manager';
  if (/spv|supervisor|leader|koordinator|coordinator|foreman|mandor/.test(r)) return 'supervisor';
  if (/admin|staff|controller|inventory|qhse|k3|hse|clerk/.test(r)) return 'admin';
  return 'operasional';
}
export function faktorGajiRole(role: string, levelGaji?: Partial<Record<LevelJabatan, number>>, levelRole?: Record<string, LevelJabatan>) {
  const lv = levelRole?.[role] ?? levelDefault(role);
  const f = { ...LEVEL_GAJI_DEFAULT, ...(levelGaji ?? {}) }[lv];
  return { level: lv, faktor: f };
}
