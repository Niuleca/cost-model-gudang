// Project Analysis: asumsi sistem (Solution Design & Costing) vs kinerja aktual → variance, akar masalah, tindakan korektif.
// Data aktual & tindakan disimpan di tenders.asumsi.analisis (tanpa tabel baru).

export interface Rencana {
  sumber: string;                    // asal angka rencana
  satuanVolume: string;              // satuan volume (palet, karton, trip, …)
  volumeIn: number; volumeOut: number; stokRata: number; satuanStok: string;
  headcount: number; headcountDirect: number; hariKerja: number;
  luasM2: number; posisiPalet: number;
  biayaBulan: number; pendapatanBulan: number;
  biayaKelompok: Record<string, number>;
}

export interface AktualBulan {
  periode: string;                   // YYYY-MM
  volumeIn: number | null; volumeOut: number | null; stokRata: number | null;
  headcount: number | null; headcountDirect: number | null; hariKerja: number | null;
  luasDipakaiM2: number | null; posisiPalet: number | null;
  biayaBulan: number | null; pendapatanBulan: number | null;
  biayaManpower?: number | null; biayaSewa?: number | null; biayaMhe?: number | null; biayaUtilitas?: number | null; biayaLain?: number | null;
  catatan?: string;
}

export type StatusTindakan = 'rencana' | 'berjalan' | 'selesai' | 'batal';
export interface Tindakan {
  id: string; metrik: string; akarMasalah: string; tindakan: string; pic: string; target: string; status: StatusTindakan;
  dampak?: string;                   // hasil / improvement yang tercapai
}
export interface AnalisisProyek { aktual: AktualBulan[]; tindakan: Tindakan[]; ambangHijau?: number; ambangKuning?: number }
export const ANALISIS_DEFAULT: AnalisisProyek = { aktual: [], tindakan: [], ambangHijau: 0.05, ambangKuning: 0.15 };

export type Arah = 'naik-baik' | 'turun-baik' | 'pita';
export type StatusVar = 'hijau' | 'kuning' | 'merah' | 'kosong';
export interface Metrik {
  kode: string; label: string; satuan: string; arah: Arah; rencana: number | null; aktual: number | null;
  selisih: number | null; persen: number | null; status: StatusVar; ket: string; pita?: [number, number];
}

const n = (v: unknown) => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v));
const bagi = (a: number | null, b: number | null) => (a == null || b == null || !(b > 0) ? null : a / b);

/** Rata-rata beberapa bulan aktual (nilai kosong diabaikan per kolom). */
export function rataAktual(rows: AktualBulan[]): AktualBulan | null {
  if (!rows.length) return null;
  const kol: (keyof AktualBulan)[] = ['volumeIn', 'volumeOut', 'stokRata', 'headcount', 'headcountDirect', 'hariKerja', 'luasDipakaiM2', 'posisiPalet', 'biayaBulan', 'pendapatanBulan', 'biayaManpower', 'biayaSewa', 'biayaMhe', 'biayaUtilitas', 'biayaLain'];
  const o: Record<string, unknown> = { periode: rows.length === 1 ? rows[0].periode : `${rows[0].periode} – ${rows[rows.length - 1].periode}` };
  for (const k of kol) { const xs = rows.map(r => n(r[k])).filter((x): x is number => x != null); o[k] = xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null; }
  return o as unknown as AktualBulan;
}

function status(arah: Arah, persen: number | null, nilai: number | null, pita: [number, number] | undefined, hijau: number, kuning: number): StatusVar {
  if (arah === 'pita') {
    if (nilai == null || !pita) return 'kosong';
    if (nilai >= pita[0] && nilai <= pita[1]) return 'hijau';
    return nilai >= pita[0] - 0.1 && nilai <= pita[1] + 0.05 ? 'kuning' : 'merah';
  }
  if (persen == null) return 'kosong';
  const buruk = arah === 'naik-baik' ? -persen : persen;     // positif = menyimpang ke arah buruk
  if (buruk <= hijau) return 'hijau';
  return buruk <= kuning ? 'kuning' : 'merah';
}

