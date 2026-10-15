'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ASUMSI_DEFAULT, keInput, muatMaster, type Asumsi, type TenderRow } from '@/lib/tender';
import { hitungTender, type HasilTender, type Arus, type Bucket, type Kelompok, type KategoriRisiko } from '@/lib/engine/index.ts';
import { Num, Pct, Txt, Sel, ubahArray } from '@/components/fields';
import { rp, angka, persen, BUCKET_LABEL, INDUSTRI } from '@/lib/format';
import { useProfile } from '@/lib/useProfile';
import QuotationPanel from './QuotationPanel';
import GudangPicker from './GudangPicker';
import ItPanel from './ItPanel';
import StatusControl from '@/components/StatusControl';
import { labelStatus } from '@/lib/status';
import { IT_SHEET_DEFAULT, ringkasIt } from '@/lib/it';

interface Prod { id: number; aktivitas: string; tahap: string; tool: string; role_name: string; uom: string; kelas_berat: string; industri: string; prod_per_jam: number; status: string; benchmark: Record<string, string> | null }
interface Item { id: number; kategori: string; item: string; satuan: string; harga_beli: number | null; harga_sewa_bulan: number | null; umur_ekonomis_bulan: number | null; daya_watt: number | null; status_efektif: string; mhe_tipe: string | null; kapasitas_ton: number | null; sumber_tenaga: string | null }
interface Tarif { golongan: string; tarif_kwh: number }
interface Jab { role_name: string }

const TABS = ['Key assumption', 'Volume', 'Aktivitas & manpower', 'Gudang, space & MHE', 'IT', 'Biaya lain', 'Hasil', 'Quotation'] as const;
const ARUS: { v: Arus; l: string }[] = [{ v: 'inbound', l: 'Inbound' }, { v: 'outbound', l: 'Outbound' }, { v: 'storage', l: 'Storage (stok)' }, { v: 'vas', l: 'VAS' }];
const UOM = ['palet', 'karton', 'pcs', 'bag', 'ton', 'cbm', 'order', 'line', 'lokasi'];
const KELOMPOK: Kelompok[] = ['IT', 'Office', 'Consumable', 'HSE', 'Asuransi', 'Startup', 'Fasilitas', 'Utilitas', 'Racking', 'Lainnya'];
const RISIKO: KategoriRisiko[] = ['Rendah', 'Sedang', 'Tinggi'];
const ALOKASI: Record<string, Partial<Record<Bucket, number>>> = {
  'Merata': { storage: 0.4, handling_in: 0.3, handling_out: 0.3 },
  'Storage': { storage: 1 }, 'Handling in+out': { handling_in: 0.5, handling_out: 0.5 },
  'Inbound': { handling_in: 1 }, 'Outbound': { handling_out: 1 }, 'VAS': { vas: 1 },
};
const KAT_KE_KELOMPOK: Record<string, Kelompok> = {
  IT: 'IT', Software: 'IT', Office: 'Office', ATK: 'Consumable', 'Rental Office': 'Office', HSE: 'HSE', Konstruksi: 'Startup',
  'Pest Control': 'HSE', Asuransi: 'Asuransi', Palet: 'Consumable', Racking: 'Racking', Security: 'Lainnya', Cleaning: 'Lainnya', Utilitas: 'Utilitas', Gudang: 'Fasilitas', Seragam: 'Consumable', Konsumsi: 'Consumable', Printer: 'Office',
};
const namaAlokasi = (a?: Partial<Record<Bucket, number>>) =>
  Object.entries(ALOKASI).find(([, v]) => JSON.stringify(v) === JSON.stringify(a ?? ALOKASI.Merata))?.[0] ?? 'Merata';

