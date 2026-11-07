'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Bucket, KategoriRisiko } from '@/lib/engine/types';
import { SEKSI_BIAYA, biayaBulanBaris, hargaUntukMode, seksiDari, type ModeBiaya, type Seksi } from '@/lib/biayaLain';
import { rp } from '@/lib/format';
import { biayaLainDefault, kurangDefault, sinkronBiaya, tambahDefault, type BarisBiaya, type DriverBiaya } from '@/lib/biayaLainDefault';

interface Item { id: number; kategori: string; item: string; satuan: string; harga_beli: number | null; harga_sewa_bulan: number | null; umur_ekonomis_bulan: number | null; status_efektif: string }
export type Baris = BarisBiaya;

const RISIKO: KategoriRisiko[] = ['Rendah', 'Sedang', 'Tinggi'];
const ALOKASI: Record<string, Partial<Record<Bucket, number>>> = {
  'Merata': { storage: 0.4, handling_in: 0.3, handling_out: 0.3 },
  'Storage': { storage: 1 }, 'Handling in+out': { handling_in: 0.5, handling_out: 0.5 },
  'Inbound': { handling_in: 1 }, 'Outbound': { handling_out: 1 }, 'VAS': { vas: 1 },
};
const namaAlokasi = (a?: Partial<Record<Bucket, number>>) =>
  Object.entries(ALOKASI).find(([, v]) => JSON.stringify(v) === JSON.stringify(a ?? ALOKASI.Merata))?.[0] ?? 'Merata';
const MODE: { v: ModeBiaya; l: string; t: string }[] = [
  { v: 'bulanan', l: 'Bulanan', t: 'qty × harga dibebankan tiap bulan' }, { v: 'sewa', l: 'Sewa/bln', t: 'harga sewa per bulan' },
  { v: 'beli', l: 'Beli', t: 'aset: depresiasi selama min(umur, kontrak)' }, { v: 'sekali', l: 'Sekali', t: 'biaya sekali: diamortisasi selama kontrak' }];