/** Variance per metrik: volume, manpower, space utilization, productivity, operational cost, gross margin. */
export function hitungMetrik(r: Rencana, a: AktualBulan | null, ambang = { hijau: 0.05, kuning: 0.15 }): Metrik[] {
  const thruR = r.volumeIn + r.volumeOut, thruA = a ? (n(a.volumeIn) ?? 0) + (n(a.volumeOut) ?? 0) : null;
  const hdR = r.headcountDirect || r.headcount, hdA = a ? n(a.headcountDirect) ?? n(a.headcount) : null;
  const hariA = a ? n(a.hariKerja) ?? r.hariKerja : r.hariKerja;
  const prodR = bagi(thruR, hdR * r.hariKerja), prodA = thruA != null && hdA != null && hariA ? bagi(thruA, hdA * hariA) : null;
  const utilR = bagi(r.stokRata, r.posisiPalet), utilA = a ? bagi(n(a.stokRata), n(a.posisiPalet) ?? r.posisiPalet) : null;
  const gpR = r.pendapatanBulan > 0 ? (r.pendapatanBulan - r.biayaBulan) / r.pendapatanBulan : null;
  const pA = a ? n(a.pendapatanBulan) : null, bA = a ? n(a.biayaBulan) : null;
  const gpA = pA != null && bA != null && pA > 0 ? (pA - bA) / pA : null;
  const cpuR = bagi(r.biayaBulan, thruR), cpuA = bA != null && thruA ? bagi(bA, thruA) : null;
  const sv = r.satuanVolume;
  const m = (kode: string, label: string, satuan: string, arah: Arah, rencana: number | null, aktual: number | null, ket: string, pita?: [number, number]): Metrik => {
    const selisih = rencana != null && aktual != null ? aktual - rencana : null;
    const persen = selisih != null && rencana ? selisih / Math.abs(rencana) : null;
    return { kode, label, satuan, arah, rencana, aktual, selisih, persen, ket, pita,
      status: arah === 'pita' ? status(arah, persen, aktual, pita, ambang.hijau, ambang.kuning) : status(arah, persen, aktual, pita, ambang.hijau, ambang.kuning) };
  };
  return [
    m('volIn', 'Volume inbound / bln', sv, 'naik-baik', r.volumeIn || null, a ? n(a.volumeIn) : null, 'di atas rencana = pendapatan naik, cek kapasitas'),
    m('volOut', 'Volume outbound / bln', sv, 'naik-baik', r.volumeOut || null, a ? n(a.volumeOut) : null, 'di atas rencana = pendapatan naik, cek kapasitas'),
    m('stok', 'Stok rata-rata', r.satuanStok, 'naik-baik', r.stokRata || null, a ? n(a.stokRata) : null, 'pendapatan storage'),
    m('hc', 'Manpower (headcount)', 'orang', 'turun-baik', r.headcount || null, a ? n(a.headcount) : null, 'lebih banyak dari rencana = biaya manpower naik'),
    m('prod', 'Produktivitas (in + out per orang direct per hari)', `${sv}/orang/hari`, 'naik-baik', prodR, prodA, 'throughput ÷ (headcount direct × hari kerja)'),
    m('util', 'Space utilization (stok ÷ posisi palet)', '%', 'pita', utilR, utilA, 'target 75–90%: < 75% space menganggur, > 90% padat / risiko overflow', [0.75, 0.9]),
    m('biaya', 'Operational cost / bln', 'Rp', 'turun-baik', r.biayaBulan || null, bA, 'semua biaya operasi'),
    m('cpu', 'Biaya per unit handling', `Rp/${sv}`, 'turun-baik', cpuR, cpuA, 'operational cost ÷ (in + out)'),
    m('pendapatan', 'Pendapatan / bln', 'Rp', 'naik-baik', r.pendapatanBulan || null, pA, 'invoice ke customer'),
    { ...m('gp', 'Gross margin', '%', 'naik-baik', gpR, gpA, '(pendapatan − biaya) ÷ pendapatan'),
      // GP dinilai dalam poin persen (bukan persen relatif): turun ≤ 1 poin hijau, ≤ 3 poin kuning, lebih dari itu merah
      ...(gpR != null && gpA != null ? { selisih: gpA - gpR, persen: gpA - gpR, status: (gpA - gpR >= -0.01 ? 'hijau' : gpA - gpR >= -0.03 ? 'kuning' : 'merah') as StatusVar } : {}) },
  ];
}

