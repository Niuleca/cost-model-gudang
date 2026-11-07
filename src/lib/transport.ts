// Tender Transportation (rute darat) & Intermodal (3 stage: pickup → main leg laut/udara/kereta → delivery).
// Disimpan di tenders.asumsi.transport / tenders.asumsi.intermodal (jenis_tender = transportation / intermodal).
// Harga jual = harga beli × (1 + margin) — sama dengan mark-up di cost model gudang. GP% = (jual − beli) ÷ jual.
import { jarakKm } from './lokasiIndonesia.ts';

export type Moda = 'darat' | 'laut' | 'udara' | 'kereta';
export type Basis = 'trip' | 'cbm' | 'ton' | 'kg' | 'pallet' | 'liter' | 'container';

export const MODA: { v: Moda; l: string }[] = [{ v: 'darat', l: 'Darat (trucking)' }, { v: 'laut', l: 'Laut' }, { v: 'udara', l: 'Udara' }, { v: 'kereta', l: 'Kereta' }];
export const BASIS: { v: Basis; l: string }[] = [
  { v: 'trip', l: 'per trip' }, { v: 'cbm', l: 'per CBM' }, { v: 'ton', l: 'per ton' }, { v: 'pallet', l: 'per pallet' },
  { v: 'liter', l: 'per liter' }, { v: 'kg', l: 'per kg' }, { v: 'container', l: 'per container' },
];
/** Buying basis tender transport darat (sesuai UAT): per trip, per CBM, per ton, per pallet, per liter. */
export const BASIS_DARAT: Basis[] = ['trip', 'cbm', 'ton', 'pallet', 'liter'];
export const labelBasis = (b: Basis) => BASIS.find(x => x.v === b)?.l ?? b;

export interface Armada { nama: string; moda: Moda; kapKg: number; kapCbm: number; kapPalet: number; kapLiter?: number; rpPerKm?: number; ket: string }

/** Armada & kapasitas tipikal. Darat: kapasitas & tarif indikatif per km dari Deliveree (deliveree.com, jenis truk & kapasitas, 2026);
 *  Fuso & reefer = perkiraan. Container: ukuran ISO standar. */
