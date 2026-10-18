'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Profile } from '@/lib/useProfile';
import type { AppRole } from '@/lib/format';
import { exportExcel, importExcel, type KolomExcel } from '@/lib/excel';
import GroupChips from '@/components/GroupChips';

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
  filter?: Record<string, string | string[]>;   // eq / in pada sumber baca
  namaExport?: string;         // nama file & sheet Excel
  kelompok?: string;           // kolom pembagi: tombol per nilai + judul grup di tabel
}

type Row = Record<string, unknown>;
const ambil = (r: Row, key: string): unknown => {
  const titik = key.indexOf('.');
  if (titik <= 0) return r[key];
  const induk = r[key.slice(0, titik)] as Record<string, unknown> | null | undefined;
  return induk?.[key.slice(titik + 1)];
};

export default function TableEditor(p: Props) {
  const sb = supabaseBrowser();
  const idKey = p.idKey ?? 'id';
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, Row>>({});
  const [baru, setBaru] = useState<Row | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [impor, setImpor] = useState<{ baru: Row[]; ubah: { id: string; row: Row }[]; diabaikan: string[]; file: string } | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [grup, setGrup] = useState('');
  const nilaiGrup = (r: Row) => (p.kelompok ? String(ambil(r, p.kelompok) ?? '') : '') || 'Tanpa kategori';

  const bolehEdit = !!p.profile && (!!p.profile.is_master || p.profile.role === 'admin' || p.profile.role === 'manager' || p.editorRoles.includes(p.profile.role));
  const bolehApprove = !!p.profile && (!!p.profile.is_master || ['admin', 'manager', 'solution_design'].includes(p.profile.role));

  const muat = useCallback(async () => {
    setLoading(true);
    let query = sb.from(p.view ?? p.table).select('*');
    for (const [k, v] of Object.entries(p.filter ?? {})) query = Array.isArray(v) ? query.in(k, v) : query.eq(k, v);
    for (const o of p.orderBy ?? []) query = query.order(o.col, { ascending: o.asc ?? true });
    const { data, error } = await query.limit(2000);
    if (error) setErr(error.message); else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [p.table, p.view, JSON.stringify(p.filter)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { muat(); }, [muat]);

  const dicari = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    const cols = p.cari ?? p.kolom.map(k => k.key);
    return rows.filter(r => cols.some(c => String(ambil(r, c) ?? '').toLowerCase().includes(s)));
  }, [rows, q, p.cari, p.kolom]);
  const tampil = useMemo(() => {
    if (!p.kelompok) return dicari;
    const xs = grup ? dicari.filter(r => nilaiGrup(r) === grup) : dicari;
    return [...xs].sort((a, b) => nilaiGrup(a).localeCompare(nilaiGrup(b), 'id'));   // stabil: urutan orderBy dipertahankan di dalam grup
  }, [dicari, grup, p.kelompok]); // eslint-disable-line react-hooks/exhaustive-deps
  const kolomGrup = p.kolom.find(k => k.key === p.kelompok);

  const ubah = (id: string, key: string, val: unknown) =>
    setDraft(d => ({ ...d, [id]: { ...(d[id] ?? {}), [key]: val } }));

  // Kolom "a.b" = kunci b di dalam kolom jsonb a (mis. benchmark.Retail-Consumer)
  const bersihkan = (obj: Row, asal: Row = {}) => {
    const out: Row = {};
    for (const k of p.kolom) {
      if (k.readonly || !(k.key in obj)) continue;
      let v = obj[k.key];
      if (v === '') v = null;
      if ((k.type === 'number' || k.type === 'percent') && v != null) v = Number(v);
      const titik = k.key.indexOf('.');
      if (titik > 0) {
        const induk = k.key.slice(0, titik), anak = k.key.slice(titik + 1);
        const dasar = (out[induk] ?? asal[induk] ?? {}) as Record<string, unknown>;
        const baru = { ...dasar };
        if (v == null) delete baru[anak]; else baru[anak] = v;
        out[induk] = baru;
      } else out[k.key] = v;
    }
    return out;
  };

  async function simpan(id: string) {
    setErr(null);
    const asal = rows.find(r => String(r[idKey]) === id) ?? {};
    const { error } = await sb.from(p.table).update(bersihkan(draft[id], asal)).eq(idKey, id);
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
  // ---- Excel ----
  const kolomExcel: KolomExcel[] = p.kolom.map(k => ({ key: k.key, label: k.label, width: k.width,
    type: k.type === 'number' || k.type === 'percent' || k.type === 'date' || k.type === 'bool' ? k.type : 'text' }));
  const idSendiri = idKey !== 'id' && p.kolom.some(k => k.key === idKey);   // kunci alami (mis. key, tanggal) sudah jadi kolom
  async function unduh() {
    setErr(null); setSibuk('Menyiapkan Excel…');
    try {
      const extra = p.approval ? [...kolomExcel, { key: 'status', label: 'Status (hanya info)', type: 'text' as const }] : kolomExcel;
      await exportExcel(p.namaExport ?? p.table, p.namaExport ?? p.table, extra, tampil, idSendiri ? undefined : idKey);
    } catch (e) { setErr(`Export gagal: ${(e as Error).message}`); }
    setSibuk(null);
  }
  async function bacaFile(f: File | undefined) {
    if (!f) return;
    setErr(null); setSibuk('Membaca file…');
    try {
      const { rows: isi, diabaikan } = await importExcel(f, kolomExcel, idSendiri ? undefined : idKey);
      const ada = new Map(rows.map(r => [String(r[idKey]), r]));
      const baruR: Row[] = [], ubahR: { id: string; row: Row }[] = [];
      for (const r of isi) {
        const id = r[idKey] == null ? null : String(r[idKey]);
        if (id && ada.has(id)) ubahR.push({ id, row: r }); else baruR.push(r);
      }
      setImpor({ baru: baruR, ubah: ubahR, diabaikan, file: f.name });
    } catch (e) { setErr(`Import gagal: ${(e as Error).message}`); }
    setSibuk(null);
  }
  async function terapkanImpor() {
    if (!impor) return;
    setErr(null); setSibuk('Menyimpan…');
    const gagal: string[] = [];
    const isiBaru = impor.baru.map(r => ({ ...(p.defaults ?? {}), ...bersihkan(r), ...(idSendiri && r[idKey] != null ? { [idKey]: r[idKey] } : {}) }));
    for (let i = 0; i < isiBaru.length; i += 300) {
      const { error } = await sb.from(p.table).insert(isiBaru.slice(i, i + 300));
      if (error) gagal.push(`baris baru ${i + 1}–${Math.min(i + 300, isiBaru.length)}: ${error.message}`);
    }
    for (let i = 0; i < impor.ubah.length; i += 10) {
      const res = await Promise.all(impor.ubah.slice(i, i + 10).map(u => {
        const asal = rows.find(r => String(r[idKey]) === u.id) ?? {};
        return sb.from(p.table).update(bersihkan(u.row, asal)).eq(idKey, u.id);
      }));
      res.forEach((r, j) => { if (r.error) gagal.push(`ID ${impor.ubah[i + j].id}: ${r.error.message}`); });
    }
    setSibuk(null);
    if (gagal.length) setErr(`Sebagian gagal (${gagal.length}): ${gagal.slice(0, 3).join(' · ')}`);
    setImpor(null); muat();
  }

  async function setStatus(id: string, status: string) {
    setErr(null);
    const { error } = await sb.from(p.table).update({ status }).eq(idKey, id);
    if (error) setErr(error.message); else muat();
  }

  const sel = (row: Row, k: Kolom, id: string | null) => {
    const nilai = id ? (draft[id]?.[k.key] ?? ambil(row, k.key)) : row[k.key];
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
      <select id={fid} aria-label={k.label} value={String(nilai ?? '')} onChange={e => set(e.target.value)} style={{ minWidth: k.width ?? 140 }}>
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
        {bolehEdit && !baru && <button onClick={() => setBaru(grup && p.kelompok && grup !== 'Tanpa kategori' ? { [p.kelompok]: grup } : {})}>Tambah baris{grup ? ` (${grup})` : ''}</button>}
        <button className="ghost" onClick={unduh} disabled={!!sibuk}>Export Excel</button>
        {bolehEdit && <label className="btn ghost" style={{ cursor: 'pointer' }}>Import Excel
          <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={e => { bacaFile(e.target.files?.[0]); e.target.value = ''; }} /></label>}
        {sibuk && <span className="small" role="status">{sibuk}</span>}
        {!bolehEdit && <span className="small muted">Hanya baca untuk role Anda.</span>}
      </div>
      {p.kelompok && <GroupChips nilai={dicari.map(nilaiGrup)} pilih={grup} onPilih={setGrup} label={kolomGrup?.label ?? 'Kelompok'} />}
      {p.catatan && <p className="small muted">{p.catatan}</p>}
      {impor && (
        <div className="notice row" style={{ justifyContent: 'space-between' }}>
          <span className="small">
            <b>{impor.file}</b>: {impor.baru.length} baris baru, {impor.ubah.length} baris diperbarui (dicocokkan lewat kolom {idSendiri ? p.kolom.find(k => k.key === idKey)?.label : 'ID'}).
            {impor.diabaikan.length > 0 && ` Kolom diabaikan: ${impor.diabaikan.join(', ')}.`}
            {p.approval && ' Data baru masuk sebagai draft dan perlu di-approve.'}
          </span>
          <span className="row"><button onClick={terapkanImpor} disabled={!!sibuk}>Terapkan</button><button className="ghost" onClick={() => setImpor(null)}>Batal</button></span>
        </div>
      )}
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
            {tampil.map((r, i) => {
              const id = String(r[idKey]);
              const status = String(r.status_efektif ?? r.status ?? '');
              const g = nilaiGrup(r);
              const judul = !!p.kelompok && (i === 0 || nilaiGrup(tampil[i - 1]) !== g);
              return (
                <Fragment key={id}>
                {judul && <tr className="grup"><td colSpan={p.kolom.length + (p.approval ? 1 : 0) + (bolehEdit ? 1 : 0)}
                  style={{ background: 'var(--surface-2)', fontWeight: 600, position: 'sticky', left: 0 }}>
                  {g} <span className="small muted">· {tampil.filter(x => nilaiGrup(x) === g).length} item</span></td></tr>}
                <tr>
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
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
