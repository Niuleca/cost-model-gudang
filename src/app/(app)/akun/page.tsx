'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { ROLE_LABEL } from '@/lib/format';

export default function AkunPage() {
  const { profile } = useProfile();
  const [f, setF] = useState({ full_name: '', username: '', telepon: '', jabatan: '', perusahaan: '' });
  const [pesanProfil, setPesanProfil] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [pesan, setPesan] = useState<string | null>(null);
  const [emailBaru, setEmailBaru] = useState('');
  const [pesanEmail, setPesanEmail] = useState<string | null>(null);
  async function gantiEmail(e: React.FormEvent) {
    e.preventDefault();
    const em = emailBaru.trim().toLowerCase();
    if (!em || em === profile?.email?.toLowerCase()) { setPesanEmail('Isi email baru yang berbeda dari email sekarang.'); return; }
    const { error } = await supabaseBrowser().auth.updateUser({ email: em }, { emailRedirectTo: `${location.origin}/auth/callback?next=/akun` });
    setPesanEmail(error ? error.message : `Link konfirmasi dikirim. Buka email di ${em} (dan bila diminta, juga di email lama) lalu klik link-nya. Email login baru berlaku setelah dikonfirmasi.`);
    if (!error) setEmailBaru('');
  }
  useEffect(() => { if (profile) setF({ full_name: profile.full_name ?? '', username: profile.username ?? (profile.email?.split('@')[0] ?? '').toLowerCase(), telepon: profile.telepon ?? '', jabatan: profile.jabatan ?? '', perusahaan: profile.perusahaan ?? '' }); }, [profile]);

  async function simpanProfil(e: React.FormEvent) {
    e.preventDefault(); if (!profile) return;
    const username = f.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) { setPesanProfil('User ID 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau strip (tanpa spasi).'); return; }
    const telepon = f.telepon.trim();
    if (telepon && !/^\+?[0-9 ()-]{8,20}$/.test(telepon)) { setPesanProfil('Nomor telepon tidak valid (contoh: 0812-3456-7890 atau +62 812 3456 7890).'); return; }
    const { error } = await supabaseBrowser().from('profiles').update({ full_name: f.full_name.trim(), username, telepon: telepon || null, jabatan: f.jabatan.trim() || null, perusahaan: f.perusahaan.trim() || null }).eq('id', profile.id);
    setPesanProfil(error ? (/profiles_username_unik|duplicate/.test(error.message) ? `User ID "${username}" sudah dipakai akun lain.` : error.message) : 'Profil tersimpan. Dipakai otomatis sebagai penanda tangan quotation.');
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
        <label className="f" htmlFor="nm">Nama lengkap<input id="nm" required value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} autoComplete="name" /></label>
        <div className="grid2">
          <label className="f" htmlFor="uid">User ID<input id="uid" required value={f.username} onChange={e => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="mis. eghaesa" autoComplete="username" /></label>
          <label className="f" htmlFor="tel">Nomor telepon<input id="tel" type="tel" value={f.telepon} onChange={e => setF({ ...f, telepon: e.target.value })} placeholder="mis. 0812-3456-7890" autoComplete="tel" /></label>
        </div>
        <div className="grid2">
          <label className="f" htmlFor="em">Email<input id="em" value={profile?.email ?? ''} readOnly disabled /></label>
          <label className="f" htmlFor="rl">Role<input id="rl" value={profile ? ROLE_LABEL[profile.role] : ''} readOnly disabled /></label>
        </div>
        <label className="f" htmlFor="pr">Perusahaan<input id="pr" value={f.perusahaan} onChange={e => setF({ ...f, perusahaan: e.target.value })} placeholder="mis. PT LX Pantos Indonesia" autoComplete="organization" /></label>
        <label className="f" htmlFor="jb">Jabatan<input id="jb" value={f.jabatan} onChange={e => setF({ ...f, jabatan: e.target.value })} placeholder="mis. W&D Business Development" /></label>
        <p className="small muted">Email = alamat login (ganti lewat bagian Ganti email di bawah). Role diatur oleh admin di menu Pengguna &amp; role.</p>
        <p className="small muted">Nama, jabatan, dan perusahaan ini otomatis dipakai di kop & penanda tangan PDF quotation (masih bisa diubah per quotation).</p>
        {pesanProfil && <p className="small" role="status">{pesanProfil}</p>}
        <div className="row"><button type="submit" disabled={!profile}>Simpan profil</button></div>
      </form>
      <form className="card" onSubmit={gantiEmail} style={{ maxWidth: 560 }}>
        <h2>Ganti email</h2>
        <p className="small muted">Email sekarang: <b>{profile?.email}</b>. Email baru dipakai untuk login setelah Anda mengklik link konfirmasi yang dikirim ke email baru.</p>
        <label className="f" htmlFor="emb">Email baru<input id="emb" type="email" required value={emailBaru} onChange={e => setEmailBaru(e.target.value)} autoComplete="email" /></label>
        {pesanEmail && <p className="small" role="status">{pesanEmail}</p>}
        <div className="row"><button type="submit">Kirim link konfirmasi</button></div>
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
