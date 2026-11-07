'use client';
// Bagian bersama tender Transportation & Intermodal: muat/simpan tender, market price, datalist lokasi, info tender, daftar tender.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { LOKASI, type JenisLokasi } from '@/lib/lokasiIndonesia';
import type { RateTransport } from '@/lib/transport';
import { INDUSTRI, rp, tanggal } from '@/lib/format';
import { labelStatus, pillStatus } from '@/lib/status';
import { useProfile } from '@/lib/useProfile';

export type JenisTenderTr = 'transportation' | 'intermodal';
export interface TenderTr {
  id: string; kode: string | null; customer: string; industri: string | null; provinsi: string; kab_kota: string;
  durasi_kontrak_bulan: number; payment_term_hari: number; tanggal_go_live: string | null; status: string; alasan_hasil: string | null;
  asumsi: Record<string, unknown>; hasil: unknown; jenis_tender: string; created_by: string | null; pic: string | null; updated_at: string;
}

/** Muat satu tender + simpan otomatis 2,5 detik setelah perubahan terakhir. `hasil` dihitung ulang setiap simpan. */
export function useTenderTr(id: string, hitungHasil: (t: TenderTr) => unknown) {
  const sb = supabaseBrowser();
  const [t, setT] = useState<TenderTr | null>(null);
  const [kotor, setKotor] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    sb.from('tenders').select('*').eq('id', id).single().then(({ data, error }: { data: TenderTr | null; error: { message: string } | null }) => {
      if (error || !data) { setErr(error?.message ?? 'Tender tidak ditemukan'); return; }
      setT(data);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const simpan = useCallback(async (row: TenderTr) => {
    const { id: _i, updated_at: _u, created_by: _c, ...rest } = row;
    const { data, error } = await sb.from('tenders').update({ ...rest, hasil: hitungHasil(row) }).eq('id', row.id).select('id');
    if (error) { setErr(`Gagal menyimpan: ${error.message}`); return false; }
    if (!data?.length) { setErr('Tidak tersimpan: draft ini hanya bisa diedit oleh pembuatnya.'); return false; }
    setErr(null); setKotor(false); setPesan('Tersimpan.'); setTimeout(() => setPesan(null), 2000); return true;
  }, [sb, hitungHasil]);
  const tRef = useRef(t); tRef.current = t;
  useEffect(() => {
    if (!kotor || !t) return;
    const h = setTimeout(() => { if (tRef.current) simpan(tRef.current); }, 2500);
    return () => clearTimeout(h);
  }, [kotor, t, simpan]);
  const ubah = (patch: Partial<TenderTr>) => { setT(x => x && ({ ...x, ...patch })); setKotor(true); };
  return { t, setT, ubah, kotor, pesan, err, simpanSekarang: () => t && simpan(t) };
}

/** Market price (transport_rates). */
export function useRates() {
  const [rates, setRates] = useState<RateTransport[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const muat = useCallback(() => {
    supabaseBrowser().from('transport_rates').select('id, moda, origin, destination, armada, basis, harga, vendor, lead_time_hari, min_charge, cakupan, berlaku_sampai, status').limit(5000)
      .then(({ data, error }: { data: RateTransport[] | null; error: { message: string } | null }) => { if (error) setErr(error.message); else setRates((data ?? []).map(r => ({ ...r, harga: Number(r.harga) }))); });
  }, []);
  useEffect(() => { muat(); }, [muat]);
  return { rates, err, muat };
}

/** Datalist kota / pelabuhan / bandara (dipakai input origin & destination). */
export function DatalistLokasi({ id, jenis }: { id: string; jenis: JenisLokasi[] }) {
  return <datalist id={id}>{LOKASI.filter(l => jenis.includes(l.jenis)).map(l => <option key={`${l.jenis}-${l.nama}`} value={l.nama}>{l.pulau}{l.jenis !== 'kota' ? ` · ${l.jenis}` : ''}</option>)}</datalist>;
}

/** Input persen (nilai disimpan desimal). */
export function PersenInput({ nilai, onChange, placeholder, label }: { nilai: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; label: string }) {
  return <input aria-label={label} type="number" step="0.1" value={nilai == null ? '' : Math.round(nilai * 10000) / 100} placeholder={placeholder}
    onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value) / 100)} />;
}

