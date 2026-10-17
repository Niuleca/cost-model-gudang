// Process Design & Resource Calculation (mengikuti Excel Esa):
// Volume/bln × % = workload → ÷ (produktivitas × faktor) = RfR (MH) → ÷ efisiensi = man hour
// → ÷ jam tersedia per bulan (kalender Man Power / MHE) = FTE per resource → ROUNDUP = resources.
import type { AktivitasInput, Arus, VolumeInput } from './types';

export interface KalenderResource {
  totalHari: number;       // 365
  minggu: number;          // hari Minggu libur per tahun
  cuti: number;            // cuti tahunan
  libur: number;           // libur nasional
  sakit: number;           // sakit (MP) / repair & maintenance (MHE)
  sabtuPerTahun: number;   // hari Sabtu kerja dengan jam lebih pendek (0 = diperlakukan sebagai hari biasa)
  jamSabtu: number;
  jamWeekday: number;
}
export interface ProcessDesignInput {
  mp: KalenderResource;
  mhe: KalenderResource;
  operatingAlat: number;   // alat dipakai bergantian oleh N shift/grup
  bebanShift: number[];    // porsi workload shift 1..3
  hariKerjaBulan?: number;     // working days (operasional gudang) per bulan — informasi tabel workload shift
  hariKerjaKaryawan?: number;  // working days employee per bulan
  group?: number;              // jumlah grup/regu kerja
}
export const PD_DEFAULT: ProcessDesignInput = {
  mp: { totalHari: 365, minggu: 52, cuti: 12, libur: 18, sakit: 0, sabtuPerTahun: 52, jamSabtu: 5, jamWeekday: 7 },
  mhe: { totalHari: 365, minggu: 0, cuti: 0, libur: 0, sakit: 14, sabtuPerTahun: 0, jamSabtu: 0, jamWeekday: 7 },
  operatingAlat: 2,
  bebanShift: [1, 0, 0],
  hariKerjaBulan: 25, hariKerjaKaryawan: 25, group: 1,
};

export function hitungKalenderResource(k: KalenderResource) {
  const off = k.minggu + k.cuti + k.libur + k.sakit;
  const hariTahun = k.totalHari - off;
  const hariBulan = hariTahun / 12;
  const sabtuBulan = Math.min(hariBulan, k.sabtuPerTahun / 12);
  const weekdayBulan = hariBulan - sabtuBulan;
  const jamSabtu = sabtuBulan * k.jamSabtu, jamWeekday = weekdayBulan * k.jamWeekday;
  return { off, hariTahun, hariBulan, sabtuBulan, weekdayBulan, jamSabtu, jamWeekday, jamBulan: jamSabtu + jamWeekday };
}

export interface BarisPD {
  no: number; tahap: string; aktivitas: string; arus: Arus;
  resource: string; jenis: 'Equipment' | 'Man Power';
  volume: number; uom: string; persen: number; workload: number;
  prodDasar: number; prod: number; rfr: number; efisiensi: number; manHour: number;
  jamTersedia: number; operating: number; fte: number;
}

export function bebanAktif(beban: number[], jumlahShift: number) {
  const b = Array.from({ length: Math.max(1, jumlahShift) }, (_, i) => Math.max(0, Number(beban[i] ?? 0)));
  const tot = b.reduce((s, x) => s + x, 0);
  return tot > 0 ? b.map(x => x / tot) : b.map(() => 1 / b.length);
}

/** Indirect (supervisor dari span of control) & peran tetap, beserta alat pendukungnya. */
export interface IndirectInput {
  spanOfControl: number; roleSupervisor: string; alatSupervisor?: string[];
  peranTetap: { roleName: string; qty: number; alat?: string[] }[];
}

