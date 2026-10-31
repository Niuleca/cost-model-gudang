// Desain gudang tanpa project: data tender contoh (ilustratif, bukan data pelanggan) supaya editor, 3D Leca dan simulasi
// tetap bisa berjalan, plus gedung kosong berukuran bebas (dock, staging, jalur utama, area rak adaptif opsional).
import { hitungTender, type MasterData, type TenderInput } from '@/lib/engine/index';
import { ASUMSI_DEFAULT, type TenderRow } from '@/lib/tender';
import { komponenBaru, ringkas, uid, type Komponen, type LayoutEdit } from './editor';
import { paramAwal, susunLayout, type ParamSim } from './layout';

export const ID_PRIBADI = '__pribadi__';

const TEMPLATE: TenderInput = {
  customer: 'Desain tanpa project', provinsi: 'DKI Jakarta', kabKota: 'Kota Jakarta Utara', tahun: 2026,
  durasiKontrakBulan: 24, jumlahShift: 1, jamEfektifPerShift: 7, hariKerjaPerMinggu: 5, cutiTahunanHari: 12,
  skenarioAset: 'Rental', paymentTermHari: 30,
  volumes: [
    { arus: 'storage', uom: 'palet', rataRataBulan: 1500, peakBulan: 1800, komitmenBulan: 1500 },
    { arus: 'inbound', uom: 'palet', rataRataBulan: 1200, peakBulan: 1500, komitmenBulan: 1200 },
    { arus: 'outbound', uom: 'palet', rataRataBulan: 1200, peakBulan: 1500, komitmenBulan: 1200 },
  ],
  aktivitas: [
    { aktivitas: 'Unload palet dari truk', tahap: 'Inbound', tool: 'CBT', roleName: 'Operator Forklift', uom: 'palet', prodPerJam: 25, arus: 'inbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Cek palet inbound', tahap: 'Inbound', tool: 'RF', roleName: 'Checker', uom: 'palet', prodPerJam: 40, arus: 'inbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Put away ke rak', tahap: 'Putaway', tool: 'RT', roleName: 'Operator Reach Truck', uom: 'palet', prodPerJam: 20, arus: 'inbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Picking palet', tahap: 'Picking', tool: 'RT', roleName: 'Operator Reach Truck', uom: 'palet', prodPerJam: 20, arus: 'outbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Cek outbound', tahap: 'Outbound', tool: 'RF', roleName: 'Checker', uom: 'palet', prodPerJam: 40, arus: 'outbound', persenVolume: 1, pengaliUom: 1 },
    { aktivitas: 'Loading palet ke truk', tahap: 'Outbound', tool: 'CBT', roleName: 'Operator Forklift', uom: 'palet', prodPerJam: 25, arus: 'outbound', persenVolume: 1, pengaliUom: 1 },
  ],
  peranTetap: [{ roleName: 'Admin Gudang', qty: 1, alokasi: { handling_in: 0.5, handling_out: 0.5 } }],
  spanOfControl: 15, roleSupervisor: 'Supervisor', faktorProduktivitas: 0.95, efisiensi: 0.9,
  space: { metodeSimpan: 'spr', palletPanjangM: 1.2, palletLebarM: 1.0, levelSimpan: 5, faktorAisle: 0.6,
    stagingM2PerPalet: 1.8, sequencePerShift: 2, fasilitasM2: 40, allowancePersen: 0.1, tarifSewaM2Bulan: 55000, luasCadM2: 1500 },
  mhe: [
    { tool: 'CBT', nama: 'Forklift Counterbalance 2,5T', mode: 'sewa', harga: 19000000, ketersediaan: 0.85, sparePersen: 0 },
    { tool: 'RT', nama: 'Reach Truck 1,6T', mode: 'sewa', harga: 28000000, ketersediaan: 0.85, sparePersen: 0 },
  ],
  costLines: [], listrik: [], tarifListrikKwh: 1114.74, advanceSewaBulan: 12, depositBulan: 1, stokTon: 0,
};

const MASTER: MasterData = {
  upahMinimum: 5396761, statusUpah: 'contoh',
  jobLevels: [
    { roleName: 'Operator Forklift', klasifikasi: 'Blue Collar', faktorUmk: 1.05, tunjanganBulan: 200000, isOutsourcing: true },
    { roleName: 'Operator Reach Truck', klasifikasi: 'Blue Collar', faktorUmk: 1.05, tunjanganBulan: 200000, isOutsourcing: true },
    { roleName: 'Checker', klasifikasi: 'Blue Collar', faktorUmk: 1, tunjanganBulan: 0, isOutsourcing: true },
    { roleName: 'Admin Gudang', klasifikasi: 'White Collar', faktorUmk: 1.1, tunjanganBulan: 0, isOutsourcing: true },
    { roleName: 'Supervisor', klasifikasi: 'White Collar', faktorUmk: 1.6, tunjanganBulan: 500000, isOutsourcing: false },
  ],
  holidays: [],
  payroll: { bpjsJht: 0.037, bpjsJkk: 0.0089, bpjsJkm: 0.003, bpjsJp: 0.02, bpjsKes: 0.04, batasUpahJp: 10547400, batasUpahKes: 12000000, thr: 1 / 12, pesangon: 0.08, contingencyOs: 0.07, feeOs: 0.05 },
  finance: { bungaModalTahun: 0.1, apHari: 30, overheadPersen: 0.03, pphGrossUp: 0.02, gpMinimum: 0.08 },
  margin: { Rendah: 0.08, Sedang: 0.12, Tinggi: 0.18 },
};