export interface Temuan { kode: string; judul: string; bukti: string; akar: string[]; tindakan: string[]; tingkat: 'merah' | 'kuning' }

const pct = (x: number | null) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);

/** Akar masalah & rekomendasi tindakan korektif dari pola variance (rule-based, perlu dikonfirmasi tim operasi). */
export function analisisAkar(ms: Metrik[]): Temuan[] {
  if (!ms.length) return [];
  const g = (k: string) => ms.find(x => x.kode === k)!;
  const T: Temuan[] = [];
  const vIn = g('volIn'), vOut = g('volOut'), hc = g('hc'), prod = g('prod'), util = g('util'), biaya = g('biaya'), cpu = g('cpu'), pend = g('pendapatan'), gp = g('gp');
  const volP = [vIn.persen, vOut.persen].filter((x): x is number => x != null);
  const vol = volP.length ? volP.reduce((t, x) => t + x, 0) / volP.length : null;
  const buruk = (x: Metrik) => x.status === 'merah' || x.status === 'kuning';
  const tk = (...xs: Metrik[]) => (xs.some(x => x.status === 'merah') ? 'merah' : 'kuning') as Temuan['tingkat'];

  if (vol != null && vol < -0.05) T.push({ kode: 'vol-rendah', judul: 'Volume di bawah rencana', tingkat: vol < -0.15 ? 'merah' : 'kuning',
    bukti: `Volume rata-rata ${pct(vol)} vs rencana · pendapatan ${pct(pend.persen)}`,
    akar: ['Forecast customer terlalu optimis / ramp-up lebih lambat', 'Sebagian volume dialihkan customer ke gudang / 3PL lain', 'Musim rendah (seasonality) belum tercermin di rencana'],
    tindakan: ['Tagih minimum volume / take-or-pay sesuai kontrak', 'Sesuaikan manpower & shift ke volume aktual (roster fleksibel, tenaga harian)', 'Minta forecast rolling 3 bulan dari customer; review tarif bila volume tetap rendah', 'Tawarkan space & kapasitas kosong ke customer lain (shared warehouse)'] });
  if (vol != null && vol > 0.1) T.push({ kode: 'vol-tinggi', judul: 'Volume di atas rencana', tingkat: vol > 0.2 ? 'merah' : 'kuning',
    bukti: `Volume ${pct(vol)} vs rencana · manpower ${pct(hc.persen)} · utilisasi ${util.aktual != null ? `${Math.round(util.aktual * 100)}%` : '—'}`,
    akar: ['Pertumbuhan bisnis customer / promo', 'Peak season lebih panjang dari asumsi'],
    tindakan: ['Pastikan kelebihan volume tertagih (tarif per unit, bukan lumpsum)', 'Siapkan overflow storage & tenaga tambahan sebelum service level turun', 'Perbarui rencana kapasitas di cost model (Volume → Hitung ulang) untuk adendum harga'] });
  if (buruk(prod)) T.push({ kode: 'prod', judul: 'Produktivitas di bawah standar', tingkat: tk(prod),
    bukti: `Produktivitas ${pct(prod.persen)} vs rencana · headcount ${pct(hc.persen)} · volume ${pct(vol)}`,
    akar: ['Tenaga baru / learning curve, training belum tuntas', 'Jarak tempuh picking jauh (slotting belum ABC)', 'Downtime sistem / RF scanner, MHE kurang atau rusak', 'Absensi tinggi → banyak tenaga pengganti', 'Standar produktivitas di cost model terlalu tinggi untuk produk ini'],
    tindakan: ['Time & motion study per aktivitas, bandingkan dengan menu Productivity', 'Re-slotting ABC (fast mover dekat dock), perbaiki layout & jalur', 'Training ulang + buddy system untuk tenaga baru; insentif berbasis produktivitas', 'Cek uptime MHE & RF; tambah unit bila antre', 'Perbarui standar produktivitas di master bila temuan berulang (supaya tender berikutnya akurat)'] });
  if (hc.status === 'merah' || (hc.persen != null && hc.persen > 0.05 && (vol == null || vol < hc.persen - 0.05))) T.push({ kode: 'hc', judul: 'Manpower melebihi rencana', tingkat: tk(hc),
    bukti: `Headcount ${pct(hc.persen)} vs rencana dengan volume ${pct(vol)}`,
    akar: ['Lembur & tenaga harian dipakai menutup produktivitas rendah', 'Peran tambahan di luar rencana (admin, checker, cleaning) belum ada di cost model', 'Shift pattern tidak mengikuti profil volume per jam'],
    tindakan: ['Rekonsiliasi daftar karyawan vs Man Power Summary di cost model', 'Atur roster mengikuti profil order per jam (peak shifting)', 'Batasi lembur dengan approval; ganti tenaga harian dengan pola tetap bila rutin', 'Ajukan biaya peran tambahan ke customer bila permintaan customer (change request)'] });
  if (util.status !== 'kosong' && util.aktual != null && util.pita && util.aktual > util.pita[1]) T.push({ kode: 'util-tinggi', judul: 'Space hampir penuh', tingkat: util.status === 'merah' ? 'merah' : 'kuning',
    bukti: `Utilisasi ${Math.round(util.aktual * 100)}% (rencana ${util.rencana != null ? Math.round(util.rencana * 100) : '—'}%)`,
    akar: ['Stok menumpuk: slow moving / dead stock / barang reject belum dikembalikan', 'Inbound lebih cepat dari outbound (forecast & PO customer tidak sinkron)', 'Kapasitas rak lebih kecil dari desain (level / beban)'],
    tindakan: ['Aging report ke customer + charge storage berlebih sesuai kontrak', 'Disposal / return barang rusak & dead stock', 'Tambah level rak / double deep / overflow sementara; hitung ulang di Warehouse Planning', 'Batasi slot per SKU (min–max) dan sepakati inventory policy dengan customer'] });
  if (util.status !== 'kosong' && util.aktual != null && util.pita && util.aktual < util.pita[0]) T.push({ kode: 'util-rendah', judul: 'Space kurang terpakai', tingkat: util.status === 'merah' ? 'merah' : 'kuning',
    bukti: `Utilisasi ${Math.round(util.aktual * 100)}% (rencana ${util.rencana != null ? Math.round(util.rencana * 100) : '—'}%)`,
    akar: ['Stok customer lebih rendah dari asumsi', 'Space disewa lebih besar dari kebutuhan (sewa utuh gedung)'],
    tindakan: ['Pastikan tarif storage minimum / dedicated space tertagih', 'Tawarkan sisa space ke customer lain atau kembalikan sebagian ke landlord', 'Konsolidasi lokasi untuk mengurangi jarak tempuh'] });
  if (buruk(biaya) || buruk(cpu)) T.push({ kode: 'biaya', judul: 'Biaya operasi di atas rencana', tingkat: tk(biaya, cpu),
    bukti: `Biaya ${pct(biaya.persen)} · biaya per unit ${pct(cpu.persen)} · volume ${pct(vol)}`,
    akar: ['Lembur, tenaga harian & biaya manpower (UMK baru) belum tercermin', 'Listrik / BBM / sewa MHE di atas asumsi', 'Biaya tak terduga: perbaikan, kerusakan barang, klaim'],
    tindakan: ['Bandingkan biaya per kelompok aktual dengan Result (OPEX/CAPEX) di cost model', 'Kontrol lembur & energi (jadwal charging MHE, lampu per zona)', 'Negosiasi ulang vendor (MHE, security, cleaning) memakai Market / Price Inquiry', 'Ajukan eskalasi tarif bila kenaikan UMK / BBM di luar kendali'] });
  if (buruk(gp)) T.push({ kode: 'gp', judul: 'Gross margin di bawah rencana', tingkat: tk(gp),
    bukti: `GP aktual ${gp.aktual != null ? `${(gp.aktual * 100).toFixed(1)}%` : '—'} vs rencana ${gp.rencana != null ? `${(gp.rencana * 100).toFixed(1)}%` : '—'} · pendapatan ${pct(pend.persen)} · biaya ${pct(biaya.persen)}`,
    akar: ['Layanan tambahan (VAS, lembur atas permintaan customer) belum ditagih', 'Volume di bawah minimum tanpa klausul take-or-pay', 'Biaya naik tanpa eskalasi tarif'],
    tindakan: ['Audit invoice vs aktivitas (VAS, handling tambahan, storage berlebih)', 'Terapkan klausul minimum volume & eskalasi tahunan', 'Revisi rate card lewat cost model (Result → margin) untuk adendum', 'Prioritaskan tindakan biaya & produktivitas di atas'] });
  return T;
}

