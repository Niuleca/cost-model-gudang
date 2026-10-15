'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { rp, persen } from '@/lib/format';
import { labelStatus } from '@/lib/status';

interface Audit { id: number; tabel: string; row_id: string | null; aksi: string; ringkas: string | null; oleh: string | null; waktu: string }
interface Versi { id: number; tender_id: string; versi: number; catatan: string | null; created_at: string; snapshot: { hasil?: { totalBiayaBulan?: number; simulasi?: { gpPersen: number }[]; totalHeadcount?: number } } }
interface StatusLog { id: number; tender_id: string; dari: string | null; ke: string; catatan: string | null; waktu: string; oleh: string | null }
interface Prof { id: string; full_name: string; email: string | null }
interface T { id: string; kode: string | null; customer: string }

const TABEL: Record<string, string> = {
  tenders: 'Tender', quotations: 'Quotation', price_items: 'Harga item', warehouses: 'Gudang', it_catalog: 'Katalog IT', productivity: 'Produktivitas',
  umk: 'UMK', job_levels: 'Jabatan', payroll_params: 'Komponen OS', implementation_tasks: 'Implementasi', margin_policy: 'Margin',
};
const waktu = (s: string) => new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Menu 9 · Riwayat pekerjaan: siapa mengubah apa, versi hitung per tender, perjalanan status. */
export default function Riwayat() {
  const sb = supabaseBrowser();
  const [tab, setTab] = useState<'versi' | 'status' | 'audit'>('versi');
  const [audit, setAudit] = useState<Audit[]>([]);
  const [versi, setVersi] = useState<Versi[]>([]);
  const [status, setStatus] = useState<StatusLog[]>([]);
  const [prof, setProf] = useState<Prof[]>([]);
  const [tenders, setTenders] = useState<T[]>([]);
  const [fTender, setFTender] = useState('');
  const [fTabel, setFTabel] = useState('');

  useEffect(() => {
    Promise.all([
      sb.from('audit_log').select('*').order('waktu', { ascending: false }).limit(500),
      sb.from('tender_versions').select('id, tender_id, versi, catatan, created_at, snapshot').order('created_at', { ascending: false }).limit(300),
      sb.from('tender_status_log').select('*').order('waktu', { ascending: false }).limit(500),
      sb.from('profiles').select('id, full_name, email'),
      sb.from('tenders').select('id, kode, customer'),
    ]).then(([a, v, s, p, t]) => {
      setAudit((a.data ?? []) as Audit[]); setVersi((v.data ?? []) as Versi[]); setStatus((s.data ?? []) as StatusLog[]);
      setProf((p.data ?? []) as Prof[]); setTenders((t.data ?? []) as T[]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nama = (id: string | null) => { const p = prof.find(x => x.id === id); return p ? (p.full_name || p.email) : '—'; };
  const tn = useMemo(() => new Map(tenders.map(t => [t.id, t])), [tenders]);
  const labelT = (id: string) => { const t = tn.get(id); return t ? `${t.kode ?? ''} · ${t.customer}` : id.slice(0, 8); };

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Menu 9 · Historis</div><h1>Riwayat pekerjaan</h1></div>
        <select aria-label="Filter tender" value={fTender} onChange={e => setFTender(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">Semua tender</option>{tenders.map(t => <option key={t.id} value={t.id}>{t.kode} · {t.customer}</option>)}</select>
      </div>
      <div className="tabs" role="tablist">
        {([['versi', 'Versi cost model'], ['status', 'Perjalanan status'], ['audit', 'Log perubahan data']] as const).map(([k, l]) =>
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'versi' && <div className="tablewrap"><table>
        <thead><tr><th>Waktu</th><th>Tender</th><th className="num">Versi</th><th className="num">Biaya/bln</th><th className="num">HC</th><th className="num">GP komitmen</th><th>Catatan</th></tr></thead>
        <tbody>{versi.filter(v => !fTender || v.tender_id === fTender).map(v => (
          <tr key={v.id}><td className="small">{waktu(v.created_at)}</td><td><Link href={`/tender/${v.tender_id}`}>{labelT(v.tender_id)}</Link></td><td className="num">v{v.versi}</td>
            <td className="num">{rp(v.snapshot?.hasil?.totalBiayaBulan)}</td><td className="num">{v.snapshot?.hasil?.totalHeadcount ?? '—'}</td>
            <td className="num">{persen(v.snapshot?.hasil?.simulasi?.[0]?.gpPersen)}</td><td className="small">{v.catatan}</td></tr>))}</tbody>
      </table></div>}

      {tab === 'status' && <div className="tablewrap"><table>
        <thead><tr><th>Waktu</th><th>Tender</th><th>Dari</th><th>Ke</th><th>Catatan</th><th>Oleh</th></tr></thead>
        <tbody>{status.filter(s => !fTender || s.tender_id === fTender).map(s => (
          <tr key={s.id}><td className="small">{waktu(s.waktu)}</td><td><Link href={`/tender/${s.tender_id}`}>{labelT(s.tender_id)}</Link></td>
            <td>{s.dari ? labelStatus(s.dari) : '—'}</td><td><b>{labelStatus(s.ke)}</b></td><td className="small">{s.catatan}</td><td className="small">{nama(s.oleh)}</td></tr>))}</tbody>
      </table></div>}

      {tab === 'audit' && <>
        <div className="row"><select aria-label="Data" value={fTabel} onChange={e => setFTabel(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">Semua data</option>{Object.entries(TABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <span className="small muted">500 perubahan terakhir</span></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Waktu</th><th>Data</th><th>Aksi</th><th>Ringkas</th><th>Oleh</th></tr></thead>
          <tbody>{audit.filter(a => (!fTabel || a.tabel === fTabel) && (!fTender || a.row_id === fTender)).map(a => (
            <tr key={a.id}><td className="small">{waktu(a.waktu)}</td><td>{TABEL[a.tabel] ?? a.tabel}</td>
              <td><span className={`pill ${a.aksi === 'delete' ? 'bad' : a.aksi === 'insert' ? 'ok' : 'info'}`}>{a.aksi === 'insert' ? 'tambah' : a.aksi === 'update' ? 'ubah' : 'hapus'}</span></td>
              <td>{a.tabel === 'tenders' && a.row_id ? <Link href={`/tender/${a.row_id}`}>{a.ringkas}</Link> : a.ringkas}</td><td className="small">{nama(a.oleh)}</td></tr>))}</tbody>
        </table></div>
      </>}
    </>
  );
}
