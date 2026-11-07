'use client';
import { Fragment, useState } from 'react';
import { KATEGORI_BISNIS } from '@/lib/kategoriBisnis';
import { KELAS_UMUM, SUMBER_UOM, UOM_MASTER, type KelompokUom } from '@/lib/uom';
import { angka } from '@/lib/format';

const KELOMPOK: KelompokUom[] = ['Each / unit', 'Packaging', 'Liquid & bulk container', 'Unit load', 'Weight', 'Volume', 'Order & transaction'];
const kg = (v: number) => v >= 1000 ? `${angka(v / 1000, v % 1000 ? 1 : 0)} t` : `${angka(v)} kg`;

/** Referensi UoM logistik & kelas berat — sumber drop list tab Produk dan menu Productivity. */
export default function ReferensiUom() {
  const [kat, setKat] = useState('');
  const pakai = kat ? new Set(KATEGORI_BISNIS.find(k => k.nama === kat)?.uom ?? []) : null;
  return (<>
    <div className="head">
      <div><div className="eyebrow">Productivity</div><h1>UoM & weight class reference</h1>
        <p className="small muted">Kode kemasan UN/ECE Rec. 21 · hierarki each → inner → case → pallet · kelas berat untuk cara handling & level rak</p></div>
      <label className="f" style={{ minWidth: 240 }}>Business category
        <select value={kat} onChange={e => setKat(e.target.value)}><option value="">Semua UoM</option>{KATEGORI_BISNIS.map(k => <option key={k.nama}>{k.nama}</option>)}</select></label>
    </div>
    <div className="card">
      <h2>Kelas berat umum (per potong / per unit handling)</h2>
      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>Kelas</th><th className="num">Rentang</th><th>Cara handling</th></tr></thead>
        <tbody>{KELAS_UMUM.map(c => <tr key={c.kode}><td><b>{c.label}</b><div className="small muted">{c.kode}</div></td><td className="num">{kg(c.minKg)} – {kg(c.maxKg)}</td><td className="small">{c.handling}{c.catatan ? ` · ${c.catatan}` : ''}</td></tr>)}</tbody>
      </table></div>
    </div>
    <div className="card">
      <h2>Master UoM {kat && <span className="pill info">{kat}</span>}</h2>
      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>UoM</th><th>Kode UN/ECE</th><th>Keterangan</th><th>Pilihan berat (drop list Produk)</th></tr></thead>
        <tbody>{KELOMPOK.map(g => {
          const rows = UOM_MASTER.filter(u => u.kelompok === g && (!pakai || pakai.has(u.kode)));
          if (!rows.length) return null;
          return <Fragment key={g}>
            <tr className="sp-judul"><td colSpan={4}>{g}</td></tr>
            {rows.map(u => <tr key={u.kode}>
              <td><b>{u.nama}</b><div className="small muted">{u.namaId} · kode <code>{u.kode}</code></div></td>
              <td className="small">{u.unece ?? '—'}</td>
              <td className="small">{u.ket}</td>
              <td className="small">{u.kelas.length ? u.kelas.map(c => <div key={c.kode}><b>{c.label}</b> <span className="muted">· {c.handling}</span></div>) : <span className="muted">—</span>}</td>
            </tr>)}
          </Fragment>;
        })}</tbody>
      </table></div>
    </div>
    <div className="card">
      <h2>Sumber referensi</h2>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{SUMBER_UOM.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.judul}</a></li>)}</ul>
    </div>
  </>);
}