export default function TenderPage() {
  const { id } = useParams<{ id: string }>();
  const sb = supabaseBrowser();
  const { profile } = useProfile();
  const [t, setT] = useState<TenderRow | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Key assumption');
  const [prods, setProds] = useState<Prod[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tarif, setTarif] = useState<Tarif[]>([]);
  const [jabatan, setJabatan] = useState<string[]>([]);
  const [hasil, setHasil] = useState<HasilTender | null>(null);
  const [catatanMaster, setCatatanMaster] = useState<string[]>([]);
  const [pesan, setPesan] = useState<string | null>(null);
  const [kotor, setKotor] = useState(false);

  const muat = useCallback(async () => {
    const [tr, p, it, tf, jb] = await Promise.all([
      sb.from('tenders').select('*').eq('id', id).single(),
      sb.from('productivity').select('id, aktivitas, tahap, tool, role_name, uom, kelas_berat, industri, prod_per_jam, status, benchmark').order('tahap').order('aktivitas'),
      sb.from('price_items_status').select('id, kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, daya_watt, status_efektif, mhe_tipe, kapasitas_ton, sumber_tenaga').order('kategori').order('item'),
      sb.from('electricity_tariffs').select('golongan, tarif_kwh').order('golongan'),
      sb.from('job_levels').select('role_name').order('role_name'),
    ]);
    if (tr.error) { setPesan(tr.error.message); return; }
    const row = tr.data as TenderRow;
    row.asumsi = { ...ASUMSI_DEFAULT, ...(row.asumsi ?? {}) };
    row.asumsi.it = { ...IT_SHEET_DEFAULT, ...(row.asumsi.it ?? {}) };
    setT(row); setProds((p.data ?? []) as Prod[]); setItems((it.data ?? []) as Item[]); setTarif((tf.data ?? []) as Tarif[]);
    setJabatan(((jb.data ?? []) as Jab[]).map(j => j.role_name));
    if (row.hasil) setHasil(row.hasil as HasilTender);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { muat(); }, [muat]);

  const setKol = <K extends keyof TenderRow>(k: K, v: TenderRow[K]) => { setT(x => x && ({ ...x, [k]: v })); setKotor(true); };
  const setA = (patch: Partial<Asumsi>) => { setT(x => x && ({ ...x, asumsi: { ...x.asumsi, ...patch } })); setKotor(true); };

  async function simpan(extra: Partial<TenderRow> = {}) {
    if (!t) return false;
    const { id: _id, updated_at: _u, ...rest } = { ...t, ...extra };
    const { error } = await sb.from('tenders').update(rest).eq('id', t.id);
    if (error) { setPesan(`Gagal menyimpan: ${error.message}`); return false; }
    setKotor(false); setPesan('Tersimpan.'); setTimeout(() => setPesan(null), 2500);
    return true;
  }

  async function hitung() {
    if (!t) return;
    setPesan('Menghitung…');
    const { master, catatan } = await muatMaster(sb, t);
    const h = hitungTender(keInput(t), master);
    for (const c of catatan) h.redFlags.push({ level: 'peringatan', kode: 'MASTER_DATA', pesan: c });
    setHasil(h); setCatatanMaster(catatan); setTab('Hasil'); setPesan(null);
  }

  async function simpanHasil() {
    if (!t || !hasil) return;
    const versi = (t.versi ?? 1) + (t.hasil ? 1 : 0);
    const ok = await simpan({ hasil, status: t.status === 'draft' ? 'dihitung' : t.status, versi } as Partial<TenderRow>);
    if (!ok) return;
    await sb.from('tender_versions').insert({ tender_id: t.id, versi, snapshot: { input: t, hasil }, catatan: `Hitung ulang v${versi}` });
    setT(x => x && ({ ...x, hasil, versi, status: x.status === 'draft' ? 'dihitung' : x.status }));
    setPesan(`Hasil disimpan sebagai versi ${versi}.`);
  }

  const toolsDipakai = useMemo(() => Array.from(new Set((t?.asumsi.aktivitas ?? []).map(a => a.tool).filter(x => x && x !== 'Manual'))), [t]);

  if (!t) return <p className="muted">{pesan ?? 'Memuat tender…'}</p>;
  const a = t.asumsi;

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{t.kode} · v{t.versi} · {labelStatus(t.status)}</div>
          <h1>{t.customer}</h1>
          <p className="muted">{t.kab_kota}, {t.provinsi} · {t.skenario_aset} · {t.jumlah_shift} shift · kontrak {t.durasi_kontrak_bulan} bln</p>
        </div>
        <div className="row">
          {pesan && <span className="small" role="status">{pesan}</span>}
          <button className="ghost" onClick={() => simpan()} disabled={!kotor}>Simpan input</button>
          <button onClick={hitung}>Hitung</button>
        </div>
      </div>
      <StatusControl tender={t} onBerubah={st => setT(x => x && ({ ...x, status: st }))} />

      <div className="tabs" role="tablist">
        {TABS.map(x => <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>{x}</button>)}
      </div>

      {tab === 'Key assumption' && (
        <div className="card">
          <h2>Key assumption</h2>
          <div className="grid3">
            <Txt id="cust" label="Customer" value={t.customer} onChange={v => setKol('customer', v)} />
            <Sel id="ind" label="Industri (benchmark produktivitas)" value={t.industri ?? ''} options={Array.from(new Set(['', ...INDUSTRI, t.industri ?? ''])).map(v => ({ v, l: v || '—' }))} onChange={v => setKol('industri', v || null)} />
            <Txt id="pic" label="PIC / account" value={t.pic ?? ''} onChange={v => setKol('pic', v)} />
            <Txt id="alamat" label="Alamat / site" value={t.alamat_lokasi ?? ''} onChange={v => setKol('alamat_lokasi', v)} />
            <Sel id="skema" label="Skema" value={t.skema} options={[{ v: 'Dedicated', l: 'Dedicated' }, { v: 'Shared', l: 'Shared' }]} onChange={v => setKol('skema', v)} />
            <Sel id="aset" label="Skenario aset" value={t.skenario_aset} options={(['Rental', 'Own Asset', 'Built-to-Suit'] as const).map(v => ({ v, l: v }))} onChange={v => setKol('skenario_aset', v)} />
            <Num id="kontrak" label="Durasi kontrak" suffix="bulan" value={t.durasi_kontrak_bulan} onChange={v => setKol('durasi_kontrak_bulan', v)} />
            <label className="f" htmlFor="golive">Go-live (menentukan tahun kalender & UMK)<input id="golive" type="date" value={t.tanggal_go_live ?? ''} onChange={e => setKol('tanggal_go_live', e.target.value || null)} /></label>
            <Sel id="shift" label="Jumlah shift" value={t.jumlah_shift} options={[1, 2, 3].map(v => ({ v, l: String(v) }))} onChange={v => setKol('jumlah_shift', v)} />
            <Sel id="hk" label="Hari kerja per minggu" value={t.hari_kerja_per_minggu} options={([5, 6, 7] as const).map(v => ({ v, l: `${v} hari` }))} onChange={v => setKol('hari_kerja_per_minggu', v)} />
            <Num id="jk" label="Jam kerja per shift" suffix="jam" value={t.jam_kerja_per_shift} onChange={v => setKol('jam_kerja_per_shift', v)} />
            <Num id="je" label="Jam efektif per shift" suffix="jam" value={t.jam_efektif_per_shift} onChange={v => setKol('jam_efektif_per_shift', v)} hint="Setelah istirahat, briefing, ganti baterai" />
            <Num id="top" label="Payment term" suffix="hari" value={t.payment_term_hari} onChange={v => setKol('payment_term_hari', v)} />
            <Num id="cuti" label="Cuti tahunan per orang" suffix="hari" value={a.cutiTahunanHari} onChange={v => setA({ cutiTahunanHari: v })} hint="Masuk ke faktor pengganti headcount" />
            <Pct id="fp" label="Faktor produktivitas" value={a.faktorProduktivitas} onChange={v => setA({ faktorProduktivitas: v })} />
            <Pct id="ef" label="Efisiensi kerja" value={a.efisiensi} onChange={v => setA({ efisiensi: v })} />
          </div>
        </div>
      )}

      {tab === 'Volume' && (
        <div className="card">
          <h2>Volume</h2>
          <p className="small muted">Sizing memakai <b>peak</b>. Tarif dihitung dari <b>volume komitmen</b> (MGV). Storage diisi jumlah stok (posisi), arus lain per bulan.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Arus</th><th>UoM</th><th className="num">Rata-rata/bln</th><th className="num">Peak/bln</th><th className="num">Komitmen/bln</th><th className="num">Faktor peak</th><th></th></tr></thead>
            <tbody>{a.volumes.map((v, i) => (
              <tr key={i}>
                <td><select aria-label="Arus" value={v.arus} onChange={e => setA({ volumes: ubahArray(a.volumes, i, { arus: e.target.value as Arus }) })}>{ARUS.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select></td>
                <td><select aria-label="UoM" value={v.uom} onChange={e => setA({ volumes: ubahArray(a.volumes, i, { uom: e.target.value }) })}>{UOM.map(u => <option key={u}>{u}</option>)}</select></td>
                {(['rataRataBulan', 'peakBulan', 'komitmenBulan'] as const).map(k => (
                  <td key={k} className="num"><input aria-label={k} type="number" step="any" value={v[k]} onChange={e => setA({ volumes: ubahArray(a.volumes, i, { [k]: Number(e.target.value) }) })} /></td>
                ))}
                <td className="num">{v.rataRataBulan > 0 ? (v.peakBulan / v.rataRataBulan).toFixed(2) + '×' : '—'}</td>
                <td><button className="danger" onClick={() => setA({ volumes: a.volumes.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>))}
            </tbody></table></div>
          <div className="row"><button className="ghost" onClick={() => setA({ volumes: [...a.volumes, { arus: 'vas', uom: 'karton', rataRataBulan: 0, peakBulan: 0, komitmenBulan: 0 }] })}>Tambah baris volume</button></div>
          <h3>Stok untuk tarif storage alternatif</h3>
          <div className="grid3">
            <Num id="ton" label="Stok rata-rata" suffix="ton" value={a.stokTon} onChange={v => setA({ stokTon: v })} />
            <Num id="cbm" label="Stok rata-rata" suffix="CBM" value={a.stokCbm} onChange={v => setA({ stokCbm: v })} />
            <Num id="liter" label="Stok rata-rata" suffix="liter" value={a.stokLiter} onChange={v => setA({ stokLiter: v })} />
          </div>
        </div>
      )}

      {tab === 'Aktivitas & manpower' && (
        <div className="card">
          <h2>Aktivitas (VSM) & manpower</h2>
          <p className="small muted">Pilih aktivitas dari database produktivitas (Operations). Jam per shift = volume peak per shift × % ÷ (produktivitas × faktor) ÷ efisiensi. Headcount = ROUNDUP(jam ÷ jam efektif) × shift × faktor pengganti cuti.</p>
          <TambahAktivitas prods={prods} industri={t.industri} onTambah={p => setA({ aktivitas: [...a.aktivitas, {
            productivityId: p.id, aktivitas: p.aktivitas, tahap: p.tahap, tool: p.tool, roleName: p.role_name, uom: p.uom,
            prodPerJam: Number(p.prod_per_jam), arus: p.tahap.toLowerCase().startsWith('outbound') ? 'outbound' : p.tahap.toLowerCase().startsWith('inventory') ? 'storage' : 'inbound',
            persenVolume: 1, pengaliUom: 1 }] })} />
          <div className="tablewrap"><table>
            <thead><tr><th>Aktivitas</th><th>Tool</th><th>Role</th><th className="num">Prod/jam</th><th>UoM</th><th>Arus</th><th className="num">% volume</th><th className="num">Pengali UoM</th><th></th></tr></thead>
            <tbody>
              {a.aktivitas.length === 0 && <tr><td colSpan={9} className="muted">Belum ada aktivitas. Tambahkan dari daftar di atas.</td></tr>}
              {a.aktivitas.map((x, i) => (
                <tr key={i}>
                  <td>{x.aktivitas}<div className="small muted">{x.tahap}</div></td><td>{x.tool}</td><td>{x.roleName}</td>
                  <td className="num db"><input aria-label="Produktivitas" type="number" step="any" value={x.prodPerJam} onChange={e => setA({ aktivitas: ubahArray(a.aktivitas, i, { prodPerJam: Number(e.target.value) }) })} /></td>
                  <td>{x.uom}</td>
                  <td><select aria-label="Arus" value={x.arus} onChange={e => setA({ aktivitas: ubahArray(a.aktivitas, i, { arus: e.target.value as Arus }) })}>{ARUS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></td>
                  <td className="num"><input aria-label="Persen volume" type="number" step="any" value={+(x.persenVolume * 100).toFixed(2)} onChange={e => setA({ aktivitas: ubahArray(a.aktivitas, i, { persenVolume: Number(e.target.value) / 100 }) })} /></td>
                  <td className="num"><input aria-label="Pengali UoM" type="number" step="any" value={x.pengaliUom} onChange={e => setA({ aktivitas: ubahArray(a.aktivitas, i, { pengaliUom: Number(e.target.value) }) })} title="Mis. 1 palet = 40 karton → 40" /></td>
                  <td><button className="danger" onClick={() => setA({ aktivitas: a.aktivitas.filter((_, j) => j !== i) })}>Hapus</button></td>
                </tr>))}
            </tbody></table></div>
          <h3>Indirect & peran tetap</h3>
          <div className="grid3">
            <Num id="span" label="Span of control" suffix="direct per supervisor" value={a.spanOfControl} onChange={v => setA({ spanOfControl: v })} />
            <Sel id="spv" label="Role supervisor" value={a.roleSupervisor} options={jabatan.map(j => ({ v: j, l: j }))} onChange={v => setA({ roleSupervisor: v })} />
          </div>
          <div className="tablewrap"><table>
            <thead><tr><th>Role</th><th className="num">Headcount</th><th>Alokasi</th><th></th></tr></thead>
            <tbody>{a.peranTetap.map((r, i) => (
              <tr key={i}>
                <td><select aria-label="Role" value={r.roleName} onChange={e => setA({ peranTetap: ubahArray(a.peranTetap, i, { roleName: e.target.value }) })}>{jabatan.map(j => <option key={j}>{j}</option>)}</select></td>
                <td className="num"><input aria-label="Headcount" type="number" min={0} value={r.qty} onChange={e => setA({ peranTetap: ubahArray(a.peranTetap, i, { qty: Number(e.target.value) }) })} /></td>
                <td><select aria-label="Alokasi" value={namaAlokasi(r.alokasi)} onChange={e => setA({ peranTetap: ubahArray(a.peranTetap, i, { alokasi: ALOKASI[e.target.value] }) })}>{Object.keys(ALOKASI).map(k => <option key={k}>{k}</option>)}</select></td>
                <td><button className="danger" onClick={() => setA({ peranTetap: a.peranTetap.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>))}</tbody></table></div>
          <div className="row"><button className="ghost" onClick={() => setA({ peranTetap: [...a.peranTetap, { roleName: jabatan[0] ?? '', qty: 1 }] })}>Tambah peran tetap</button></div>
        </div>
      )}

      {tab === 'Gudang, space & MHE' && (<>
        <GudangPicker provinsi={t.provinsi} terpilih={a.gudang} kebutuhanM2={hasil?.space.totalM2} onPilih={(g, tarifM2) => {
          setKol('warehouse_id', g?.id ?? null);
          setA({ gudang: g, space: { ...a.space, tarifSewaM2Bulan: g ? Math.round(tarifM2) : a.space.tarifSewaM2Bulan } });
        }} />
        <div className="card">
          <h2>Space</h2>
          <div className="grid3">
            <Sel id="metode" label="Metode simpan" value={a.space.metodeSimpan} options={[{ v: 'block', l: 'Block stacking' }, { v: 'spr', l: 'Selective rack' }, { v: 'dd', l: 'Double deep' }, { v: 'shelving', l: 'Shelving' }]} onChange={v => setA({ space: { ...a.space, metodeSimpan: v } })} />
            <Num id="pp" label="Panjang palet" suffix="m" value={a.space.palletPanjangM} onChange={v => setA({ space: { ...a.space, palletPanjangM: v } })} />
            <Num id="pl" label="Lebar palet" suffix="m" value={a.space.palletLebarM} onChange={v => setA({ space: { ...a.space, palletLebarM: v } })} />
            <Num id="lvl" label="Level tumpuk / level rak" value={a.space.levelSimpan} onChange={v => setA({ space: { ...a.space, levelSimpan: v } })} />
            <Pct id="aisle" label="Tambahan area gang" value={a.space.faktorAisle} onChange={v => setA({ space: { ...a.space, faktorAisle: v } })} hint="Terhadap footprint palet; rak selektif ±100%" />
            <Num id="stg" label="Area staging per palet" suffix="m²" value={a.space.stagingM2PerPalet} onChange={v => setA({ space: { ...a.space, stagingM2PerPalet: v } })} />
            <Num id="seq" label="Siklus staging per shift" value={a.space.sequencePerShift} onChange={v => setA({ space: { ...a.space, sequencePerShift: v } })} />
            <Num id="fas" label="Fasilitas (office, charging, toilet)" suffix="m²" value={a.space.fasilitasM2} onChange={v => setA({ space: { ...a.space, fasilitasM2: v } })} />
            <Pct id="allow" label="Allowance (fire lane, kolom)" value={a.space.allowancePersen} onChange={v => setA({ space: { ...a.space, allowancePersen: v } })} />
            <Num id="sewa" label="Tarif sewa gudang" suffix="Rp/m²/bln" value={a.space.tarifSewaM2Bulan} onChange={v => setA({ space: { ...a.space, tarifSewaM2Bulan: v } })} />
            <Num id="rak" label="Harga rak per posisi (beli)" suffix="Rp" value={a.space.hargaRakPerPosisi} onChange={v => setA({ space: { ...a.space, hargaRakPerPosisi: v } })} />
            <Num id="cad" label="Luas layout CAD (cek)" suffix="m²" value={a.space.luasCadM2} onChange={v => setA({ space: { ...a.space, luasCadM2: v } })} />
          </div>
          <h2>MHE</h2>
          <p className="small muted">Unit = ROUNDUP(jam alat per shift ÷ (jam efektif × ketersediaan)) + spare. Alat dipakai bergantian antar shift; operatornya dihitung di manpower. Tool dipakai: {toolsDipakai.join(', ') || '—'}.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Tool (sesuai aktivitas)</th><th>Item harga</th><th>Mode</th><th className="num">Harga</th><th className="num">Umur (bln)</th><th className="num">Ketersediaan %</th><th className="num">Spare %</th><th></th></tr></thead>
            <tbody>{a.mhe.map((m, i) => (
              <tr key={i}>
                <td><input aria-label="Tool" value={m.tool} list="tools" onChange={e => setA({ mhe: ubahArray(a.mhe, i, { tool: e.target.value }) })} /></td>
                <td><select aria-label="Item MHE" value={m.priceItemId ?? ''} onChange={e => {
                  const it = items.find(x => x.id === Number(e.target.value));
                  if (it) setA({ mhe: ubahArray(a.mhe, i, { priceItemId: it.id, nama: it.item, harga: Number((m.mode === 'sewa' ? it.harga_sewa_bulan : it.harga_beli) ?? 0), umurBulan: it.umur_ekonomis_bulan ?? 60 }) });
                }}><option value="">Pilih…</option>{items.filter(x => x.kategori === 'MHE').map(x => <option key={x.id} value={x.id}>{x.mhe_tipe ? `${x.mhe_tipe} ${x.kapasitas_ton ?? ''}T${x.sumber_tenaga ? ' ' + x.sumber_tenaga : ''} · ` : ''}{x.item}{x.status_efektif !== 'approved' ? ` (${x.status_efektif})` : ''}</option>)}</select></td>
                <td><select aria-label="Mode" value={m.mode} onChange={e => {
                  const mode = e.target.value as 'sewa' | 'beli'; const it = items.find(x => x.id === m.priceItemId);
                  setA({ mhe: ubahArray(a.mhe, i, { mode, harga: it ? Number((mode === 'sewa' ? it.harga_sewa_bulan : it.harga_beli) ?? 0) : m.harga }) });
                }}><option value="sewa">Sewa</option><option value="beli">Beli</option></select></td>
                <td className="num db"><input aria-label="Harga" type="number" value={m.harga} onChange={e => setA({ mhe: ubahArray(a.mhe, i, { harga: Number(e.target.value) }) })} /></td>
                <td className="num"><input aria-label="Umur" type="number" value={m.umurBulan ?? ''} onChange={e => setA({ mhe: ubahArray(a.mhe, i, { umurBulan: Number(e.target.value) }) })} /></td>
                <td className="num"><input aria-label="Ketersediaan" type="number" value={+(m.ketersediaan * 100).toFixed(1)} onChange={e => setA({ mhe: ubahArray(a.mhe, i, { ketersediaan: Number(e.target.value) / 100 }) })} /></td>
                <td className="num"><input aria-label="Spare" type="number" value={+(m.sparePersen * 100).toFixed(1)} onChange={e => setA({ mhe: ubahArray(a.mhe, i, { sparePersen: Number(e.target.value) / 100 }) })} /></td>
                <td><button className="danger" onClick={() => setA({ mhe: a.mhe.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>))}</tbody></table></div>
          <datalist id="tools">{toolsDipakai.map(x => <option key={x} value={x} />)}</datalist>
          <div className="row"><button className="ghost" onClick={() => setA({ mhe: [...a.mhe, { tool: toolsDipakai[0] ?? 'CBT', nama: '', mode: 'sewa', harga: 0, ketersediaan: 0.85, sparePersen: 0 }] })}>Tambah MHE</button></div>
        </div>
      </>)}

      {tab === 'IT' && <ItPanel sheet={a.it} onChange={it => setA({ it })} />}

      {tab === 'Biaya lain' && (
        <div className="card">
          <h2>Biaya lain (office, ATK, seragam, konsumsi, HSE, asuransi, pest control, startup)</h2>
          {a.it.lines.length > 0 && <p className="small notice">IT dari tab IT ikut dihitung otomatis: {rp(ringkasIt(a.it).setaraBulan)}/bln + OTC {rp(ringkasIt(a.it).sekali)}. Jangan diinput dua kali di sini.</p>}
          <p className="small muted">Harga ditarik dari database. Mode beli = depresiasi selama min(umur, kontrak) + bunga modal. Sekali = diamortisasi selama kontrak.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Item</th><th>Kelompok</th><th>Mode</th><th className="num">Qty</th><th className="num">Harga satuan</th><th className="num">Umur</th><th>Risiko</th><th>Alokasi</th><th></th></tr></thead>
            <tbody>{a.costLines.map((c, i) => (
              <tr key={i}>
                <td style={{ minWidth: 220 }}>
                  <select aria-label="Item" value={c.priceItemId ?? ''} onChange={e => {
                    const it = items.find(x => x.id === Number(e.target.value)); if (!it) return;
                    const mode = it.harga_sewa_bulan && !it.harga_beli ? 'sewa' : c.mode;
                    setA({ costLines: ubahArray(a.costLines, i, { priceItemId: it.id, deskripsi: it.item, kelompok: KAT_KE_KELOMPOK[it.kategori] ?? 'Lainnya', mode,
                      hargaSatuan: Number((mode === 'sewa' || mode === 'bulanan' ? it.harga_sewa_bulan ?? it.harga_beli : it.harga_beli ?? it.harga_sewa_bulan) ?? 0), umurBulan: it.umur_ekonomis_bulan ?? undefined }) });
                  }}><option value="">Manual / pilih item…</option>{items.filter(x => !['MHE', 'Racking', 'Gudang'].includes(x.kategori)).map(x => <option key={x.id} value={x.id}>{x.kategori} · {x.item}{x.status_efektif !== 'approved' ? ` (${x.status_efektif})` : ''}</option>)}</select>
                  <input aria-label="Deskripsi" value={c.deskripsi} onChange={e => setA({ costLines: ubahArray(a.costLines, i, { deskripsi: e.target.value }) })} style={{ marginTop: 4 }} />
                </td>
                <td><select aria-label="Kelompok" value={c.kelompok} onChange={e => setA({ costLines: ubahArray(a.costLines, i, { kelompok: e.target.value as Kelompok }) })}>{KELOMPOK.map(k => <option key={k}>{k}</option>)}</select></td>
                <td><select aria-label="Mode" value={c.mode} onChange={e => setA({ costLines: ubahArray(a.costLines, i, { mode: e.target.value as 'bulanan' | 'sewa' | 'beli' | 'sekali' }) })}>
                  <option value="bulanan">Bulanan</option><option value="sewa">Sewa/bln</option><option value="beli">Beli</option><option value="sekali">Sekali (startup)</option></select></td>
                <td className="num"><input aria-label="Qty" type="number" step="any" value={c.qty} onChange={e => setA({ costLines: ubahArray(a.costLines, i, { qty: Number(e.target.value) }) })} /></td>
                <td className="num db"><input aria-label="Harga satuan" type="number" value={c.hargaSatuan} onChange={e => setA({ costLines: ubahArray(a.costLines, i, { hargaSatuan: Number(e.target.value) }) })} /></td>
                <td className="num"><input aria-label="Umur" type="number" value={c.umurBulan ?? ''} disabled={c.mode !== 'beli'} onChange={e => setA({ costLines: ubahArray(a.costLines, i, { umurBulan: Number(e.target.value) }) })} /></td>
                <td><select aria-label="Risiko" value={c.kategoriRisiko ?? ''} onChange={e => setA({ costLines: ubahArray(a.costLines, i, { kategoriRisiko: (e.target.value || undefined) as KategoriRisiko | undefined }) })}><option value="">Default</option>{RISIKO.map(r => <option key={r}>{r}</option>)}</select></td>
                <td><select aria-label="Alokasi" value={namaAlokasi(c.alokasi)} onChange={e => setA({ costLines: ubahArray(a.costLines, i, { alokasi: ALOKASI[e.target.value] }) })}>{Object.keys(ALOKASI).map(k => <option key={k}>{k}</option>)}</select></td>
                <td><button className="danger" onClick={() => setA({ costLines: a.costLines.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>))}</tbody></table></div>
          <div className="row"><button className="ghost" onClick={() => setA({ costLines: [...a.costLines, { deskripsi: '', kelompok: 'Lainnya', mode: 'bulanan', qty: 1, hargaSatuan: 0 }] })}>Tambah baris biaya</button></div>

          <h2>Listrik (Engineering)</h2>
          <div className="grid3">
            <label className="f" htmlFor="gol">Golongan tarif
              <select id="gol" value={a.golonganListrik} onChange={e => { const g = tarif.find(x => x.golongan === e.target.value); setA({ golonganListrik: e.target.value, tarifListrikKwh: Number(g?.tarif_kwh ?? a.tarifListrikKwh) }); }}>
                {tarif.map(x => <option key={x.golongan} value={x.golongan}>{x.golongan} — {rp(x.tarif_kwh, 2)}/kWh</option>)}
              </select></label>
          </div>
          <div className="tablewrap"><table>
            <thead><tr><th>Peralatan / titik lampu</th><th className="num">Watt</th><th className="num">Qty</th><th className="num">Jam/hari</th><th className="num">kWh/hari</th><th></th></tr></thead>
            <tbody>{a.listrik.map((l, i) => (
              <tr key={i}>
                <td><input aria-label="Item" value={l.item} onChange={e => setA({ listrik: ubahArray(a.listrik, i, { item: e.target.value }) })} /></td>
                {(['watt', 'qty', 'jamPerHari'] as const).map(k => <td key={k} className="num"><input aria-label={k} type="number" step="any" value={l[k]} onChange={e => setA({ listrik: ubahArray(a.listrik, i, { [k]: Number(e.target.value) }) })} /></td>)}
                <td className="num">{angka(l.watt * l.qty * l.jamPerHari / 1000, 1)}</td>
                <td><button className="danger" onClick={() => setA({ listrik: a.listrik.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>))}</tbody></table></div>
          <div className="row"><button className="ghost" onClick={() => setA({ listrik: [...a.listrik, { item: 'Lampu LED high bay', watt: 100, qty: 1, jamPerHari: 10 }] })}>Tambah titik listrik</button></div>

          <h2>Biaya modal sewa</h2>
          <div className="grid3">
            <Num id="adv" label="Sewa dibayar di muka" suffix="bulan" value={a.advanceSewaBulan} onChange={v => setA({ advanceSewaBulan: v })} />
            <Num id="dep" label="Deposit sewa" suffix="bulan" value={a.depositBulan} onChange={v => setA({ depositBulan: v })} />
          </div>
        </div>
      )}

      {tab === 'Hasil' && <HasilPanel hasil={hasil} catatan={catatanMaster} onSimpan={simpanHasil} onHitung={hitung} />}
      {tab === 'Quotation' && <QuotationPanel tender={t} profile={profile} />}
    </>
  );
}

function TambahAktivitas({ prods, industri, onTambah }: { prods: Prod[]; industri: string | null; onTambah: (p: Prod) => void }) {
  const [q, setQ] = useState('');
  const [pilih, setPilih] = useState('');
  const daftar = prods.filter(p => !q || `${p.tahap} ${p.aktivitas} ${p.tool} ${p.role_name} ${p.uom}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="row">
      <input aria-label="Cari aktivitas" placeholder="Cari aktivitas, tool, role…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 240 }} />
      <select aria-label="Aktivitas" value={pilih} onChange={e => setPilih(e.target.value)} style={{ maxWidth: 460 }}>
        <option value="">Pilih aktivitas ({daftar.length})</option>
        {daftar.map(p => <option key={p.id} value={p.id}>{p.tahap} · {p.aktivitas} · {p.tool} · {p.prod_per_jam} {p.uom}/jam{industri && p.benchmark?.[industri] ? ` · ${industri}: ${p.benchmark[industri]}` : ''}{p.status !== 'approved' ? ' (draft)' : ''}</option>)}
      </select>
      <button disabled={!pilih} onClick={() => { const p = prods.find(x => x.id === Number(pilih)); if (p) { onTambah(p); setPilih(''); } }}>Tambah</button>
    </div>
  );
}

function HasilPanel({ hasil, catatan, onSimpan, onHitung }: { hasil: HasilTender | null; catatan: string[]; onSimpan: () => void; onHitung: () => void }) {
  if (!hasil) return <div className="card"><p>Belum dihitung.</p><div className="row"><button onClick={onHitung}>Hitung sekarang</button></div></div>;
  const h = hasil;
  const kritis = h.redFlags.filter(f => f.level === 'kritis').length;
  return (
    <>
      <div className="kpis">
        <div className="kpi"><span className="small muted">Biaya per bulan</span><b>{rp(h.totalBiayaBulan)}</b></div>
        <div className="kpi"><span className="small muted">Headcount</span><b>{h.totalHeadcount} orang</b></div>
        <div className="kpi"><span className="small muted">Luas gudang</span><b>{angka(h.space.totalM2)} m²</b></div>
        <div className="kpi"><span className="small muted">Investasi</span><b>{rp(h.investasi)}</b></div>
        <div className="kpi"><span className="small muted">GP volume komitmen</span><b>{persen(h.simulasi[0]?.gpPersen)}</b></div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Red flag {kritis > 0 ? <span className="pill bad">{kritis} kritis</span> : <span className="pill ok">tidak ada yang kritis</span>}</h2>
          <div className="row"><button className="ghost" onClick={onHitung}>Hitung ulang</button><button onClick={onSimpan}>Simpan hasil sebagai versi baru</button></div>
        </div>
        {h.redFlags.length === 0 && <p className="muted">Tidak ada red flag.</p>}
        {h.redFlags.map((f, i) => <div key={i} className={`flag ${f.level}`}><b className="small">{f.level.toUpperCase()} · {f.kode}</b><div>{f.pesan}</div></div>)}
        {catatan.length > 0 && <p className="small muted">Catatan master data ikut dimasukkan sebagai red flag MASTER_DATA.</p>}
      </div>

      <div className="card">
        <h2>Rate card</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Layanan</th><th>Satuan</th><th className="num">Volume komitmen</th><th className="num">Biaya/bln</th><th className="num">Biaya/unit</th><th className="num">Margin efektif</th><th className="num">Tarif/unit</th></tr></thead>
          <tbody>{h.rateCard.map(r => (
            <tr key={r.bucket}><td>{BUCKET_LABEL[r.bucket]}</td><td>{r.bucket === 'storage' ? `${r.uom}/bulan` : r.uom}</td><td className="num">{angka(r.volumeKomitmen)}</td>
              <td className="num">{rp(r.biayaBulan)}</td><td className="num">{rp(r.biayaPerUnit)}</td><td className="num">{persen(r.marginEfektif)}</td><td className="num out">{rp(r.tarifPerUnit)}</td></tr>))}</tbody>
        </table></div>
        {h.storageAlternatif.length > 0 && <p className="small">Storage alternatif: {h.storageAlternatif.map(s => `${rp(s.tarif)}/${s.uom}`).join(' · ')}</p>}
        <h3>Simulasi</h3>
        <div className="tablewrap"><table>
          <thead><tr><th>Skenario</th><th className="num">Pendapatan bersih/bln</th><th className="num">Biaya/bln</th><th className="num">GP</th><th className="num">GP%</th></tr></thead>
          <tbody>{h.simulasi.map(s => <tr key={s.skenario}><td>{s.skenario}</td><td className="num">{rp(s.pendapatanBulan)}</td><td className="num">{rp(s.biayaBulan)}</td><td className="num">{rp(s.gp)}</td><td className="num">{persen(s.gpPersen)}</td></tr>)}</tbody>
        </table></div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Kalender & volume desain</h2>
          <table><tbody>
            <tr><td>Hari kerja kalender</td><td className="num">{h.kalender.hariKalenderKerja}</td></tr>
            <tr><td>Libur nasional & cuti bersama di hari kerja</td><td className="num">−{h.kalender.liburDiHariKerja}</td></tr>
            <tr><td><b>Hari operasional gudang</b></td><td className="num"><b>{h.kalender.hariOperasional}</b></td></tr>
            <tr><td>Cuti tahunan per orang</td><td className="num">−{h.kalender.cuti}</td></tr>
            <tr><td>Hari kerja per orang</td><td className="num">{h.kalender.hariKerjaOrang}</td></tr>
            <tr><td>Faktor pengganti</td><td className="num">{h.kalender.faktorPengganti}×</td></tr>
          </tbody></table>
          <table><thead><tr><th>Arus</th><th className="num">Peak/bln</th><th className="num">Faktor peak</th><th className="num">Desain/shift</th></tr></thead>
            <tbody>{h.volume.map((v, i) => <tr key={i}><td>{v.arus} ({v.uom})</td><td className="num">{angka(v.peakBulan)}</td><td className="num">{v.faktorPeak}×</td><td className="num">{angka(v.desainPerShift, 1)}</td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h2>Space</h2>
          <table><tbody>
            <tr><td>Posisi palet desain (peak)</td><td className="num">{angka(h.space.ppDesain)}</td></tr>
            <tr><td>m² per posisi</td><td className="num">{angka(h.space.m2PerPP, 3)}</td></tr>
            <tr><td>Area simpan</td><td className="num">{angka(h.space.storageM2, 1)} m²</td></tr>
            <tr><td>Staging inbound / outbound</td><td className="num">{angka(h.space.stagingInM2, 1)} / {angka(h.space.stagingOutM2, 1)} m²</td></tr>
            <tr><td>Fasilitas</td><td className="num">{angka(h.space.fasilitasM2)} m²</td></tr>
            <tr><td>Allowance</td><td className="num">{angka(h.space.allowanceM2, 1)} m²</td></tr>
            <tr><td><b>Total</b></td><td className="num out">{angka(h.space.totalM2)} m²</td></tr>
          </tbody></table>
        </div>
      </div>

      <div className="card">
        <h2>Manpower</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Role</th><th>Jenis</th><th className="num">Jam/shift</th><th className="num">MP/shift</th><th className="num">Headcount</th><th className="num">Utilisasi</th><th className="num">Upah</th><th className="num">Biaya/org</th><th className="num">Biaya/bln</th></tr></thead>
          <tbody>{h.manpower.map(m => {
            const r = m as typeof m & { upah?: number; total?: number };
            return <tr key={m.roleName + m.jenis}><td>{m.roleName}</td><td>{m.jenis}</td><td className="num">{angka(m.jamPerShift, 2)}</td><td className="num">{m.mpPerShift || '—'}</td>
              <td className="num"><b>{m.headcount}</b></td><td className="num">{m.jenis === 'Direct' ? persen(m.utilisasi, 0) : '—'}</td>
              <td className="num">{rp(r.upah)}</td><td className="num">{rp(r.total)}</td><td className="num">{rp(m.biayaBulan)}</td></tr>;
          })}</tbody>
        </table></div>
        <h3>MHE</h3>
        <table><thead><tr><th>MHE</th><th>Mode</th><th className="num">Jam/shift</th><th className="num">Unit</th></tr></thead>
          <tbody>{h.mhe.map(m => <tr key={m.tool + m.nama}><td>{m.nama} ({m.tool})</td><td>{m.mode}</td><td className="num">{angka(m.jamPerShift, 2)}</td><td className="num"><b>{m.unit}</b>{m.spare ? ` (spare ${m.spare})` : ''}</td></tr>)}</tbody></table>
      </div>

      <div className="card">
        <h2>Rincian biaya per bulan</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Baris</th><th>Kelompok</th><th>Risiko</th><th>Dasar hitung</th><th className="num">Biaya/bln</th></tr></thead>
          <tbody>{h.biaya.map((b, i) => <tr key={i}><td>{b.deskripsi}</td><td>{b.kelompok}</td><td>{b.kategoriRisiko}</td><td className="small muted">{b.dasar}</td><td className="num">{rp(b.biayaBulan)}</td></tr>)}
            <tr><td colSpan={4}><b>Total</b></td><td className="num out">{rp(h.totalBiayaBulan)}</td></tr></tbody>
        </table></div>
      </div>
    </>
  );
}
