'use client';
// Update trend bisnis (Dashboard): bisnis apa yang sedang naik di Indonesia (ranking harian) untuk menentukan target pasar,
// dan daftar calon customer dengan kontak resmi perusahaan. Diisi setiap hari oleh Claude (tugas terjadwal) dari sumber publik
// dunia & Indonesia (BPS, ekspor-impor, investasi, laporan industri, berita); status follow-up diisi tim.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { tanggal } from '@/lib/format';

interface Sumber { judul?: string; penerbit?: string; tanggal?: string; url: string }
interface Indikator { nama: string; nilai: string; periode?: string; sumber?: string }
interface Tren {
  id: string; tanggal: string; peringkat: number; sektor: string; komoditas: string | null; skor: number; perubahan: number | null;
  tren: 'naik' | 'stabil' | 'turun'; kebutuhan_logistik: 'Tinggi' | 'Sedang' | 'Rendah'; layanan: string | null; wilayah: string | null;
  alasan: string | null; indikator: Indikator[]; sumber: Sumber[];
}
interface Customer {
  id: string; nama: string; sektor: string | null; komoditas: string | null; peran: string | null; kota: string | null; provinsi: string | null;
  alamat: string | null; website: string | null; email: string | null; telepon: string | null; hs_code: string | null; alasan: string | null;
  skor: number | null; sumber_nama: string | null; sumber_url: string | null; status: string; catatan: string | null; oleh_claude: boolean;
  ditemukan: string; updated_at: string;
}
interface Jalan { tanggal: string; ringkasan: string | null; n_sumber: number | null; n_tren: number | null; n_customer_baru: number | null; created_at: string }

