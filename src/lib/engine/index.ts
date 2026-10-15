// Mesin hitung cost model gudang.
// Alur: kalender → volume desain (peak) → space → manpower (per shift × shift)
// → MHE → payroll → biaya (fasilitas, utilitas, CAPEX, startup, finance, overhead)
// → alokasi ke aktivitas → harga per kategori risiko → rate card → red flag.

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
  Startup: 'Tinggi', Finance: 'Rendah', Overhead: 'Rendah', Lainnya: 'Sedang',
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
  const step = x < 1000 ? 10 : 100;
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
  const luasPalet = s.palletPanjangM * s.palletLebarM;
  const m2PerPP = (luasPalet * (1 + s.faktorAisle)) / Math.max(1, s.levelSimpan);
  const storageM2 = ppDesain * m2PerPP;
  const stagingIn = ((volArus('inbound')?.desainPerShift ?? 0) / Math.max(1, s.sequencePerShift)) * s.stagingM2PerPalet;
  const stagingOut = ((volArus('outbound')?.desainPerShift ?? 0) / Math.max(1, s.sequencePerShift)) * s.stagingM2PerPalet;
  const subtotalM2 = storageM2 + stagingIn + stagingOut + s.fasilitasM2;
  const totalM2 = Math.ceil(subtotalM2 * (1 + s.allowancePersen));
  const space = {
    ppDesain, m2PerPP: bulat(m2PerPP, 3), storageM2: bulat(storageM2, 1),
    stagingInM2: bulat(stagingIn, 1), stagingOutM2: bulat(stagingOut, 1),
    fasilitasM2: s.fasilitasM2, allowanceM2: bulat(totalM2 - subtotalM2, 1), totalM2,
    posisiRak: s.metodeSimpan === 'block' ? 0 : Math.ceil(ppDesain),
  };
  if (s.luasCadM2 && Math.abs(totalM2 - s.luasCadM2) / s.luasCadM2 > 0.05)
    flags.push({ level: 'peringatan', kode: 'CAD_GAP', pesan: `Luas hitung ${totalM2} m² berbeda >5% dari CAD ${s.luasCadM2} m².` });

  // ---- 4. Manpower direct (UC13) — jam per shift dipool per role ----
  const jobs = new Map<string, JobLevel>(m.jobLevels.map(j => [j.roleName, j]));
  type RoleAgg = { jamPerShift: number; jamPerArus: Record<Arus, number> };
  const perRole = new Map<string, RoleAgg>();
  const perTool = new Map<string, { jamPerShift: number; jamPerArus: Record<Arus, number> }>();
  const aktivitasHasil = t.aktivitas.map(a => {
    const v = volArus(a.arus);
    const volPerShift = (v?.arus === 'storage'
      ? (v.peakBulan / kal.hariOperasionalBulan) / t.jumlahShift   // aktivitas storage (cycle count) dihitung per hari
      : (v?.desainPerShift ?? 0)) * a.persenVolume * a.pengaliUom;
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
  let directPerShift = 0;
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
  if (t.spanOfControl > 0 && directPerShift > 0) {
    const spvPerShift = Math.ceil(directPerShift / t.spanOfControl);
    manpower.push({ roleName: t.roleSupervisor, jenis: 'Indirect', jamPerShift: 0, mpPerShift: spvPerShift,
      headcount: Math.ceil(spvPerShift * t.jumlahShift * kal.faktorPengganti - 1e-9), utilisasi: 1,
      alokasi: normalisasi(undefined, { handling_in: 0.4, handling_out: 0.4, storage: 0.2 }) });
  }
  for (const p of t.peranTetap) {
    manpower.push({ roleName: p.roleName, jenis: 'Tetap', jamPerShift: 0, mpPerShift: 0, headcount: p.qty, utilisasi: 1,
      alokasi: normalisasi(p.alokasi, { manajemen: 1 }) });
  }

  // ---- 5. MHE ----
  const mhe = t.mhe.map(x => {
    const jam = perTool.get(x.tool)?.jamPerShift ?? 0;
    const unitDasar = Math.ceil(jam / (t.jamEfektifPerShift * x.ketersediaan) - 1e-9);   // alat dipakai bergantian antar shift
    const spare = unitDasar > 0 ? Math.ceil(unitDasar * x.sparePersen - 1e-9) : 0;
    const arusJam = perTool.get(x.tool)?.jamPerArus ?? { inbound: 0, outbound: 0, storage: 0, vas: 0 };
    const alok = kosongAlokasi();
    for (const a of Object.keys(arusJam) as Arus[]) alok[ARUS_KE_BUCKET[a]] = jam > 0 ? arusJam[a] / jam : 0;
    return { ...x, jamPerShift: bulat(jam, 2), unit: unitDasar + spare, unitDasar, spare, alokasi: alok };
  });
  for (const tool of perTool.keys())
    if (!t.mhe.some(x => x.tool === tool) && !['RF', 'PC', 'HPT', 'Hand Pallet', 'Hand Wrapper'].includes(tool))
      flags.push({ level: 'peringatan', kode: 'MHE_TANPA_HARGA', pesan: `Tool "${tool}" dipakai aktivitas tetapi belum ada harga MHE.` });

  // ---- 6. Payroll (UC1–UC3) ----
  const P = m.payroll;
  const biayaPerOrang = (j: JobLevel | undefined) => {
    const upah = m.upahMinimum * (j?.faktorUmk ?? 1);
    const bpjsTk = upah * (P.bpjsJht + P.bpjsJkk + P.bpjsJkm) + Math.min(upah, P.batasUpahJp) * P.bpjsJp;
    const bpjsKes = Math.min(upah, P.batasUpahKes) * P.bpjsKes;
    const thr = upah * P.thr;
    const pesangon = upah * P.pesangon;
    const dasar = upah + bpjsTk + bpjsKes + thr + pesangon + (j?.tunjanganBulan ?? 0);
    const contingency = j?.isOutsourcing ? dasar * P.contingencyOs : 0;
    const fee = j?.isOutsourcing ? (dasar + contingency) * P.feeOs : 0;
    return { upah, bpjsTk, bpjsKes, thr, pesangon, tunjangan: j?.tunjanganBulan ?? 0, contingency, fee, total: dasar + contingency + fee };
  };
  const payroll = manpower.map(mp => {
    const b = biayaPerOrang(jobs.get(mp.roleName));
    return { ...mp, ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, bulat(v)])), biayaBulan: bulat(b.total * mp.headcount) };
  });

  // ---- 7. Baris biaya ----
  const r = m.finance.bungaModalTahun / 12;
  const n = t.durasiKontrakBulan;
  const baris: BiayaBaris[] = [];
  const tambah = (deskripsi: string, kelompok: Kelompok, biayaBulan: number, alokasi: Record<Bucket, number>, dasar: string, risiko?: KategoriRisiko) => {
    if (biayaBulan <= 0) return;
    baris.push({ deskripsi, kelompok, kategoriRisiko: risiko ?? RISIKO_DEFAULT[kelompok], biayaBulan: bulat(biayaBulan), alokasi, dasar });
  };
  // biaya beli: depresiasi selama min(umur, kontrak) + bunga atas rata-rata nilai buku
  const capex = (deskripsi: string, kelompok: Kelompok, nilai: number, umur: number | undefined, alokasi: Record<Bucket, number>, risiko?: KategoriRisiko) => {
    const u = umur && umur > 0 ? umur : n;
    const periode = Math.min(u, n);
    if (u > n) flags.push({ level: 'peringatan', kode: 'UMUR_GT_KONTRAK', pesan: `${deskripsi}: umur ${u} bln > kontrak ${n} bln — disusutkan penuh selama kontrak (customer menanggung seluruh nilai). Kalau aset akan dipakai ulang setelah kontrak, pertimbangkan umur penuh.` });
    tambah(`${deskripsi} — depresiasi`, kelompok, nilai / periode, alokasi, `Rp${bulat(nilai).toLocaleString('id-ID')} ÷ ${periode} bln`, risiko);
    tambah(`${deskripsi} — bunga modal`, 'Finance', (nilai / 2) * r, alokasi, `rata-rata nilai buku × ${(m.finance.bungaModalTahun * 100).toFixed(1)}%/thn`);
    return nilai;
  };
  let investasi = 0;

  for (const p of payroll) tambah(`Manpower — ${p.roleName} (${p.headcount} org)`, 'Manpower', p.biayaBulan, p.alokasi,
    `${p.headcount} org × Rp${Math.round(p.biayaBulan / Math.max(1, p.headcount)).toLocaleString('id-ID')}`);

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
  if (s.metodeSimpan !== 'block' && s.hargaRakPerPosisi)
    investasi += capex('Racking', 'Racking', space.posisiRak * s.hargaRakPerPosisi, s.umurRakBulan, alokStorage);

  // Listrik
  const kwhBulan = t.listrik.reduce((sum, l) => sum + l.watt * l.qty * l.jamPerHari, 0) * kal.hariOperasionalBulan / 1000;
  tambah('Listrik', 'Utilitas', kwhBulan * t.tarifListrikKwh, normalisasi(undefined, { storage: 0.6, handling_in: 0.2, handling_out: 0.2 }),
    `${bulat(kwhBulan).toLocaleString('id-ID')} kWh × Rp${t.tarifListrikKwh}`);

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
      tambah(`${c.deskripsi} — bunga`, 'Finance', (nilai / 2) * r, alok, 'rata-rata saldo × bunga');
      investasi += nilai;
    }
  }

  // ---- 8. Biaya modal (usulan UC #3) ----
  if (sewaBulan > 0 && t.advanceSewaBulan > 0) {
    let totalBunga = 0;
    for (let k = 0; k < t.advanceSewaBulan; k++) totalBunga += sewaBulan * (t.advanceSewaBulan - k) * r;
    tambah('Bunga advance payment sewa', 'Finance', totalBunga / n, alokStorage, `${t.advanceSewaBulan} bln dibayar di muka, saldo menurun × ${(m.finance.bungaModalTahun * 100).toFixed(1)}%`);
  }
  if (sewaBulan > 0 && t.depositBulan > 0)
    tambah('Bunga deposit sewa', 'Finance', sewaBulan * t.depositBulan * r, alokStorage, `${t.depositBulan} bln deposit × bunga`);
  const subtotalOperasi = baris.reduce((sum, b) => sum + b.biayaBulan, 0);
  const selisihHari = t.paymentTermHari - m.finance.apHari;
  if (selisihHari > 0)
    tambah('Bunga working capital', 'Finance', subtotalOperasi * (selisihHari / 30) * r,
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
  for (const risk of ['Rendah', 'Sedang', 'Tinggi'] as KategoriRisiko[]) {
    const man = biayaBucket.manajemen[risk];
    for (const b of opsBuckets) {
      const porsi = Object.values(biayaBucket[b]).reduce((a, c) => a + c, 0) / totOps;
      biayaBucket[b][risk] += man * porsi;
    }
    biayaBucket.manajemen[risk] = 0;
  }

  // ---- 11. Harga & rate card ----
  const g = m.finance.pphGrossUp;
  const bucketKeArus: Record<string, Arus> = { storage: 'storage', handling_in: 'inbound', handling_out: 'outbound', vas: 'vas' };
  const rateCard = opsBuckets.map(b => {
    const biaya = Object.values(biayaBucket[b]).reduce((a, c) => a + c, 0);
    const hargaSebelumPph = (['Rendah', 'Sedang', 'Tinggi'] as KategoriRisiko[]).reduce((sum, k) => sum + biayaBucket[b][k] * (1 + m.margin[k]), 0);
    const harga = hargaSebelumPph / (1 - g);
    const v = volArus(bucketKeArus[b]);
    const komitmen = v?.komitmenBulan ?? 0;
    if (biaya > 0 && komitmen <= 0) flags.push({ level: 'kritis', kode: 'KOMITMEN_NOL', pesan: `Biaya ${b} ada tetapi volume komitmen ${bucketKeArus[b]} = 0, tarif tidak bisa dihitung.` });
    const tarif = komitmen > 0 ? harga / komitmen : 0;
    return {
      bucket: b, uom: v?.uom ?? '-', biayaBulan: bulat(biaya), hargaBulan: bulat(harga),
      marginEfektif: biaya > 0 ? bulat(hargaSebelumPph / biaya - 1, 4) : 0,
      volumeKomitmen: komitmen, biayaPerUnit: komitmen > 0 ? bulat(biaya / komitmen, 2) : 0,
      tarifPerUnit: roundupHarga(tarif),
    };
  }).filter(rc => rc.biayaBulan > 0);

  // Tarif storage alternatif (per m², ton, CBM, liter) dari harga storage yang sama
  const st = rateCard.find(rc => rc.bucket === 'storage');
  const storageAlternatif = st ? [
    { uom: 'palet posisi', tarif: st.tarifPerUnit },
    { uom: 'm²', tarif: roundupHarga(st.hargaBulan / Math.max(1, space.totalM2)) },
    ...(t.stokTon ? [{ uom: 'ton', tarif: roundupHarga(st.hargaBulan / t.stokTon) }] : []),
    ...(t.stokCbm ? [{ uom: 'CBM', tarif: roundupHarga(st.hargaBulan / t.stokCbm) }] : []),
    ...(t.stokLiter ? [{ uom: 'liter', tarif: roundupHarga(st.hargaBulan / t.stokLiter) }] : []),
  ] : [];

  // ---- 12. Ringkasan & simulasi ----
  const totalBiaya = baris.reduce((sum, b) => sum + b.biayaBulan, 0);
  const pendapatan = (skenario: 'komitmenBulan' | 'rataRataBulan' | 'peakBulan') => rateCard.reduce((sum, rc) => {
    const v = volArus(bucketKeArus[rc.bucket]);
    return sum + rc.tarifPerUnit * (v ? v[skenario] : 0);
  }, 0);
  const simulasi = (['komitmenBulan', 'rataRataBulan', 'peakBulan'] as const).map(sk => {
    const rev = pendapatan(sk) * (1 - g);                // pendapatan bersih setelah PPh dipotong
    return { skenario: sk === 'komitmenBulan' ? 'Volume komitmen' : sk === 'rataRataBulan' ? 'Volume rata-rata' : 'Volume peak',
      pendapatanBulan: bulat(rev), biayaBulan: bulat(totalBiaya), gp: bulat(rev - totalBiaya), gpPersen: rev > 0 ? bulat((rev - totalBiaya) / rev, 4) : 0 };
  });
  const gpKomitmen = simulasi[0].gpPersen;
  if (gpKomitmen < m.finance.gpMinimum)
    flags.push({ level: 'kritis', kode: 'GP_RENDAH', pesan: `GP pada volume komitmen ${(gpKomitmen * 100).toFixed(1)}% di bawah batas ${(m.finance.gpMinimum * 100).toFixed(1)}%.` });
  if (m.statusUpah.startsWith('Asumsi'))
    flags.push({ level: 'peringatan', kode: 'UMK_ASUMSI', pesan: `UMK ${t.kabKota} masih asumsi = UMP; verifikasi ke SK sebelum quotation final.` });
  for (const item of m.hargaKedaluwarsa ?? [])
    flags.push({ level: 'peringatan', kode: 'HARGA_KEDALUWARSA', pesan: `Harga "${item}" sudah lewat masa berlaku.` });

  const perKelompok: Record<string, number> = {};
  for (const b of baris) perKelompok[b.kelompok] = bulat((perKelompok[b.kelompok] ?? 0) + b.biayaBulan);

  return {
    kalender: { ...kal, hariOperasionalBulan: bulat(kal.hariOperasionalBulan, 2), faktorPengganti: bulat(kal.faktorPengganti, 4) },
    volume, space, aktivitas: aktivitasHasil, manpower: payroll, mhe,
    totalHeadcount: payroll.reduce((sum, p) => sum + p.headcount, 0),
    biaya: baris, perKelompok, totalBiayaBulan: bulat(totalBiaya), investasi: bulat(investasi),
    biayaPerBucket: biayaBucket, rateCard, storageAlternatif, simulasi,
    redFlags: flags,
  };
}

export type HasilTender = ReturnType<typeof hitungTender>;
