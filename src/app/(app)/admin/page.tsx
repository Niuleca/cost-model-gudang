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
    setPesan(error ? error.message : !data?.length ? 'Tidak tersimpan (hanya master admin).' : 'Role diperbarui.'); muat();
  }

  if (profile && profile.role !== 'admin') return <p>Halaman ini khusus admin.</p>;
  return (
    <>
      <div className="head"><div><div className="eyebrow">Admin</div><h1>Pengguna & role</h1></div></div>
      <p className="small muted">User baru mendaftar sendiri dari halaman login, lalu master admin meng-ACC dan memberi role di menu <a href="/admin/approval">Approval akun</a>. Role hanya bisa diubah master admin.
        Master admin bisa <b>menghapus akun</b> secara permanen: login akun itu hilang, tapi tender, quotation & data kerjanya tetap ada dan dialihkan ke akun master yang menghapus; logo & TTD-nya ikut dihapus.</p>
      {pesan && <p className="small" role="status">{pesan}</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Nama</th><th>User ID</th><th>Email</th><th>Telepon</th><th>Perusahaan</th><th>Status</th><th>Role</th><th /></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id}><td>{r.full_name || '—'}</td><td>{r.username || '—'}</td><td>{r.email}</td><td>{r.telepon || '—'}</td><td>{r.perusahaan || '—'}</td>
            <td>{r.is_pemilik ? <span className="pill ok">Pemilik</span> : r.is_master ? <span className="pill info">Master</span> : r.status === 'pending' ? <span className="pill warn">Menunggu</span> : r.status === 'ditolak' ? <span className="pill bad">Ditolak</span> : 'Aktif'}</td>
            <td><select aria-label={`Role ${r.email}`} value={r.role} onChange={e => ubahRole(r.id, e.target.value as AppRole)} disabled={r.id === profile?.id || !!r.is_master || (profile?.status !== undefined && !profile?.is_master)}>
              {(Object.keys(ROLE_LABEL) as AppRole[]).map(k => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
            </select></td>
            <td>{profile?.is_master && !r.is_pemilik && r.id !== profile.id && (hapusId === r.id
              ? <div className="row" style={{ gap: 4 }}><button className="danger" disabled={sibuk} onClick={() => hapusAkun(r)}>Hapus permanen</button><button className="ghost" onClick={() => setHapusId(null)}>Batal</button></div>
              : <button className="ghost" onClick={() => setHapusId(r.id)}>Hapus</button>)}</td></tr>))}</tbody>
      </table></div>
    </>
  );
}
