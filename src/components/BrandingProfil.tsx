'use client';
// Logo perusahaan & tanda tangan = tanggung jawab akun (diunggah di Profil). Satu logo + satu TTD per akun;
// unggah baru menggantikan yang lama. Quotation & PDF otomatis memakai milik akun yang sedang login.
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Profile } from '@/lib/useProfile';

export const BUCKET_BRANDING = 'quotation-branding';
export const ROLE_BRANDING = ['solution_design', 'commercial', 'finance', 'admin'];
type Jenis = 'logo' | 'ttd';
interface Aset { id: string; jenis: Jenis; nama: string; path: string; created_by: string; created_at: string; url?: string }
export interface PilihanBranding { logoPath: string | null; ttdPath: string | null }

/** Ambil gambar dari storage privat → data URL + ukuran asli, untuk dimasukkan ke PDF. */
export async function gambarUntukPdf(path: string | null) {
  if (!path) return null;
  const { data } = await supabaseBrowser().storage.from(BUCKET_BRANDING).download(path);
  if (!data) return null;
  const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(data); });
  const ukuran = await new Promise<{ w: number; h: number }>(res => { const img = new Image(); img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => res({ w: 1, h: 1 }); img.src = dataUrl; });
  return { dataUrl, format: data.type.includes('png') ? 'PNG' : data.type.includes('webp') ? 'WEBP' : 'JPEG', ...ukuran };
}

