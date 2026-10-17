'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

/** Hapus tender permanen (beserta versi, quotation, log status, tugas implementasi). Konfirmasi dengan mengetik kode tender. */
export default function HapusTender({ id, kode, customer }: { id: string; kode: string; customer: string }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [ketik, setKetik] = useState('');
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function hapus() {
    setSibuk(true); setPesan(null);
    const { data, error } = await supabaseBrowser().from('tenders').delete().eq('id', id).select('id');
    setSibuk(false);
    if (error) { setPesan(`Gagal menghapus: ${error.message}`); return; }
    if (!data?.length) { setPesan('Tidak terhapus — hanya pembuat tender atau admin yang bisa menghapus.'); return; }
    router.push('/tender?grup=draft');
  }

  if (!buka) return <button className="danger" onClick={() => setBuka(true)}>Hapus tender</button>;
  return (
    <div className="hapus-box" role="alertdialog" aria-label="Konfirmasi hapus tender">
      <p className="small"><b>Hapus {kode} ({customer}) permanen?</b> Semua versi hitung, quotation, log status, dan tugas implementasi tender ini ikut terhapus dan tidak bisa dikembalikan.</p>
      <label className="f" htmlFor="konf-hapus">Ketik <b>{kode}</b> untuk konfirmasi
        <input id="konf-hapus" value={ketik} onChange={e => setKetik(e.target.value)} autoComplete="off" /></label>
      {pesan && <p className="small error" role="alert">{pesan}</p>}
      <div className="row">
        <button className="danger" disabled={ketik.trim() !== kode || sibuk} onClick={hapus}>{sibuk ? 'Menghapus…' : 'Hapus permanen'}</button>
        <button className="ghost" onClick={() => { setBuka(false); setKetik(''); setPesan(null); }}>Batal</button>
      </div>
    </div>);
}
