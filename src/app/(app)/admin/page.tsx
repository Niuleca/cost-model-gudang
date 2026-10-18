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
      <p className="small muted">User baru mendaftar sendiri dari halaman login, lalu master admin meng-ACC dan memberi role di menu <a href="/admin/approval">Approval akun</a>. Role hanya bisa diubah master admin.</p>
      {pesan && <p className="small" role="status">{pesan}</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Nama</th><th>User ID</th><th>Email</th><th>Telepon</th><th>Perusahaan</th><th>Status</th><th>Role</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id}><td>{r.full_name || '—'}</td><td>{r.username || '—'}</td><td>{r.email}</td><td>{r.telepon || '—'}</td><td>{r.perusahaan || '—'}</td>
            <td>{r.is_pemilik ? <span className="pill ok">Pemilik</span> : r.is_master ? <span className="pill info">Master</span> : r.status === 'pending' ? <span className="pill warn">Menunggu</span> : r.status === 'ditolak' ? <span className="pill bad">Ditolak</span> : 'Aktif'}</td>
            <td><select aria-label={`Role ${r.email}`} value={r.role} onChange={e => ubahRole(r.id, e.target.value as AppRole)} disabled={r.id === profile?.id || !!r.is_master || (profile?.status !== undefined && !profile?.is_master)}>
              {(Object.keys(ROLE_LABEL) as AppRole[]).map(k => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
            </select></td></tr>))}</tbody>
      </table></div>
    </>
  );
}
