// Tipe data mesin hitung cost model gudang.
// Semua nilai uang dalam Rupiah per bulan kecuali disebut lain.
// Persentase disimpan sebagai pecahan (0.07 = 7%).

export type Arus = 'inbound' | 'outbound' | 'storage' | 'vas';
export type Bucket = 'storage' | 'handling_in' | 'handling_out' | 'vas' | 'manajemen';
export type KategoriRisiko = 'Rendah' | 'Sedang' | 'Tinggi';
export type Kelompok =
  | 'Manpower' | 'Fasilitas' | 'Utilitas' | 'MHE' | 'Racking' | 'IT'
  | 'Office' | 'Consumable' | 'HSE' | 'Asuransi' | 'Startup' | 'Finance' | 'Interest cost' | 'Overhead' | 'Lainnya';

export interface VolumeInput {
  arus: Arus;
  uom: string;              // palet, karton, pcs, ton, cbm, ...
  rataRataBulan: number;
  peakBulan: number;        // dipakai untuk sizing
  komitmenBulan: number;    // dipakai untuk billing (MGV)
  /** Isi per UoM: 1 [uom] = per1 [uom1]; 1 [uom1] = per2 [uom2]. Mis. 1 palet = 40 case, 1 case = 24 pcs. */
  konversi?: { uom1: string; per1: number; uom2: string; per2: number; paletIsi?: number }; // paletIsi: isi [UoM baris] per palet (case / kemasan / pcs)
  /** Parameter muatan tender (runtime, tidak disimpan): disisipkan oleh volumeEfektif(…, muatan) supaya konversi CBM/ton/kg ↔ palet konsisten di semua hitungan. */
  muatan?: Partial<Muatan>;
}

// ---------------------------------------------------------------------------------------------------------
// KONVERSI UoM TERPADU
// Satu jalur: [UoM volume] → palet ekuivalen → semua UoM lain (case, pcs, kg, ton, CBM, liter).
// Faktor per baris (tab Volume): 1 palet = paletIsi [UoM baris] (kemasan) atau 1 palet = per1 [uom1] (baris palet);
// isi kecil: 1 [kemasan] = per2 [uom2]. Faktor ukuran/berat per palet & per case dari Parameter muatan (tab Volume / Produk).
// ---------------------------------------------------------------------------------------------------------
export interface Muatan { cbmPerPalet: number; tonPerPalet: number; literPerPalet?: number; cbmPerCase?: number; kgPerCase?: number }
export const MUATAN_DEFAULT: Muatan = { tonPerPalet: 0.8, cbmPerPalet: 1.5, cbmPerCase: 0.04, kgPerCase: 12 };
export type KelasUom = 'palet' | 'case' | 'kemasan' | 'pcs' | 'kg' | 'ton' | 'cbm' | 'liter' | 'transaksi' | 'lain';
const U_CASE = ['case', 'karton', 'dus', 'carton', 'ctn', 'box', 'cs'];
const U_PCS = ['pcs', 'pc', 'piece', 'unit', 'ea', 'each', 'botol', 'kaleng', 'sachet', 'set', 'pair', 'pasang', 'lembar', 'sheet'];
const U_KEMASAN = ['bag', 'sak', 'karung', 'pail', 'drum', 'ibc', 'pack', 'roll', 'inner', 'bale', 'bal', 'bundle', 'jumbo_bag', 'jumbo bag', 'fibc', 'crate', 'reel', 'coil', 'tote', 'jerrycan', 'jerigen', 'tray', 'krat'];
const U_TRANS = ['order', 'line', 'lokasi', 'sku', 'do', 'trip', 'shipment', 'dokumen', 'container', 'kontainer', 'truk', 'event'];
/** Kelas satuan: menentukan cara dikonversi. */
export function kelasUom(u: string | undefined): KelasUom {
  const x = (u ?? '').trim().toLowerCase().replace(/³/g, '3');
  if (/^pal(l)?et(s)?$|^plt$/.test(x)) return 'palet';
  if (U_CASE.includes(x)) return 'case';
  if (U_PCS.includes(x)) return 'pcs';
  if (['kg', 'kgs', 'kilogram'].includes(x)) return 'kg';
  if (['ton', 'tonne', 'mt', 't'].includes(x)) return 'ton';
  if (['cbm', 'm3', 'kubik'].includes(x)) return 'cbm';
  if (['liter', 'litre', 'l', 'ltr'].includes(x)) return 'liter';
  if (U_KEMASAN.includes(x)) return 'kemasan';
  if (U_TRANS.some(t => x === t || x.startsWith(t + ' '))) return 'transaksi';
  return 'lain';
}
const muatanOk = (m?: Partial<Muatan> | null): Muatan => ({ ...MUATAN_DEFAULT, ...Object.fromEntries(Object.entries(m ?? {}).filter(([, v]) => Number(v) > 0)) } as Muatan);
const n = (x: unknown) => (Number(x) > 0 ? Number(x) : 0);

