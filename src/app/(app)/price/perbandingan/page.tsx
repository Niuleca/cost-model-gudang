'use client';
// Perbandingan harga vendor: item yang sama dari beberapa vendor dibandingkan berdasarkan harga di quotation / penawaran.
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { rp, tanggal, persen } from '@/lib/format';
import PdfPreview from '@/app/(app)/tender/[id]/PdfPreview';
import { BUCKET_QUOTATION_VENDOR } from '@/components/TableEditor';

interface Item {
  id: string; kategori: string; item: string; satuan: string | null; harga_beli: number | null; harga_sewa_bulan: number | null;
  vendor: string | null; sumber: string | null; tanggal_harga: string | null; berlaku_sampai: string | null; status_efektif: string;
  mhe_tipe: string | null; kapasitas_ton: number | null; sumber_tenaga: string | null; spesifikasi: string | null;
  quotation_path?: string | null; quotation_nama?: string | null;
}
type Basis = 'auto' | 'sewa' | 'beli';
const norm = (t: string) => t.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9.,]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Kunci "barang yang sama": MHE = tipe + kapasitas + tenaga; lainnya = kategori + nama item (tanpa keterangan dalam kurung). */
const kunci = (x: Item) => x.kategori === 'MHE' && x.mhe_tipe
  ? `MHE|${x.mhe_tipe}|${x.kapasitas_ton ?? ''}|${x.sumber_tenaga ?? ''}`
  : `${x.kategori}|${norm(x.item)}|${(x.satuan ?? '').toLowerCase()}`;
const judulGrup = (x: Item) => x.kategori === 'MHE' && x.mhe_tipe
  ? `${x.mhe_tipe}${x.kapasitas_ton ? ` ${String(x.kapasitas_ton).replace('.', ',')} ton` : ''}${x.sumber_tenaga ? ` · ${x.sumber_tenaga}` : ''}`
  : x.item;

