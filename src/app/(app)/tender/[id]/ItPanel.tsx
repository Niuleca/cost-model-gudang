'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { COST_TYPES, KELOMPOK_IT, UMUR_IT_DEFAULT, basisDari, biayaBulanIt, perlakuanDari, ringkasIt, type ItLine, type ItSheet, type PerlakuanSekali } from '@/lib/it';
import { ubahArray } from '@/components/fields';
import { itDefault, sinkronIt, type DriverIt } from '@/lib/itDefault';
import { rp } from '@/lib/format';

interface Katalog { id: number; kelompok: string; item: string; deskripsi: string | null; cost_type: string; harga: number; slab_min: number | null; slab_max: number | null; status: string; berlaku_sampai: string | null }

/** Lembar kebutuhan IT per tender, format BAP: budget vs aktual, per kelompok. */
export default function ItPanel({ sheet, onChange, kontrakBulan, driver }: { sheet: ItSheet; onChange: (s: ItSheet) => void; kontrakBulan: number; driver?: DriverIt }) {
  const sb = supabaseBrowser();
  const [katalog, setKatalog] = useState<Katalog[]>([]);
  const [pilih, setPilih] = useState('');
  const [konfirm, setKonfirm] = useState(false);
  const [bunga, setBunga] = useState(0.1);
  useEffect(() => {
    sb.from('finance_params').select('key, nilai').eq('key', 'bunga_modal_tahun').maybeSingle()
      .then(({ data }: { data: { nilai: number } | null }) => { if (data?.nilai != null) setBunga(Number(data.nilai)); });
    sb.from('it_catalog').select('id, kelompok, item, deskripsi, cost_type, harga, slab_min, slab_max, status, berlaku_sampai').order('urutan').order('item')
      .then(({ data }: { data: unknown }) => setKatalog((data ?? []) as Katalog[]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Template otomatis: tender tanpa baris IT langsung diisi; baris template yang qty-nya belum diubah manual ikut data tender.
  useEffect(() => {
    if (!driver || !katalog.length || !(driver.luasM2 > 0)) return;
    const def = itDefault(driver, katalog);
    if (!def.length) return;
    if (!sheet.lines.length && !sheet.templateDiisi) { onChange({ ...sheet, lines: def, templateDiisi: true }); return; }
    const baru = sinkronIt(sheet.lines, def);
    if (baru) onChange({ ...sheet, lines: baru });
  }, [JSON.stringify(driver), katalog, sheet.lines]); // eslint-disable-line react-hooks/exhaustive-deps

  const opsi = { kontrakBulan, bungaTahun: 0 }; // bunga tidak otomatis — pakai tab Loan & Interest Calculator
  void bunga;
  const r = useMemo(() => ringkasIt(sheet, opsi), [sheet, kontrakBulan, bunga]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (lines: ItLine[]) => onChange({ ...sheet, lines });
  const kelompokAda = KELOMPOK_IT.filter(k => sheet.lines.some(l => l.kelompok === k)).concat(
    Array.from(new Set(sheet.lines.map(l => l.kelompok))).filter(k => !KELOMPOK_IT.includes(k)));

  function tambahDariKatalog() {
    const k = katalog.find(x => x.id === Number(pilih)); if (!k) return;
    set([...sheet.lines, { catalogId: k.id, kelompok: k.kelompok, item: k.item, costType: k.cost_type, qty: 1, hargaBudget: Number(k.harga),
      umurBulan: basisDari(k.cost_type) === 'Sekali' ? UMUR_IT_DEFAULT : undefined }]);
    setPilih('');
  }

  return (
    <div className="card">
      <h2>Kebutuhan IT (format BAP)</h2>
      <p className="small muted">Item ditarik dari katalog IT. Bulanan (PUPM, PDPM, Cost/Month, Monthly/Site) dan transaksi masuk biaya bulanan; Yearly ÷ 12; OTC berupa perangkat (hardware, CCTV, device) didepresiasi selama umur ekonomis (maks. masa kontrak); development, cabling & mandays diamortisasi selama kontrak; atau pilih ditagih terpisah di quotation. Bunga tidak dihitung otomatis — kalau OTC dibiayai pinjaman, pilih di tab Interest cost. Masa kontrak: {kontrakBulan} bln.</p>
      <div className="grid3">
        <label className="f" htmlFor="bap">Nomor BAP<input id="bap" value={sheet.nomorBap ?? ''} onChange={e => onChange({ ...sheet, nomorBap: e.target.value })} placeholder="BAP-…" /></label>
        <label className="f" htmlFor="kurs">Kurs USD (Rp)<input id="kurs" type="number" value={sheet.kursUsd} onChange={e => onChange({ ...sheet, kursUsd: Number(e.target.value) })} /></label>
      </div>
      {driver && (() => {
        const def = itDefault(driver, katalog);
        const isi = (ganti: boolean) => { set(ganti ? def : [...sheet.lines, ...def.filter(d => !sheet.lines.some(l => l.kunci === d.kunci || (l.catalogId != null && l.catalogId === d.catalogId)))]); setKonfirm(false); };
        const ikut = sheet.lines.filter(l => l.kunci && l.qtyDefault != null && l.qty === l.qtyDefault).length;
        const manual = sheet.lines.filter(l => l.kunci && l.qtyDefault != null && l.qty !== l.qtyDefault).length;
        return <div className="notice small" style={{ display: 'grid', gap: 6 }}>
          <div><b>Template IT otomatis</b> — {def.length} item dari katalog, qty dihitung dari:
            {' '}luas <b>{Math.round(driver.luasM2).toLocaleString('id-ID')} m²</b>{driver.officeM2 ? <> (office <b>{Math.round(driver.officeM2).toLocaleString('id-ID')} m²</b>)</> : null} · {driver.orderBulan ? <>order <b>{Math.round(driver.orderBulan).toLocaleString('id-ID')}/bln</b></> : <>transaksi <b>{Math.round(driver.transaksiBulan).toLocaleString('id-ID')} palet/bln</b></>} · user kantor <b>{driver.userKantor}</b> · SPV/manager <b>{driver.manajer}</b> · operator scan <b>{driver.operatorScan ?? 0}</b> · RF <b>{driver.unitRf}</b> · PC <b>{driver.unitPc}</b> · laptop <b>{driver.unitLaptop}</b>.
            {' '}Aturan: WiFi AP 1 / 600 m² gudang + 1 / 150 m² office, switch PoE per 20 port (AP + CCTV), CCTV 1 / 200 m² (min. 8), NVR 1 / 32 kamera, printer 1 / 5.000 m², RF = unit RF di MHE Summary atau operator scan per shift + 10%, PC & laptop dari MHE Summary / user kantor, lisensi per user, WMS per order dengan slab sesuai volume.</div>
          <div className="row">
            {!sheet.lines.length
              ? <button className="ghost" disabled={!def.length} onClick={() => isi(true)}>Isi template IT</button>
              : !konfirm
                ? <><button className="ghost" disabled={!def.length} onClick={() => setKonfirm(true)}>Ganti dengan template</button>
                    <button className="ghost" disabled={!def.length} onClick={() => isi(false)}>Tambahkan item template yang belum ada</button></>
                : <><span>Ganti {sheet.lines.length} baris IT yang ada?</span><button className="danger" onClick={() => isi(true)}>Ya, ganti</button><button className="ghost" onClick={() => setKonfirm(false)}>Batal</button></>}
            {ikut > 0 && <span className="pill info">{ikut} baris ikut data tender otomatis</span>}
            {manual > 0 && <span className="pill warn">{manual} baris qty diubah manual (tidak ikut otomatis)</span>}
          </div>
        </div>;
      })()}
      <div className="row">
        <select aria-label="Item katalog IT" value={pilih} onChange={e => setPilih(e.target.value)} style={{ flex: '1 1 260px', maxWidth: 520 }}>
          <option value="">Pilih dari katalog IT ({katalog.length})</option>
          {KELOMPOK_IT.concat(Array.from(new Set(katalog.map(k => k.kelompok))).filter(k => !KELOMPOK_IT.includes(k))).map(g => {
            const isi = katalog.filter(k => k.kelompok === g); if (!isi.length) return null;
            return <optgroup key={g} label={g}>{isi.map(k => <option key={k.id} value={k.id}>{k.item} · {k.cost_type} · {rp(k.harga)}{k.slab_min != null ? ` (slab ${k.slab_min}–${k.slab_max ?? '∞'})` : ''}{k.status !== 'approved' ? ' (draft)' : ''}</option>)}</optgroup>;
          })}
        </select>
        <button disabled={!pilih} onClick={tambahDariKatalog}>Tambah</button>
        <button className="ghost" onClick={() => set([...sheet.lines, { kelompok: KELOMPOK_IT[0], item: '', costType: 'PDPM', qty: 1, hargaBudget: 0 }])}>Baris manual</button>
      </div>

      <div className="tablewrap fit"><table className="tabel-fit tabel-it">
        <thead><tr><th>Item & dasar qty</th><th>Cost type</th><th className="num">Qty</th><th className="num">Harga budget</th><th className="num">Total budget</th><th className="num">Harga aktual</th><th>Perlakuan</th><th className="num">Biaya/bln</th><th></th></tr></thead>
        <tbody>
          {sheet.lines.length === 0 && <tr><td colSpan={9} className="muted">Belum ada kebutuhan IT.</td></tr>}
          {kelompokAda.map(g => [
            <tr key={`g-${g}`} className="pd-sub"><td colSpan={9}><b>{g}</b></td></tr>,
            ...sheet.lines.map((l, i) => l.kelompok !== g ? null : (
            <tr key={i}>
              <td>
                {l.catalogId ? <b>{l.item}</b> : <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <select aria-label="Kelompok" value={l.kelompok} onChange={e => set(ubahArray(sheet.lines, i, { kelompok: e.target.value }))} style={{ maxWidth: 140 }}>{KELOMPOK_IT.map(k => <option key={k}>{k}</option>)}</select>
                  <input aria-label="Item" value={l.item} placeholder="Nama item" onChange={e => set(ubahArray(sheet.lines, i, { item: e.target.value }))} /></div>}
                <input aria-label="Catatan" className="input-kecil" value={l.catatan ?? ''} placeholder="dasar qty / keterangan" onChange={e => set(ubahArray(sheet.lines, i, { catatan: e.target.value }))} />
              </td>
              <td><select aria-label="Cost type" value={l.costType} onChange={e => set(ubahArray(sheet.lines, i, { costType: e.target.value }))}>{COST_TYPES.map(c => <option key={c.v} value={c.v} title={c.ket}>{c.v}</option>)}</select></td>
              <td className="num"><input aria-label="Qty" type="number" step="any" value={l.qty} onChange={e => set(ubahArray(sheet.lines, i, { qty: Number(e.target.value) }))} title={basisDari(l.costType) === 'Transaksi' ? 'Transaksi per bulan' : ''} />
                {l.kunci && l.qtyDefault != null && l.qty !== l.qtyDefault && <div className="small muted">manual · <button className="link-kecil" title="Kembalikan ke qty template (ikut data tender lagi)" onClick={() => set(ubahArray(sheet.lines, i, { qty: l.qtyDefault! }))}>default {l.qtyDefault}</button></div>}</td>
              <td className="num db"><input aria-label="Harga budget" type="number" step="any" value={l.hargaBudget} onChange={e => set(ubahArray(sheet.lines, i, { hargaBudget: Number(e.target.value) }))} />
                <select aria-label="Mata uang" className="input-kecil" value={l.mataUang ?? 'IDR'} onChange={e => set(ubahArray(sheet.lines, i, { mataUang: e.target.value as 'IDR' | 'USD' }))}><option>IDR</option><option>USD</option></select></td>
              <td className="num">{rp(l.qty * l.hargaBudget * (l.mataUang === 'USD' ? sheet.kursUsd : 1))}</td>
              <td className="num"><input aria-label="Harga aktual" type="number" step="any" value={l.hargaAktual ?? ''} onChange={e => set(ubahArray(sheet.lines, i, { hargaAktual: e.target.value === '' ? null : Number(e.target.value) }))} />
                {l.hargaAktual != null && <div className="small muted">{rp(l.qty * l.hargaAktual * (l.mataUang === 'USD' ? sheet.kursUsd : 1))}</div>}</td>
              {(() => {
                const sekali = basisDari(l.costType) === 'Sekali', p = perlakuanDari(l), c = biayaBulanIt(l, sheet.kursUsd, opsi);
                return <>
                  <td className="td-lebar">{sekali
                    ? <><select aria-label="Perlakuan OTC" value={p} onChange={e => set(ubahArray(sheet.lines, i, { perlakuanSekali: e.target.value as PerlakuanSekali, umurBulan: l.umurBulan ?? UMUR_IT_DEFAULT }))}>
                        <option value="depresiasi">Depresiasi</option><option value="amortisasi">Amortisasi</option><option value="tagih">Tagih terpisah</option></select>
                        {p === 'depresiasi' && <label className="small muted row" style={{ gap: 4, flexWrap: 'nowrap' }}>umur <input aria-label="Umur ekonomis" type="number" min={1} value={l.umurBulan ?? UMUR_IT_DEFAULT} style={{ width: 56 }} onChange={e => set(ubahArray(sheet.lines, i, { umurBulan: Number(e.target.value) }))} /> bln</label>}
                        {p === 'amortisasi' && <div className="small muted">{kontrakBulan} bln kontrak</div>}</>
                    : <span className="small muted">{basisDari(l.costType)}</span>}</td>
                  <td className="num" title={c.bunga ? `pokok ${rp(c.pokok)} + bunga ${rp(c.bunga)} · ${c.jenis} ${c.periode} bln` : c.jenis}>{c.total ? <b>{rp(c.total)}</b> : <span className="small muted">{p === 'tagih' && sekali ? 'di quotation' : '–'}</span>}</td>
                </>;
              })()}
              <td><button className="danger" title="Hapus baris" aria-label="Hapus" onClick={() => set(sheet.lines.filter((_, j) => j !== i))}>×</button></td>
            </tr>))])}
        </tbody>
      </table></div>

      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>Ringkasan</th><th className="num">Budget</th><th className="num">Aktual</th><th className="num">Selisih</th></tr></thead>
        <tbody>
          <tr><td>Biaya bulanan (termasuk transaksi)</td><td className="num">{rp(r.bulanan)}</td><td className="num">{rp(r.bulananAktual)}</td><td className="num">{rp(r.bulananAktual - r.bulanan)}</td></tr>
          <tr><td>Biaya tahunan</td><td className="num">{rp(r.tahunan)}</td><td className="num">{rp(r.tahunanAktual)}</td><td className="num">{rp(r.tahunanAktual - r.tahunan)}</td></tr>
          <tr><td>One time charge (OTC + mandays)</td><td className="num">{rp(r.sekali)}</td><td className="num">{rp(r.sekaliAktual)}</td><td className="num">{rp(r.sekaliAktual - r.sekali)}</td></tr>
          <tr className="pd-sub"><td colSpan={4}><b>Biaya IT per bulan (masuk cost model)</b></td></tr>
          <tr><td>Bulanan + tahunan ÷ 12</td><td className="num">{rp(r.setaraBulan)}</td><td></td><td></td></tr>
          <tr><td>Depresiasi perangkat (nilai aset {rp(r.nilaiAset)})</td><td className="num">{rp(r.depresiasiBulan)}</td><td></td><td></td></tr>
          <tr><td>Amortisasi OTC / mandays (nilai {rp(r.nilaiAmortisasi)} ÷ {kontrakBulan} bln)</td><td className="num">{rp(r.amortisasiBulan)}</td><td></td><td></td></tr>
          <tr><td><b>Total IT per bulan</b></td><td className="num out"><b>{rp(r.totalBulan)}</b></td><td></td><td></td></tr>
          {r.tagihSekali.length > 0 && <tr><td>Ditagih terpisah di quotation</td><td className="num">{rp(r.tagihSekali.reduce((s, x) => s + x.nilai, 0))}</td><td></td><td></td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
