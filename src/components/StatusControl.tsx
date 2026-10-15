'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { STATUS, butuhAlasan, labelStatus } from '@/lib/status';

/** Ubah status project. Menang/kalah/drop wajib alasan; menang menawarkan checklist implementasi. */
export default function StatusControl({ tender, onBerubah }: {
  tender: { id: string; status: string; alasan_hasil: string | null; tanggal_go_live: string | null };
  onBerubah: (status: string) => void;
}) {
  const sb = supabaseBrowser();
  const [ke, setKe] = useState(tender.status);
  const [alasan, setAlasan] = useState(tender.alasan_hasil ?? '');
  const [pesan, setPesan] = useState<string | null>(null);

  async function simpan() {
    setPesan(null);
    if (butuhAlasan(ke) && !alasan.trim()) { setPesan(`Isi alasan ${labelStatus(ke).toLowerCase()} dulu — dipakai untuk analisis menang/kalah.`); return; }
    const patch: Record<string, unknown> = { status: ke, alasan_hasil: alasan || null };
    if (butuhAlasan(ke)) patch.tanggal_keputusan = new Date().toISOString().slice(0, 10);
    const { error } = await sb.from('tenders').update(patch).eq('id', tender.id);
    if (error) { setPesan(error.message); return; }
    if (ke === 'menang' || ke === 'implementasi') {
      const { data, error: e2 } = await sb.rpc('buat_checklist_implementasi', { p_tender: tender.id, p_golive: tender.tanggal_go_live });
      if (e2) setPesan(`Status tersimpan, checklist gagal dibuat: ${e2.message}`);
      else setPesan(Number(data) > 0 ? `Status tersimpan. ${data} tugas implementasi dibuat.` : 'Status tersimpan.');
    } else setPesan('Status tersimpan.');
    onBerubah(ke);
  }

  return (
    <div className="row" style={{ alignItems: 'end' }}>
      <label className="f" htmlFor={`st-${tender.id}`}>Status project
        <select id={`st-${tender.id}`} value={ke} onChange={e => setKe(e.target.value)}>
          {STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select></label>
      {butuhAlasan(ke) && <label className="f" htmlFor={`al-${tender.id}`} style={{ minWidth: 240 }}>Alasan
        <input id={`al-${tender.id}`} value={alasan} onChange={e => setAlasan(e.target.value)} placeholder="mis. harga storage 12% di atas kompetitor" /></label>}
      <button className="ghost" onClick={simpan} disabled={ke === tender.status && alasan === (tender.alasan_hasil ?? '')}>Ubah status</button>
      {pesan && <span className="small" role="status">{pesan}</span>}
    </div>
  );
}
