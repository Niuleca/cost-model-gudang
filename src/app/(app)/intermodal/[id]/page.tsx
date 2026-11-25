'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import StatusControl from '@/components/StatusControl';
import { DatalistLokasi, InfoTenderTr, KartuRingkas, PersenInput, useRates, useTenderTr, type TenderTr } from '@/components/transport/shared';
import { KartuReview, PerbandinganMargin } from '@/components/transport/ReviewTr';
import SelectBasis from '@/components/transport/SelectBasis';
import QuotationPanel from '@/app/(app)/tender/[id]/QuotationPanel';
import { useTabUrl } from '@/lib/useTabUrl';
import { useProfile } from '@/lib/useProfile';
import {
  FIELD_MUATAN, INTERMODAL_DEFAULT, MODA, qtyStage, qtyJualRute, NAMA_STAGE, TIER_DEFAULT, armadaModa, cocokRate, estimasiHarga, hasilOverview, hitungIntermodal, labelBasis,
  rateCardIntermodal, reviewIntermodal, ringkasIntermodal, ruteIntermodalBaru, tierIntermodal, type Basis, type Moda, type RateTransport, type RuteIntermodal, type StageIntermodal, type TenderIntermodal,
} from '@/lib/transport';
import { jarakKm } from '@/lib/lokasiIndonesia';
import { rp } from '@/lib/format';
import { labelStatus, pillStatus } from '@/lib/status';
import InputDesimal from '@/components/InputDesimal';

const Rute3D = dynamic(() => import('@/components/transport/Rute3D'), { ssr: false, loading: () => <div className="rute3d-wadah sim3d-muat">Menyiapkan peta 3D…</div> });

