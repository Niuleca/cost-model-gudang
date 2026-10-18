// Tipe data mesin hitung cost model gudang.
// Semua nilai uang dalam Rupiah per bulan kecuali disebut lain.
// Persentase disimpan sebagai pecahan (0.07 = 7%).

export type Arus = 'inbound' | 'outbound' | 'storage' | 'vas';
export type Bucket = 'storage' | 'handling_in' | 'handling_out' | 'vas' | 'manajemen';
export type KategoriRisiko = 'Rendah' | 'Sedang' | 'Tinggi';
export type Kelompok =
  | 'Manpower' | 'Fasilitas' | 'Utilitas' | 'MHE' | 'Racking' | 'IT'
  | 'Office' | 'Consumable' | 'HSE' | 'Asuransi' | 'Startup' | 'Finance' | 'Overhead' | 'Lainnya';

export interface VolumeInput {
  arus: Arus;
  uom: string;              // palet, karton, pcs, ton, cbm, ...
  rataRataBulan: number;
  peakBulan: number;        // dipakai untuk sizing
  komitmenBulan: number;    // dipakai untuk billing (MGV)
  /** Isi per UoM: 1 [uom] = per1 [uom1]; 1 [uom1] = per2 [uom2]. Mis. 1 palet = 40 case, 1 case = 24 pcs. */
  konversi?: { uom1: string; per1: number; uom2: string; per2: number };
}

/** Faktor konversi dari UoM volume arus ke UoM lain (1 bila sama, null bila tidak dikenal). */
export function faktorUom(v: VolumeInput | undefined, uom: string): number | null {
  if (!v) return null;
  // case = karton = dus = carton = ctn dianggap sama
  const n = (x: string) => { const y = x.trim().toLowerCase(); return ['case', 'karton', 'dus', 'carton', 'ctn', 'box'].includes(y) ? 'case' : ['pcs', 'pc', 'piece', 'unit', 'ea'].includes(y) ? 'pcs' : y; };
  if (n(v.uom) === n(uom)) return 1;
  const k = v.konversi;
  if (!k) return null;
  if (k.uom1 && n(k.uom1) === n(uom) && k.per1 > 0) return k.per1;
  if (k.uom2 && n(k.uom2) === n(uom) && k.per1 > 0 && k.per2 > 0) return k.per1 * k.per2;
  return null;
}

/** Pengali efektif aktivitas: pengali manual bila ≠ 1; bila 1 dan UoM aktivitas beda dari UoM arus → pakai konversi Volume. */
export function pengaliEfektif(a: { uom: string; pengaliUom: number }, v: VolumeInput | undefined): number {
  const p = a.pengaliUom || 1;
  if (p !== 1) return p;
  return faktorUom(v, a.uom) ?? 1;
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
}

export interface PeranTetap {
  roleName: string;
  qty: number;              // headcount total (bukan per shift)
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
  /** Startup & implementation otomatis (biaya sekali, diamortisasi selama kontrak). */
  startupAuto?: { aktif: boolean; persenOpex: number; persenManpower: number };
  /** Biaya per orang per bulan diisi manual (lama — tidak dipakai lagi). */
  biayaOrangManual?: Record<string, number>;
  /** Rincian biaya manpower per role (format sheet) + parameter BPJS/THR/kompensasi/management fee. */
  rincianBiayaMp?: Record<string, import('./biayaMp').InputBiayaRole>;
  paramBiayaMp?: Partial<import('./biayaMp').ParamBiayaMp>;
  levelGaji?: Partial<Record<import('./biayaMp').LevelJabatan, number>>;
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
}
