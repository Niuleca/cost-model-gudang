'use client';
// Duplikat tender: salin semua isian & hasil hitung ke tender baru (kode baru, status draft, versi 1) — nama customer bisa diganti (default "Nippon Indosari 1").
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { TenderRow } from '@/lib/tender';

const BUANG = ['id', 'kode', 'created_at', 'updated_at', 'created_by', 'status', 'versi', 'alasan_hasil', 'tanggal_keputusan', 'contoh_publik'] as const;

export default function DuplikatTender({ t, simple }: { t: TenderRow; simple: boolean }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [nama, setNama] = useState('');
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const sb = supabaseBrowser();

  async function mulai() {
    setPesan(null); setBuka(true);
    // nomor berikutnya: "Nippon Indosari" → "Nippon Indosari 1", "Nippon Indosari 2", …
    const dasar = t.customer.replace(/\s+\d+$/, '').trim();
    const { data } = await sb.from('tenders').select('customer').ilike('customer', `${dasar.replace(/[%_]/g, '')}%`);
    const angka = (data ?? []).map((r: { customer: string }) => { const m = String(r.customer).match(new RegExp(`^${dasar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`, 'i')); return m ? Number(m[1]) : 0; });
    setNama(`${dasar} ${Math.max(0, ...angka) + 1}`);
  }

  async function duplikat() {
    setSibuk(true); setPesan(null);
    // salin dari data tersimpan di database (bukan state layar) supaya hanya kolom tabel yang ikut
    const { data: asli, error: e1 } = await sb.from('tenders').select('*').eq('id', t.id).single();
    if (e1 || !asli) { setSibuk(false); setPesan(`Gagal membaca tender: ${e1?.message ?? 'tidak ditemukan'}`); return; }
    const salin: Record<string, unknown> = { ...asli };
    for (const k of BUANG) delete salin[k];
    const kode = `TND-${new Date().toISOString().slice(2, 7).replace('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { data, error } = await sb.from('tenders').insert({ ...salin, customer: nama.trim() || t.customer, kode, status: 'draft', versi: 1 }).select('id').single();
    setSibuk(false);
    if (error) { setPesan(`Gagal menduplikat: ${error.message}`); return; }
    router.push(`/${simple ? 'simple' : 'tender'}/${data!.id}`);
  }

  if (!buka) return <button className="ghost" onClick={mulai} title="Salin semua isian & hasil ke tender baru">Duplikat tender</button>;
  return (
    <div className="hapus-box" role="dialog" aria-label="Duplikat tender">
      <p className="small"><b>Duplikat {t.kode ?? t.customer}</b> — semua isian & hasil hitung disalin ke tender baru (kode baru, status Draft, versi 1). Tender asli tidak berubah. Akses berbagi, log status & tugas implementasi tidak ikut disalin.</p>
      <label className="f" htmlFor="dup-nama">Nama customer untuk salinan
        <input id="dup-nama" value={nama} onChange={e => setNama(e.target.value)} autoComplete="off" /></label>
      {pesan && <p className="small error" role="alert">{pesan}</p>}
      <div className="row">
        <button disabled={sibuk || !nama.trim()} onClick={duplikat}>{sibuk ? 'Menyalin…' : 'Buat salinan'}</button>
        <button className="ghost" onClick={() => { setBuka(false); setPesan(null); }}>Batal</button>
      </div>
    </div>);
}
