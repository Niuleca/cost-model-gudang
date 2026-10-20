'use client';
// Beranda: radar jadwal tender gudang / logistik perusahaan besar di Indonesia.
// Diisi otomatis oleh Claude (scheduled task harian dari sumber publik) dan diperbarui manual oleh akun.
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { tanggal, rp } from '@/lib/format';

interface Radar {
  id: string; perusahaan: string; judul: string; kategori: string; industri: string | null; lokasi: string | null; platform: string | null;
  nomor_tender: string | null; tanggal_terbit: string | null; batas_daftar: string | null; batas_penawaran: string | null; nilai_estimasi: number | null;
  status: string; link: string | null; pic_nama: string | null; pic_email: string | null; pic_telepon: string | null; catatan: string | null;
  sumber: 'manual' | 'claude'; sumber_url: string | null; terverifikasi: boolean; dibuat_oleh: string | null; diubah_oleh: string | null; updated_at: string;
}
const KATEGORI = ['Warehousing', '3PL / Contract Logistics', 'Transport / Distribusi', 'Freight Forwarding', 'Cold Chain', 'Lainnya'];
const PLATFORM = ['Coupa', 'SAP Ariba', 'SPSE / LPSE (pemerintah)', 'e-Proc BUMN', 'Website perusahaan', 'Undangan langsung / email', 'Lainnya'];
const STATUS: Record<string, { l: string; c: string }> = {
  rencana: { l: 'Rencana', c: 'info' }, dibuka: { l: 'Dibuka', c: 'ok' }, ditutup: { l: 'Ditutup', c: 'bad' }, dibatalkan: { l: 'Dibatalkan', c: 'bad' }, selesai: { l: 'Selesai', c: 'info' },
};
const kosong = (): Partial<Radar> => ({ perusahaan: '', judul: '', kategori: 'Warehousing', platform: 'Website perusahaan', status: 'dibuka' });
const hariIni = () => new Date().toISOString().slice(0, 10);
const sisaHari = (d: string | null) => d ? Math.ceil((new Date(d + 'T23:59:59').getTime() - Date.now()) / 86400000) : null;

