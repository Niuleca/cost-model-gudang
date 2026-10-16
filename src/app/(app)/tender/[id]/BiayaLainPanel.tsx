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
function KartuSeksi({ s, rows, items, kontrak, bunga, onUbah, onUbahBanyak, onHapus, onTambah }: {
  s: Seksi; rows: { b: Baris; i: number }[]; items: Item[]; kontrak: number; bunga: number;
  onUbah: (i: number, patch: Partial<Baris>) => void; onUbahBanyak: (u: { i: number; patch: Partial<Baris> }[]) => void; onHapus: (i: number) => void; onTambah: () => void;
}) {
  const pilihan = s.id === 'lainnya' ? items.filter(x => !SEKSI_BIAYA.some(z => z.kategori.includes(x.kategori)) && !['MHE', 'Racking', 'Gudang', 'IT'].includes(x.kategori))
    : items.filter(x => s.kategori.includes(x.kategori));
  const total = rows.reduce((t, r) => t + biayaBulanBaris(r.b, kontrak, bunga).total, 0);
  return (
    <div className="bl-seksi">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>{s.label} <span className="small muted" style={{ fontWeight: 400 }}>· {s.ket}</span></h3>
        <span className="row small">
          {s.mode === 'beli' && rows.some(r => r.b.mode === 'bulanan') && <button className="ghost" onClick={() => onUbahBanyak(rows.filter(r => r.b.mode === 'bulanan').map(r => ({ i: r.i, patch: { mode: 'beli' as ModeBiaya, umurBulan: r.b.umurBulan || 60 } })))}>Semua jadi Beli (depresiasi)</button>}
          <span className="pill info">{rows.length} item · {rp(total)}/bln</span></span>
      </div>
      {rows.length > 0 && <div className="tablewrap"><table>
        <thead><tr><th>Item</th><th>Mode</th><th className="num">Qty</th><th className="num">Harga satuan</th><th className="num">Umur (bln)</th><th className="num">Nilai</th><th className="num">Biaya/bln</th><th>Risiko</th><th>Alokasi</th><th></th></tr></thead>
        <tbody>{rows.map(({ b, i }) => {
          const it = items.find(x => x.id === b.priceItemId);
          const c = biayaBulanBaris(b, kontrak, bunga);
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

export default function BiayaLainPanel({ lines, items, kontrakBulan, onChange }: {
  lines: Baris[]; items: Item[]; kontrakBulan: number; onChange: (l: Baris[]) => void;
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
    const c = rows.map(r => biayaBulanBaris(r.b, kontrakBulan, bunga));
    return { s, n: rows.length, nilai: c.reduce((t, x) => t + x.nilai, 0), total: c.reduce((t, x) => t + x.total, 0) };
  });
  const totalBulan = ringkas.reduce((t, r) => t + r.total, 0);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="tablewrap"><table>
        <thead><tr><th>Ringkasan per klasifikasi</th><th className="num">Item</th><th className="num">Nilai (qty × harga)</th><th className="num">Biaya/bln</th></tr></thead>
        <tbody>
          {ringkas.filter(r => r.n > 0).map(r => <tr key={r.s.id}><td>{r.s.label}</td><td className="num">{r.n}</td><td className="num">{rp(r.nilai)}</td><td className="num">{rp(r.total)}</td></tr>)}
          {ringkas.every(r => r.n === 0) && <tr><td colSpan={4} className="muted">Belum ada biaya lain.</td></tr>}
          <tr style={{ background: 'var(--link)' }}><td colSpan={3}><b>Total biaya lain per bulan</b> <span className="small muted">(beli & sekali sudah termasuk depresiasi/amortisasi + bunga modal {(bunga * 100).toFixed(1)}%/thn, kontrak {kontrakBulan} bln)</span></td><td className="num"><b>{rp(totalBulan)}</b></td></tr>
        </tbody>
      </table></div>
      {perSeksi.map(({ s, rows }) => (
        <KartuSeksi key={s.id} s={s} rows={rows} items={items} kontrak={kontrakBulan} bunga={bunga}
          onUbah={ubah} onUbahBanyak={ubahBanyak} onHapus={i => onChange(lines.filter((_, j) => j !== i))}
          onTambah={() => onChange([...lines, { deskripsi: '', kelompok: s.kelompok, mode: s.mode, qty: 1, hargaSatuan: 0, seksi: s.id, ...(s.mode === 'beli' ? { umurBulan: 60 } : {}) }])} />
      ))}
    </div>);
}