/** Kartu info tender (customer, kategori, lokasi, kontrak, margin global). */
export function InfoTenderTr({ t, ubah, marginGlobal, onMargin, onMarginSemua, adaOverride }: {
  t: TenderTr; ubah: (p: Partial<TenderTr>) => void; marginGlobal: number; onMargin: (v: number) => void; onMarginSemua: () => void; adaOverride: number;
}) {
  return (
    <div className="card">
      <div className="grid-isi">
        <label className="f">Customer<input value={t.customer} onChange={e => ubah({ customer: e.target.value })} /></label>
        <label className="f">Business category<select value={t.industri ?? ''} onChange={e => ubah({ industri: e.target.value || null })}><option value="">—</option>{INDUSTRI.map(i => <option key={i}>{i}</option>)}</select></label>
        <label className="f">Lokasi customer (kota)<input list="dl-kota" value={t.kab_kota} onChange={e => ubah({ kab_kota: e.target.value })} /></label>
        <label className="f">Durasi kontrak (bulan)<input type="number" min={1} value={t.durasi_kontrak_bulan} onChange={e => ubah({ durasi_kontrak_bulan: Number(e.target.value) || 1 })} /></label>
        <label className="f">Payment term (hari)<input type="number" min={0} value={t.payment_term_hari} onChange={e => ubah({ payment_term_hari: Number(e.target.value) || 0 })} /></label>
        <label className="f">Margin global (%)<PersenInput label="Margin global" nilai={marginGlobal} onChange={v => onMargin(v ?? 0)} /></label>
      </div>
      <div className="row small" style={{ marginTop: 8 }}>
        <span className="muted">Margin global dipakai semua rute; isi kolom margin di baris rute untuk pengecualian. Harga jual = harga beli × (1 + margin).</span>
        {adaOverride > 0 && <button className="ghost" onClick={onMarginSemua}>Pakai margin global di {adaOverride} rute yang diubah</button>}
      </div>
      <DatalistLokasi id="dl-kota" jenis={['kota']} />
    </div>);
}

