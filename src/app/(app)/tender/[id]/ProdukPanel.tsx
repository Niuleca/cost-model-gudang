'use client';
// Tab Produk (sebelah Volume): master produk / SKU tender — nama, kode, P×L×T, CBM, berat, UPP, qty, UOM.
// Baris pertama otomatis dari Key assumption & Volume; bisa diedit, ditambah, atau ditempel dari Excel.
// Produk manual = sumber data tender: Parameter muatan, isi per palet, stok storage, tinggi produk di rak & porsi pallet floor
// ikut diperbarui (bisa dimatikan). Turunan: level rak maksimal per berat, zonasi area, dan SKU di Simulasi Warehouse.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Num } from '@/components/fields';
import { angka } from '@/lib/format';
import type { VolumeInput } from '@/lib/engine/types';
import type { ProfilVolume } from '@/lib/profilVolume';
import { hitungLevelRak, lengkapiSpaceExcel, type HasilSpaceExcel, type SpaceExcel } from '@/lib/engine/space';
import {
  ATURAN_BERAT_DEFAULT, KATEGORI_PRODUK, SIMPAN, UOM_PRODUK, adaProdukNyata, dariTempel, hitungProduk, produkEfektif, produkOtomatis, ringkasZona, zonasiOtomatis,
  type AturanBerat, type PerubahanTender, type ProdukTender,
} from '@/lib/produk';

const LABEL_SIMPAN: Record<string, string> = Object.fromEntries(SIMPAN.map(s => [s.v, s.l]));
const WARNA_ZONA = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#db2777', '#4b5563'];