export interface UraiUom {
  palet: number | null; case: number | null; pcs: number | null; kg: number | null; cbm: number | null; liter: number | null;
  /** palet: true = dari isian baris / satuan ukur (bukan perkiraan) */
  paletPasti: boolean;
  /** catatan cara hitung & kekurangan data (untuk ditampilkan) */
  dasar: string[]; kurang: string[];
}
/** Pecah qty sebuah baris volume ke semua UoM. null = tidak bisa dihitung (data kurang / satuan transaksi). */
export function uraiUom(v: Pick<VolumeInput, 'uom' | 'konversi' | 'muatan'> | undefined, qty: number, muatan?: Partial<Muatan> | null): UraiUom {
  const m = muatanOk(muatan ?? v?.muatan);
  const q = Math.max(0, Number(qty) || 0);
  const out: UraiUom = { palet: null, case: null, pcs: null, kg: null, cbm: null, liter: null, paletPasti: false, dasar: [], kurang: [] };
  if (!v) return out;
  const kl = kelasUom(v.uom), k = v.konversi;
  const isi = n(k?.paletIsi);                                           // [UoM baris] per palet (kemasan / case / pcs)
  const cppEst = n(m.cbmPerCase) > 0 ? Math.floor(m.cbmPerPalet / n(m.cbmPerCase)) : 0;
  // isi palet untuk baris palet: 1 palet = per1 case
  const cppPalet = kl === 'palet' && k && n(k.per1) && kelasUom(k.uom1) === 'case' ? n(k.per1) : 0;
  // isi kecil (pcs) per kemasan / case
  const kecil = k && n(k.per2) && k.uom2 ? { per: n(k.per2), kls: kelasUom(k.uom2), uom: k.uom2 } : null;
  switch (kl) {
    case 'palet': out.palet = q; out.paletPasti = true; break;
    case 'cbm': out.palet = q / m.cbmPerPalet; out.cbm = q; out.paletPasti = true; out.dasar.push(`${m.cbmPerPalet} CBM/palet`); break;
    case 'kg': out.palet = q / (m.tonPerPalet * 1000); out.kg = q; out.paletPasti = true; out.dasar.push(`${Math.round(m.tonPerPalet * 1000)} kg/palet`); break;
    case 'ton': out.palet = q / m.tonPerPalet; out.kg = q * 1000; out.paletPasti = true; out.dasar.push(`${Math.round(m.tonPerPalet * 1000)} kg/palet`); break;
    case 'liter':
      if (n(m.literPerPalet)) { out.palet = q / n(m.literPerPalet); out.paletPasti = true; out.dasar.push(`${m.literPerPalet} liter/palet`); }
      else out.kurang.push('isi "Isi cair per palet" di Parameter muatan');
      out.liter = q; break;
    case 'case':
      out.case = q;
      if (isi) { out.palet = q / isi; out.paletPasti = true; out.dasar.push(`1 palet = ${isi} ${v.uom}`); }
      else if (cppEst) { out.palet = q / cppEst; out.dasar.push(`perkiraan ${cppEst} ${v.uom}/palet (${m.cbmPerPalet} ÷ ${m.cbmPerCase} CBM)`); out.kurang.push(`isi "1 palet = … ${v.uom}" agar pasti`); }
      else out.kurang.push(`isi "1 palet = … ${v.uom}"`);
      break;
    case 'kemasan': case 'pcs':
      if (isi) { out.palet = q / isi; out.paletPasti = true; out.dasar.push(`1 palet = ${isi} ${v.uom}`); }
      else if (kecil?.kls === 'kg') { out.palet = (q * kecil.per) / (m.tonPerPalet * 1000); out.dasar.push(`perkiraan dari berat ${kecil.per} kg/${v.uom}`); out.kurang.push(`isi "1 palet = … ${v.uom}" agar pasti`); }
      else out.kurang.push(`isi "1 palet = … ${v.uom}"`);
      if (kl === 'pcs') out.pcs = q;
      break;
    case 'transaksi': out.dasar.push(`${v.uom} = satuan transaksi (bukan barang fisik), tidak dikonversi`); break;
    default: out.kurang.push(`satuan "${v.uom}" belum dikenal — pilih dari daftar`);
  }
  const P = out.palet;
  if (P != null) {
    if (out.cbm == null) out.cbm = P * m.cbmPerPalet;
    if (out.kg == null) out.kg = P * m.tonPerPalet * 1000;
    if (out.liter == null && n(m.literPerPalet)) out.liter = P * n(m.literPerPalet);
    if (out.case == null && kl !== 'kemasan' && kl !== 'pcs' && kl !== 'transaksi') {   // bag / drum / pcs bukan case
      const cpp = cppPalet || cppEst;
      if (cpp) { out.case = P * cpp; if (!cppPalet) out.dasar.push(`case: perkiraan ${cpp}/palet`); }
    }
  }
  // pcs: dari isi kecil per case/kemasan, atau baris palet (1 palet = per1 case, 1 case = per2 pcs)
  if (out.pcs == null && kecil && kecil.kls === 'pcs') {
    if ((kl === 'case' || kl === 'kemasan')) out.pcs = q * kecil.per;
    else if (kl === 'palet' && cppPalet) out.pcs = q * cppPalet * kecil.per;
    else if (out.case != null) out.pcs = out.case * kecil.per;
  }
  if (out.liter == null && kecil?.kls === 'liter' && (kl === 'case' || kl === 'kemasan')) out.liter = q * kecil.per;
  return out;
}

