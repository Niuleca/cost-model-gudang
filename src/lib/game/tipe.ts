// Leca Game · tipe data simulasi inti (tanpa Three.js / React — bisa diuji di Node).
// Waktu = detik game sejak hari 0 pukul 00.00. Satu hari = 86.400 detik.

export const HARI = 86400;
export const JAM = 3600;

export type JenisTugas = 'admin_in' | 'bongkar' | 'cek_in' | 'putaway' | 'admin_out' | 'pick_palet' | 'pick_karton' | 'pack' | 'cek_out' | 'muat';
export type Kemampuan = 'admin' | 'checker' | 'operator' | 'picker' | 'tkbm';
export type Satuan = 'palet' | 'karton' | 'dokumen';

export interface Sku {
  id: string; kode: string; nama: string;
  kartonPerPalet: number;
  kontrol: 'none' | 'expiry';
  umurHari: number;            // umur simpan sejak produksi (untuk FEFO)
  kelas: 'A' | 'B' | 'C';
  bobot: number;               // porsi permintaan
}

export interface Lokasi {
  id: string; kode: string;
  tipe: 'rak' | 'lantai' | 'staging_in' | 'staging_out' | 'rusak';
  kapasitas: number;           // palet
  x: number; z: number; y: number;
  lpn: string[];
  dipesan: number;             // slot yang sudah dipesan tugas putaway
}

export type StatusLpn = 'diterima' | 'disimpan' | 'dipick' | 'dimuat' | 'rusak';
export interface Lpn {
  id: string; lokasi: string; sku: string; lot: string;
  expiry: number | null;       // hari ke- (game) kedaluwarsa
  karton: number;              // isi sekarang
  dialokasi: number;           // karton yang sudah dialokasi ke order
  status: StatusLpn;
  terima: number;              // waktu diterima (FIFO)
  order?: string;              // LPN outbound: milik order ini
}

export type TipeTxn = 'receive' | 'putaway' | 'move' | 'pick' | 'ship' | 'damage' | 'opening';
export interface Txn { t: number; tipe: TipeTxn; sku: string; lot: string; karton: number; lpn: string; dari?: string; ke?: string; ref?: string }

export interface BarisAsn { sku: string; lot: string; expiry: number | null; karton: number }
export interface Truk {
  id: string; arus: 'inbound' | 'outbound';
  rencanaTiba: number; tiba: number;
  dock: string | null;
  status: 'dijadwalkan' | 'antre' | 'di_dock' | 'berangkat';
  palet: BarisAsn[];                       // inbound: isi per palet
  order: string[];                         // outbound: order yang dimuat
  sisaTugas: number;
  berangkat?: number;
}

export interface BarisOrder { sku: string; karton: number; teralokasi: number; terpick: number }
export type StatusOrder = 'baru' | 'teralokasi' | 'dipick' | 'di_staging' | 'dimuat' | 'terkirim' | 'batal';
export interface Order {
  id: string; dibuat: number; batas: number;
  baris: BarisOrder[];
  status: StatusOrder;
  truk: string | null;
  sisaPick: number; kartonLepas: number; paletEq: number;
  selesai?: number; tepatWaktu?: boolean; kurang: number;   // karton yang tidak tersedia
  /** waktu tiap tahap (untuk pelacakan order) */
  jejak?: { dipick?: number; staging?: number; dimuat?: number; terkirim?: number };
}

export type StatusTugas = 'menunggu' | 'jalan' | 'selesai';
export interface Tugas {
  id: string; jenis: JenisTugas; qty: number; satuan: Satuan;
  prioritas: number;                        // makin kecil makin dulu (batas waktu)
  status: StatusTugas;
  lpn?: string; order?: string; truk?: string; ke?: string; barisAsn?: BarisAsn;
  pekerja?: string; mhe?: string; mulai?: number; selesai?: number; durasi?: number;
  dibuat: number;
}

export interface Pekerja { id: string; nama: string; role: string; kemampuan: Kemampuan | null; shift: number; sibuk: string | null; absen: boolean; biayaBulan: number; jamKerja: number }
export interface Mhe { id: string; nama: string; jenis: 'reach' | 'forklift' | 'stacker' | 'hpt'; sibuk: string | null; jamKerja: number }