/** Input angka yang boleh kosong (0 ditampilkan kosong), menerima koma desimal. */
function Angka({ value, onValue, bulat, ...rest }: { value: number | null | undefined; onValue: (v: number) => void; bulat?: boolean; 'aria-label': string; style?: CSSProperties; placeholder?: string; title?: string }) {
  const tampil = (v: number | null | undefined) => (v == null || !Number(v) ? '' : String(v));
  const [teks, setTeks] = useState(tampil(value));
  useEffect(() => { const n = Number(teks.replace(',', '.')); if ((Number(value) || 0) !== (Number.isFinite(n) ? n : 0)) setTeks(tampil(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input {...rest} inputMode="decimal" value={teks} onChange={e => {
    const x = e.target.value.replace(/[^\d.,]/g, ''); setTeks(x);
    const n = Number(x.replace(/\./g, x.includes(',') ? '' : '.').replace(',', '.')); if (x === '' || Number.isFinite(n)) onValue(x === '' ? 0 : bulat ? Math.round(n) : n);
  }} />;
}

export default function ProdukPanel({ produk, aturan, volumes, profil, spaceExcel, spaceH, namaCustomer, sinkron, dampak, onChange, onAturan, onSinkron }: {
  produk: ProdukTender[] | undefined; aturan: AturanBerat | undefined; volumes: VolumeInput[]; profil: ProfilVolume | undefined;
  spaceExcel: Partial<SpaceExcel> | undefined; spaceH: HasilSpaceExcel | null; namaCustomer?: string;
  sinkron: boolean; dampak: PerubahanTender[];
  onChange: (p: ProdukTender[]) => void; onAturan: (a: AturanBerat | undefined) => void; onSinkron: (v: boolean) => void;
}) {
  const at = aturan ?? ATURAN_BERAT_DEFAULT;
  const sx = lengkapiSpaceExcel(spaceExcel);
  const lv = hitungLevelRak(sx.rak);
  const levelRak = Math.max(1, lv.level || 1);
  const daftar = useMemo(() => produkEfektif(produk, volumes, profil, namaCustomer), [produk, volumes, profil, namaCustomer]);
  const hit = useMemo(() => daftar.map(x => hitungProduk(x, at, levelRak, sx.rak.productMm)), [daftar, at, levelRak, sx.rak.productMm]);
  const [tempel, setTempel] = useState<string | null>(null);
  const [cari, setCari] = useState('');
  const [pesan, setPesan] = useState<string | null>(null);
  const kabar = (s: string) => { setPesan(s); setTimeout(() => setPesan(null), 3500); };
  const nyata = adaProdukNyata(produk);

  // ubah satu baris: baris otomatis yang diedit angkanya berhenti mengikuti key assumption
  const ubah = (i: number, patch: Partial<ProdukTender>, lepasOtomatis = true) => {
    const base = daftar.map(x => ({ ...x }));
    base[i] = { ...base[i], ...patch, ...(lepasOtomatis && base[i].otomatis ? { otomatis: false, dimEstimasi: patch.p || patch.l || patch.t ? false : base[i].dimEstimasi } : {}) };
    if (patch.p || patch.l || patch.t) base[i].dimEstimasi = false;
    onChange(base);
  };
  const tambah = () => onChange([...daftar, { id: `p-${Date.now().toString(36)}`, kode: `SKU-${String(daftar.length + 1).padStart(3, '0')}`, nama: '', uom: 'karton', p: 0, l: 0, t: 0, beratKg: 0, upp: 0, qty: 0, kategori: 'Umum', zona: daftar[0]?.zona ?? 'A', simpan: 'otomatis' }]);
  const hapus = (i: number) => onChange(daftar.filter((_, j) => j !== i));
  const auto = produkOtomatis(volumes, profil, namaCustomer);

  const tot = hit.reduce((s, h, i) => ({ qty: s.qty + (Number(daftar[i].qty) || 0), palet: s.palet + h.palet, kg: s.kg + h.totalKg, cbm: s.cbm + h.totalCbm }), { qty: 0, palet: 0, kg: 0, cbm: 0 });
  const stSt = volumes.find(v => v.arus === 'storage');
  const paletVolume = stSt && /^pal+et/i.test(stSt.uom) ? Number(stSt.peakBulan || stSt.rataRataBulan) || 0 : null;
  const zona = ringkasZona(daftar, at, levelRak);
  const warnaZ = new Map(zona.map((z, i) => [z.zona, WARNA_ZONA[i % WARNA_ZONA.length]]));

  // kapasitas posisi level 1 (rak beam terbawah + lantai) vs palet yang hanya boleh di level 1
  const sd = spaceH?.sd, dd = spaceH?.dd;
  const posRakL1 = (sd ? sd.bay * sd.paletPerLevel : 0) + (dd ? dd.bay * dd.paletPerLevel * (dd.deep ?? 2) : 0);
  const posLantai = Math.ceil(spaceH?.floor.ppReq ?? 0) + (spaceH?.block.tapak ?? 0);
  const posL1 = posRakL1 + posLantai;
  const paletL1 = hit.reduce((s, h) => s + (h.levelMaks <= 1 ? h.palet : 0), 0);
  const paletLantai = hit.reduce((s, h) => s + (h.hanyaLantai ? h.palet : 0), 0);
  const posTotal = (spaceH?.posisiRak ?? 0) + posLantai;

  const tampil = daftar.map((x, i) => ({ x, h: hit[i], i })).filter(r => !cari || `${r.x.kode} ${r.x.nama} ${r.x.zona ?? ''} ${r.x.kategori ?? ''}`.toLowerCase().includes(cari.toLowerCase()));
  const kecil: CSSProperties = { padding: '6px 8px', minWidth: 0, width: '100%' };
  const lab = (t: string) => <span className="small muted" style={{ display: 'block', marginBottom: 2 }}>{t}</span>;

  return <>
    <div className="card">
      <h2>Produk / SKU</h2>
      <p className="small muted">Master produk tender: nama, kode, dimensi P × L × T (cm), CBM, berat, <b>UPP</b> (unit per palet), qty stok dan UOM (karton, pcs, roll, bag, pail, unit, dll.).
        Baris pertama <b>otomatis</b> dari Key assumption (Volume + Parameter muatan). Setelah Anda mengisi / mengubah produk, data produk menjadi <b>sumber data tender</b>:
        Parameter muatan, isi per palet & stok storage di tab Volume, serta tinggi produk di rak & porsi pallet floor di tab Gudang ikut diperbarui. Perubahan disimpan otomatis.</p>

      <div className="kpis">
        {([['Jumlah SKU', angka(daftar.length)], ['Qty stok', angka(tot.qty)], ['Palet', angka(tot.palet)], ['Berat', `${angka(tot.kg / 1000, 1)} ton`], ['Volume', `${angka(tot.cbm, 1)} CBM`],
          ['Level rak (Space)', `${levelRak} level`]] as [string, string][]).map(([l, v]) => <div key={l} className="kpi"><span className="small muted">{l}</span><b>{v}</b></div>)}
      </div>

      <div className="umk-box" style={{ alignItems: 'center' }}>
        <label className="row" style={{ gap: 8, alignItems: 'center', margin: 0 }}>
          <input type="checkbox" checked={sinkron} onChange={e => onSinkron(e.target.checked)} style={{ width: 18, height: 18 }} />
          <b>Produk jadi sumber data tender</b></label>
        <span className="small muted" style={{ flex: 1, minWidth: 240 }}>
          {!nyata ? 'Aktif setelah ada produk yang Anda isi / ubah sendiri (baris otomatis saja tidak mengubah tender).'
            : sinkron ? 'Volume, Parameter muatan & Space mengikuti data produk. Matikan bila ingin mengisi tab-tab itu manual.'
              : 'Mati — tab Volume & Space tidak diubah oleh data produk.'}</span>
      </div>
      {sinkron && nyata && dampak.length > 0 && <div className="card" style={{ background: 'var(--ok-bg, #f0fdf4)', borderColor: '#bbf7d0', padding: 10 }}>
        <b className="small">Diperbarui dari data produk</b>
        <div className="tablewrap"><table className="small" style={{ margin: '4px 0 0' }}>
          <thead><tr><th>Tab</th><th>Isian</th><th className="num">Sebelum</th><th className="num">Sekarang</th></tr></thead>
          <tbody>{dampak.map((d, k) => <tr key={k}><td>{d.bagian}</td><td>{d.item}</td><td className="num muted">{d.dari}</td><td className="num"><b>{d.ke}</b></td></tr>)}</tbody></table></div>
        <span className="small muted">Klik Hitung untuk melihat dampaknya ke biaya & tarif.</span>
      </div>}
      {!(sinkron && nyata) && paletVolume != null && tot.palet > 0 && Math.abs(tot.palet - paletVolume) / Math.max(1, paletVolume) > 0.1 && <p className="notice small" role="alert">
        Total palet produk <b>{angka(tot.palet)}</b> berbeda dari stok di tab Volume <b>{angka(paletVolume)} palet</b> (peak). Aktifkan "Produk jadi sumber data tender" atau samakan qty / UPP.</p>}
      {daftar.find(x => x.otomatis)?.catatan && <p className="notice small">⚠ {daftar.find(x => x.otomatis)!.catatan}</p>}

      <div className="row" style={{ alignItems: 'end', marginTop: 8 }}>
        <input aria-label="Cari produk" placeholder="Cari kode, nama, zona…" value={cari} onChange={e => setCari(e.target.value)} style={{ maxWidth: 240 }} />
        <span style={{ flex: 1 }} />
        <button className="ghost" onClick={() => setTempel(tempel == null ? '' : null)}>{tempel == null ? 'Tempel dari Excel' : 'Tutup tempel'}</button>
        <button className="ghost" disabled={!auto} title="Tambahkan / segarkan baris otomatis dari Key assumption" onClick={() => {
          if (!auto) return;
          const ada = daftar.findIndex(x => x.otomatis);
          onChange(ada >= 0 ? daftar.map((x, j) => j === ada ? { ...auto, id: x.id } : x) : [{ ...auto, id: `auto-${Date.now().toString(36)}` }, ...daftar]);
          kabar('Baris otomatis diisi ulang dari Key assumption.');
        }}>Isi otomatis dari Key assumption</button>
        <button className="ghost" disabled={!daftar.length} onClick={() => { onChange(zonasiOtomatis(daftar, at, levelRak)); kabar('Zona diisi otomatis menurut kategori & kelas berat — ubah bila perlu.'); }}>Zonasi otomatis</button>
        <button onClick={tambah}>+ Tambah produk</button>
      </div>
      {pesan && <p className="small" role="status">{pesan}</p>}
      {tempel != null && <div className="card" style={{ background: 'var(--g50, #f8fafc)' }}>
        <label className="f" htmlFor="tempel-produk">Tempel baris dari Excel — urutan kolom: <b>Kode · Nama · UOM · P · L · T (cm) · Berat/UOM (kg) · UPP · Qty</b> · Kategori · Zona (opsional). Baris judul boleh ikut.
          <textarea id="tempel-produk" rows={6} value={tempel} onChange={e => setTempel(e.target.value)} placeholder={'SKU-001\tMie goreng 40x85g\tkarton\t40\t30\t25\t3,6\t60\t1200'} /></label>
        {(() => { const hasil = dariTempel(tempel); return <div className="row">
          <span className="small muted">{hasil.length ? `${hasil.length} produk terbaca` : 'Belum ada baris yang terbaca'}</span>
          <button disabled={!hasil.length} onClick={() => { onChange([...daftar.filter(x => !(x.otomatis && hasil.length)), ...hasil]); setTempel(null); kabar(`${hasil.length} produk ditambahkan${daftar.some(x => x.otomatis) ? ' (baris otomatis diganti data SKU)' : ''}.`); }}>Tambahkan</button>
          <button className="ghost" disabled={!hasil.length} onClick={() => { onChange(hasil); setTempel(null); kabar(`Daftar diganti ${hasil.length} produk.`); }}>Ganti semua</button>
        </div>; })()}
      </div>}

      {/* satu kartu per produk: baris 1 identitas & angka, baris 2 penyimpanan — tanpa geser ke kanan */}
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        {tampil.map(({ x, h, i }) => <div key={x.id} className="card" style={{ margin: 0, padding: 10, background: x.otomatis ? 'var(--info-bg, #eff6ff)' : undefined, borderLeft: `5px solid ${warnaZ.get(x.zona?.trim() || '(tanpa zona)') ?? '#cbd5e1'}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, alignItems: 'end' }}>
            <label style={{ gridColumn: 'span 1' }}>{lab('Kode')}<input aria-label={`Kode ${i + 1}`} value={x.kode} onChange={e => ubah(i, { kode: e.target.value }, false)} style={kecil} /></label>
            <label style={{ gridColumn: 'span 2', minWidth: 200 }}>{lab('Nama produk')}<input aria-label={`Nama ${i + 1}`} value={x.nama} placeholder="Nama produk" onChange={e => ubah(i, { nama: e.target.value }, false)} style={kecil} /></label>
            <label>{lab('UOM')}<input aria-label={`UOM ${i + 1}`} list="dl-uom-produk" value={x.uom} onChange={e => ubah(i, { uom: e.target.value })} style={kecil} /></label>
            <div style={{ gridColumn: 'span 2', minWidth: 200 }}>{lab(`P × L × T (cm)${x.dimEstimasi ? ' · perkiraan dari CBM' : ''}`)}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                {(['p', 'l', 't'] as const).map(k => <Angka key={k} aria-label={`${k.toUpperCase()} ${i + 1} (cm)`} placeholder={k.toUpperCase()} value={x[k]} onValue={v => ubah(i, { [k]: v })}
                  style={{ ...kecil, ...(x.dimEstimasi ? { fontStyle: 'italic', color: 'var(--muted, #64748b)' } : {}) }} />)}</div></div>
            <label>{lab('CBM / UOM')}{x.p > 0 && x.l > 0 && x.t > 0 ? <input readOnly value={h.cbmUnit.toFixed(4)} style={{ ...kecil, background: 'transparent', border: '1px dashed var(--g200, #e2e8f0)' }} aria-label={`CBM ${i + 1}`} />
              : <Angka aria-label={`CBM ${i + 1}`} placeholder="0,04" value={x.cbm ?? 0} onValue={v => ubah(i, { cbm: v })} style={kecil} />}</label>
            <label>{lab('Berat / UOM (kg)')}<Angka aria-label={`Berat ${i + 1}`} value={x.beratKg} onValue={v => ubah(i, { beratKg: v })} style={kecil} /></label>
            <label title="Unit per palet">{lab('UPP (unit/palet)')}<Angka aria-label={`UPP ${i + 1}`} bulat value={x.upp} onValue={v => ubah(i, { upp: v })} style={kecil} /></label>
            <label>{lab(`Qty stok (${x.uom || 'unit'})`)}<Angka aria-label={`Qty ${i + 1}`} bulat value={x.qty} onValue={v => ubah(i, { qty: v })} style={kecil} /></label>
            <div>{lab('Palet · berat/palet')}<b>{angka(h.palet)}</b> plt · <b style={{ color: h.hanyaLantai ? 'var(--bad, #c0392b)' : h.levelMaks < levelRak ? 'var(--warn, #b45309)' : undefined }}>{angka(h.beratPaletKg)} kg</b></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, alignItems: 'end', marginTop: 8 }}>
            <label title="Level rak tertinggi yang boleh dipakai">{lab(`Level maks · ${h.sumberLevel}`)}<select aria-label={`Level maks ${i + 1}`} value={x.levelMaks ?? 0} onChange={e => ubah(i, { levelMaks: Number(e.target.value) || null }, false)} style={kecil}>
              <option value={0}>Auto: {h.levelMaks >= levelRak ? `semua (L1–L${levelRak})` : `L1–L${h.levelMaks}`}</option>
              {Array.from({ length: levelRak }, (_, k) => k + 1).map(l => <option key={l} value={l}>Manual: L1–L{l}</option>)}</select></label>
            <label>{lab('Cara simpan')}<select aria-label={`Cara simpan ${i + 1}`} value={x.simpan ?? 'otomatis'} onChange={e => ubah(i, { simpan: e.target.value as ProdukTender['simpan'] }, false)} style={kecil}>
              {SIMPAN.map(s => <option key={s.v} value={s.v}>{s.v === 'otomatis' ? `Otomatis → ${LABEL_SIMPAN[h.caraSimpan].split(' (')[0]}` : s.l}</option>)}</select></label>
            <label>{lab('Kategori')}<select aria-label={`Kategori ${i + 1}`} value={x.kategori ?? 'Umum'} onChange={e => ubah(i, { kategori: e.target.value }, false)} style={kecil}>
              {Array.from(new Set([...KATEGORI_PRODUK, x.kategori ?? 'Umum'])).map(k => <option key={k}>{k}</option>)}</select></label>
            <label>{lab('Zona')}<input aria-label={`Zona ${i + 1}`} list="dl-zona-produk" value={x.zona ?? ''} onChange={e => ubah(i, { zona: e.target.value }, false)} style={kecil} /></label>
            <div className="small muted">{x.otomatis && <span className="pill info" title="Dari Key assumption — ikut berubah sampai angkanya diedit" style={{ marginRight: 6 }}>otomatis</span>}
              {h.cbmPalet > 0 && <>{h.cbmPalet.toFixed(2)} CBM/plt</>}{h.tinggiMuatanMm > 0 && <> · {h.perLayer}/layer × {h.layer} layer · tinggi {angka(h.tinggiMuatanMm)} mm</>}{(x.isiPcs ?? 0) > 0 && <> · 1 {x.uom} = {angka(x.isiPcs!)} pcs</>}</div>
            <div style={{ textAlign: 'right' }}><button className="danger" onClick={() => hapus(i)} aria-label={`Hapus ${x.nama || x.kode}`}>Hapus</button></div>
          </div>
          {h.peringatan.length > 0 && <div className="small" style={{ color: 'var(--warn, #b45309)', marginTop: 6 }}>{h.peringatan.map(p => <div key={p}>⚠ {p}</div>)}</div>}
        </div>)}
        {!daftar.length && <p className="muted">Belum ada produk. Isi Volume & Parameter muatan di tab Volume untuk baris otomatis, atau tambah / tempel produk.</p>}
      </div>
      {daftar.length > 1 && <p className="small"><b>Total {daftar.length} SKU</b> · {angka(tot.qty)} unit · {angka(tot.palet)} palet · {angka(tot.kg / 1000, 1)} ton · {angka(tot.cbm, 1)} CBM</p>}
      <datalist id="dl-uom-produk">{UOM_PRODUK.map(u => <option key={u} value={u} />)}</datalist>
      <datalist id="dl-zona-produk">{zona.map(z => <option key={z.zona} value={z.zona} />)}</datalist>
    </div>

    <div className="card">
      <h2>Zonasi area</h2>
      <p className="small muted">Produk dengan zona sama dikumpulkan di satu area gudang. Simulasi Warehouse membagi posisi simpan per zona sesuai porsi palet, dan putaway hanya memakai level yang diizinkan untuk tiap SKU.</p>
      {tot.palet > 0 && <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--g200, #e2e8f0)', margin: '6px 0 10px' }} aria-label="Porsi palet per zona">
        {zona.filter(z => z.palet > 0).map(z => <div key={z.zona} title={`${z.zona}: ${angka(z.palet)} palet`} style={{ width: `${(z.palet / tot.palet) * 100}%`, background: warnaZ.get(z.zona), color: '#fff', fontSize: 11, padding: '4px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{z.zona}</div>)}
      </div>}
      <div className="tablewrap"><table>
        <thead><tr><th>Zona</th><th className="num">SKU</th><th className="num">Palet</th><th className="num">% palet</th><th className="num">Berat</th><th className="num">CBM</th><th>Level dipakai</th><th className="num">Palet wajib level 1</th></tr></thead>
        <tbody>{zona.map(z => <tr key={z.zona}>
          <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: warnaZ.get(z.zona), marginRight: 6 }} /><b>{z.zona}</b></td>
          <td className="num">{z.sku}</td><td className="num">{angka(z.palet)}</td><td className="num">{tot.palet ? angka((z.palet / tot.palet) * 100, 1) : 0}%</td>
          <td className="num">{angka(z.kg / 1000, 1)} ton</td><td className="num">{angka(z.cbm, 1)}</td>
          <td>{z.levelMaks >= levelRak ? `L1–L${levelRak}` : z.levelMaks <= 1 ? 'L1 / lantai saja' : `L1–L${z.levelMaks}`}</td>
          <td className="num">{z.paletLevel1 ? <b style={{ color: 'var(--warn, #b45309)' }}>{angka(z.paletLevel1)}</b> : '–'}</td></tr>)}</tbody>
      </table></div>

      <h3>Matriks level rak</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>SKU</th><th className="num">Berat/palet</th>{Array.from({ length: levelRak }, (_, k) => levelRak - k).map(l => <th key={l} className="num">L{l}</th>)}</tr></thead>
        <tbody>{daftar.slice(0, 60).map((x, i) => <tr key={x.id}><td>{x.kode} <span className="muted small">{x.nama}</span></td><td className="num">{angka(hit[i].beratPaletKg)} kg</td>
          {Array.from({ length: levelRak }, (_, k) => levelRak - k).map(l => { const ok = l <= hit[i].levelMaks && !(hit[i].hanyaLantai && l > 1);
            return <td key={l} className="num" style={{ background: ok ? 'rgba(22,163,74,.12)' : 'rgba(220,38,38,.10)', color: ok ? '#166534' : '#991b1b' }}>{ok ? '✓' : '✕'}</td>; })}</tr>)}</tbody>
      </table></div>
      {daftar.length > 60 && <p className="small muted">Menampilkan 60 SKU pertama dari {daftar.length}.</p>}

      {spaceH && <div className="umk-box" style={{ marginTop: 10 }}>
        <div><div className="small muted">Posisi level 1 (rak beam bawah + lantai)</div><b>{angka(posL1)}</b></div>
        <div><div className="small muted">Palet wajib level 1</div><b style={{ color: paletL1 > posL1 ? 'var(--bad, #c0392b)' : undefined }}>{angka(paletL1)}</b></div>
        <div><div className="small muted">Palet wajib lantai (melebihi beam)</div><b style={{ color: paletLantai > posLantai ? 'var(--bad, #c0392b)' : undefined }}>{angka(paletLantai)}</b> <span className="small muted">vs {angka(posLantai)} posisi lantai</span></div>
        <div><div className="small muted">Total palet produk vs posisi</div><b style={{ color: tot.palet > posTotal && posTotal > 0 ? 'var(--bad, #c0392b)' : undefined }}>{angka(tot.palet)} / {angka(posTotal)}</b></div>
        <div className="small muted" style={{ flex: 1, minWidth: 220 }}>
          {paletL1 > posL1 ? <span style={{ color: 'var(--bad, #c0392b)' }}>Posisi level 1 kurang {angka(paletL1 - posL1)} — tambah porsi block/floor atau bay rak di tab Gudang, space & MHE.</span>
            : paletLantai > posLantai ? <span style={{ color: 'var(--bad, #c0392b)' }}>Ada {angka(paletLantai)} palet yang melebihi kapasitas beam — isi porsi Pallet floor / Block stack di Space.</span>
              : 'Kapasitas level 1 cukup untuk produk berat.'}</div>
      </div>}
    </div>

    <div className="card">
      <h2>Aturan berat → level rak</h2>
      <p className="small muted">Berat per palet = UPP × berat per UOM + palet kosong. Barang berat dibatasi ke level bawah (level 1 = lantai / beam terbawah). Jumlah level rak = {levelRak} (dari tab Gudang, space & MHE: tinggi sisi {angka(sx.rak.sideMm)} mm, bukaan produk {angka(sx.rak.productMm)} mm).</p>
      <div className="grid3">
        <Num id="tare" label="Berat palet kosong" suffix="kg" value={at.tarePaletKg} onChange={v => onAturan({ ...at, tarePaletKg: v })} />
        <Num id="kapbeam" label="Kapasitas beam per posisi palet" suffix="kg" value={at.kapPosisiKg} onChange={v => onAturan({ ...at, kapPosisiKg: v })} hint="Di atas ini palet hanya boleh di lantai" />
      </div>
      <div className="tablewrap"><table style={{ maxWidth: 520 }}>
        <thead><tr><th className="num">Berat palet sampai (kg)</th><th>Level tertinggi</th><th /></tr></thead>
        <tbody>{at.batas.map((b, k) => <tr key={k}>
          <td className="num"><Angka aria-label={`Batas berat ${k + 1}`} value={b.kgMaks} onValue={v => onAturan({ ...at, batas: at.batas.map((x, j) => j === k ? { ...x, kgMaks: v } : x) })} style={{ width: 90 }} /></td>
          <td><select aria-label={`Level ${k + 1}`} value={b.levelMaks} onChange={e => onAturan({ ...at, batas: at.batas.map((x, j) => j === k ? { ...x, levelMaks: Number(e.target.value) } : x) })}>
            <option value={99}>Semua level</option>{[1, 2, 3, 4, 5, 6, 7, 8].map(l => <option key={l} value={l}>Maks level {l}</option>)}</select></td>
          <td><button className="danger" onClick={() => onAturan({ ...at, batas: at.batas.filter((_, j) => j !== k) })}>Hapus</button></td></tr>)}
          <tr><td className="num muted">di atas {angka(Math.max(0, ...at.batas.map(b => b.kgMaks)))}</td><td className="muted">Level 1 / lantai saja</td><td /></tr></tbody>
      </table></div>
      <div className="row"><button className="ghost" onClick={() => onAturan({ ...at, batas: [...at.batas, { kgMaks: Math.max(0, ...at.batas.map(b => b.kgMaks)) + 100, levelMaks: 1 }] })}>Tambah batas</button>
        {aturan && <button className="ghost" onClick={() => onAturan(undefined)}>Kembalikan ke default</button>}</div>
    </div>
  </>;
}
