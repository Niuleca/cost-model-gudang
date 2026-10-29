'use client';
// Menu Simulasi gudang 3D: pilih project → tata letak 3D otomatis dari hasil hitung tender (space, rak, staging, MHE, manpower).
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ASUMSI_DEFAULT, keInput, muatMaster, type TenderRow } from '@/lib/tender';
import { IT_SHEET_DEFAULT } from '@/lib/it';
import { hitungTender, type HasilTender } from '@/lib/engine/index.ts';
import { susunLayout, type LayoutGudang } from '@/lib/simulasi3d/layout';
import { labelStatus } from '@/lib/status';
import type { Kamera, OpsiViewer, ViewerApi } from './Viewer3D';
import { WARNA_MHE, WARNA_ORANG } from './warna';

const Viewer3D = dynamic(() => import('./Viewer3D'), { ssr: false, loading: () => <div className="sim3d-wadah sim3d-muat">Menyiapkan 3D…</div> });

interface T { id: string; kode: string | null; customer: string; status: string; updated_at: string }
const LABEL_KAT: Record<string, string> = { admin: 'Admin', checker: 'Checker', picker: 'Picker / packer', operator: 'Operator MHE', tkbm: 'TKBM / helper', supervisor: 'Supervisor / manager', security: 'Security', inventory: 'Inventory', lain: 'Lainnya' };
const LABEL_MHE: Record<string, string> = { reach: 'Reach truck', forklift: 'Forklift', stacker: 'Stacker', hpt: 'Hand pallet', perangkat: 'Perangkat (tidak digambar)' };

