'use client';
import { useState } from 'react';
import type { HasilTender, Bucket } from '@/lib/engine/index.ts';
import { rp, angka, persen, BUCKET_LABEL } from '@/lib/format';

export interface Kurs { kode: string; rupiahPer: number; tanggal?: string }
const MATA_UANG: { kode: string; nama: string }[] = [
  { kode: 'USD', nama: 'Dolar AS' }, { kode: 'SGD', nama: 'Dolar Singapura' }, { kode: 'MYR', nama: 'Ringgit Malaysia' }, { kode: 'THB', nama: 'Baht Thailand' },
  { kode: 'VND', nama: 'Dong Vietnam' }, { kode: 'PHP', nama: 'Peso Filipina' }, { kode: 'KRW', nama: 'Won Korea' }, { kode: 'JPY', nama: 'Yen Jepang' },
  { kode: 'CNY', nama: 'Yuan Tiongkok' }, { kode: 'HKD', nama: 'Dolar Hong Kong' }, { kode: 'TWD', nama: 'Dolar Taiwan' }, { kode: 'INR', nama: 'Rupee India' },
  { kode: 'AUD', nama: 'Dolar Australia' }, { kode: 'EUR', nama: 'Euro' }, { kode: 'GBP', nama: 'Poundsterling' },
];
const fmtAsing = (v: number, kode: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: kode, maximumFractionDigits: ['JPY', 'KRW', 'VND'].includes(kode) ? 0 : 2 }).format(v);

