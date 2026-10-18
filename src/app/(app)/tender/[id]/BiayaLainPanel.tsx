'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Bucket, CostLineInput, KategoriRisiko } from '@/lib/engine/types';
import { SEKSI_BIAYA, biayaBulanBaris, hargaUntukMode, seksiDari, type ModeBiaya, type Seksi } from '@/lib/biayaLain';
import { rp } from '@/lib/format';

interface Item { id: number; kategori: string; item: string; satuan: string; harga_beli: number | null; harga_sewa_bulan: number | null; umur_ekonomis_bulan: number | null; status_efektif: string }
export type Baris = CostLineInput & { priceItemId?: number; seksi?: string };

const RISIKO: KategoriRisiko[] = ['Rendah', 'Sedang', 'Tinggi'];
const ALOKASI: Record<string, Partial<Record<Bucket, number>>> = {
  'Merata': { storage: 0.4, handling_in: 0.3, handling_out: 0.3 },
  'Storage': { storage: 1 }, 'Handling in+out': { handling_in: 0.5, handling_out: 0.5 },
  'Inbound': { handling_in: 1 }, 'Outbound': { handling_out: 1 }, 'VAS': { vas: 1 },
};
const namaAlokasi = (a?: Partial<Record<Bucket, number>>) =>
  Object.entries(ALOKASI).find(([, v]) => JSON.stringify(v) === JSON.stringify(a ?? ALOKASI.Merata))?.[0] ?? 'Merata';
const MODE: { v: ModeBiaya; l: string }[] = [{ v: 'bulanan', l: 'Bulanan' }, { v: 'sewa', l: 'Sewa/bln' }, { v: 'beli', l: 'Beli (depresiasi)' }, { v: 'sekali', l: 'Sekali (amortisasi)' }];

