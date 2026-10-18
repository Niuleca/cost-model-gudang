'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile, type Profile } from '@/lib/useProfile';
import { ROLE_LABEL, type AppRole } from '@/lib/format';

export default function AdminPage() {
  const sb = supabaseBrowser();
  const { profile } = useProfile();
  const [rows, setRows] = useState<Profile[]>([]);
  const [pesan, setPesan] = useState<string | null>(null);
  const [hapusId, setHapusId] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwBaru, setPwBaru] = useState('');
  const [pwTampil, setPwTampil] = useState<{ email: string; pw: string } | null>(null);
  const acak = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; const b = new Uint32Array(10); crypto.getRandomValues(b); return Array.from(b, x => a[x % a.length]).join('') + '!'; };
  async function aturPassword(r: Profile) {
    if (pwBaru.length < 8) { setPesan('Password minimal 8 karakter.'); return; }
    const { error } = await sb.rpc('set_password_akun', { target: r.id, password_baru: pwBaru });
    if (error) { setPesan(/set_password_akun|does not exist|schema cache/i.test(error.message) ? 'Fitur atur password belum aktif di database — jalankan set_password_akun.sql di Supabase SQL Editor.' : `Gagal: ${error.message}`); return; }
    setPwTampil({ email: r.email ?? '', pw: pwBaru }); setPwFor(null); setPwBaru(''); setPesan(null);
  }
  async function kirimReset(r: Profile) {
    if (!r.email) return;
    const { error } = await sb.auth.resetPasswordForEmail(r.email, { redirectTo: `${location.origin}/auth/callback?next=/akun` });
    setPesan(error ? `Gagal kirim link reset: ${error.message}` : `Link reset password dikirim ke ${r.email}. Pemilik akun membuat password baru sendiri dari link itu.`);
  }
  async function hapusAkun(r: Profile) {
    setSibuk(true); setPesan(`Menghapus ${r.email}…`);
    // file logo/TTD milik akun ini dihapus dari storage dulu
    const { data: br } = await sb.from('quotation_branding').select('path').eq('created_by', r.id);
    const paths = ((br ?? []) as { path: string }[]).map(b => b.path);
    if (paths.length) await sb.storage.from('quotation-branding').remove(paths);
    const { error } = await sb.rpc('hapus_akun', { target: r.id });
    setPesan(error ? (/function .*hapus_akun|does not exist|schema cache/i.test(error.message) ? 'Fitur hapus akun belum aktif di database — jalankan hapus_akun.sql di Supabase SQL Editor.' : `Gagal: ${error.message}`)
      : `Akun ${r.email} dihapus. Tender, quotation & data lain miliknya dialihkan ke akun Anda.`);
    setHapusId(null); setSibuk(false); muat();
  }
  const muat = () => sb.from('profiles').select('*').order('email').then(({ data }: { data: Profile[] | null }) => setRows(data ?? []));
  useEffect(() => { muat(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function ubahRole(id: string, role: AppRole) {
    const { data, error } = await sb.from('profiles').update({ role }).eq('id', id).select('id');
    setPesan(error ? error.message : !data?.length ? 'Tidak tersimpan (hanya Super Admin).' : 'Role diperbarui.'); muat();
  }

  if (profile && profile.role !== 'admin') return <p>Halaman ini khusus admin.</p>;
  return (
    <>
      <div className="head"><div><div className="eyebrow">Admin</div><h1>Pengguna & role</h1></div></div>
      <p className="small muted">User baru mendaftar sendiri dari halaman login, lalu Super Admin meng-ACC dan memberi role di menu <a href="/admin/approval">Approval akun</a>. Role hanya bisa diubah Super Admin.
        Super Admin bisa <b>menghapus akun</b> secara permanen: login akun itu hilang, tapi tender, quotation & data kerjanya tetap ada dan dialihkan ke akun Super Admin yang menghapus; logo & TTD-nya ikut dihapus.
        Password lama tidak bisa dilihat siapa pun (disimpan terenkripsi satu arah). Super Admin bisa <b>Atur password</b> (membuat password baru dan melihatnya sekali) atau <b>Kirim link reset</b> ke email akun.</p>
      {pesan && <p className="small" role="status">{pesan}</p>}
      {pwTampil && <div className="notice small" role="status">Password baru untuk <b>{pwTampil.email}</b>: <code style={{ fontSize: 15, userSelect: 'all' }}>{pwTampil.pw}</code>
        {' '}<button className="ghost" onClick={() => navigator.clipboard?.writeText(pwTampil.pw)}>Salin</button> <button className="ghost" onClick={() => setPwTampil(null)}>Tutup</button>
        <div>Hanya ditampilkan sekali. Kirim ke pemilik akun lewat jalur aman dan minta ia menggantinya di Profil setelah login.</div></div>}
      {pwFor && (() => { const r = rows.find(x => x.id === pwFor); return r && <div className="card" style={{ gap: 8, maxWidth: 520 }}>
        <b>Atur password baru — {r.email}</b>
        <label className="f" htmlFor="pwb">Password baru (min. 8 karakter)<input id="pwb" value={pwBaru} onChange={e => setPwBaru(e.target.value)} autoComplete="new-password" /></label>
        <div className="row"><button onClick={() => aturPassword(r)} disabled={pwBaru.length < 8}>Simpan password</button><button className="ghost" onClick={() => setPwBaru(acak())}>Acak lagi</button><button className="ghost" onClick={() => setPwFor(null)}>Batal</button></div>
      </div>; })()}
      <div className="tablewrap"><table>
        <thead><tr><th>Nama</th><th>User ID</th><th>Email</th><th>Telepon</th><th>Perusahaan</th><th>Status</th><th>Role</th><th /></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id}><td>{r.full_name || '—'}</td><td>{r.username || '—'}</td><td>{r.email}</td><td>{r.telepon || '—'}</td><td>{r.perusahaan || '—'}</td>
            <td>{r.is_pemilik ? <span className="pill ok">Pemilik</span> : r.is_master ? <span className="pill info">Super Admin</span> : r.status === 'pending' ? <span className="pill warn">Menunggu</span> : r.status === 'ditolak' ? <span className="pill bad">Ditolak</span> : 'Aktif'}</td>
            <td><select aria-label={`Role ${r.email}`} value={r.role} onChange={e => ubahRole(r.id, e.target.value as AppRole)} disabled={r.id === profile?.id || !!r.is_master || (profile?.status !== undefined && !profile?.is_master)}>
              {(Object.keys(ROLE_LABEL) as AppRole[]).map(k => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
            </select></td>
            <td><div className="row" style={{ gap: 4 }}>{profile?.is_master && r.id !== profile.id && !r.is_pemilik && <button className="ghost" onClick={() => { setPwFor(pwFor === r.id ? null : r.id); setPwBaru(acak()); }}>Atur password</button>}
              {profile?.is_master && r.id !== profile.id && <button className="ghost" onClick={() => kirimReset(r)}>Kirim link reset</button>}
              {profile?.is_master && !r.is_pemilik && r.id !== profile.id && (hapusId === r.id
              ? <div className="row" style={{ gap: 4 }}><button className="danger" disabled={sibuk} onClick={() => hapusAkun(r)}>Hapus permanen</button><button className="ghost" onClick={() => setHapusId(null)}>Batal</button></div>
              : <button className="ghost" onClick={() => setHapusId(r.id)}>Hapus</button>)}</div></td></tr>))}</tbody>
      </table></div>
    </>
  );
}