/** Faktor konversi dari UoM volume arus ke UoM lain (1 bila sama, null bila tidak bisa dihitung). */
export function faktorUom(v: VolumeInput | undefined, uom: string, muatan?: Partial<Muatan> | null): number | null {
  if (!v) return null;
  const a = kelasUom(v.uom), b = kelasUom(uom);
  const sama = (x: string) => x.trim().toLowerCase();
  if (sama(v.uom) === sama(uom) || (a === b && (a === 'case' || a === 'pcs' || a === 'palet' || a === 'cbm' || a === 'kg' || a === 'ton' || a === 'liter'))) return 1;
  const k = v.konversi;
  // rantai isian baris: 1 [uom] = per1 [uom1]; 1 [uom1] = per2 [uom2]
  if (k?.uom1 && sama(k.uom1) === sama(uom) && n(k.per1) && a === 'palet') return n(k.per1);
  if (k?.uom2 && (sama(k.uom2) === sama(uom) || (kelasUom(k.uom2) === b && b === 'pcs')) && n(k.per2)) {
    if (a === 'case' || a === 'kemasan') return n(k.per2);
    if (a === 'palet' && n(k.per1)) return n(k.per1) * n(k.per2);
  }
  if (k?.uom1 && kelasUom(k.uom1) === b && b === 'case' && a === 'palet' && n(k.per1)) return n(k.per1);
  if (a === 'transaksi' || b === 'transaksi') return null;
  // lewat palet ekuivalen (satuan ukur / isi per palet / parameter muatan)
  const u = uraiUom(v, 1, muatan);
  const tgt = b === 'palet' ? u.palet : b === 'case' ? u.case : b === 'pcs' ? u.pcs : b === 'kg' ? u.kg : b === 'ton' ? (u.kg != null ? u.kg / 1000 : null)
    : b === 'cbm' ? u.cbm : b === 'liter' ? u.liter : null;
  return tgt != null && tgt > 0 ? tgt : null;
}