export const ARMADA: Armada[] = [
  { nama: 'Blind Van', moda: 'darat', kapKg: 720, kapCbm: 3.8, kapPalet: 2, rpPerKm: 3150, ket: '220×135×130 cm · Rp3.000–3.300/km' },
  { nama: 'Pick Up', moda: 'darat', kapKg: 1000, kapCbm: 4.9, kapPalet: 2, rpPerKm: 3500, ket: '235×162×130 cm · mulai Rp3.500/km' },
  { nama: 'CDE (Engkel Box)', moda: 'darat', kapKg: 2200, kapCbm: 9.2, kapPalet: 3, rpPerKm: 3400, ket: '320×170×170 cm · Rp3.300–3.500/km' },
  { nama: 'CDD Box', moda: 'darat', kapKg: 5000, kapCbm: 16.7, kapPalet: 6, rpPerKm: 4100, ket: '440×200×190 cm · Rp4.000–4.200/km' },
  { nama: 'CDD Long', moda: 'darat', kapKg: 6000, kapCbm: 22.3, kapPalet: 8, rpPerKm: 4000, ket: '530×200×210 cm · mulai Rp4.000/km' },
  { nama: 'Fuso Box', moda: 'darat', kapKg: 8000, kapCbm: 32, kapPalet: 10, rpPerKm: 6000, ket: '±7–8 ton · tarif per km perkiraan' },
  { nama: 'Tronton Wingbox', moda: 'darat', kapKg: 18000, kapCbm: 58.2, kapPalet: 18, rpPerKm: 8000, ket: '950×245×250 cm · mulai Rp8.000/km' },
  { nama: 'Tronton Bak Terbuka', moda: 'darat', kapKg: 18000, kapCbm: 60.5, kapPalet: 18, rpPerKm: 8000, ket: '950×245×260 cm · mulai Rp8.000/km' },
  { nama: 'Trailer 20 ft', moda: 'darat', kapKg: 25000, kapCbm: 33, kapPalet: 10, rpPerKm: 9000, ket: 'prime mover + chassis 20 ft · mulai Rp9.000/km' },
  { nama: 'Trailer 40 ft', moda: 'darat', kapKg: 30000, kapCbm: 67, kapPalet: 20, rpPerKm: 9000, ket: 'prime mover + chassis 40 ft · mulai Rp9.000/km' },
  { nama: 'Reefer CDD', moda: 'darat', kapKg: 4000, kapCbm: 14, kapPalet: 6, rpPerKm: 5500, ket: 'box berpendingin · tarif per km perkiraan' },
  { nama: 'Reefer Fuso', moda: 'darat', kapKg: 7000, kapCbm: 28, kapPalet: 10, rpPerKm: 7500, ket: 'box berpendingin · tarif per km perkiraan' },
  { nama: 'Truk Tangki', moda: 'darat', kapKg: 16000, kapCbm: 16, kapPalet: 0, kapLiter: 16000, rpPerKm: 8500, ket: 'cairan curah ±16.000 L · tarif per km perkiraan' },
  { nama: 'Container 20 ft', moda: 'laut', kapKg: 21700, kapCbm: 33, kapPalet: 10, ket: 'ISO 20 ft dry (5,9 × 2,35 × 2,39 m)' },
  { nama: 'Container 40 ft', moda: 'laut', kapKg: 26500, kapCbm: 67, kapPalet: 20, ket: 'ISO 40 ft dry (12,0 × 2,35 × 2,39 m)' },
  { nama: 'Container 40 ft HC', moda: 'laut', kapKg: 26500, kapCbm: 76, kapPalet: 24, ket: 'ISO 40 ft high cube (tinggi 2,70 m)' },
  { nama: 'Reefer Container 20 ft', moda: 'laut', kapKg: 21000, kapCbm: 28, kapPalet: 10, ket: 'ISO 20 ft reefer' },
  { nama: 'Reefer Container 40 ft', moda: 'laut', kapKg: 26000, kapCbm: 59, kapPalet: 20, ket: 'ISO 40 ft reefer' },
  { nama: 'LCL (per CBM)', moda: 'laut', kapKg: 1000, kapCbm: 1, kapPalet: 0, ket: 'less than container load, ditagih per CBM / ton (W/M)' },
  { nama: 'Air Cargo General', moda: 'udara', kapKg: 1, kapCbm: 0.006, kapPalet: 0, ket: 'per kg (chargeable weight = maks. berat aktual & volume ÷ 6.000)' },
  { nama: 'Air Cargo Express', moda: 'udara', kapKg: 1, kapCbm: 0.006, kapPalet: 0, ket: 'per kg, layanan cepat' },
  { nama: 'Kereta Container 20 ft', moda: 'kereta', kapKg: 21700, kapCbm: 33, kapPalet: 10, ket: 'angkutan peti kemas KA (Jawa / Sumatra)' },
  { nama: 'Kereta Container 40 ft', moda: 'kereta', kapKg: 26500, kapCbm: 67, kapPalet: 20, ket: 'angkutan peti kemas KA (Jawa / Sumatra)' },
];
export const armada = (nama: string) => ARMADA.find(a => a.nama === nama);
export const armadaModa = (m: Moda) => ARMADA.filter(a => a.moda === m);

/** Kapasitas armada dalam satuan basis (untuk konversi harga per trip ↔ per CBM / ton / pallet / liter). Utilisasi tipikal 85%. */
export function kapasitasBasis(a: Armada | undefined, basis: Basis, utilisasi = 0.85): number | null {
  if (!a) return null;
  const v = basis === 'trip' || basis === 'container' ? 1 : basis === 'cbm' ? a.kapCbm * utilisasi : basis === 'ton' ? (a.kapKg / 1000) * utilisasi
    : basis === 'kg' ? a.kapKg * utilisasi : basis === 'pallet' ? a.kapPalet : basis === 'liter' ? (a.kapLiter ?? 0) * 0.95 : 0;
  return v > 0 ? v : null;
}

/** Estimasi harga beli dari tarif indikatif per km × jarak (bila belum ada market price). */
export function estimasiHarga(namaArmada: string, origin: string, destination: string, basis: Basis): { harga: number; km: number; ket: string } | null {
  const a = armada(namaArmada); if (!a?.rpPerKm) return null;
  const km = jarakKm(origin, destination, 'darat'); if (!km) return null;
  const trip = Math.max(a.rpPerKm * km, a.rpPerKm * 40);       // minimal ±40 km (tarif dalam kota)
  const kap = kapasitasBasis(a, basis); if (!kap) return null;
  const harga = Math.round(trip / kap / 1000) * 1000;
  return { harga, km, ket: `estimasi ${km.toLocaleString('id-ID')} km × Rp${a.rpPerKm.toLocaleString('id-ID')}/km${basis !== 'trip' ? ` ÷ ${kap.toLocaleString('id-ID', { maximumFractionDigits: 1 })} ${basis}/trip` : ''}` };
}

