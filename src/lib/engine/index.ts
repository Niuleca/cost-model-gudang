// Mesin hitung cost model gudang.
// Alur: kalender → volume desain (peak) → space → manpower (per shift × shift)
// → MHE → payroll → biaya (fasilitas, utilitas, CAPEX, startup, finance, overhead)
// → alokasi ke aktivitas → harga per kategori risiko → rate card → red flag.

import { hitungProcessDesign, PD_DEFAULT } from './processDesign';
import { hitungSpaceExcel, lengkapiSpaceExcel } from './space';
import { pengaliEfektif, headcountTetap, isRoleSupervisor } from './types';
import { PARAM_BIAYA_MP_DEFAULT, rincianBiayaRole } from './biayaMp';
import type {
  Arus, Bucket, KategoriRisiko, Kelompok, TenderInput, MasterData, RedFlag, BiayaBaris, JobLevel,
} from './types.ts';

export * from './types.ts';

const BUCKETS: Bucket[] = ['storage', 'handling_in', 'handling_out', 'vas', 'manajemen'];
const ARUS_KE_BUCKET: Record<Arus, Bucket> = {
  inbound: 'handling_in', outbound: 'handling_out', storage: 'storage', vas: 'vas',
};
const RISIKO_DEFAULT: Record<Kelompok, KategoriRisiko> = {
  Manpower: 'Sedang', Fasilitas: 'Rendah', Utilitas: 'Rendah', MHE: 'Sedang', Racking: 'Tinggi',
  IT: 'Sedang', Office: 'Rendah', Consumable: 'Rendah', HSE: 'Rendah', Asuransi: 'Rendah',
  Startup: 'Tinggi', Finance: 'Rendah', 'Interest cost': 'Rendah', Overhead: 'Rendah', Lainnya: 'Sedang',
};

const bulat = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
const kosongAlokasi = (): Record<Bucket, number> => ({ storage: 0, handling_in: 0, handling_out: 0, vas: 0, manajemen: 0 });

function normalisasi(a: Partial<Record<Bucket, number>> | undefined, fallback: Partial<Record<Bucket, number>>): Record<Bucket, number> {
  const src = a && Object.values(a).some(v => (v ?? 0) > 0) ? a : fallback;
  const out = kosongAlokasi();
  const total = BUCKETS.reduce((s, b) => s + (src[b] ?? 0), 0) || 1;
  for (const b of BUCKETS) out[b] = (src[b] ?? 0) / total;
  return out;
}

/** Pembulatan harga jual: ke atas ke 10 (di bawah 1.000) atau 100 (di atasnya). */
export function roundupHarga(x: number): number {
  if (!isFinite(x) || x <= 0) return 0;
  const step = x < 100 ? 1 : x < 1000 ? 10 : 100;  // tarif kecil (per pcs/case) dibulatkan halus agar tidak melonjak
  return Math.ceil(x / step) * step;
}

// ---------------------------------------------------------------------------
// 1. Kalender (UC8)
// ---------------------------------------------------------------------------
export function hitungKalender(tahun: number, hariKerjaPerMinggu: number, holidays: { tanggal: string }[], cuti: number) {
  const libur = new Set(holidays.map(h => h.tanggal));
  // 5 hari = Senin–Jumat, 6 = Senin–Sabtu, 7 = setiap hari
  const hariAktif = new Set(hariKerjaPerMinggu === 7 ? [0, 1, 2, 3, 4, 5, 6] : hariKerjaPerMinggu === 6 ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]);
  let hariKalenderKerja = 0, liburDiHariKerja = 0;
  for (let d = new Date(Date.UTC(tahun, 0, 1)); d.getUTCFullYear() === tahun; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!hariAktif.has(d.getUTCDay())) continue;
    hariKalenderKerja++;
    if (libur.has(d.toISOString().slice(0, 10))) liburDiHariKerja++;
  }
  const hariOperasional = hariKalenderKerja - liburDiHariKerja;      // gudang buka
  const hariKerjaOrang = hariOperasional - cuti;                      // satu orang hadir
  return {
    hariKalenderKerja, liburDiHariKerja, cuti,
    hariOperasional, hariKerjaOrang,
    hariOperasionalBulan: hariOperasional / 12,
    faktorPengganti: hariOperasional / hariKerjaOrang,                // relief factor karena cuti
  };
}

