'use client';
import ExportButton from '@/components/ExportButton';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { angka, persen, rp, tanggal, INDUSTRI } from '@/lib/format';
import { labelStatus, pillStatus, MENANG, KALAH } from '@/lib/status';

interface Ov {
  id: string; kode: string | null; customer: string; industri: string | null; provinsi: string; kab_kota: string; tipe_gudang: string;
  skema: string; status: string; created_at: string; durasi_kontrak_bulan: number; jumlah_shift: number;
  biaya_bulan: number | null; pendapatan_bulan: number | null; gp_persen: number | null; headcount: number | null; luas_m2: number | null;
  posisi_palet: number | null; tarif_storage: number | null; uom_storage: string | null; tarif_handling_in: number | null;
  tarif_handling_out: number | null; uom_handling: string | null;
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const selisih = (x: number | null, ref: number | null) => x == null || ref == null || ref === 0 ? null : x / ref - 1;

/** Menu 10 · Perbandingan harga dengan project sebelumnya (UoM sama, filter industri/provinsi/tipe). */
export default function Perbandingan() {
  const [rows, setRows] = useState<Ov[]>([]);
  const [acuan, setAcuan] = useState('');
  const [f, setF] = useState({ industri: '', provinsi: '', tipe: '', hasil: '' });
  useEffect(() => {
    supabaseBrowser().from('tender_overview').select('*').not('biaya_bulan', 'is', null).order('created_at', { ascending: false })
      .then(({ data }: { data: unknown }) => setRows((data ?? []) as Ov[]));
  }, []);

  const ref = rows.find(r => r.id === acuan) ?? null;
  const pembanding = useMemo(() => rows.filter(r => r.id !== acuan
    && (!f.industri || r.industri === f.industri) && (!f.provinsi || r.provinsi === f.provinsi) && (!f.tipe || r.tipe_gudang === f.tipe)
    && (!f.hasil || (f.hasil === 'menang' ? MENANG.includes(r.status) : f.hasil === 'kalah' ? KALAH.includes(r.status) : true))
    && (!ref || (r.uom_storage === ref.uom_storage && r.uom_handling === ref.uom_handling))), [rows, acuan, f, ref]);

  const biayaM2 = (r: Ov) => r.biaya_bulan && r.luas_m2 ? Number(r.biaya_bulan) / Number(r.luas_m2) : null;
  const med = {
    storage: median(pembanding.map(r => Number(r.tarif_storage)).filter(Boolean)),
    hi: median(pembanding.map(r => Number(r.tarif_handling_in)).filter(Boolean)),
    ho: median(pembanding.map(r => Number(r.tarif_handling_out)).filter(Boolean)),
    gp: median(pembanding.map(r => Number(r.gp_persen)).filter(x => x !== 0)),
    m2: median(pembanding.map(biayaM2).filter((x): x is number => x != null)),
  };
  const provinsi = Array.from(new Set(rows.map(r => r.provinsi))).sort();
  const tipe = Array.from(new Set(rows.map(r => r.tipe_gudang))).sort();

  const Delta = ({ x, r }: { x: number | null; r: number | null }) => {
    const d = selisih(x, r); if (d == null) return null;
    return <div className="small" style={{ color: Math.abs(d) < 0.1 ? 'var(--muted)' : d > 0 ? 'var(--warn)' : 'var(--accent)' }}>{d > 0 ? '+' : ''}{(d * 100).toFixed(0)}% vs median</div>;
  };

  return (
    <>
      <div className="head"><div><div className="eyebrow">Menu 10 · Perbandingan harga</div><h1>Bandingkan dengan project sebelumnya</h1></div>
        <ExportButton nama="Perbandingan_Harga" rows={(ref ? [ref, ...pembanding] : pembanding).map(r => ({ ...r, status: labelStatus(r.status), biaya_m2: biayaM2(r) }))}
          kolom={[{ key: 'kode', label: 'Kode' }, { key: 'customer', label: 'Customer' }, { key: 'industri', label: 'Industri' }, { key: 'kab_kota', label: 'Lokasi' },
            { key: 'status', label: 'Status' }, { key: 'jumlah_shift', label: 'Shift', type: 'number' }, { key: 'luas_m2', label: 'Luas (m²)', type: 'number' },
            { key: 'headcount', label: 'Headcount', type: 'number' }, { key: 'tarif_storage', label: 'Tarif storage', type: 'number' }, { key: 'uom_storage', label: 'UoM storage' },
            { key: 'tarif_handling_in', label: 'Tarif handling in', type: 'number' }, { key: 'tarif_handling_out', label: 'Tarif handling out', type: 'number' },
            { key: 'uom_handling', label: 'UoM handling' }, { key: 'biaya_m2', label: 'Biaya per m² per bulan', type: 'number' }, { key: 'gp_persen', label: 'GP', type: 'percent' }]} /></div>
      <div className="card">
        <div className="grid3">
          <label className="f" htmlFor="acuan">Tender acuan
            <select id="acuan" value={acuan} onChange={e => setAcuan(e.target.value)}><option value="">— tanpa acuan —</option>{rows.map(r => <option key={r.id} value={r.id}>{r.kode} · {r.customer}</option>)}</select></label>
          <label className="f" htmlFor="pi">Industri<select id="pi" value={f.industri} onChange={e => setF({ ...f, industri: e.target.value })}><option value="">Semua</option>{INDUSTRI.map(i => <option key={i}>{i}</option>)}</select></label>
          <label className="f" htmlFor="pp">Provinsi<select id="pp" value={f.provinsi} onChange={e => setF({ ...f, provinsi: e.target.value })}><option value="">Semua</option>{provinsi.map(p => <option key={p}>{p}</option>)}</select></label>
          <label className="f" htmlFor="pt">Tipe gudang<select id="pt" value={f.tipe} onChange={e => setF({ ...f, tipe: e.target.value })}><option value="">Semua</option>{tipe.map(p => <option key={p}>{p}</option>)}</select></label>
          <label className="f" htmlFor="ph">Hasil<select id="ph" value={f.hasil} onChange={e => setF({ ...f, hasil: e.target.value })}><option value="">Semua</option><option value="menang">Menang saja</option><option value="kalah">Kalah saja</option></select></label>
        </div>
        {ref && <p className="small muted">Hanya membandingkan tender dengan UoM storage “{ref.uom_storage}” dan handling “{ref.uom_handling}” yang sama. Tarif berbeda wajar bila lokasi (UMK), shift, atau skema berbeda.</p>}
      </div>

      <div className="kpis">
        <div className="kpi"><span className="small muted">Median tarif storage</span><b>{rp(med.storage)}</b>{ref && <Delta x={ref.tarif_storage} r={med.storage} />}</div>
        <div className="kpi"><span className="small muted">Median handling in</span><b>{rp(med.hi)}</b>{ref && <Delta x={ref.tarif_handling_in} r={med.hi} />}</div>
        <div className="kpi"><span className="small muted">Median handling out</span><b>{rp(med.ho)}</b>{ref && <Delta x={ref.tarif_handling_out} r={med.ho} />}</div>
        <div className="kpi"><span className="small muted">Median biaya per m²/bln</span><b>{rp(med.m2)}</b>{ref && <Delta x={biayaM2(ref)} r={med.m2} />}</div>
        <div className="kpi"><span className="small muted">Median GP</span><b>{persen(med.gp)}</b>{ref && <span className="small muted">acuan {persen(ref.gp_persen)}</span>}</div>
        <div className="kpi"><span className="small muted">Jumlah pembanding</span><b>{pembanding.length}</b></div>
      </div>

      <div className="tablewrap"><table>
        <thead><tr><th>Tender</th><th>Industri</th><th>Lokasi</th><th>Status</th><th className="num">Shift</th><th className="num">Luas</th><th className="num">HC</th>
          <th className="num">Storage</th><th className="num">Handling in</th><th className="num">Handling out</th><th className="num">Biaya/m²</th><th className="num">GP</th><th>Dibuat</th></tr></thead>
        <tbody>
          {ref && <Baris r={ref} acuan biayaM2={biayaM2} />}
          {pembanding.map(r => <Baris key={r.id} r={r} biayaM2={biayaM2} />)}
          {pembanding.length === 0 && <tr><td colSpan={13} className="muted">Tidak ada tender pembanding dengan filter ini.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

function Baris({ r, acuan, biayaM2 }: { r: Ov; acuan?: boolean; biayaM2: (r: Ov) => number | null }) {
  return (
    <tr style={acuan ? { background: 'var(--input)' } : undefined}>
      <td><Link href={`/tender/${r.id}`}>{r.kode}</Link>{acuan && <span className="pill info" style={{ marginLeft: 6 }}>acuan</span>}<div className="small muted">{r.customer}</div></td>
      <td className="small">{r.industri ?? '—'}</td><td className="small">{r.kab_kota}</td>
      <td><span className={`pill ${pillStatus(r.status)}`}>{labelStatus(r.status)}</span></td>
      <td className="num">{r.jumlah_shift}</td><td className="num">{angka(r.luas_m2)}</td><td className="num">{r.headcount ?? '—'}</td>
      <td className="num">{rp(r.tarif_storage)}<div className="small muted">/{r.uom_storage ?? '-'}</div></td>
      <td className="num">{rp(r.tarif_handling_in)}<div className="small muted">/{r.uom_handling ?? '-'}</div></td>
      <td className="num">{rp(r.tarif_handling_out)}</td><td className="num">{rp(biayaM2(r))}</td><td className="num">{persen(r.gp_persen)}</td>
      <td className="small">{tanggal(r.created_at)}</td>
    </tr>
  );
}