/** Volume dalam palet ekuivalen (UoM apa pun → palet). ok = dari isian / satuan ukur, bukan perkiraan atau 1:1. */
export function paletEkuivalen(v: VolumeInput | undefined, basis: 'peakBulan' | 'rataRataBulan' | 'komitmenBulan' = 'peakBulan', muatan?: Partial<Muatan> | null): { palet: number; ok: boolean } {
  if (!v) return { palet: 0, ok: false };
  const u = uraiUom(v, Number(v[basis]) || 0, muatan);
  return { palet: u.palet ?? 0, ok: u.palet != null && u.paletPasti };
}

/** Pengali efektif aktivitas: pengali manual bila ≠ 1; bila 1 dan UoM aktivitas beda dari UoM arus → pakai konversi Volume. */
export function pengaliEfektif(a: { uom: string; pengaliUom: number }, v: VolumeInput | undefined, muatan?: Partial<Muatan> | null): number {
  const p = a.pengaliUom || 1;
  if (p !== 1) return p;
  return faktorUom(v, a.uom, muatan) ?? 1;
}

export interface AktivitasInput {
  aktivitas: string;
  tahap: string;
  tool: string;             // Manual, CBT, RT, HPT, RF, PC ...
  roleName: string;         // harus ada di master jobLevels
  uom: string;              // uom produktivitas
  prodPerJam: number;
  arus: Arus;
  persenVolume: number;     // porsi volume arus yang melewati aktivitas
  pengaliUom: number;       // konversi uom arus -> uom aktivitas
  alatTambahan?: string[];  // alat pendukung (mis. Scanner RDT) — dihitung FTE-nya di process design
  volumeManual?: number | null; // override volume per bulan (sebelum %); kosong = peak arus × pengali
  nonaktif?: boolean;       // dimatikan di VSM Map (tidak dihitung biaya / manpower / MHE)
  porsiMuat?: { proses: 'unloading' | 'putaway' | 'replenishment' | 'picking' | 'loading'; muat: 'palet' | 'loose' | 'semua' }; // % volume ikut porsi palletize/loose
}

/** Volume efektif: Peak kosong → rata-rata (lalu komitmen); Komitmen kosong → rata-rata (lalu peak). Input asli tidak diubah. */
export function volumeEfektif<V extends { rataRataBulan: number; peakBulan: number; komitmenBulan: number }>(vs: V[], muatan?: Partial<Muatan> | null): V[] {
  return (vs ?? []).map(v => {
    const avg = Number(v.rataRataBulan) || 0, pk = Number(v.peakBulan) || 0, km = Number(v.komitmenBulan) || 0;
    return { ...v, peakBulan: pk > 0 ? pk : avg > 0 ? avg : km, komitmenBulan: km > 0 ? km : avg > 0 ? avg : pk, ...(muatan ? { muatan } : {}) };
  });
}

/** Headcount peran tetap: qty total, atau qty per shift × shift aktif */
export const headcountTetap = (p: { qty: number; perShift?: boolean }, shiftAktif: number) =>
  Math.max(0, Number(p.qty) || 0) * (p.perShift ? Math.max(1, shiftAktif) : 1);
