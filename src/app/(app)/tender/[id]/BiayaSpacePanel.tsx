'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { RakHarga, SpaceInput } from '@/lib/engine/types';
import type { GudangTerpilih } from '@/lib/tender';
import { useBungaModal } from '@/lib/useBungaModal';
import { rp, angka } from '@/lib/format';

interface Item { id: number; kategori: string; item: string; satuan: string; harga_beli: number | null; umur_ekonomis_bulan: number | null; status_efektif: string }
interface WhLive { harga_sewa_m2_bulan: number | null; harga_per_bulan: number | null; luas_m2: number }

const tarifGudang = (g: { harga_sewa_m2_bulan: number | null; harga_per_bulan: number | null; luas_m2: number }) =>
  Math.round(Number(g.harga_sewa_m2_bulan ?? (g.harga_per_bulan ?? 0) / Math.max(1, Number(g.luas_m2))));
const cocok = (jenis: 'spr' | 'ddr', x: Item) => jenis === 'spr' ? /selective|\bspr\b/i.test(x.item) : /double deep|\bddr\b/i.test(x.item);

/** Biaya space & racking, terhubung ke database (gudang terpilih, Price Inquiry Racking) dan sheet Space (Space Rent, posisi SPR/DDR). */
export default function BiayaSpacePanel({ space, gudang, items, spaceRentM2, posSpr, posDdr, posBlock, posFloor, skenarioAset, kontrakBulan, onSpace, onGudang }: {
  space: SpaceInput; gudang: GudangTerpilih | null | undefined; items: Item[];
  spaceRentM2: number; posSpr: number; posDdr: number; posBlock: number; posFloor: number;
  skenarioAset: string; kontrakBulan: number;
  onSpace: (s: SpaceInput) => void; onGudang: (g: GudangTerpilih) => void;
}) {
  const bunga = useBungaModal();
  const rakItems = items.filter(x => x.kategori === 'Racking');
  const [live, setLive] = useState<WhLive | null>(null);
  useEffect(() => {
    if (!gudang?.id) { setLive(null); return; }
    supabaseBrowser().from('warehouses').select('harga_sewa_m2_bulan, harga_per_bulan, luas_m2').eq('id', gudang.id).maybeSingle()
      .then(({ data }: { data: WhLive | null }) => setLive(data));
  }, [gudang?.id]);

  // Rak belum diisi & tidak ada harga lama → isi otomatis dari Price Inquiry (Selective → SPR, Double Deep → DDR)
  useEffect(() => {
    if (space.rak || (space.hargaRakPerPosisi ?? 0) > 0 || !rakItems.length) return;
    const isi = (j: 'spr' | 'ddr'): RakHarga | undefined => { const x = rakItems.find(y => cocok(j, y)); return x ? { priceItemId: x.id, nama: x.item, harga: Number(x.harga_beli ?? 0), umurBulan: x.umur_ekonomis_bulan ?? 120 } : undefined; };
    onSpace({ ...space, rak: { spr: isi('spr'), ddr: isi('ddr') } });
  }, [rakItems.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const rental = skenarioAset === 'Rental';
  const tarifDb = gudang ? tarifGudang(live ?? gudang) : null;
  const pakaiDb = !!gudang && !space.tarifManual;
  const tarif = pakaiDb ? tarifDb! : space.tarifSewaM2Bulan;
  const sewaUtuh = !!gudang?.sewaUtuh;
  const sewaUtuhNilai = gudang ? Number((live ?? gudang).harga_per_bulan ?? tarifGudang(live ?? gudang) * Number((live ?? gudang).luas_m2)) : 0;
  const sewaBulan = !rental ? 0 : sewaUtuh ? sewaUtuhNilai : spaceRentM2 * tarif;
  const dbBerubah = !!gudang && !!live && (Number(live.harga_sewa_m2_bulan ?? 0) !== Number(gudang.harga_sewa_m2_bulan ?? 0) || Number(live.harga_per_bulan ?? 0) !== Number(gudang.harga_per_bulan ?? 0));

  const rakLama: RakHarga = { harga: space.hargaRakPerPosisi ?? 0, umurBulan: space.umurRakBulan ?? 120 };
  const setRak = (j: 'spr' | 'ddr', patch: Partial<RakHarga>) => {
    const cur = space.rak?.[j] ?? rakLama;
    onSpace({ ...space, rak: { spr: space.rak?.spr ?? rakLama, ddr: space.rak?.ddr ?? rakLama, [j]: { ...cur, ...patch } } });
  };
  const n = Math.max(1, kontrakBulan), r = bunga / 12;
  const baris = ([['spr', 'SPR · Selective Pallet Rack', posSpr], ['ddr', 'DDR · Double Deep Rack', posDdr]] as const).map(([j, l, pos]) => {
    const h = space.rak?.[j] ?? rakLama;
    const it = rakItems.find(x => x.id === h.priceItemId);
    const nilai = pos * (h.harga || 0), periode = Math.min(Math.max(1, h.umurBulan || n), n);
    const bulan = nilai > 0 ? nilai / periode + (nilai / 2) * r : 0;
    const beda = it && Number(it.harga_beli ?? 0) !== h.harga;
    return { j, l, pos, h, it, nilai, bulan, beda };
  });
  const totalRak = baris.reduce((t, b) => t + b.bulan, 0), investasi = baris.reduce((t, b) => t + b.nilai, 0);

  return (
    <div className="card" style={{ gap: 10, padding: 12 }}>
      <h3>Biaya space & racking</h3>

      <table className="sp-tabel sp-kecil"><tbody>
        <tr className="sp-judul"><td colSpan={3}>Sewa gudang {rental ? '' : `· tidak dipakai (skenario ${skenarioAset})`}</td></tr>
        <tr><td>Gudang (database)</td><td colSpan={2}>{gudang ? <><b>{gudang.nama}</b> <span className="small muted">· {gudang.kab_kota} · {angka(Number(gudang.luas_m2))} m²</span></> : <span className="small muted">Belum dipilih — pilih di daftar gudang di atas, atau isi tarif manual</span>}</td></tr>
        <tr><td>Luas sewa (Space Rent dari sheet Space)</td><td className="num"><b>{angka(spaceRentM2)}</b></td><td>m²</td></tr>
        {sewaUtuh
          ? <tr><td>Disewa utuh (harga database)</td><td className="num">{rp(sewaUtuhNilai)}</td><td>/bln</td></tr>
          : <tr><td>Tarif sewa {pakaiDb ? <span className="pill ok">database</span> : <span className="pill warn">manual</span>}</td>
            <td className="num">{pakaiDb ? rp(tarif)
              : <input aria-label="Tarif sewa manual" type="number" value={space.tarifSewaM2Bulan} onChange={e => onSpace({ ...space, tarifSewaM2Bulan: Number(e.target.value) })} style={{ width: 110, minWidth: 110, textAlign: 'right', background: 'var(--input)' }} />}</td>
            <td className="small">/m²/bln {gudang && <button className="ghost" style={{ padding: '0 6px' }} onClick={() => onSpace({ ...space, tarifManual: !space.tarifManual, tarifSewaM2Bulan: space.tarifManual ? tarifDb ?? 0 : space.tarifSewaM2Bulan || tarifDb || 0 })}>{pakaiDb ? 'Ubah manual' : 'Pakai database'}</button>}</td></tr>}
        {dbBerubah && <tr><td colSpan={3}><span className="pill warn">Harga gudang di database sudah berubah</span>{' '}
          <button className="ghost" style={{ padding: '0 6px' }} onClick={() => gudang && live && onGudang({ ...gudang, harga_sewa_m2_bulan: live.harga_sewa_m2_bulan, harga_per_bulan: live.harga_per_bulan, luas_m2: Number(live.luas_m2) })}>Perbarui</button></td></tr>}
        <tr className="sp-rent"><td>Sewa gudang per bulan</td><td className="num">{rp(sewaBulan)}</td><td>/bln</td></tr>
      </tbody></table>

      <table className="sp-tabel sp-kecil"><tbody>
        <tr className="sp-judul"><td>Racking (Price Inquiry · posisi dari sheet Space)</td><td className="num">Posisi</td><td>Biaya/bln</td></tr>
        {baris.map(b => (
          <tr key={b.j}><td colSpan={3} style={{ padding: 0 }}>
            <div className="bs-rak">
              <div><b>{b.l}</b> <span className="small muted">· {angka(b.pos)} posisi</span></div>
              {b.pos > 0 ? <>
                <select aria-label={`Item rak ${b.j}`} value={b.h.priceItemId ?? ''} onChange={e => {
                  const x = rakItems.find(y => y.id === Number(e.target.value));
                  setRak(b.j, x ? { priceItemId: x.id, nama: x.item, harga: Number(x.harga_beli ?? 0), umurBulan: x.umur_ekonomis_bulan ?? 120 } : { priceItemId: undefined, nama: undefined });
                }}>
                  <option value="">Manual (tanpa item database)</option>
                  {rakItems.map(x => <option key={x.id} value={x.id}>{x.item} · {rp(x.harga_beli ?? 0)}/{x.satuan}{x.status_efektif !== 'approved' ? ` (${x.status_efektif})` : ''}</option>)}
                </select>
                <div className="row small">
                  <label>Harga/posisi <input type="number" value={b.h.harga} onChange={e => setRak(b.j, { harga: Number(e.target.value) })} style={{ width: 110, minWidth: 110, textAlign: 'right', background: 'var(--input)' }} /></label>
                  <label>Umur <input type="number" value={b.h.umurBulan} onChange={e => setRak(b.j, { umurBulan: Number(e.target.value) })} style={{ width: 64, minWidth: 64, textAlign: 'right', background: 'var(--input)' }} /> bln</label>
                  {b.beda && <button className="ghost" style={{ padding: '0 6px' }} onClick={() => setRak(b.j, { harga: Number(b.it!.harga_beli ?? 0), umurBulan: b.it!.umur_ekonomis_bulan ?? b.h.umurBulan })}>Samakan dengan database ({rp(b.it!.harga_beli ?? 0)})</button>}
                </div>
                <div className="small muted">Investasi {rp(b.nilai)} · depresiasi {Math.min(Math.max(1, b.h.umurBulan || n), n)} bln + bunga → <b>{rp(b.bulan)}/bln</b></div>
              </> : <div className="small muted">Tidak ada posisi {b.j.toUpperCase()} (porsi 0% di sheet Space)</div>}
            </div>
          </td></tr>))}
        {(posBlock > 0 || posFloor > 0) && <tr><td>Block stack / pallet floor</td><td className="num">{angka(posBlock + posFloor)}</td><td className="small muted">tanpa rak</td></tr>}
        <tr className="sp-rent"><td>Racking per bulan <span className="small">(investasi {rp(investasi)})</span></td><td></td><td className="num">{rp(totalRak)}</td></tr>
      </tbody></table>
      <p className="small muted">Bunga modal {(bunga * 100).toFixed(1)}%/thn atas rata-rata nilai buku; depresiasi selama min(umur, kontrak {kontrakBulan} bln) — sama dengan tab Hasil.</p>
    </div>);
}