/** Data pengganti tender (contoh) untuk desain tanpa project. tinggiM = tinggi sisi gedung (menentukan jumlah level rak). */
export function dataTanpaProject(tinggiM = 10) {
  const c = TEMPLATE;
  const t = {
    id: ID_PRIBADI, kode: '', customer: 'Desain tanpa project', industri: null, provinsi: c.provinsi, kab_kota: c.kabKota, alamat_lokasi: null,
    tipe_gudang: 'Ambient', skema: 'Dedicated', skenario_aset: c.skenarioAset, durasi_kontrak_bulan: c.durasiKontrakBulan, tanggal_go_live: '2026-01-05',
    jumlah_shift: c.jumlahShift, jam_kerja_per_shift: 8, jam_efektif_per_shift: c.jamEfektifPerShift, hari_kerja_per_minggu: 5,
    payment_term_hari: c.paymentTermHari, status: 'draft', versi: 1, updated_at: '2026-01-01', warehouse_id: null, pic: null, alasan_hasil: null, tanggal_keputusan: null, hasil: null,
    asumsi: { ...ASUMSI_DEFAULT, volumes: c.volumes, aktivitas: c.aktivitas, peranTetap: c.peranTetap, faktorProduktivitas: c.faktorProduktivitas, efisiensi: c.efisiensi, mhe: c.mhe, space: { ...ASUMSI_DEFAULT.space, ...c.space } },
  } as unknown as TenderRow;
  const h = hitungTender(c, MASTER);
  const p: ParamSim = { ...paramAwal(t, h), sideMm: Math.round(tinggiM * 1000), centerMm: Math.round(tinggiM * 1000) + 2000 };
  const auto = susunLayout(t, h, { param: p });
  return { t, h, p, auto };
}

export interface SpekGedungBaru { L: number; W: number; tinggi: number; dockIn: number; dockOut: number; isiRak: boolean }
export const GEDUNG_BARU: SpekGedungBaru = { L: 60, W: 30, tinggi: 10, dockIn: 2, dockOut: 2, isiRak: true };

const r2 = (v: number) => Math.round(v * 100) / 100;
/** Gedung kosong: dock in/out di dinding depan, staging in/out, jalur utama, dan (opsional) area rak adaptif seluruh gudang. */
export function layoutKosong(p: ParamSim, tinggiPalet: number, s: SpekGedungBaru): LayoutEdit {
  const L = Math.max(10, s.L), W = Math.max(8, s.W);
  const nIn = Math.max(1, Math.round(s.dockIn)), nOut = Math.max(1, Math.round(s.dockOut));
  const jarak = Math.min(4, (W - 1) / (nIn + nOut));
  const k: Komponen[] = [];
  for (let i = 0; i < nIn; i++) k.push({ id: uid(), jenis: 'dock', label: 'Dock IN', x: 0, z: r2(0.5 + i * jarak), w: 0.3, d: r2(Math.min(3.2, jarak - 0.3)), tinggi: 4.2, arus: 'inbound' });
  for (let i = 0; i < nOut; i++) k.push({ id: uid(), jenis: 'dock', label: 'Dock OUT', x: 0, z: r2(W - 0.5 - (i + 1) * jarak + 0.3), w: 0.3, d: r2(Math.min(3.2, jarak - 0.3)), tinggi: 4.2, arus: 'outbound' });
  const zBatas = r2(W * (nIn / (nIn + nOut)));
  k.push({ id: uid(), jenis: 'stagingIn', label: 'Staging inbound', x: 3.5, z: 0, w: 4, d: zBatas, tinggi: 0, palet: 20, tumpuk: 1 });
  k.push({ id: uid(), jenis: 'stagingOut', label: 'Staging outbound', x: 3.5, z: zBatas, w: 4, d: r2(W - zBatas), tinggi: 0, palet: 20, tumpuk: 1 });
  k.push({ id: uid(), jenis: 'jalur', label: 'Jalur utama', x: 7.5, z: 0, w: 3.5, d: W, tinggi: 0 });
  if (s.isiRak) {
    const [a] = komponenBaru('areaRak', p, { x: 0, z: 0 }, tinggiPalet);
    k.push({ ...a, label: 'Area rak adaptif', x: 0, z: 0, w: L, d: W,
      area: { ...a.area!, mode: 'adaptif', crossAwal: 0, crossAkhir: 0, kelonggaran: 0.1, bebasRintangan: 0.3, bebasDinding: 0.5, rak: { ...a.area!.rak, lebarLorong: Math.max(3.4, a.area!.rak.lebarLorong) } } });
  }
  const e: LayoutEdit = { versi: 1, gedung: { L, W, sideMm: Math.round(s.tinggi * 1000), centerMm: Math.round(s.tinggi * 1000) + 2000 }, komponen: k, ukur: [], latar: null, okupansi: null, stokDesain: 0, tinggiPalet };
  return { ...e, stokDesain: Math.round(ringkas(e).totalRak * 0.85) };
}
