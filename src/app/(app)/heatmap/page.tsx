'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ROLE_LABEL, type AppRole } from '@/lib/format';

interface T { id: string; kode: string | null; customer: string; status: string; created_at: string }
interface Tg { tender_id: string; departemen: AppRole | null; status: string; target: string | null }

type Metrik = 'selesai' | 'backlog' | 'waiting';
const METRIK: Record<Metrik, { label: string; warna: string; arti: string }> = {
  selesai: { label: 'Penyelesaian', warna: 'var(--ok)', arti: 'Tender sudah diputus (menang, kalah, drop, batal, go-live, selesai). Tugas implementasi berstatus Selesai.' },
  backlog: { label: 'Backlog', warna: 'var(--warn)', arti: 'Tender masih dikerjakan tim (draft, dihitung, review, approved). Tugas implementasi Belum mulai / Berjalan; angka merah = sudah lewat target.' },
  waiting: { label: 'Waiting', warna: 'var(--accent)', arti: 'Tender menunggu customer (quotation terkirim, negosiasi). Tugas implementasi berstatus Blocked (menunggu pihak lain).' },
};
const GRUP_TENDER: Record<Metrik, string[]> = {
  selesai: ['menang', 'kalah', 'drop', 'batal', 'implementasi', 'go_live', 'selesai'],
  backlog: ['draft', 'dihitung', 'review', 'approved'],
  waiting: ['quotation_terkirim', 'negosiasi'],
};
const hariIni = () => new Date().toISOString().slice(0, 10);
const metrikTugas = (t: Tg): Metrik => t.status === 'Selesai' ? 'selesai' : t.status === 'Blocked' ? 'waiting' : 'backlog';
const bulanLabel = (ym: string) => new Date(`${ym}-01`).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });

/** Sel heatmap: warna makin pekat makin banyak. */
function Sel({ n, maks, warna, telat }: { n: number; maks: number; warna: string; telat?: number }) {
  const pct = n ? Math.round(18 + 72 * (n / Math.max(1, maks))) : 0;
  return (
    <td className="num" title={telat ? `${n} item, ${telat} lewat target` : `${n} item`}
      style={{ background: n ? `color-mix(in srgb, ${warna} ${pct}%, var(--surface))` : 'var(--surface)', color: pct > 55 ? 'var(--surface)' : 'var(--ink)',
        fontWeight: n ? 600 : 400, minWidth: 44, textAlign: 'center', border: '1px solid var(--line)' }}>
      {n || ''}{telat ? <span style={{ color: pct > 55 ? 'var(--surface)' : 'var(--bad)', fontSize: 11 }}> ({telat}!)</span> : null}
    </td>);
}

