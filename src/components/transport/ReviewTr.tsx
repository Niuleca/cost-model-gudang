'use client';
// Tab Result tender Transportation / Intermodal: catatan review (siap quotation atau belum) + tabel perbandingan margin
// (margin saat ini vs tier, mis. 15% / 10% / 5%) dengan harga jual per rute, pendapatan, GP & nilai kontrak.
import { useEffect, useState } from 'react';
import { rp } from '@/lib/format';
import { persen1, TIER_DEFAULT, type CatatanReview, type HasilTier } from '@/lib/transport';

const KELAS: Record<CatatanReview['level'], string> = { kritis: 'bad', perhatian: 'warn', info: 'info' };
const LABEL: Record<CatatanReview['level'], string> = { kritis: 'Kritis', perhatian: 'Perhatian', info: 'Info' };

export function KartuReview({ review }: { review: CatatanReview[] }) {
  const kritis = review.filter(c => c.level === 'kritis').length;
  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Review sebelum quotation</h2>
        {kritis ? <span className="pill bad">{kritis} kritis — selesaikan dulu</span> : <span className="pill ok">Siap dibuat quotation</span>}
      </div>
      {review.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Tidak ada catatan: semua rute punya harga beli, volume, dan margin wajar.</p>
        : <div className="tablewrap fit"><table className="tabel-fit">
          <thead><tr><th>Level</th><th>Rute</th><th>Catatan</th></tr></thead>
          <tbody>{review.map((c, i) => <tr key={i}><td><span className={`pill ${KELAS[c.level]}`}>{LABEL[c.level]}</span></td><td className="small">{c.rute ?? '—'}</td><td className="small">{c.pesan}</td></tr>)}</tbody>
        </table></div>}
    </div>);
}

/** Isian persen bebas (mis. 7,5); disimpan saat Enter / keluar kolom. */
function InputPersen({ nilai, set, label, lebar = 70 }: { nilai: number; set: (v: number) => void; label: string; lebar?: number }) {
  const ke = (v: number) => String(Math.round(v * 10000) / 100).replace('.', ',');
  const [t, setT] = useState(ke(nilai));
  useEffect(() => { setT(ke(nilai)); }, [nilai]);
  const simpan = () => { const v = Number(t.replace(',', '.')); if (t.trim() !== '' && isFinite(v) && v > -100 && v < 95) set(v / 100); else setT(ke(nilai)); };
  return <span className="row" style={{ gap: 2, flexWrap: 'nowrap', display: 'inline-flex' }}>
    <input aria-label={label} className="input-kecil" inputMode="decimal" style={{ width: lebar, textAlign: 'right' }} value={t} onChange={e => setT(e.target.value)}
      onBlur={simpan} onKeyDown={e => { if (e.key === 'Enter') { simpan(); (e.target as HTMLInputElement).blur(); } }} />%</span>;
}

