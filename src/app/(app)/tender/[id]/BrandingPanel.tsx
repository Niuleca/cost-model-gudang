'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Profile } from '@/lib/useProfile';

export const BUCKET_BRANDING = 'quotation-branding';
interface Aset { id: string; jenis: 'logo' | 'ttd'; nama: string; path: string; created_by: string; url?: string }
export interface PilihanBranding { logoPath: string | null; ttdPath: string | null }
const KUNCI = 'leca.branding.pilihan';

export function bacaPilihan(): PilihanBranding {
  try { const v = JSON.parse(localStorage.getItem(KUNCI) ?? 'null'); if (v) return v; } catch { /* abaikan */ }
  return { logoPath: null, ttdPath: null };
}

/** Ambil gambar dari storage privat → data URL + ukuran asli, untuk dimasukkan ke PDF. */
export async function gambarUntukPdf(path: string | null) {
  if (!path) return null;
  const { data } = await supabaseBrowser().storage.from(BUCKET_BRANDING).download(path);
  if (!data) return null;
  const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(data); });
  const ukuran = await new Promise<{ w: number; h: number }>(res => { const img = new Image(); img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => res({ w: 1, h: 1 }); img.src = dataUrl; });
  return { dataUrl, format: data.type.includes('png') ? 'PNG' : data.type.includes('webp') ? 'WEBP' : 'JPEG', ...ukuran };
}

/** Kelola logo & tanda tangan: unggah, pilih untuk PDF, hapus. */
export default function BrandingPanel({ profile, onPilih }: { profile: Profile | null; onPilih: (p: PilihanBranding) => void }) {
  const sb = supabaseBrowser();
  const [aset, setAset] = useState<Aset[]>([]);
  const [pilih, setPilihState] = useState<PilihanBranding>({ logoPath: null, ttdPath: null });
  const [pesan, setPesan] = useState<string | null>(null);
  const [hapusId, setHapusId] = useState<string | null>(null);

  const muat = useCallback(async () => {
    const { data } = await sb.from('quotation_branding').select('id, jenis, nama, path, created_by').order('created_at', { ascending: false });
    const rows = (data ?? []) as Aset[];
    if (rows.length) {
      const { data: urls } = await sb.storage.from(BUCKET_BRANDING).createSignedUrls(rows.map(r => r.path), 3600);
      for (const r of rows) r.url = urls?.find((u: { path: string | null; signedUrl: string }) => u.path === r.path)?.signedUrl;
    }
    setAset(rows);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { muat(); const p = bacaPilihan(); setPilihState(p); onPilih(p); }, [muat]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPilih = (p: PilihanBranding) => { setPilihState(p); onPilih(p); try { localStorage.setItem(KUNCI, JSON.stringify(p)); } catch { /* abaikan */ } };

  async function unggah(jenis: 'logo' | 'ttd', f: File | undefined) {
    if (!f || !profile) return;
    if (f.size > 2 * 1024 * 1024) { setPesan('Ukuran maksimal 2 MB.'); return; }
    setPesan('Mengunggah…');
    const ext = f.name.split('.').pop()?.toLowerCase() ?? 'png';
    const path = `${profile.id}/${jenis}-${Date.now()}.${ext}`;
    const up = await sb.storage.from(BUCKET_BRANDING).upload(path, f, { contentType: f.type });
    if (up.error) { setPesan(`Gagal unggah: ${up.error.message}`); return; }
    const ins = await sb.from('quotation_branding').insert({ jenis, nama: f.name.replace(/\.[^.]+$/, ''), path });
    if (ins.error) { await sb.storage.from(BUCKET_BRANDING).remove([path]); setPesan(`Gagal simpan: ${ins.error.message}`); return; }
    setPesan(null);
    setPilih({ ...pilih, [jenis === 'logo' ? 'logoPath' : 'ttdPath']: path });
    muat();
  }
  async function hapus(a: Aset) {
    const del = await sb.from('quotation_branding').delete().eq('id', a.id).select('id');
    if (del.error || !del.data?.length) { setPesan(del.error?.message ?? 'Hanya pengunggah atau admin yang bisa menghapus.'); setHapusId(null); return; }
    await sb.storage.from(BUCKET_BRANDING).remove([a.path]);
    if (pilih.logoPath === a.path) setPilih({ ...pilih, logoPath: null });
    if (pilih.ttdPath === a.path) setPilih({ ...pilih, ttdPath: null });
    setHapusId(null); muat();
  }

  const Galeri = ({ jenis, judul, ket }: { jenis: 'logo' | 'ttd'; judul: string; ket: string }) => {
    const k = jenis === 'logo' ? 'logoPath' : 'ttdPath';
    const isi = aset.filter(a => a.jenis === jenis);
    return (
      <div className="br-galeri">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>{judul}</h3>
          <label className="btn ghost" style={{ cursor: 'pointer' }}>+ Unggah {jenis === 'logo' ? 'logo' : 'TTD'}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={e => { unggah(jenis, e.target.files?.[0]); e.target.value = ''; }} /></label>
        </div>
        <p className="small muted">{ket}</p>
        <div className="br-grid">
          <button type="button" className={`br-item${!pilih[k] ? ' on' : ''}`} onClick={() => setPilih({ ...pilih, [k]: null })}>
            <span className="br-kosong">Tanpa {jenis === 'logo' ? 'logo' : 'TTD'}</span></button>
          {isi.map(a => (
            <div key={a.id} className={`br-item${pilih[k] === a.path ? ' on' : ''}`}>
              <button type="button" className="br-pilih" onClick={() => setPilih({ ...pilih, [k]: a.path })} aria-label={`Pilih ${a.nama}`}>
                {a.url ? <img src={a.url} alt={a.nama} /> : <span className="br-kosong">…</span>}</button>
              <div className="br-nama small" title={a.nama}>{a.nama}</div>
              {(a.created_by === profile?.id || profile?.role === 'admin') && (hapusId === a.id
                ? <div className="row small" style={{ gap: 4 }}><button className="danger" style={{ padding: '2px 8px' }} onClick={() => hapus(a)}>Yakin hapus</button><button className="ghost" style={{ padding: '2px 8px' }} onClick={() => setHapusId(null)}>Batal</button></div>
                : <button className="ghost small" style={{ padding: '2px 8px' }} onClick={() => setHapusId(a.id)}>Hapus</button>)}
            </div>))}
        </div>
      </div>);
  };

  return (
    <div className="card" style={{ gap: 12 }}>
      <h3>Logo & tanda tangan PDF</h3>
      {pesan && <p className="small" role="status">{pesan}</p>}
      <div className="grid2">
        {Galeri({ jenis: 'logo', judul: 'Logo kop', ket: 'Tampil di kiri atas PDF. Disarankan PNG latar transparan, maks. 2 MB.' })}
        {Galeri({ jenis: 'ttd', judul: 'Tanda tangan', ket: 'Tampil di atas nama penanda tangan. Disarankan PNG latar transparan (scan TTD + cap bila perlu).' })}
      </div>
      <p className="small muted">Pilihan yang ditandai dipakai saat Unduh PDF dan diingat di perangkat ini. File disimpan privat — hanya tim tender yang bisa melihat.</p>
    </div>);
}
