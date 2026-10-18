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
