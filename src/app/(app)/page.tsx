'use client';
import { T, useT } from '@/lib/i18n';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { rp, persen, tanggal, TIM_TENDER } from '@/lib/format';
import { MENANG, KALAH, DROP, PIPELINE, labelStatus, pillStatus } from '@/lib/status';

interface Ov {
  id: string; kode: string | null; customer: string; industri: string | null; provinsi: string; kab_kota: string; status: string;
  created_at: string; tanggal_keputusan: string | null; alasan_hasil: string | null; pendapatan_bulan: number | null; gp_persen: number | null;
  durasi_kontrak_bulan: number;
}

const grup = (s: string) => MENANG.includes(s) ? 'menang' : KALAH.includes(s) ? 'kalah' : DROP.includes(s) ? 'drop' : 'pipeline';

/** Dashboard ringkas: nilai pipeline, GP, win rate, tender yang perlu tindakan, keputusan terakhir. */
export default function Dashboard() {
  const { profile, loading } = useProfile();
  const [rows, setRows] = useState<Ov[]>([]);
  const [tahun, setTahun] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    supabaseBrowser().from('tender_overview').select('id, kode, customer, industri, provinsi, kab_kota, status, created_at, tanggal_keputusan, alasan_hasil, pendapatan_bulan, gp_persen, durasi_kontrak_bulan')
      .order('created_at', { ascending: false })
      .then(({ data, error }: { data: unknown; error: { message: string } | null }) => { if (error) setErr(error.message); else setRows((data ?? []) as Ov[]); });
  }, []);

  const tahunList = useMemo(() => Array.from(new Set(rows.map(r => r.created_at.slice(0, 4)))).sort().reverse(), [rows]);
  const data = useMemo(() => rows.filter(r => !tahun || r.created_at.startsWith(tahun)), [rows, tahun]);

  const k = useMemo(() => {
    const n = { pipeline: 0, menang: 0, kalah: 0, drop: 0 };
    let nilaiPipeline = 0, nilaiMenang = 0;
    for (const r of data) {
      const g = grup(r.status); n[g]++;
      const kontrak = Number(r.pendapatan_bulan ?? 0) * r.durasi_kontrak_bulan;
      if (g === 'pipeline') nilaiPipeline += kontrak;
      if (g === 'menang') nilaiMenang += kontrak;
    }
    const diputus = n.menang + n.kalah;
    return { ...n, customer: new Set(data.map(r => r.customer.trim().toLowerCase())).size, winRate: diputus ? n.menang / diputus : null,
      nilaiPipeline, nilaiMenang, eksekusi: data.filter(r => ['implementasi', 'go_live'].includes(r.status)).length };
  }, [data]);

  // Rata-rata GP pipeline (tertimbang pendapatan) & tender yang perlu tindakan
  const pipe = useMemo(() => data.filter(r => PIPELINE.includes(r.status)), [data]);
  const gpRata = useMemo(() => {
    const ada = pipe.filter(r => r.gp_persen != null && Number(r.pendapatan_bulan) > 0);
    const tot = ada.reduce((s2, r) => s2 + Number(r.pendapatan_bulan), 0);
    return tot ? ada.reduce((s2, r) => s2 + Number(r.gp_persen) * Number(r.pendapatan_bulan), 0) / tot : null;
  }, [pipe]);
  const GP_MIN = 0.1;
  const perhatian = useMemo(() => pipe.map(r => ({ r, alasan: r.pendapatan_bulan == null ? 'Belum dihitung' : Number(r.gp_persen ?? 0) < GP_MIN ? `GP ${persen(r.gp_persen)} di bawah ${persen(GP_MIN, 0)}` : null }))
    .filter(x => x.alasan).slice(0, 8), [pipe]);
  const nilaiBulanPipeline = pipe.reduce((s2, r) => s2 + Number(r.pendapatan_bulan ?? 0), 0);

  if (!loading && profile && !TIM_TENDER.includes(profile.role)) {
    return (
      <div className="card">
        <h2>Selamat datang, {profile.full_name || profile.email}</h2>
        <p>Gunakan menu di samping untuk memperbarui data departemen Anda, dan buka <Link href="/implementasi">Implementasi</Link> untuk tugas project yang ditugaskan ke departemen Anda.</p>
      </div>
    );
  }

  const keputusan = data.filter(r => ['menang', 'kalah', 'drop', 'batal'].includes(r.status)).slice(0, 6);
  const gpPill = (g: number | null) => g == null ? 'info' : g < GP_MIN ? 'bad' : g < 0.15 ? 'warn' : 'ok';

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Dashboard</div><h1><T>Ringkasan tender</T></h1></div>
        <label className="f" htmlFor="th"><T>Tahun dibuat</T>
          <select id="th" value={tahun} onChange={e => setTahun(e.target.value)} style={{ minWidth: 140 }}><option value="">Semua</option>{tahunList.map(t => <option key={t}>{t}</option>)}</select></label>
      </div>
      {err && <p className="error">{err}</p>}

      <div className="kpis">
        <div className="kpi"><span className="small muted"><T>Pipeline aktif</T></span><b>{k.pipeline} tender</b><span className="small muted">selling {rp(nilaiBulanPipeline)}/bln</span></div>
        <div className="kpi"><span className="small muted"><T>Nilai kontrak pipeline</T></span><b>{rp(k.nilaiPipeline)}</b><span className="small muted">selling/bln × durasi kontrak</span></div>
        <div className="kpi"><span className="small muted"><T>Rata-rata GP pipeline</T></span><b>{gpRata == null ? '—' : persen(gpRata)}</b><span className="small muted">tertimbang pendapatan</span></div>
        <div className="kpi"><span className="small muted"><T>Menang</T></span><b>{k.menang}</b><span className="small muted">nilai kontrak {rp(k.nilaiMenang)}</span></div>
        <div className="kpi"><span className="small muted"><T>Win rate</T></span><b>{k.winRate == null ? '—' : persen(k.winRate, 0)}</b><span className="small muted">{k.menang} menang · {k.kalah} kalah · {k.drop} drop</span></div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2><T>Pipeline berjalan</T></h2><Link className="btn ghost" href="/tender"><T>Semua tender</T></Link></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Kode</th><th>Customer</th><th>Lokasi</th><th>Status</th><th className="num">Selling/bln</th><th className="num">GP</th><th className="num">Kontrak</th></tr></thead>
          <tbody>
            {pipe.length === 0 && <tr><td colSpan={7} className="muted">Tidak ada tender berjalan.</td></tr>}
            {pipe.slice(0, 15).map(r => (
              <tr key={r.id}><td><Link href={`/tender/${r.id}`}>{r.kode}</Link></td><td>{r.customer}</td><td className="small">{r.kab_kota}</td>
                <td><span className={`pill ${pillStatus(r.status)}`}>{labelStatus(r.status)}</span></td>
                <td className="num out">{rp(r.pendapatan_bulan)}</td><td className="num"><span className={`pill ${gpPill(r.gp_persen)}`}>{persen(r.gp_persen)}</span></td>
                <td className="num small">{r.durasi_kontrak_bulan} bln</td></tr>))}
          </tbody>
        </table></div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2><T>Perlu tindakan</T></h2>
          <p className="small muted">Tender berjalan yang belum dihitung atau GP-nya di bawah {persen(GP_MIN, 0)}.</p>
          {perhatian.length === 0 && <p className="small" style={{ color: 'var(--ok)' }}>Semua tender berjalan sudah dihitung dan GP aman.</p>}
          <table><tbody>{perhatian.map(({ r, alasan }) => (
            <tr key={r.id}><td><Link href={`/tender/${r.id}`}>{r.customer}</Link><div className="small muted">{r.kode}</div></td>
              <td className="small"><span className={`pill ${alasan === 'Belum dihitung' ? 'warn' : 'bad'}`}>{alasan}</span></td></tr>))}</tbody></table>
        </div>
        <div className="card">
          <h2><T>Keputusan terakhir</T></h2>
          {keputusan.length === 0 && <p className="muted small">Belum ada tender yang diputus.</p>}
          <table><tbody>{keputusan.map(r => (
            <tr key={r.id}>
              <td><Link href={`/tender/${r.id}`}>{r.customer}</Link><div className="small muted">{r.alasan_hasil ?? 'alasan belum diisi'}</div></td>
              <td><span className={`pill ${pillStatus(r.status)}`}>{labelStatus(r.status)}</span></td>
              <td className="small">{tanggal(r.tanggal_keputusan)}</td>
            </tr>))}</tbody></table>
          <p className="small muted" style={{ marginTop: 8 }}>Sebaran per provinsi & industri ada di menu <Link href="/heatmap">Heatmap</Link>.</p>
        </div>
      </div>
    </>
  );
}
