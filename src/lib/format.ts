export const rp = (n: number | null | undefined, desimal = 0) =>
  n == null || !isFinite(Number(n)) ? '—' : 'Rp' + Number(n).toLocaleString('id-ID', { minimumFractionDigits: desimal, maximumFractionDigits: desimal });

export const angka = (n: number | null | undefined, desimal = 0) =>
  n == null || !isFinite(Number(n)) ? '—' : Number(n).toLocaleString('id-ID', { minimumFractionDigits: desimal, maximumFractionDigits: desimal });

export const persen = (n: number | null | undefined, desimal = 1) =>
  n == null || !isFinite(Number(n)) ? '—' : (Number(n) * 100).toLocaleString('id-ID', { minimumFractionDigits: desimal, maximumFractionDigits: desimal }) + '%';

export const tanggal = (s: string | null | undefined) =>
  !s ? '—' : new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export type AppRole =
  | 'admin' | 'solution_design' | 'commercial' | 'finance'
  | 'hr' | 'procurement' | 'it' | 'engineering' | 'operations';

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Admin', solution_design: 'Solution Design', commercial: 'Tender / Commercial', finance: 'Finance',
  hr: 'HR', procurement: 'Procurement', it: 'IT', engineering: 'Engineering', operations: 'Operations',
};

export const TIM_TENDER: AppRole[] = ['admin', 'solution_design', 'commercial', 'finance'];

export const BUCKET_LABEL: Record<string, string> = {
  storage: 'Storage', handling_in: 'Handling In', handling_out: 'Handling Out', vas: 'VAS', manajemen: 'Manajemen',
};

// Industri untuk benchmark produktivitas (kolom benchmark di tabel productivity)
export const INDUSTRI = ['Retail-Consumer', 'Tech', 'Fashion Retail', 'Healthcare', 'Healthcare + Cold Chain', 'E-Commerce', 'FMCG', 'Bahan bangunan', 'Otomotif', 'Kimia'];
