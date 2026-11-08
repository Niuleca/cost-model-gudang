'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import StatusControl from '@/components/StatusControl';
import { DatalistLokasi, InfoTenderTr, KartuRingkas, PersenInput, useRates, useTenderTr, type TenderTr } from '@/components/transport/shared';
import { KartuReview, PerbandinganMargin } from '@/components/transport/ReviewTr';
import QuotationPanel from '@/app/(app)/tender/[id]/QuotationPanel';
import {
  ARMADA, BASIS_DARAT, TIER_DEFAULT, TRANSPORT_DEFAULT, armada, cocokRate, estimasiHarga, hasilOverview, hitungRute, kapasitasBasis, labelBasis,
  rateCardTransport, reviewTransport, ringkasTransport, ruteBaru, tierTransport, type RuteTransport, type TenderTransport,
} from '@/lib/transport';
import { useTabUrl } from '@/lib/useTabUrl';
import { useProfile } from '@/lib/useProfile';
import { jarakKm, bisaDarat } from '@/lib/lokasiIndonesia';
import { rp } from '@/lib/format';
import { labelStatus, pillStatus } from '@/lib/status';
import { supabaseBrowser } from '@/lib/supabase/client';

const Rute3D = dynamic(() => import('@/components/transport/Rute3D'), { ssr: false, loading: () => <div className="rute3d-wadah sim3d-muat">Menyiapkan peta 3D…</div> });

const TABS = ['Input rute', 'Result & margin', 'Quotation', 'Simulasi 3D'] as const;
const ambilTr = (t: TenderTr): TenderTransport => ({ ...TRANSPORT_DEFAULT, ...((t.asumsi?.transport as TenderTransport | undefined) ?? {}) });

