'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { ROLE_LABEL, TIM_TENDER, tanggal, type AppRole } from '@/lib/format';

interface Tugas {
  id: number; tender_id: string; fase: string; tugas: string; departemen: AppRole | null; pic: string | null; mulai: string | null;
  target: string | null; selesai: string | null; status: string; progress: number; catatan: string | null; urutan: number;
}
interface T { id: string; kode: string | null; customer: string; status: string; tanggal_go_live: string | null }
const STATUS_TUGAS = ['Belum mulai', 'Berjalan', 'Selesai', 'Terlambat', 'Blocked'];
const hariIni = () => new Date().toISOString().slice(0, 10);
const efektif = (t: Tugas) => t.status !== 'Selesai' && t.target && t.target < hariIni() ? 'Terlambat' : t.status;

/** Menu 13 · List implementasi per project (tugas per departemen, target, progress). */
export default function Implementasi() {
  const sb = supabaseBrowser();
  const { profile } = useProfile();
  const [tugas, setTugas] = useState<Tugas[]>([]);
  const [tenders, setTenders] = useState<T[]>([]);
  const [pilih, setPilih] = useState('');
  const [dept, setDept] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const timTender = !!profile && TIM_TENDER.includes(profile.role);

  const muat = useCallback(async () => {
    const [a, b] = await Promise.all([
      sb.from('implementation_tasks').select('*').order('urutan'),
      sb.from('tenders').select('id, kode, customer, status, tanggal_go_live').in('status', ['menang', 'implementasi', 'go_live', 'selesai']).order('updated_at', { ascending: false }),
    ]);
    if (a.error) setErr(a.error.message);
    setTugas((a.data ?? []) as Tugas[]); setTenders((b.data ?? []) as T[]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => { if (profile && !timTender) setDept(profile.role); }, [profile, timTender]);

  const daftarTender = useMemo(() => {
    const ids = new Set(tugas.map(t => t.tender_id));
    return tenders.filter(t => ids.has(t.id) || timTender);
  }, [tugas, tenders, timTender]);
  const tampil = tugas.filter(t => (!pilih || t.tender_id === pilih) && (!dept || t.departemen === dept));

  async function ubah(t: Tugas, patch: Partial<Tugas>) {
    if (patch.status === 'Selesai') { patch.progress = 100; patch.selesai = patch.selesai ?? hariIni(); }
    if (patch.progress === 100 && !patch.status) patch.status = 'Selesai';
    setTugas(xs => xs.map(x => x.id === t.id ? { ...x, ...patch } : x));
    const { error } = await sb.from('implementation_tasks').update(patch).eq('id', t.id);
    if (error) { setErr(error.message); muat(); }
  }
  async function buatChecklist(t: T) {
    const { error } = await sb.rpc('buat_checklist_implementasi', { p_tender: t.id, p_golive: t.tanggal_go_live });
    if (error) setErr(error.message); else muat();
  }
  async function tambah() {
    if (!pilih) return;
    const { error } = await sb.from('implementation_tasks').insert({ tender_id: pilih, fase: '9. Tambahan', tugas: 'Tugas baru', urutan: 999 });
    if (error) setErr(error.message); else muat();
  }

  const ringkas = (id: string) => {
    const xs = tugas.filter(t => t.tender_id === id);
    const selesai = xs.filter(t => t.status === 'Selesai').length;
    return { n: xs.length, selesai, telat: xs.filter(t => efektif(t) === 'Terlambat').length, progress: xs.length ? Math.round(xs.reduce((s, t) => s + t.progress, 0) / xs.length) : 0 };
  };
  const bolehUbah = (t: Tugas) => timTender || (profile && t.departemen === profile.role);

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Menu 13 · Implementasi</div><h1>List implementasi project</h1></div>
        <div className="row">
          <select aria-label="Departemen" value={dept} onChange={e => setDept(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">Semua departemen</option>{(Object.keys(ROLE_LABEL) as AppRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        </div>
      </div>
      {err && <p className="error small" role="alert">{err}</p>}

      <div className="grid3">
        {daftarTender.map(t => {
          const r = ringkas(t.id);
          return (
            <button key={t.id} className="card" onClick={() => setPilih(pilih === t.id ? '' : t.id)}
              style={{ textAlign: 'left', color: 'var(--ink)', background: 'var(--surface)', borderColor: pilih === t.id ? 'var(--floor)' : 'var(--line)', gap: 6, display: 'grid' }}>
              <b>{t.customer}</b>
              <span className="small muted">{t.kode} · go-live {tanggal(t.tanggal_go_live)}</span>
              {r.n ? <>
                <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4 }} role="progressbar" aria-valuenow={r.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
                  <div style={{ width: `${r.progress}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                </div>
                <span className="small">{r.progress}% · {r.selesai}/{r.n} selesai{r.telat ? ` · ${r.telat} terlambat` : ''}</span>
              </> : <span className="small muted">Belum ada checklist</span>}
            </button>);
        })}
        {daftarTender.length === 0 && <p className="muted">Belum ada project menang. Ubah status tender ke “Menang” untuk membuat checklist implementasi.</p>}
      </div>

      {pilih && timTender && (
        <div className="row">
          {ringkas(pilih).n === 0 && <button onClick={() => { const t = tenders.find(x => x.id === pilih); if (t) buatChecklist(t); }}>Buat checklist standar</button>}
          <button className="ghost" onClick={tambah}>Tambah tugas</button>
          <Link className="btn ghost" href={`/tender/${pilih}`}>Buka tender</Link>
        </div>
      )}

      <div className="tablewrap"><table>
        <thead><tr><th>Project</th><th>Fase</th><th>Tugas</th><th>Departemen</th><th>PIC</th><th>Target</th><th>Status</th><th className="num">Progress</th><th>Catatan</th></tr></thead>
        <tbody>
          {tampil.length === 0 && <tr><td colSpan={9} className="muted">Tidak ada tugas.</td></tr>}
          {tampil.map(t => {
            const tr = tenders.find(x => x.id === t.tender_id);
            const st = efektif(t);
            const edit = bolehUbah(t);
            return (
              <tr key={t.id}>
                <td className="small">{tr?.customer ?? '—'}</td>
                <td className="small">{t.fase}</td>
                <td>{timTender ? <input aria-label="Tugas" value={t.tugas} onChange={e => setTugas(xs => xs.map(x => x.id === t.id ? { ...x, tugas: e.target.value } : x))} onBlur={e => ubah(t, { tugas: e.target.value })} style={{ minWidth: 240 }} /> : t.tugas}</td>
                <td>{timTender ? <select aria-label="Departemen" value={t.departemen ?? ''} onChange={e => ubah(t, { departemen: (e.target.value || null) as AppRole | null })}>
                  <option value="">—</option>{(Object.keys(ROLE_LABEL) as AppRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
                  : t.departemen ? ROLE_LABEL[t.departemen] : '—'}</td>
                <td>{edit ? <input aria-label="PIC" defaultValue={t.pic ?? ''} onBlur={e => e.target.value !== (t.pic ?? '') && ubah(t, { pic: e.target.value })} style={{ minWidth: 110 }} /> : t.pic ?? '—'}</td>
                <td>{edit ? <input aria-label="Target" type="date" value={t.target ?? ''} onChange={e => ubah(t, { target: e.target.value || null })} /> : tanggal(t.target)}</td>
                <td>{edit ? <select aria-label="Status" value={t.status} onChange={e => ubah(t, { status: e.target.value })}>{STATUS_TUGAS.map(s => <option key={s}>{s}</option>)}</select> : null}
                  {st === 'Terlambat' && <span className="pill bad" style={{ marginTop: 4 }}>terlambat</span>}
                  {!edit && st !== 'Terlambat' && <span className={`pill ${st === 'Selesai' ? 'ok' : st === 'Blocked' ? 'bad' : 'warn'}`}>{st}</span>}</td>
                <td className="num">{edit ? <input aria-label="Progress" type="number" min={0} max={100} step={10} value={t.progress} onChange={e => ubah(t, { progress: Math.max(0, Math.min(100, Number(e.target.value))) })} style={{ width: 70 }} /> : `${t.progress}%`}</td>
                <td>{edit ? <input aria-label="Catatan" defaultValue={t.catatan ?? ''} onBlur={e => e.target.value !== (t.catatan ?? '') && ubah(t, { catatan: e.target.value })} /> : t.catatan}</td>
              </tr>);
          })}
        </tbody>
      </table></div>
    </>
  );
}