// ---------------------------------------------------------------------------
// Fungsi utama
// ---------------------------------------------------------------------------
export function hitungTender(t: TenderInput, m: MasterData) {
  const flags: RedFlag[] = [];
  const kal = hitungKalender(t.tahun, t.hariKerjaPerMinggu, m.holidays, t.cutiTahunanHari);

  // ---- 2. Volume desain (peak) ----
  const volume = t.volumes.map(v => {
    if (v.peakBulan < v.rataRataBulan) flags.push({ level: 'kritis', kode: 'PEAK_LT_AVG', pesan: `Peak ${v.arus} (${v.uom}) lebih kecil dari rata-rata.` });
    if (v.komitmenBulan > v.peakBulan) flags.push({ level: 'peringatan', kode: 'MGV_GT_PEAK', pesan: `Volume komitmen ${v.arus} melebihi peak.` });
    const faktorPeak = v.rataRataBulan > 0 ? v.peakBulan / v.rataRataBulan : 1;
    const perHari = v.arus === 'storage' ? v.peakBulan : v.peakBulan / kal.hariOperasionalBulan;
    const perShift = v.arus === 'storage' ? v.peakBulan : perHari / t.jumlahShift;
    return { ...v, faktorPeak: bulat(faktorPeak, 2), desainPerHari: perHari, desainPerShift: perShift };
  });
  const volArus = (arus: Arus) => volume.find(v => v.arus === arus);

  // ---- 3. Space (UC12) ----
  const s = t.space;
  const ppDesain = volArus('storage')?.peakBulan ?? 0;
  // Metode Excel: selective / double deep per bay + staging per sequence + fasilitas → dibulatkan (space rent)
  const sx = hitungSpaceExcel(lengkapiSpaceExcel(s.excel), ppDesain, volArus('inbound')?.peakBulan ?? 0, volArus('outbound')?.peakBulan ?? 0, t.jumlahShift);
  const storageM2 = sx.sd.footprint + sx.dd.footprint + sx.block.footprint + sx.floor.footprint;
  const totalM2 = sx.spaceRent;
  const space = {
    ppDesain, m2PerPP: bulat(ppDesain > 0 ? storageM2 / ppDesain : 0, 3), storageM2: bulat(storageM2, 1),
    stagingInM2: bulat(sx.inbound.footprint, 1), stagingOutM2: bulat(sx.outbound.footprint, 1),
    fasilitasM2: bulat(sx.fasilitasM2, 1), allowanceM2: bulat(totalM2 - sx.subtotal, 1), totalM2,
    posisiRak: sx.posisiRak, levelRak: sx.level.level, excel: sx,
  };
  if (!sx.porsiOk) flags.push({ level: 'kritis', kode: 'PORSI_SPACE', pesan: `Porsi SPR + DDR + block stack + pallet floor = ${(sx.totalPorsi * 100).toFixed(1)}% (harus 100%).` });
  if (!sx.level.ok && sx.posisiRak > 0) flags.push({ level: 'kritis', kode: 'RAK_TERLALU_TINGGI', pesan: `Tinggi rak ${sx.level.tinggi} mm melebihi tinggi sisi gudang ${s.excel?.rak.sideMm ?? '-'} mm.` });
  if (sx.cadTotal > 0 && Math.abs(totalM2 - sx.cadTotal) / sx.cadTotal > 0.05)
    flags.push({ level: 'peringatan', kode: 'CAD_GAP', pesan: `Luas hitung ${totalM2} m² berbeda >5% dari CAD ${sx.cadTotal} m².` });

  // ---- 4. Manpower direct (UC13) — jam per shift dipool per role ----
  const jobs = new Map<string, JobLevel>(m.jobLevels.map(j => [j.roleName, j]));
  type RoleAgg = { jamPerShift: number; jamPerArus: Record<Arus, number> };
  const perRole = new Map<string, RoleAgg>();
  const perTool = new Map<string, { jamPerShift: number; jamPerArus: Record<Arus, number> }>();
  const aktivitasHasil = t.aktivitas.map(a => {
    const v = volArus(a.arus);
    const volPerShift = (v?.arus === 'storage'
      ? (v.peakBulan / kal.hariOperasionalBulan) / t.jumlahShift   // aktivitas storage (cycle count) dihitung per hari
      : (v?.desainPerShift ?? 0)) * a.persenVolume * pengaliEfektif(a, t.volumes.find(x => x.arus === a.arus));
    const jam = volPerShift / (a.prodPerJam * t.faktorProduktivitas) / t.efisiensi;
    if (!jobs.has(a.roleName)) flags.push({ level: 'kritis', kode: 'ROLE_TIDAK_ADA', pesan: `Role "${a.roleName}" belum ada di master jabatan.` });
    const r = perRole.get(a.roleName) ?? { jamPerShift: 0, jamPerArus: { inbound: 0, outbound: 0, storage: 0, vas: 0 } };
    r.jamPerShift += jam; r.jamPerArus[a.arus] += jam; perRole.set(a.roleName, r);
    if (a.tool && a.tool !== 'Manual') {
      const tl = perTool.get(a.tool) ?? { jamPerShift: 0, jamPerArus: { inbound: 0, outbound: 0, storage: 0, vas: 0 } };
      tl.jamPerShift += jam; tl.jamPerArus[a.arus] += jam; perTool.set(a.tool, tl);
    }
    return { ...a, volumePerShift: bulat(volPerShift, 2), jamPerShift: bulat(jam, 3) };
  });

  type MpBaris = { roleName: string; jenis: 'Direct' | 'Indirect' | 'Tetap'; jamPerShift: number; mpPerShift: number; headcount: number; utilisasi: number; alokasi: Record<Bucket, number> };
  const manpower: MpBaris[] = [];
  const metodeExcel = (t.metodeManpower ?? 'excel') === 'excel';
  const pd = metodeExcel ? hitungProcessDesign(t.aktivitas, t.volumes, t.processDesign ?? PD_DEFAULT, t.faktorProduktivitas, t.efisiensi, t.jumlahShift,
    { spanOfControl: t.spanOfControl, roleSupervisor: t.roleSupervisor, alatSupervisor: t.alatSupervisor, peranTetap: t.peranTetap }) : null;
  let directPerShift = 0;
  if (pd) {
    // ---- 4b. Manpower direct metode Process Design: FTE per bulan → ROUNDUP per shift aktif ----
    const shiftAktif = pd.beban.filter(w => w > 0).length || 1;
    for (const r of pd.mp) {
      if (!jobs.has(r.nama)) continue;
      const alok = kosongAlokasi();
      for (const a of Object.keys(r.jamPerArus) as Arus[]) alok[ARUS_KE_BUCKET[a]] = r.manHour > 0 ? r.jamPerArus[a] / r.manHour : 0;
      const mpPerShift = Math.ceil(r.resources / shiftAktif - 1e-9);
      directPerShift += mpPerShift;
      const utilisasi = r.resources > 0 ? r.fte / r.resources : 0;
      manpower.push({ roleName: r.nama, jenis: 'Direct', jamPerShift: bulat(r.manHour / Math.max(1, pd.kalender.mp.hariBulan) / shiftAktif, 2), mpPerShift,
        headcount: r.resources, utilisasi: bulat(utilisasi, 3), alokasi: alok });
      if (r.resources > 0 && utilisasi < 0.5) flags.push({ level: 'info', kode: 'UTILISASI_RENDAH', pesan: `${r.nama}: FTE ${r.fte.toFixed(2)} dibulatkan jadi ${r.resources} orang (terisi ${Math.round(utilisasi * 100)}%) — pertimbangkan multi-skill/pooling.` });
    }
    if (t.spanOfControl > 0 && directPerShift > 0 && !t.peranTetap.some(p => p.roleName === t.roleSupervisor)) {
      const spvPerShift = Math.ceil(directPerShift / t.spanOfControl);
      manpower.push({ roleName: t.roleSupervisor, jenis: 'Indirect', jamPerShift: 0, mpPerShift: spvPerShift, headcount: spvPerShift * shiftAktif, utilisasi: 1,
        alokasi: normalisasi(undefined, { handling_in: 0.4, handling_out: 0.4, storage: 0.2 }) });
    }
    for (const p of t.peranTetap) {
      manpower.push({ roleName: p.roleName, jenis: 'Tetap', jamPerShift: 0, mpPerShift: p.perShift ? Number(p.qty) || 0 : 0, headcount: headcountTetap(p, shiftAktif), utilisasi: 1,
        alokasi: normalisasi(p.alokasi, { manajemen: 1 }) });
    }
  }
  if (!pd) {
  for (const [roleName, r] of perRole) {
    const mpPerShift = Math.ceil(r.jamPerShift / t.jamEfektifPerShift - 1e-9);
    const headcount = Math.ceil(mpPerShift * t.jumlahShift * kal.faktorPengganti - 1e-9);
    directPerShift += mpPerShift;
    const alok = kosongAlokasi();
    for (const a of Object.keys(r.jamPerArus) as Arus[]) alok[ARUS_KE_BUCKET[a]] = r.jamPerShift > 0 ? r.jamPerArus[a] / r.jamPerShift : 0;
    const utilisasi = mpPerShift > 0 ? r.jamPerShift / (mpPerShift * t.jamEfektifPerShift) : 0;
    manpower.push({ roleName, jenis: 'Direct', jamPerShift: bulat(r.jamPerShift, 2), mpPerShift, headcount, utilisasi: bulat(utilisasi, 3), alokasi: alok });
    if (utilisasi < 0.5) flags.push({ level: 'info', kode: 'UTILISASI_RENDAH', pesan: `${roleName} terisi ${Math.round(utilisasi * 100)}% per shift — pertimbangkan multi-skill/pooling.` });
  }
  // Supervisor berdasarkan span of control
  if (t.spanOfControl > 0 && directPerShift > 0 && !t.peranTetap.some(p => p.roleName === t.roleSupervisor)) {
    const spvPerShift = Math.ceil(directPerShift / t.spanOfControl);
    manpower.push({ roleName: t.roleSupervisor, jenis: 'Indirect', jamPerShift: 0, mpPerShift: spvPerShift,
      headcount: Math.ceil(spvPerShift * t.jumlahShift * kal.faktorPengganti - 1e-9), utilisasi: 1,
      alokasi: normalisasi(undefined, { handling_in: 0.4, handling_out: 0.4, storage: 0.2 }) });
  }
  for (const p of t.peranTetap) {
    manpower.push({ roleName: p.roleName, jenis: 'Tetap', jamPerShift: 0, mpPerShift: p.perShift ? Number(p.qty) || 0 : 0, headcount: headcountTetap(p, t.jumlahShift), utilisasi: 1,
      alokasi: normalisasi(p.alokasi, { manajemen: 1 }) });
  }
  }

  if (t.spanOfControl > 0 && !t.peranTetap.some(p => p.roleName === t.roleSupervisor)) {
    if (!isRoleSupervisor(t.roleSupervisor)) flags.push({ level: 'peringatan', kode: 'ROLE_SPV_TIDAK_WAJAR', pesan: `Role supervisor "${t.roleSupervisor}" bukan role supervisi — jumlahnya dihitung dari span of control. Pilih role SPV/Leader, atau masukkan ${t.roleSupervisor} di peran tetap.` });
    if (t.spanOfControl < 5) flags.push({ level: 'peringatan', kode: 'SPAN_KECIL', pesan: `Span of control ${t.spanOfControl} sangat kecil (1 supervisor per ${t.spanOfControl} orang direct). Umumnya 10–20.` });
  }
  // ---- 5. MHE ---- (metode Process Design: unit = ROUNDUP(FTE alat); jam tersedia sudah memperhitungkan hari repair)
  const mhe = t.mhe.map(x => {
    const jam = perTool.get(x.tool)?.jamPerShift ?? 0;
    const unitDasar = pd ? (pd.mhe.find(r => r.nama === x.tool)?.resources ?? 0) : Math.ceil(jam / (t.jamEfektifPerShift * x.ketersediaan) - 1e-9);   // alat dipakai bergantian antar shift
    const spare = unitDasar > 0 ? Math.ceil(unitDasar * x.sparePersen - 1e-9) : 0;
    // Porsi arus: jam per shift (metode lama) → jam process design → merata bila alat hanya dipakai indirect
    const jamLama = perTool.get(x.tool)?.jamPerArus;
    const arusJam = jamLama && Object.values(jamLama).some(v => v > 0) ? jamLama
      : pd?.mhe.find(r => r.nama === x.tool)?.jamPerArus ?? { inbound: 0, outbound: 0, storage: 0, vas: 0 };
    const totArus = Object.values(arusJam).reduce((a2, c) => a2 + c, 0);
    const alok = kosongAlokasi();
    for (const a of Object.keys(arusJam) as Arus[]) alok[ARUS_KE_BUCKET[a]] = totArus > 0 ? arusJam[a] / totArus : 0;
    return { ...x, jamPerShift: bulat(jam, 2), unit: unitDasar + spare, unitDasar, spare, alokasi: totArus > 0 ? alok : normalisasi(undefined, { storage: 0.4, handling_in: 0.3, handling_out: 0.3 }) };
  });
  for (const tool of perTool.keys())
    if (!t.mhe.some(x => x.tool === tool) && !['RF', 'PC', 'HPT', 'Hand Pallet', 'Hand Wrapper'].includes(tool))
      flags.push({ level: 'peringatan', kode: 'MHE_TANPA_HARGA', pesan: `Tool "${tool}" dipakai aktivitas tetapi belum ada harga MHE.` });

  // ---- 6. Payroll (UC1–UC3) ----
  const P = m.payroll;
  // Eskalasi: biaya tahun ke-y = dasar × (1+r)^(y-1); biaya/bln yang dipakai = total kontrak ÷ bulan kontrak
  const esk = hitungEskalasi(t.eskalasiManpower?.persenTahun ?? 0, t.durasiKontrakBulan, t.eskalasiManpower?.mulai);
  // Rincian biaya manpower (format sheet): gaji pokok + lisensi → sub total + BPJS TK/KS/Pensiun + THR + kompensasi + supervisi = total/orang;
  // Σ total × orang = Sub Total-1; × (1 + management fee) = Sub Total-2 → dipakai sebagai biaya manpower.
  const paramMp = { ...PARAM_BIAYA_MP_DEFAULT, batasUpahPensiun: m.payroll.batasUpahJp || PARAM_BIAYA_MP_DEFAULT.batasUpahPensiun, batasUpahKs: m.payroll.batasUpahKes || PARAM_BIAYA_MP_DEFAULT.batasUpahKs, ...(t.paramBiayaMp ?? {}) };
  const hariMp = t.processDesign?.hariKerjaKaryawan ?? 25;
  const payroll = manpower.map(mp => {
    const rc = rincianBiayaRole(mp.roleName, mp.headcount, m, t.rincianBiayaMp?.[mp.roleName], paramMp, hariMp, t.kabKota, { levelGaji: t.levelGaji, levelRole: t.levelRole });
    const perOrang = rc.total * (1 + paramMp.feePersen);
    const dasarBulan = perOrang * mp.headcount * rc.porsi;
    return { ...mp, skema: rc.skema, porsi: rc.porsi, upah: bulat(rc.gajiPokok), lisensi: bulat(rc.lisensi), subTotal: bulat(rc.subTotal), bpjsTk: bulat(rc.bpjsTk), bpjsKes: bulat(rc.bpjsKs),
      bpjsPensiun: bulat(rc.bpjsPensiun), thr: bulat(rc.thr), kompensasi: bulat(rc.kompensasi), supervisi: bulat(rc.supervisi),
      totalSebelumFee: bulat(rc.total), fee: bulat(rc.total * paramMp.feePersen), total: bulat(perOrang), biayaManual: rc.manual,
      biayaBulanDasar: bulat(dasarBulan), biayaBulan: bulat(dasarBulan * esk.faktor) };
  });
  const dasarMp = payroll.reduce((s2, p) => s2 + p.biayaBulanDasar, 0);
  const eskalasiManpower = { ...esk, dasarBulan: bulat(dasarMp),
    tahun: esk.tahun.map(y => ({ ...y, biayaBulan: bulat(dasarMp * y.indeks), total: bulat(dasarMp * y.indeks * y.bulan) })),
    totalKontrak: bulat(dasarMp * esk.faktor * t.durasiKontrakBulan), rataBulan: bulat(dasarMp * esk.faktor) };

  // ---- 7. Baris biaya ----
  const r = m.finance.bungaModalTahun / 12;
  const n = t.durasiKontrakBulan;
  const baris: BiayaBaris[] = [];
  const tambah = (deskripsi: string, kelompok: Kelompok, biayaBulan: number, alokasi: Record<Bucket, number>, dasar: string, risiko?: KategoriRisiko) => {
    const rev = t.revisiBiaya?.[deskripsi];
    const direvisi = rev != null && Number.isFinite(rev) && rev >= 0;
    if (biayaBulan <= 0 && !direvisi) return;
    // pengaman: baris tanpa alokasi tidak boleh hilang dari tarif → sebar merata
    if (!(Object.values(alokasi).reduce((a2, c) => a2 + c, 0) > 1e-9)) alokasi = normalisasi(undefined, { storage: 0.4, handling_in: 0.3, handling_out: 0.3 });
    if (direvisi) {
      baris.push({ deskripsi, kelompok, kategoriRisiko: risiko ?? RISIKO_DEFAULT[kelompok], biayaBulan: bulat(rev), alokasi,
        dasar: `direvisi manual (sistem: Rp${bulat(biayaBulan).toLocaleString('id-ID')} · ${dasar})`, biayaSistem: bulat(biayaBulan) });
      return;
    }
    baris.push({ deskripsi, kelompok, kategoriRisiko: risiko ?? RISIKO_DEFAULT[kelompok], biayaBulan: bulat(biayaBulan), alokasi, dasar });
  };
  // biaya beli: depresiasi selama min(umur, kontrak) + bunga atas rata-rata nilai buku
  const capex = (deskripsi: string, kelompok: Kelompok, nilai: number, umur: number | undefined, alokasi: Record<Bucket, number>, risiko?: KategoriRisiko) => {
    const u = umur && umur > 0 ? umur : n;
    const periode = Math.min(u, n);
    if (u > n) flags.push({ level: 'peringatan', kode: 'UMUR_GT_KONTRAK', pesan: `${deskripsi}: umur ${u} bln > kontrak ${n} bln — disusutkan penuh selama kontrak (customer menanggung seluruh nilai). Kalau aset akan dipakai ulang setelah kontrak, pertimbangkan umur penuh.` });
    tambah(`${deskripsi} — depresiasi`, kelompok, nilai / periode, alokasi, `Rp${bulat(nilai).toLocaleString('id-ID')} ÷ ${periode} bln`, risiko);
    nilaiModal.set(`${deskripsi} — depresiasi`, nilai);
    // bunga tidak otomatis — hanya lewat sheet Interest cost (dipilih user)
    return nilai;
  };
  let investasi = 0;
  // Interest cost (simulasi pinjaman bank): baris yang dibiayai bank tidak lagi kena "bunga modal" default
  const ic = t.interestCost;
  const nilaiModal = new Map<string, number>();

  for (const p of payroll) tambah(`Manpower — ${p.roleName} (${p.headcount} org)`, 'Manpower', p.biayaBulan, p.alokasi,
    `${p.headcount} org${p.porsi < 1 ? ` × sharing ${p.porsi.toLocaleString('id-ID')}` : ''} × Rp${Math.round(p.totalSebelumFee).toLocaleString('id-ID')} + fee ${(paramMp.feePersen * 100).toLocaleString('id-ID')}%${p.biayaManual ? ' (diubah)' : ''}${esk.faktor > 1.0000001 ? ` × eskalasi ${esk.faktor.toFixed(4)} (rata-rata kontrak)` : ''}`);

  // Fasilitas
  const alokStorage = normalisasi({ storage: 1 }, { storage: 1 });
  const sewaTetap = t.skenarioAset === 'Rental' && (s.sewaTetapBulan ?? 0) > 0;
  const sewaBulan = t.skenarioAset !== 'Rental' ? 0 : sewaTetap ? s.sewaTetapBulan! : space.totalM2 * s.tarifSewaM2Bulan;
  tambah(s.namaGudang ? `Sewa gudang — ${s.namaGudang}` : 'Sewa gudang', 'Fasilitas', sewaBulan, alokStorage,
    sewaTetap ? `sewa utuh Rp${s.sewaTetapBulan!.toLocaleString('id-ID')}/bln (${s.luasTersediaM2 ?? '?'} m²)` : `${space.totalM2} m² × Rp${s.tarifSewaM2Bulan.toLocaleString('id-ID')}`);
  if (s.luasTersediaM2 && space.totalM2 > s.luasTersediaM2)
    flags.push({ level: 'kritis', kode: 'GUDANG_KURANG', pesan: `Kebutuhan ${space.totalM2} m² melebihi luas gudang terpilih ${s.luasTersediaM2} m².` });
  else if (s.luasTersediaM2 && sewaTetap && space.totalM2 < s.luasTersediaM2 * 0.7)
    flags.push({ level: 'peringatan', kode: 'GUDANG_LONGGAR', pesan: `Gudang disewa utuh ${s.luasTersediaM2} m² tetapi kebutuhan hanya ${space.totalM2} m² (<70%) — biaya sewa idle dibebankan ke customer.` });
  // Racking: posisi SPR & DDR dari sheet Space × harga per jenis (Price Inquiry Racking). Data lama: satu harga untuk semua posisi.
  const posSpr = Math.ceil(sx.sd.ppReq - 1e-9), posDdr = Math.ceil(sx.dd.ppReq - 1e-9);
  const rakLama = { harga: s.hargaRakPerPosisi ?? 0, umurBulan: s.umurRakBulan ?? 120 };
  for (const [label, pos, h] of [['SPR', posSpr, s.rak?.spr ?? rakLama], ['DDR', posDdr, s.rak?.ddr ?? rakLama]] as const)
    if (pos > 0 && h.harga > 0) investasi += capex(`Racking ${label} (${pos} posisi)`, 'Racking', pos * h.harga, h.umurBulan, alokStorage);

  // Listrik
  const alokListrik = normalisasi(undefined, { storage: 0.6, handling_in: 0.2, handling_out: 0.2 });
  if (t.listrikSimulasi && t.listrikSimulasi.totalBulan > 0)
    tambah(`Listrik — ${t.listrikSimulasi.nama}`, 'Utilitas', t.listrikSimulasi.totalBulan, alokListrik,
      `simulasi Utilities: ${bulat(t.listrikSimulasi.kwhBulan).toLocaleString('id-ID')} kWh/bln (energi + kVArh + beban)`);
  else {
    const kwhBulan = t.listrik.reduce((sum, l) => sum + l.watt * l.qty * l.jamPerHari, 0) * kal.hariOperasionalBulan / 1000;
    tambah('Listrik', 'Utilitas', kwhBulan * t.tarifListrikKwh, alokListrik, `${bulat(kwhBulan).toLocaleString('id-ID')} kWh × Rp${t.tarifListrikKwh}`);
  }

  // MHE
  for (const x of mhe) {
    if (x.unit === 0) continue;
    if (x.mode === 'sewa') tambah(`${x.nama} — sewa (${x.unit} unit)`, 'MHE', x.unit * x.harga, x.alokasi, `${x.unit} unit × Rp${x.harga.toLocaleString('id-ID')}`);
    else investasi += capex(`${x.nama} (${x.unit} unit)`, 'MHE', x.unit * x.harga, x.umurBulan, x.alokasi);
  }

  // Baris lain (IT, office, HSE, asuransi, pest control, consumable, startup)
  for (const c of t.costLines) {
    const alok = normalisasi(c.alokasi, { storage: 0.4, handling_in: 0.3, handling_out: 0.3 });
    const nilai = c.qty * c.hargaSatuan;
    if (c.mode === 'bulanan' || c.mode === 'sewa') tambah(c.deskripsi, c.kelompok, nilai, alok, `${c.qty} × Rp${c.hargaSatuan.toLocaleString('id-ID')}${c.sumber ? ' · ' + c.sumber : ''}`, c.kategoriRisiko);
    else if (c.mode === 'beli') investasi += capex(c.deskripsi, c.kelompok, nilai, c.umurBulan, alok, c.kategoriRisiko);
    else { // sekali (startup): amortisasi selama kontrak + bunga
      tambah(`${c.deskripsi} — amortisasi`, c.kelompok, nilai / n, alok, `Rp${nilai.toLocaleString('id-ID')} ÷ ${n} bln`, c.kategoriRisiko ?? 'Tinggi');
      nilaiModal.set(`${c.deskripsi} — amortisasi`, nilai);
      investasi += nilai;
    }
  }

  // ---- 7b. Startup & implementation otomatis: biaya sekali = % OPEX bulanan / % biaya manpower bulanan, diamortisasi selama kontrak ----
  const sa = t.startupAuto;
  if (sa?.aktif) {
    const opexDasar = baris.filter(b => b.kelompok !== 'Startup').reduce((sum, b) => sum + b.biayaBulan, 0);
    const manpowerDasar = payroll.reduce((sum, p) => sum + p.biayaBulanDasar, 0);
    const alokOps = normalisasi(undefined, { storage: 0.4, handling_in: 0.3, handling_out: 0.3 });
    for (const [nama, persen, dasar, ket] of [
      ['Startup cost', sa.persenOpex, opexDasar, 'OPEX/bln'], ['Implementation cost', sa.persenManpower, manpowerDasar, 'biaya manpower/bln'],
    ] as const) {
      const nilai = persen * dasar;
      if (nilai <= 0) continue;
      tambah(`${nama} (otomatis) — amortisasi`, 'Startup', nilai / n, alokOps, `${(persen * 100).toFixed(0)}% × ${ket} Rp${bulat(dasar).toLocaleString('id-ID')} = Rp${bulat(nilai).toLocaleString('id-ID')} ÷ ${n} bln`);
      nilaiModal.set(`${nama} (otomatis) — amortisasi`, nilai);
      investasi += nilai;
    }
  }
  // ---- 7c. Interest cost: sumber pinjaman (semua baris biaya kecuali finance/overhead) + baris manual ----
  // Hanya capex (beli → depresiasi, biaya sekali → amortisasi); opex dibiayai lewat baris manual bila perlu
  const sumberPinjaman = baris.filter(b => nilaiModal.has(b.deskripsi)).map(b => ({
    deskripsi: b.deskripsi, kelompok: b.kelompok, biayaBulan: b.biayaBulan, jenis: 'capex' as const, pokokDefault: bulat(nilaiModal.get(b.deskripsi)!) }));
  const bungaTahun = Math.max(0, ic?.bungaTahun ?? 0.09);
  const interestItems = (ic?.items ?? []).filter(x => x.aktif).map(x => {
    const src = x.sumber ? sumberPinjaman.find(sp => sp.deskripsi === x.sumber) : undefined;
    const pokok = x.pokok != null && x.pokok >= 0 ? x.pokok : (src?.pokokDefault ?? 0);
    const tenor = x.tenorBulan && x.tenorBulan > 0 ? x.tenorBulan : n;
    const rb = bungaTahun / 12;
    const totalBunga = ic?.metode === 'menurun' ? pokok * rb * (tenor + 1) / 2 : pokok * rb * tenor;
    return { ...x, sumberDitemukan: !x.sumber || !!src, pokok: bulat(pokok), tenorBulan: tenor, bungaBulanAwal: bulat(pokok * rb), totalBunga: bulat(totalBunga), biayaBulan: bulat(totalBunga / n),
      alokasi: (src ? baris.find(b => b.deskripsi === src.deskripsi)?.alokasi : undefined) ?? normalisasi(undefined, { storage: 0.4, handling_in: 0.3, handling_out: 0.3 }) };
  });
  for (const it of interestItems) {
    if (!it.sumberDitemukan) { flags.push({ level: 'peringatan', kode: 'INTEREST_SUMBER', pesan: `Interest cost "${it.deskripsi}": baris sumber "${it.sumber}" tidak ada lagi di rincian biaya — pakai pokok manual atau pilih ulang.` }); }
    tambah(`Interest cost — ${it.deskripsi}`, 'Interest cost', it.biayaBulan, it.alokasi,
      `pokok Rp${it.pokok.toLocaleString('id-ID')} × ${(bungaTahun * 100).toLocaleString('id-ID')}%/thn × ${it.tenorBulan} bln${ic?.metode === 'menurun' ? ' (pokok dicicil, bunga atas sisa)' : ' (flat)'} = Rp${it.totalBunga.toLocaleString('id-ID')} ÷ ${n} bln kontrak`);
  }
  const interestCost = { bungaTahun, metode: ic?.metode ?? 'flat', items: interestItems.map(({ alokasi: _a, ...x }) => x),
    totalPokok: bulat(interestItems.reduce((a, x) => a + x.pokok, 0)), totalBunga: bulat(interestItems.reduce((a, x) => a + x.totalBunga, 0)),
    biayaBulan: bulat(interestItems.reduce((a, x) => a + x.biayaBulan, 0)) };

  const subtotalOperasi = baris.reduce((sum, b) => sum + b.biayaBulan, 0);
  const selisihHari = t.paymentTermHari - m.finance.apHari;
  if (selisihHari > 0 && ic?.workingCapital)
    tambah('Interest cost — working capital (payment term)', 'Interest cost', subtotalOperasi * (selisihHari / 30) * r,
      normalisasi(undefined, { storage: 0.4, handling_in: 0.3, handling_out: 0.3 }), `biaya bulanan × (${t.paymentTermHari} − ${m.finance.apHari}) hari ÷ 30 × bunga`);

  // ---- 9. Overhead ----
  const subtotal = baris.reduce((sum, b) => sum + b.biayaBulan, 0);
  if (m.finance.overheadPersen <= 0) flags.push({ level: 'peringatan', kode: 'OVERHEAD_NOL', pesan: 'Overhead 0% — pastikan memang disengaja.' });
  tambah('Overhead', 'Overhead', subtotal * m.finance.overheadPersen, normalisasi(undefined, { storage: 0.4, handling_in: 0.3, handling_out: 0.3 }), `${(m.finance.overheadPersen * 100).toFixed(1)}% × subtotal`);

  // ---- 10. Alokasi ke bucket (cost-to-serve) per kategori risiko ----
  const biayaBucket: Record<Bucket, Record<KategoriRisiko, number>> = Object.fromEntries(
    BUCKETS.map(b => [b, { Rendah: 0, Sedang: 0, Tinggi: 0 }])) as never;
  for (const b of baris) for (const k of BUCKETS) biayaBucket[k][b.kategoriRisiko] += b.biayaBulan * b.alokasi[k];
  // Biaya manajemen (tetap) disebar ke bucket operasional sesuai porsi biaya
  const opsBuckets: Bucket[] = ['storage', 'handling_in', 'handling_out', 'vas'];
  const totOps = opsBuckets.reduce((s2, b) => s2 + Object.values(biayaBucket[b]).reduce((a, c) => a + c, 0), 0) || 1;
  // porsi dihitung SEKALI sebelum penyebaran (dulu dihitung ulang tiap kategori risiko → biaya terhitung dobel)
  const porsiOps = Object.fromEntries(opsBuckets.map(b => [b, Object.values(biayaBucket[b]).reduce((a, c) => a + c, 0) / totOps])) as Record<Bucket, number>;
  for (const risk of ['Rendah', 'Sedang', 'Tinggi'] as KategoriRisiko[]) {
    const man = biayaBucket.manajemen[risk];
    for (const b of opsBuckets) biayaBucket[b][risk] += man * porsiOps[b];
    biayaBucket.manajemen[risk] = 0;
  }

  // ---- 11. Harga & rate card ----
  // Pajak (istilah komersial): PPh EXCLUDE = harga belum termasuk PPh → ditanggung customer → tarif di-gross-up;
  // PPh INCLUDE = harga sudah termasuk PPh → ditanggung kita → tarif tidak dinaikkan, potongan PPh mengurangi pendapatan.
  const pajak = t.pajak ?? { pph: 'exclude', ppn: 'exclude', ppnPersen: 0.11 };
  const pphRate = m.finance.pphGrossUp;
  const g = pajak.pph === 'exclude' ? pphRate : 0;
  const ppn = Math.max(0, pajak.ppnPersen ?? 0.11);
  const bucketKeArus: Record<string, Arus> = { storage: 'storage', handling_in: 'inbound', handling_out: 'outbound', vas: 'vas' };
  const rateCard = opsBuckets.map(b => {
    const biaya = Object.values(biayaBucket[b]).reduce((a, c) => a + c, 0);
    const hargaDefault = (['Rendah', 'Sedang', 'Tinggi'] as KategoriRisiko[]).reduce((sum, k) => sum + biayaBucket[b][k] * (1 + m.margin[k]), 0);
    const mm = t.marginManual?.[b];
    const manual = mm != null && Number.isFinite(mm);
    // Input user = GP% atas pendapatan (bukan markup): harga = biaya ÷ (1 − GP)
    const gpIn = manual ? Math.min(0.95, Number(mm)) : 0;
    const hargaSebelumPph = manual ? biaya / (1 - gpIn) : hargaDefault;
    const harga = hargaSebelumPph / (1 - g);
    const v = volArus(bucketKeArus[b]);
    const komitmen = v?.komitmenBulan ?? 0;
    if (biaya > 0 && komitmen <= 0) flags.push({ level: 'kritis', kode: 'KOMITMEN_NOL', pesan: `Biaya ${b} ada tetapi volume komitmen ${bucketKeArus[b]} = 0, tarif tidak bisa dihitung.` });
    // Opsi UoM tarif: volume komitmen dikonversi ke palet / case / pcs / CBM / ton (+ m² untuk storage)
    const opsiUom = opsiUomRateCard(b, v, komitmen, space.totalM2, t.konversiPalet, { ton: t.stokTon, cbm: t.stokCbm, liter: t.stokLiter })
      .map(o => ({ ...o, tarifExcl: o.volume > 0 ? roundupHarga(harga / o.volume) : 0 }));
    const dipilih = opsiUom.find(o => o.uom === t.uomRateCard?.[b]) ?? opsiUom[0];
    const volTarif = dipilih?.volume ?? komitmen;
    const tarif = volTarif > 0 ? harga / volTarif : 0;
    const tarifExcl = roundupHarga(tarif);
    const tarifIncl = roundupHarga(tarifExcl * (1 + ppn));
    return {
      bucket: b, uom: dipilih?.uom ?? v?.uom ?? '-', uomArus: v?.uom ?? '-', opsiUom, volumeTarif: volTarif,
      volumeTetap: !!dipilih?.tetap, rasioUom: komitmen > 0 && !dipilih?.tetap ? volTarif / komitmen : 1, biayaBulan: bulat(biaya), hargaBulan: bulat(harga),
      marginEfektif: biaya > 0 ? bulat(hargaSebelumPph / biaya - 1, 4) : 0,
      marginDefault: biaya > 0 ? bulat(hargaDefault / biaya - 1, 4) : 0, marginManual: manual, hargaSebelumPph: bulat(hargaSebelumPph),
      gpPersen: hargaSebelumPph > 0 ? bulat(1 - biaya / hargaSebelumPph, 4) : 0,                       // GP% atas pendapatan (sebelum PPh)
      gpDefault: hargaDefault > 0 ? bulat(1 - biaya / hargaDefault, 4) : 0,
      volumeKomitmen: volTarif, volumeKomitmenArus: komitmen, biayaPerUnit: volTarif > 0 ? bulat(biaya / volTarif, 2) : 0,
      tarifPerUnit: tarifExcl,                       // tarif belum PPN (dasar pendapatan)
      tarifInclPpn: tarifIncl, ppnPerUnit: tarifIncl - tarifExcl,
      tarifQuote: pajak.ppn === 'include' ? tarifIncl : tarifExcl,   // tarif yang ditampilkan di penawaran
    };
  }).filter(rc => rc.biayaBulan > 0);

  // Total margin gabungan (tertimbang biaya) dari semua layanan
  const totBiayaRc = rateCard.reduce((s2, rc) => s2 + rc.biayaBulan, 0), totHargaRc = rateCard.reduce((s2, rc) => s2 + rc.hargaSebelumPph, 0);
  const marginTotal = { biayaBulan: bulat(totBiayaRc), hargaSebelumPph: bulat(totHargaRc), hargaBulan: bulat(rateCard.reduce((s2, rc) => s2 + rc.hargaBulan, 0)),
    margin: totBiayaRc > 0 ? bulat(totHargaRc / totBiayaRc - 1, 4) : 0,                 // markup gabungan
    gpPersen: totHargaRc > 0 ? bulat(1 - totBiayaRc / totHargaRc, 4) : 0 };              // GP% gabungan atas pendapatan

  // Tarif storage alternatif (per m², ton, CBM, liter) dari harga storage yang sama
  const st = rateCard.find(rc => rc.bucket === 'storage');
  const storageAlternatif = st ? [
    { uom: 'palet posisi', tarif: st.tarifPerUnit },
    { uom: 'm²', tarif: roundupHarga(st.hargaBulan / Math.max(1, space.totalM2)) },
    ...(t.stokTon ? [{ uom: 'kg', tarif: roundupHarga(st.hargaBulan / (t.stokTon * 1000)) }] : []),
    ...(t.stokCbm ? [{ uom: 'CBM', tarif: roundupHarga(st.hargaBulan / t.stokCbm) }] : []),
    ...(t.stokLiter ? [{ uom: 'liter', tarif: roundupHarga(st.hargaBulan / t.stokLiter) }] : []),
  ] : [];

  // ---- 12. Ringkasan & simulasi ----
  const totalBiaya = baris.reduce((sum, b) => sum + b.biayaBulan, 0);
  const pendapatan = (skenario: 'komitmenBulan' | 'rataRataBulan' | 'peakBulan') => rateCard.reduce((sum, rc) => {
    const v = volArus(bucketKeArus[rc.bucket]);
    // Volume dalam UoM tarif: proporsional terhadap volume arus (palet→case/pcs/CBM/ton), kecuali basis tetap (m², stok rata-rata)
    const vol = rc.volumeTetap ? rc.volumeTarif : (v ? v[skenario] : 0) * rc.rasioUom;
    return sum + rc.tarifPerUnit * vol;
  }, 0);
  const simulasi = (['komitmenBulan', 'rataRataBulan', 'peakBulan'] as const).map(sk => {
    const rev = pendapatan(sk) * (1 - pphRate);          // pendapatan bersih setelah PPh 23 dipotong customer (PPN bukan pendapatan)
    return { skenario: sk === 'komitmenBulan' ? 'Volume komitmen' : sk === 'rataRataBulan' ? 'Volume rata-rata' : 'Volume peak',
      pendapatanBulan: bulat(rev), invoiceInclPpn: bulat(pendapatan(sk) * (1 + ppn)), ppnBulan: bulat(pendapatan(sk) * ppn), biayaBulan: bulat(totalBiaya), gp: bulat(rev - totalBiaya), gpPersen: rev > 0 ? bulat((rev - totalBiaya) / rev, 4) : 0 };
  });
  const gpKomitmen = simulasi[0].gpPersen;
  if (gpKomitmen < m.finance.gpMinimum)
    flags.push({ level: 'kritis', kode: 'GP_RENDAH', pesan: `GP pada volume komitmen ${(gpKomitmen * 100).toFixed(1)}% di bawah batas ${(m.finance.gpMinimum * 100).toFixed(1)}%.` });
  if (m.statusUpah.startsWith('Asumsi'))
    flags.push({ level: 'peringatan', kode: 'UMK_ASUMSI', pesan: `UMK ${t.kabKota} masih asumsi = UMP; verifikasi ke SK sebelum quotation final.` });
  for (const item of m.hargaKedaluwarsa ?? [])
    flags.push({ level: 'peringatan', kode: 'HARGA_KEDALUWARSA', pesan: `Harga "${item}" sudah lewat masa berlaku.` });

  // Opex vs capex vs interest cost
  for (const b of baris) b.jenis = b.kelompok === 'Interest cost' || b.kelompok === 'Finance' ? 'interest' : nilaiModal.has(b.deskripsi) ? 'capex' : 'opex';
  const perJenis = { opex: 0, capex: 0, interest: 0 };
  for (const b of baris) perJenis[b.jenis!] = bulat(perJenis[b.jenis!] + b.biayaBulan);
  const perKelompok: Record<string, number> = {};
  for (const b of baris) perKelompok[b.kelompok] = bulat((perKelompok[b.kelompok] ?? 0) + b.biayaBulan);

  return {
    kalender: { ...kal, hariOperasionalBulan: bulat(kal.hariOperasionalBulan, 2), faktorPengganti: bulat(kal.faktorPengganti, 4) },
    processDesign: pd,
    volume, space, aktivitas: aktivitasHasil, manpower: payroll, eskalasiManpower, paramBiayaMp: paramMp, mhe,
    totalHeadcount: payroll.reduce((sum, p) => sum + p.headcount, 0),
    sumberPinjaman, interestCost, perJenis,
    biaya: baris, perKelompok, totalBiayaBulan: bulat(totalBiaya), investasi: bulat(investasi),
    biayaPerBucket: biayaBucket, rateCard, marginTotal, pajak: { ...pajak, pphPersen: pphRate }, storageAlternatif, simulasi,
    redFlags: flags,
  };
}

