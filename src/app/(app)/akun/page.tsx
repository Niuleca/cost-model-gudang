'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { ROLE_LABEL } from '@/lib/format';

export default function AkunPage() {
  const { profile } = useProfile();
  const [f, setF] = useState({ full_name: '', jabatan: '', perusahaan: '' });
  const [pesanProfil, setPesanProfil] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [pesan, setPesan] = useState<string | null>(null);
  useEffect(() => { if (profile) setF({ full_name: profile.full_name ?? '', jabatan: profile.jabatan ?? '', perusahaan: profile.perusahaan ?? '' }); }, [profile]);

  async function simpanProfil(e: React.FormEvent) {
    e.preventDefault(); if (!profile) return;
    const { error } = await supabaseBrowser().from('profiles').update({ full_name: f.full_name.trim(), jabatan: f.jabatan.trim() || null, perusahaan: f.perusahaan.trim() || null }).eq('id', profile.id);
    setPesanProfil(error ? error.message : 'Profil tersimpan. Dipakai otomatis sebagai penanda tangan quotation.');
  }
  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setPesan(error ? error.message : 'Password diperbarui.'); setPw('');
  }
  return (
    <>
      <div className="head"><div><div className="eyebrow">Akun</div><h1>Profil & password</h1>
        {profile && <p className="muted">{profile.email} · {ROLE_LABEL[profile.role]}</p>}</div></div>
      <form className="card" onSubmit={simpanProfil} style={{ maxWidth: 560 }}>
        <h2>Profil</h2>
        <label className="f" htmlFor="nm">Nama lengkap<input id="nm" required value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></label>
        <label className="f" htmlFor="jb">Jabatan<input id="jb" value={f.jabatan} onChange={e => setF({ ...f, jabatan: e.target.value })} placeholder="mis. W&D Business Development" /></label>
        <label className="f" htmlFor="pr">Perusahaan<input id="pr" value={f.perusahaan} onChange={e => setF({ ...f, perusahaan: e.target.value })} placeholder="mis. PT LX Pantos Indonesia" /></label>
        <p className="small muted">Nama, jabatan, dan perusahaan ini otomatis dipakai di kop & penanda tangan PDF quotation (masih bisa diubah per quotation).</p>
        {pesanProfil && <p className="small" role="status">{pesanProfil}</p>}
        <div className="row"><button type="submit" disabled={!profile}>Simpan profil</button></div>
      </form>
      <form className="card" onSubmit={simpan} style={{ maxWidth: 560 }}>
        <h2>Ganti password</h2>
        <label className="f" htmlFor="pw">Password baru<input id="pw" type="password" minLength={8} required value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" /></label>
        {pesan && <p className="small" role="status">{pesan}</p>}
        <div className="row"><button type="submit">Simpan password</button></div>
      </form>
    </>
  );
}
