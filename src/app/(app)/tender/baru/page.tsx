'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ASUMSI_DEFAULT } from '@/lib/tender';
import { rp, INDUSTRI } from '@/lib/format';

interface Upah { provinsi: string; kab_kota: string; upah_berlaku: number; status_verifikasi: string }

export default function TenderBaru() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [upah, setUpah] = useState<Upah[]>([]);
  const [f, setF] = useState({ customer: '', industri: '', provinsi: '', kab_kota: '', tipe_gudang: 'Ambient', durasi_kontrak_bulan: 24,
    tanggal_go_live: '', jumlah_shift: 1, payment_term_hari: 30, skenario_aset: 'Rental' });
  const [err, setErr] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    sb.from('upah_minimum_berlaku').select('provinsi, kab_kota, upah_berlaku, status_verifikasi').order('provinsi').order('kab_kota').limit(1000)
      .then(({ data }: { data: Upah[] | null }) => setUpah(data ?? []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const provinsi = useMemo(() => Array.from(new Set(upah.map(u => u.provinsi))), [upah]);
  const kabKota = upah.filter(u => u.provinsi === f.provinsi);
  const terpilih = upah.find(u => u.provinsi === f.provinsi && u.kab_kota === f.kab_kota);
  const set = (k: string, v: string | number) => setF(x => ({ ...x, [k]: v }));

  async function buat(e: React.FormEvent) {
    e.preventDefault(); setSibuk(true); setErr(null);
    const kode = `TND-${new Date().toISOString().slice(2, 7).replace('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { data, error } = await sb.from('tenders').insert({
      ...f, kode, tanggal_go_live: f.tanggal_go_live || null, asumsi: ASUMSI_DEFAULT,
    }).select('id').single();
    setSibuk(false);
    if (error) { setErr(error.message); return; }
    router.push(`/tender/${data!.id}`);
  }

  return (
    <>
      <div className="head"><div><div className="eyebrow">UC10 · Input customer & tender</div><h1>Tender baru</h1></div></div>
      <form className="card" onSubmit={buat}>
        <div className="grid3">
          <label className="f" htmlFor="customer">Customer<input id="customer" required value={f.customer} onChange={e => set('customer', e.target.value)} /></label>
          <label className="f" htmlFor="industri">Industri (untuk benchmark produktivitas)<input id="industri" list="industri-list" placeholder="Retail-Consumer, Healthcare…" value={f.industri} onChange={e => set('industri', e.target.value)} />
            <datalist id="industri-list">{INDUSTRI.map(i => <option key={i} value={i} />)}</datalist></label>
          <label className="f" htmlFor="tipe">Tipe gudang
            <select id="tipe" value={f.tipe_gudang} onChange={e => set('tipe_gudang', e.target.value)}>
              {['Ambient', 'Chiller', 'Freezer', 'Hazmat/B3', 'Bonded'].map(x => <option key={x}>{x}</option>)}
            </select></label>
          <label className="f" htmlFor="prov">Provinsi
            <select id="prov" required value={f.provinsi} onChange={e => setF(x => ({ ...x, provinsi: e.target.value, kab_kota: '' }))}>
              <option value="">Pilih provinsi</option>{provinsi.map(p => <option key={p}>{p}</option>)}
            </select></label>
          <label className="f" htmlFor="kab">Kabupaten/Kota
            <select id="kab" required value={f.kab_kota} onChange={e => set('kab_kota', e.target.value)} disabled={!f.provinsi}>
              <option value="">Pilih kab/kota</option>{kabKota.map(k => <option key={k.kab_kota}>{k.kab_kota}</option>)}
            </select></label>
          <div className="f small">Upah minimum berlaku
            <div className="notice">{terpilih ? <>{rp(terpilih.upah_berlaku)} · <span className="muted">{terpilih.status_verifikasi}</span></> : '—'}</div>
          </div>
          <label className="f" htmlFor="durasi">Durasi kontrak (bulan)<input id="durasi" type="number" min={1} value={f.durasi_kontrak_bulan} onChange={e => set('durasi_kontrak_bulan', Number(e.target.value))} /></label>
          <label className="f" htmlFor="golive">Rencana go-live<input id="golive" type="date" value={f.tanggal_go_live} onChange={e => set('tanggal_go_live', e.target.value)} /></label>
          <label className="f" htmlFor="shift">Jumlah shift
            <select id="shift" value={f.jumlah_shift} onChange={e => set('jumlah_shift', Number(e.target.value))}>{[1, 2, 3].map(x => <option key={x} value={x}>{x}</option>)}</select></label>
          <label className="f" htmlFor="top">Payment term (hari)<input id="top" type="number" min={0} value={f.payment_term_hari} onChange={e => set('payment_term_hari', Number(e.target.value))} /></label>
          <label className="f" htmlFor="aset">Skenario aset
            <select id="aset" value={f.skenario_aset} onChange={e => set('skenario_aset', e.target.value)}>{['Rental', 'Own Asset', 'Built-to-Suit'].map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        {err && <p className="error small">{err}</p>}
        <div className="row"><button type="submit" disabled={sibuk}>{sibuk ? 'Membuat…' : 'Buat tender & lanjut isi asumsi'}</button>
          <a className="btn ghost" href="/panduan-leca.pdf" target="_blank" rel="noopener">? Baca saya sebelum mulai</a></div>
      </form>
    </>
  );
}