export type HasilTender = ReturnType<typeof hitungTender>;

/** Biaya 1 orang per bulan dari UMK × faktor jabatan + BPJS + THR + pesangon + tunjangan (+ contingency & fee bila outsourcing). */
export function biayaPerOrangDari(m: MasterData, j: JobLevel | undefined) {
  const P = m.payroll;
  const upah = m.upahMinimum * (j?.faktorUmk ?? 1);
  const bpjsTk = upah * (P.bpjsJht + P.bpjsJkk + P.bpjsJkm) + Math.min(upah, P.batasUpahJp) * P.bpjsJp;
  const bpjsKes = Math.min(upah, P.batasUpahKes) * P.bpjsKes;
  const thr = upah * P.thr;
  const pesangon = upah * P.pesangon;
  const dasar = upah + bpjsTk + bpjsKes + thr + pesangon + (j?.tunjanganBulan ?? 0);
  const contingency = j?.isOutsourcing ? dasar * P.contingencyOs : 0;
  const fee = j?.isOutsourcing ? (dasar + contingency) * P.feeOs : 0;
  return { upah, bpjsTk, bpjsKes, thr, pesangon, tunjangan: j?.tunjanganBulan ?? 0, contingency, fee, total: dasar + contingency + fee };
}

/** Opsi UoM untuk tarif layanan — volume per bulan dalam tiap UoM. */
export function opsiUomRateCard(b: string, v: { uom: string; konversi?: { uom1: string; per1: number; uom2: string; per2: number } } | undefined, komitmen: number,
  luasM2: number, kp?: { cbmPerPalet: number; tonPerPalet: number }, stok?: { ton?: number; cbm?: number; liter?: number }) {
  const out: { uom: string; volume: number; dasar: string; tetap?: boolean }[] = [];
  const u = v?.uom ?? 'unit';
  out.push({ uom: u, volume: komitmen, dasar: `volume komitmen ${u}` });
  const k = v?.konversi;
  const isPalet = /^pal(l)?et$/i.test(u);
  if (k && k.per1 > 0 && k.uom1) out.push({ uom: k.uom1, volume: komitmen * k.per1, dasar: `${u} × ${k.per1} ${k.uom1}` });
  if (k && k.per1 > 0 && k.per2 > 0 && k.uom2) out.push({ uom: k.uom2, volume: komitmen * k.per1 * k.per2, dasar: `${u} × ${k.per1} × ${k.per2} ${k.uom2}` });
  if (b === 'storage') {
    if (luasM2 > 0) out.push({ uom: 'm²', volume: luasM2, dasar: 'luas gudang (m²)', tetap: true });
    if (stok?.cbm) out.push({ uom: 'CBM', volume: stok.cbm, dasar: 'stok rata-rata (CBM)', tetap: true });
    else if (isPalet && kp?.cbmPerPalet) out.push({ uom: 'CBM', volume: komitmen * kp.cbmPerPalet, dasar: `palet × ${kp.cbmPerPalet} CBM` });
    if (stok?.ton) out.push({ uom: 'ton', volume: stok.ton, dasar: 'stok rata-rata (ton)', tetap: true });
    else if (isPalet && kp?.tonPerPalet) out.push({ uom: 'ton', volume: komitmen * kp.tonPerPalet, dasar: `palet × ${kp.tonPerPalet} ton` });
    if (stok?.liter) out.push({ uom: 'liter', volume: stok.liter, dasar: 'stok rata-rata (liter)', tetap: true });
  } else if (isPalet && kp) {
    if (kp.cbmPerPalet) out.push({ uom: 'CBM', volume: komitmen * kp.cbmPerPalet, dasar: `palet × ${kp.cbmPerPalet} CBM` });
    if (kp.tonPerPalet) out.push({ uom: 'ton', volume: komitmen * kp.tonPerPalet, dasar: `palet × ${kp.tonPerPalet} ton` });
  }
  // Berat dipakai dalam kg (bukan ton)
  for (const o of out) if (o.uom === 'ton') { o.uom = 'kg'; o.volume *= 1000; o.dasar = o.dasar.replace(/ton/g, 'kg').replace(/× ([\d.,]+) kg/, (_m, x) => `× ${(Number(String(x).replace(',', '.')) * 1000).toLocaleString('id-ID')} kg`); }
  const seen = new Set<string>();
  return out.filter(o => { const key = o.uom.toLowerCase(); if (seen.has(key) || !(o.volume > 0)) return false; seen.add(key); return true; });
}

