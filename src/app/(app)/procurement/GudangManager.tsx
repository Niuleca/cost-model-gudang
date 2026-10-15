'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { BUCKET_FOTO, fotoUrl, gmapsLink, kedaluwarsa, sewaBulanPenuh, tarifM2, type Warehouse } from '@/lib/warehouse';
import { angka, rp, tanggal } from '@/lib/format';

type Form = Partial<Warehouse>;
const KOSONG: Form = { tipe: 'Ambient', foto: [] };
const TIPE = ['Ambient', 'Cold storage', 'Chiller', 'Air-conditioned', 'Bonded', 'Open yard', 'B3 / kimia'];

/** Menu 1 · Procurement: master gudang terbaru dengan foto, lokasi Google Maps, harga sewa. */
export default function GudangManager() {
  const sb = supabaseBrowser();
  const { profile } = useProfile();
  const [rows, setRows] = useState<Warehouse[]>([]);
  const [prov, setProv] = useState<{ provinsi: string; kab_kota: string }[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [upload, setUpload] = useState(false);
  const bolehEdit = !!profile && ['procurement', 'admin', 'solution_design'].includes(profile.role);
  const bolehApprove = !!profile && ['solution_design', 'admin'].includes(profile.role);

  const muat = useCallback(async () => {
    const { data, error } = await sb.from('warehouses').select('*').order('updated_at', { ascending: false });
    if (error) setErr(error.message); else setRows((data ?? []) as Warehouse[]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    muat();
    sb.from('umk').select('provinsi, kab_kota').order('provinsi').order('kab_kota').then(({ data }: { data: { provinsi: string; kab_kota: string }[] | null }) => setProv(data ?? []));
  }, [muat]); // eslint-disable-line react-hooks/exhaustive-deps

  const tampil = useMemo(() => rows.filter(w => !q || `${w.nama} ${w.kab_kota} ${w.provinsi} ${w.pemilik ?? ''}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const provinsiList = useMemo(() => Array.from(new Set(prov.map(p => p.provinsi))), [prov]);
  const kotaList = useMemo(() => prov.filter(p => p.provinsi === form?.provinsi).map(p => p.kab_kota), [prov, form?.provinsi]);

  const set = (k: keyof Warehouse, v: unknown) => setForm(f => ({ ...(f ?? {}), [k]: v }));
  const num = (v: string) => (v === '' ? null : Number(v));

  async function simpan() {
    if (!form) return;
    setErr(null);
    if (!form.nama || !form.provinsi || !form.kab_kota || !form.luas_m2) { setErr('Nama, provinsi, kabupaten/kota, dan luas wajib diisi.'); return; }
    if (form.harga_sewa_m2_bulan == null && form.harga_per_bulan == null) { setErr('Isi harga sewa per m² atau harga per bulan.'); return; }
    const { id, updated_at: _u, status: _s, ...isi } = form as Warehouse;
    const res = id ? await sb.from('warehouses').update(isi).eq('id', id) : await sb.from('warehouses').insert(isi);
    if (res.error) { setErr(res.error.message); return; }
    setForm(null); muat();
  }

  async function unggah(files: FileList | null) {
    if (!files?.length || !form) return;
    setUpload(true); setErr(null);
    const baru: string[] = [];
    for (const f of Array.from(files)) {
      if (f.size > 5 * 1024 * 1024) { setErr(`${f.name} lebih dari 5 MB.`); continue; }
      const path = `${crypto.randomUUID()}.${(f.name.split('.').pop() ?? 'jpg').toLowerCase()}`;
      const { error } = await sb.storage.from(BUCKET_FOTO).upload(path, f, { contentType: f.type });
      if (error) setErr(error.message); else baru.push(path);
    }
    set('foto', [...(form.foto ?? []), ...baru]);
    setUpload(false);
  }
  async function hapusFoto(path: string) {
    await sb.storage.from(BUCKET_FOTO).remove([path]);
    set('foto', (form?.foto ?? []).filter(p => p !== path));
  }
  async function setStatus(w: Warehouse, status: string) {
    const { error } = await sb.from('warehouses').update({ status }).eq('id', w.id);
    if (error) setErr(error.message); else muat();
  }
  async function hapus(w: Warehouse) {
    const { error } = await sb.from('warehouses').delete().eq('id', w.id);
    if (error) setErr(error.message.includes('foreign key') ? 'Gudang sudah dipakai di tender, tidak bisa dihapus. Ubah masa berlaku saja.' : error.message);
    else { if (w.foto?.length) await sb.storage.from(BUCKET_FOTO).remove(w.foto); muat(); }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="row">
        <input aria-label="Cari gudang" placeholder="Cari nama, kota, pemilik…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 280, background: 'var(--surface)' }} />
        <span className="small muted">{tampil.length} gudang</span>
        {bolehEdit && !form && <button onClick={() => setForm({ ...KOSONG })}>Tambah gudang</button>}
      </div>
      {err && <p className="error small" role="alert">{err}</p>}

      {form && (
        <div className="card" style={{ borderTop: '4px solid var(--floor)' }}>
          <h2>{form.id ? 'Ubah gudang' : 'Gudang baru'}</h2>
          <div className="grid3">
            <label className="f" htmlFor="g-nama">Nama gudang<input id="g-nama" value={form.nama ?? ''} onChange={e => set('nama', e.target.value)} /></label>
            <label className="f" htmlFor="g-pemilik">Pemilik / landlord<input id="g-pemilik" value={form.pemilik ?? ''} onChange={e => set('pemilik', e.target.value)} /></label>
            <label className="f" htmlFor="g-tipe">Tipe<select id="g-tipe" value={form.tipe ?? 'Ambient'} onChange={e => set('tipe', e.target.value)}>{TIPE.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="f" htmlFor="g-prov">Provinsi<select id="g-prov" value={form.provinsi ?? ''} onChange={e => { set('provinsi', e.target.value); set('kab_kota', ''); }}><option value="">Pilih…</option>{provinsiList.map(p => <option key={p}>{p}</option>)}</select></label>
            <label className="f" htmlFor="g-kota">Kabupaten/kota<select id="g-kota" value={form.kab_kota ?? ''} onChange={e => set('kab_kota', e.target.value)}><option value="">Pilih…</option>{kotaList.map(k => <option key={k}>{k}</option>)}</select></label>
            <label className="f" htmlFor="g-alamat">Alamat<input id="g-alamat" value={form.alamat ?? ''} onChange={e => set('alamat', e.target.value)} /></label>
            <label className="f" htmlFor="g-gmaps">Link Google Maps<input id="g-gmaps" value={form.gmaps_url ?? ''} onChange={e => set('gmaps_url', e.target.value)} placeholder="https://maps.app.goo.gl/…" /></label>
            <label className="f" htmlFor="g-lat">Latitude<input id="g-lat" type="number" step="any" value={form.latitude ?? ''} onChange={e => set('latitude', num(e.target.value))} /></label>
            <label className="f" htmlFor="g-lng">Longitude<input id="g-lng" type="number" step="any" value={form.longitude ?? ''} onChange={e => set('longitude', num(e.target.value))} /></label>
            <label className="f" htmlFor="g-luas">Luas (m²)<input id="g-luas" type="number" value={form.luas_m2 ?? ''} onChange={e => set('luas_m2', num(e.target.value))} /></label>
            <label className="f" htmlFor="g-hm2">Harga sewa per m² per bulan<input id="g-hm2" type="number" value={form.harga_sewa_m2_bulan ?? ''} onChange={e => set('harga_sewa_m2_bulan', num(e.target.value))} /></label>
            <label className="f" htmlFor="g-hbl">Harga sewa per bulan (utuh)<input id="g-hbl" type="number" value={form.harga_per_bulan ?? ''} onChange={e => set('harga_per_bulan', num(e.target.value))} /></label>
            <label className="f" htmlFor="g-tinggi">Tinggi bersih (m)<input id="g-tinggi" type="number" step="any" value={form.tinggi_bersih_m ?? ''} onChange={e => set('tinggi_bersih_m', num(e.target.value))} /></label>
            <label className="f" htmlFor="g-lantai">Daya dukung lantai (ton/m²)<input id="g-lantai" type="number" step="any" value={form.daya_lantai_ton_m2 ?? ''} onChange={e => set('daya_lantai_ton_m2', num(e.target.value))} /></label>
            <label className="f" htmlFor="g-dock">Jumlah dock<input id="g-dock" type="number" value={form.jumlah_dock ?? ''} onChange={e => set('jumlah_dock', num(e.target.value))} /></label>
            <label className="f" htmlFor="g-kva">Daya listrik (kVA)<input id="g-kva" type="number" value={form.daya_listrik_kva ?? ''} onChange={e => set('daya_listrik_kva', num(e.target.value))} /></label>
            <label className="f" htmlFor="g-fas">Fasilitas<input id="g-fas" value={form.fasilitas ?? ''} onChange={e => set('fasilitas', e.target.value)} placeholder="office, toilet, mushola, parkir truk…" /></label>
            <label className="f" htmlFor="g-kontak">Kontak<input id="g-kontak" value={form.kontak ?? ''} onChange={e => set('kontak', e.target.value)} /></label>
            <label className="f" htmlFor="g-sumber">Sumber harga<input id="g-sumber" value={form.sumber ?? ''} onChange={e => set('sumber', e.target.value)} placeholder="penawaran landlord no…, survei…" /></label>
            <label className="f" htmlFor="g-tgl">Tanggal harga<input id="g-tgl" type="date" value={form.tanggal_harga ?? ''} onChange={e => set('tanggal_harga', e.target.value || null)} /></label>
            <label className="f" htmlFor="g-berlaku">Berlaku sampai<input id="g-berlaku" type="date" value={form.berlaku_sampai ?? ''} onChange={e => set('berlaku_sampai', e.target.value || null)} /></label>
          </div>
          <div>
            <label className="f" htmlFor="g-foto">Foto (maks 5 MB per file)<input id="g-foto" type="file" accept="image/*" multiple onChange={e => unggah(e.target.files)} style={{ background: 'var(--surface)' }} /></label>
            {upload && <span className="small">Mengunggah…</span>}
            <div className="row" style={{ marginTop: 8 }}>
              {(form.foto ?? []).map(p => (
                <figure key={p} style={{ margin: 0, display: 'grid', gap: 4 }}>
                  <img src={fotoUrl(sb, p)} alt="Foto gudang" style={{ width: 140, height: 90, objectFit: 'cover' }} />
                  <button className="danger" onClick={() => hapusFoto(p)}>Hapus foto</button>
                </figure>))}
            </div>
          </div>
          <div className="row"><button onClick={simpan} disabled={upload}>Simpan</button><button className="ghost" onClick={() => setForm(null)}>Batal</button></div>
        </div>
      )}

      <div className="grid2">
        {tampil.map(w => (
          <article key={w.id} className="card" style={{ gap: 8 }}>
            {w.foto?.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: w.foto.length > 1 ? '2fr 1fr' : '1fr', gap: 4 }}>
                <img src={fotoUrl(sb, w.foto[0])} alt={`Foto ${w.nama}`} style={{ width: '100%', height: 170, objectFit: 'cover' }} />
                {w.foto.length > 1 && <div style={{ display: 'grid', gap: 4 }}>{w.foto.slice(1, 3).map(p => <img key={p} src={fotoUrl(sb, p)} alt="" style={{ width: '100%', height: 83, objectFit: 'cover' }} />)}</div>}
              </div>
            ) : <div className="small muted" style={{ height: 110, display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}>Belum ada foto</div>}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>{w.nama}</h3>
              <span className={`pill ${kedaluwarsa(w) ? 'bad' : w.status === 'approved' ? 'ok' : 'warn'}`}>{kedaluwarsa(w) ? 'expired' : w.status}</span>
            </div>
            <span className="small muted">{w.alamat ? `${w.alamat}, ` : ''}{w.kab_kota}, {w.provinsi} · {w.tipe}{w.pemilik ? ` · ${w.pemilik}` : ''}</span>
            <table><tbody>
              <tr><td>Luas</td><td className="num">{angka(w.luas_m2)} m²</td></tr>
              <tr><td>Sewa per m²/bulan</td><td className="num">{rp(tarifM2(w))}</td></tr>
              <tr><td>Sewa utuh per bulan</td><td className="num">{rp(sewaBulanPenuh(w))}</td></tr>
              {w.tinggi_bersih_m != null && <tr><td>Tinggi bersih</td><td className="num">{w.tinggi_bersih_m} m</td></tr>}
              {w.jumlah_dock != null && <tr><td>Dock</td><td className="num">{w.jumlah_dock}</td></tr>}
              <tr><td>Harga per</td><td className="num">{tanggal(w.tanggal_harga)}{w.berlaku_sampai ? ` · s.d. ${tanggal(w.berlaku_sampai)}` : ''}</td></tr>
            </tbody></table>
            {w.sumber && <span className="small muted">Sumber: {w.sumber}</span>}
            <div className="row">
              <a className="btn ghost" href={gmapsLink(w)} target="_blank" rel="noreferrer">Google Maps</a>
              {bolehEdit && <button className="ghost" onClick={() => { setForm({ ...w }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Ubah</button>}
              {bolehApprove && w.status !== 'approved' && <button onClick={() => setStatus(w, 'approved')}>Approve</button>}
              {bolehEdit && <button className="danger" onClick={() => hapus(w)}>Hapus</button>}
            </div>
          </article>
        ))}
        {tampil.length === 0 && <p className="muted">Belum ada gudang.</p>}
      </div>
    </div>
  );
}
