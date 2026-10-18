// Process Design & Resource Calculation (mengikuti Excel Esa):
// Volume/bln × % = workload → ÷ (produktivitas × faktor) = RfR (MH) → ÷ efisiensi = man hour
// → ÷ jam tersedia per bulan (kalender Man Power / MHE) = FTE per resource → ROUNDUP = resources.
import { pengaliEfektif, type AktivitasInput, type Arus, type VolumeInput } from './types';

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
  /** Matriks multi-skill per tender: role perangkap → daftar role yang boleh ia rangkap. Kosong = pakai aturan default. */
  rangkap?: Record<string, string[]>;
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

/** Role non-karyawan: TKBM / kuli bongkar muat (borongan) dan Helper (daily worker) — tidak bisa multi-skill. */
export const isTkbm = (nama: string) => /\btkbm\b|kuli|bongkar\s*muat|buruh|helper|daily\s*worker|harian/i.test(nama);

/** Operator MHE ber-SIO (Reach Truck, Forklift CB/CBT) — hanya bisa dibackup sesama operator. */
export const isOperatorMhe = (nama: string) => /reach\s*truck|forklift|\bRT\b|\bCBT?\b/i.test(nama) && !/admin/i.test(nama);

/** Kategori role untuk aturan rangkap default. */
export type KategoriRole = 'nonkaryawan' | 'operator' | 'admin' | 'checker' | 'picker' | 'lain';
export function kategoriRole(nama: string): KategoriRole {
  if (isTkbm(nama)) return 'nonkaryawan';
  if (/admin/i.test(nama)) return 'admin';
  if (isOperatorMhe(nama)) return 'operator';
  if (/checker/i.test(nama)) return 'checker';
  if (/picker/i.test(nama)) return 'picker';
  return 'lain';
}
/** Aturan default: siapa (baris) boleh merangkap kategori apa. */
export const RANGKAP_DEFAULT: Record<KategoriRole, KategoriRole[]> = {
  checker: ['checker', 'picker', 'operator', 'lain'],
  picker: ['picker', 'checker', 'operator', 'lain'],
  admin: ['admin', 'picker', 'checker'],
  operator: ['operator'],
  lain: ['lain', 'picker', 'checker'],
  nonkaryawan: [],
};
export function rangkapDefault(perangkap: string, dirangkap: string) {
  const a = kategoriRole(perangkap), b = kategoriRole(dirangkap);
  if (a === 'nonkaryawan' || b === 'nonkaryawan') return false;
  return RANGKAP_DEFAULT[a].includes(b);
}
export function bolehRangkap(perangkap: string, dirangkap: string, matriks?: Record<string, string[]>) {
  if (perangkap === dirangkap) return true;
  if (isTkbm(perangkap) || isTkbm(dirangkap)) return false;
  const m = matriks?.[perangkap];
  return m ? m.includes(dirangkap) : rangkapDefault(perangkap, dirangkap);
}

