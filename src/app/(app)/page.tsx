'use client';
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

/** Menu 15 · Dashboard: customer, pipeline, menang/kalah/drop, sebaran per provinsi. */
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

  const perProvinsi = useMemo(() => {
    const m = new Map<string, { total: number; pipeline: number; menang: number; kalah: number; drop: number }>();
    for (const r of data) {
      const x = m.get(r.provinsi) ?? { total: 0, pipeline: 0, menang: 0, kalah: 0, drop: 0 };
      x.total++; x[grup(r.status)]++; m.set(r.provinsi, x);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [data]);
  const maks = Math.max(1, ...perProvinsi.flatMap(([, v]) => [v.pipeline, v.menang, v.kalah, v.drop]));

  const perIndustri = useMemo(() => {
    const m = new Map<string, { menang: number; kalah: number; drop: number; pipeline: number }>();
    for (const r of data) { const key = r.industri ?? 'Belum diisi'; const x = m.get(key) ?? { menang: 0, kalah: 0, drop: 0, pipeline: 0 }; x[grup(r.status)]++; m.set(key, x); }
    return Array.from(m.entries()).sort((a, b) => (b[1].menang + b[1].kalah + b[1].drop + b[1].pipeline) - (a[1].menang + a[1].kalah + a[1].drop + a[1].pipeline));
  }, [data]);

  if (!loading && profile && !TIM_TENDER.includes(profile.role)) {
    return (
      <div className="card">
        <h2>Selamat datang, {profile.full_name || profile.email}</h2>
        <p>Gunakan menu di samping untuk memperbarui data departemen Anda, dan buka <Link href="/implementasi">Implementasi</Link> untuk tugas project yang ditugaskan ke departemen Anda.</p>
      </div>
    );
  }

  const sel = (v: number) => v === 0 ? undefined : { background: `color-mix(in srgb, var(--accent) ${Math.round(12 + 70 * v / maks)}%, var(--surface))`, color: v / maks > 0.55 ? 'var(--accent-ink)' : undefined };
  const keputusan = data.filter(r => ['menang', 'kalah', 'drop', 'batal'].includes(r.status)).slice(0, 8);

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Menu 15 · Dashboard</div><h1>Ringkasan tender & project</h1></div>
        <label className="f" htmlFor="th">Tahun dibuat
          <select id="th" value={tahun} onChange={e => setTahun(e.target.value)} style={{ minWidth: 140 }}><option value="">Semua</option>{tahunList.map(t => <option key={t}>{t}</option>)}</select></label>
      </div>
      {err && <p className="error">{err}</p>}

      <div className="kpis">
        <div className="kpi"><span className="small muted">Customer</span><b>{k.customer}</b><span className="small muted">{data.length} tender</span></div>
        <div className="kpi"><span className="small muted">Pipeline aktif</span><b>{k.pipeline}</b><span className="small muted">nilai kontrak {rp(k.nilaiPipeline)}</span></div>
        <div className="kpi"><span className="small muted">Menang</span><b>{k.menang}</b><span className="small muted">nilai kontrak {rp(k.nilaiMenang)}</span></div>
        <div className="kpi"><span className="small muted">Kalah</span><b>{k.kalah}</b></div>
        <div className="kpi"><span className="small muted">Drop / batal</span><b>{k.drop}</b></div>
        <div className="kpi"><span className="small muted">Win rate (menang ÷ diputus)</span><b>{k.winRate == null ? '—' : persen(k.winRate, 0)}</b></div>
        <div className="kpi"><span className="small muted">Sedang dieksekusi</span><b>{k.eksekusi}</b><span className="small muted">implementasi + go-live</span></div>
      </div>

      <div className="card">
        <h2>Sebaran per provinsi</h2>
        <p className="small muted">Warna makin gelap = makin banyak tender. Arahkan kursor ke sel untuk detail.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Provinsi</th><th className="num">Total</th><th className="num">Pipeline</th><th className="num">Menang</th><th className="num">Kalah</th><th className="num">Drop</th><th className="num">Win rate</th></tr></thead>
          <tbody>
            {perProvinsi.length === 0 && <tr><td colSpan={7} className="muted">Belum ada tender.</td></tr>}
            {perProvinsi.map(([p, v]) => (
              <tr key={p}>
                <td>{p}</td><td className="num"><b>{v.total}</b></td>
                {(['pipeline', 'menang', 'kalah', 'drop'] as const).map(g => (
                  <td key={g} className="num" style={sel(v[g])} title={`${p} · ${g}: ${v[g]} tender`}>{v[g] || ''}</td>))}
                <td className="num">{v.menang + v.kalah ? persen(v.menang / (v.menang + v.kalah), 0) : '—'}</td>
              </tr>))}
          </tbody>
        </table></div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Per industri</h2>
          <table><thead><tr><th>Industri</th><th className="num">Pipeline</th><th className="num">Menang</th><th className="num">Kalah</th><th className="num">Drop</th></tr></thead>
            <tbody>{perIndustri.map(([i, v]) => <tr key={i}><td>{i}</td><td className="num">{v.pipeline}</td><td className="num">{v.menang}</td><td className="num">{v.kalah}</td><td className="num">{v.drop}</td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h2>Keputusan terakhir</h2>
          {keputusan.length === 0 && <p className="muted small">Belum ada tender yang diputus.</p>}
          <table><tbody>{keputusan.map(r => (
            <tr key={r.id}>
              <td><Link href={`/tender/${r.id}`}>{r.customer}</Link><div className="small muted">{r.alasan_hasil ?? 'alasan belum diisi'}</div></td>
              <td><span className={`pill ${pillStatus(r.status)}`}>{labelStatus(r.status)}</span></td>
              <td className="small">{tanggal(r.tanggal_keputusan)}</td>
            </tr>))}</tbody></table>
        </div>
      </div>

      <div className="card">
        <h2>Pipeline berjalan</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Kode</th><th>Customer</th><th>Lokasi</th><th>Status</th><th className="num">Pendapatan/bln</th><th className="num">GP</th></tr></thead>
          <tbody>{data.filter(r => PIPELINE.includes(r.status)).slice(0, 15).map(r => (
            <tr key={r.id}><td><Link href={`/tender/${r.id}`}>{r.kode}</Link></td><td>{r.customer}</td><td>{r.kab_kota}</td>
              <td><span className={`pill ${pillStatus(r.status)}`}>{labelStatus(r.status)}</span></td>
              <td className="num">{rp(r.pendapatan_bulan)}</td><td className="num">{persen(r.gp_persen)}</td></tr>))}</tbody>
        </table></div>
      </div>
    </>
  );
}