/** Daftar standar satuan tarif untuk dropdown rate card. */
export const UOM_TARIF_STANDAR = ['palet', 'case', 'karton', 'pcs', 'm²', 'CBM', 'kg', 'liter', 'bag', 'pack', 'roll', 'order', 'line', 'unit'];

const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** Skema kenaikan mengikuti kebijakan upah: naik setiap JANUARI (UMK baru) sebesar r, bertingkat tiap tahun.
 *  Mulai kontrak 'YYYY-MM' (default Januari tahun berjalan). Indeks tahun kalender ke-k sejak mulai = (1+r)^k.
 *  Faktor = Σ (bulan × indeks) ÷ total bulan kontrak → biaya/bln rata-rata selama kontrak. */
export function hitungEskalasi(persenTahun: number, kontrakBulan: number, mulai?: string | null) {
  const r = Math.max(0, Number(persenTahun) || 0);
  const n = Math.max(1, Math.round(kontrakBulan || 1));
  const cocok = /^(\d{4})-(\d{2})/.exec(mulai ?? '');
  const y0 = cocok ? Number(cocok[1]) : new Date().getFullYear();
  const m0 = cocok ? Math.min(12, Math.max(1, Number(cocok[2]))) : 1;
  const tahun: { tahun: number; ke: number; bulan: number; indeks: number; dari: string; sampai: string }[] = [];
  for (let k = 0; k < n; k++) {
    const idx = m0 - 1 + k, th = y0 + Math.floor(idx / 12), bl = idx % 12;
    let e = tahun[tahun.length - 1];
    if (!e || e.tahun !== th) { e = { tahun: th, ke: th - y0, bulan: 0, indeks: Math.pow(1 + r, th - y0), dari: `${BLN[bl]} ${th}`, sampai: '' }; tahun.push(e); }
    e.bulan++; e.sampai = `${BLN[bl]} ${th}`;
  }
  const faktor = tahun.reduce((s, y) => s + y.bulan * y.indeks, 0) / n;
  return { persenTahun: r, kontrakBulan: n, mulai: `${y0}-${String(m0).padStart(2, '0')}`, tahun, faktor };
}
