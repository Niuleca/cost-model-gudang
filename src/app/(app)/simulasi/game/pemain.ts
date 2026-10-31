// Mode kerja pemain (motion study): pemain mengerjakan sendiri pekerjaan gudang di 3D; setiap elemen gerak diukur
// (jalan kosong, jalan bermuatan, aksi ambil/taruh/cek/dokumen) dalam detik nyata → waktu siklus & output per jam.
import type { JenisTugas } from '@/lib/game';

export type ModePemain = 'bebas' | 'cbt' | 'reach' | 'hpt' | 'checker' | 'picker' | 'admin';

export interface Elemen { s: number; m: number }
export interface SiklusStudi {
  no: number; mode: ModePemain; jenis: JenisTugas; ket: string;
  qty: number; satuan: 'palet' | 'karton' | 'dokumen';
  jalan: Elemen; bawa: Elemen; aksi: Record<string, number>; diam: number; total: number; tinggi: number;
}
export interface SiklusBerjalan { mulai: number; jalan: Elemen; bawa: Elemen; aksi: Record<string, number>; diam: number }
/** Status mode kerja pemain (ditulis lapisan 3D, dibaca & diubah UI). */
export interface StudiPemain {
  mode: ModePemain;
  level: number;                         // target level garpu (0 = lantai)
  minta: number;                         // naik 1 tiap tombol aksi (E) ditekan
  aksi: { nama: string; f: number; sisa: number } | null;
  bawa: 'palet' | 'karton' | 'dokumen' | null;
  petunjuk: string;
  siklus: SiklusStudi[];
  berjalan: SiklusBerjalan | null;
  kecepatan: number;                     // m/detik saat ini
  posisi?: { x: number; z: number };
  target?: { x: number; z: number; label: string; jarak: number } | null;
  pesan?: string;                        // umpan balik saat E tidak bisa dijalankan
  tarik?: boolean;                       // hand pallet: ditarik (true) / didorong
}
export const studiAwal = (): StudiPemain => ({ mode: 'bebas', level: 0, minta: 0, aksi: null, bawa: null, petunjuk: '', siklus: [], berjalan: null, kecepatan: 0 });

export const MODE_PEMAIN: Record<ModePemain, { label: string; ikon: string; ket: string; kec: { kosong: number; bawa: number } }> = {
  bebas: { label: 'Gerak bebas', ikon: '🚶', ket: 'Jalan bebas & amati pekerja lain (Shift = lari).', kec: { kosong: 1.4, bawa: 1.4 } },
  cbt: { label: 'Forklift CB', ikon: '🚜', ket: 'Counterbalance: ambil palet dari rak / lantai / staging dan taruh di slot rak, lantai, atau staging (tumpuk 2).', kec: { kosong: 3.0, bawa: 2.5 } },
  reach: { label: 'Reach truck', ikon: '🏗️', ket: 'Reach truck: putaway & picking palet sampai level atas, atau taruh di staging.', kec: { kosong: 2.5, bawa: 2.0 } },
  hpt: { label: 'Hand pallet', ikon: '🛒', ket: 'Pindahkan palet di lantai (dock ↔ staging ↔ lantai). T = ganti ditarik / didorong; dorong saat memasukkan garpu ke palet.', kec: { kosong: 1.4, bawa: 1.1 } },
  checker: { label: 'Checking', ikon: '✅', ket: 'Scan & cek qty / lot / kondisi palet.', kec: { kosong: 1.4, bawa: 1.4 } },
  picker: { label: 'Picking karton', ikon: '📦', ket: 'Ambil karton dari pick face (palet rak level 1) lalu susun di palet order di staging outbound.', kec: { kosong: 1.4, bawa: 1.25 } },
  admin: { label: 'Admin', ikon: '🗂️', ket: 'Terima dokumen di dock, lalu input & konfirmasi di meja admin.', kec: { kosong: 1.3, bawa: 1.3 } },
};