export default function SimulasiGudang() {
  const sb = supabaseBrowser();
  const [daftar, setDaftar] = useState<T[]>([]);
  const [cari, setCari] = useState('');
  const [id, setId] = useState('');
  const [data, setData] = useState<{ t: TenderRow; h: HasilTender; sumber: 'hitung' | 'tersimpan' } | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lebar, setLebar] = useState<number | ''>('');
  const [dockIn, setDockIn] = useState<number | ''>('');
  const [dockOut, setDockOut] = useState<number | ''>('');
  const [okup, setOkup] = useState<number | null>(null);
  const [shift, setShift] = useState(0);
  const [opsi, setOpsi] = useState<OpsiViewer>({ atap: false, dinding: true, label: true, animasi: true, truk: true, orang: true });
  const api = useRef<ViewerApi>(null);
  const [urlBaru, setUrlBaru] = useState('');
  const [judulBaru, setJudulBaru] = useState('');
  const [simpanRender, setSimpanRender] = useState(false);

  /** Simpan daftar render AI ke tenders.asumsi.renderAi (asumsi dibaca ulang dulu supaya isian lain tidak tertimpa). */
  async function ubahRender(f: (l: NonNullable<TenderRow['asumsi']['renderAi']>) => NonNullable<TenderRow['asumsi']['renderAi']>) {
    if (!data) return;
    setSimpanRender(true); setErr(null);
    const { data: row, error } = await sb.from('tenders').select('asumsi').eq('id', data.t.id).single();
    if (error || !row) { setErr(error?.message ?? 'Gagal membaca tender'); setSimpanRender(false); return; }
    const asumsi = { ...(row.asumsi as TenderRow['asumsi']) };
    asumsi.renderAi = f(asumsi.renderAi ?? []);
    const { error: e2 } = await sb.from('tenders').update({ asumsi }).eq('id', data.t.id);
    if (e2) setErr(e2.message); else setData(d => d ? { ...d, t: { ...d.t, asumsi: { ...d.t.asumsi, renderAi: asumsi.renderAi } } } : d);
    setSimpanRender(false);
  }
  function tambahRender() {
    const url = urlBaru.trim();
    if (!/^https:\/\/\S+$/i.test(url)) { setErr('Link render harus diawali https://'); return; }
    const jenis = /\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video' as const : 'gambar' as const;
    ubahRender(l => [...l, { url, jenis, judul: judulBaru.trim() || (jenis === 'video' ? 'Video render' : 'Render gudang'), dibuat: new Date().toISOString() }])
      .then(() => { setUrlBaru(''); setJudulBaru(''); });
  }

  useEffect(() => {
    sb.from('tenders').select('id, kode, customer, status, updated_at').order('updated_at', { ascending: false }).then(({ data: d, error }: { data: unknown[] | null; error: { message: string } | null }) => {
      if (error) setErr(error.message);
      setDaftar((d ?? []) as T[]);
      const q = new URLSearchParams(window.location.search).get('id');
      if (q) setId(q);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) { setData(null); return; }
    let batal = false;
    setMemuat(true); setErr(null);
    (async () => {
      const { data: row, error } = await sb.from('tenders').select('*').eq('id', id).single();
      if (error || !row) throw new Error(error?.message ?? 'Tender tidak ditemukan');
      const t = row as TenderRow;
      t.asumsi = { ...ASUMSI_DEFAULT, ...(t.asumsi ?? {}) }; t.asumsi.it = { ...IT_SHEET_DEFAULT, ...(t.asumsi.it ?? {}) };
      try {
        const { master } = await muatMaster(sb, t);
        return { t, h: hitungTender(keInput(t), master), sumber: 'hitung' as const };
      } catch {
        if (t.hasil) return { t, h: t.hasil as HasilTender, sumber: 'tersimpan' as const };
        throw new Error('Tender ini belum bisa dihitung — lengkapi input di halaman tender.');
      }
    })().then(r => {
      if (batal) return;
      setData(r); setLebar(''); setDockIn(''); setDockOut(''); setOkup(null); setShift(r.h.processDesign?.shiftAktifIdx?.[0] ?? 0);
      const u = new URL(window.location.href); u.searchParams.set('id', id); window.history.replaceState(null, '', u);
    }).catch(e => { if (!batal) { setErr(e.message); setData(null); } }).finally(() => { if (!batal) setMemuat(false); });
    return () => { batal = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [layout, errLayout] = useMemo((): [LayoutGudang | null, string | null] => {
    if (!data) return [null, null];
    try { return [susunLayout(data.t, data.h, { lebarM: lebar || undefined, dockIn: dockIn || undefined, dockOut: dockOut || undefined, okupansi: okup }), null]; }
    catch (e) { return [null, `Layout tidak bisa disusun: ${(e as Error).message}`]; }
  }, [data, lebar, dockIn, dockOut, okup]);

  const tersaring = daftar.filter(x => !cari || `${x.kode ?? ''} ${x.customer}`.toLowerCase().includes(cari.toLowerCase()));
  const shiftAda = layout?.shiftAktif.length ? layout.shiftAktif : [0];
  const orangShift = layout ? layout.orang.reduce((s, o) => s + Math.round(o.perShift[shift] ?? 0), 0) : 0;
  const totalMhe = layout ? layout.mhe.filter(m => m.jenis !== 'perangkat').reduce((s, m) => s + m.unit, 0) : 0;
  const kap = layout ? layout.rak.reduce((s, r) => s + r.nBay * r.level * r.ppl * r.deep, 0) : 0;
  const isiRak = layout ? layout.palet.filter(p => p.jenis === 'spr' || p.jenis === 'ddr').length : 0;

  function unduh() {
    const url = api.current?.screenshot(); if (!url || !data) return;
    const a = document.createElement('a'); a.href = url; a.download = `Simulasi3D_${(data.t.kode ?? data.t.customer).replace(/[^\w-]+/g, '_')}.png`; a.click();
  }
  const tombolKamera: [Kamera, string][] = [['iso', 'Isometrik'], ['atas', 'Tampak atas'], ['dock', 'Dock'], ['lorong', 'Dalam lorong']];
  const sakelar: [keyof OpsiViewer, string][] = [['animasi', 'Animasi'], ['label', 'Label'], ['orang', 'Manpower'], ['truk', 'Truk'], ['dinding', 'Dinding'], ['atap', 'Atap']];

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Simulasi</div><h1>Simulasi gudang 3D</h1></div>
        {data && <Link className="btn ghost" href={`/tender/${data.t.id}`}>Buka tender</Link>}
      </div>

      <div className="card">
        <div className="sim3d-pilih">
          <label className="f">Cari project<input value={cari} onChange={e => setCari(e.target.value)} placeholder="kode / customer" /></label>
          <label className="f">Project
            <select value={id} onChange={e => setId(e.target.value)}>
              <option value="">— pilih project —</option>
              {tersaring.map(x => <option key={x.id} value={x.id}>{x.kode ? `${x.kode} · ` : ''}{x.customer} ({labelStatus(x.status)})</option>)}
            </select>
          </label>
        </div>
        {(err || errLayout) && <p className="error small" role="alert">{err || errLayout}</p>}
        {!id && <p className="small muted">Pilih project. Tata letak 3D dibuat otomatis dari hasil hitung tender: luas & lebar gudang, rak SPR/DDR (bay, level, tinggi), block stack, staging inbound/outbound, fasilitas, dock, MHE dan manpower per shift.</p>}
        {memuat && <p className="small muted">Menghitung tender & menyusun layout…</p>}
      </div>

      {layout && data && (
        <>
          <div className="kpis">
            <div className="kpi"><span className="small muted">Luas layout 3D</span><b>{Math.round(layout.luasLayout).toLocaleString('id-ID')} m²</b><span className="small muted">rencana {layout.luasRencana.toLocaleString('id-ID')} m²</span></div>
            <div className="kpi"><span className="small muted">Posisi rak terisi</span><b>{isiRak.toLocaleString('id-ID')}</b><span className="small muted">dari {kap.toLocaleString('id-ID')} posisi{kap ? ` (${Math.round((isiRak / kap) * 100)}%)` : ''}</span></div>
            <div className="kpi"><span className="small muted">MHE (unit)</span><b>{totalMhe}</b><span className="small muted">{layout.mhe.filter(m => m.jenis !== 'perangkat').map(m => `${m.nama} ${m.unit}`).join(' · ') || '—'}</span></div>
            <div className="kpi"><span className="small muted">Manpower shift {shift + 1}</span><b>{orangShift}</b><span className="small muted">orang di lantai gudang</span></div>
          </div>

          <div className="sim3d-tata">
            <div className="sim3d-kanvas">
              <Viewer3D ref={api} layout={layout} shift={shift} opsi={opsi} />
              <div className="sim3d-alat">
                {tombolKamera.map(([k, l]) => <button key={k} className="ghost" onClick={() => api.current?.kamera(k)}>{l}</button>)}
                <button className="ghost" onClick={unduh}>Unduh gambar</button>
              </div>
              <p className="sim3d-tip small">Seret = putar · klik kanan / dua jari = geser · scroll = zoom</p>
            </div>

            <div className="card sim3d-panel">
              <div className="grid2" style={{ gap: 8 }}>
                <label className="f">Shift
                  <select value={shift} onChange={e => setShift(Number(e.target.value))}>
                    {shiftAda.map(i => <option key={i} value={i}>Shift {i + 1}</option>)}
                  </select>
                </label>
                <label className="f">Lebar gudang (m)<input type="number" min={8} step={0.5} value={lebar} placeholder={String(Math.round(layout.W * 10) / 10)} onChange={e => setLebar(e.target.value === '' ? '' : Number(e.target.value))} /></label>
                <label className="f">Dock inbound<input type="number" min={1} max={20} value={dockIn} placeholder={String(layout.dock.filter(d => d.arus === 'inbound').length)} onChange={e => setDockIn(e.target.value === '' ? '' : Number(e.target.value))} /></label>
                <label className="f">Dock outbound<input type="number" min={1} max={20} value={dockOut} placeholder={String(layout.dock.filter(d => d.arus === 'outbound').length)} onChange={e => setDockOut(e.target.value === '' ? '' : Number(e.target.value))} /></label>
              </div>
              <label className="f">Okupansi rak {okup == null ? '(sesuai stok desain)' : `${Math.round(okup * 100)}%`}
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input type="range" min={0} max={100} value={okup == null ? (kap ? Math.round((isiRak / kap) * 100) : 0) : Math.round(okup * 100)} onChange={e => setOkup(Number(e.target.value) / 100)} />
                  {okup != null && <button className="ghost" style={{ padding: '4px 10px' }} onClick={() => setOkup(null)}>Reset</button>}
                </div>
              </label>
              <div className="row">
                {sakelar.map(([k, l]) => (
                  <label key={k} className="sim3d-cek"><input type="checkbox" checked={opsi[k]} onChange={e => setOpsi(o => ({ ...o, [k]: e.target.checked }))} />{l}</label>
                ))}
              </div>

              <div>
                <div className="eyebrow">Ringkasan layout</div>
                <table className="sim3d-tabel"><tbody>
                  {layout.ringkas.map(r => <tr key={r.label}><td className="muted">{r.label}</td><td className="num">{r.nilai}</td></tr>)}
                </tbody></table>
              </div>
              <div>
                <div className="eyebrow">Zona</div>
                <table className="sim3d-tabel"><tbody>
                  {layout.zona.map(z => <tr key={z.id}><td>{z.label}</td><td className="small muted">{z.ket}</td></tr>)}
                </tbody></table>
              </div>
              <div>
                <div className="eyebrow">Manpower shift {shift + 1}</div>
                <table className="sim3d-tabel"><tbody>
                  {layout.orang.filter(o => Math.round(o.perShift[shift] ?? 0) > 0).map(o => (
                    <tr key={`${o.jenis}-${o.nama}`}><td><span className="sim3d-titik" style={{ background: WARNA_ORANG[o.kategori] }} />{o.nama}</td><td className="small muted">{LABEL_KAT[o.kategori]}</td><td className="num">{Math.round(o.perShift[shift] ?? 0)}</td></tr>
                  ))}
                  {!layout.orang.some(o => Math.round(o.perShift[shift] ?? 0) > 0) && <tr><td className="muted small">Tidak ada manpower di shift ini.</td></tr>}
                </tbody></table>
              </div>
              <div>
                <div className="eyebrow">MHE</div>
                <table className="sim3d-tabel"><tbody>
                  {layout.mhe.map(m => <tr key={m.nama}><td><span className="sim3d-titik" style={{ background: WARNA_MHE[m.jenis] }} />{m.nama}</td><td className="small muted">{LABEL_MHE[m.jenis]}</td><td className="num">{m.unit}</td></tr>)}
                  {!layout.mhe.length && <tr><td className="muted small">Belum ada MHE di Aktivitas.</td></tr>}
                </tbody></table>
              </div>
              {(layout.asumsi.length > 0 || data.sumber === 'tersimpan') && (
                <div className="notice small">
                  <b>Catatan & asumsi</b>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {data.sumber === 'tersimpan' && <li>Master data tidak bisa dimuat → memakai hasil hitung yang terakhir disimpan.</li>}
                    {layout.asumsi.map(a => <li key={a}>{a}</li>)}
                  </ul>
                </div>
              )}
              <p className="small muted">Sumber data: Space (lebar gudang, rak, staging, fasilitas), Process design (MHE & manpower per shift), data gudang terpilih (jumlah dock). Ubah di halaman tender, lalu buka ulang simulasi.</p>
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div><div className="eyebrow">Render AI · TapNow</div><h3 style={{ margin: 0 }}>Gambar & video render gudang</h3></div>
              <a className="btn ghost" href="https://app.tapnow.ai/" target="_blank" rel="noreferrer">Buka TapNow</a>
            </div>
            <p className="small muted">Render fotorealistis (gaya Lumion) untuk presentasi customer, dibuat dari tata letak 3D di atas. Tempel link gambar / video hasil TapNow supaya tersimpan di project ini.</p>
            {(data.t.asumsi.renderAi ?? []).length > 0 ? (
              <div className="sim3d-galeri">
                {(data.t.asumsi.renderAi ?? []).map((r, i) => (
                  <figure key={`${r.url}-${i}`}>
                    {r.jenis === 'video' ? <video src={r.url} controls preload="metadata" /> : <a href={r.url} target="_blank" rel="noreferrer"><img src={r.url} alt={r.judul} loading="lazy" /></a>}
                    <figcaption className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="small">{r.judul} <span className="muted">· {new Date(r.dibuat).toLocaleDateString('id-ID')}</span></span>
                      <button className="ghost" style={{ padding: '2px 8px' }} disabled={simpanRender} onClick={() => ubahRender(l => l.filter((_, j) => j !== i))} aria-label={`Hapus ${r.judul}`}>×</button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : <p className="small muted">Belum ada render untuk project ini.</p>}
            <div className="sim3d-pilih" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) auto', alignItems: 'end' }}>
              <label className="f">Link gambar / video (https)<input value={urlBaru} onChange={e => setUrlBaru(e.target.value)} placeholder="https://…" /></label>
              <label className="f">Judul<input value={judulBaru} onChange={e => setJudulBaru(e.target.value)} placeholder="mis. Tampak dock outbound" /></label>
              <button onClick={tambahRender} disabled={simpanRender || !urlBaru.trim()}>Simpan</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