/** Dashboard · Heatmap penyelesaian project, backlog, dan waiting. */
export default function Heatmap() {
  const sb = supabaseBrowser();
  const [tenders, setTenders] = useState<T[]>([]);
  const [tugas, setTugas] = useState<Tg[]>([]);
  const [metrik, setMetrik] = useState<Metrik>('backlog');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      sb.from('tenders').select('id, kode, customer, status, created_at'),
      sb.from('implementation_tasks').select('tender_id, departemen, status, target'),
    ]).then(([a, b]) => {
      if (a.error) setErr(a.error.message);
      setTenders((a.data ?? []) as T[]); setTugas((b.data ?? []) as Tg[]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Heatmap 1: tender per bulan dibuat × kategori ----
  const bulan = useMemo(() => {
    const now = new Date(); const xs: string[] = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); xs.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    return xs;
  }, []);
  const awal = bulan[0];
  const pipa = useMemo(() => {
    const m: Record<Metrik, Record<string, number>> = { selesai: {}, backlog: {}, waiting: {} };
    for (const t of tenders) {
      const ym = t.created_at.slice(0, 7) < awal ? 'lama' : t.created_at.slice(0, 7);
      for (const k of Object.keys(GRUP_TENDER) as Metrik[]) if (GRUP_TENDER[k].includes(t.status)) m[k][ym] = (m[k][ym] ?? 0) + 1;
    }
    return m;
  }, [tenders, awal]);

  // ---- Heatmap 2: project × departemen untuk metrik terpilih ----
  const depts = useMemo(() => Array.from(new Set(tugas.map(t => t.departemen ?? '—'))).sort(), [tugas]);
  const proj = useMemo(() => {
    const ids = Array.from(new Set(tugas.map(t => t.tender_id)));
    return ids.map(id => {
      const t = tenders.find(x => x.id === id);
      const sel: Record<string, { n: number; telat: number }> = {};
      let total = 0;
      for (const g of tugas.filter(x => x.tender_id === id && metrikTugas(x) === metrik)) {
        const d = g.departemen ?? '—';
        sel[d] = sel[d] ?? { n: 0, telat: 0 }; sel[d].n++; total++;
        if (metrik === 'backlog' && g.target && g.target < hariIni()) sel[d].telat++;
      }
      return { id, nama: t ? `${t.kode ?? ''} · ${t.customer}` : id.slice(0, 8), sel, total, semua: tugas.filter(x => x.tender_id === id).length };
    }).sort((a, b) => b.total - a.total);
  }, [tugas, tenders, metrik]);
  const maks2 = Math.max(1, ...proj.flatMap(p => Object.values(p.sel).map(s => s.n)));
  const total = (k: Metrik) => tenders.filter(t => GRUP_TENDER[k].includes(t.status)).length;
  const totalTugas = (k: Metrik) => tugas.filter(t => metrikTugas(t) === k).length;

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Dashboard · Heatmap</div><h1>Penyelesaian, backlog & waiting</h1></div>
        <Link className="btn ghost" href="/status">Buka status project</Link>
      </div>
      {err && <p className="error small" role="alert">{err}</p>}

      <div className="kpis">
        {(Object.keys(METRIK) as Metrik[]).map(k => (
          <button key={k} className="kpi" aria-pressed={metrik === k} onClick={() => setMetrik(k)}
            style={{ textAlign: 'left', color: 'var(--ink)', background: 'var(--surface)', borderLeft: `6px solid ${METRIK[k].warna}`, outline: metrik === k ? `2px solid ${METRIK[k].warna}` : undefined }}>
            <span className="small muted">{METRIK[k].label}</span>
            <b>{total(k)} tender</b>
            <span className="small muted">{totalTugas(k)} tugas implementasi</span>
          </button>))}
      </div>

      <div className="card">
        <h2>Tender per bulan dibuat</h2>
        <p className="small muted">12 bulan terakhir; tender yang lebih lama dijumlah di kolom “Lebih lama”.</p>
        <div className="tablewrap"><table style={{ borderCollapse: 'collapse' }}>
          <thead><tr><th>Kategori</th><th className="num">Lebih lama</th>{bulan.map(b => <th key={b} className="num">{bulanLabel(b)}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>{(Object.keys(METRIK) as Metrik[]).map(k => {
            const maks = Math.max(1, ...Object.values(pipa[k]));
            return (
              <tr key={k}>
                <td><b style={{ color: METRIK[k].warna }}>■</b> {METRIK[k].label}</td>
                <Sel n={pipa[k].lama ?? 0} maks={maks} warna={METRIK[k].warna} />
                {bulan.map(b => <Sel key={b} n={pipa[k][b] ?? 0} maks={maks} warna={METRIK[k].warna} />)}
                <td className="num"><b>{total(k)}</b></td>
              </tr>);
          })}</tbody>
        </table></div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Implementasi: project × departemen</h2>
          <div className="row" role="group" aria-label="Metrik">
            {(Object.keys(METRIK) as Metrik[]).map(k => <button key={k} className={metrik === k ? '' : 'ghost'} aria-pressed={metrik === k} onClick={() => setMetrik(k)}>{METRIK[k].label}</button>)}
          </div>
        </div>
        <p className="small muted">{METRIK[metrik].arti}</p>
        {proj.length === 0 ? <p className="muted">Belum ada checklist implementasi. Buat dari menu Tender → Implementation / Project Charter.</p> : (
          <div className="tablewrap"><table style={{ borderCollapse: 'collapse' }}>
            <thead><tr><th>Project</th>{depts.map(d => <th key={d} className="num">{d === '—' ? 'Tanpa dept.' : ROLE_LABEL[d as AppRole] ?? d}</th>)}<th className="num">Total</th><th className="num">% dari tugas</th></tr></thead>
            <tbody>{proj.map(p => (
              <tr key={p.id}>
                <td><Link href={`/tender/${p.id}`}>{p.nama}</Link></td>
                {depts.map(d => <Sel key={d} n={p.sel[d]?.n ?? 0} telat={p.sel[d]?.telat} maks={maks2} warna={METRIK[metrik].warna} />)}
                <td className="num"><b>{p.total}</b></td>
                <td className="num">{p.semua ? Math.round(100 * p.total / p.semua) : 0}%</td>
              </tr>))}</tbody>
          </table></div>)}
      </div>
    </>
  );
}