const STATUS_C = ['Baru', 'Dihubungi', 'Prospek', 'Penawaran', 'Tidak cocok'];
const warnaStatus: Record<string, string> = { Baru: 'info', Dihubungi: 'warn', Prospek: 'ok', Penawaran: 'ok', 'Tidak cocok': 'bad' };
const warnaLog: Record<string, string> = { Tinggi: 'ok', Sedang: 'warn', Rendah: 'info' };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const csv = (rows: Customer[]) => {
  const k = ['Nama', 'Sektor', 'Komoditas', 'Peran', 'Kota', 'Provinsi', 'Alamat', 'Website', 'Email', 'Telepon', 'HS code', 'Skor', 'Status', 'Alasan', 'Catatan', 'Sumber', 'URL sumber', 'Ditemukan'];
  const b = rows.map(r => [r.nama, r.sektor, r.komoditas, r.peran, r.kota, r.provinsi, r.alamat, r.website, r.email, r.telepon, r.hs_code, r.skor, r.status, r.alasan, r.catatan, r.sumber_nama, r.sumber_url, r.ditemukan]);
  return [k, ...b].map(x => x.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
};

export default function TrendBisnisPage() {
  const sb = supabaseBrowser();
  const [tab, setTab] = useState<'tren' | 'customer'>('tren');
  const [tren, setTren] = useState<Tren[]>([]);
  const [tglList, setTglList] = useState<string[]>([]);
  const [tgl, setTgl] = useState('');
  const [cust, setCust] = useState<Customer[]>([]);
  const [jalan, setJalan] = useState<Jalan | null>(null);
  const [belumAda, setBelumAda] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [buka, setBuka] = useState<string | null>(null);
  const [q, setQ] = useState(''); const [fSektor, setFSektor] = useState(''); const [fStatus, setFStatus] = useState('');
  const [edit, setEdit] = useState<Customer | null>(null);
  const [batas, setBatas] = useState(200);
  useEffect(() => { setBatas(200); }, [q, fSektor, fStatus]);

  async function muat() {
    // customer bertambah ±100 per hari → ambil bertahap per 1.000 baris (batas satu permintaan Supabase)
    const semuaCustomer = async () => {
      const out: Customer[] = [];
      for (let dari = 0; dari < 50000; dari += 1000) {
        const r = await sb.from('lg_customer').select('*').order('skor', { ascending: false, nullsFirst: false }).order('nama').order('id').range(dari, dari + 999);
        if (r.error) return { data: null, error: r.error };
        out.push(...((r.data ?? []) as Customer[])); if ((r.data ?? []).length < 1000) break;
      }
      return { data: out, error: null };
    };
    const [t, c, j] = await Promise.all([
      sb.from('lg_tren').select('tanggal').eq('peringkat', 1).order('tanggal', { ascending: false }).limit(1000),
      semuaCustomer(),
      sb.from('lg_jalan').select('*').order('created_at', { ascending: false }).limit(1),
    ]);
    const e = t.error ?? c.error;
    if (e) { if (/lg_tren|lg_customer|lg_jalan|does not exist|schema cache/i.test(e.message)) setBelumAda(true); else setErr(e.message); return; }
    const ds = Array.from(new Set(((t.data ?? []) as { tanggal: string }[]).map(x => x.tanggal)));
    setTglList(ds); setTgl(x => x && ds.includes(x) ? x : ds[0] ?? '');
    setCust((c.data ?? []) as Customer[]); setJalan(((j.data ?? []) as Jalan[])[0] ?? null);
  }
  useEffect(() => { muat(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tgl) { setTren([]); return; }
    sb.from('lg_tren').select('*').eq('tanggal', tgl).order('peringkat').then(({ data, error }: { data: unknown[] | null; error: { message: string } | null }) => {
      if (error) setErr(error.message); else setTren((data ?? []) as Tren[]);
    });
  }, [tgl]); // eslint-disable-line react-hooks/exhaustive-deps

  const sektorList = useMemo(() => Array.from(new Set(cust.map(c => c.sektor).filter(Boolean))) as string[], [cust]);
  const tampilC = useMemo(() => cust.filter(c => (!fSektor || c.sektor === fSektor) && (!fStatus || c.status === fStatus)
    && (!q || `${c.nama} ${c.komoditas ?? ''} ${c.kota ?? ''} ${c.provinsi ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [cust, q, fSektor, fStatus]);

  async function ubahStatus(c: Customer, status: string) {
    const { error } = await sb.from('lg_customer').update({ status }).eq('id', c.id);
    if (error) setErr(error.message); else setCust(xs => xs.map(x => x.id === c.id ? { ...x, status } : x));
  }
  async function simpanEdit() {
    if (!edit) return;
    const { id, nama, sektor, komoditas, peran, kota, provinsi, alamat, website, email, telepon, catatan, status } = edit;
    const isi = { nama: nama.trim(), sektor, komoditas, peran, kota, provinsi, alamat, website, email, telepon, catatan, status };
    const res = id ? await sb.from('lg_customer').update(isi).eq('id', id) : await sb.from('lg_customer').insert({ ...isi, sumber_nama: 'Input manual' });
    if (res.error) { setErr(/duplicate|unik/i.test(res.error.message) ? 'Perusahaan ini sudah ada di daftar.' : res.error.message); return; }
    setEdit(null); muat();
  }
  const unduh = () => {
    const blob = new Blob(['﻿' + csv(tampilC)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Trend-bisnis-customer-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (<>
    <div className="head"><div><div className="eyebrow">Dashboard</div><h1>Update trend bisnis</h1>
      <p className="muted">Sektor yang sedang naik di Indonesia, diranking setiap hari, plus calon customer dengan kontak resmi perusahaan. Diperbarui otomatis oleh Claude setiap pagi dari sumber publik Indonesia & dunia (BPS, data ekspor-impor, BKPM, PMI, laporan industri, media bisnis); setiap angka punya link sumber.</p></div>
      <div className="tabs" role="tablist">{([['tren', 'Ranking tren'], ['customer', `Customer (${cust.length})`]] as const).map(([v, l]) =>
        <button key={v} role="tab" aria-selected={tab === v} className={tab === v ? 'on' : ''} onClick={() => setTab(v)}>{l}</button>)}</div></div>

    {belumAda && <div className="card"><p className="notice small">Tabel Update trend bisnis belum dibuat di database. Jalankan SQL <b>0024_lg_tren_customer</b> di Supabase SQL Editor, lalu muat ulang halaman ini.</p></div>}
    {err && <p className="error small" role="alert">{err}</p>}

    <div className="kpis">
      {[['Update terakhir', jalan ? tanggal(jalan.created_at) : '—'], ['Sektor diranking', tren.length || '—'], ['Calon customer', cust.length],
        ['Prospek aktif', cust.filter(c => ['Dihubungi', 'Prospek', 'Penawaran'].includes(c.status)).length]].map(([l, v]) =>
        <div key={String(l)} className="kpi"><span className="small muted">{l}</span><b>{v}</b></div>)}
    </div>
    {jalan?.ringkasan && <div className="card small"><b>Ringkasan riset terakhir</b><p style={{ margin: '4px 0 0' }}>{jalan.ringkasan}</p></div>}

    {tab === 'tren' && <div className="card">
      <div className="row">
        <label className="f" style={{ maxWidth: 220 }} htmlFor="lg-tgl">Tanggal ranking
          <select id="lg-tgl" value={tgl} onChange={e => setTgl(e.target.value)}>{tglList.map(d => <option key={d} value={d}>{tanggal(d)}</option>)}</select></label>
        <span className="small muted">Skor 0–100 = gabungan pertumbuhan terbaru (BPS), momentum ekspor-impor & investasi, dan intensitas berita/proyek baru. Kebutuhan logistik = seberapa besar sektor ini membutuhkan gudang, cold chain, bonded, atau distribusi.</span>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th className="num">#</th><th>Sektor / komoditas</th><th className="num">Skor</th><th>Tren</th><th>Kebutuhan logistik</th><th>Wilayah</th><th>Kenapa naik</th></tr></thead>
        <tbody>{tren.map(r => <Fragment key={r.id}>
          <tr style={{ cursor: 'pointer' }} onClick={() => setBuka(buka === r.id ? null : r.id)}>
            <td className="num"><b style={{ fontSize: 18 }}>{r.peringkat}</b><div className="small">{r.perubahan == null ? <span className="muted">baru</span> : r.perubahan > 0 ? <span className="ok">▲ {r.perubahan}</span> : r.perubahan < 0 ? <span className="bad">▼ {-r.perubahan}</span> : <span className="muted">=</span>}</div></td>
            <td><b>{r.sektor}</b>{r.komoditas && <div className="small muted">{r.komoditas}</div>}</td>
            <td className="num"><b>{Math.round(r.skor)}</b><div style={{ height: 6, background: 'var(--g200)', borderRadius: 3, marginTop: 4, minWidth: 60 }}><div style={{ width: `${Math.max(0, Math.min(100, r.skor))}%`, height: 6, borderRadius: 3, background: r.skor >= 80 ? '#16a34a' : r.skor >= 65 ? '#f59e0b' : '#94a3b8' }} /></div></td>
            <td><span className={`pill ${r.tren === 'naik' ? 'ok' : r.tren === 'turun' ? 'bad' : 'info'}`}>{r.tren}</span></td>
            <td><span className={`pill ${warnaLog[r.kebutuhan_logistik]}`}>{r.kebutuhan_logistik}</span>{r.layanan && <div className="small muted">{r.layanan}</div>}</td>
            <td className="small">{r.wilayah ?? '—'}</td>
            <td className="small">{r.alasan}<div className="muted">{buka === r.id ? '▲ tutup' : `▼ ${r.indikator.length} indikator · ${r.sumber.length} sumber`}</div></td>
          </tr>
          {buka === r.id && <tr><td /><td colSpan={6}>
            <div className="grid3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              <div><b className="small">Indikator</b><ul className="small" style={{ margin: '4px 0', paddingLeft: 18 }}>{r.indikator.map((x, i) => <li key={i}><b>{x.nama}:</b> {x.nilai}{x.periode ? ` (${x.periode})` : ''}{x.sumber ? <span className="muted"> · {x.sumber}</span> : null}</li>)}</ul></div>
              <div><b className="small">Sumber</b><ul className="small" style={{ margin: '4px 0', paddingLeft: 18 }}>{r.sumber.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.judul || host(s.url)}</a><span className="muted"> · {[s.penerbit || host(s.url), s.tanggal].filter(Boolean).join(' · ')}</span></li>)}</ul></div>
              <div><b className="small">Calon customer di sektor ini</b><ul className="small" style={{ margin: '4px 0', paddingLeft: 18 }}>{cust.filter(c => c.sektor === r.sektor).slice(0, 8).map(c => <li key={c.id}>{c.nama}{c.kota ? ` · ${c.kota}` : ''}</li>)}
                {!cust.some(c => c.sektor === r.sektor) && <li className="muted">belum ada</li>}</ul>
                {cust.some(c => c.sektor === r.sektor) && <button className="ghost" onClick={() => { setFSektor(r.sektor); setTab('customer'); }}>Lihat di tab Customer →</button>}</div>
            </div>
          </td></tr>}
        </Fragment>)}
        {!tren.length && !belumAda && <tr><td colSpan={7} className="muted">Belum ada ranking. Riset pertama berjalan otomatis setiap pagi pukul 05.30 WIB.</td></tr>}</tbody>
      </table></div>
      <p className="small muted">Ranking adalah sinyal untuk menentukan target pasar, bukan rekomendasi investasi. Klik baris untuk melihat indikator & link sumber.</p>
    </div>}

    {tab === 'customer' && <div className="card">
      <div className="row">
        <input aria-label="Cari" placeholder="Cari perusahaan, komoditas, kota, email…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 300 }} />
        <select aria-label="Sektor" value={fSektor} onChange={e => setFSektor(e.target.value)} style={{ maxWidth: 260 }}><option value="">Semua sektor</option>{sektorList.map(s => <option key={s}>{s}</option>)}</select>
        <select aria-label="Status" value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ maxWidth: 160 }}><option value="">Semua status</option>{STATUS_C.map(s => <option key={s}>{s}</option>)}</select>
        <span className="small muted">{tampilC.length} perusahaan · baru hari ini {cust.filter(c => c.ditemukan === new Date().toLocaleDateString('en-CA')).length}</span><span style={{ flex: 1 }} />
        <button className="ghost" onClick={unduh} disabled={!tampilC.length}>Unduh CSV</button>
        <button onClick={() => setEdit({ id: '', nama: '', sektor: fSektor || null, komoditas: null, peran: 'Produsen', kota: null, provinsi: null, alamat: null, website: null, email: null, telepon: null, hs_code: null, alasan: null, skor: null, sumber_nama: null, sumber_url: null, status: 'Baru', catatan: null, oleh_claude: false, ditemukan: '', updated_at: '' })}>+ Tambah</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Perusahaan</th><th>Sektor · peran</th><th>Kontak resmi</th><th>Kenapa calon customer</th><th className="num">Skor</th><th>Status</th><th>Sumber</th><th /></tr></thead>
        <tbody>{tampilC.slice(0, batas).map(c => <tr key={c.id}>
          <td><b>{c.nama}</b><div className="small muted">{[c.kota, c.provinsi].filter(Boolean).join(', ')}</div>{c.website && <div className="small"><a href={c.website} target="_blank" rel="noreferrer">{host(c.website)}</a></div>}</td>
          <td className="small">{c.sektor ?? '—'}<div className="muted">{[c.peran, c.komoditas, c.hs_code && `HS ${c.hs_code}`].filter(Boolean).join(' · ')}</div></td>
          <td className="small">{c.email ? c.email.split(/[,;]\s*/).map(e => <div key={e}><a href={`mailto:${e}`}>{e}</a></div>) : null}{c.telepon && <div><a href={`tel:${c.telepon.replace(/[^\d+]/g, '')}`}>{c.telepon}</a></div>}
            {c.alamat && <div className="muted">{c.alamat}</div>}{!c.email && !c.telepon && <span className="muted">—</span>}</td>
          <td className="small">{c.alasan ?? '—'}{c.catatan && <div className="muted">Catatan: {c.catatan}</div>}</td>
          <td className="num">{c.skor ?? '—'}</td>
          <td><select aria-label={`Status ${c.nama}`} value={c.status} onChange={e => ubahStatus(c, e.target.value)} className={`pill ${warnaStatus[c.status] ?? 'info'}`} style={{ width: 'auto' }}>{STATUS_C.map(s => <option key={s}>{s}</option>)}</select></td>
          <td className="small">{c.oleh_claude ? <span className="pill info">Claude</span> : 'Manual'}{c.sumber_url && <div><a href={c.sumber_url} target="_blank" rel="noreferrer">{c.sumber_nama || host(c.sumber_url)}</a></div>}<div className="muted">{tanggal(c.ditemukan)}</div></td>
          <td><button className="ghost" onClick={() => setEdit(c)}>Edit</button></td>
        </tr>)}
        {!tampilC.length && !belumAda && <tr><td colSpan={8} className="muted">Belum ada calon customer untuk filter ini.</td></tr>}
        {tampilC.length > batas && <tr><td colSpan={8}><button className="ghost" onClick={() => setBatas(b => b + 200)}>Tampilkan {Math.min(200, tampilC.length - batas)} lagi ({tampilC.length - batas} tersisa)</button></td></tr>}</tbody>
      </table></div>
      <p className="small muted">Kontak yang disimpan hanya kontak resmi perusahaan yang dipublikasikan (website perusahaan, keterbukaan informasi emiten, direktori eksportir/importir) — bukan email atau nomor pribadi. Cek link sumber sebelum menghubungi.</p>
    </div>}

    {edit && <div className="pv-latar" role="dialog" aria-modal="true" aria-label="Edit customer" onClick={e => { if (e.target === e.currentTarget) setEdit(null); }}>
      <div className="pv-kotak" style={{ maxWidth: 820, height: 'auto', maxHeight: '90vh' }}>
        <div className="pv-bar"><b>{edit.id ? 'Edit calon customer' : 'Tambah calon customer'}</b><span style={{ flex: 1 }} /><button className="ghost" onClick={() => setEdit(null)}>Tutup</button></div>
        <div className="pv-isi" style={{ padding: 16, display: 'grid', gap: 10, overflow: 'auto' }}>
          <div className="grid3">
            {([['nama', 'Nama perusahaan *'], ['sektor', 'Sektor'], ['komoditas', 'Komoditas / produk'], ['kota', 'Kota'], ['provinsi', 'Provinsi'], ['website', 'Website'], ['email', 'Email resmi'], ['telepon', 'Telepon kantor'], ['alamat', 'Alamat']] as [keyof Customer, string][]).map(([k, l]) =>
              <label key={k} className="f" htmlFor={`lgc-${k}`}>{l}<input id={`lgc-${k}`} value={String(edit[k] ?? '')} onChange={e => setEdit({ ...edit, [k]: e.target.value || null } as Customer)} /></label>)}
            <label className="f" htmlFor="lgc-peran">Peran<select id="lgc-peran" value={edit.peran ?? ''} onChange={e => setEdit({ ...edit, peran: e.target.value })}>{['Eksportir', 'Importir', 'Eksportir & Importir', 'Produsen', 'Distributor', 'Ritel / e-commerce', 'Lainnya'].map(o => <option key={o}>{o}</option>)}</select></label>
            <label className="f" htmlFor="lgc-status">Status<select id="lgc-status" value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}>{STATUS_C.map(o => <option key={o}>{o}</option>)}</select></label>
          </div>
          <label className="f" htmlFor="lgc-catatan">Catatan follow-up<textarea id="lgc-catatan" value={edit.catatan ?? ''} onChange={e => setEdit({ ...edit, catatan: e.target.value || null })} /></label>
          <div className="row"><button onClick={simpanEdit} disabled={!edit.nama.trim()}>Simpan</button><button className="ghost" onClick={() => setEdit(null)}>Batal</button></div>
        </div>
      </div>
    </div>}
  </>);
}
