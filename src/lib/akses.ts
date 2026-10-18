// Hak akses per role (cermin aturan di database — migrasi 0016).
import type { Profile } from './useProfile';

/** Manager / admin / master: approve quotation & quotation sendiri langsung approved. */
export const isApprover = (p: Profile | null | undefined) => !!p && (!!p.is_master || p.role === 'admin' || p.role === 'manager');
/** Export Excel lengkap: hanya master admin & manager. */
export const bolehExport = (p: Profile | null | undefined) => !!p && (!!p.is_master || p.role === 'manager');
/** Lihat password: tidak mungkin (tersimpan sebagai hash) — master hanya bisa kirim link reset. */
export const isMaster = (p: Profile | null | undefined) => !!p?.is_master;

export const STATUS_QUOTATION: Record<string, { l: string; kelas: string }> = {
  draft: { l: 'Draft', kelas: 'warn' },
  menunggu: { l: 'Menunggu approval', kelas: 'warn' },
  revisi: { l: 'Perlu revisi', kelas: 'bad' },
  ditolak: { l: 'Ditolak', kelas: 'bad' },
  approved: { l: 'Approved', kelas: 'ok' },
  terkirim: { l: 'Terkirim', kelas: 'ok' },
  direvisi: { l: 'Direvisi', kelas: 'info' },
  batal: { l: 'Batal', kelas: 'info' },
};
/** Unduh, print & kirim hanya setelah approved. */
export const bolehRilis = (status: string) => status === 'approved' || status === 'terkirim';

/** Status tender mengikuti quotation: ada yang terkirim → Quotation terkirim / Negosiasi (revisi);
 *  tidak ada lagi yang terkirim (dibatalkan, dihapus, approve dibatalkan) → kembali ke Dihitung. Status lain (menang, kalah, go-live, dll.) tidak disentuh. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sinkronStatusTender(sb: any, tenderId: string) {
  const [{ data: qs }, { data: tt }] = await Promise.all([
    sb.from('quotations').select('status, revisi').eq('tender_id', tenderId),
    sb.from('tenders').select('status').eq('id', tenderId).maybeSingle(),
  ]);
  const kirim = ((qs ?? []) as { status: string; revisi: number }[]).filter(x => x.status === 'terkirim');
  const skr = (tt as { status?: string } | null)?.status;
  const target = kirim.length ? (kirim.some(x => x.revisi > 0) ? 'negosiasi' : 'quotation_terkirim') : (skr === 'quotation_terkirim' || skr === 'negosiasi' ? 'dihitung' : null);
  if (target && target !== skr) await sb.from('tenders').update({ status: target }).eq('id', tenderId);
  return target ?? skr;
}