/** Waktu elemen standar (detik) untuk aksi di tempat — asumsi umum, dipakai bersama waktu jalan yang diukur. */
export const ELEMEN = {
  // waktu riil umum: luruskan garpu 2,5 dtk, masuk & angkat 3 dtk, letak & mundur 3 dtk; kecepatan angkat/turun mast sesuai spesifikasi forklift 2,5 t / reach 1,6 t
  posisi: 2.5, masukAngkat: 3, letakMundur: 3,
  naik: { cbt: 0.55, reach: 0.5 }, naikBeban: { cbt: 0.45, reach: 0.4 }, turun: { cbt: 0.5, reach: 0.55 },
  hptAmbil: 4, hptTaruh: 3, kartonAmbil: 2, kartonTaruh: 1.5, kartonJangkau: 1, scan: 8, dokTerima: 20, dokInput: 45,
};
/** Allowance personal, fatigue & delay untuk waktu standar dari hasil studi. */
export const PFD = 0.15;

export const LABEL_AKSI: Record<string, string> = {
  ambil: 'Ambil palet', taruh: 'Taruh palet', karton_ambil: 'Ambil karton', karton_taruh: 'Taruh karton', scan: 'Scan & cek', dok_terima: 'Terima dokumen', dok_input: 'Input & konfirmasi',
};

export interface RingkasStudi { jenis: JenisTugas; ket: string; n: number; qty: number; satuan: string; siklus: number; jalan: Elemen; bawa: Elemen; aksi: number; diam: number; outputJam: number; standarJam: number }
/** Rata-rata per jenis pekerjaan: waktu siklus, elemen, output observasi/jam & standar (dengan allowance PFD). */
export function ringkasStudi(siklus: SiklusStudi[]): RingkasStudi[] {
  const per = new Map<string, SiklusStudi[]>();
  for (const s of siklus) { const k = `${s.jenis}|${s.ket}`; per.set(k, [...(per.get(k) ?? []), s]); }
  return [...per.values()].map(xs => {
    const n = xs.length, rata = (f: (s: SiklusStudi) => number) => xs.reduce((a, s) => a + f(s), 0) / n;
    const qty = xs.reduce((a, s) => a + s.qty, 0); const siklusRata = rata(s => s.total);
    const qtyPer = qty / n;
    return {
      jenis: xs[0].jenis, ket: xs[0].ket, n, qty, satuan: xs[0].satuan, siklus: siklusRata,
      jalan: { s: rata(s => s.jalan.s), m: rata(s => s.jalan.m) }, bawa: { s: rata(s => s.bawa.s), m: rata(s => s.bawa.m) },
      aksi: rata(s => Object.values(s.aksi).reduce((a, b) => a + b, 0)), diam: rata(s => s.diam),
      outputJam: siklusRata > 0 ? (3600 / siklusRata) * qtyPer : 0,
      standarJam: siklusRata > 0 ? (3600 / (siklusRata * (1 + PFD))) * qtyPer : 0,
    };
  });
}

export function csvStudi(siklus: SiklusStudi[]) {
  const kepala = ['No', 'Mode', 'Pekerjaan', 'Keterangan', 'Qty', 'Satuan', 'Jalan kosong (dtk)', 'Jalan kosong (m)', 'Jalan bermuatan (dtk)', 'Jalan bermuatan (m)', 'Aksi (dtk)', 'Rincian aksi', 'Diam (dtk)', 'Tinggi (m)', 'Total siklus (dtk)'];
  const f = (v: number) => v.toFixed(1).replace('.', ',');
  const baris = siklus.map(s => [s.no, MODE_PEMAIN[s.mode].label, s.jenis, s.ket, s.qty, s.satuan, f(s.jalan.s), f(s.jalan.m), f(s.bawa.s), f(s.bawa.m),
    f(Object.values(s.aksi).reduce((a, b) => a + b, 0)), Object.entries(s.aksi).map(([k, v]) => `${LABEL_AKSI[k] ?? k} ${f(v)}`).join(' | '), f(s.diam), f(s.tinggi), f(s.total)]);
  return [kepala, ...baris].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
}
