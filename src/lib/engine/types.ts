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
}

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
  spanOfControl: number;            // 1 supervisor per N direct per shift
  roleSupervisor: string;
  faktorProduktivitas: number;      // 0.95
  efisiensi: number;                // 0.90
  space: SpaceInput;
  mhe: MheInput[];
  costLines: CostLineInput[];
  listrik: ListrikInput[];
  tarifListrikKwh: number;
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