export default function Beranda() {
  const sb = supabaseBrowser();
  const { profile } = useProfile();
  const [rows, setRows] = useState<Radar[]>([]);
  const [nama, setNama] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [belumAda, setBelumAda] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'aktif' | 'semua' | 'lewat'>('aktif');
  const [kat, setKat] = useState('');
  const [edit, setEdit] = useState<Partial<Radar> | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function muat() {
    const { data, error } = await sb.from('tender_radar').select('*').order('batas_penawaran', { ascending: true, nullsFirst: false }).limit(500);
    if (error) { if (/tender_radar/.test(error.message)) setBelumAda(true); else setErr(error.message); return; }
    const r = (data ?? []) as Radar[]; setRows(r);
    const ids = Array.from(new Set(r.flatMap(x => [x.dibuat_oleh, x.diubah_oleh]).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: ps } = await sb.from('profiles').select('id, full_name, email').in('id', ids);
      setNama(Object.fromEntries(((ps ?? []) as { id: string; full_name: string; email: string }[]).map(p => [p.id, p.full_name || p.email])));
    }
  }
  useEffect(() => { muat(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tampil = useMemo(() => {
    const t = hariIni();
    return rows.filter(r => {
      const lewat = (r.batas_penawaran && r.batas_penawaran < t) || ['ditutup', 'dibatalkan', 'selesai'].includes(r.status);
      if (filter === 'aktif' && lewat) return false;
      if (filter === 'lewat' && !lewat) return false;
      if (kat && r.kategori !== kat) return false;
      if (q && !`${r.perusahaan} ${r.judul} ${r.lokasi ?? ''} ${r.platform ?? ''} ${r.industri ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [rows, q, filter, kat]);
  const ringkas = useMemo(() => {
    const t = hariIni(), aktif = rows.filter(r => !(r.batas_penawaran && r.batas_penawaran < t) && !['ditutup', 'dibatalkan', 'selesai'].includes(r.status));
    return { aktif: aktif.length, minggu: aktif.filter(r => { const s = sisaHari(r.batas_penawaran); return s != null && s <= 7; }).length,
      claude: rows.filter(r => r.sumber === 'claude').length, terakhir: rows.reduce((m, r) => r.updated_at > m ? r.updated_at : m, '') };
  }, [rows]);

  async function simpan() {
    if (!edit?.perusahaan?.trim() || !edit.judul?.trim()) { setErr('Perusahaan dan judul tender wajib diisi.'); return; }
    setSibuk(true); setErr(null);
    const { id, dibuat_oleh, diubah_oleh, updated_at, ...isi } = edit as Radar; void dibuat_oleh; void diubah_oleh; void updated_at;
    const bersih = Object.fromEntries(Object.entries(isi).map(([k, v]) => [k, v === '' ? null : v]));
    const res = id ? await sb.from('tender_radar').update(bersih).eq('id', id) : await sb.from('tender_radar').insert({ ...bersih, sumber: 'manual' });
    setSibuk(false);
    if (res.error) { setErr(/duplicate|unik/i.test(res.error.message) ? 'Tender dengan perusahaan & judul yang sama sudah ada.' : res.error.message); return; }
    setEdit(null); muat();
  }
  async function hapus(r: Radar) {
    const { error } = await sb.from('tender_radar').delete().eq('id', r.id);
    if (error) setErr(error.message); else muat();
  }
  const bolehHapus = (r: Radar) => !!profile && (profile.is_master || profile.role === 'admin' || profile.role === 'manager' || r.dibuat_oleh === profile.id);
  const f = (k: keyof Radar, label: string, type = 'text', opts?: string[]) => (
    <label className="f" htmlFor={`rd-${k}`}>{label}
      {opts ? <select id={`rd-${k}`} value={String(edit?.[k] ?? '')} onChange={e => setEdit({ ...edit, [k]: e.target.value })}>{opts.map(o => <option key={o} value={o}>{STATUS[o]?.l ?? o}</option>)}</select>
        : type === 'textarea' ? <textarea id={`rd-${k}`} value={String(edit?.[k] ?? '')} onChange={e => setEdit({ ...edit, [k]: e.target.value })} />
        : <input id={`rd-${k}`} type={type} value={String(edit?.[k] ?? '')} onChange={e => setEdit({ ...edit, [k]: type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value })} />}
    </label>);

  return (<>
    <div className="head"><div><div className="eyebrow">Dashboard</div><h1>Beranda · Radar tender gudang</h1>
      <p className="muted">Jadwal tender gudang / logistik perusahaan di Indonesia. Diperbarui otomatis setiap hari oleh Claude dari sumber publik (portal pengadaan, SPSE/LPSE, e-Proc BUMN, website & berita perusahaan) dan oleh akun tim. Event Coupa / SAP Ariba yang berupa undangan tertutup diisi manual oleh akun yang menerima undangan.</p></div>
      <button onClick={() => setEdit(kosong())}>+ Tambah jadwal tender</button></div>

    {belumAda && <div className="card"><p className="notice small">Tabel radar belum dibuat di database. Jalankan SQL <b>0021_tender_radar</b> di Supabase SQL Editor, lalu muat ulang halaman ini.</p></div>}
    {err && <p className="error small" role="alert">{err}</p>}

    <div className="grid3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      {[['Tender aktif', ringkas.aktif], ['Tutup ≤ 7 hari', ringkas.minggu], ['Ditemukan Claude', ringkas.claude], ['Update terakhir', ringkas.terakhir ? tanggal(ringkas.terakhir) : '—']].map(([l, v]) =>
        <div key={String(l)} className="card" style={{ gap: 2 }}><span className="small muted">{l}</span><b style={{ fontSize: 22 }}>{v}</b></div>)}
    </div>

    <div className="card">
      <div className="row">
        <input aria-label="Cari" placeholder="Cari perusahaan, judul, lokasi…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 300 }} />
        <select aria-label="Kategori" value={kat} onChange={e => setKat(e.target.value)} style={{ maxWidth: 220 }}><option value="">Semua kategori</option>{KATEGORI.map(k => <option key={k}>{k}</option>)}</select>
        <div className="tabs" role="tablist">{([['aktif', 'Aktif'], ['lewat', 'Lewat / ditutup'], ['semua', 'Semua']] as const).map(([v, l]) =>
          <button key={v} role="tab" aria-selected={filter === v} className={filter === v ? 'on' : ''} onClick={() => setFilter(v)}>{l}</button>)}</div>
        <span className="small muted">{tampil.length} tender</span>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Batas penawaran</th><th>Perusahaan</th><th>Tender</th><th>Platform</th><th>PIC / kontak</th><th>Status</th><th>Sumber</th><th /></tr></thead>
        <tbody>
          {tampil.map(r => { const s = sisaHari(r.batas_penawaran); const st = STATUS[r.status] ?? { l: r.status, c: 'info' };
            return <tr key={r.id}>
              <td className="small" style={{ whiteSpace: 'nowrap' }}>{r.batas_penawaran ? <><b>{tanggal(r.batas_penawaran)}</b><div className={s != null && s <= 7 && s >= 0 ? 'bad' : 'muted'}>{s == null ? '' : s < 0 ? 'lewat' : s === 0 ? 'hari ini' : `${s} hari lagi`}</div></> : <span className="muted">belum diumumkan</span>}
                {r.batas_daftar && <div className="muted">daftar s.d. {tanggal(r.batas_daftar)}</div>}</td>
              <td><b>{r.perusahaan}</b>{r.industri && <div className="small muted">{r.industri}</div>}</td>
              <td>{r.link ? <a href={r.link} target="_blank" rel="noreferrer">{r.judul}</a> : r.judul}
                <div className="small muted">{[r.kategori, r.lokasi, r.nomor_tender, r.nilai_estimasi ? `est. ${rp(r.nilai_estimasi)}` : null].filter(Boolean).join(' · ')}</div>
                {r.catatan && <div className="small">{r.catatan}</div>}</td>
              <td className="small">{r.platform ?? '—'}{r.tanggal_terbit && <div className="muted">terbit {tanggal(r.tanggal_terbit)}</div>}</td>
              <td className="small">{r.pic_nama && <div>{r.pic_nama}</div>}{r.pic_email && <div><a href={`mailto:${r.pic_email}`}>{r.pic_email}</a></div>}{r.pic_telepon && <div><a href={`tel:${r.pic_telepon}`}>{r.pic_telepon}</a></div>}{!r.pic_nama && !r.pic_email && !r.pic_telepon && <span className="muted">—</span>}</td>
              <td><span className={`pill ${st.c}`}>{st.l}</span>{r.terverifikasi && <div className="small ok">terverifikasi</div>}</td>
              <td className="small">{r.sumber === 'claude' ? <span className="pill info">Claude</span> : 'Manual'}{r.sumber_url && <div><a href={r.sumber_url} target="_blank" rel="noreferrer">sumber</a></div>}
                <div className="muted">{r.diubah_oleh ? `diubah ${nama[r.diubah_oleh] ?? ''}` : ''} {tanggal(r.updated_at)}</div></td>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}><button className="ghost" onClick={() => setEdit(r)}>Edit</button>{bolehHapus(r) && <button className="danger" onClick={() => hapus(r)}>Hapus</button>}</div></td>
            </tr>; })}
          {!tampil.length && !belumAda && <tr><td colSpan={8} className="muted">Belum ada jadwal tender untuk filter ini.</td></tr>}
        </tbody>
      </table></div>
      <p className="small muted">Data dari Claude berasal dari sumber publik dan bisa kurang lengkap — cek link sumber sebelum menindaklanjuti, lalu centang <b>Terverifikasi</b>. Kontak yang dicantumkan hanya kontak pengadaan resmi yang tertera di pengumuman.</p>
    </div>

    {edit && <div className="pv-latar" role="dialog" aria-modal="true" aria-label="Edit jadwal tender" onClick={e => { if (e.target === e.currentTarget) setEdit(null); }}>
      <div className="pv-kotak" style={{ maxWidth: 860, height: 'auto', maxHeight: '90vh' }}>
        <div className="pv-bar"><b>{edit.id ? 'Edit jadwal tender' : 'Tambah jadwal tender'}</b><span style={{ flex: 1 }} /><button className="ghost" onClick={() => setEdit(null)}>Tutup</button></div>
        <div className="pv-isi" style={{ padding: 16, display: 'grid', gap: 10, overflow: 'auto' }}>
          <div className="grid3">
            {f('perusahaan', 'Perusahaan *')}{f('judul', 'Judul tender *')}{f('kategori', 'Kategori', 'text', KATEGORI)}
            {f('industri', 'Industri')}{f('lokasi', 'Lokasi')}{f('platform', 'Platform', 'text', PLATFORM)}
            {f('nomor_tender', 'Nomor tender / event ID')}{f('tanggal_terbit', 'Tanggal terbit', 'date')}{f('batas_daftar', 'Batas pendaftaran', 'date')}
            {f('batas_penawaran', 'Batas penawaran', 'date')}{f('nilai_estimasi', 'Nilai estimasi (Rp)', 'number')}{f('status', 'Status', 'text', Object.keys(STATUS))}
            {f('link', 'Link pengumuman / portal')}{f('pic_nama', 'PIC pengadaan')}{f('pic_email', 'Email PIC', 'email')}
            {f('pic_telepon', 'Telepon PIC')}{f('sumber_url', 'URL sumber')}
            <label className="row small" style={{ gap: 6, alignSelf: 'end' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!edit.terverifikasi} onChange={e => setEdit({ ...edit, terverifikasi: e.target.checked })} /> Terverifikasi</label>
          </div>
          {f('catatan', 'Catatan (lingkup, kebutuhan m², syarat, dll.)', 'textarea')}
          <div className="row"><button onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan…' : 'Simpan'}</button><button className="ghost" onClick={() => setEdit(null)}>Batal</button></div>
        </div>
      </div>
    </div>}
  </>);
}