/** Ringkasan biaya / pendapatan / GP. */
export function KartuRingkas({ r, kontrakBulan }: { r: { biayaBulan: number; pendapatanBulan: number; gp: number; gpPersen: number; jumlahRute: number; tanpaHarga: number }; kontrakBulan: number }) {
  return (
    <div className="kpis">
      <div className="kpi"><span className="small muted">Rute</span><b>{r.jumlahRute}</b>{r.tanpaHarga > 0 && <span className="small" style={{ color: 'var(--bad)' }}>{r.tanpaHarga} belum ada harga beli</span>}</div>
      <div className="kpi"><span className="small muted">Biaya beli / bln</span><b>{rp(r.biayaBulan)}</b></div>
      <div className="kpi"><span className="small muted">Pendapatan / bln</span><b>{rp(r.pendapatanBulan)}</b></div>
      <div className="kpi"><span className="small muted">Gross profit / bln</span><b>{rp(r.gp)}</b><span className="small muted">GP {(r.gpPersen * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</span></div>
      <div className="kpi"><span className="small muted">Nilai kontrak</span><b>{rp(r.pendapatanBulan * kontrakBulan)}</b><span className="small muted">{kontrakBulan} bulan</span></div>
    </div>);
}

/** Daftar tender transport / intermodal + form tender baru. */
export function DaftarTenderTr({ jenis, asumsiAwal, basePath }: { jenis: JenisTenderTr; asumsiAwal: Record<string, unknown>; basePath: string }) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const { profile } = useProfile();
  const [rows, setRows] = useState<TenderTr[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [baru, setBaru] = useState({ customer: '', industri: '', kab_kota: '', durasi_kontrak_bulan: 12 });
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => {
    sb.from('tenders').select('id, kode, customer, industri, provinsi, kab_kota, status, updated_at, durasi_kontrak_bulan, hasil, pic').eq('jenis_tender', jenis).order('updated_at', { ascending: false })
      .then(({ data, error }: { data: TenderTr[] | null; error: { message: string } | null }) => { if (error) setErr(error.message); else setRows(data ?? []); });
  }, [jenis]); // eslint-disable-line react-hooks/exhaustive-deps
  const tampil = useMemo(() => rows.filter(r => !q || `${r.kode} ${r.customer} ${r.kab_kota}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  async function buat(e: React.FormEvent) {
    e.preventDefault(); setSibuk(true); setErr(null);
    const awalan = jenis === 'transportation' ? 'TRP' : 'IMD';
    const kode = `${awalan}-${new Date().toISOString().slice(2, 7).replace('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const lok = LOKASI.find(l => l.nama.toLowerCase() === baru.kab_kota.trim().toLowerCase());
    const { data, error } = await sb.from('tenders').insert({
      customer: baru.customer, industri: baru.industri || null, kab_kota: baru.kab_kota || '-', provinsi: lok?.pulau ?? '-', durasi_kontrak_bulan: baru.durasi_kontrak_bulan,
      jenis_tender: jenis, kode, asumsi: asumsiAwal, tipe_gudang: '-', skema: 'Dedicated', skenario_aset: 'Rental',
    }).select('id').single();
    setSibuk(false);
    if (error) { setErr(error.message); return; }
    router.push(`${basePath}/${data!.id}`);
  }
  const bolehBuat = !!profile && ['admin', 'manager', 'solution_design', 'commercial', 'finance'].includes(profile.role);
  const ringkas = (r: TenderTr) => (r.hasil as { simulasi?: { pendapatanBulan: number; gpPersen: number }[] } | null)?.simulasi?.[0];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {bolehBuat && <form className="card" onSubmit={buat}>
        <h2>Tender {jenis === 'transportation' ? 'transportation' : 'intermodal'} baru</h2>
        <div className="grid-isi">
          <label className="f">Customer<input required value={baru.customer} onChange={e => setBaru({ ...baru, customer: e.target.value })} /></label>
          <label className="f">Business category<select value={baru.industri} onChange={e => setBaru({ ...baru, industri: e.target.value })}><option value="">—</option>{INDUSTRI.map(i => <option key={i}>{i}</option>)}</select></label>
          <label className="f">Lokasi customer (kota)<input list="dl-kota-baru" value={baru.kab_kota} onChange={e => setBaru({ ...baru, kab_kota: e.target.value })} placeholder="mis. Jakarta" /></label>
          <label className="f">Durasi kontrak (bulan)<input type="number" min={1} value={baru.durasi_kontrak_bulan} onChange={e => setBaru({ ...baru, durasi_kontrak_bulan: Number(e.target.value) || 1 })} /></label>
          <div className="f"><button type="submit" disabled={sibuk}>{sibuk ? 'Membuat…' : 'Buat tender'}</button></div>
        </div>
        <DatalistLokasi id="dl-kota-baru" jenis={['kota']} />
      </form>}
      {err && <p className="error">{err}</p>}
      <div className="card">
        <div className="row"><input aria-label="Cari" placeholder="Cari kode, customer, kota…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 280 }} /><span className="small muted">{tampil.length} tender</span></div>
        <div className="tablewrap fit"><table className="tabel-fit">
          <thead><tr><th>Kode</th><th>Customer</th><th>Lokasi</th><th>Status</th><th className="num">Pendapatan/bln</th><th className="num">GP</th><th>Diubah</th></tr></thead>
          <tbody>
            {tampil.length === 0 && <tr><td colSpan={7} className="muted">Belum ada tender.</td></tr>}
            {tampil.map(r => { const s = ringkas(r); return (
              <tr key={r.id}><td><Link href={`${basePath}/${r.id}`}>{r.kode ?? r.id.slice(0, 8)}</Link></td><td>{r.customer}</td><td>{r.kab_kota}</td>
                <td><span className={`pill ${pillStatus(r.status)}`}>{labelStatus(r.status)}</span></td>
                <td className="num">{s ? rp(s.pendapatanBulan) : '—'}</td><td className="num">{s ? `${(s.gpPersen * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '—'}</td>
                <td className="small">{tanggal(r.updated_at)}</td></tr>); })}
          </tbody>
        </table></div>
      </div>
    </div>);
}
