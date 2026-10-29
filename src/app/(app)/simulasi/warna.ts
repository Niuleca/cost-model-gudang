import type { JenisMhe, KategoriOrang } from '@/lib/simulasi3d/layout';

export const WARNA_ORANG: Record<KategoriOrang, string> = {
  admin: '#8b5cf6', checker: '#2563eb', picker: '#16a34a', operator: '#f59e0b', tkbm: '#dc2626', supervisor: '#0f172a', security: '#334155', inventory: '#0891b2', lain: '#64748b',
};
export const WARNA_MHE: Record<JenisMhe, string> = { reach: '#facc15', forklift: '#f97316', stacker: '#eab308', hpt: '#ef4444', perangkat: '#94a3b8' };
