'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { MENANG, labelStatus, pillStatus } from '@/lib/status';
import { JENIS_TENDER } from '@/lib/tenderOverview';
import { rp } from '@/lib/format';
import type { AnalisisProyek } from '@/lib/analisisProyek';

interface Baris { id: string; kode: string | null; customer: string; kab_kota: string; status: string; jenis_tender: string; updated_at: string;
  hasil: { totalBiayaBulan?: number; simulasi?: { pendapatanBulan: number; gpPersen: number }[] } | null; analisis: AnalisisProyek | null }

/** Project Analysis: daftar project (default yang sudah menang / berjalan) → asumsi sistem vs kinerja aktual. */
export default function AnalisisProyekDaftar() {
  const [rows, setRows] = useState<Baris[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [semua, setSemua] = useState(false);
  const [jenis, setJenis] = useState('');
  useEffect(() => {
    supabaseBrowser().from('tenders').select('id, kode, customer, kab_kota, status, jenis_tender, updated_at, hasil, analisis:asumsi->analisis').order('updated_at', { ascending: false })
      .then(({ data, error }: { data: Baris[] | null; error: { message: string } | null }) => { if (error) setErr(error.message); else setRows(data ?? []); });
  }, []);
  const tampil = useMemo(() => rows.filter(r => (semua || MENANG.includes(r.status) || (r.analisis?.aktual?.length ?? 0) > 0) && (!jenis || r.jenis_tender === jenis)), [rows, semua, jenis]);
  const gp = (x?: number | null) => (x == null ? '—' : `${(x * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
  const gpAktual = (a: AnalisisProyek | null) => {
    const r = [...(a?.aktual ?? [])].sort((x, y) => x.periode.localeCompare(y.periode)).at(-1);
    return r && r.pendapatanBulan ? (Number(r.pendapatanBulan) - Number(r.biayaBulan ?? 0)) / Number(r.pendapatanBulan) : null;
  };
  return (
    <>
      <div className="head"><div><div className="eyebrow">Dashboard</div><h1>Project Analysis</h1></div></div>
      <p className="small muted">Bandingkan asumsi sistem (hasil Solution Design & Costing) dengan kinerja aktual project: volume, manpower, space utilization, produktivitas, biaya operasi & gross margin — lengkap dengan variance, akar masalah dan tindakan korektif.</p>
      <div className="row">
        <button className={semua ? 'ghost' : ''} aria-pressed={!semua} onClick={() => setSemua(false)}>Project berjalan</button>
        <button className={semua ? '' : 'ghost'} aria-pressed={semua} onClick={() => setSemua(true)}>Semua tender</button>
        <select aria-label="Jenis tender" value={jenis} onChange={e => setJenis(e.target.value)} style={{ maxWidth: 200 }}><option value="">Semua jenis</option>{JENIS_TENDER.map(j => <option key={j.v} value={j.v}>{j.l}</option>)}</select>
        <span className="small muted">{tampil.length} project</span>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="card"><div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>Project</th><th>Jenis</th><th>Status</th><th className="num">Pendapatan rencana / bln</th><th className="num">GP rencana</th><th className="num">GP aktual terakhir</th><th className="num">Bulan aktual</th><th className="num">Tindakan terbuka</th></tr></thead>
        <tbody>
          {tampil.length === 0 && <tr><td colSpan={8} className="muted">Belum ada project berjalan. Pilih “Semua tender” untuk mulai mencatat aktual.</td></tr>}
          {tampil.map(r => { const s = r.hasil?.simulasi?.[0]; const ga = gpAktual(r.analisis); return (
            <tr key={r.id}>
              <td><Link href={`/analisis/${r.id}`}><b>{r.customer}</b></Link><div className="small muted">{r.kode ?? '—'} · {r.kab_kota}</div></td>
              <td>{JENIS_TENDER.find(j => j.v === r.jenis_tender)?.l ?? r.jenis_tender}</td>
              <td><span className={`pill ${pillStatus(r.status)}`}>{labelStatus(r.status)}</span></td>
              <td className="num">{s ? rp(s.pendapatanBulan) : '—'}</td><td className="num">{gp(s?.gpPersen)}</td>
              <td className="num" style={{ color: ga != null && s && ga < s.gpPersen - 0.03 ? 'var(--bad)' : undefined }}>{gp(ga)}</td>
              <td className="num">{r.analisis?.aktual?.length ?? 0}</td>
              <td className="num">{(r.analisis?.tindakan ?? []).filter(x => x.status === 'rencana' || x.status === 'berjalan').length}</td>
            </tr>); })}
        </tbody>
      </table></div></div>
    </>);
}
