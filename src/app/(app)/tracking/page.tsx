'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import FilterTender from '@/components/FilterTender';
import { rp, tanggal } from '@/lib/format';
import { STATUS, labelStatus, pillStatus } from '@/lib/status';
import { grupStatus, hariSejak, hrefTender, useTenderOverview } from '@/lib/tenderOverview';

/** Logistics Tender → Monitoring → Tender Status & Tracking: posisi tiap tender, lama di tahap sekarang, tender macet. */
export default function TenderTracking() {
  const o = useTenderOverview();
  const [cari, setCari] = useState('');
  const [grup, setGrup] = useState<'' | 'pipeline' | 'menang' | 'kalah' | 'drop' | 'macet'>('');
  const rows = useMemo(() => o.data.filter(r => {
    const g = grupStatus(r.status);
    if (grup === 'macet' ? !(g === 'pipeline' && hariSejak(r.updated_at) > 14) : grup && g !== grup) return false;
    const q = cari.trim().toLowerCase();
    return !q || `${r.customer} ${r.kode ?? ''} ${r.kab_kota} ${r.industri ?? ''}`.toLowerCase().includes(q);
  }), [o.data, grup, cari]);
  const macet = o.data.filter(r => grupStatus(r.status) === 'pipeline' && hariSejak(r.updated_at) > 14).length;
  const urut = STATUS.map(s => s.v);
  return (<>
    <div className="head">
      <div><div className="eyebrow">Logistics Tender · Monitoring</div><h1>Tender Status & Tracking</h1><p className="small muted">Tender pipeline tanpa update &gt; 14 hari ditandai macet</p></div>
      <FilterTender {...o} />
    </div>
    {o.err && <p className="error">{o.err}</p>}
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="tabs" role="tablist" aria-label="Kelompok status">
          {([['', 'Semua'], ['pipeline', 'Pipeline'], ['macet', `Macet (${macet})`], ['menang', 'Menang'], ['kalah', 'Kalah'], ['drop', 'Drop / batal']] as const).map(([v, l]) =>
            <button key={v} role="tab" aria-selected={grup === v} className={grup === v ? 'on' : ''} onClick={() => setGrup(v)}>{l}</button>)}
        </div>
        <input placeholder="Cari customer / kode / kota…" value={cari} onChange={e => setCari(e.target.value)} style={{ maxWidth: 260 }} />
      </div>
      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>Tender</th><th>Jenis</th><th>Tahap</th><th>Progres</th><th className="num">Update</th><th className="num">Selling/bln</th><th>Keputusan</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="muted">{o.siap ? 'Tidak ada tender.' : 'Memuat…'}</td></tr>}
          {rows.map(r => {
            const hari = hariSejak(r.updated_at); const g = grupStatus(r.status);
            const idx = Math.max(0, urut.indexOf(r.status)); const prog = g === 'pipeline' ? (idx + 1) / 7 : 1;
            return (
              <tr key={r.id}>
                <td><Link href={hrefTender(r)}><b>{r.customer}</b></Link><div className="small muted">{r.kode ?? '—'} · {r.kab_kota}</div></td>
                <td className="small">{(r.jenis_tender ?? 'warehouse').replace(/^./, c => c.toUpperCase())}</td>
                <td><span className={`pill ${pillStatus(r.status)}`}>{labelStatus(r.status)}</span></td>
                <td style={{ minWidth: 90 }}><div className="pipe-bar"><i style={{ width: `${prog * 100}%`, background: g === 'menang' ? 'var(--ok)' : g === 'pipeline' ? 'var(--g700)' : 'var(--bad)' }} /></div></td>
                <td className="num"><span className={`pill ${g === 'pipeline' && hari > 14 ? 'bad' : g === 'pipeline' && hari > 7 ? 'warn' : 'info'}`}>{hari} hr</span></td>
                <td className="num">{rp(r.pendapatan_bulan)}</td>
                <td className="small">{r.tanggal_keputusan ? <>{tanggal(r.tanggal_keputusan)}<div className="muted">{r.alasan_hasil ?? ''}</div></> : '—'}</td>
              </tr>);
          })}
        </tbody></table></div>
    </div>
  </>);
}