// ---------------- Market price ----------------
export interface RateTransport {
  id: number; moda: Moda; origin: string; destination: string; armada: string; basis: Basis; harga: number; vendor: string;
  lead_time_hari: number | null; min_charge: number | null; cakupan: string | null; berlaku_sampai: string | null; status: string;
}
const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Market price yang cocok dengan rute (origin & destination sama, armada & basis sama bila diisi), termurah dulu. Kedaluwarsa dibuang. */
export function cocokRate(rates: RateTransport[], q: { moda?: Moda; origin: string; destination: string; armada?: string; basis?: Basis }): RateTransport[] {
  const hariIni = new Date().toISOString().slice(0, 10);
  return rates.filter(r => (!q.moda || r.moda === q.moda) && n(r.origin) === n(q.origin) && n(r.destination) === n(q.destination)
    && (!q.armada || n(r.armada) === n(q.armada)) && (!q.basis || r.basis === q.basis) && !(r.berlaku_sampai && r.berlaku_sampai < hariIni))
    .sort((a, b) => Number(a.harga) - Number(b.harga));
}

// ---------------- Tender transportation ----------------
export interface RuteTransport {
  id: string; origin: string; destination: string; armada: string; basis: Basis;
  volumeBulan: number;          // volume per bulan dalam satuan basis (trip / CBM / ton / pallet / liter)
  vendor: string; hargaBeli: number; rateId?: number | null; sumberHarga?: 'market' | 'estimasi' | 'manual';
  marginPersen?: number | null; // null / undefined = ikut margin global
  leadTimeHari?: number | null; catatan?: string;
}
export interface TenderTransport { marginGlobal: number; rute: RuteTransport[]; catatan?: string }
export const TRANSPORT_DEFAULT: TenderTransport = { marginGlobal: 0.12, rute: [] };

export const idBaru = () => Math.random().toString(36).slice(2, 10);
export const ruteBaru = (p: Partial<RuteTransport> = {}): RuteTransport =>
  ({ id: idBaru(), origin: '', destination: '', armada: 'CDD Box', basis: 'trip', volumeBulan: 0, vendor: '', hargaBeli: 0, sumberHarga: 'manual', ...p });

export const marginRute = (m: number | null | undefined, global: number) => (m == null || !isFinite(m) ? global : m);
export function hitungRute(r: RuteTransport, marginGlobal: number) {
  const m = marginRute(r.marginPersen, marginGlobal);
  const jual = Math.round(r.hargaBeli * (1 + m) * 100) / 100;
  const biayaBulan = r.hargaBeli * (r.volumeBulan || 0), pendapatanBulan = jual * (r.volumeBulan || 0);
  return { margin: m, jual, biayaBulan, pendapatanBulan, gp: pendapatanBulan - biayaBulan, gpPersen: jual > 0 ? (jual - r.hargaBeli) / jual : 0 };
}

export interface Ringkas { biayaBulan: number; pendapatanBulan: number; gp: number; gpPersen: number; jumlahRute: number; tanpaHarga: number }
const ringkasDari = (xs: { biayaBulan: number; pendapatanBulan: number; tanpaHarga: boolean }[]): Ringkas => {
  const biayaBulan = xs.reduce((t, x) => t + x.biayaBulan, 0), pendapatanBulan = xs.reduce((t, x) => t + x.pendapatanBulan, 0);
  return { biayaBulan, pendapatanBulan, gp: pendapatanBulan - biayaBulan, gpPersen: pendapatanBulan > 0 ? (pendapatanBulan - biayaBulan) / pendapatanBulan : 0, jumlahRute: xs.length, tanpaHarga: xs.filter(x => x.tanpaHarga).length };
};
export const ringkasTransport = (t: TenderTransport) =>
  ringkasDari(t.rute.map(r => ({ ...hitungRute(r, t.marginGlobal), tanpaHarga: !(r.hargaBeli > 0) })));

