'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import FilterTender from '@/components/FilterTender';
import { rp, persen } from '@/lib/format';
import { STATUS } from '@/lib/status';
import { grupStatus, hariSejak, hrefTender, nilaiKontrak, useTenderOverview } from '@/lib/tenderOverview';

const TAHAP = STATUS.filter(s => s.grup === 'pipeline');
const JENIS_SINGKAT: Record<string, string> = { warehouse: 'WH', transportation: 'TR', intermodal: 'IM' };

/** Logistics Tender → Monitoring → Tender Pipeline: papan per tahap (draft s/d negosiasi) + nilai per tahap. */
export default function TenderPipeline() {
  const o = useTenderOverview();
  const kol = useMemo(() => TAHAP.map(s => {
    const isi = o.data.filter(r => r.status === s.v);
    return { s, isi, bulan: isi.reduce((t, r) => t + Number(r.pendapatan_bulan ?? 0), 0), kontrak: isi.reduce((t, r) => t + nilaiKontrak(r), 0) };
  }), [o.data]);
  const hasil = useMemo(() => {
    const n = { menang: 0, kalah: 0, drop: 0 }; for (const r of o.data) { const g = grupStatus(r.status); if (g !== 'pipeline') n[g]++; } return n;
  }, [o.data]);
  const total = kol.reduce((t, k) => t + k.kontrak, 0);
  return (<>
    <div className="head">
      <div><div className="eyebrow">Logistics Tender · Monitoring</div><h1>Tender Pipeline</h1><p className="small muted">Nilai = selling/bln × durasi kontrak · angka hari = sejak update terakhir</p></div>
      <FilterTender {...o} />
    </div>
    {o.err && <p className="error">{o.err}</p>}
    <div className="kpis">
      <div className="kpi"><span className="small muted">Tender di pipeline</span><b>{kol.reduce((t, k) => t + k.isi.length, 0)}</b></div>
      <div className="kpi"><span className="small muted">Nilai kontrak pipeline</span><b>{rp(total)}</b></div>
      <div className="kpi"><span className="small muted">Hasil</span><b>{hasil.menang} menang</b><span className="small muted">{hasil.kalah} kalah · {hasil.drop} drop</span></div>
    </div>
    <div className="pipe-papan">
      {kol.map(k => (
        <div key={k.s.v} className="pipe-kolom">
          <div className="pipe-judul"><b>{k.s.l}</b><span className="pill info">{k.isi.length}</span></div>
          <div className="small muted">{rp(k.bulan)}/bln</div>
          <div className="pipe-bar"><i style={{ width: `${total ? Math.max(2, k.kontrak / total * 100) : 0}%` }} /></div>
          {k.isi.length === 0 && <p className="small muted">—</p>}
          {k.isi.slice(0, 25).map(r => {
            const hari = hariSejak(r.updated_at);
            return (
              <Link key={r.id} href={hrefTender(r)} className="pipe-kartu">
                <span className="satu-baris"><b>{r.customer}</b></span>
                <span className="small muted satu-baris">{JENIS_SINGKAT[r.jenis_tender ?? 'warehouse']} · {r.kode ?? '—'} · {r.kab_kota}</span>
                <span className="row small" style={{ gap: 6 }}>
                  <span>{rp(r.pendapatan_bulan)}</span>
                  {r.gp_persen != null && <span className={`pill ${Number(r.gp_persen) < 0.1 ? 'bad' : Number(r.gp_persen) < 0.15 ? 'warn' : 'ok'}`}>{persen(r.gp_persen)}</span>}
                  <span className={`pill ${hari > 14 ? 'bad' : hari > 7 ? 'warn' : 'info'}`}>{hari} hr</span>
                </span>
              </Link>);
          })}
          {k.isi.length > 25 && <p className="small muted">+{k.isi.length - 25} lainnya</p>}
        </div>))}
    </div>
  </>);
}
