'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { BUCKET_FOTO, adaHarga, fotoDiStorage, fotoUrl, gmapsLink, kedaluwarsa, sewaBulanPenuh, tarifM2, type Warehouse } from '@/lib/warehouse';
import { exportExcel, importExcel, type KolomExcel } from '@/lib/excel';
import { angka, rp, tanggal } from '@/lib/format';
import GroupChips from '@/components/GroupChips';

type Form = Partial<Warehouse>;
const KOSONG: Form = { tipe: 'Ambient', foto: [] };
const KOLOM_X: KolomExcel[] = [
  { key: 'nama', label: 'Nama gudang', width: 260 }, { key: 'pemilik', label: 'Pemilik' }, { key: 'tipe', label: 'Tipe' },
  { key: 'provinsi', label: 'Provinsi' }, { key: 'kab_kota', label: 'Kabupaten/kota' }, { key: 'alamat', label: 'Alamat', width: 320 },
  { key: 'gmaps_url', label: 'Link Google Maps', width: 260 }, { key: 'latitude', label: 'Latitude', type: 'number' }, { key: 'longitude', label: 'Longitude', type: 'number' },
  { key: 'luas_m2', label: 'Luas (m²)', type: 'number' }, { key: 'harga_sewa_m2_bulan', label: 'Harga sewa per m² per bulan', type: 'number' },
  { key: 'harga_per_bulan', label: 'Harga sewa per bulan (utuh)', type: 'number' }, { key: 'tinggi_bersih_m', label: 'Tinggi bersih (m)', type: 'number' },
  { key: 'daya_lantai_ton_m2', label: 'Daya lantai (ton/m²)', type: 'number' }, { key: 'jumlah_dock', label: 'Jumlah dock', type: 'number' },
  { key: 'daya_listrik_kva', label: 'Daya listrik (kVA)', type: 'number' }, { key: 'fasilitas', label: 'Fasilitas / keterangan', width: 360 },
  { key: 'kontak', label: 'Kontak' }, { key: 'sumber', label: 'Sumber harga', width: 240 }, { key: 'tanggal_harga', label: 'Tanggal harga', type: 'date' },
  { key: 'berlaku_sampai', label: 'Berlaku sampai', type: 'date' }, { key: 'foto', label: 'Foto (path, pisahkan koma)', type: 'list', width: 260 },
];
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
  const [fProv, setFProv] = useState('');
  const [impor, setImpor] = useState<{ baru: Form[]; ubah: Form[]; file: string; diabaikan: string[] } | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
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

  const dicari = useMemo(() => rows.filter(w => (!q || `${w.nama} ${w.kab_kota} ${w.provinsi} ${w.pemilik ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [rows, q]);
  const tampil = useMemo(() => dicari.filter(w => !fProv || w.provinsi === fProv), [dicari, fProv]);
  // Dibagi per provinsi; kalau satu provinsi dipilih, dibagi lagi per kabupaten/kota
  const grupGudang = useMemo(() => {
    const m = new Map<string, Warehouse[]>();
    for (const w of tampil) { const k = fProv ? w.kab_kota : w.provinsi; m.set(k, [...(m.get(k) ?? []), w]); }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'id'));
  }, [tampil, fProv]);
  const provinsiList = useMemo(() => Array.from(new Set(prov.map(p => p.provinsi))), [prov]);
  const kotaList = useMemo(() => prov.filter(p => p.provinsi === form?.provinsi).map(p => p.kab_kota), [prov, form?.provinsi]);

  const set = (k: keyof Warehouse, v: unknown) => setForm(f => ({ ...(f ?? {}), [k]: v }));
  const num = (v: string) => (v === '' ? null : Number(v));

  async function simpan() {
    if (!form) return;
    setErr(null);
    if (!form.nama || !form.provinsi || !form.kab_kota || !form.luas_m2) { setErr('Nama, provinsi, kabupaten/kota, dan luas wajib diisi.'); return; }
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
    if (fotoDiStorage(path)) await sb.storage.from(BUCKET_FOTO).remove([path]);
    set('foto', (form?.foto ?? []).filter(p => p !== path));
  }
  async function unduh() {
    setSibuk('Menyiapkan Excel…');
    try { await exportExcel('Database_Gudang', 'Gudang', KOLOM_X, tampil as unknown as Record<string, unknown>[], 'id'); }
    catch (e) { setErr(`Export gagal: ${(e as Error).message}`); }
    setSibuk(null);
  }
  async function bacaFile(f: File | undefined) {
    if (!f) return;
    setErr(null); setSibuk('Membaca file…');
    try {
      const { rows: isi, diabaikan } = await importExcel(f, KOLOM_X, 'id');
      const ids = new Set(rows.map(w => w.id));
      const salah = isi.filter(r => !r.nama || !r.provinsi || !r.kab_kota || !(Number(r.luas_m2) > 0));
      if (salah.length) setErr(`${salah.length} baris dilewati karena nama, provinsi, kabupaten/kota, atau luas kosong.`);
      const ok = isi.filter(r => !salah.includes(r)) as Form[];
      setImpor({ baru: ok.filter(r => !r.id || !ids.has(String(r.id))), ubah: ok.filter(r => r.id && ids.has(String(r.id))), file: f.name, diabaikan });
    } catch (e) { setErr(`Import gagal: ${(e as Error).message}`); }
    setSibuk(null);
  }
  async function terapkan() {
    if (!impor) return;
    setSibuk('Menyimpan…');
    const gagal: string[] = [];
    const bersih = (r: Form) => { const { id: _i, status: _s, updated_at: _u, ...x } = r as Warehouse; return { ...x, foto: x.foto ?? [] }; };
    if (impor.baru.length) { const { error } = await sb.from('warehouses').insert(impor.baru.map(bersih)); if (error) gagal.push(error.message); }
    for (const r of impor.ubah) { const { error } = await sb.from('warehouses').update(bersih(r)).eq('id', String(r.id)); if (error) gagal.push(`${r.nama}: ${error.message}`); }
    setSibuk(null); setImpor(null);
    if (gagal.length) setErr(`Sebagian gagal: ${gagal.slice(0, 3).join(' · ')}`);
    muat();
  }
  async function setStatus(w: Warehouse, status: string) {
    const { error } = await sb.from('warehouses').update({ status }).eq('id', w.id);
    if (error) setErr(error.message); else muat();
  }
  async function hapus(w: Warehouse) {
    const { error } = await sb.from('warehouses').delete().eq('id', w.id);
    if (error) setErr(error.message.includes('foreign key') ? 'Gudang sudah dipakai di tender, tidak bisa dihapus. Ubah masa berlaku saja.' : error.message);
    else { const st = (w.foto ?? []).filter(fotoDiStorage); if (st.length) await sb.storage.from(BUCKET_FOTO).remove(st); muat(); }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="row">
        <input aria-label="Cari gudang" placeholder="Cari nama, kota, pemilik…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 280, background: 'var(--surface)' }} />
        <span className="small muted">{tampil.length} gudang</span>
        {bolehEdit && !form && <button onClick={() => setForm({ ...KOSONG })}>Tambah gudang</button>}
        <button className="ghost" onClick={unduh} disabled={!!sibuk}>Export Excel</button>
        {bolehEdit && <label className="btn ghost" style={{ cursor: 'pointer' }}>Import Excel
          <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={e => { bacaFile(e.target.files?.[0]); e.target.value = ''; }} /></label>}
        {sibuk && <span className="small" role="status">{sibuk}</span>}
      </div>
      <GroupChips nilai={dicari.map(w => w.provinsi)} pilih={fProv} onPilih={setFProv} label="Provinsi" />
      {err && <p className="error small" role="alert">{err}</p>}
      {impor && (
        <div className="notice row" style={{ justifyContent: 'space-between' }}>
          <span className="small"><b>{impor.file}</b>: {impor.baru.length} gudang baru, {impor.ubah.length} diperbarui (dicocokkan lewat kolom ID).{impor.diabaikan.length ? ` Kolom diabaikan: ${impor.diabaikan.join(', ')}.` : ''} Gudang baru masuk sebagai draft.</span>
          <span className="row"><button onClick={terapkan} disabled={!!sibuk}>Terapkan</button><button className="ghost" onClick={() => setImpor(null)}>Batal</button></span>
        </div>
      )}

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

      {tampil.length === 0 && <p className="muted">Belum ada gudang.</p>}
      {grupGudang.map(([judul, isi]) => (
      <section key={judul} style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: '6px 0 0', borderBottom: '2px solid var(--line)', paddingBottom: 4 }}>{judul}
          <span className="small muted" style={{ fontWeight: 400 }}> · {isi.length} gudang · {angka(isi.reduce((a, w) => a + Number(w.luas_m2 || 0), 0))} m²</span></h2>
      <div className="gudang-grid">
        {isi.map(w => (
          <article key={w.id} className="card gudang-kartu">
            <FotoGudang fotos={(w.foto ?? []).map(p => fotoUrl(sb, p))} nama={w.nama} />
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 8 }}>
              <h3 className="satu-baris" title={w.nama}>{w.nama}</h3>
              <span className={`pill ${kedaluwarsa(w) ? 'bad' : w.status === 'approved' ? 'ok' : 'warn'}`}>{kedaluwarsa(w) ? 'expired' : w.status}</span>
            </div>
            <span className="small muted dua-baris" title={`${w.alamat ?? ''} ${w.kab_kota}, ${w.provinsi}`}>{w.alamat ? `${w.alamat}, ` : ''}{w.kab_kota}, {w.provinsi} · {w.tipe}{w.pemilik ? ` · ${w.pemilik}` : ''}</span>
            <table><tbody>
              <tr><td>Luas</td><td className="num">{angka(w.luas_m2)} m²</td></tr>
              <tr><td>Sewa per m²/bulan</td><td className="num">{adaHarga(w) ? rp(tarifM2(w)) : <span className="pill warn">harga belum ada</span>}</td></tr>
              <tr><td>Sewa utuh per bulan</td><td className="num">{adaHarga(w) ? rp(sewaBulanPenuh(w)) : '—'}</td></tr>
              <tr><td>Tinggi bersih · dock</td><td className="num">{w.tinggi_bersih_m != null ? `${w.tinggi_bersih_m} m` : '—'} · {w.jumlah_dock ?? '—'}</td></tr>
              <tr><td>Harga per</td><td className="num">{tanggal(w.tanggal_harga)}{w.berlaku_sampai ? ` · s.d. ${tanggal(w.berlaku_sampai)}` : ''}</td></tr>
            </tbody></table>
            <span className="small muted satu-baris" title={w.sumber ?? ''}>{w.sumber ? `Sumber: ${w.sumber}` : '\u00a0'}</span>
            <div className="row" style={{ marginTop: 'auto' }}>
              <a className="btn ghost" href={gmapsLink(w)} target="_blank" rel="noreferrer">Google Maps</a>
              {bolehEdit && <button className="ghost" onClick={() => { setForm({ ...w }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Ubah</button>}
              {bolehApprove && w.status !== 'approved' && <button onClick={() => setStatus(w, 'approved')}>Approve</button>}
              {bolehEdit && <button className="danger" onClick={() => hapus(w)}>Hapus</button>}
            </div>
          </article>
        ))}
      </div>
      </section>))}
    </div>
  );
}

/** Foto gudang ukuran seragam (tinggi tetap); lebih dari satu foto bisa digeser. */
function FotoGudang({ fotos, nama }: { fotos: string[]; nama: string }) {
  const [i, setI] = useState(0);
  if (!fotos.length) return <div className="gudang-foto kosong small muted">Belum ada foto</div>;
  const k = i % fotos.length;
  return (
    <div className="gudang-foto">
      <img src={fotos[k]} alt={`Foto ${nama} ${k + 1}`} loading="lazy" />
      {fotos.length > 1 && <>
        <button className="geser kiri" aria-label="Foto sebelumnya" onClick={() => setI(k - 1 + fotos.length)}>‹</button>
        <button className="geser kanan" aria-label="Foto berikutnya" onClick={() => setI(k + 1)}>›</button>
        <span className="hitung">{k + 1}/{fotos.length}</span>
      </>}
    </div>);
}
