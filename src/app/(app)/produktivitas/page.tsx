'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MasterTabs from '@/components/MasterTabs';
import { tabProduktivitas } from '@/lib/masterTabs';
import { KATEGORI_BISNIS, KATEGORI_UMUM, kategori as cariKategori } from '@/lib/kategoriBisnis';
import { UOM_MASTER } from '@/lib/uom';

/** Productivity: pilih business category dulu → UoM (pcs, bag, case, pallet, …) → tabel produktivitas kategori itu + General Cargo. */
export default function ProduktivitasPage() {
  return <Suspense fallback={<p className="muted">Memuat…</p>}><Produktivitas /></Suspense>;
}
function Produktivitas() {
  const sp = useSearchParams();
  const [kat, setKat] = useState(KATEGORI_BISNIS[0].nama);
  const [uom, setUom] = useState('');
  // pilihan dari menu (?kategori=…&uom=…) — ikut berubah saat menu diklik lagi
  useEffect(() => {
    const k = sp.get('kategori'); if (k) setKat(cariKategori(k).nama);
    const u = sp.get('uom'); setUom(u ?? '');
  }, [sp]);
  const k = cariKategori(kat);
  const uomAktif = k.uom.includes(uom) ? uom : k.uom[0];
  const simpanUrl = (kk: string, uu: string) => { const u = new URL(window.location.href); u.searchParams.set('kategori', kk); u.searchParams.set('uom', uu); u.searchParams.delete('tab'); window.history.replaceState(window.history.state, '', u.toString()); };
  const nama = (kode: string) => { const m = UOM_MASTER.find(x => x.kode === kode); return m ? m.nama.replace(/ \(.*\)$/, '') : kode; };
  return (<>
    <div className="head">
      <div><div className="eyebrow">Productivity · business category</div><h1>{kat} · {nama(uomAktif)}</h1></div>
      <span className="small muted">Pemilik data: <b>Operations</b>. Approve oleh Solution Design.</span>
    </div>
    <div className="card" style={{ gap: 10 }}>
      <div className="row" style={{ alignItems: 'end', justifyContent: 'space-between' }}>
        <label className="f" style={{ minWidth: 280 }}>Business category
          <select value={kat} onChange={e => { setKat(e.target.value); const u2 = cariKategori(e.target.value).uom[0]; setUom(u2); simpanUrl(e.target.value, u2); }}>
            {KATEGORI_BISNIS.map(x => <option key={x.nama} value={x.nama}>{x.nama}</option>)}
          </select></label>
        <Link className="btn ghost" href="/produktivitas/referensi-uom">UoM & weight class reference</Link>
      </div>
      <p className="small muted">{k.contoh}. {kat === KATEGORI_UMUM ? 'Menampilkan semua baris berlabel General Cargo.' : `Menampilkan produktivitas ${kat} + General Cargo (berlaku semua kategori). Tender dengan industri ${kat} memakai daftar ini.`}</p>
      <div className="tabs" role="tablist" aria-label="Unit of measure">
        {k.uom.map(u => <button key={u} role="tab" aria-selected={u === uomAktif} className={u === uomAktif ? 'on' : ''} onClick={() => { setUom(u); simpanUrl(kat, u); }}>{nama(u)}</button>)}
      </div>
    </div>
    <MasterTabs key={`${kat}|${uomAktif}`} tanpaJudul eyebrow={`Productivity · ${kat}`} judul={`Productivity per ${nama(uomAktif)}`} ids={[]}
      tabsLangsung={[tabProduktivitas([uomAktif], nama(uomAktif), kat)]} />
  </>);
}