const TABS = ['Input rute', 'Result & margin', 'Quotation', 'Simulasi 3D'] as const;
const ambilIm = (t: TenderTr): TenderIntermodal => ({ ...INTERMODAL_DEFAULT, ...((t.asumsi?.intermodal as TenderIntermodal | undefined) ?? {}) });
/** Basis default saat moda diganti (semua satuan tetap bisa dipilih di setiap stage). */
const BASIS_AWAL: Record<Moda, Basis> = { darat: 'trip', laut: 'container', udara: 'kg', kereta: 'container' };
const fmtQ = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Satu stage: moda, armada, basis, qty per shipment, vendor & harga dari market price. Di level modul supaya input tidak kehilangan fokus. */
function BarisStage({ s, idx, rates, q, onUbah }: { s: StageIntermodal; idx: number; rates: RateTransport[]; q: { qty: number; auto: boolean }; onUbah: (p: Partial<StageIntermodal>) => void }) {
  const pilihan = s.dari && s.ke ? cocokRate(rates, { moda: s.moda, origin: s.dari, destination: s.ke, armada: s.armada, basis: s.basis }) : [];
  const km = jarakKm(s.dari, s.ke, s.moda);
  const est = s.moda === 'darat' && s.dari && s.ke ? estimasiHarga(s.armada, s.dari, s.ke, s.basis) : null;
  return (
    <tr className={!(s.harga > 0) ? 'baris-merah' : undefined}>
      <td><b className="small">{NAMA_STAGE[idx]}</b>
        <select aria-label="Moda" className="input-kecil" value={s.moda} onChange={e => { const m = e.target.value as Moda; onUbah({ moda: m, armada: armadaModa(m)[0]?.nama ?? '', basis: BASIS_AWAL[m], rateId: null }); }}>
          {MODA.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}</select></td>
      <td>
        <input aria-label="Dari" list={`dl-im-${s.moda}`} value={s.dari} placeholder="Dari" onChange={e => onUbah({ dari: e.target.value, rateId: null })} />
        <input aria-label="Ke" list={`dl-im-${s.moda}`} className="input-kecil" value={s.ke} placeholder="Ke" onChange={e => onUbah({ ke: e.target.value, rateId: null })} />
        {km ? <div className="dasar-def">±{km.toLocaleString('en-US')} km</div> : null}
      </td>
      <td>
        <select aria-label="Armada" value={s.armada} onChange={e => onUbah({ armada: e.target.value, rateId: null })}>{armadaModa(s.moda).map(a => <option key={a.nama}>{a.nama}</option>)}</select>
        <SelectBasis className="input-kecil" value={s.basis} onChange={b => onUbah({ basis: b, rateId: null })} />
      </td>
      <td className="num"><InputDesimal aria-label="Qty per shipment" min={0} step="any" value={q.auto ? q.qty : (s.qty || '')} className={q.auto ? 'input-auto' : undefined}
        title={q.auto ? 'Otomatis dari profil muatan — ketik untuk isi manual' : undefined} onChange={e => onUbah({ qty: Number(e.target.value) || 0, qtyAuto: false })} />
        <div className="dasar-def">{labelBasis(s.basis).replace('per ', '')}/shipment
          {q.auto ? <span className="chip-auto" title={s.moda === 'udara' && s.basis === 'kg' ? 'chargeable weight = maks. berat aktual vs CBM × 166.67' : s.moda === 'laut' && s.basis === 'ton' && /lcl/i.test(s.armada) ? 'W/M LCL = maks. ton vs CBM' : 'dari profil muatan'}> auto</span>
            : <> · <button className="link-kecil" title="hitung dari profil muatan rute" onClick={() => onUbah({ qtyAuto: true })}>auto</button></>}</div></td>
      <td>
        {pilihan.length > 0 && <select aria-label="Pilih dari market price" value={s.rateId ?? ''} onChange={e => {
          const x = pilihan.find(p => p.id === Number(e.target.value));
          if (x) onUbah({ rateId: x.id, vendor: x.vendor, harga: x.harga, leadTimeHari: x.lead_time_hari, sumberHarga: 'market' });
        }}><option value="">Market price: {pilihan.length} vendor…</option>{pilihan.map(p => <option key={p.id} value={p.id}>{p.vendor || '(tanpa nama)'} · {rp(p.harga)}</option>)}</select>}
        <input aria-label="Vendor" className={pilihan.length ? 'input-kecil' : undefined} value={s.vendor} placeholder="Vendor" onChange={e => onUbah({ vendor: e.target.value, rateId: null, sumberHarga: 'manual' })} />
        <div className="dasar-def">{s.sumberHarga === 'market' ? 'dari Market Price' : s.sumberHarga === 'estimasi' ? 'estimasi tarif per km' : pilihan.length ? '' : 'belum ada di Market Price'}
          {est && s.sumberHarga !== 'market' && <> · <button className="link-kecil" title={est.ket} onClick={() => onUbah({ harga: est.harga, sumberHarga: 'estimasi', rateId: null })}>estimasi {rp(est.harga)}</button></>}</div>
      </td>
      <td className="num"><InputDesimal aria-label="Harga beli" min={0} value={s.harga || ''} placeholder={labelBasis(s.basis)} onChange={e => onUbah({ harga: Number(e.target.value) || 0, rateId: null, sumberHarga: 'manual' })} /></td>
      <td className="num"><InputDesimal aria-label="Lead time" min={0} step="any" value={s.leadTimeHari ?? ''} placeholder="hari" onChange={e => onUbah({ leadTimeHari: e.target.value === '' ? null : Number(e.target.value) })} /></td>
      <td className="num"><b>{rp((s.harga || 0) * q.qty)}</b><div className="dasar-def">{rp(s.harga || 0)} × {fmtQ(q.qty)}</div></td>
    </tr>);
}

