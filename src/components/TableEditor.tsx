'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Profile } from '@/lib/useProfile';
import type { AppRole } from '@/lib/format';

export interface Kolom {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'percent' | 'date' | 'select' | 'bool' | 'textarea';
  options?: string[];
  width?: number;
  readonly?: boolean;
}

interface Props {
  table: string;
  view?: string;               // sumber baca (mis. view), default = table
  idKey?: string;
  kolom: Kolom[];
  orderBy?: { col: string; asc?: boolean }[];
  editorRoles: AppRole[];      // role yang boleh tambah/ubah
  approval?: boolean;          // tampilkan kolom status + tombol approve (SD/admin)
  defaults?: Record<string, unknown>;
  profile: Profile | null;
  cari?: string[];             // kolom yang dicari
  catatan?: string;
}

type Row = Record<string, unknown>;

export default function TableEditor(p: Props) {
  const sb = supabaseBrowser();
  const idKey = p.idKey ?? 'id';
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, Row>>({});
  const [baru, setBaru] = useState<Row | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const bolehEdit = !!p.profile && (p.profile.role === 'admin' || p.editorRoles.includes(p.profile.role));
  const bolehApprove = !!p.profile && (p.profile.role === 'admin' || p.profile.role === 'solution_design');

  const muat = useCallback(async () => {
    setLoading(true);
    let query = sb.from(p.view ?? p.table).select('*');
    for (const o of p.orderBy ?? []) query = query.order(o.col, { ascending: o.asc ?? true });
    const { data, error } = await query.limit(2000);
    if (error) setErr(error.message); else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [p.table, p.view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { muat(); }, [muat]);

  const tampil = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    const cols = p.cari ?? p.kolom.map(k => k.key);
    return rows.filter(r => cols.some(c => String(r[c] ?? '').toLowerCase().includes(s)));
  }, [rows, q, p.cari, p.kolom]);

  const ubah = (id: string, key: string, val: unknown) =>
    setDraft(d => ({ ...d, [id]: { ...(d[id] ?? {}), [key]: val } }));

  const bersihkan = (obj: Row) => {
    const out: Row = {};
    for (const k of p.kolom) {
      if (k.readonly || !(k.key in obj)) continue;
      let v = obj[k.key];
      if (v === '') v = null;
      if ((k.type === 'number' || k.type === 'percent') && v != null) v = Number(v);
      out[k.key] = v;
    }
    return out;
  };

  async function simpan(id: string) {
    setErr(null);
    const { error } = await sb.from(p.table).update(bersihkan(draft[id])).eq(idKey, id);
    if (error) { setErr(error.message); return; }
    setDraft(d => { const n = { ...d }; delete n[id]; return n; });
    muat();
  }
  async function tambah() {
    if (!baru) return;
    setErr(null);
    const { error } = await sb.from(p.table).insert({ ...(p.defaults ?? {}), ...bersihkan(baru) });
    if (error) { setErr(error.message); return; }
    setBaru(null); muat();
  }
  async function hapus(id: string) {
    setErr(null);
    const { error } = await sb.from(p.table).delete().eq(idKey, id);
    if (error) setErr(error.message); else muat();
  }
  async function setStatus(id: string, status: string) {
    setErr(null);
    const { error } = await sb.from(p.table).update({ status }).eq(idKey, id);
    if (error) setErr(error.message); else muat();
  }

  const sel = (row: Row, k: Kolom, id: string | null) => {
    const nilai = id ? (draft[id]?.[k.key] ?? row[k.key]) : row[k.key];
    const set = (v: unknown) => id ? ubah(id, k.key, v) : setBaru(b => ({ ...(b ?? {}), [k.key]: v }));
    const editable = bolehEdit && !k.readonly;
    if (!editable) {
      if (k.type === 'percent') return nilai == null ? '—' : (Number(nilai) * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%';
      if (k.type === 'number') return nilai == null ? '—' : Number(nilai).toLocaleString('id-ID', { maximumFractionDigits: 2 });
      if (k.type === 'bool') return nilai ? 'Ya' : 'Tidak';
      return String(nilai ?? '—');
    }
    const fid = `${p.table}-${id ?? 'baru'}-${k.key}`;
    if (k.type === 'select') return (
      <select id={fid} aria-label={k.label} value={String(nilai ?? '')} onChange={e => set(e.target.value)}>
        <option value="">—</option>{k.options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>);
    if (k.type === 'bool') return <input id={fid} aria-label={k.label} type="checkbox" checked={!!nilai} onChange={e => set(e.target.checked)} style={{ width: 'auto' }} />;
    if (k.type === 'percent') return (
      <input id={fid} aria-label={k.label} type="number" step="any" value={nilai == null || nilai === '' ? '' : Number(nilai) * 100}
        onChange={e => set(e.target.value === '' ? '' : Number(e.target.value) / 100)} style={{ minWidth: 80 }} />);
    if (k.type === 'textarea') return <textarea id={fid} aria-label={k.label} value={String(nilai ?? '')} onChange={e => set(e.target.value)} />;
    return <input id={fid} aria-label={k.label} type={k.type === 'number' ? 'number' : k.type === 'date' ? 'date' : 'text'} step="any"
      value={String(nilai ?? '')} onChange={e => set(e.target.value)} style={{ minWidth: k.width ?? (k.type === 'number' ? 110 : 160) }} />;
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="row">
        <input aria-label="Cari" placeholder="Cari…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 280, background: 'var(--surface)' }} />
        <span className="small muted">{tampil.length} baris</span>
        {bolehEdit && !baru && <button onClick={() => setBaru({})}>Tambah baris</button>}
        {!bolehEdit && <span className="small muted">Hanya baca untuk role Anda.</span>}
      </div>
      {p.catatan && <p className="small muted">{p.catatan}</p>}
      {err && <p className="error small" role="alert">{err}</p>}
      <div className="tablewrap" style={{ maxHeight: '65vh' }}>
        <table>
          <thead><tr>
            {p.kolom.map(k => <th key={k.key} className={k.type === 'number' || k.type === 'percent' ? 'num' : ''}>{k.label}</th>)}
            {p.approval && <th>Status</th>}
            {bolehEdit && <th></th>}
          </tr></thead>
          <tbody>
            {baru && (
              <tr>
                {p.kolom.map(k => <td key={k.key}>{k.readonly ? '' : sel(baru, k, null)}</td>)}
                {p.approval && <td><span className="pill info">draft</span></td>}
                <td className="row"><button onClick={tambah}>Simpan</button><button className="ghost" onClick={() => setBaru(null)}>Batal</button></td>
              </tr>
            )}
            {loading && <tr><td colSpan={p.kolom.length + 2} className="muted">Memuat…</td></tr>}
            {!loading && tampil.length === 0 && <tr><td colSpan={p.kolom.length + 2} className="muted">Belum ada data.</td></tr>}
            {tampil.map(r => {
              const id = String(r[idKey]);
              const status = String(r.status_efektif ?? r.status ?? '');
              return (
                <tr key={id}>
                  {p.kolom.map(k => <td key={k.key} className={k.type === 'number' || k.type === 'percent' ? 'num' : ''}>{sel(r, k, id)}</td>)}
                  {p.approval && (
                    <td>
                      <span className={`pill ${status === 'approved' ? 'ok' : status === 'expired' || status === 'rejected' ? 'bad' : 'warn'}`}>{status}</span>
                      {bolehApprove && status !== 'approved' && <button className="ghost" style={{ marginLeft: 6 }} onClick={() => setStatus(id, 'approved')}>Approve</button>}
                      {bolehApprove && status === 'approved' && <button className="ghost" style={{ marginLeft: 6 }} onClick={() => setStatus(id, 'draft')}>Buka lagi</button>}
                    </td>
                  )}
                  {bolehEdit && (
                    <td className="row" style={{ flexWrap: 'nowrap' }}>
                      {draft[id] && <button onClick={() => simpan(id)}>Simpan</button>}
                      <button className="danger" onClick={() => hapus(id)} aria-label="Hapus baris">Hapus</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
