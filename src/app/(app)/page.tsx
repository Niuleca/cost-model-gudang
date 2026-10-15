'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { rp, tanggal } from '@/lib/format';
import { useProfile } from '@/lib/useProfile';

interface Baris {
  id: string; kode: string | null; customer: string; kab_kota: string; status: string; versi: number; updated_at: string;
  hasil: { totalBiayaBulan?: number; redFlags?: { level: string }[]; simulasi?: { gpPersen: number }[] } | null;
}

const STATUS_PILL: Record<string, string> = {
  draft: 'info', dihitung: 'warn', review: 'warn', approved: 'ok', quotation_terkirim: 'ok', menang: 'ok', kalah: 'bad', batal: 'bad',
};

export default function Dashboard() {
  const { profile, loading } = useProfile();
  const [rows, setRows] = useState<Baris[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    supabaseBrowser().from('tenders').select('id, kode, customer, kab_kota, status, versi, updated_at, hasil').order('updated_at', { ascending: false })
      .then(({ data, error }: { data: Baris[] | null; error: { message: string } | null }) => { if (error) setErr(error.message); else setRows(data ?? []); });
  }, []);

  if (!loading && profile && !['admin', 'solution_design', 'commercial', 'finance'].includes(profile.role)) {
    return (
      <div className="card">
        <h2>Selamat datang, {profile.full_name || profile.email}</h2>
        <p>Role Anda mengelola master data. Buka <Link href="/master">Master data</Link> untuk memperbarui harga, produktivitas, atau parameter.</p>
      </div>
    );
  }

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">UC10–UC21</div><h1>Tender</h1></div>
        <Link className="btn" href="/tender/baru">Tender baru</Link>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="tablewrap">
        <table>
          <thead><tr><th>Kode</th><th>Customer</th><th>Lokasi</th><th>Status</th><th className="num">Biaya/bln</th><th className="num">GP komitmen</th><th>Red flag</th><th>Diubah</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="muted">Belum ada tender. Mulai dari tombol Tender baru.</td></tr>}
            {rows.map(r => {
              const kritis = r.hasil?.redFlags?.filter(f => f.level === 'kritis').length ?? 0;
              const gp = r.hasil?.simulasi?.[0]?.gpPersen;
              return (
                <tr key={r.id}>
                  <td><Link href={`/tender/${r.id}`}>{r.kode ?? r.id.slice(0, 8)}</Link></td>
                  <td>{r.customer}</td><td>{r.kab_kota}</td>
                  <td><span className={`pill ${STATUS_PILL[r.status] ?? 'info'}`}>{r.status.replace('_', ' ')}</span> <span className="small muted">v{r.versi}</span></td>
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