/** Logo & TTD milik akun (terbaru per jenis) + URL pratinjau. */
export function useBrandingSaya(profile: Profile | null) {
  const [aset, setAset] = useState<{ logo: Aset | null; ttd: Aset | null; semua: Aset[] }>({ logo: null, ttd: null, semua: [] });
  const [siap, setSiap] = useState(false);
  const muat = useCallback(async () => {
    if (!profile) return;
    const sb = supabaseBrowser();
    const { data } = await sb.from('quotation_branding').select('id, jenis, nama, path, created_by, created_at').eq('created_by', profile.id).order('created_at', { ascending: false });
    const rows = (data ?? []) as Aset[];
    if (rows.length) {
      const { data: urls } = await sb.storage.from(BUCKET_BRANDING).createSignedUrls(rows.map(r => r.path), 3600);
      for (const r of rows) r.url = urls?.find((u: { path: string | null; signedUrl: string }) => u.path === r.path)?.signedUrl;
    }
    setAset({ logo: rows.find(r => r.jenis === 'logo') ?? null, ttd: rows.find(r => r.jenis === 'ttd') ?? null, semua: rows });
    setSiap(true);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { muat(); }, [muat]);
  const wajib = !!profile && ROLE_BRANDING.includes(profile.role) && (profile.status === undefined || profile.status === 'aktif');
  return { ...aset, siap, muat, wajib, lengkap: !!aset.logo && !!aset.ttd,
    pilihan: { logoPath: aset.logo?.path ?? null, ttdPath: aset.ttd?.path ?? null } as PilihanBranding };
}

/** Pratinjau baca-saja (dipakai di Quotation). */
export function BrandingRingkas({ logo, ttd }: { logo: Aset | null; ttd: Aset | null }) {
  return <div className="br-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(130px, 220px))' }}>
    {([['Logo perusahaan', logo], ['Tanda tangan', ttd]] as const).map(([l, a]) => <div key={l} className="br-item">
      {a?.url ? <img src={a.url} alt={l} style={{ width: '100%', height: 64, objectFit: 'contain' }} /> : <span className="br-kosong bad">belum diunggah</span>}
      <div className="br-nama small">{l}</div></div>)}
  </div>;
}

/** Kelola logo & TTD di Profil: unggah / ganti / hapus milik sendiri. */
export default function BrandingProfil({ profile }: { profile: Profile | null }) {
  const sb = supabaseBrowser();
  const b = useBrandingSaya(profile);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<Jenis | null>(null);

  async function unggah(jenis: Jenis, f: File | undefined) {
    if (!f || !profile) return;
    if (f.size > 2 * 1024 * 1024) { setPesan('Ukuran maksimal 2 MB.'); return; }
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setPesan('Format harus PNG, JPG, atau WEBP.'); return; }
    setSibuk(jenis); setPesan('Mengunggah…');
    const ext = f.name.split('.').pop()?.toLowerCase() ?? 'png';
    const path = `${profile.id}/${jenis}-${Date.now()}.${ext}`;
    const up = await sb.storage.from(BUCKET_BRANDING).upload(path, f, { contentType: f.type });
    if (up.error) { setPesan(`Gagal unggah: ${up.error.message}`); setSibuk(null); return; }
    const ins = await sb.from('quotation_branding').insert({ jenis, nama: f.name.replace(/\.[^.]+$/, ''), path });
    if (ins.error) { await sb.storage.from(BUCKET_BRANDING).remove([path]); setPesan(`Gagal simpan: ${ins.error.message}`); setSibuk(null); return; }
    // satu per akun: versi lama dihapus
    const lama = b.semua.filter(a => a.jenis === jenis);
    for (const a of lama) { await sb.from('quotation_branding').delete().eq('id', a.id); await sb.storage.from(BUCKET_BRANDING).remove([a.path]); }
    setPesan(`${jenis === 'logo' ? 'Logo' : 'Tanda tangan'} tersimpan.`); setSibuk(null); b.muat();
  }
  async function hapus(a: Aset) {
    const del = await sb.from('quotation_branding').delete().eq('id', a.id).select('id');
    if (del.error || !del.data?.length) { setPesan(del.error?.message ?? 'Tidak bisa menghapus.'); return; }
    await sb.storage.from(BUCKET_BRANDING).remove([a.path]); b.muat();
  }

  if (!b.wajib) return null;
  const slot = (jenis: Jenis, judul: string, ket: string) => {
    const a = jenis === 'logo' ? b.logo : b.ttd;
    return <div className="br-galeri">
      <h3>{judul} <span className="bad small">* wajib</span></h3>
      <p className="small muted">{ket}</p>
      <div className={`br-item${a ? ' on' : ''}`} style={{ minHeight: 110 }}>
        {a?.url ? <img src={a.url} alt={judul} style={{ width: '100%', height: 80, objectFit: 'contain', background: 'repeating-conic-gradient(#f3f3f3 0 25%, #fff 0 50%) 0 0 / 12px 12px' }} />
          : <span className="br-kosong bad">{b.siap ? 'Belum diunggah' : 'Memuat…'}</span>}
      </div>
      <div className="row">
        <label className="btn ghost" style={{ cursor: 'pointer' }} aria-disabled={sibuk === jenis}>{a ? 'Ganti' : '+ Unggah'} {jenis === 'logo' ? 'logo' : 'TTD'}
          <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={sibuk === jenis} onChange={e => { unggah(jenis, e.target.files?.[0]); e.target.value = ''; }} /></label>
        {a && <button type="button" className="ghost" onClick={() => hapus(a)}>Hapus</button>}
      </div>
    </div>;
  };
  return (
    <div className="card" style={{ maxWidth: 560 }} id="branding">
      <h2>Logo perusahaan & tanda tangan</h2>
      {b.siap && !b.lengkap && <p className="notice small" role="alert">Wajib diunggah sebelum membuat quotation. Dipakai otomatis di kop & tanda tangan PDF quotation Anda.</p>}
      {pesan && <p className="small" role="status">{pesan}</p>}
      <div className="grid2">
        {slot('logo', 'Logo perusahaan', 'Tampil di kiri atas PDF. PNG latar transparan disarankan, maks. 2 MB.')}
        {slot('ttd', 'Tanda tangan', 'Tampil di atas nama Anda. PNG latar transparan (scan TTD + cap bila perlu), maks. 2 MB.')}
      </div>
      <p className="small muted">Satu logo dan satu TTD per akun — unggah baru menggantikan yang lama. File privat, hanya tim tender yang bisa melihat.</p>
    </div>);
}
