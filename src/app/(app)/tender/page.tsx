'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { rp, tanggal, INDUSTRI } from '@/lib/format';
import { useProfile } from '@/lib/useProfile';
import { STATUS, labelStatus, pillStatus } from '@/lib/status';

interface Baris {
  id: string; kode: string | null; customer: string; kab_kota: string; provinsi: string; industri: string | null; status: string; versi: number; updated_at: string; created_at: string; pic: string | null;
  hasil: { totalBiayaBulan?: number; redFlags?: { level: string }[]; simulasi?: { gpPersen: number }[] } | null;
}

/** Menu 5 & 9 · Daftar tender dan riwayat pekerjaan (semua versi tersimpan, filter status/industri/tahun). */
export default function DaftarTender() {
  const { profile, loading } = useProfile();
  const [rows, setRows] = useState<Baris[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [fil, setFil] = useState({ q: '', status: '', industri: '', tahun: '' });
  useEffect(() => {
    supabaseBrowser().from('tenders').select('id, kode, customer, kab_kota, provinsi, industri, status, versi, updated_at, created_at, pic, hasil').order('updated_at', { ascending: false })
      .then(({ data, error }: { data: Baris[] | null; error: { message: string } | null }) => { if (error) setErr(error.message); else setRows(data ?? []); });
  }, []);

  if (!loading && profile && !['admin', 'solution_design', 'commercial', 'finance'].includes(profile.role)) {
    return (
      <div className="card">
        <h2>Selamat datang, {profile.full_name || profile.email}</h2>
        <p>Role Anda mengelola master data dan tugas implementasi. Gunakan menu di samping untuk memperbarui data departemen Anda.</p>
      </div>
    );
  }

  const tahunList = Array.from(new Set(rows.map(r => r.created_at.slice(0, 4)))).sort().reverse();
  const tampil = rows.filter(r => (!fil.status || r.status === fil.status) && (!fil.industri || r.industri === fil.industri)
    && (!fil.tahun || r.created_at.startsWith(fil.tahun))
    && (!fil.q || `${r.kode} ${r.customer} ${r.kab_kota} ${r.pic ?? ''}`.toLowerCase().includes(fil.q.toLowerCase())));

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Menu 5 · 9 · Cost model & riwayat</div><h1>Tender</h1></div>
        <Link className="btn" href="/tender/baru">Tender baru</Link>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <input aria-label="Cari" placeholder="Cari kode, customer, kota, PIC…" value={fil.q} onChange={e => setFil({ ...fil, q: e.target.value })} style={{ maxWidth: 260, background: 'var(--surface)' }} />
        <select aria-label="Status" value={fil.status} onChange={e => setFil({ ...fil, status: e.target.value })} style={{ maxWidth: 180 }}><option value="">Semua status</option>{STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
        <select aria-label="Industri" value={fil.industri} onChange={e => setFil({ ...fil, industri: e.target.value })} style={{ maxWidth: 180 }}><option value="">Semua industri</option>{INDUSTRI.map(i => <option key={i}>{i}</option>)}</select>
        <select aria-label="Tahun" value={fil.tahun} onChange={e => setFil({ ...fil, tahun: e.target.value })} style={{ maxWidth: 120 }}><option value="">Semua tahun</option>{tahunList.map(t => <option key={t}>{t}</option>)}</select>
        <span className="small muted">{tampil.length} dari {rows.length} tender</span>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Kode</th><th>Customer</th><th>Industri</th><th>Lokasi</th><th>Status</th><th className="num">Biaya/bln</th><th className="num">GP komitmen</th><th>Red flag</th><th>Diubah</th></tr></thead>
          <tbody>
            {tampil.length === 0 && <tr><td colSpan={9} className="muted">Belum ada tender. Mulai dari tombol Tender baru.</td></tr>}
            {tampil.map(r => {
              const kritis = r.hasil?.redFlags?.filter(f => f.level === 'kritis').length ?? 0;
              const gp = r.hasil?.simulasi?.[0]?.gpPersen;
              return (
                <tr key={r.id}>
                  <td><Link href={`/tender/${r.id}`}>{r.kode ?? r.id.slice(0, 8)}</Link></td>
                  <td>{r.customer}{r.pic ? <div className="small muted">{r.pic}</div> : null}</td><td className="small">{r.industri ?? '—'}</td><td>{r.kab_kota}</td>
                  <td><span className={`pill ${pillStatus(r.status)}`}>{labelStatus(r.status)}</span> <span className="small muted">v{r.versi}</span></td>
                  <td className="num">{rp(r.hasil?.totalBiayaBulan)}</td>
                  <td className="num">{gp == null ? '—' : (gp * 100).toFixed(1) + '%'}</td>
                  <td>{r.hasil ? (kritis ? <span className="pill bad">{kritis} kritis</span> : <span className="pill ok">aman</span>) : '—'}</td>
                  <td className="small">{tanggal(r.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
