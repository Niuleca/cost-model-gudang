// Tender Transportation (rute darat) & Intermodal (3 stage: pickup → main leg laut/udara/kereta → delivery).
// Disimpan di tenders.asumsi.transport / tenders.asumsi.intermodal (jenis_tender = transportation / intermodal).
// Margin = GP% atas harga jual (sama dengan margin manual di tender gudang): harga jual = harga beli ÷ (1 − margin),
// sehingga input margin 15% menghasilkan GP tepat 15% (bukan mark-up 15% yang hanya memberi GP 13,04%).
import { jarakKm, bisaDarat } from './lokasiIndonesia.ts';

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
export interface TenderTransport { marginGlobal: number; rute: RuteTransport[]; catatan?: string; tierMargin?: number[] }
export const TRANSPORT_DEFAULT: TenderTransport = { marginGlobal: 0.12, rute: [] };

export const idBaru = () => Math.random().toString(36).slice(2, 10);
export const ruteBaru = (p: Partial<RuteTransport> = {}): RuteTransport =>
  ({ id: idBaru(), origin: '', destination: '', armada: 'CDD Box', basis: 'trip', volumeBulan: 0, vendor: '', hargaBeli: 0, sumberHarga: 'manual', ...p });

export const marginRute = (m: number | null | undefined, global: number) => (m == null || !isFinite(m) ? global : m);
/** Harga jual dari harga beli & margin GP (margin dibatasi −100%…95% supaya tidak membagi nol). */
export const hargaJual = (beli: number, margin: number) => {
  const m = Math.min(0.95, Math.max(-1, Number(margin) || 0));
  return Math.round((beli / (1 - m)) * 100) / 100;
};
export function hitungRute(r: RuteTransport, marginGlobal: number) {
  const m = marginRute(r.marginPersen, marginGlobal);
  const jual = hargaJual(r.hargaBeli, m);
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
export interface TenderIntermodal { marginGlobal: number; rute: RuteIntermodal[]; catatan?: string; tierMargin?: number[] }
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
  const jualShipment = hargaJual(beliShipment, m);
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

// ---------------- Review: perbandingan margin, catatan review, rate card quotation ----------------
/** Tier margin default untuk perbandingan (GP% atas harga jual). */
export const TIER_DEFAULT = [0.15, 0.10, 0.05];
export const persen1 = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString('id-ID')}%`;

export interface BarisTier { id: string; nama: string; satuan: string; beli: number; volBulan: number; jual: number[]; gpBulan: number[] }
export interface HasilTier { kolom: { label: string; margin: number | null }[]; baris: BarisTier[]; total: Ringkas[] }

/** Bandingkan harga jual & GP: kolom pertama = margin yang berlaku sekarang (global + khusus rute), lalu tiap tier diterapkan seragam ke semua rute. */
export function tierTransport(t: TenderTransport, tiers: number[]): HasilTier {
  const versi: TenderTransport[] = [t, ...tiers.map(m => ({ ...t, marginGlobal: m, rute: t.rute.map(r => ({ ...r, marginPersen: null })) }))];
  return {
    kolom: [{ label: 'Saat ini', margin: null }, ...tiers.map(m => ({ label: `Margin ${persen1(m)}`, margin: m }))],
    baris: t.rute.map((r, i) => {
      const h = versi.map(v => hitungRute(v.rute[i], v.marginGlobal));
      return { id: r.id, nama: `${r.origin || '…'} → ${r.destination || '…'}`, satuan: `${r.armada} · ${labelBasis(r.basis)}`, beli: r.hargaBeli, volBulan: r.volumeBulan || 0,
        jual: h.map(x => x.jual), gpBulan: h.map(x => x.gp) };
    }),
    total: versi.map(ringkasTransport),
  };
}
export function tierIntermodal(t: TenderIntermodal, tiers: number[]): HasilTier {
  const versi: TenderIntermodal[] = [t, ...tiers.map(m => ({ ...t, marginGlobal: m, rute: t.rute.map(r => ({ ...r, marginPersen: null })) }))];
  return {
    kolom: [{ label: 'Saat ini', margin: null }, ...tiers.map(m => ({ label: `Margin ${persen1(m)}`, margin: m }))],
    baris: t.rute.map((r, i) => {
      const h = versi.map(v => hitungIntermodal(v.rute[i], v.marginGlobal));
      return { id: r.id, nama: `${r.origin || '…'} → ${r.destination || '…'}`, satuan: labelBasis(r.satuanJual), beli: h[0].beliPerSatuan, volBulan: (r.shipmentBulan || 0) * (r.qtyJual || 1),
        jual: h.map(x => x.jualPerSatuan), gpBulan: h.map(x => x.gp) };
    }),
    total: versi.map(ringkasIntermodal),
  };
}

export interface CatatanReview { level: 'kritis' | 'perhatian' | 'info'; rute?: string; pesan: string }
const hariIniIso = () => new Date().toISOString().slice(0, 10);
const cekMargin = (m: number, nama: string, out: CatatanReview[]) => {
  if (m < 0) out.push({ level: 'kritis', rute: nama, pesan: `Margin ${persen1(m)} negatif — harga jual di bawah harga beli.` });
  else if (m < 0.05) out.push({ level: 'perhatian', rute: nama, pesan: `Margin ${persen1(m)} di bawah 5% — tipis untuk menutup risiko (klaim, demurrage, kenaikan BBM).` });
  else if (m > 0.35) out.push({ level: 'info', rute: nama, pesan: `Margin ${persen1(m)} cukup tinggi — cek daya saing terhadap harga pasar.` });
};
const cekRate = (rateId: number | null | undefined, rates: RateTransport[], nama: string, out: CatatanReview[]) => {
  if (!rateId) return;
  const x = rates.find(r => r.id === rateId); if (!x) return;
  if (x.berlaku_sampai && x.berlaku_sampai < hariIniIso()) out.push({ level: 'perhatian', rute: nama, pesan: `Harga ${x.vendor} sudah lewat masa berlaku (${x.berlaku_sampai}) — minta quotation ulang.` });
  else if (x.status !== 'approved') out.push({ level: 'info', rute: nama, pesan: `Harga ${x.vendor} di Market Price masih draft (belum di-approve).` });
};

/** Catatan review tender transport: data wajib, sumber harga, margin, rute lintas pulau, masa berlaku harga. */
export function reviewTransport(t: TenderTransport, rates: RateTransport[] = []): CatatanReview[] {
  const out: CatatanReview[] = [];
  if (!t.rute.length) out.push({ level: 'kritis', pesan: 'Belum ada rute.' });
  t.rute.forEach((r, i) => {
    const nama = `${i + 1}. ${r.origin || '…'} → ${r.destination || '…'}`;
    if (!r.origin || !r.destination) out.push({ level: 'kritis', rute: nama, pesan: 'Origin / destination belum diisi.' });
    if (!(r.hargaBeli > 0)) out.push({ level: 'kritis', rute: nama, pesan: 'Harga beli belum ada.' });
    if (!(r.volumeBulan > 0)) out.push({ level: 'perhatian', rute: nama, pesan: 'Volume per bulan 0 — pendapatan & GP rute ini tidak terhitung.' });
    if (r.sumberHarga === 'estimasi') out.push({ level: 'perhatian', rute: nama, pesan: 'Harga beli masih estimasi tarif per km — konfirmasi dengan quotation vendor.' });
    if (r.sumberHarga === 'manual' && r.hargaBeli > 0 && !r.vendor) out.push({ level: 'perhatian', rute: nama, pesan: 'Harga manual tanpa nama vendor.' });
    if (r.origin && r.destination && !bisaDarat(r.origin, r.destination)) out.push({ level: 'perhatian', rute: nama, pesan: 'Origin & destination beda pulau — trucking saja tidak cukup, pertimbangkan tender Intermodal.' });
    cekMargin(marginRute(r.marginPersen, t.marginGlobal), nama, out);
    cekRate(r.rateId, rates, nama, out);
  });
  return out;
}
/** Catatan review tender intermodal: tiap stage punya harga, titik sambung stage cocok, lead time, margin. */
export function reviewIntermodal(t: TenderIntermodal, rates: RateTransport[] = []): CatatanReview[] {
  const out: CatatanReview[] = [];
  if (!t.rute.length) out.push({ level: 'kritis', pesan: 'Belum ada rute.' });
  t.rute.forEach((r, i) => {
    const nama = `${i + 1}. ${r.origin || '…'} → ${r.destination || '…'}`;
    if (!r.origin || !r.destination) out.push({ level: 'kritis', rute: nama, pesan: 'Origin / destination belum diisi.' });
    r.stage.forEach((s, k) => {
      const st = ['Pickup', 'Main leg', 'Delivery'][k];
      if (!(s.harga > 0)) out.push({ level: 'kritis', rute: nama, pesan: `${st}: harga beli belum ada.` });
      else if (s.sumberHarga === 'estimasi') out.push({ level: 'perhatian', rute: nama, pesan: `${st}: harga masih estimasi — konfirmasi dengan vendor.` });
      if (!s.dari || !s.ke) out.push({ level: 'perhatian', rute: nama, pesan: `${st}: titik dari / ke belum lengkap.` });
      if (s.leadTimeHari == null) out.push({ level: 'info', rute: nama, pesan: `${st}: lead time belum diisi.` });
      cekRate(s.rateId, rates, `${nama} · ${st}`, out);
    });
    if (!(r.shipmentBulan > 0)) out.push({ level: 'perhatian', rute: nama, pesan: 'Shipment per bulan 0.' });
    cekMargin(marginRute(r.marginPersen, t.marginGlobal), nama, out);
  });
  return out;
}

export interface BarisRateCard { layanan: string; satuan: string; tarif: number; catatan?: string }
const fmtAngka = (x: number) => x.toLocaleString('id-ID', { maximumFractionDigits: 1 });
/** Rate card quotation tender transport: satu baris per rute (tarif jual per basis). */
export const rateCardTransport = (t: TenderTransport): BarisRateCard[] => t.rute.filter(r => r.hargaBeli > 0).map(r => {
  const h = hitungRute(r, t.marginGlobal);
  return { layanan: `${r.origin} → ${r.destination}`, satuan: `${r.armada}, ${labelBasis(r.basis)}`, tarif: Math.ceil(h.jual),
    catatan: [r.leadTimeHari ? `Lead time ${fmtAngka(r.leadTimeHari)} hari` : '', r.volumeBulan ? `estimasi ${fmtAngka(r.volumeBulan)} ${r.basis}/bulan` : ''].filter(Boolean).join('; ') };
});
/** Rate card quotation intermodal: satu baris per rute door-to-door (tarif jual per satuan jual), rincian moda di keterangan. */
export const rateCardIntermodal = (t: TenderIntermodal): BarisRateCard[] => t.rute.filter(r => r.stage.every(s => s.harga > 0)).map(r => {
  const h = hitungIntermodal(r, t.marginGlobal);
  const main = r.stage[1];
  return { layanan: `${r.origin} → ${r.destination} (door to door)`, satuan: `${labelBasis(r.satuanJual)}${r.qtyJual > 1 ? ` (${fmtAngka(r.qtyJual)} per shipment)` : ''}`,
    tarif: Math.ceil(h.jualPerSatuan),
    catatan: [`via ${MODA.find(m => m.v === main.moda)?.l.split(' ')[0] ?? main.moda} ${main.dari} → ${main.ke} (${main.armada})`, h.leadTimeHari ? `lead time ±${fmtAngka(h.leadTimeHari)} hari` : ''].filter(Boolean).join('; ') };
});
