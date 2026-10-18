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
  const muat = () => sb.from('profiles').select('id, full_name, email, role, username, telepon, perusahaan').order('email').then(({ data }: { data: Profile[] | null }) => setRows(data ?? []));
  useEffect(() => { muat(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function ubahRole(id: string, role: AppRole) {
    const { error } = await sb.from('profiles').update({ role }).eq('id', id);
    setPesan(error ? error.message : 'Role diperbarui.'); muat();
  }

  if (profile && profile.role !== 'admin') return <p>Halaman ini khusus admin.</p>;
  return (
    <>
      <div className="head"><div><div className="eyebrow">Admin</div><h1>Pengguna & role</h1></div></div>
      <p className="small muted">User baru mendaftar sendiri dari halaman login, lalu admin memberi role sesuai departemen.</p>
      {pesan && <p className="small" role="status">{pesan}</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Nama</th><th>User ID</th><th>Email</th><th>Telepon</th><th>Perusahaan</th><th>Role</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id}><td>{r.full_name || '—'}</td><td>{r.username || '—'}</td><td>{r.email}</td><td>{r.telepon || '—'}</td><td>{r.perusahaan || '—'}</td>
            <td><select aria-label={`Role ${r.email}`} value={r.role} onChange={e => ubahRole(r.id, e.target.value as AppRole)} disabled={r.id === profile?.id}>
              {(Object.keys(ROLE_LABEL) as AppRole[]).map(k => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
            </select></td></tr>))}</tbody>
      </table></div>
    </>
  );
}