/** Role yang wajar dipakai sebagai supervisor (span of control) */
export const isRoleSupervisor = (nama: string) => /\b(spv|supervisor|leader|koordinator|coordinator|kepala|ka\b|manager|foreman|head|chief|mandor)/i.test(nama ?? '');

export interface PeranTetap {
  roleName: string;
  qty: number;              // headcount total; bila perShift = true → orang per shift (× shift aktif)
  perShift?: boolean;
  alat?: string[];          // alat pendukung per orang (mis. PC, HT) — masuk MHE Summary: unit = headcount
  alokasi?: Partial<Record<Bucket, number>>;
}

export interface SpaceInput {
  metodeSimpan: 'block' | 'spr' | 'dd' | 'shelving';
  palletPanjangM: number;
  palletLebarM: number;
  levelSimpan: number;            // tumpukan (block) atau level rak
  faktorAisle: number;            // tambahan area gang terhadap footprint palet, mis. 1.0 = +100%
  stagingM2PerPalet: number;      // termasuk ruang manuver
  sequencePerShift: number;       // berapa kali staging terisi-kosong per shift
  fasilitasM2: number;            // office, charging, toilet, mushola
  allowancePersen: number;        // fire lane, kolom, dll
  tarifSewaM2Bulan: number;       // dipakai kalau skenario Rental
  hargaRakPerPosisi?: number;     // beli rak (CAPEX) kalau metode rak
  umurRakBulan?: number;
  luasCadM2?: number;             // untuk rekonsiliasi dengan layout CAD
  luasTersediaM2?: number;        // luas gudang terpilih (master gudang Procurement)
  sewaTetapBulan?: number;        // sewa gudang utuh per bulan (bila disewa per unit, bukan per m²)
  namaGudang?: string;
  excel?: import('./space').SpaceExcel;   // kebutuhan space format Excel (dipakai mesin hitung)
  /** Harga rak per jenis (dari Price Inquiry kategori Racking); posisi diambil dari sheet Space (SPR / DDR). */
  rak?: { spr?: RakHarga; ddr?: RakHarga };
  tarifManual?: boolean;          // true = tarif sewa diisi manual, tidak mengikuti database gudang
}
export interface RakHarga { priceItemId?: number; nama?: string; harga: number; umurBulan: number }

export interface MheInput {
  tool: string;                   // harus sama dengan AktivitasInput.tool
  nama: string;
  mode: 'sewa' | 'beli';
  harga: number;                  // sewa per bulan atau harga beli
  umurBulan?: number;
  ketersediaan: number;           // 0.85 = 85% jam efektif bisa dipakai (charging, servis)
  sparePersen: number;
}

export interface CostLineInput {
  deskripsi: string;
  kelompok: Kelompok;
  mode: 'bulanan' | 'sewa' | 'beli' | 'sekali';
  qty: number;
  hargaSatuan: number;
  umurBulan?: number;
  kategoriRisiko?: KategoriRisiko;
  alokasi?: Partial<Record<Bucket, number>>;
  sumber?: string;
}

export interface ListrikInput {
  item: string;
  watt: number;
  qty: number;
  jamPerHari: number;
}

