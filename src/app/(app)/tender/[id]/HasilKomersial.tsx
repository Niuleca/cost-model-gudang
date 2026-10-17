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
export interface Pajak { pph: 'include' | 'exclude'; ppn: 'include' | 'exclude'; ppnPersen: number }
export default function HasilKomersial({ h, marginManual, onMargin, kurs, onKurs, kontrakBulan, pajak, onPajak }: {
  h: HasilTender; marginManual: Partial<Record<Bucket, number | null>>; onMargin: (m: Partial<Record<Bucket, number | null>>) => void;
  kurs: Kurs | null | undefined; onKurs: (k: Kurs | null) => void; kontrakBulan: number;
  pajak: Pajak; onPajak: (p: Pajak) => void;
}) {
  const pphPersen = h.pajak?.pphPersen ?? 0.02;
  const tq = (r: HasilTender['rateCard'][number]) => pajak.ppn === 'include' ? (r.tarifInclPpn ?? r.tarifPerUnit) : r.tarifPerUnit;
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
      <div className="pajak-bar">
        <label className="f" htmlFor="pj-pph">PPh 23 ({(pphPersen * 100).toFixed(1)}%)
          <select id="pj-pph" value={pajak.pph} onChange={e => onPajak({ ...pajak, pph: e.target.value as Pajak['pph'] })}>
            <option value="exclude">Exclude PPh — ditanggung customer (tarif di-gross-up, pendapatan bersih tetap)</option>
            <option value="include">Include PPh — ditanggung kita (tarif tidak dinaikkan, PPh mengurangi pendapatan)</option>
          </select></label>
        <label className="f" htmlFor="pj-ppn">PPN / VAT
          <select id="pj-ppn" value={pajak.ppn} onChange={e => onPajak({ ...pajak, ppn: e.target.value as Pajak['ppn'] })}>
            <option value="exclude">Exclude PPN — tarif belum termasuk PPN (PPN ditambah di invoice)</option>
            <option value="include">Include PPN — tarif yang ditulis sudah termasuk PPN</option>
          </select></label>
        <label className="f" htmlFor="pj-ppnp">Tarif PPN efektif
          <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><input id="pj-ppnp" type="number" step="0.1" value={Math.round(pajak.ppnPersen * 1000) / 10}
            onChange={e => onPajak({ ...pajak, ppnPersen: Number(e.target.value) / 100 })} style={{ width: 80 }} />%</span></label>
      </div>
      {(() => { const p = pphPersen, n = 100000, gu = pajak.pph === 'exclude' ? n / (1 - p) : n; const pot = gu * p, ppnV = gu * pajak.ppnPersen;
        return <p className="small pajak-contoh"><b>Contoh harga Rp100.000:</b> tarif {pajak.pph === 'exclude' ? `di-gross-up jadi ${rp(gu)}` : `tetap ${rp(gu)}`} → customer memotong PPh 23 {rp(pot)} → <b>diterima {rp(gu - pot)}</b>{pajak.pph === 'exclude' ? ' (utuh)' : ` (kurang ${rp(pot)})`}.
          {' '}PPN {rp(ppnV)} {pajak.ppn === 'include' ? 'sudah di dalam tarif yang ditulis' : 'ditambahkan di invoice'} lalu disetor ke negara — tidak memengaruhi GP.</p>; })()}
      <p className="small muted">Margin = <b>GP% atas pendapatan</b> per layanan, diisi sendiri: harga = biaya ÷ (1 − GP%). Kosong = default per kategori risiko. PPN bukan pendapatan: GP dihitung dari tarif sebelum PPN, dikurangi PPh 23 yang dipotong customer.
        {' '}Default PPN efektif 11% (PPN 12% × DPP 11/12) — sesuaikan bila berbeda.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>Layanan</th><th>Satuan</th><th className="num">Volume komitmen</th><th className="num">Biaya/bln</th><th className="num">Biaya/unit</th><th className="num">GP% (input)</th><th className="num">Harga/bln</th><th className="num">Tarif excl. PPN</th><th className="num">PPN</th><th className="num">Tarif incl. PPN</th></tr></thead>
        <tbody>
          {h.rateCard.map(r => {
            const b = r.bucket as Bucket, v = marginManual[b];
            return <tr key={r.bucket}><td>{BUCKET_LABEL[r.bucket]}</td><td>{r.bucket === 'storage' ? `${r.uom}/bulan` : r.uom}</td><td className="num">{angka(r.volumeKomitmen)}</td>
              <td className="num">{rp(r.biayaBulan)}</td><td className="num">{rp(r.biayaPerUnit)}</td>
              <td className="num"><input aria-label={`Margin ${BUCKET_LABEL[r.bucket]}`} type="number" step="0.1" value={v == null ? '' : Math.round(v * 1000) / 10}
                placeholder={(Math.round((r.gpDefault ?? 0) * 1000) / 10).toString()} onChange={e => setM(b, e.target.value)} style={{ width: 80, minWidth: 80, textAlign: 'right' }} /> %
                {v == null && <div className="small muted">default</div>}</td>
              <td className="num">{rp(r.hargaBulan)}</td>
              <td className={`num${pajak.ppn === 'exclude' ? ' out' : ''}`}>{rp(r.tarifPerUnit)}</td>
              <td className="num">{rp(r.ppnPerUnit ?? 0)}</td>
              <td className={`num${pajak.ppn === 'include' ? ' out' : ''}`}>{rp(r.tarifInclPpn ?? r.tarifPerUnit)}</td></tr>;
          })}
          {mt && <tr className="pd-sub"><td colSpan={3}><b>Total (gabungan semua layanan)</b></td><td className="num"><b>{rp(mt.biayaBulan)}</b></td><td></td>
            <td className="num"><b>{persen(mt.gpPersen ?? 0)}</b></td><td className="num"><b>{rp(mt.hargaBulan)}</b></td><td colSpan={3} className="small muted">kolom tebal = tarif yang dipakai di quotation ({pajak.ppn === 'include' ? 'incl.' : 'excl.'} PPN)</td></tr>}
        </tbody>
      </table></div>
      {mt && <p className="small">Total GP {persen(mt.gpPersen ?? 0)} = 1 − Σ biaya {rp(mt.biayaBulan)} ÷ Σ harga sebelum PPh {rp(mt.hargaSebelumPph)} (tertimbang). Setara markup {persen(mt.margin)} atas biaya.
        {' '}{pajak.pph === 'exclude' ? 'PPh exclude (ditanggung customer): tarif di-gross-up, jadi GP di simulasi ≈ GP input (sedikit lebih tinggi karena tarif dibulatkan ke atas).' : <b>PPh include (ditanggung kita): potongan PPh {(pphPersen * 100).toFixed(1)}% mengurangi pendapatan, jadi GP di simulasi lebih rendah dari GP input. Pilih PPh Exclude agar GP = input.</b>}</p>}
      {mt && h.simulasi[0] && h.simulasi[0].biayaBulan - mt.biayaBulan > 1000 && <p className="small notice">Ada biaya {rp(h.simulasi[0].biayaBulan - mt.biayaBulan)}/bln yang tidak masuk tarif mana pun (mis. biaya VAS tanpa volume) — GP% jadi lebih rendah dari margin.</p>}
      {h.storageAlternatif.length > 0 && <p className="small">Storage alternatif: {h.storageAlternatif.map(s => `${rp(s.tarif)}/${s.uom}`).join(' · ')}</p>}

      <h3>Simulasi</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>Skenario</th><th className="num">Pendapatan/bln</th><th className="num">Biaya/bln</th><th className="num">GP/bln</th><th className="num">GP%</th><th className="num">PPN/bln</th><th className="num">Invoice incl. PPN/bln</th>
          <th className="num">Pendapatan/thn</th><th className="num">Biaya/thn</th><th className="num">GP/thn</th><th className="num">GP selama kontrak ({kontrakBulan} bln)</th></tr></thead>
        <tbody>{h.simulasi.map(s => <tr key={s.skenario}><td>{s.skenario}</td><td className="num">{rp(s.pendapatanBulan)}</td><td className="num">{rp(s.biayaBulan)}</td>
          <td className="num">{rp(s.gp)}</td><td className="num"><b>{persen(s.gpPersen)}</b></td><td className="num">{rp(s.ppnBulan ?? 0)}</td><td className="num">{rp(s.invoiceInclPpn ?? 0)}</td>
          <td className="num">{rp(s.pendapatanBulan * 12)}</td><td className="num">{rp(s.biayaBulan * 12)}</td><td className="num">{rp(s.gp * 12)}</td><td className="num">{rp(s.gp * kontrakBulan)}</td></tr>)}</tbody>
      </table></div>
      <p className="small muted">Pendapatan = tarif sebelum PPN × volume, dikurangi PPh 23 {(pphPersen * 100).toFixed(1)}% (PPh {pajak.pph === 'exclude' ? 'ditanggung customer, sudah di-gross-up di tarif' : 'ditanggung kita → GP turun'}). Per tahun = per bulan × 12.</p>
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
          <thead><tr><th>Tarif ({pajak.ppn === 'include' ? 'incl.' : 'excl.'} PPN)</th><th className="num">IDR</th><th className="num">{kurs.kode}</th></tr></thead>
          <tbody>{h.rateCard.map(r => <tr key={r.bucket}><td>{BUCKET_LABEL[r.bucket]} / {r.uom}</td><td className="num">{rp(tq(r))}</td><td className="num"><b>{fmtAsing(x(tq(r)), kurs.kode)}</b></td></tr>)}
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