/** Rencana dari hasil cost model warehouse (tenders.hasil) atau data Excel lama (asumsi.historis). */
export function rencanaWarehouse(t: { asumsi: Record<string, unknown>; hasil: unknown }): Rencana | null {
  type V = { arus: string; uom: string; rataRataBulan: number; peakBulan: number };
  const a = t.asumsi as { volumes?: V[]; processDesign?: { hariKerjaBulan?: number }; historis?: { ringkasan: { pendapatanBulan: number; biayaBulan: number; headcount: number | null; luasM2: number | null; posisiPalet: number | null } } };
  const h = t.hasil as { totalBiayaBulan?: number; totalHeadcount?: number; manpower?: { jenis: string; headcount: number }[]; space?: { totalM2: number; ppDesain: number; posisiRak?: number };
    simulasi?: { pendapatanBulan: number }[]; perKelompok?: Record<string, number> } | null;
  const vol = (ar: string) => a.volumes?.find(v => v.arus === ar);
  const vIn = vol('inbound'), vOut = vol('outbound'), st = vol('storage');
  const hari = a.processDesign?.hariKerjaBulan ?? 25;
  if (h?.totalBiayaBulan) {
    return {
      sumber: 'Hasil cost model (Result tersimpan)', satuanVolume: vIn?.uom ?? 'palet',
      volumeIn: Number(vIn?.rataRataBulan) || Number(vIn?.peakBulan) || 0, volumeOut: Number(vOut?.rataRataBulan) || Number(vOut?.peakBulan) || 0,
      stokRata: Number(st?.rataRataBulan) || 0, satuanStok: st?.uom ?? 'palet',
      headcount: h.totalHeadcount ?? (h.manpower ?? []).reduce((s, m) => s + m.headcount, 0),
      headcountDirect: (h.manpower ?? []).filter(m => m.jenis === 'Direct').reduce((s, m) => s + m.headcount, 0), hariKerja: hari,
      luasM2: h.space?.totalM2 ?? 0, posisiPalet: h.space?.ppDesain ?? 0,
      biayaBulan: h.totalBiayaBulan, pendapatanBulan: h.simulasi?.[0]?.pendapatanBulan ?? 0, biayaKelompok: h.perKelompok ?? {},
    };
  }
  const r = a.historis?.ringkasan;
  if (r) return {
    sumber: 'Cost model Excel lama (data project berjalan)', satuanVolume: vIn?.uom ?? 'palet',
    volumeIn: Number(vIn?.rataRataBulan) || 0, volumeOut: Number(vOut?.rataRataBulan) || 0, stokRata: Number(st?.rataRataBulan) || 0, satuanStok: st?.uom ?? 'palet',
    headcount: r.headcount ?? 0, headcountDirect: r.headcount ?? 0, hariKerja: hari, luasM2: r.luasM2 ?? 0, posisiPalet: r.posisiPalet ?? 0,
    biayaBulan: r.biayaBulan, pendapatanBulan: r.pendapatanBulan, biayaKelompok: {},
  };
  return null;
}