export interface TenderInput {
  customer: string;
  provinsi: string;
  kabKota: string;
  tahun: number;
  durasiKontrakBulan: number;
  jumlahShift: number;
  jamEfektifPerShift: number;
  hariKerjaPerMinggu: 5 | 6 | 7;
  cutiTahunanHari: number;          // default 12
  skenarioAset: 'Rental' | 'Own Asset' | 'Built-to-Suit';
  paymentTermHari: number;
  volumes: VolumeInput[];
  aktivitas: AktivitasInput[];
  peranTetap: PeranTetap[];
  alatSupervisor?: string[];   // alat pendukung per supervisor (unit = jumlah supervisor)
  spanOfControl: number;            // 1 supervisor per N direct per shift
  roleSupervisor: string;
  faktorProduktivitas: number;      // 0.95
  efisiensi: number;                // 0.90
  space: SpaceInput;
  mhe: MheInput[];
  costLines: CostLineInput[];
  listrik: ListrikInput[];
  tarifListrikKwh: number;
  /** Biaya listrik per bulan dari simulasi Utilities (Price Inquiry). Bila diisi, menggantikan perhitungan per peralatan. */
  listrikSimulasi?: { id: string; nama: string; totalBulan: number; kwhBulan: number } | null;
  /** Perlakuan pajak di tarif: PPh 23 di-gross-up (include) atau tidak (exclude); PPN termasuk di tarif (include) atau ditambahkan terpisah (exclude). */
  pajak?: { pph: 'include' | 'exclude'; ppn: 'include' | 'exclude'; ppnPersen: number };
  /** Margin (markup atas biaya) per layanan, diinput user. Kosong = margin default per kategori risiko (master Finance). */
  marginManual?: Partial<Record<Bucket, number | null>>;
  /** Layanan utama yang dijual; 'termasuk' = tidak ditagih terpisah, biayanya dipindah ke layanan lain yang dijual (proporsional biaya). */
  layananJual?: Partial<Record<Bucket, 'jual' | 'termasuk'>>;
  /** Tarif tambahan / additional charges (per karton, per pcs, movement, VAS, lembur, dll.) — tidak mengubah biaya & rate card utama. */
  tarifTambahan?: TarifTambahanInput[];
  /** Matriks pembagian biaya per kategori (Fasilitas, Manpower, MHE, …) ke layanan; kategori yang diisi menggantikan alokasi per baris. Pecahan, total 1. */
  alokasiKategori?: Partial<Record<string, Partial<Record<Bucket, number>> | null>>;
  /** Startup & implementation otomatis (biaya sekali, diamortisasi selama kontrak). */
  startupAuto?: { aktif: boolean; persenOpex: number; persenManpower: number };
  /** Biaya per orang per bulan diisi manual (lama — tidak dipakai lagi). */
  biayaOrangManual?: Record<string, number>;
  /** Rincian biaya manpower per role (format sheet) + parameter BPJS/THR/kompensasi/management fee. */
  rincianBiayaMp?: Record<string, import('./biayaMp').InputBiayaRole>;
  paramBiayaMp?: Partial<import('./biayaMp').ParamBiayaMp>;
  levelGaji?: Partial<Record<import('./biayaMp').LevelJabatan, number>>;
  /** UoM tarif per layanan di rate card (palet, case, pcs, CBM, ton, m²). Kosong = UoM volume arus. */
  uomRateCard?: Partial<Record<Bucket, string>>;
  /** Satuan tarif manual per layanan (mis. container, event) + volume per bulan (komitmen) yang diisi sendiri. */
  uomManual?: Partial<Record<Bucket, { uom: string; volume: number }>>;
  /** Jumlah hari per bulan untuk tarif storage harian (per palet/hari dst.), default 30. */
  hariTarifHarian?: number;
  /** Revisi manual biaya/bln per baris rincian (kunci = deskripsi baris). */
  revisiBiaya?: Record<string, number>;
  interestCost?: InterestCost;
  /** Konversi palet → CBM/ton untuk opsi UoM rate card (dari parameter profil order). */
  konversiPalet?: Partial<Muatan>;
  levelRole?: Record<string, import('./biayaMp').LevelJabatan>;
  /** Kenaikan biaya manpower per tahun kontrak (0.05 = 5%/thn). Biaya/bln = total kontrak ÷ bulan kontrak. */
  eskalasiManpower?: { persenTahun: number; mulai?: string | null };
  advanceSewaBulan: number;
  depositBulan: number;
  stokTon?: number;                 // untuk tarif storage alternatif
  stokCbm?: number;
  stokLiter?: number;
  metodeManpower?: 'excel' | 'shift';   // excel = Process Design (FTE per bulan), shift = jam per shift
  processDesign?: import('./processDesign').ProcessDesignInput;
}

