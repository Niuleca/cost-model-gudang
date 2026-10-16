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
}
export const PD_DEFAULT: ProcessDesignInput = {
  mp: { totalHari: 365, minggu: 52, cuti: 12, libur: 18, sakit: 0, sabtuPerTahun: 52, jamSabtu: 5, jamWeekday: 7 },
  mhe: { totalHari: 365, minggu: 0, cuti: 0, libur: 0, sakit: 14, sabtuPerTahun: 0, jamSabtu: 0, jamWeekday: 7 },
  operatingAlat: 2,
  bebanShift: [1, 0, 0],
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

export function hitungProcessDesign(aktivitas: AktivitasInput[], volumes: VolumeInput[], pd: ProcessDesignInput,
  faktorProduktivitas: number, efisiensi: number, jumlahShift: number) {
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
      ...x,
      // Man power: dibulatkan per shift aktif (orang tidak bisa dibagi antar shift); alat: dipakai bergantian antar shift.
      resources: x.fte <= 0 ? 0 : jenis === 'Man Power'
        ? beban.reduce((s, w) => s + (w > 0 ? Math.ceil(x.fte * w - 1e-9) : 0), 0)
        : Math.ceil(x.fte - 1e-9),
    }));
  };
  const mp = ringkas('Man Power'), mhe = ringkas('Equipment');
  return {
    kalender: { mp: kalMp, mhe: kalMhe }, beban, baris, mp, mhe,
    totalFteMp: mp.reduce((s, x) => s + x.fte, 0), totalMp: mp.reduce((s, x) => s + x.resources, 0),
    totalFteMhe: mhe.reduce((s, x) => s + x.fte, 0), totalMhe: mhe.reduce((s, x) => s + x.resources, 0),
  };
}
export type HasilPD = ReturnType<typeof hitungProcessDesign>;