/** Rencana tender transport / intermodal: volume = total unit rute per bulan (biaya & pendapatan dari hasil tersimpan). */
export function rencanaTransport(t: { jenis_tender: string; asumsi: Record<string, unknown>; hasil: unknown }): Rencana | null {
  const h = t.hasil as { totalBiayaBulan?: number; simulasi?: { pendapatanBulan: number }[] } | null;
  if (!h?.totalBiayaBulan) return null;
  const tr = t.asumsi.transport as { rute?: { volumeBulan: number }[] } | undefined;
  const im = t.asumsi.intermodal as { rute?: { shipmentBulan: number }[] } | undefined;
  const vol = t.jenis_tender === 'intermodal' ? (im?.rute ?? []).reduce((s, r) => s + (Number(r.shipmentBulan) || 0), 0) : (tr?.rute ?? []).reduce((s, r) => s + (Number(r.volumeBulan) || 0), 0);
  return { sumber: 'Hasil tender transport tersimpan', satuanVolume: t.jenis_tender === 'intermodal' ? 'shipment' : 'unit', volumeIn: 0, volumeOut: vol, stokRata: 0, satuanStok: '-',
    headcount: 0, headcountDirect: 0, hariKerja: 25, luasM2: 0, posisiPalet: 0, biayaBulan: h.totalBiayaBulan, pendapatanBulan: h.simulasi?.[0]?.pendapatanBulan ?? 0, biayaKelompok: {} };
}

