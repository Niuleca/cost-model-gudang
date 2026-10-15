'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import StatusControl from '@/components/StatusControl';
import { STATUS, labelStatus } from '@/lib/status';
import { rp, tanggal } from '@/lib/format';

interface T { id: string; kode: string | null; customer: string; kab_kota: string; status: string; alasan_hasil: string | null; tanggal_go_live: string | null; pic: string | null; updated_at: string; hasil: { simulasi?: { pendapatanBulan: number }[] } | null }
interface Log { tender_id: string; ke: string; waktu: string }
interface Tg { tender_id: string; status: string; target: string | null; progress: number }

const KOLOM: { judul: string; status: string[] }[] = [
  { judul: 'Penyusunan', status: ['draft', 'dihitung', 'review', 'approved'] },
  { judul: 'Di customer', status: ['quotation_terkirim', 'negosiasi'] },
  { judul: 'Menang → eksekusi', status: ['menang', 'implementasi', 'go_live'] },
  { judul: 'Selesai / tidak lanjut', status: ['selesai', 'kalah', 'drop', 'batal'] },
];

/** Menu 14 · Kontrol status project: berapa lama di status sekarang, macet di mana, progress implementasi. */
export default function StatusProject() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<T[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [tugas, setTugas] = useState<Tg[]>([]);
  const [buka, setBuka] = useState<string | null>(null);
  const [batasHari, setBatasHari] = useState(14);

  const muat = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      sb.from('tenders').select('id, kode, customer, kab_kota, status, alasan_hasil, tanggal_go_live, pic, updated_at, hasil').order('updated_at', { ascending: false }),
      sb.from('tender_status_log').select('tender_id, ke, waktu').order('waktu', { ascending: false }),
      sb.from('implementation_tasks').select('tender_id, status, target, progress'),
    ]);
    setRows((a.data ?? []) as T[]); setLog((b.data ?? []) as Log[]); setTugas((c.data ?? []) as Tg[]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { muat(); }, [muat]);

  const sejak = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of log) if (!m.has(l.tender_id)) m.set(l.tender_id, l.waktu);   // log terbaru per tender
    return m;
  }, [log]);
  const hari = (t: T) => Math.floor((Date.now() - new Date(sejak.get(t.id) ?? t.updated_at).getTime()) / 86400000);
  const hariIni = new Date().toISOString().slice(0, 10);
  const impl = (id: string) => {
    const xs = tugas.filter(t => t.tender_id === id);
    return xs.length ? { p: Math.round(xs.reduce((s, x) => s + x.progress, 0) / xs.length), telat: xs.filter(x => x.status !== 'Selesai' && x.target && x.target < hariIni).length } : null;
  };
  const macet = (t: T) => !['selesai', 'kalah', 'drop', 'batal'].includes(t.status) && hari(t) > batasHari;

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Menu 14 · Running status</div><h1>Kontrol status project</h1></div>
        <label className="f" htmlFor="bh">Tandai macet jika lebih dari (hari) di status yang sama
          <input id="bh" type="number" min={1} value={batasHari} onChange={e => setBatasHari(Number(e.target.value) || 14)} style={{ maxWidth: 120 }} /></label>
      </div>
      <div className="kpis">
        {STATUS.map(s => { const n = rows.filter(r => r.status === s.v).length; return n ? <div key={s.v} className="kpi"><span className="small muted">{s.l}</span><b>{n}</b></div> : null; })}
        <div className="kpi"><span className="small muted">Macet &gt; {batasHari} hari</span><b>{rows.filter(macet).length}</b></div>
      </div>
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))' }}>
        {KOLOM.map(k => (
          <section key={k.judul} className="card" style={{ background: 'var(--surface-2)', alignContent: 'start' }}>
            <h2>{k.judul} <span className="small muted">({rows.filter(r => k.status.includes(r.status)).length})</span></h2>
            {rows.filter(r => k.status.includes(r.status)).map(t => {
              const im = impl(t.id);
              return (
                <div key={t.id} className="card" style={{ padding: 10, gap: 6, borderLeft: `4px solid ${macet(t) ? 'var(--bad)' : 'var(--line)'}` }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <Link href={`/tender/${t.id}`}><b>{t.customer}</b></Link>
                    <span className="pill info">{labelStatus(t.status)}</span>
                  </div>
                  <span className="small muted">{t.kode} · {t.kab_kota}{t.pic ? ` · ${t.pic}` : ''}</span>
                  <span className="small">{hari(t)} hari di status ini{macet(t) ? ' — perlu tindak lanjut' : ''}</span>
                  {t.hasil?.simulasi?.[0] && <span className="small">Pendapatan {rp(t.hasil.simulasi[0].pendapatanBulan)}/bln</span>}
                  {t.alasan_hasil && <span className="small muted">Alasan: {t.alasan_hasil}</span>}
                  {im && <span className="small">Implementasi {im.p}%{im.telat ? ` · ${im.telat} tugas terlambat` : ''} · go-live {tanggal(t.tanggal_go_live)}</span>}
                  {buka === t.id
                    ? <StatusControl tender={t} onBerubah={() => { setBuka(null); muat(); }} />
                    : <button className="ghost" onClick={() => setBuka(t.id)}>Ubah status</button>}
                </div>);
            })}
          </section>
        ))}
      </div>
    </>
  );
}