export interface JobLevel {
  roleName: string;
  klasifikasi: 'Blue Collar' | 'White Collar';
  faktorUmk: number;
  tunjanganBulan: number;
  isOutsourcing: boolean;
}

export interface MasterData {
  upahMinimum: number;
  statusUpah: string;               // status verifikasi UMK
  jobLevels: JobLevel[];
  holidays: { tanggal: string; nama: string }[];
  payroll: {
    bpjsJht: number; bpjsJkk: number; bpjsJkm: number; bpjsJp: number; bpjsKes: number;
    batasUpahJp: number; batasUpahKes: number;
    thr: number; pesangon: number; contingencyOs: number; feeOs: number;
  };
  finance: {
    bungaModalTahun: number;        // cost of capital
    apHari: number;                 // hari bayar ke vendor
    overheadPersen: number;
    pphGrossUp: number;             // 0.02 PPh 23
    gpMinimum: number;              // batas red flag GP
  };
  margin: Record<KategoriRisiko, number>;
  hargaKedaluwarsa?: string[];      // nama item yang lewat masa berlaku
}

export interface RedFlag {
  level: 'kritis' | 'peringatan' | 'info';
  kode: string;
  pesan: string;
}

export interface BiayaBaris {
  deskripsi: string;
  kelompok: Kelompok;
  kategoriRisiko: KategoriRisiko;
  biayaBulan: number;
  alokasi: Record<Bucket, number>;
  dasar: string;                    // penjelasan rumus singkat (ketertelusuran)
  /** Diisi bila biaya/bln baris ini direvisi manual: nilai hitungan sistem sebelum direvisi. */
  biayaSistem?: number;
  /** opex = biaya operasional; capex = depresiasi/amortisasi investasi; interest = bunga yang dipilih (Interest cost) */
  jenis?: 'opex' | 'capex' | 'interest';
  /** Capex: nilai investasi (harga beli / biaya sekali) yang disusutkan / diamortisasi. */
  nilaiInvestasi?: number;
}

/** Simulasi pinjaman bank: pokok pinjaman × bunga → interest cost masuk ke biaya. */
export interface InterestItem {
  id: string;
  /** Deskripsi baris biaya sumber (mis. "Sewa gudang — X", "Racking SPR (… posisi) — depresiasi"); kosong = baris manual. */
  sumber?: string;
  deskripsi: string;
  /** Pokok pinjaman (Rp). Kosong = default: nilai capex, atau biaya/bln × 12 untuk biaya bulanan. */
  pokok?: number | null;
  /** Tenor pinjaman (bulan). Kosong = durasi kontrak. */
  tenorBulan?: number | null;
  aktif: boolean;
}
export interface InterestCost {
  bungaTahun: number;                 // 0.09 = 9%/thn
  metode: 'flat' | 'menurun';         // flat = bunga atas pokok penuh; menurun = pokok dicicil rata (bunga atas sisa pokok)
  items: InterestItem[];
  /** Ikutkan bunga working capital (payment term customer > AP hari) — default tidak. */
  workingCapital?: boolean;
}

/** Satu baris tarif tambahan. Dasar biaya: turunan = biaya layanan utama dalam satuan lain (mis. handling in per karton);
 *  aktivitas = menit per unit × (orang × tarif/jam × pengali + alat × tarif/jam) + material; manual = biaya per unit diisi;
 *  tarif = harga jual diisi langsung (biaya opsional, untuk melihat GP). */
export interface TarifTambahanInput {
  id: string; nama: string; satuan: string; dasar: 'turunan' | 'aktivitas' | 'manual' | 'tarif';
  /** Harga jual (excl. PPN) per unit diisi sendiri — dasar 'tarif', atau menimpa tarif default hasil hitungan di dasar lain */
  tarif?: number;
  bucket?: Bucket; uom?: string;
  menit?: number; orang?: number; alat?: boolean; pengali?: number; material?: number;
  biaya?: number; gp?: number | null; volumeBulan?: number; catatan?: string;
}
