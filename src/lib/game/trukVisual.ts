// Posisi & keterangan truk di dock untuk tampilan 2D/3D: mundur masuk selama fase sandar, diam selama bongkar/muat,
// jalan keluar di menit-menit terakhir fase dokumen. Berbasis waktu game supaya ikut kecepatan simulasi.
import type { Dunia, Truk } from './tipe';
import { WAKTU_DOCK } from './dunia';

const JARAK_MASUK = 26;    // meter dari posisi sandar ke halaman
const MENIT_KELUAR = 4;    // menit game terakhir fase dokumen dipakai untuk jalan keluar

/** Jarak truk dari posisi sandar (m, 0 = menempel dock). */
export function posisiTrukDock(d: Dunia, tr: Truk | undefined): number {
  if (!tr || tr.masukDock == null) return 0;
  const c = (x: number) => Math.max(0, Math.min(1, x));
  if (tr.fase === 'sandar') {
    const f = c((d.t - tr.masukDock) / (WAKTU_DOCK.sandarMenit * 60 * 0.75));   // 75% fase sandar = manuver mundur
    return (1 - f) * (1 - f) * JARAK_MASUK;
  }
  if (tr.fase === 'dokumen' && tr.faseSampai != null) {
    const e = c((d.t - (tr.faseSampai - MENIT_KELUAR * 60)) / (MENIT_KELUAR * 60));
    return e * e * JARAK_MASUK;
  }
  return 0;
}

/** Keterangan aktivitas truk: sandar · bongkar x/y · muat x/y · dokumen · keluar. */
export function faseTrukTeks(d: Dunia, tr: Truk | undefined): string {
  if (!tr) return '';
  if (tr.status === 'antre') return 'antre';
  if (tr.status !== 'di_dock') return '';
  const menit = (t: number) => `${Math.max(0, Math.round((t - d.t) / 60))} mnt`;
  if (tr.fase === 'sandar') return tr.faseSampai != null && d.t < tr.faseSampai - WAKTU_DOCK.sandarMenit * 60 * 0.25 ? 'mundur ke dock' : `buka segel · surat jalan · ${menit(tr.faseSampai ?? d.t)}`;
  if (tr.fase === 'dokumen') return tr.faseSampai != null && d.t >= tr.faseSampai - MENIT_KELUAR * 60 ? 'keluar' : `segel & dokumen · ${menit(tr.faseSampai ?? d.t)}`;
  if (tr.arus === 'inbound') { const n = tr.palet.length; return `bongkar ${n - Math.max(0, tr.sisaTugas)}/${n} plt`; }
  const os = tr.order.map(x => d.order.get(x)).filter(Boolean);
  const dimuat = os.filter(o => o!.status === 'terkirim').length; const siap = os.filter(o => o!.status === 'dimuat' || o!.status === 'terkirim').length;
  return siap ? `muat ${dimuat}/${os.length} order` : `tunggu barang staging (0/${os.length})`;
}