export function hitungProcessDesign(aktivitas: AktivitasInput[], volumes: VolumeInput[], pd: ProcessDesignInput,
  faktorProduktivitas: number, efisiensi: number, jumlahShift: number, indirect?: IndirectInput) {
  const kalMp = hitungKalenderResource(pd.mp), kalMhe = hitungKalenderResource(pd.mhe);
  const beban = bebanAktif(pd.bebanShift, jumlahShift);
  const baris: BarisPD[] = [];
  aktivitas.forEach((a, i) => {
    const v = volumes.find(x => x.arus === a.arus);
    const volume = a.volumeManual != null && Number.isFinite(a.volumeManual) ? Number(a.volumeManual) : (v?.peakBulan ?? 0) * (a.pengaliUom || 1);
    const workload = volume * a.persenVolume;
    const prod = a.prodPerJam * faktorProduktivitas;
    const rfr = prod > 0 ? workload / prod : 0;
    const manHour = efisiensi > 0 ? rfr / efisiensi : 0;
    const res: { nama: string; jenis: BarisPD['jenis'] }[] = [
      ...(a.tool && a.tool !== 'Manual' ? [{ nama: a.tool, jenis: 'Equipment' as const }] : []),
      ...(a.alatTambahan ?? []).filter(Boolean).map(n => ({ nama: n, jenis: 'Equipment' as const })),
      { nama: a.roleName, jenis: 'Man Power' as const },
    ];
    for (const r of res) {
      const alat = r.jenis === 'Equipment';
      const jamTersedia = alat ? kalMhe.jamBulan : kalMp.jamBulan;
      const operating = alat ? Math.max(1, pd.operatingAlat) : 1;
      baris.push({ no: i + 1, tahap: a.tahap, aktivitas: a.aktivitas, arus: a.arus, resource: r.nama, jenis: r.jenis,
        volume, uom: a.uom, persen: a.persenVolume, workload, prodDasar: a.prodPerJam, prod, rfr, efisiensi, manHour,
        jamTersedia, operating, fte: jamTersedia > 0 ? manHour / (jamTersedia * operating) : 0 });
    }
  });
  const ringkas = (jenis: BarisPD['jenis']) => {
    const m = new Map<string, { nama: string; fte: number; manHour: number; jamPerArus: Record<Arus, number> }>();
    for (const b of baris.filter(x => x.jenis === jenis)) {
      const x = m.get(b.resource) ?? { nama: b.resource, fte: 0, manHour: 0, jamPerArus: { inbound: 0, outbound: 0, storage: 0, vas: 0 } };
      x.fte += b.fte; x.manHour += b.manHour; x.jamPerArus[b.arus] += b.manHour; m.set(b.resource, x);
    }
    return Array.from(m.values()).map(x => ({
      ...x, unitIndirect: 0, merangkap: [] as string[], dirangkap: false,
      // alat: dipakai bergantian antar shift → ROUNDUP(FTE). Man power dihitung dengan pooling di bawah.
      resources: x.fte <= 0 ? 0 : jenis === 'Man Power' ? 0 : Math.ceil(x.fte - 1e-9),
    }));
  };
  const mp = ringkas('Man Power'), mhe = ringkas('Equipment');

  // Man power: multi-skill pooling per shift aktif.
  // Tiap role dapat orang tetap = bagian bulat FTE; sisa pecahan semua role dijumlah → ROUNDUP = orang multi-skill,
  // diberikan ke role dengan sisa terbesar; role dengan sisa kecil dirangkap oleh mereka.
  for (const w of beban) {
    if (w <= 0) continue;
    const v = mp.map(r => r.fte * w);
    const dasar = v.map(x => Math.floor(x + 1e-9));
    const sisa = v.map((x, i) => Math.max(0, x - dasar[i]));
    const pool = Math.ceil(sisa.reduce((a, b) => a + b, 0) - 1e-9);
    const urut = sisa.map((x, i) => ({ x, i })).filter(o => o.x > 1e-6).sort((a, b) => b.x - a.x);
    const dapat = new Set(urut.slice(0, pool).map(o => o.i));
    const dirangkap = urut.slice(pool).map(o => mp[o.i].nama);
    mp.forEach((r, i) => { r.resources += dasar[i] + (dapat.has(i) ? 1 : 0); });
    for (const o of urut.slice(pool)) mp[o.i].dirangkap = true;
    for (const i of dapat) for (const n of dirangkap) if (!mp[i].merangkap.includes(n)) mp[i].merangkap.push(n);
  }

  // Indirect: supervisor per shift aktif dari span of control + peran tetap; alat pendukung 1 unit per orang
  const shiftAktif = beban.filter(w => w > 0).length || 1;
  const directPerShift = mp.reduce((t, r) => t + Math.ceil(r.resources / shiftAktif - 1e-9), 0);
  // Supervisor otomatis hanya bila role supervisor TIDAK diisi manual di peran tetap (input user yang dipakai) dan span > 0
  const spvManual = !!indirect && indirect.peranTetap.some(r => r.roleName === indirect.roleSupervisor);
  const spv = indirect && !spvManual && indirect.spanOfControl > 0 && directPerShift > 0 ? Math.ceil(directPerShift / indirect.spanOfControl) * shiftAktif : 0;
  const indirectRows = indirect ? [
    ...(spv ? [{ nama: indirect.roleSupervisor, ket: `Span 1:${indirect.spanOfControl}`, qty: spv, alat: (indirect.alatSupervisor ?? []).filter(Boolean) }] : []),
    ...indirect.peranTetap.map(r => ({ nama: r.roleName, ket: 'Peran tetap', qty: Number(r.qty) || 0, alat: (r.alat ?? []).filter(Boolean) })),
  ] : [];
  for (const r of indirectRows) for (const nama of r.alat) {
    let e = mhe.find(x => x.nama === nama);
    if (!e) { e = { nama, fte: 0, manHour: 0, jamPerArus: { inbound: 0, outbound: 0, storage: 0, vas: 0 }, unitIndirect: 0, resources: 0, merangkap: [], dirangkap: false }; mhe.push(e); }
    e.unitIndirect += r.qty; e.resources += r.qty;
  }
  return {
    kalender: { mp: kalMp, mhe: kalMhe }, beban, baris, mp, mhe,
    indirect: { spv, spvManual, directPerShift, rows: indirectRows, total: indirectRows.reduce((t, r) => t + r.qty, 0) },
    totalFteMp: mp.reduce((s, x) => s + x.fte, 0), totalMp: mp.reduce((s, x) => s + x.resources, 0),
    totalFteMhe: mhe.reduce((s, x) => s + x.fte, 0), totalMhe: mhe.reduce((s, x) => s + x.resources, 0),
  };
}
export type HasilPD = ReturnType<typeof hitungProcessDesign>;
