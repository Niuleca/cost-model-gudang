'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { adaHarga, fotoUrl, gmapsLink, kedaluwarsa, sewaBulanPenuh, tarifM2, type Warehouse } from '@/lib/warehouse';
import type { GudangTerpilih } from '@/lib/tender';
import { angka, rp } from '@/lib/format';

/** Pilih gudang dari master Procurement; tarif sewa & luas tersedia ikut ke perhitungan space. */
export default function GudangPicker({ provinsi, terpilih, kebutuhanM2, onPilih }: {
  provinsi: string; terpilih: GudangTerpilih | null | undefined; kebutuhanM2?: number;
  onPilih: (g: GudangTerpilih | null, tarifM2: number) => void;
}) {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<Warehouse[]>([]);
  const [semua, setSemua] = useState(false);
  useEffect(() => {
    sb.from('warehouses').select('*').order('provinsi').order('kab_kota').then(({ data }: { data: unknown }) => setRows((data ?? []) as Warehouse[]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const daftar = useMemo(() => rows.filter(w => semua || w.provinsi === provinsi), [rows, semua, provinsi]);

  const pilih = (w: Warehouse, sewaUtuh: boolean) => onPilih({
    id: w.id, nama: w.nama, alamat: w.alamat, kab_kota: w.kab_kota, provinsi: w.provinsi, gmaps_url: gmapsLink(w),
    luas_m2: Number(w.luas_m2), harga_sewa_m2_bulan: w.harga_sewa_m2_bulan, harga_per_bulan: w.harga_per_bulan,
    tinggi_bersih_m: w.tinggi_bersih_m, jumlah_dock: w.jumlah_dock, tipe: w.tipe, foto: w.foto ?? [], sewaUtuh,
  }, tarifM2(w));

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Gudang</h2>
        <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={semua} onChange={e => setSemua(e.target.checked)} style={{ width: 'auto' }} />Tampilkan semua provinsi</label>
      </div>
      {terpilih ? (
        <div className="notice row" style={{ justifyContent: 'space-between' }}>
          <div>
            <b>{terpilih.nama}</b> · {terpilih.kab_kota} · {angka(terpilih.luas_m2)} m² · {terpilih.sewaUtuh ? `disewa utuh ${rp(terpilih.harga_per_bulan ?? (terpilih.harga_sewa_m2_bulan ?? 0) * terpilih.luas_m2)}/bln` : `per m² ${rp(terpilih.harga_sewa_m2_bulan ?? (terpilih.harga_per_bulan ?? 0) / terpilih.luas_m2)}`}
            {kebutuhanM2 ? <span className={`pill ${kebutuhanM2 > terpilih.luas_m2 ? 'bad' : 'ok'}`} style={{ marginLeft: 8 }}>kebutuhan {angka(kebutuhanM2)} m²</span> : null}
            <div className="small"><a href={terpilih.gmaps_url ?? '#'} target="_blank" rel="noreferrer">Buka di Google Maps</a></div>
          </div>
          <button className="ghost" onClick={() => onPilih(null, 0)}>Lepas gudang</button>
        </div>
      ) : <p className="small muted">Belum memilih gudang. Pilih dari master Procurement agar tarif sewa dan luas tersedia tercatat sumbernya, atau isi tarif sewa manual di bawah.</p>}
      {daftar.length === 0 && <p className="small muted">Tidak ada gudang di master untuk {semua ? 'semua provinsi' : provinsi}.</p>}
      <div className="grid3">
        {daftar.map(w => (
          <div key={w.id} className="card" style={{ padding: 10, gap: 6, borderColor: terpilih?.id === w.id ? 'var(--floor)' : undefined }}>
            {w.foto?.[0] ? <img src={fotoUrl(sb, w.foto[0])} alt={`Foto ${w.nama}`} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} />
              : <div className="muted small" style={{ aspectRatio: '16/9', display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}>Belum ada foto</div>}
            <b>{w.nama}</b>
            <span className="small muted">{w.kab_kota}, {w.provinsi} · {w.tipe}</span>
            <span className="small">{angka(w.luas_m2)} m² · {adaHarga(w) ? `${rp(tarifM2(w))}/m²/bln · ${rp(sewaBulanPenuh(w))}/bln utuh` : 'harga belum ada'}</span>
            <span className="small">
              <span className={`pill ${w.status === 'approved' && !kedaluwarsa(w) ? 'ok' : 'warn'}`}>{kedaluwarsa(w) ? 'expired' : w.status}</span>{' '}
              <a href={gmapsLink(w)} target="_blank" rel="noreferrer">Maps</a>
            </span>
            <div className="row">
              <button className="ghost" onClick={() => pilih(w, false)} disabled={!adaHarga(w)}>Pakai per m²</button>
              <button className="ghost" onClick={() => pilih(w, true)} disabled={!adaHarga(w)}>Sewa utuh</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