/** Rate card dengan margin input user, total margin, simulasi bulanan/tahunan, konversi mata uang, porsi biaya per kategori. */
export default function HasilKomersial({ h, marginManual, onMargin, kurs, onKurs, kontrakBulan }: {
  h: HasilTender; marginManual: Partial<Record<Bucket, number | null>>; onMargin: (m: Partial<Record<Bucket, number | null>>) => void;
  kurs: Kurs | null | undefined; onKurs: (k: Kurs | null) => void; kontrakBulan: number;
}) {
  const [ambil, setAmbil] = useState<string | null>(null);
  const mt = h.marginTotal;
  const setM = (b: Bucket, v: string) => onMargin({ ...marginManual, [b]: v === '' ? null : Number(v) / 100 });

  async function kursTerkini(kode: string) {
    setAmbil('Mengambil kurs…');
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/IDR');
      const j = await r.json();
      const perIdr = Number(j?.rates?.[kode]);
      if (!perIdr) throw new Error('kurs tidak tersedia');
      onKurs({ kode, rupiahPer: Math.round((1 / perIdr) * 100) / 100, tanggal: (j.time_last_update_utc ?? '').slice(5, 16) });
      setAmbil(null);
    } catch (e) {
      setAmbil(`Gagal mengambil kurs (${e instanceof Error ? e.message : 'jaringan'}) — isi manual.`);
    }
  }
  const x = (idr: number) => kurs && kurs.rupiahPer > 0 ? idr / kurs.rupiahPer : 0;

  const kelompok = Object.entries(h.perKelompok ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const totK = kelompok.reduce((s, [, v]) => s + v, 0) || 1;

  return (<>
    <div className="card">
      <h2>Rate card & margin</h2>
      <p className="small muted">Margin = markup atas biaya per layanan, diisi sendiri. Kosongkan untuk memakai margin default per kategori risiko (master Finance). Tarif sudah termasuk gross-up PPh.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>Layanan</th><th>Satuan</th><th className="num">Volume komitmen</th><th className="num">Biaya/bln</th><th className="num">Biaya/unit</th><th className="num">Margin (input)</th><th className="num">Harga/bln</th><th className="num">Tarif/unit</th></tr></thead>
        <tbody>
          {h.rateCard.map(r => {
            const b = r.bucket as Bucket, v = marginManual[b];
            return <tr key={r.bucket}><td>{BUCKET_LABEL[r.bucket]}</td><td>{r.bucket === 'storage' ? `${r.uom}/bulan` : r.uom}</td><td className="num">{angka(r.volumeKomitmen)}</td>
              <td className="num">{rp(r.biayaBulan)}</td><td className="num">{rp(r.biayaPerUnit)}</td>
              <td className="num"><input aria-label={`Margin ${BUCKET_LABEL[r.bucket]}`} type="number" step="0.1" value={v == null ? '' : Math.round(v * 1000) / 10}
                placeholder={(Math.round((r.marginDefault ?? r.marginEfektif) * 1000) / 10).toString()} onChange={e => setM(b, e.target.value)} style={{ width: 80, minWidth: 80, textAlign: 'right' }} /> %
                {v == null && <div className="small muted">default</div>}</td>
              <td className="num">{rp(r.hargaBulan)}</td><td className="num out">{rp(r.tarifPerUnit)}</td></tr>;
          })}
          {mt && <tr className="pd-sub"><td colSpan={3}><b>Total (gabungan semua layanan)</b></td><td className="num"><b>{rp(mt.biayaBulan)}</b></td><td></td>
            <td className="num"><b>{persen(mt.margin)}</b></td><td className="num"><b>{rp(mt.hargaBulan)}</b></td><td></td></tr>}
        </tbody>
      </table></div>
      {mt && <p className="small">Total margin {persen(mt.margin)} = (Σ harga sebelum PPh {rp(mt.hargaSebelumPph)} ÷ Σ biaya {rp(mt.biayaBulan)}) − 1, tertimbang biaya tiap layanan.</p>}
      {h.storageAlternatif.length > 0 && <p className="small">Storage alternatif: {h.storageAlternatif.map(s => `${rp(s.tarif)}/${s.uom}`).join(' · ')}</p>}

      <h3>Simulasi</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>Skenario</th><th className="num">Pendapatan/bln</th><th className="num">Biaya/bln</th><th className="num">GP/bln</th><th className="num">GP%</th>
          <th className="num">Pendapatan/thn</th><th className="num">Biaya/thn</th><th className="num">GP/thn</th><th className="num">GP selama kontrak ({kontrakBulan} bln)</th></tr></thead>
        <tbody>{h.simulasi.map(s => <tr key={s.skenario}><td>{s.skenario}</td><td className="num">{rp(s.pendapatanBulan)}</td><td className="num">{rp(s.biayaBulan)}</td>
          <td className="num">{rp(s.gp)}</td><td className="num"><b>{persen(s.gpPersen)}</b></td>
          <td className="num">{rp(s.pendapatanBulan * 12)}</td><td className="num">{rp(s.biayaBulan * 12)}</td><td className="num">{rp(s.gp * 12)}</td><td className="num">{rp(s.gp * kontrakBulan)}</td></tr>)}</tbody>
      </table></div>
      <p className="small muted">Pendapatan = bersih setelah PPh. Per tahun = per bulan × 12.</p>
    </div>

    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <h2>Konversi mata uang</h2>
        <div className="row" style={{ alignItems: 'end' }}>
          <label className="f" htmlFor="kurs-kode">Mata uang
            <select id="kurs-kode" value={kurs?.kode ?? ''} onChange={e => { const k = e.target.value; if (!k) { onKurs(null); return; } onKurs({ kode: k, rupiahPer: kurs?.kode === k ? kurs.rupiahPer : 0 }); kursTerkini(k); }}>
              <option value="">— pilih —</option>{MATA_UANG.map(m => <option key={m.kode} value={m.kode}>{m.kode} · {m.nama}</option>)}
            </select></label>
          {kurs && <label className="f" htmlFor="kurs-nilai">Kurs: 1 {kurs.kode} = Rp
            <input id="kurs-nilai" type="number" step="any" value={kurs.rupiahPer || ''} onChange={e => onKurs({ ...kurs, rupiahPer: Number(e.target.value), tanggal: 'manual' })} style={{ width: 130 }} /></label>}
          {kurs && <button className="ghost" onClick={() => kursTerkini(kurs.kode)}>Kurs terkini</button>}
        </div>
      </div>
      {ambil && <p className="small" role="status">{ambil}</p>}
      {kurs?.tanggal && <p className="small muted">Kurs {kurs.tanggal === 'manual' ? 'diisi manual' : `dari open.er-api.com (${kurs.tanggal})`} — cek kembali sebelum dikirim ke customer.</p>}
      {!kurs && <p className="small muted">Pilih mata uang untuk menampilkan rate card dan simulasi dalam IDR dan mata uang tersebut.</p>}
      {kurs && kurs.rupiahPer > 0 && <div className="grid2">
        <div className="tablewrap"><table>
          <thead><tr><th>Tarif</th><th className="num">IDR</th><th className="num">{kurs.kode}</th></tr></thead>
          <tbody>{h.rateCard.map(r => <tr key={r.bucket}><td>{BUCKET_LABEL[r.bucket]} / {r.uom}</td><td className="num">{rp(r.tarifPerUnit)}</td><td className="num"><b>{fmtAsing(x(r.tarifPerUnit), kurs.kode)}</b></td></tr>)}
            {h.storageAlternatif.filter(s => s.uom !== 'palet posisi').map(s => <tr key={s.uom}><td>Storage / {s.uom}</td><td className="num">{rp(s.tarif)}</td><td className="num">{fmtAsing(x(s.tarif), kurs.kode)}</td></tr>)}</tbody>
        </table></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Volume komitmen</th><th className="num">IDR</th><th className="num">{kurs.kode}</th></tr></thead>
          <tbody>{(() => { const s = h.simulasi[0]; return s ? ([['Pendapatan/bln', s.pendapatanBulan], ['Biaya/bln', s.biayaBulan], ['GP/bln', s.gp], ['Pendapatan/thn', s.pendapatanBulan * 12], ['Biaya/thn', s.biayaBulan * 12], ['GP/thn', s.gp * 12], ['Investasi', h.investasi]] as const)
            .map(([l, v]) => <tr key={l}><td>{l}</td><td className="num">{rp(v)}</td><td className="num"><b>{fmtAsing(x(v), kurs.kode)}</b></td></tr>) : null; })()}</tbody>
        </table></div>
      </div>}
    </div>

    <div className="card">
      <h2>Porsi biaya per kategori</h2>
      <div className="tablewrap"><table>
        <thead><tr><th>Kategori</th><th className="num">Biaya/bln</th><th className="num">Biaya/thn</th><th className="num">%</th><th style={{ width: '35%' }}></th></tr></thead>
        <tbody>
          {kelompok.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{rp(v)}</td><td className="num">{rp(v * 12)}</td><td className="num"><b>{persen(v / totK)}</b></td>
            <td><div className="bar-kat"><i style={{ width: `${(v / kelompok[0][1]) * 100}%` }} /></div></td></tr>)}
          <tr className="pd-sub"><td><b>Total</b></td><td className="num"><b>{rp(totK)}</b></td><td className="num"><b>{rp(totK * 12)}</b></td><td className="num"><b>100%</b></td><td></td></tr>
        </tbody>
      </table></div>
    </div>
  </>);
}
