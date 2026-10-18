'use client';
// Approval akun: pendaftar baru menunggu ACC Super Admin + penentuan role. Master juga bisa menunjuk Super Admin lain.
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile, type Profile } from '@/lib/useProfile';
import { ROLE_LABEL, type AppRole } from '@/lib/format';

type Row = Profile & { created_at?: string; disetujui_at?: string | null };
const tgl = (s?: string | null) => s ? new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function ApprovalPage() {
  const sb = supabaseBrowser();
  const { profile } = useProfile();
  const [rows, setRows] = useState<Row[]>([]);
  const [pilihRole, setPilihRole] = useState<Record<string, AppRole>>({});
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const muat = () => sb.from('profiles').select('*').order('created_at', { ascending: false })
    .then(({ data }: { data: Row[] | null }) => setRows(data ?? []));
  useEffect(() => { muat(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const master = !!profile?.is_master;
  const migrasiBelum = rows.length > 0 && rows.every(r => r.status === undefined);

  async function ubah(r: Row, patch: Partial<Row>, ok: string) {
    setSibuk(r.id);
    const { data, error } = await sb.from('profiles').update(patch).eq('id', r.id).select('id');
    setPesan(error ? `Gagal: ${error.message}` : !data?.length ? 'Tidak tersimpan (hanya Super Admin).' : ok);
    setSibuk(null); muat();
  }
  const acc = (r: Row) => { const role = pilihRole[r.id] ?? 'solution_design';
    return ubah(r, { status: 'aktif', role, disetujui_oleh: profile!.id, disetujui_at: new Date().toISOString() } as Partial<Row>, `${r.email} disetujui sebagai ${ROLE_LABEL[role]}.`); };
  const tolak = (r: Row) => ubah(r, { status: 'ditolak', disetujui_oleh: profile!.id, disetujui_at: new Date().toISOString() } as Partial<Row>, `${r.email} ditolak.`);
  const jadikanMaster = (r: Row, on: boolean) => ubah(r, on ? { is_master: true, role: 'admin', status: 'aktif' } : { is_master: false },
    on ? `${r.email} sekarang Super Admin.` : `Super Admin ${r.email} dicabut (tetap admin).`);

  if (profile && profile.role !== 'admin') return <p>Halaman ini khusus admin.</p>;
  const pending = rows.filter(r => r.status === 'pending');
  const ditolak = rows.filter(r => r.status === 'ditolak');
  const aktif = rows.filter(r => r.status === 'aktif' || r.status === undefined);

  const roleSel = (r: Row) => <select aria-label={`Role untuk ${r.email}`} value={pilihRole[r.id] ?? 'solution_design'} disabled={!master}
    onChange={e => setPilihRole({ ...pilihRole, [r.id]: e.target.value as AppRole })}>
    {(Object.keys(ROLE_LABEL) as AppRole[]).map(k => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}</select>;

  return (<>
    <div className="head"><div><div className="eyebrow">Admin</div><h1>Approval akun</h1>
      <p className="muted">Pendaftar baru tidak bisa membuka data apa pun sampai disetujui Super Admin dan diberi role.</p></div></div>
    {migrasiBelum && <p className="notice small">Aturan approval belum aktif di database — jalankan migrasi <b>0014_master_admin_approval</b> dulu.</p>}
    {!master && <p className="notice small">Hanya <b>Super Admin</b> yang bisa ACC, menolak, atau menunjuk Super Admin. Anda bisa melihat daftarnya saja.</p>}
    {pesan && <p className="small" role="status">{pesan}</p>}

    <div className="card">
      <h2>Menunggu persetujuan {pending.length > 0 && <span className="pill warn">{pending.length}</span>}</h2>
      <div className="tablewrap"><table>
        <thead><tr><th>Nama</th><th>Email</th><th>Daftar</th><th>Role</th><th /></tr></thead>
        <tbody>
          {pending.map(r => <tr key={r.id}><td>{r.full_name || '—'}</td><td>{r.email}</td><td className="small">{tgl(r.created_at)}</td>
            <td>{roleSel(r)}</td>
            <td><div className="row"><button onClick={() => acc(r)} disabled={!master || sibuk === r.id}>ACC</button>
              <button className="ghost" onClick={() => tolak(r)} disabled={!master || sibuk === r.id}>Tolak</button></div></td></tr>)}
          {!pending.length && <tr><td colSpan={5} className="muted">Tidak ada akun yang menunggu.</td></tr>}
        </tbody>
      </table></div>
    </div>

    <div className="card">
      <h2>Super Admin</h2>
      <p className="small muted">Super Admin bisa ACC akun, mengatur role & status, dan menunjuk Super Admin lain. Akun <b>pemilik</b> tidak bisa dicabut. Super Admin selalu ber-role Admin.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status Super Admin</th><th /></tr></thead>
        <tbody>{aktif.map(r => <tr key={r.id}><td>{r.full_name || '—'}</td><td>{r.email}</td><td>{ROLE_LABEL[r.role]}</td>
          <td>{r.is_pemilik ? <span className="pill ok">Pemilik · Super Admin</span> : r.is_master ? <span className="pill info">Super Admin</span> : <span className="muted small">—</span>}</td>
          <td>{!r.is_pemilik && (r.is_master
            ? <button className="ghost" disabled={!master || sibuk === r.id} onClick={() => jadikanMaster(r, false)}>Cabut Super Admin</button>
            : <button className="ghost" disabled={!master || sibuk === r.id} onClick={() => jadikanMaster(r, true)}>Jadikan Super Admin</button>)}</td></tr>)}</tbody>
      </table></div>
    </div>

    {ditolak.length > 0 && <div className="card">
      <h2>Ditolak</h2>
      <div className="tablewrap"><table>
        <thead><tr><th>Nama</th><th>Email</th><th>Ditolak</th><th>Role</th><th /></tr></thead>
        <tbody>{ditolak.map(r => <tr key={r.id}><td>{r.full_name || '—'}</td><td>{r.email}</td><td className="small">{tgl(r.disetujui_at)}</td>
          <td>{roleSel(r)}</td><td><button className="ghost" onClick={() => acc(r)} disabled={!master || sibuk === r.id}>ACC sekarang</button></td></tr>)}</tbody>
      </table></div>
    </div>}
  </>);
}