/** Tender Intermodal: per rute 3 stage (pickup → main leg laut/udara/kereta → delivery), vendor berbeda per stage, harga digabung + margin. */
export default function IntermodalTender() {
  const { id } = useParams<{ id: string }>();
  const hitungHasil = useCallback((t: TenderTr) => { const im = ambilIm(t); return hasilOverview(ringkasIntermodal(im), { jenis: 'intermodal', rute: im.rute.length }); }, []);
  const { t, ubah, kotor, pesan, err, simpanSekarang, setT } = useTenderTr(id, hitungHasil);
  const { rates, err: errRate } = useRates();
  const [sim, setSim] = useState('semua');
  const [tab, setTab] = useTabUrl(TABS, 'Input rute');
  const { profile } = useProfile();
  if (!t) return <p className="muted">{err ?? 'Memuat tender…'}</p>;
  const im = ambilIm(t);
  const setIm = (p: Partial<TenderIntermodal>) => ubah({ asumsi: { ...t.asumsi, intermodal: { ...im, ...p } } });
  const setRute = (i: number, p: Partial<RuteIntermodal>) => setIm({ rute: im.rute.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const setStage = (i: number, k: number, p: Partial<StageIntermodal>) => {
    const r = im.rute[i];
    const stage = r.stage.map((s, j) => (j === k ? { ...s, ...p } : s)) as RuteIntermodal['stage'];
    // titik sambung: ke stage 1 = dari stage 2, ke stage 2 = dari stage 3
    if (p.ke != null && k < 2) stage[k + 1] = { ...stage[k + 1], dari: p.ke };
    if (p.dari != null && k > 0) stage[k - 1] = { ...stage[k - 1], ke: p.dari };
    setRute(i, { stage, ...(k === 0 && p.dari != null ? { origin: p.dari } : {}), ...(k === 2 && p.ke != null ? { destination: p.ke } : {}) });
  };
  const setUjung = (i: number, p: { origin?: string; destination?: string }) => {
    const r = im.rute[i];
    const stage = [...r.stage] as RuteIntermodal['stage'];
    if (p.origin != null) stage[0] = { ...stage[0], dari: p.origin };
    if (p.destination != null) stage[2] = { ...stage[2], ke: p.destination };
    setRute(i, { ...p, stage });
  };
  const ringkas = ringkasIntermodal(im);
  const override = im.rute.filter(r => r.marginPersen != null).length;
  const tiers = im.tierMargin ?? TIER_DEFAULT;
  const review = reviewIntermodal(im, rates);

  return (
    <>
      <div className="head">
        <div><div className="eyebrow"><Link href="/intermodal">Intermodal Tender</Link> · {t.kode}</div><h1>{t.customer}</h1></div>
        <div className="row small">
          <span className={`pill ${pillStatus(t.status)}`}>{labelStatus(t.status)}</span>
          <span className="muted">{kotor ? 'Menyimpan otomatis…' : pesan ?? 'Tersimpan'}</span>
          <button className="ghost" onClick={() => simpanSekarang()}>Simpan</button>
          <button className="ghost" title="Excel dengan rumus lengkap: rute, perbandingan margin, review — angka sama dengan sistem"
            onClick={() => import('@/lib/exportTransport').then(m => m.unduhExcelTr('intermodal', t, im, rates)).catch(e => alert(`Export gagal: ${e instanceof Error ? e.message : e}`))}>⬇ Export Excel</button>
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="card"><StatusControl tender={{ id: t.id, status: t.status, alasan_hasil: t.alasan_hasil, tanggal_go_live: t.tanggal_go_live }} onBerubah={st => setT(x => x && ({ ...x, status: st }))} /></div>
      <InfoTenderTr t={t} ubah={ubah} marginGlobal={im.marginGlobal} onMargin={v => setIm({ marginGlobal: v })} adaOverride={override}
        onMarginSemua={() => setIm({ rute: im.rute.map(r => ({ ...r, marginPersen: null })) })} />
      <KartuRingkas r={ringkas} kontrakBulan={t.durasi_kontrak_bulan} />
      {errRate && <p className="error small">Market Price belum bisa dibaca: {errRate}</p>}
      <div className="tabs" role="tablist">{TABS.map(x => <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>{x}
        {x === 'Result & margin' && review.some(c => c.level === 'kritis') ? ' ⚠' : ''}</button>)}</div>

      {tab === 'Input rute' && <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small muted">{rates.length} harga di Market Price · harga beli per shipment = Σ (harga stage × qty) + biaya lain; harga jual = beli ÷ (1 − margin) → GP% = margin.</span>
        <div className="row"><Link className="btn ghost" href="/market-price" target="_blank">Buka Market Price</Link>
          <button onClick={() => setIm({ rute: [...im.rute, ruteIntermodalBaru({ origin: t.kab_kota ?? '', stage: ruteIntermodalBaru().stage.map((s, k) => (k === 0 ? { ...s, dari: t.kab_kota ?? '' } : s)) as RuteIntermodal['stage'] })] })}>+ Tambah rute</button></div>
      </div>
      {im.rute.length === 0 && <div className="card muted">Belum ada rute. Klik “+ Tambah rute”.</div>}
      {im.rute.map((r, i) => {
        const h = hitungIntermodal(r, im.marginGlobal);
        const qj = qtyJualRute(r);
        return (
          <div key={r.id} className="card" style={{ display: 'grid', gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Rute {i + 1}: {r.origin || '…'} → {r.destination || '…'}</h3>
              <div className="row small">
                <span className="pill info">lead time ±{h.leadTimeHari.toLocaleString('en-US')} hari</span>
                <button className="ghost" onClick={() => setIm({ rute: [...im.rute.slice(0, i + 1), { ...r, id: Math.random().toString(36).slice(2, 10) }, ...im.rute.slice(i + 1)] })}>Duplikat</button>
                <button className="danger" onClick={() => setIm({ rute: im.rute.filter((_, j) => j !== i) })}>Hapus rute</button>
              </div>
            </div>
            <div className="grid-isi">
              <label className="f">Origin<input list="dl-im-darat" value={r.origin} onChange={e => setUjung(i, { origin: e.target.value })} /></label>
              <label className="f">Destination<input list="dl-im-darat" value={r.destination} onChange={e => setUjung(i, { destination: e.target.value })} /></label>
              <label className="f">Shipment / bulan<InputDesimal min={0} step="any" value={r.shipmentBulan || ''} onChange={e => setRute(i, { shipmentBulan: Number(e.target.value) || 0 })} /></label>
              <label className="f">Harga jual dinyatakan
                <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <SelectBasis label="Satuan jual" value={r.satuanJual} onChange={b => setRute(i, { satuanJual: b })} />
                  <InputDesimal aria-label="Qty jual per shipment" min={0} step="any" value={qj.auto ? qj.qty : (r.qtyJual || '')} className={qj.auto ? 'input-auto' : undefined}
                    title={qj.auto ? 'Otomatis dari profil muatan — ketik untuk isi manual' : 'jumlah satuan jual per shipment'} onChange={e => setRute(i, { qtyJual: Number(e.target.value) || 1, qtyJualAuto: false })} style={{ width: 80 }} />
                </span>
                <span className="dasar-def">{qj.auto ? <span className="chip-auto">auto dari muatan</span> : <button className="link-kecil" onClick={() => setRute(i, { qtyJualAuto: true })}>hitung otomatis dari muatan</button>}</span></label>
              <label className="f">Biaya lain / shipment (Rp)<InputDesimal min={0} value={r.biayaLain || ''} placeholder="THC, dokumen, handling" onChange={e => setRute(i, { biayaLain: Number(e.target.value) || 0 })} /></label>
              <label className="f">Margin rute (%)<PersenInput label="Margin rute" nilai={r.marginPersen} placeholder={`${Math.round(im.marginGlobal * 1000) / 10} (global)`} onChange={v => setRute(i, { marginPersen: v })} /></label>
            </div>
            <div className="tablewrap fit"><table className="tabel-fit tabel-im">
              <thead><tr><th>Stage · moda</th><th>Dari → ke</th><th>Armada · basis</th><th className="num">Qty</th><th>Vendor</th><th className="num">Harga beli</th><th className="num">Lead time</th><th className="num">Biaya / shipment</th></tr></thead>
              <tbody>{r.stage.map((s, k) => <BarisStage key={k} s={s} idx={k} rates={rates} q={qtyStage(s, r)} onUbah={p => setStage(i, k, p)} />)}</tbody>
            </table></div>
            <div className="tablewrap fit"><table className="tabel-fit">
              <tbody>
                <tr><td>Harga beli gabungan per shipment <span className="small muted">({h.perStage.map(x => rp(x)).join(' + ')}{r.biayaLain ? ` + lain ${rp(r.biayaLain)}` : ''})</span></td><td className="num"><b>{rp(h.beliShipment)}</b></td></tr>
                <tr><td>Harga jual per shipment · margin {(h.margin * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%{r.marginPersen == null ? ' (global)' : ''}</td><td className="num"><b>{rp(h.jualShipment)}</b></td></tr>
                <tr><td>Harga jual {labelBasis(r.satuanJual)} <span className="small muted">(÷ {fmtQ(h.qtyJual)})</span></td><td className="num"><b>{rp(h.jualPerSatuan)}</b> <span className="small muted">beli {rp(h.beliPerSatuan)}</span></td></tr>
                <tr className="pd-sub"><td>Per bulan ({r.shipmentBulan || 0} shipment): biaya {rp(h.biayaBulan)} · GP {(h.gpPersen * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%</td><td className="num"><b>{rp(h.pendapatanBulan)}</b></td></tr>
              </tbody>
            </table></div>

          </div>);
      })}
      </>}

      {tab === 'Result & margin' && <>
        <KartuReview review={review} />
        <PerbandinganMargin hasil={tierIntermodal(im, tiers)} tiers={tiers} onTiers={x => setIm({ tierMargin: x })} kontrakBulan={t.durasi_kontrak_bulan}
          marginGlobal={im.marginGlobal} adaOverride={override} onMarginGlobal={m => setIm({ marginGlobal: m })} onPakai={m => setIm({ marginGlobal: m, rute: im.rute.map(r => ({ ...r, marginPersen: null })) })}
          dasarKonversi="harga all-in door to door (semua stage + biaya lain) per shipment ÷ jumlah satuan dari Profil muatan di tab Input rute."
          onJadikanSatuan={(idR, b) => setIm({ rute: im.rute.map(r => (r.id === idR ? { ...r, satuanJual: b, qtyJualAuto: true } : r)) })} />
        <details className="card" style={{ display: 'grid', gap: 8 }}>
          <summary style={{ cursor: 'pointer' }}><b>Konversi satuan (opsional)</b> <span className="small muted">— isi hanya bila ingin melihat harga per kg / CBM / pallet / case dll.</span></summary>
          <p className="small muted" style={{ margin: 0 }}>Isi yang diketahui (mis. 1 shipment = 20,000 kg = 40 CBM = 20 pallet = 1,600 case). Dropdown satuan di tabel atas otomatis menghitung harga all-in per kg, ton, CBM, pallet, pcs, case, liter, container. Udara per kg memakai chargeable weight (maks. berat vs CBM × 166.67); laut LCL per ton memakai W/M.</p>
          <div className="tablewrap fit"><table className="tabel-fit">
            <thead><tr><th>Rute</th>{FIELD_MUATAN.map(f => <th key={f.k} className="num">{f.l}</th>)}</tr></thead>
            <tbody>{im.rute.map((r, i) => <tr key={r.id}><td>{r.origin || '…'} → {r.destination || '…'}</td>
              {FIELD_MUATAN.map(f => <td key={f.k} className="num"><InputDesimal aria-label={`${f.l} ${r.origin} → ${r.destination}`} min={0} step="any" style={{ width: 90 }} value={r.muatan?.[f.k] ?? ''} placeholder="—"
                onChange={e => setRute(i, { muatan: { ...(r.muatan ?? {}), [f.k]: e.target.value === '' ? undefined : Number(e.target.value) } })} /></td>)}</tr>)}</tbody>
          </table></div>
        </details>
      </>}

      {tab === 'Quotation' && <QuotationPanel tender={{ ...t, asumsi: t.asumsi as never }} profile={profile} sumber={{
        rate: () => rateCardIntermodal(im), perihal: 'Penawaran Harga Jasa Intermodal (Door to Door)', jenisJasa: 'jasa pengiriman intermodal door to door', subjudul: 'Intermodal & Freight Forwarding',
        cek: () => { const k = review.filter(c => c.level === 'kritis'); return k.length ? `Masih ada ${k.length} catatan kritis di tab Result & margin (mis. ${k[0].pesan.toLowerCase()}).` : null; },
        keterangan: 'Tarif per rute = harga jual door to door per satuan jual dengan margin saat ini (pakai tier di tab Result & margin bila ingin mengganti).',
      }} />}

      {tab === 'Simulasi 3D' && (im.rute.length === 0 ? <div className="card muted">Belum ada rute.</div> : <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Simulasi rute 3D (pickup → main leg → delivery)</h2>
          <select aria-label="Pilih rute simulasi" value={sim} onChange={e => setSim(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="semua">Semua rute ({im.rute.length})</option>
            {im.rute.map((r, i) => <option key={r.id} value={r.id}>{i + 1}. {r.origin || '…'} → {r.destination || '…'}</option>)}
          </select>
        </div>
        <Rute3D rute={im.rute.filter(r => sim === 'semua' || r.id === sim).map((r, i) => ({ nama: `${sim === 'semua' ? `${i + 1}. ` : ''}${r.origin} → ${r.destination}`,
          legs: r.stage.map((s, k) => ({ moda: s.moda, dari: s.dari, ke: s.ke, hari: s.leadTimeHari, label: ['Pickup', 'Main leg', 'Delivery'][k], armada: s.armada })) }))} />
      </div>)}
      <DatalistLokasi id="dl-im-darat" jenis={['kota', 'pelabuhan', 'bandara']} />
      <DatalistLokasi id="dl-im-laut" jenis={['pelabuhan']} />
      <DatalistLokasi id="dl-im-udara" jenis={['bandara']} />
      <DatalistLokasi id="dl-im-kereta" jenis={['kota', 'pelabuhan']} />
    </>);
}