export function hitungProcessDesign(aktivitas: AktivitasInput[], volumes: VolumeInput[], pd: ProcessDesignInput,
  faktorProduktivitas: number, efisiensi: number, jumlahShift: number, indirect?: IndirectInput) {
  const kalMp = hitungKalenderResource(pd.mp), kalMhe = hitungKalenderResource(pd.mhe);
  const beban = bebanAktif(pd.bebanShift, jumlahShift);
  const operatingAuto = Math.max(1, beban.filter(w => w > 0).length || Math.min(3, Math.max(1, jumlahShift)));
  const baris: BarisPD[] = [];
  aktivitas.forEach((a, i) => {
    const v = volumes.find(x => x.arus === a.arus);
    const volume = a.volumeManual != null && Number.isFinite(a.volumeManual) ? Number(a.volumeManual) : (v?.peakBulan ?? 0) * pengaliEfektif(a, v);
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
      // Operating = jumlah shift aktif (alat dipakai bergantian antar shift) — otomatis, tidak bisa melebihi shift.
      const operating = alat ? operatingAuto : 1;
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
      ...x, unitIndirect: 0, merangkap: [] as string[], dirangkap: false, tkbm: false, catatan: [] as string[], dirangkapOleh: [] as string[],
      // alat: dipakai bergantian antar shift → ROUNDUP(FTE). Man power dihitung dengan pooling di bawah.
      resources: x.fte <= 0 ? 0 : jenis === 'Man Power' ? 0 : Math.ceil(x.fte - 1e-9),
    }));
  };
  const mp = ringkas('Man Power'), mhe = ringkas('Equipment');

  // Man power: multi-skill pooling per shift aktif, mengikuti matriks rangkap.
  // Tiap role dapat orang tetap = bagian bulat FTE. Sisa pecahan diurutkan dari terbesar; tiap sisa ditumpangkan ke
  // orang multi-skill yang masih punya kapasitas DAN boleh merangkap role itu (best fit); bila tidak ada → orang baru.
  // TKBM & Helper (non-karyawan) tidak ikut: tidak merangkap & tidak dirangkap → ROUNDUP sendiri.
  for (const w of beban) {
    if (w <= 0) continue;
    const orang: { host: number; sisaKap: number }[] = [];
    const nShift = beban.filter(x => x > 0).length;
    const si = beban.indexOf(w);
    const pre = nShift > 1 ? `Shift ${si + 1}: ` : '';
    const f2 = (x: number) => x.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const urut = mp.map((r, i) => ({ i, v: r.fte * w })).filter(o => o.v > 1e-9);
    for (const o of urut) {
      const r = mp[o.i];
      if (isTkbm(r.nama)) {
        const n = Math.ceil(o.v - 1e-9); r.resources += n; r.tkbm = true;
        r.catatan.push(`${pre}FTE ${f2(o.v)} → ROUNDUP = ${n} orang (non-karyawan, tidak merangkap & tidak dirangkap)`);
        continue;
      }
      const d = Math.floor(o.v + 1e-9); r.resources += d;
      if (d > 0) r.catatan.push(`${pre}${d} orang tetap dari bagian bulat FTE ${f2(o.v)}`);
    }
    const pecahan = urut.filter(o => !isTkbm(mp[o.i].nama)).map(o => ({ i: o.i, x: o.v - Math.floor(o.v + 1e-9) }))
      .filter(o => o.x > 1e-6).sort((p, q) => q.x - p.x);
    for (const f of pecahan) {
      const r = mp[f.i];
      const boleh = orang.filter(p => bolehRangkap(mp[p.host].nama, r.nama, pd.rangkap));
      const cocok = boleh.filter(p => p.sisaKap >= f.x - 1e-9).sort((p, q) => p.sisaKap - q.sisaKap)[0];
      if (cocok) {
        const h = mp[cocok.host];
        r.catatan.push(`${pre}sisa FTE ${f2(f.x)} dirangkap ${h.nama} (sisa waktu ${h.nama} ${f2(cocok.sisaKap)} → ${f2(cocok.sisaKap - f.x)})`);
        cocok.sisaKap -= f.x; r.dirangkap = true;
        if (!r.dirangkapOleh.includes(h.nama)) r.dirangkapOleh.push(h.nama);
        const lbl = `${r.nama} (${f2(f.x)})`;
        if (!h.merangkap.includes(r.nama)) h.merangkap.push(r.nama);
        h.catatan.push(`${pre}merangkap ${lbl}`);
      } else {
        // Alasan berdiri sendiri
        const pengizin = mp.filter((x, j) => j !== f.i && !isTkbm(x.nama) && x.fte > 0 && bolehRangkap(x.nama, r.nama, pd.rangkap)).map(x => x.nama);
        const alasan = boleh.length
          ? `${boleh.map(p => mp[p.host].nama).join(', ')} tidak punya sisa waktu cukup (perlu ${f2(f.x)})`
          : pengizin.length
            ? `belum ada orang lain yang bisa menampung; sisa waktunya ${f2(1 - f.x)} dipakai merangkap role lain (yang boleh merangkapnya di matriks: ${pengizin.join(', ')})`
            : `di matriks multi-skill tidak ada role yang boleh merangkapnya; sisa waktunya ${f2(1 - f.x)} dipakai merangkap role lain`;
        r.catatan.push(`${pre}+1 orang untuk sisa FTE ${f2(f.x)} — ${alasan}`);
        orang.push({ host: f.i, sisaKap: 1 - f.x }); r.resources += 1;
      }
    }
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
    if (!e) { e = { nama, fte: 0, manHour: 0, jamPerArus: { inbound: 0, outbound: 0, storage: 0, vas: 0 }, unitIndirect: 0, resources: 0, merangkap: [], dirangkap: false, tkbm: false, catatan: [], dirangkapOleh: [] }; mhe.push(e); }
    e.unitIndirect += r.qty; e.resources += r.qty;
  }
  return {
    kalender: { mp: kalMp, mhe: kalMhe }, beban, operating: operatingAuto, baris, mp, mhe,
    indirect: { spv, spvManual, directPerShift, rows: indirectRows, total: indirectRows.reduce((t, r) => t + r.qty, 0) },
    totalFteMp: mp.reduce((s, x) => s + x.fte, 0), totalMp: mp.reduce((s, x) => s + x.resources, 0),
    totalFteMhe: mhe.reduce((s, x) => s + x.fte, 0), totalMhe: mhe.reduce((s, x) => s + x.resources, 0),
  };
}
export type HasilPD = ReturnType<typeof hitungProcessDesign>;
