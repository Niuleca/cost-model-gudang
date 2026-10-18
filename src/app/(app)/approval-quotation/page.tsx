'use client';
// Antrean approval quotation untuk manager / Super Admin: semua quotation berstatus "menunggu" dari SD & BD.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { isApprover, STATUS_QUOTATION } from '@/lib/akses';
import { tanggal, rp } from '@/lib/format';

interface Row {
  id: string; nomor: string; status: string; tanggal: string; revisi: number; created_by: string | null; diajukan_at: string | null;
  catatan_approval: string | null; diputus_at: string | null; rate_card: { layanan: string; tarif: number }[];
  tender: { id: string; kode: string | null; customer: string } | null;
}

export default function ApprovalQuotationPage() {
  const sb = supabaseBrowser();
  const { profile } = useProfile();
  const [rows, setRows] = useState<Row[]>([]);
  const [nama, setNama] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'menunggu' | 'semua'>('menunggu');

  useEffect(() => {
    (async () => {
      let q = sb.from('quotations').select('id, nomor, status, tanggal, revisi, created_by, diajukan_at, catatan_approval, diputus_at, rate_card, tender:tenders(id, kode, customer)')
        .order('diajukan_at', { ascending: false, nullsFirst: false }).limit(200);
      if (filter === 'menunggu') q = q.eq('status', 'menunggu');
      else q = q.in('status', ['menunggu', 'revisi', 'ditolak', 'approved']);
      const { data } = await q;
      const r = (data ?? []) as unknown as Row[];
      setRows(r);
      const ids = Array.from(new Set(r.map(x => x.created_by).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: ps } = await sb.from('profiles').select('id, full_name, email, role').in('id', ids);
        setNama(Object.fromEntries(((ps ?? []) as { id: string; full_name: string; email: string }[]).map(p => [p.id, p.full_name || p.email])));
      }
    })();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (profile && !isApprover(profile)) return <p>Halaman ini khusus manager / Super Admin.</p>;
  return (<>
    <div className="head"><div><div className="eyebrow">Tender</div><h1>Approval quotation</h1>
      <p className="muted">Quotation dari Solution Design & Business Development yang menunggu keputusan. Buka tender untuk Approve, Revisi, atau Tolak (catatan wajib).</p></div></div>
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={filter === 'menunggu'} className={filter === 'menunggu' ? 'on' : ''} onClick={() => setFilter('menunggu')}>Menunggu</button>
      <button role="tab" aria-selected={filter === 'semua'} className={filter === 'semua' ? 'on' : ''} onClick={() => setFilter('semua')}>Riwayat keputusan</button>
    </div>
    <div className="card"><div className="tablewrap"><table>
      <thead><tr><th>Nomor</th><th>Customer</th><th>Dibuat oleh</th><th>Diajukan</th><th>Status</th><th>Tarif</th><th>Catatan</th><th /></tr></thead>
      <tbody>
        {rows.map(r => { const st = STATUS_QUOTATION[r.status] ?? { l: r.status, kelas: 'info' };
          return <tr key={r.id}><td>{r.nomor}{r.revisi ? <span className="small muted"> · rev {r.revisi}</span> : null}</td>
            <td>{r.tender?.customer ?? '—'}<div className="small muted">{r.tender?.kode}</div></td>
            <td>{r.created_by ? nama[r.created_by] ?? '…' : '—'}</td>
            <td className="small">{r.diajukan_at ? tanggal(r.diajukan_at) : tanggal(r.tanggal)}</td>
            <td><span className={`pill ${st.kelas}`}>{st.l}</span></td>
            <td className="small">{(r.rate_card ?? []).slice(0, 3).map(x => `${x.layanan} ${rp(x.tarif)}`).join(' · ')}</td>
            <td className="small">{r.catatan_approval ?? ''}</td>
            <td>{r.tender && <Link className="btn ghost" href={`/tender/${r.tender.id}?tab=Quotation`}>Buka</Link>}</td></tr>; })}
        {!rows.length && <tr><td colSpan={8} className="muted">{filter === 'menunggu' ? 'Tidak ada quotation yang menunggu approval.' : 'Belum ada data.'}</td></tr>}
      </tbody>
    </table></div></div>
  </>);
}
