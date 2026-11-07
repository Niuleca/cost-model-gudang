'use client';
import { useMemo } from 'react';
import FilterTender from '@/components/FilterTender';
import { rp, persen, angka } from '@/lib/format';
import { JENIS_TENDER, grupStatus, nilaiKontrak, useTenderOverview, type Ov } from '@/lib/tenderOverview';

function ringkas(rows: Ov[]) {
  const n = { menang: 0, kalah: 0, drop: 0, pipeline: 0 }; let nilaiMenang = 0, gpM = 0, pdM = 0, siklus = 0, nSiklus = 0;
  for (const r of rows) {
    const g = grupStatus(r.status); n[g]++;
    if (g === 'menang') { nilaiMenang += nilaiKontrak(r); if (r.gp_persen != null && r.pendapatan_bulan) { gpM += Number(r.gp_persen) * Number(r.pendapatan_bulan); pdM += Number(r.pendapatan_bulan); } }
    if (r.tanggal_keputusan) { siklus += (new Date(r.tanggal_keputusan).getTime() - new Date(r.created_at).getTime()) / 86400000; nSiklus++; }
  }
  const diputus = n.menang + n.kalah;
  return { ...n, total: rows.length, winRate: diputus ? n.menang / diputus : null, nilaiMenang, gpMenang: pdM ? gpM / pdM : null, siklusHari: nSiklus ? siklus / nSiklus : null };
}

/** Logistics Tender → Monitoring → Tender Performance Analytics: win rate, nilai menang, GP, siklus, alasan kalah/drop. */
export default function TenderAnalytics() {
  const o = useTenderOverview();
  const all = useMemo(() => ringkas(o.data), [o.data]);
  const perJenis = useMemo(() => JENIS_TENDER.map(j => ({ l: j.l, ...ringkas(o.data.filter(r => (r.jenis_tender ?? 'warehouse') === j.v)) })), [o.data]);
  const perIndustri = useMemo(() => {
    const m = new Map<string, Ov[]>(); for (const r of o.data) { const k = (r.industri ?? 'Lainnya').trim() || 'Lainnya'; m.set(k, [...(m.get(k) ?? []), r]); }
    return Array.from(m, ([l, rs]) => ({ l, ...ringkas(rs) })).sort((a, b) => b.total - a.total).slice(0, 12);
  }, [o.data]);
  const perBulan = useMemo(() => {
    const m = new Map<string, Ov[]>(); for (const r of o.data) { const k = r.created_at.slice(0, 7); m.set(k, [...(m.get(k) ?? []), r]); }
    return Array.from(m, ([l, rs]) => ({ l, ...ringkas(rs) })).sort((a, b) => a.l.localeCompare(b.l)).slice(-12);
  }, [o.data]);
  const alasan = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of o.data) if (['kalah', 'drop'].includes(grupStatus(r.status)) && r.alasan_hasil) m.set(r.alasan_hasil.trim(), (m.get(r.alasan_hasil.trim()) ?? 0) + 1);
    return Array.from(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [o.data]);
  const maxBulan = Math.max(1, ...perBulan.map(b => b.total));
  const Tabel = ({ judul, rows }: { judul: string; rows: (ReturnType<typeof ringkas> & { l: string })[] }) => (
    <div className="card">
      <h2>{judul}</h2>
      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th></th><th className="num">Tender</th><th className="num">Menang</th><th className="num">Kalah</th><th className="num">Win rate</th><th className="num">Nilai menang</th><th className="num">GP menang</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.l}><td>{r.l}</td><td className="num">{r.total}</td><td className="num">{r.menang}</td><td className="num">{r.kalah}</td>
          <td className="num">{r.winRate == null ? '—' : persen(r.winRate, 0)}</td><td className="num">{rp(r.nilaiMenang)}</td><td className="num">{r.gpMenang == null ? '—' : persen(r.gpMenang)}</td></tr>)}</tbody>
      </table></div>
    </div>);
  return (<>
    <div className="head">
      <div><div className="eyebrow">Logistics Tender · Monitoring</div><h1>Tender Performance Analytics</h1></div>
      <FilterTender {...o} />
    </div>
    {o.err && <p className="error">{o.err}</p>}
    <div className="kpis">
      <div className="kpi"><span className="small muted">Total tender</span><b>{all.total}</b><span className="small muted">{all.pipeline} masih berjalan</span></div>
      <div className="kpi"><span className="small muted">Win rate</span><b>{all.winRate == null ? '—' : persen(all.winRate, 0)}</b><span className="small muted">{all.menang} menang · {all.kalah} kalah · {all.drop} drop</span></div>
      <div className="kpi"><span className="small muted">Nilai kontrak menang</span><b>{rp(all.nilaiMenang)}</b></div>
      <div className="kpi"><span className="small muted">GP rata-rata (menang)</span><b>{all.gpMenang == null ? '—' : persen(all.gpMenang)}</b><span className="small muted">tertimbang pendapatan</span></div>
      <div className="kpi"><span className="small muted">Siklus tender</span><b>{all.siklusHari == null ? '—' : `${angka(all.siklusHari)} hari`}</b><span className="small muted">dibuat → keputusan</span></div>
    </div>
    <div className="card">
      <h2>Tender per bulan (12 bulan terakhir)</h2>
      <div className="bulan-bar">{perBulan.map(b => (
        <div key={b.l} title={`${b.l}: ${b.total} tender, ${b.menang} menang`}>
          <div className="bb-tiang"><i style={{ height: `${b.total / maxBulan * 100}%` }} /><i className="menang" style={{ height: `${b.menang / maxBulan * 100}%` }} /></div>
          <span className="small muted">{b.l.slice(2).replace('-', '/')}</span><span className="small">{b.total}</span>
        </div>))}</div>
      <p className="small muted"><i className="lg-kotak" /> semua tender · <i className="lg-kotak menang" /> menang</p>
    </div>
    <div className="grid2">
      <Tabel judul="Per jenis tender" rows={perJenis} />
      <div className="card">
        <h2>Alasan kalah / drop terbanyak</h2>
        {alasan.length === 0 ? <p className="small muted">Belum ada alasan tercatat.</p>
          : <table><tbody>{alasan.map(([a, n]) => <tr key={a}><td>{a}</td><td className="num"><b>{n}</b></td></tr>)}</tbody></table>}
      </div>
    </div>
    <Tabel judul="Per industri" rows={perIndustri} />
  </>);
}
