import type { TenderInput, MasterData } from '../../src/lib/engine/index.ts';

// Contoh ilustratif (bukan data customer): gudang semen block stacking, 1 shift, Surabaya.
export const contohTender: TenderInput = {
  customer: 'Contoh — Semen Kemasan', provinsi: 'Jawa Timur', kabKota: 'Kota Surabaya', tahun: 2026,
  durasiKontrakBulan: 24, jumlahShift: 1, jamEfektifPerShift: 7, hariKerjaPerMinggu: 5, cutiTahunanHari: 12,
  skenarioAset: 'Rental', paymentTermHari: 60,
  volumes: [
    { arus: 'storage', uom: 'palet', rataRataBulan: 400, peakBulan: 480, komitmenBulan: 400 },
    { arus: 'inbound', uom: 'palet', rataRataBulan: 1200, peakBulan: 1500, komitmenBulan: 1200 },
    { arus: 'outbound', uom: 'palet', rataRataBulan: 1200, peakBulan: 1500, komitmenBulan: 1200 },
  ],
  aktivitas: [
    { aktivitas: 'Unload palet dari truk', tahap: 'Inbound', tool: 'CBT', roleName: 'Operator Forklift', uom: 'palet', prodPerJam: 25, arus: 'inbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Cek palet', tahap: 'Inbound', tool: 'RF', roleName: 'Checker', uom: 'palet', prodPerJam: 40, arus: 'inbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Putaway block stack', tahap: 'Putaway', tool: 'CBT', roleName: 'Operator Forklift', uom: 'palet', prodPerJam: 20, arus: 'inbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Picking palet', tahap: 'Picking', tool: 'CBT', roleName: 'Operator Forklift', uom: 'palet', prodPerJam: 20, arus: 'outbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Loading palet ke truk', tahap: 'Outbound', tool: 'CBT', roleName: 'Operator Forklift', uom: 'palet', prodPerJam: 25, arus: 'outbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Cek outbound', tahap: 'Outbound', tool: 'RF', roleName: 'Checker', uom: 'palet', prodPerJam: 40, arus: 'outbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Muat sak manual (TKBM)', tahap: 'Outbound', tool: 'Manual', roleName: 'TKBM', uom: 'bag', prodPerJam: 400, arus: 'outbound', persenVolume: 0.3, pengaliUom: 40 },
  ],
  peranTetap: [
    { roleName: 'Admin Gudang', qty: 1, alokasi: { handling_in: 0.5, handling_out: 0.5 } },
  ],
  spanOfControl: 15, roleSupervisor: 'Supervisor', faktorProduktivitas: 0.95, efisiensi: 0.9,
  space: { metodeSimpan: 'block', palletPanjangM: 1.2, palletLebarM: 1.0, levelSimpan: 2, faktorAisle: 0.6,
    stagingM2PerPalet: 1.8, sequencePerShift: 2, fasilitasM2: 40, allowancePersen: 0.1, tarifSewaM2Bulan: 55000, luasCadM2: 800 },
  mhe: [{ tool: 'CBT', nama: 'Forklift Counterbalance 2,5T', mode: 'sewa', harga: 19000000, ketersediaan: 0.85, sparePersen: 0 }],
  costLines: [
    { deskripsi: 'Laptop', kelompok: 'IT', mode: 'beli', qty: 2, hargaSatuan: 17500000, umurBulan: 36 },
    { deskripsi: 'Handheld scanner', kelompok: 'IT', mode: 'beli', qty: 2, hargaSatuan: 9980000, umurBulan: 36 },
    { deskripsi: 'Internet', kelompok: 'IT', mode: 'bulanan', qty: 1, hargaSatuan: 750000 },
    { deskripsi: 'Pest control umum', kelompok: 'HSE', mode: 'bulanan', qty: 1, hargaSatuan: 750000 },
    { deskripsi: 'Asuransi gudang & barang', kelompok: 'Asuransi', mode: 'bulanan', qty: 1, hargaSatuan: 2562500 },
    { deskripsi: 'APAR 6 kg', kelompok: 'HSE', mode: 'beli', qty: 8, hargaSatuan: 450000, umurBulan: 24 },
    { deskripsi: 'Implementasi & mob-demob', kelompok: 'Startup', mode: 'sekali', qty: 1, hargaSatuan: 30000000 },
  ],
  listrik: [
    { item: 'Lampu gudang LED 100W', watt: 100, qty: 24, jamPerHari: 10 },
    { item: 'Komputer', watt: 300, qty: 2, jamPerHari: 9 },
  ],
  tarifListrikKwh: 1114.74,
  advanceSewaBulan: 12, depositBulan: 1,
  stokTon: 480 * 2,
};

export const contohMaster: MasterData = {
  upahMinimum: 5288796, statusUpah: 'Media + no. SK',
  jobLevels: [
    { roleName: 'Operator Forklift', klasifikasi: 'Blue Collar', faktorUmk: 1.05, tunjanganBulan: 200000, isOutsourcing: true },
    { roleName: 'Checker', klasifikasi: 'Blue Collar', faktorUmk: 1, tunjanganBulan: 0, isOutsourcing: true },
    { roleName: 'TKBM', klasifikasi: 'Blue Collar', faktorUmk: 1, tunjanganBulan: 0, isOutsourcing: true },
    { roleName: 'Admin Gudang', klasifikasi: 'White Collar', faktorUmk: 1.1, tunjanganBulan: 0, isOutsourcing: true },
    { roleName: 'Supervisor', klasifikasi: 'White Collar', faktorUmk: 1.6, tunjanganBulan: 500000, isOutsourcing: false },
  ],
  holidays: [
    { tanggal: '2026-01-01', nama: 'Tahun Baru' }, { tanggal: '2026-05-01', nama: 'Hari Buruh' },
    { tanggal: '2026-08-17', nama: 'HUT RI' }, { tanggal: '2026-12-25', nama: 'Natal' },
  ],
  payroll: { bpjsJht: 0.037, bpjsJkk: 0.0089, bpjsJkm: 0.003, bpjsJp: 0.02, bpjsKes: 0.04,
    batasUpahJp: 10547400, batasUpahKes: 12000000, thr: 1 / 12, pesangon: 0.08, contingencyOs: 0.07, feeOs: 0.05 },
  finance: { bungaModalTahun: 0.1, apHari: 30, overheadPersen: 0.03, pphGrossUp: 0.02, gpMinimum: 0.08 },
  margin: { Rendah: 0.08, Sedang: 0.12, Tinggi: 0.18 },
};