/** Bentuk tenders.hasil supaya tender transport ikut di Pipeline, Status & Tracking, Performance Analytics (view tender_overview). */
export const hasilOverview = (r: Ringkas, rincian: unknown) => ({
  totalBiayaBulan: Math.round(r.biayaBulan),
  simulasi: [{ pendapatanBulan: Math.round(r.pendapatanBulan), biayaBulan: Math.round(r.biayaBulan), gp: Math.round(r.gp), gpPersen: Math.round(r.gpPersen * 10000) / 10000 }],
  rincian, dihitung: new Date().toISOString(),
});

// ---------------- Tender intermodal ----------------
export interface StageIntermodal {
  moda: Moda; dari: string; ke: string; armada: string; basis: Basis;
  qty: number;                  // satuan basis per shipment (mis. 1 trip, 1 container, 20 CBM, 500 kg)
  harga: number; vendor: string; rateId?: number | null; sumberHarga?: 'market' | 'estimasi' | 'manual'; leadTimeHari?: number | null;
}
export interface RuteIntermodal {
  id: string; origin: string; destination: string;
  stage: [StageIntermodal, StageIntermodal, StageIntermodal];  // 0 pickup (first mile), 1 main leg, 2 delivery (last mile)
  biayaLain: number;            // per shipment: THC, dokumen, handling port / gudang transit, asuransi
  shipmentBulan: number;        // shipment per bulan
  satuanJual: Basis; qtyJual: number;   // harga jual dinyatakan per … (mis. per container 1, per CBM 20)
  marginPersen?: number | null; catatan?: string;
}
export interface TenderIntermodal { marginGlobal: number; rute: RuteIntermodal[]; catatan?: string }
export const INTERMODAL_DEFAULT: TenderIntermodal = { marginGlobal: 0.12, rute: [] };
export const NAMA_STAGE = ['Stage 1 · Pickup (first mile)', 'Stage 2 · Main leg (laut / udara / kereta)', 'Stage 3 · Delivery (last mile)'] as const;

export function ruteIntermodalBaru(p: Partial<RuteIntermodal> = {}): RuteIntermodal {
  const st = (moda: Moda, armadaNama: string, basis: Basis): StageIntermodal => ({ moda, dari: '', ke: '', armada: armadaNama, basis, qty: 1, harga: 0, vendor: '', sumberHarga: 'manual' });
  return { id: idBaru(), origin: '', destination: '', stage: [st('darat', 'Trailer 20 ft', 'trip'), st('laut', 'Container 20 ft', 'container'), st('darat', 'Trailer 20 ft', 'trip')],
    biayaLain: 0, shipmentBulan: 1, satuanJual: 'container', qtyJual: 1, ...p };
}

export function hitungIntermodal(r: RuteIntermodal, marginGlobal: number) {
  const perStage = r.stage.map(s => (s.harga || 0) * (s.qty || 0));
  const beliShipment = perStage.reduce((t, x) => t + x, 0) + (r.biayaLain || 0);
  const m = marginRute(r.marginPersen, marginGlobal);
  const jualShipment = Math.round(beliShipment * (1 + m) * 100) / 100;
  const q = r.qtyJual > 0 ? r.qtyJual : 1;
  const biayaBulan = beliShipment * (r.shipmentBulan || 0), pendapatanBulan = jualShipment * (r.shipmentBulan || 0);
  const lead = r.stage.reduce((t, s) => t + (Number(s.leadTimeHari) || 0), 0);
  return { perStage, beliShipment, jualShipment, margin: m, beliPerSatuan: Math.round(beliShipment / q * 100) / 100, jualPerSatuan: Math.round(jualShipment / q * 100) / 100, biayaBulan, pendapatanBulan,
    gp: pendapatanBulan - biayaBulan, gpPersen: jualShipment > 0 ? (jualShipment - beliShipment) / jualShipment : 0, leadTimeHari: lead };
}
export const ringkasIntermodal = (t: TenderIntermodal) =>
  ringkasDari(t.rute.map(r => ({ ...hitungIntermodal(r, t.marginGlobal), tanpaHarga: r.stage.some(s => !(s.harga > 0)) })));

/** Titik rute (origin → port asal → port tujuan → destination) untuk peta / simulasi. */
export const titikIntermodal = (r: RuteIntermodal) => [r.origin, r.stage[0].ke || r.stage[1].dari, r.stage[2].dari || r.stage[1].ke, r.destination].filter(Boolean);