export const KOLOM_AKTUAL: { key: keyof AktualBulan; label: string; type: 'text' | 'number' }[] = [
  { key: 'periode', label: 'Periode (YYYY-MM)', type: 'text' },
  { key: 'volumeIn', label: 'Volume inbound', type: 'number' }, { key: 'volumeOut', label: 'Volume outbound', type: 'number' },
  { key: 'stokRata', label: 'Stok rata-rata', type: 'number' }, { key: 'headcount', label: 'Headcount total', type: 'number' },
  { key: 'headcountDirect', label: 'Headcount direct', type: 'number' }, { key: 'hariKerja', label: 'Hari kerja', type: 'number' },
  { key: 'luasDipakaiM2', label: 'Luas dipakai (m²)', type: 'number' }, { key: 'posisiPalet', label: 'Posisi palet tersedia', type: 'number' },
  { key: 'biayaBulan', label: 'Operational cost (Rp)', type: 'number' }, { key: 'pendapatanBulan', label: 'Pendapatan (Rp)', type: 'number' },
  { key: 'biayaManpower', label: 'Biaya manpower (Rp)', type: 'number' }, { key: 'biayaSewa', label: 'Biaya sewa / space (Rp)', type: 'number' },
  { key: 'biayaMhe', label: 'Biaya MHE (Rp)', type: 'number' }, { key: 'biayaUtilitas', label: 'Biaya utilitas (Rp)', type: 'number' },
  { key: 'biayaLain', label: 'Biaya lain (Rp)', type: 'number' }, { key: 'catatan', label: 'Catatan', type: 'text' },
];