/** Satu klasifikasi biaya: tabel sendiri, item hanya dari kategori klasifikasi itu, subtotal per bulan. Di level modul supaya input tidak kehilangan fokus. */
function KartuSeksi({ s, rows, items, kontrak, onUbah, onUbahBanyak, onHapus, onTambah, extra, kurang, onTambahDefault, fasilitas }: {
  s: Seksi; rows: { b: Baris; i: number }[]; items: Item[]; kontrak: number;
  onUbah: (i: number, patch: Partial<Baris>) => void; onUbahBanyak: (u: { i: number; patch: Partial<Baris> }[]) => void; onHapus: (i: number) => void; onTambah: () => void; extra?: React.ReactNode;
  kurang: number; onTambahDefault: () => void; fasilitas: { nama: string; m2: number }[];
}) {
  const pilihan = s.id === 'lainnya' ? items.filter(x => !SEKSI_BIAYA.some(z => z.kategori.includes(x.kategori)) && !['MHE', 'Racking', 'Gudang', 'IT'].includes(x.kategori))
    : items.filter(x => s.kategori.includes(x.kategori));
  const total = rows.reduce((t, r) => t + biayaBulanBaris(r.b, kontrak, 0).total, 0);
  const merah = rows.filter(r => r.b.belumDiketahui).length;
  // harga di Price Inquiry berubah sejak item dipilih (atau baris lama yang harganya beda dengan database)
  const hargaBaru = (b: Baris) => { const it = items.find(x => x.id === b.priceItemId); if (!it) return null; const h = hargaUntukMode(it, b.mode); return h > 0 && h !== (b.hargaDb ?? b.hargaSatuan) ? h : null; };
  const basi = rows.filter(r => hargaBaru(r.b) != null);
  // item konstruksi per m²: qty dari luas fasilitas Warehouse Planning yang namanya cocok
  const m2Fasilitas = (nama: string) => {
    const kunci = /office/i.test(nama) ? /office|meeting|control/i : /toilet/i.test(nama) ? /toilet|musholla|locker/i : /vas/i.test(nama) ? /vas|value/i : /cool|chill|frozen/i.test(nama) ? /cool|chill|frozen|cold/i : null;
    return kunci ? fasilitas.filter(f => kunci.test(f.nama)).reduce((t, f) => t + f.m2, 0) : 0;
  };
  return (
    <div className="bl-seksi">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>{s.label} <span className="small muted" style={{ fontWeight: 400 }}>· {s.ket}</span></h3>
        <span className="row small">
          {kurang > 0 && <button className="ghost" onClick={onTambahDefault} title="Tambahkan item rekomendasi yang belum ada di tabel">+ {kurang} item default</button>}
          {basi.length > 0 && <button className="ghost" onClick={() => onUbahBanyak(basi.map(r => { const h = hargaBaru(r.b)!; return { i: r.i, patch: { hargaSatuan: h, hargaDb: h, ...(r.b.hargaDefault != null ? { hargaDefault: h } : {}) } }; }))}>Perbarui {basi.length} harga dari Price Inquiry</button>}
          {s.mode === 'beli' && rows.some(r => r.b.mode === 'bulanan' && !r.b.kunci) && <button className="ghost" onClick={() => onUbahBanyak(rows.filter(r => r.b.mode === 'bulanan' && !r.b.kunci).map(r => ({ i: r.i, patch: { mode: 'beli' as ModeBiaya, umurBulan: r.b.umurBulan || 60 } })))}>Semua jadi Beli (depresiasi)</button>}
          {merah > 0 && <span className="pill bad">{merah} data belum ada</span>}
          <span className="pill info">{rows.length} item · {rp(total)}/bln</span></span>
      </div>
      {extra}
      {rows.length > 0 && <div className="tablewrap fit"><table className="tabel-fit tabel-bl">
        <thead><tr><th>Item & dasar qty</th><th>Mode</th><th className="num">Qty</th><th className="num">Harga satuan</th><th className="num">Umur (bln)</th><th className="num">Biaya/bln</th><th>Risiko · alokasi</th><th></th></tr></thead>
        <tbody>{rows.map(({ b, i }) => {
          const it = items.find(x => x.id === b.priceItemId);
          const c = biayaBulanBaris(b, kontrak, 0);
          const hb = hargaBaru(b);
          return (
            <tr key={i} className={b.belumDiketahui ? 'baris-merah' : undefined}>
              <td>
                <select aria-label="Item" value={b.priceItemId ?? ''} onChange={e => {
                  const x = items.find(y => y.id === Number(e.target.value));
                  if (!x) { onUbah(i, { priceItemId: undefined, kunci: undefined, qtyDefault: undefined, dasar: undefined, belumDiketahui: undefined, hargaDefault: undefined }); return; }
                  const mode: ModeBiaya = x.harga_sewa_bulan && !x.harga_beli ? 'sewa' : b.mode;
                  const h = hargaUntukMode(x, mode);
                  const m2 = /m²|m2/i.test(x.satuan) ? m2Fasilitas(x.item) : 0;
                  onUbah(i, { priceItemId: x.id, deskripsi: x.item, kelompok: s.kelompok, seksi: s.id, mode, hargaSatuan: h, hargaDb: h, umurBulan: x.umur_ekonomis_bulan ?? b.umurBulan,
                    kunci: undefined, qtyDefault: undefined, hargaDefault: undefined, belumDiketahui: undefined,
                    ...(m2 > 0 ? { qty: Math.round(m2), dasar: `qty = luas fasilitas di Warehouse Planning (${Math.round(m2)} m²)` } : { dasar: undefined }) });
                }}>
                  <option value="">Manual / pilih item {s.label.split(' (')[0]}…</option>
                  {b.priceItemId && !it && <option value={b.priceItemId}>{b.deskripsi}</option>}
                  {pilihan.map(x => <option key={x.id} value={x.id}>{x.item}{x.status_efektif !== 'approved' ? ` (${x.status_efektif})` : ''}</option>)}
                </select>
                {!b.priceItemId && <input aria-label="Deskripsi" className="input-kecil" value={b.deskripsi} onChange={e => onUbah(i, { deskripsi: e.target.value })} placeholder="Nama item manual" />}
                {(b.dasar || it) && <div className="dasar-def">{it ? (/^per\b/i.test(it.satuan) ? it.satuan : `per ${it.satuan}`) : ''}{it && b.dasar ? ' · ' : ''}{b.dasar}</div>}
                {b.kunci && b.qtyDefault != null && b.qty !== b.qtyDefault && <div className="dasar-def">qty diubah manual · <button className="link-kecil" onClick={() => onUbah(i, { qty: b.qtyDefault! })}>kembali ke default {b.qtyDefault}</button></div>}
                {hb != null && <div className="dasar-def" style={{ color: 'var(--warn, #b45309)' }}>Harga Price Inquiry sekarang {rp(hb)} · <button className="link-kecil" onClick={() => onUbah(i, { hargaSatuan: hb, hargaDb: hb, ...(b.hargaDefault != null ? { hargaDefault: hb } : {}) })}>pakai harga ini</button></div>}
                {s.mode === 'beli' && b.mode === 'bulanan' && !b.kunci && <div className="dasar-def" style={{ color: 'var(--warn, #b45309)' }}>
                  Aset dengan mode Bulanan → harga dibebankan penuh tiap bulan.{' '}
                  <button className="link-kecil" onClick={() => onUbah(i, { mode: 'beli', umurBulan: b.umurBulan || it?.umur_ekonomis_bulan || 60, ...(it ? { hargaSatuan: hargaUntukMode(it, 'beli') } : {}) })}>Jadikan Beli</button></div>}
              </td>
              <td><select aria-label="Mode" value={b.mode} title={MODE.find(m => m.v === b.mode)?.t} onChange={e => {
                const mode = e.target.value as ModeBiaya;
                const h = it ? hargaUntukMode(it, mode) : undefined;
                onUbah(i, { mode, ...(h != null ? { hargaSatuan: h, hargaDb: h, hargaDefault: undefined } : {}), ...(mode === 'beli' && !b.umurBulan ? { umurBulan: it?.umur_ekonomis_bulan ?? 60 } : {}) });
              }}>{MODE.map(m => <option key={m.v} value={m.v} title={m.t}>{m.l}</option>)}</select></td>
              <td className="num"><input aria-label="Qty" type="number" step="any" value={b.qty} onChange={e => onUbah(i, { qty: Number(e.target.value) })} /></td>
              <td className="num db"><input aria-label="Harga satuan" type="number" value={b.hargaSatuan} onChange={e => onUbah(i, { hargaSatuan: Number(e.target.value) })} /></td>
              <td className="num">{b.mode === 'beli' ? <input aria-label="Umur" type="number" value={b.umurBulan ?? ''} onChange={e => onUbah(i, { umurBulan: Number(e.target.value) })} /> : <span className="small muted">{b.mode === 'sekali' ? kontrak : '–'}</span>}</td>
              <td className="num" title={`nilai ${rp(c.nilai)}${c.periode > 1 ? ` ÷ ${c.periode} bln` : ''}`}><b>{rp(c.total)}</b>{c.periode > 1 && <div className="small muted">nilai {rp(c.nilai)}</div>}</td>
              <td><select aria-label="Risiko" value={b.kategoriRisiko ?? ''} onChange={e => onUbah(i, { kategoriRisiko: (e.target.value || undefined) as KategoriRisiko | undefined })}><option value="">Default</option>{RISIKO.map(r => <option key={r}>{r}</option>)}</select>
                <select aria-label="Alokasi" className="input-kecil" value={namaAlokasi(b.alokasi)} onChange={e => onUbah(i, { alokasi: ALOKASI[e.target.value] })}>{Object.keys(ALOKASI).map(k => <option key={k}>{k}</option>)}</select></td>
              <td><button className="danger" title="Hapus baris" aria-label="Hapus" onClick={() => onHapus(i)}>×</button></td>
            </tr>);
        })}</tbody>
      </table></div>}
      <div className="row"><button className="ghost" onClick={onTambah}>+ Tambah {s.label.split(' (')[0]}</button></div>
    </div>);
}