/** Satu klasifikasi biaya: tabel sendiri, item hanya dari kategori klasifikasi itu, subtotal per bulan. Di level modul supaya input tidak kehilangan fokus. */
function KartuSeksi({ s, rows, items, kontrak, bunga, onUbah, onUbahBanyak, onHapus, onTambah, extra }: {
  s: Seksi; rows: { b: Baris; i: number }[]; items: Item[]; kontrak: number; bunga: number;
  onUbah: (i: number, patch: Partial<Baris>) => void; onUbahBanyak: (u: { i: number; patch: Partial<Baris> }[]) => void; onHapus: (i: number) => void; onTambah: () => void; extra?: React.ReactNode;
}) {
  const pilihan = s.id === 'lainnya' ? items.filter(x => !SEKSI_BIAYA.some(z => z.kategori.includes(x.kategori)) && !['MHE', 'Racking', 'Gudang', 'IT'].includes(x.kategori))
    : items.filter(x => s.kategori.includes(x.kategori));
  const total = rows.reduce((t, r) => t + biayaBulanBaris(r.b, kontrak, 0).total, 0);
  return (
    <div className="bl-seksi">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>{s.label} <span className="small muted" style={{ fontWeight: 400 }}>· {s.ket}</span></h3>
        <span className="row small">
          {s.mode === 'beli' && rows.some(r => r.b.mode === 'bulanan') && <button className="ghost" onClick={() => onUbahBanyak(rows.filter(r => r.b.mode === 'bulanan').map(r => ({ i: r.i, patch: { mode: 'beli' as ModeBiaya, umurBulan: r.b.umurBulan || 60 } })))}>Semua jadi Beli (depresiasi)</button>}
          <span className="pill info">{rows.length} item · {rp(total)}/bln</span></span>
      </div>
      {extra}
      {rows.length > 0 && <div className="tablewrap"><table>
        <thead><tr><th>Item</th><th>Mode</th><th className="num">Qty</th><th className="num">Harga satuan</th><th className="num">Umur (bln)</th><th className="num">Nilai</th><th className="num">Biaya/bln</th><th>Risiko</th><th>Alokasi</th><th></th></tr></thead>
        <tbody>{rows.map(({ b, i }) => {
          const it = items.find(x => x.id === b.priceItemId);
          const c = biayaBulanBaris(b, kontrak, 0);
          return (
            <tr key={i}>
              <td style={{ minWidth: 260 }}>
                <select aria-label="Item" value={b.priceItemId ?? ''} onChange={e => {
                  const x = items.find(y => y.id === Number(e.target.value));
                  if (!x) { onUbah(i, { priceItemId: undefined }); return; }
                  const mode: ModeBiaya = x.harga_sewa_bulan && !x.harga_beli ? 'sewa' : b.mode;
                  onUbah(i, { priceItemId: x.id, deskripsi: x.item, kelompok: s.kelompok, seksi: s.id, mode, hargaSatuan: hargaUntukMode(x, mode), umurBulan: x.umur_ekonomis_bulan ?? b.umurBulan });
                }}>
                  <option value="">Manual / pilih item {s.label.split(' (')[0]}…</option>
                  {pilihan.map(x => <option key={x.id} value={x.id}>{x.item}{x.status_efektif !== 'approved' ? ` (${x.status_efektif})` : ''}</option>)}
                </select>
                <input aria-label="Deskripsi" value={b.deskripsi} onChange={e => onUbah(i, { deskripsi: e.target.value })} style={{ marginTop: 4 }} placeholder="Deskripsi" />
                {it && <div className="small muted">per {it.satuan}</div>}
                {s.mode === 'beli' && b.mode === 'bulanan' && <div className="small" style={{ color: 'var(--warn)' }}>
                  Aset dengan mode Bulanan → harga dibebankan penuh tiap bulan.{' '}
                  <button className="ghost" style={{ padding: '0 6px' }} onClick={() => onUbah(i, { mode: 'beli', umurBulan: b.umurBulan || it?.umur_ekonomis_bulan || 60, ...(it ? { hargaSatuan: hargaUntukMode(it, 'beli') } : {}) })}>Jadikan Beli</button></div>}
              </td>
              <td><select aria-label="Mode" value={b.mode} style={{ minWidth: 130 }} onChange={e => {
                const mode = e.target.value as ModeBiaya;
                onUbah(i, { mode, ...(it ? { hargaSatuan: hargaUntukMode(it, mode) } : {}), ...(mode === 'beli' && !b.umurBulan ? { umurBulan: it?.umur_ekonomis_bulan ?? 60 } : {}) });
              }}>{MODE.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}</select></td>
              <td className="num"><input aria-label="Qty" type="number" step="any" value={b.qty} onChange={e => onUbah(i, { qty: Number(e.target.value) })} style={{ width: 80, minWidth: 80 }} /></td>
              <td className="num db"><input aria-label="Harga satuan" type="number" value={b.hargaSatuan} onChange={e => onUbah(i, { hargaSatuan: Number(e.target.value) })} style={{ width: 120, minWidth: 120 }} /></td>
              <td className="num"><input aria-label="Umur" type="number" value={b.umurBulan ?? ''} disabled={b.mode !== 'beli'} onChange={e => onUbah(i, { umurBulan: Number(e.target.value) })} style={{ width: 70, minWidth: 70 }} /></td>
              <td className="num">{rp(c.nilai)}</td>
              <td className="num" title={c.bunga ? `pokok ${rp(c.pokok)} (÷ ${c.periode} bln) + bunga modal ${rp(c.bunga)}` : ''}><b>{rp(c.total)}</b></td>
              <td><select aria-label="Risiko" value={b.kategoriRisiko ?? ''} onChange={e => onUbah(i, { kategoriRisiko: (e.target.value || undefined) as KategoriRisiko | undefined })}><option value="">Default</option>{RISIKO.map(r => <option key={r}>{r}</option>)}</select></td>
              <td><select aria-label="Alokasi" value={namaAlokasi(b.alokasi)} onChange={e => onUbah(i, { alokasi: ALOKASI[e.target.value] })}>{Object.keys(ALOKASI).map(k => <option key={k}>{k}</option>)}</select></td>
              <td><button className="danger" onClick={() => onHapus(i)}>Hapus</button></td>
            </tr>);
        })}</tbody>
      </table></div>}
      <div className="row"><button className="ghost" onClick={onTambah}>+ Tambah {s.label.split(' (')[0]}</button></div>
    </div>);
}