/** Tabel perbandingan margin. `tiers` disimpan di tender; "Pakai" menerapkan tier ke semua rute (margin global, pengecualian rute dihapus). */
export function PerbandinganMargin({ hasil, tiers, onTiers, onPakai, kontrakBulan, marginGlobal, adaOverride, onMarginGlobal }: {
  hasil: HasilTier; tiers: number[]; onTiers: (t: number[]) => void; onPakai: (m: number) => void; kontrakBulan: number; marginGlobal: number; adaOverride: number;
  onMarginGlobal?: (m: number) => void;
}) {
  const ubahTier = (i: number, v: number) => onTiers(tiers.map((x, j) => (j === i ? v : x)));
  const [baru, setBaru] = useState('');
  const k = hasil.kolom.length;
  const terbaik = hasil.total.reduce((b, x, i) => (x.gp > hasil.total[b].gp ? i : b), 0);
  const tambah = () => { const v = Number(baru.replace(',', '.')) / 100; if (isFinite(v) && v > -1 && v < 0.95 && !tiers.includes(v)) onTiers([...tiers, v].slice(0, 8)); setBaru(''); };
  return (
    <div className="card" style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Perbandingan margin</h2>
        <span className="small muted row" style={{ gap: 6 }}>Saat ini: margin global {onMarginGlobal ? <InputPersen label="Margin global" nilai={marginGlobal} set={onMarginGlobal} /> : persen1(marginGlobal)}
          {adaOverride ? ` + ${adaOverride} rute khusus` : ''} · margin = GP% atas harga jual</span>
      </div>
      <div className="row small" style={{ gap: 6 }}>
        <span className="muted">Tier (isi bebas, mis. 7,5):</span>
        {tiers.map((m, i) => <span key={i} className="pill info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <InputPersen label={`Tier ${i + 1}`} nilai={m} set={v => ubahTier(i, v)} lebar={56} />
          <button className="link-kecil" aria-label={`Hapus tier ${persen1(m)}`} onClick={() => onTiers(tiers.filter((_, j) => j !== i))}>×</button></span>)}
        <input aria-label="Tier margin baru (%)" className="input-kecil" style={{ width: 80 }} inputMode="decimal" placeholder="mis. 8" value={baru}
          onChange={e => setBaru(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tambah(); }} />
        <button className="ghost" onClick={tambah} disabled={!baru}>+ Tier</button>
        {JSON.stringify(tiers) !== JSON.stringify(TIER_DEFAULT) && <button className="link-kecil" onClick={() => onTiers(TIER_DEFAULT)}>reset 15/10/5%</button>}
      </div>
      <div className="tablewrap fit"><table className="tabel-fit tabel-tier">
        <thead>
          <tr><th>Rute</th><th>Satuan</th><th className="num">Harga beli</th>
            {hasil.kolom.map((c, i) => <th key={i} className={`num${i === 0 ? ' tier-kini' : ''}`}>
              {c.margin != null ? <>Margin <InputPersen label={`Margin kolom ${i}`} nilai={c.margin} set={v => ubahTier(i - 1, v)} lebar={56} /></> : c.label}
              {c.margin != null && <div><button className="link-kecil" onClick={() => onPakai(c.margin!)}>pakai untuk semua rute</button></div>}</th>)}</tr>
        </thead>
        <tbody>
          {hasil.baris.length === 0 && <tr><td colSpan={3 + k} className="muted">Belum ada rute.</td></tr>}
          {hasil.baris.map(b => (
            <tr key={b.id}>
              <td>{b.nama}</td><td className="small">{b.satuan}</td><td className="num">{b.beli > 0 ? rp(b.beli) : <span style={{ color: 'var(--bad)' }}>belum ada</span>}</td>
              {b.jual.map((j, i) => <td key={i} className={`num${i === 0 ? ' tier-kini' : ''}`}><b>{b.beli > 0 ? rp(j) : '—'}</b>
                {b.volBulan > 0 && b.beli > 0 && <div className="dasar-def">GP {rp(b.gpBulan[i])}/bln</div>}</td>)}
            </tr>))}
        </tbody>
        <tfoot>
          <tr><td colSpan={3}>Pendapatan / bulan</td>{hasil.total.map((x, i) => <td key={i} className={`num${i === 0 ? ' tier-kini' : ''}`}>{rp(x.pendapatanBulan)}</td>)}</tr>
          <tr><td colSpan={3}>Biaya beli / bulan</td>{hasil.total.map((x, i) => <td key={i} className={`num${i === 0 ? ' tier-kini' : ''}`}>{rp(x.biayaBulan)}</td>)}</tr>
          <tr><td colSpan={3}><b>Gross profit / bulan</b></td>{hasil.total.map((x, i) => <td key={i} className={`num${i === 0 ? ' tier-kini' : ''}`}><b>{rp(x.gp)}</b>{i === terbaik && hasil.total.length > 1 ? <div className="dasar-def">tertinggi</div> : null}</td>)}</tr>
          <tr><td colSpan={3}>GP %</td>{hasil.total.map((x, i) => <td key={i} className={`num${i === 0 ? ' tier-kini' : ''}`}>{persen1(x.gpPersen)}</td>)}</tr>
          <tr><td colSpan={3}>Selisih pendapatan vs saat ini / bulan</td>{hasil.total.map((x, i) => <td key={i} className={`num${i === 0 ? ' tier-kini' : ''}`}>{i === 0 ? '—' : `${x.pendapatanBulan - hasil.total[0].pendapatanBulan >= 0 ? '+' : '−'}${rp(Math.abs(x.pendapatanBulan - hasil.total[0].pendapatanBulan))}`}</td>)}</tr>
          <tr><td colSpan={3}>Nilai kontrak ({kontrakBulan} bulan)</td>{hasil.total.map((x, i) => <td key={i} className={`num${i === 0 ? ' tier-kini' : ''}`}>{rp(x.pendapatanBulan * kontrakBulan)}</td>)}</tr>
        </tfoot>
      </table></div>
      <p className="small muted" style={{ margin: 0 }}>Harga jual = harga beli ÷ (1 − margin), jadi GP% sama persis dengan margin yang diisi. Kolom tier menerapkan margin yang sama ke semua rute; “pakai untuk semua rute” mengganti margin global dan menghapus margin khusus rute. Rute tanpa harga beli tidak ikut dihitung.</p>
    </div>);
}