export interface StartupAuto { aktif: boolean; persenOpex: number; persenManpower: number }
export default function BiayaLainPanel({ lines, items, kontrakBulan, onChange, startup, onStartup, hasilBaris, onHitung, driver, defaultDiisi, onNilaiStok, fasilitas }: {
  lines: Baris[]; items: Item[]; kontrakBulan: number; onChange: (l: Baris[], tandaiDefault?: boolean) => void;
  startup: StartupAuto; onStartup: (s: StartupAuto) => void;
  hasilBaris?: { deskripsi: string; biayaBulan: number; dasar: string }[]; onHitung: () => Promise<void> | void;
  driver: DriverBiaya; defaultDiisi: boolean; onNilaiStok: (v: number) => void; fasilitas: { nama: string; m2: number }[];
}) {
  const katItem = (b: Baris) => items.find(x => x.id === b.priceItemId)?.kategori;
  const perSeksi = SEKSI_BIAYA.map(s => ({ s, rows: lines.map((b, i) => ({ b, i })).filter(r => seksiDari(r.b, katItem(r.b)) === s.id) }));
  const ubahBanyak = (u: { i: number; patch: Partial<Baris> }[]) => onChange(lines.map((b, j) => {
    const p = u.filter(x => x.i === j).reduce((acc, x) => ({ ...acc, ...x.patch }), {} as Partial<Baris>);
    return u.some(x => x.i === j) ? { ...b, ...p, seksi: p.seksi ?? b.seksi ?? seksiDari(b, katItem(b)) } : b;
  }));
  const ubah = (i: number, patch: Partial<Baris>) => ubahBanyak([{ i, patch }]);
  const ringkas = perSeksi.map(({ s, rows }) => {
    const c = rows.map(r => biayaBulanBaris(r.b, kontrakBulan, 0));
    return { s, n: rows.length, nilai: c.reduce((t, x) => t + x.nilai, 0), total: c.reduce((t, x) => t + x.total, 0) };
  });
  const totalBulan = ringkas.reduce((t, r) => t + r.total, 0);

  // ---- Daftar default (rekomendasi) dari data tender: isi otomatis sekali, lalu baris default ikut data tender ----
  const kunciDriver = JSON.stringify(driver);
  const def = useMemo(() => biayaLainDefault(driver, items), [kunciDriver, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const siap = items.length > 0 && (driver.headcount > 0 || driver.luasM2 > 0);
  useEffect(() => {
    if (!siap || !def.length) return;
    if (!lines.length && !defaultDiisi) { onChange(def, true); return; }
    const baru = sinkronBiaya(lines, def);
    if (baru) onChange(baru);
  }, [def, siap, lines]); // eslint-disable-line react-hooks/exhaustive-deps
  const kurangSemua = kurangDefault(lines, def);
  const merahSemua = lines.filter(b => b.belumDiketahui).length;
  const ikut = lines.filter(b => b.kunci && b.qtyDefault != null && b.qty === b.qtyDefault).length;
  const d = driver;
  const dv = (label: string, v: string, kosong: boolean) => <span className={kosong ? 'kosong' : undefined}>{label} <b>{kosong ? 'belum ada' : v}</b></span>;
  const kepala = (
    <div className="notice small" style={{ display: 'grid', gap: 6 }}>
      <div><b>Rekomendasi otomatis</b> — qty dihitung dari data tender, harga dari Price Inquiry. Baris default ikut berubah bila data tender berubah selama qty-nya belum diubah manual; semua baris tetap bisa diubah atau dihapus. Baris <span style={{ color: 'var(--bad)', fontWeight: 600 }}>merah</span> = datanya belum ada (qty 0).</div>
      <div className="def-driver">
        {dv('Manpower', `${d.headcount} orang`, !(d.headcount > 0))}
        {dv('User kantor', `${d.userKantor} (SPV/manager ${d.manajer})`, !(d.userKantor > 0))}
        {dv('Luas', `${Math.round(d.luasM2).toLocaleString('id-ID')} m²`, !(d.luasM2 > 0))}
        {dv('Office', `${Math.round(d.officeM2).toLocaleString('id-ID')} m²`, !(d.officeM2 > 0))}
        {dv('Posisi palet', Math.round(d.posisiPalet).toLocaleString('id-ID'), !(d.posisiPalet > 0))}
        {dv('Palet in/out', `${Math.round(d.paletInBulan).toLocaleString('id-ID')} / ${Math.round(d.paletOutBulan).toLocaleString('id-ID')} per bln`, !(d.paletInBulan + d.paletOutBulan > 0))}
        {dv('Order in/out', `${Math.round(d.orderInBulan).toLocaleString('id-ID')} / ${Math.round(d.orderOutBulan).toLocaleString('id-ID')} per bln`, !(d.orderInBulan + d.orderOutBulan > 0))}
        {dv('Kategori', d.kategori, !d.kategori)}
        {dv('UMK', rp(d.umk), !(d.umk > 0))}
        {dv('Aset gedung', d.skenarioAset, !d.skenarioAset)}
      </div>
      <div className="row">
        {kurangSemua.length > 0 && <button className="ghost" disabled={!items.length} onClick={() => onChange(tambahDefault(lines, def), true)}>Tambahkan {kurangSemua.length} item rekomendasi yang belum ada</button>}
        {ikut > 0 && <span className="pill info">{ikut} baris ikut data tender otomatis</span>}
        {merahSemua > 0 && <span className="pill bad">{merahSemua} baris datanya belum ada</span>}
      </div>
    </div>);

  // ---- Asuransi: nilai stok sebagai dasar premi ----
  const extraAsuransi = (
    <div className="grid-isi">
      <label className="f">Nilai stok rata-rata (Rp)<input type="number" min={0} step={100000000} value={d.nilaiStokRp || ''} placeholder="mis. 25000000000" onChange={e => onNilaiStok(Number(e.target.value) || 0)} /></label>
      <p className="small muted" style={{ margin: 0 }}>Premi = nilai stok (miliar) × tarif per miliar. Tarif default = batas bawah asuransi kebakaran SEOJK 6/SEOJK.05/2017 (gudang umum / 3PL 2,255‰/tahun, kelas konstruksi 1). Ganti item untuk kelas konstruksi / okupasi lain.</p>
    </div>);

  // ---- Startup & implementation otomatis (dihitung mesin saat Hitung) ----
  const barisAuto = (nama: string) => hasilBaris?.find(b => b.deskripsi.startsWith(`${nama} (otomatis) — amortisasi`));
  const manualDobel = lines.map((b, i) => ({ b, i })).filter(r => startup.aktif && /implement|start ?up/i.test(r.b.deskripsi));
  const persenInp = (v: number, on: (n: number) => void) => <input type="number" min={0} step="any" value={Math.round(v * 1000) / 10} disabled={!startup.aktif}
    onChange={e => on(Number(e.target.value) / 100)} style={{ width: 70, minWidth: 70, textAlign: 'right' }} />;
  const [sibuk, setSibuk] = useState(false);
  const jalankan = async () => { setSibuk(true); try { await onHitung(); } finally { setSibuk(false); } };
  // persen berubah sejak Hitung terakhir → angka lama tidak berlaku
  const persenHasil = (nama: string) => Number(barisAuto(nama)?.dasar.match(/^(\d+(?:\.\d+)?)%/)?.[1] ?? NaN) / 100;
  const basi = startup.aktif && ((barisAuto('Startup cost') && Math.abs(persenHasil('Startup cost') - startup.persenOpex) > 1e-6)
    || (barisAuto('Implementation cost') && Math.abs(persenHasil('Implementation cost') - startup.persenManpower) > 1e-6));
  const extraStartup = (
    <div className="bl-auto">
      <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={startup.aktif} onChange={e => onStartup({ ...startup, aktif: e.target.checked })} style={{ width: 'auto' }} /> <b>Hitung otomatis</b> (biaya sekali, diamortisasi {kontrakBulan} bln; bunga hanya lewat tab Interest cost)</label>
      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>Item otomatis</th><th className="num">Persen</th><th>Dasar</th><th className="num">Biaya/bln</th></tr></thead>
        <tbody>
          {([['Startup cost', 'persenOpex', 'OPEX per bulan (semua biaya operasi, di luar startup)'], ['Implementation cost', 'persenManpower', 'total biaya manpower per bulan']] as const).map(([nama, k, dasar]) => {
            const h = barisAuto(nama);
            return <tr key={k}><td><b>{nama}</b></td><td className="num">{persenInp(startup[k], v => onStartup({ ...startup, [k]: v }))}%</td>
              <td className="small">{h ? h.dasar : dasar}</td><td className="num">{!startup.aktif ? '–' : h ? <b>{rp(h.biayaBulan)}</b> : <button className="ghost" style={{ padding: '2px 10px' }} disabled={sibuk} onClick={jalankan}>{sibuk ? 'Menghitung…' : 'Hitung sekarang'}</button>}</td></tr>;
          })}
        </tbody></table></div>
      {startup.aktif && (barisAuto('Startup cost') || barisAuto('Implementation cost')) && <div className="row small">
        {basi ? <><span className="pill warn">persen berubah — angka belum diperbarui</span>
          <button className="ghost" style={{ padding: '2px 10px' }} disabled={sibuk} onClick={jalankan}>{sibuk ? 'Menghitung…' : 'Hitung ulang'}</button></>
          : <span className="muted">Dihitung langsung dari data tender — ikut berubah saat persen, biaya lain atau manpower berubah.</span>}</div>}
      {manualDobel.length > 0 && <div className="notice small">Baris manual berikut kemungkinan <b>dobel</b> dengan startup/implementation otomatis:{' '}
        {manualDobel.map(r => <span key={r.i} style={{ marginRight: 8 }}>“{r.b.deskripsi}” <button className="danger" style={{ padding: '0 8px' }} onClick={() => onChange(lines.filter((_, j) => j !== r.i))}>Hapus</button></span>)}</div>}
    </div>);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {kepala}
      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>Ringkasan per klasifikasi</th><th className="num">Item</th><th className="num">Nilai (qty × harga)</th><th className="num">Biaya/bln</th></tr></thead>
        <tbody>
          {ringkas.filter(r => r.n > 0).map(r => <tr key={r.s.id}><td>{r.s.label}</td><td className="num">{r.n}</td><td className="num">{rp(r.nilai)}</td><td className="num">{rp(r.total)}</td></tr>)}
          {ringkas.every(r => r.n === 0) && <tr><td colSpan={4} className="muted">Belum ada biaya lain.</td></tr>}
          <tr style={{ background: 'var(--link)' }}><td colSpan={3}><b>Total biaya lain per bulan</b> <span className="small muted">(beli & sekali = depresiasi/amortisasi selama kontrak {kontrakBulan} bln; tanpa bunga — pilih di tab Interest cost)</span></td><td className="num"><b>{rp(totalBulan)}</b></td></tr>
        </tbody>
      </table></div>
      {perSeksi.map(({ s, rows }) => (
        <KartuSeksi key={s.id} s={s} rows={rows} items={items} kontrak={kontrakBulan} fasilitas={fasilitas}
          kurang={kurangDefault(lines, def, s.id).length} onTambahDefault={() => onChange(tambahDefault(lines, def, s.id), true)}
          extra={s.id === 'startup' ? extraStartup : s.id === 'asuransi' ? extraAsuransi : undefined}
          onUbah={ubah} onUbahBanyak={ubahBanyak} onHapus={i => onChange(lines.filter((_, j) => j !== i))}
          onTambah={() => onChange([...lines, { deskripsi: '', kelompok: s.kelompok, mode: s.mode, qty: 1, hargaSatuan: 0, seksi: s.id, ...(s.mode === 'beli' ? { umurBulan: 60 } : {}) }])} />
      ))}
    </div>);
}