export interface StartupAuto { aktif: boolean; persenOpex: number; persenManpower: number }
export default function BiayaLainPanel({ lines, items, kontrakBulan, onChange, startup, onStartup, hasilBaris, onHitung, headcount, hariKerjaBulan }: {
  lines: Baris[]; items: Item[]; kontrakBulan: number; onChange: (l: Baris[]) => void;
  startup: StartupAuto; onStartup: (s: StartupAuto) => void;
  hasilBaris?: { deskripsi: string; biayaBulan: number; dasar: string }[]; onHitung: () => Promise<void> | void; headcount: number; hariKerjaBulan: number;
}) {
  const sb = supabaseBrowser();
  const [bunga, setBunga] = useState(0.1);
  useEffect(() => {
    sb.from('finance_params').select('key, nilai').eq('key', 'bunga_modal_tahun').maybeSingle()
      .then(({ data }: { data: { nilai: number } | null }) => { if (data?.nilai != null) setBunga(Number(data.nilai)); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="tablewrap"><table>
        <thead><tr><th>Item otomatis</th><th className="num">Persen</th><th>Dasar</th><th className="num">Biaya/bln (hasil Hitung)</th></tr></thead>
        <tbody>
          {([['Startup cost', 'persenOpex', 'OPEX per bulan (semua biaya operasi, di luar startup)'], ['Implementation cost', 'persenManpower', 'total biaya manpower per bulan']] as const).map(([nama, k, dasar]) => {
            const h = barisAuto(nama);
            return <tr key={k}><td><b>{nama}</b></td><td className="num">{persenInp(startup[k], v => onStartup({ ...startup, [k]: v }))}%</td>
              <td className="small">{h ? h.dasar : dasar}</td><td className="num">{!startup.aktif ? '–' : h ? <b>{rp(h.biayaBulan)}</b> : <button className="ghost" style={{ padding: '2px 10px' }} disabled={sibuk} onClick={jalankan}>{sibuk ? 'Menghitung…' : 'Hitung sekarang'}</button>}</td></tr>;
          })}
        </tbody></table></div>
      {startup.aktif && (barisAuto('Startup cost') || barisAuto('Implementation cost')) && <div className="row small">
        {basi && <span className="pill warn">persen berubah — angka belum diperbarui</span>}
        <button className="ghost" style={{ padding: '2px 10px' }} disabled={sibuk} onClick={jalankan}>{sibuk ? 'Menghitung…' : 'Hitung ulang'}</button>
        <span className="muted">Angka dari Hitung terakhir; ikut berubah bila biaya lain/manpower berubah.</span></div>}
      {manualDobel.length > 0 && <div className="notice small">Baris manual berikut kemungkinan <b>dobel</b> dengan startup/implementation otomatis:{' '}
        {manualDobel.map(r => <span key={r.i} style={{ marginRight: 8 }}>“{r.b.deskripsi}” <button className="danger" style={{ padding: '0 8px' }} onClick={() => onChange(lines.filter((_, j) => j !== r.i))}>Hapus</button></span>)}</div>}
    </div>);

  // ---- Galon minum bulanan dari headcount ----
  const itGalon = items.find(x => /air minum galon/i.test(x.item));
  const qtyGalon = Math.ceil(headcount * 1.5 * hariKerjaBulan / 19 - 1e-9);
  const iGalon = lines.findIndex(b => itGalon && b.priceItemId === itGalon.id);
  const extraConsumable = itGalon ? (
    <div className="row small">
      {iGalon < 0
        ? <button className="ghost" disabled={headcount <= 0} onClick={() => onChange([...lines, { priceItemId: itGalon.id, deskripsi: itGalon.item, kelompok: 'Consumable', seksi: 'consumable', mode: 'bulanan', qty: qtyGalon, hargaSatuan: Number(itGalon.harga_beli ?? 0) }])}>+ Galon minum bulanan ({qtyGalon} galon)</button>
        : lines[iGalon].qty !== qtyGalon && <button className="ghost" onClick={() => ubah(iGalon, { qty: qtyGalon })}>Sesuaikan galon ke {qtyGalon}</button>}
      <span className="muted">Galon/bln = {headcount} orang × 1,5 L × {hariKerjaBulan} hari ÷ 19 L = {qtyGalon} galon</span>
    </div>) : null;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="tablewrap"><table>
        <thead><tr><th>Ringkasan per klasifikasi</th><th className="num">Item</th><th className="num">Nilai (qty × harga)</th><th className="num">Biaya/bln</th></tr></thead>
        <tbody>
          {ringkas.filter(r => r.n > 0).map(r => <tr key={r.s.id}><td>{r.s.label}</td><td className="num">{r.n}</td><td className="num">{rp(r.nilai)}</td><td className="num">{rp(r.total)}</td></tr>)}
          {ringkas.every(r => r.n === 0) && <tr><td colSpan={4} className="muted">Belum ada biaya lain.</td></tr>}
          <tr style={{ background: 'var(--link)' }}><td colSpan={3}><b>Total biaya lain per bulan</b> <span className="small muted">(beli & sekali = depresiasi/amortisasi selama kontrak {kontrakBulan} bln; tanpa bunga — pilih di tab Interest cost)</span></td><td className="num"><b>{rp(totalBulan)}</b></td></tr>
        </tbody>
      </table></div>
      {perSeksi.map(({ s, rows }) => (
        <KartuSeksi key={s.id} s={s} rows={rows} items={items} kontrak={kontrakBulan} bunga={bunga}
          extra={s.id === 'startup' ? extraStartup : s.id === 'consumable' ? extraConsumable : undefined}
          onUbah={ubah} onUbahBanyak={ubahBanyak} onHapus={i => onChange(lines.filter((_, j) => j !== i))}
          onTambah={() => onChange([...lines, { deskripsi: '', kelompok: s.kelompok, mode: s.mode, qty: 1, hargaSatuan: 0, seksi: s.id, ...(s.mode === 'beli' ? { umurBulan: 60 } : {}) }])} />
      ))}
    </div>);
}