/** luar = tidak ada aktivitas ini di tender → dikerjakan pihak luar (sopir/vendor), tidak memakai pekerja & MHE gudang. */
export interface Produktivitas { prod: number; satuan: Satuan; sumber: string; luar?: boolean }

export interface Tarif {
  storagePerPaletBulan: number; inboundPerPalet: number; outboundPerPalet: number; tetapBulan: number;
  catatan: string[];
}

/** Skenario = data awal satu permainan (dari project tender Leca atau contoh). */
export interface Skenario {
  nama: string; pelanggan: string; sumber: 'tender' | 'contoh'; tenderId?: string;
  mulai: string;                            // tanggal ISO hari 0
  modal: number;
  seed: number;
  shift: { jumlah: number; mulaiJam: number; jamKerja: number };
  hariKerja: number[];                      // 0 = Minggu … 6 = Sabtu
  sku: Sku[];
  lokasi: Lokasi[];
  dockIn: number; dockOut: number;
  pekerja: Omit<Pekerja, 'sibuk' | 'absen' | 'jamKerja'>[];
  mhe: Omit<Mhe, 'sibuk' | 'jamKerja'>[];
  prod: Record<JenisTugas, Produktivitas>;
  faktor: number;                           // faktor produktivitas × efisiensi
  permintaan: { paletInHari: number; paletOutHari: number; orderHari: number; paletPerTruk: number; cutoffJam: number; slaJam: number;
    /** porsi baris order yang berisi karton lepas (sisanya palet utuh) */ porsiKartonLepas: number;
    /** truk outbound tiba sekian jam sebelum batas kirim */ trukOutJamSebelum: number };
  stokAwal: number;                         // palet
  tarif: Tarif;
  biaya: { tetapBulan: number; rincian: { nama: string; bulan: number }[] };
  termBayarHari: number;
  peluang: { trukTerlambat: number; rusakPerPalet: number; absenPerOrang: number; klaimPerPaletRusak: number };
  asumsi: string[];
}

export interface LaporanHarian {
  hari: number; tanggal: string; operasi: boolean;
  paletMasuk: number; paletKeluarEq: number; kartonKeluar: number;
  orderSelesai: number; orderTepat: number; orderTerlambat: number; orderTertunda: number; kartonKurang: number;
  pendapatan: number; biaya: number; laba: number; kas: number;
  stokPalet: number; utilisasi: number; tugasTertunda: number; paletRusak: number;
  kejadian: string[];
}

export interface Dunia {
  sk: Skenario;
  t: number;
  rng: () => number;
  sku: Map<string, Sku>;
  lokasi: Map<string, Lokasi>;
  lpn: Map<string, Lpn>;
  lpnPerSku: Map<string, Set<string>>;
  ledger: Txn[];
  saldo: Map<string, number>;               // karton per SKU (turunan ledger)
  truk: Map<string, Truk>;
  antreDock: { inbound: string[]; outbound: string[] };
  dock: { id: string; arus: 'inbound' | 'outbound'; truk: string | null }[];
  order: Map<string, Order>;
  tugas: Map<string, Tugas>;
  menunggu: Set<string>;
  pekerja: Pekerja[];
  mhe: Mhe[];
  antrian: AntrianEvent;
  seq: number;
  kas: number;
  piutang: { jatuhTempo: number; nilai: number; ket: string }[];
  akrual: { pendapatan: number; biaya: number };          // bulan berjalan
  hariIni: Omit<LaporanHarian, 'hari' | 'tanggal' | 'operasi' | 'pendapatan' | 'biaya' | 'laba' | 'kas' | 'stokPalet' | 'utilisasi' | 'tugasTertunda'> & { pendapatan: number; biaya: number };
  laporan: LaporanHarian[];
  hariKasNegatif: number;
  bangkrut: boolean;
  pelanggaran: string[];
}

export interface EventSim { t: number; seq: number; jenis: 'truk_tiba' | 'tugas_selesai' | 'shift' | 'order_baru' | 'akhir_hari' | 'awal_hari' | 'bayar'; ref?: string }
export interface AntrianEvent { push: (e: EventSim) => void; pop: () => EventSim | undefined; peek: () => EventSim | undefined; size: () => number }
