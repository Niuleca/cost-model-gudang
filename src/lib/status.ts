// Status project tender → implementasi.
export const STATUS: { v: string; l: string; grup: 'pipeline' | 'hasil' | 'eksekusi' }[] = [
  { v: 'draft', l: 'Draft', grup: 'pipeline' },
  { v: 'dihitung', l: 'Dihitung', grup: 'pipeline' },
  { v: 'review', l: 'Review internal', grup: 'pipeline' },
  { v: 'approved', l: 'Approved', grup: 'pipeline' },
  { v: 'quotation_terkirim', l: 'Quotation terkirim', grup: 'pipeline' },
  { v: 'negosiasi', l: 'Negosiasi', grup: 'pipeline' },
  { v: 'menang', l: 'Menang', grup: 'hasil' },
  { v: 'kalah', l: 'Kalah', grup: 'hasil' },
  { v: 'drop', l: 'Drop', grup: 'hasil' },
  { v: 'batal', l: 'Batal', grup: 'hasil' },
  { v: 'implementasi', l: 'Implementasi', grup: 'eksekusi' },
  { v: 'go_live', l: 'Go-live', grup: 'eksekusi' },
  { v: 'selesai', l: 'Selesai kontrak', grup: 'eksekusi' },
];
export const labelStatus = (s: string) => STATUS.find(x => x.v === s)?.l ?? s;
export const MENANG = ['menang', 'implementasi', 'go_live', 'selesai'];
export const KALAH = ['kalah'];
export const DROP = ['drop', 'batal'];
export const PIPELINE = STATUS.filter(s => s.grup === 'pipeline').map(s => s.v);
export const butuhAlasan = (s: string) => ['menang', 'kalah', 'drop', 'batal'].includes(s);
export const pillStatus = (s: string) => MENANG.includes(s) ? 'ok' : KALAH.includes(s) || DROP.includes(s) ? 'bad' : 'warn';
