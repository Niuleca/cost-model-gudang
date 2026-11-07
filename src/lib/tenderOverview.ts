'use client';
// Data ringkas semua tender (view tender_overview) untuk menu Monitoring: Pipeline, Status & Tracking, Performance Analytics.
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from './supabase/client';
import { MENANG, KALAH, DROP } from './status';

export type JenisTender = 'warehouse' | 'transportation' | 'intermodal';
export const JENIS_TENDER: { v: JenisTender; l: string }[] = [
  { v: 'warehouse', l: 'Warehouse' }, { v: 'transportation', l: 'Transportation' }, { v: 'intermodal', l: 'Intermodal' },
];
export interface Ov {
  id: string; kode: string | null; customer: string; industri: string | null; provinsi: string; kab_kota: string; status: string;
  created_at: string; updated_at: string; tanggal_keputusan: string | null; alasan_hasil: string | null;
  pendapatan_bulan: number | null; biaya_bulan: number | null; gp_persen: number | null; durasi_kontrak_bulan: number;
  jenis_tender: JenisTender | null;
}
/** Halaman tender sesuai jenis (warehouse /tender, transportation /transport, intermodal /intermodal). */
export const hrefTender = (r: { id: string; jenis_tender?: JenisTender | string | null }) =>
  `${r.jenis_tender === 'transportation' ? '/transport' : r.jenis_tender === 'intermodal' ? '/intermodal' : '/tender'}/${r.id}`;
export const grupStatus = (s: string) => MENANG.includes(s) ? 'menang' : KALAH.includes(s) ? 'kalah' : DROP.includes(s) ? 'drop' : 'pipeline';
export const nilaiKontrak = (r: Ov) => Number(r.pendapatan_bulan ?? 0) * (r.durasi_kontrak_bulan || 0);
export const hariSejak = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

export function useTenderOverview() {
  const [rows, setRows] = useState<Ov[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [siap, setSiap] = useState(false);
  useEffect(() => {
    supabaseBrowser().from('tender_overview')
      .select('id, kode, customer, industri, provinsi, kab_kota, status, created_at, updated_at, tanggal_keputusan, alasan_hasil, pendapatan_bulan, biaya_bulan, gp_persen, durasi_kontrak_bulan, jenis_tender')
      .order('updated_at', { ascending: false })
      .then(({ data, error }: { data: unknown; error: { message: string } | null }) => { if (error) setErr(error.message); else setRows((data ?? []) as Ov[]); setSiap(true); });
  }, []);
  const [jenis, setJenis] = useState<'' | JenisTender>('');
  const [tahun, setTahun] = useState('');
  const tahunList = useMemo(() => Array.from(new Set(rows.map(r => r.created_at.slice(0, 4)))).sort().reverse(), [rows]);
  const data = useMemo(() => rows.filter(r => (!jenis || (r.jenis_tender ?? 'warehouse') === jenis) && (!tahun || r.created_at.startsWith(tahun))), [rows, jenis, tahun]);
  return { rows, data, err, siap, jenis, setJenis, tahun, setTahun, tahunList };
}
