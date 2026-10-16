'use client';
import { Fragment, useState } from 'react';
import type { ProjectHistoris } from '@/lib/tender';
import { rp, angka, persen, BUCKET_LABEL } from '@/lib/format';
import ExportButton from '@/components/ExportButton';

/** Data project berjalan dari cost model Excel lama: ringkasan P&L, rate card, biaya per kelompok + rincian item. */
export default function HistorisPanel({ h, nama }: { h: ProjectHistoris; nama: string }) {
  const [buka, setBuka] = useState<string | null>(null);
  const r = h.ringkasan;
  const total = h.biayaKelompok.reduce((s, k) => s + k.biayaBulan, 0);
  const semuaItem = h.biayaKelompok.flatMap(k => k.items.map(i => ({ ...i, kelompok: k.kelompok })));
  return (
    <>
      <div className="card">
        <h2>Data project berjalan (dari Excel)</h2>
        <p className="small muted">Sumber: {h.sumber.file} · sheet “{h.sumber.sheet}” · diimpor {h.sumber.diimpor}. Angka ini disalin dari file, tidak dihitung ulang oleh mesin hitung aplikasi.</p>
        <div className="kpis">
          <div className="kpi"><span className="small muted">Pendapatan / bulan</span><b>{rp(r.pendapatanBulan)}</b></div>
          <div className="kpi"><span className="small muted">Biaya / bulan (basis P&L file)</span><b>{rp(r.biayaBulan)}</b></div>
          <div className="kpi"><span className="small muted">GP</span><b>{persen(r.gpPersen)}</b><span className="small muted">{rp(r.pendapatanBulan - r.biayaBulan)}</span></div>
          <div className="kpi"><span className="small muted">Grand total CM (incl. overhead)</span><b>{rp(r.grandTotalCM)}</b><span className="small muted">GP {persen(r.gpGrandTotal)}</span></div>
          <div className="kpi"><span className="small muted">Headcount</span><b>{angka(r.headcount, 1)}</b></div>
          <div className="kpi"><span className="small muted">Luas · posisi palet</span><b>{r.luasM2 ? `${angka(r.luasM2)} m²` : '—'}</b><span className="small muted">{r.posisiPalet ? `${angka(r.posisiPalet)} PP` : 'PP —'}</span></div>
        </div>
        <p className="small"><b>Basis margin:</b> {r.basisMargin}</p>
        {h.catatan && <p className="notice small">{h.catatan}</p>}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2>Rate card</h2>
          <ExportButton nama={`RateCard_${nama}`} rows={h.rateCard.map(x => ({ ...x, bucket: BUCKET_LABEL[x.bucket] ?? x.bucket }))}
            kolom={[{ key: 'bucket', label: 'Bucket' }, { key: 'layanan', label: 'Layanan' }, { key: 'tarif', label: 'Tarif (Rp)', type: 'number' }, { key: 'uom', label: 'Per' }, { key: 'volumeMinimum', label: 'Volume minimum / bulan', type: 'number' }]} /></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Bucket</th><th>Layanan</th><th className="num">Tarif</th><th>Per</th><th className="num">Volume min/bln</th></tr></thead>
          <tbody>{h.rateCard.map((x, i) => (
            <tr key={i}><td className="small">{BUCKET_LABEL[x.bucket] ?? x.bucket}</td><td>{x.layanan}</td><td className="num">{rp(x.tarif)}</td><td className="small">{x.uom}</td><td className="num">{x.volumeMinimum ? angka(x.volumeMinimum) : '—'}</td></tr>))}</tbody>
        </table></div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2>Struktur biaya per bulan</h2>
          <ExportButton nama={`Biaya_${nama}`} rows={semuaItem}
            kolom={[{ key: 'kelompok', label: 'Kelompok' }, { key: 'deskripsi', label: 'Item' }, { key: 'qty', label: 'Qty', type: 'number' }, { key: 'uom', label: 'UoM' },
              { key: 'hargaSatuan', label: 'Harga satuan', type: 'number' }, { key: 'biayaBulan', label: 'Biaya / bulan', type: 'number' }, { key: 'catatan', label: 'Catatan' }]} /></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Kelompok</th><th className="num">Biaya / bulan</th><th className="num">Porsi</th><th></th></tr></thead>
          <tbody>
            {h.biayaKelompok.map(k => (
              <Fragment key={k.kelompok}>
                <tr><td><b>{k.kelompok}</b></td><td className="num">{rp(k.biayaBulan)}</td><td className="num">{persen(total ? k.biayaBulan / total : 0)}</td>
                  <td>{k.items.length > 0 && <button className="ghost" onClick={() => setBuka(buka === k.kelompok ? null : k.kelompok)}>{buka === k.kelompok ? 'Tutup' : `Rincian (${k.items.length})`}</button>}</td></tr>
                {buka === k.kelompok && k.items.map((i, n) => (
                  <tr key={n} style={{ background: 'var(--surface-2)' }}>
                    <td className="small" style={{ paddingLeft: 24 }}>{i.deskripsi}{i.catatan && <span className="muted"> · {i.catatan}</span>}</td>
                    <td className="num small">{rp(i.biayaBulan)}</td>
                    <td className="num small muted" colSpan={2}>{i.qty != null ? `${angka(i.qty, 2)} ${i.uom ?? ''}` : ''}{i.hargaSatuan != null ? ` × ${rp(i.hargaSatuan)}` : ''}</td>
                  </tr>))}
              </Fragment>))}
            <tr><td><b>Total</b></td><td className="num"><b>{rp(total)}</b></td><td></td><td></td></tr>
          </tbody>
        </table></div>
      </div>
    </>
  );
}