export default function PerbandinganHargaPage() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<Item[]>([]);
  const [muat, setMuat] = useState(true);
  const [kat, setKat] = useState('');
  const [q, setQ] = useState('');
  const [basis, setBasis] = useState<Basis>('auto');
  const [minVendor, setMinVendor] = useState(true);
  const [lihat, setLihat] = useState<{ nama: string; blob: Blob; url: string; pdf: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    sb.from('price_items_status').select('*').limit(3000).then(({ data, error }: { data: Item[] | null; error: { message: string } | null }) => {
      if (error) setErr(error.message); setRows(data ?? []); setMuat(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const harga = (x: Item) => Number((basis === 'sewa' ? x.harga_sewa_bulan : basis === 'beli' ? x.harga_beli : (Number(x.harga_sewa_bulan) > 0 ? x.harga_sewa_bulan : x.harga_beli)) ?? 0);
  const jenisHarga = (x: Item) => basis === 'auto' ? (Number(x.harga_sewa_bulan) > 0 ? 'sewa/bln' : 'beli') : '';
  const kategori = useMemo(() => Array.from(new Set(rows.map(r => r.kategori))).sort(), [rows]);
  const grup = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const r of rows) {
      if (kat && r.kategori !== kat) continue;
      if (!(harga(r) > 0)) continue;
      if (q && !`${r.item} ${r.vendor ?? ''} ${r.mhe_tipe ?? ''} ${r.spesifikasi ?? ''}`.toLowerCase().includes(q.toLowerCase())) continue;
      const k = `${kunci(r)}|${jenisHarga(r)}`; m.set(k, [...(m.get(k) ?? []), r]);
    }
    return Array.from(m.entries()).map(([k, xs]) => ({ k, xs: xs.sort((a, b) => harga(a) - harga(b)) }))
      .filter(g => !minVendor || new Set(g.xs.map(x => (x.vendor ?? '').trim().toLowerCase() || x.id)).size >= 2)
      .sort((a, b) => a.xs[0].kategori.localeCompare(b.xs[0].kategori) || judulGrup(a.xs[0]).localeCompare(judulGrup(b.xs[0])));
  }, [rows, kat, q, basis, minVendor]); // eslint-disable-line react-hooks/exhaustive-deps

  async function buka(x: Item) {
    if (!x.quotation_path) return;
    const { data, error } = await sb.storage.from(BUCKET_QUOTATION_VENDOR).download(x.quotation_path);
    if (error || !data) { setErr(error?.message ?? 'File tidak ditemukan'); return; }
    setLihat({ nama: x.quotation_nama ?? x.quotation_path.split('/').pop() ?? 'quotation', blob: data, url: URL.createObjectURL(data), pdf: data.type === 'application/pdf' });
  }
  const tutup = () => { if (lihat) URL.revokeObjectURL(lihat.url); setLihat(null); };
  const label = (i: number, n: number) => n === 1 ? null : i === 0 ? { l: 'Termurah', c: 'ok' } : i === n - 1 ? { l: 'Termahal', c: 'bad' } : { l: 'Sedang', c: 'warn' };
  const hariIni = new Date().toISOString().slice(0, 10);

  return (<>
    <div className="head"><div><div className="eyebrow">Price Inquiry</div><h1>Perbandingan harga vendor</h1>
      <p className="muted">Barang yang sama dari beberapa vendor dibandingkan berdasarkan harga di quotation / penawaran. MHE dikelompokkan per tipe + kapasitas + tenaga; item lain per kategori + nama item + satuan.</p></div></div>
    <div className="card">
      <div className="grid3">
        <label className="f" htmlFor="pk-kat">Kategori<select id="pk-kat" value={kat} onChange={e => setKat(e.target.value)}><option value="">Semua</option>{kategori.map(k => <option key={k}>{k}</option>)}</select></label>
        <label className="f" htmlFor="pk-basis">Basis harga<select id="pk-basis" value={basis} onChange={e => setBasis(e.target.value as Basis)}>
          <option value="auto">Otomatis (sewa/bln bila ada, selain itu harga beli)</option><option value="sewa">Sewa / bulan</option><option value="beli">Harga beli</option></select></label>
        <label className="f" htmlFor="pk-q">Cari item / vendor<input id="pk-q" value={q} onChange={e => setQ(e.target.value)} placeholder="mis. reach truck 2,5" /></label>
      </div>
      <label className="row small" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={minVendor} onChange={e => setMinVendor(e.target.checked)} /> Hanya tampilkan barang yang punya penawaran dari ≥ 2 vendor</label>
    </div>
    {err && <p className="error small" role="alert">{err}</p>}
    {muat && <p className="muted">Memuat…</p>}
    {!muat && !grup.length && <div className="card"><p className="muted">Belum ada barang dengan penawaran lebih dari satu vendor untuk filter ini. Tambahkan harga dari vendor lain dengan nama item / tipe & kapasitas yang sama di Price Inquiry.</p></div>}
    {grup.map(({ k, xs }) => {
      const min = harga(xs[0]), max = harga(xs[xs.length - 1]);
      return <div key={k} className="card" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{judulGrup(xs[0])} <span className="small muted" style={{ fontWeight: 400 }}>· {xs[0].kategori}{xs[0].satuan ? ` · per ${xs[0].satuan}` : ''} · {xs.length} penawaran</span></h2>
          <span className="small">Rentang <b>{rp(min)}</b> – <b>{rp(max)}</b>{min > 0 && max > min ? <> · selisih <b>{persen((max - min) / min, 0)}</b> ({rp(max - min)})</> : null}</span>
        </div>
        <div className="tablewrap"><table>
          <thead><tr><th>#</th><th>Vendor</th><th>Item / spesifikasi</th><th className="num">{basis === 'sewa' ? 'Sewa / bln' : basis === 'beli' ? 'Harga beli' : `Harga (${jenisHarga(xs[0])})`}</th><th className="num">vs termurah</th><th>Posisi</th><th>Tgl harga</th><th>Berlaku s.d.</th><th>Status</th><th>Quotation</th></tr></thead>
          <tbody>{xs.map((x, i) => { const lb = label(i, xs.length); const exp = !!x.berlaku_sampai && x.berlaku_sampai < hariIni;
            return <tr key={x.id} style={i === 0 && xs.length > 1 ? { background: 'var(--res)' } : undefined}>
              <td className="num">{i + 1}</td><td><b>{x.vendor || <span className="muted">(vendor belum diisi)</span>}</b>{x.sumber && <div className="small muted">{x.sumber}</div>}</td>
              <td>{x.item}{x.spesifikasi && <div className="small muted">{x.spesifikasi}</div>}</td>
              <td className="num"><b>{rp(harga(x))}</b></td>
              <td className="num">{i === 0 ? '—' : `+${persen((harga(x) - min) / (min || 1), 1)}`}</td>
              <td>{lb && <span className={`pill ${lb.c}`}>{lb.l}</span>}</td>
              <td className="small">{tanggal(x.tanggal_harga)}</td>
              <td className="small">{x.berlaku_sampai ? <span className={exp ? 'bad' : undefined}>{tanggal(x.berlaku_sampai)}{exp ? ' · expired' : ''}</span> : '—'}</td>
              <td><span className={`pill ${x.status_efektif === 'approved' ? 'ok' : x.status_efektif === 'expired' ? 'bad' : 'warn'}`}>{x.status_efektif}</span></td>
              <td>{x.quotation_path ? <button className="ghost" onClick={() => buka(x)}>Pratinjau</button> : <span className="small muted">belum ada</span>}</td>
            </tr>; })}</tbody>
        </table></div>
      </div>;
    })}
    {lihat && (lihat.pdf
      ? <PdfPreview blob={lihat.blob} judul={lihat.nama} onTutup={tutup} onUnduh={() => { const a = document.createElement('a'); a.href = lihat.url; a.download = lihat.nama; a.click(); }} />
      : <div className="pv-latar" role="dialog" aria-modal="true" aria-label={`Pratinjau ${lihat.nama}`} onClick={e => { if (e.target === e.currentTarget) tutup(); }}>
          <div className="pv-kotak"><div className="pv-bar"><b className="satu-baris">{lihat.nama}</b><span style={{ flex: 1 }} /><a className="btn ghost" href={lihat.url} download={lihat.nama}>Unduh</a><button onClick={tutup}>Tutup</button></div>
            <div className="pv-isi"><img src={lihat.url} alt={lihat.nama} style={{ maxWidth: '100%' }} /></div></div>
        </div>)}
  </>);
}