/** Tender Transportation: rute origin → destination, armada, buying basis, vendor & harga beli (market price), margin, harga jual. */
export default function TransportTender() {
  const { id } = useParams<{ id: string }>();
  const hitungHasil = useCallback((t: TenderTr) => { const tr = ambilTr(t); return hasilOverview(ringkasTransport(tr), { jenis: 'transportation', rute: tr.rute.length }); }, []);
  const { t, ubah, kotor, pesan, err, simpanSekarang, setT } = useTenderTr(id, hitungHasil);
  const { rates, err: errRate, muat: muatRate } = useRates();
  const [info, setInfo] = useState<string | null>(null);
  const [sim, setSim] = useState<string>('semua');
  const [tab, setTab] = useTabUrl(TABS, 'Input rute');
  const { profile } = useProfile();
  if (!t) return <p className="muted">{err ?? 'Memuat tender…'}</p>;
  const tr = ambilTr(t);
  const setTr = (p: Partial<TenderTransport>) => ubah({ asumsi: { ...t.asumsi, transport: { ...tr, ...p } } });
  const setRute = (i: number, p: Partial<RuteTransport>) => setTr({ rute: tr.rute.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const ringkas = ringkasTransport(tr);
  const override = tr.rute.filter(r => r.marginPersen != null).length;
  const tiers = tr.tierMargin ?? TIER_DEFAULT;
  const review = reviewTransport(tr, rates);

  async function keMarket(r: RuteTransport) {
    setInfo(null);
    const { error } = await supabaseBrowser().from('transport_rates').insert({ moda: 'darat', origin: r.origin, destination: r.destination, armada: r.armada, basis: r.basis,
      harga: r.hargaBeli, vendor: r.vendor, lead_time_hari: r.leadTimeHari ?? null, sumber: `tender ${t!.kode ?? ''}`.trim(), status: 'draft' });
    setInfo(error ? (/duplicate|unique/i.test(error.message) ? 'Harga vendor untuk rute, armada & basis ini sudah ada di Market Price — ubah di sheet Market Price.' : error.message) : `Tersimpan ke Market Price: ${r.origin} → ${r.destination} (${r.vendor}).`);
    if (!error) muatRate();
  }

  return (
    <>
      <div className="head">
        <div><div className="eyebrow"><Link href="/transport">Transportation Tender</Link> · {t.kode}</div><h1>{t.customer}</h1></div>
        <div className="row small">
          <span className={`pill ${pillStatus(t.status)}`}>{labelStatus(t.status)}</span>
          <span className="muted">{kotor ? 'Menyimpan otomatis…' : pesan ?? 'Tersimpan'}</span>
          <button className="ghost" onClick={() => simpanSekarang()}>Simpan</button>
          <button className="ghost" title="Excel dengan rumus lengkap: rute, perbandingan margin, review — angka sama dengan sistem"
            onClick={() => import('@/lib/exportTransport').then(m => m.unduhExcelTr('transportation', t, tr, rates)).catch(e => alert(`Export gagal: ${e instanceof Error ? e.message : e}`))}>⬇ Export Excel</button>
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="card"><StatusControl tender={{ id: t.id, status: t.status, alasan_hasil: t.alasan_hasil, tanggal_go_live: t.tanggal_go_live }} onBerubah={st => setT(x => x && ({ ...x, status: st }))} /></div>
      <InfoTenderTr t={t} ubah={ubah} marginGlobal={tr.marginGlobal} onMargin={v => setTr({ marginGlobal: v })} adaOverride={override}
        onMarginSemua={() => setTr({ rute: tr.rute.map(r => ({ ...r, marginPersen: null })) })} />
      <KartuRingkas r={ringkas} kontrakBulan={t.durasi_kontrak_bulan} />
      <div className="tabs" role="tablist">{TABS.map(x => <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>{x}
        {x === 'Result & margin' && review.some(c => c.level === 'kritis') ? ' ⚠' : ''}</button>)}</div>

      {tab === 'Input rute' && <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Rute & harga</h2>
          <div className="row small">
            <span className="muted">{rates.length} harga di Market Price</span>
            <Link className="btn ghost" href="/market-price" target="_blank">Buka Market Price</Link>
            <button onClick={() => setTr({ rute: [...tr.rute, ruteBaru({ origin: tr.rute.at(-1)?.origin ?? t.kab_kota ?? '' })] })}>+ Tambah rute</button>
          </div>
        </div>
        {errRate && <p className="error small">Market Price belum bisa dibaca: {errRate}</p>}
        {info && <p className="small notice">{info}</p>}
        <div className="tablewrap fit"><table className="tabel-fit tabel-tr">
          <thead><tr><th>Rute</th><th>Armada · buying basis</th><th className="num">Volume / bln</th><th>Vendor & harga beli</th><th className="num">Margin %</th><th className="num">Harga jual</th><th className="num">Biaya · pendapatan / bln</th><th></th></tr></thead>
          <tbody>
            {tr.rute.length === 0 && <tr><td colSpan={8} className="muted">Belum ada rute. Klik “+ Tambah rute”.</td></tr>}
            {tr.rute.map((r, i) => {
              const h = hitungRute(r, tr.marginGlobal);
              const km = jarakKm(r.origin, r.destination, 'darat');
              const pilihan = r.origin && r.destination ? cocokRate(rates, { moda: 'darat', origin: r.origin, destination: r.destination, armada: r.armada, basis: r.basis }) : [];
              const lintas = !!r.origin && !!r.destination && !bisaDarat(r.origin, r.destination);
              const est = r.origin && r.destination && !lintas ? estimasiHarga(r.armada, r.origin, r.destination, r.basis) : null;
              const a = armada(r.armada); const kap = kapasitasBasis(a, r.basis);
              return (
                <tr key={r.id} className={!(r.hargaBeli > 0) ? 'baris-merah' : undefined}>
                  <td>
                    <input aria-label="Origin" list="dl-tr-kota" value={r.origin} placeholder="Origin" onChange={e => setRute(i, { origin: e.target.value })} />
                    <input aria-label="Destination" list="dl-tr-kota" className="input-kecil" value={r.destination} placeholder="Destination" onChange={e => setRute(i, { destination: e.target.value })} />
                    <div className="dasar-def">{km ? `±${km.toLocaleString('id-ID')} km (perkiraan)` : r.origin && r.destination ? 'jarak belum diketahui' : ''}
                      {lintas && <span style={{ color: 'var(--warn, #b45309)' }}> · beda pulau → pertimbangkan Intermodal</span>}</div>
                  </td>
                  <td>
                    <select aria-label="Armada" value={r.armada} onChange={e => setRute(i, { armada: e.target.value })}>
                      {ARMADA.filter(x => x.moda === 'darat').map(x => <option key={x.nama}>{x.nama}</option>)}</select>
                    <select aria-label="Buying basis" className="input-kecil" value={r.basis} onChange={e => setRute(i, { basis: e.target.value as RuteTransport['basis'] })}>
                      {BASIS_DARAT.map(b => <option key={b} value={b}>{labelBasis(b)}</option>)}</select>
                    {a && <div className="dasar-def">{(a.kapKg / 1000).toLocaleString('id-ID')} t · {a.kapCbm} CBM · {a.kapPalet} palet{kap && r.basis !== 'trip' ? ` · ±${kap.toLocaleString('id-ID', { maximumFractionDigits: 1 })} ${r.basis}/trip` : ''}</div>}
                  </td>
                  <td className="num"><input aria-label="Volume per bulan" type="number" min={0} step="any" value={r.volumeBulan || ''} placeholder="0" onChange={e => setRute(i, { volumeBulan: Number(e.target.value) || 0 })} />
                    <div className="dasar-def">{labelBasis(r.basis).replace('per ', '')}/bln</div></td>
                  <td>
                    {pilihan.length > 0 && <select aria-label="Pilih dari market price" value={r.rateId ?? ''} onChange={e => {
                      const x = pilihan.find(p => p.id === Number(e.target.value));
                      if (x) setRute(i, { rateId: x.id, vendor: x.vendor, hargaBeli: x.harga, leadTimeHari: x.lead_time_hari, sumberHarga: 'market' });
                    }}><option value="">Market price: {pilihan.length} vendor…</option>{pilihan.map(p => <option key={p.id} value={p.id}>{p.vendor || '(tanpa nama)'} · {rp(p.harga)}{p.status !== 'approved' ? ' (draft)' : ''}</option>)}</select>}
                    <input aria-label="Vendor" className={pilihan.length ? 'input-kecil' : undefined} value={r.vendor} placeholder="Vendor" onChange={e => setRute(i, { vendor: e.target.value, rateId: null, sumberHarga: 'manual' })} />
                    <input aria-label="Harga beli" className="input-kecil" type="number" min={0} value={r.hargaBeli || ''} placeholder={`Harga beli ${labelBasis(r.basis)}`} onChange={e => setRute(i, { hargaBeli: Number(e.target.value) || 0, rateId: null, sumberHarga: 'manual' })} />
                    <div className="dasar-def">
                      {r.sumberHarga === 'market' ? 'dari Market Price' : r.sumberHarga === 'estimasi' ? 'estimasi tarif per km' : pilihan.length ? '' : 'belum ada di Market Price'}
                      {est && r.sumberHarga !== 'market' && <> · <button className="link-kecil" title={est.ket} onClick={() => setRute(i, { hargaBeli: est.harga, sumberHarga: 'estimasi', rateId: null })}>pakai estimasi {rp(est.harga)}</button></>}
                      {r.sumberHarga === 'manual' && r.vendor && r.hargaBeli > 0 && <> · <button className="link-kecil" onClick={() => keMarket(r)}>simpan ke Market Price</button></>}
                    </div>
                  </td>
                  <td className="num"><PersenInput label="Margin rute" nilai={r.marginPersen} placeholder={`${Math.round(tr.marginGlobal * 1000) / 10}`} onChange={v => setRute(i, { marginPersen: v })} />
                    <div className="dasar-def">{r.marginPersen == null ? 'global' : 'khusus rute'}</div></td>
                  <td className="num"><b>{rp(h.jual)}</b><div className="dasar-def">{labelBasis(r.basis)} · GP {(h.gpPersen * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</div></td>
                  <td className="num">{rp(h.biayaBulan)}<div className="dasar-def"><b>{rp(h.pendapatanBulan)}</b></div></td>
                  <td><button className="ghost" title="Duplikat rute" aria-label="Duplikat" onClick={() => setTr({ rute: [...tr.rute.slice(0, i + 1), { ...r, id: Math.random().toString(36).slice(2, 10) }, ...tr.rute.slice(i + 1)] })}>⧉</button>
                    <button className="danger" title="Hapus rute" aria-label="Hapus" onClick={() => setTr({ rute: tr.rute.filter((_, j) => j !== i) })}>×</button></td>
                </tr>);
            })}
          </tbody>
        </table></div>
        <p className="small muted" style={{ margin: 0 }}>Jarak & estimasi harga memakai koordinat kota perkiraan × faktor jalan 1,3 dan tarif indikatif per km per armada (Deliveree) — hanya acuan bila Market Price belum ada; harga final dari quotation vendor.</p>
        <DatalistLokasi id="dl-tr-kota" jenis={['kota', 'pelabuhan']} />
      </div>}

      {tab === 'Result & margin' && <>
        <KartuReview review={review} />
        <PerbandinganMargin hasil={tierTransport(tr, tiers)} tiers={tiers} onTiers={x => setTr({ tierMargin: x })} kontrakBulan={t.durasi_kontrak_bulan}
          marginGlobal={tr.marginGlobal} adaOverride={override} onMarginGlobal={m => setTr({ marginGlobal: m })} onPakai={m => setTr({ marginGlobal: m, rute: tr.rute.map(r => ({ ...r, marginPersen: null })) })} />
      </>}

      {tab === 'Quotation' && <QuotationPanel tender={{ ...t, asumsi: t.asumsi as never }} profile={profile} sumber={{
        rate: () => rateCardTransport(tr), perihal: 'Penawaran Harga Jasa Transportasi', jenisJasa: 'jasa transportasi darat (trucking)', subjudul: 'Transportation & Distribution',
        cek: () => { const k = review.filter(c => c.level === 'kritis'); return k.length ? `Masih ada ${k.length} catatan kritis di tab Result & margin (mis. ${k[0].pesan.toLowerCase()}).` : null; },
        keterangan: 'Tarif per rute = harga jual hasil margin saat ini (pakai tier di tab Result & margin bila ingin mengganti). Simpan perubahan rute dulu sebelum membuat quotation.',
      }} />}

      {tab === 'Simulasi 3D' && (tr.rute.length === 0 ? <div className="card muted">Belum ada rute.</div> : <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Simulasi rute 3D</h2>
          <select aria-label="Pilih rute simulasi" value={sim} onChange={e => setSim(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="semua">Semua rute ({tr.rute.length})</option>
            {tr.rute.map((r, i) => <option key={r.id} value={r.id}>{i + 1}. {r.origin || '…'} → {r.destination || '…'} · {r.armada}</option>)}
          </select>
        </div>
        <Rute3D rute={tr.rute.filter(r => sim === 'semua' || r.id === sim).map((r, i) => ({ nama: `${sim === 'semua' ? `${i + 1}. ` : ''}${r.origin} → ${r.destination}`, legs: [{ moda: 'darat' as const, dari: r.origin, ke: r.destination, hari: r.leadTimeHari, label: r.armada, armada: r.armada }] }))} />
      </div>)}
    </>);
}
