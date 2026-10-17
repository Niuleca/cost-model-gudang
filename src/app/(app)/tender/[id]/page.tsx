'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTabUrl } from '@/lib/useTabUrl';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ASUMSI_DEFAULT, STARTUP_DEFAULT, PAJAK_DEFAULT, keInput, muatMaster, type Asumsi, type TenderRow } from '@/lib/tender';
import { hitungTender, type HasilTender, type Arus, type Bucket, type Kelompok, type KategoriRisiko } from '@/lib/engine/index.ts';
import { Num, Pct, Txt, Sel, ubahArray } from '@/components/fields';
import { rp, angka, persen, BUCKET_LABEL, INDUSTRI } from '@/lib/format';
import { faktorUom, pengaliEfektif } from '@/lib/engine/types';
import ProfilVolumePanel from './ProfilVolumePanel';
import { useProfile } from '@/lib/useProfile';
import QuotationPanel from './QuotationPanel';
import GudangPicker from './GudangPicker';
import ItPanel from './ItPanel';
import BiayaLainPanel from './BiayaLainPanel';
import HapusTender from './HapusTender';
import ListrikTender from './ListrikTender';
import ProcessDesignPanel from './ProcessDesignPanel';
import SpacePanel from './SpacePanel';
import MhePanel from './MhePanel';
import BiayaSpacePanel from './BiayaSpacePanel';
import { hitungSpaceExcel, lengkapiSpaceExcel } from '@/lib/engine/space';
import { hitungProcessDesign, PD_DEFAULT } from '@/lib/engine/processDesign';
import HistorisPanel from './HistorisPanel';
import HasilKomersial, { type Kurs, type Pajak } from './HasilKomersial';
import StatusControl from '@/components/StatusControl';
import { labelStatus, STATUS_DRAFT } from '@/lib/status';
import { IT_SHEET_DEFAULT, ringkasIt } from '@/lib/it';

interface Prod { id: number; aktivitas: string; tahap: string; tool: string; role_name: string; uom: string; kelas_berat: string; industri: string; prod_per_jam: number; status: string; benchmark: Record<string, string> | null }
interface Item { id: number; kategori: string; item: string; satuan: string; harga_beli: number | null; harga_sewa_bulan: number | null; umur_ekonomis_bulan: number | null; daya_watt: number | null; status_efektif: string; mhe_tipe: string | null; kapasitas_ton: number | null; sumber_tenaga: string | null }
interface Tarif { golongan: string; tarif_kwh: number }
interface Jab { role_name: string }

const TAB_EXCEL = 'Data project (Excel)' as const;
const TABS = ['Key assumption', 'Volume', 'Aktivitas & manpower', 'Gudang, space & MHE', 'IT', 'Biaya lain', 'Hasil', 'Quotation'] as const;
const ARUS: { v: Arus; l: string }[] = [{ v: 'inbound', l: 'Inbound' }, { v: 'outbound', l: 'Outbound' }, { v: 'storage', l: 'Storage (stok)' }, { v: 'vas', l: 'VAS' }];
const TOOLS = ['Manual', 'FL Counter Balance', 'FL Reach Truck SPR', 'FL Reach Truck DD', 'CBT', 'RT', 'Pallet Mover', 'Hand Pallet', 'Trolley', 'PC', 'Laptop', 'HT', 'Printer', 'Scanner RDT', 'RF', 'Wrapping Machine'];
const UOM_ISI = ['case', 'karton', 'dus', 'inner', 'bag', 'sak', 'pack', 'pail', 'pcs', 'botol', 'kaleng', 'sachet', 'unit', 'kg', 'liter'];
const UOM = ['palet', 'case', 'karton', 'pcs', 'bag', 'ton', 'cbm', 'liter', 'pail', 'pack', 'roll', 'order', 'line', 'lokasi'];
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
/** Input daftar alat dipisah koma (datalist equipment). Di level modul supaya fokus tidak hilang. */
function AlatInput({ value, onChange, ...rest }: { value: string[]; onChange: (v: string[]) => void; id?: string; 'aria-label'?: string }) {
  return <input {...rest} list="dl-tool" placeholder="mis. PC, HT" value={value.join(', ')} style={{ minWidth: 160 }}
    onChange={e => onChange(e.target.value.split(',').map(x => x.trimStart()))}
    onBlur={e => onChange(e.target.value.split(',').map(x => x.trim()).filter(Boolean))} />;
}
/** Isi satu baris aktivitas dari database produktivitas (dipakai saat tambah & saat ganti pilihan aktivitas). */
const dariProd = (p: Prod) => ({ productivityId: p.id, aktivitas: p.aktivitas, tahap: p.tahap, tool: p.tool, roleName: p.role_name, uom: p.uom,
  prodPerJam: Number(p.prod_per_jam), arus: (p.tahap.toLowerCase().startsWith('outbound') ? 'outbound' : p.tahap.toLowerCase().startsWith('inventory') ? 'storage' : 'inbound') as Arus });
const namaAlokasi = (a?: Partial<Record<Bucket, number>>) =>
  Object.entries(ALOKASI).find(([, v]) => JSON.stringify(v) === JSON.stringify(a ?? ALOKASI.Merata))?.[0] ?? 'Merata';

export default function TenderPage() {
  const { id } = useParams<{ id: string }>();
  const sb = supabaseBrowser();
  const { profile } = useProfile();
  const [t, setT] = useState<TenderRow | null>(null);
  const [tab, setTab] = useTabUrl<(typeof TABS)[number] | typeof TAB_EXCEL>([TAB_EXCEL, ...TABS], 'Key assumption');
  const [prods, setProds] = useState<Prod[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tarif, setTarif] = useState<Tarif[]>([]);
  const [jabatan, setJabatan] = useState<string[]>([]);
  const [hasil, setHasil] = useState<HasilTender | null>(null);
  const [catatanMaster, setCatatanMaster] = useState<string[]>([]);
  const [pesan, setPesan] = useState<string | null>(null);
  const [kotor, setKotor] = useState(false);
  const [pembuat, setPembuat] = useState<string | null>(null);

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
    riwayat.current = { lalu: [], depan: [], terakhir: 0 };
    setT(row); setProds((p.data ?? []) as Prod[]); setItems((it.data ?? []) as Item[]); setTarif((tf.data ?? []) as Tarif[]);
    setJabatan(((jb.data ?? []) as Jab[]).map(j => j.role_name));
    if (row.hasil) setHasil(row.hasil as HasilTender);
    if (row.asumsi.historis && !new URLSearchParams(window.location.search).get('tab')) setTab(TAB_EXCEL);
    if (row.created_by) {
      const { data: pc } = await sb.from('profiles').select('full_name, email').eq('id', row.created_by).maybeSingle();
      setPembuat(pc ? (pc.full_name || pc.email) : null);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { muat(); }, [muat]);

  // ---- Undo / redo: setiap perubahan input dicatat; ketikan beruntun (< 800 ms) digabung jadi satu langkah ----
  const tRef = useRef<TenderRow | null>(null); tRef.current = t;
  const riwayat = useRef<{ lalu: TenderRow[]; depan: TenderRow[]; terakhir: number }>({ lalu: [], depan: [], terakhir: 0 });
  const [, setVerRiwayat] = useState(0);
  const catat = () => {
    const r = riwayat.current, now = Date.now();
    if (tRef.current && now - r.terakhir > 800) { r.lalu.push(tRef.current); if (r.lalu.length > 100) r.lalu.shift(); r.depan = []; setVerRiwayat(v => v + 1); }
    r.terakhir = now;
  };
  const undo = () => { const r = riwayat.current; const prev = r.lalu.pop(); if (!prev || !tRef.current) return; r.depan.push(tRef.current); r.terakhir = 0; setT(prev); setKotor(true); setVerRiwayat(v => v + 1); };
  const redo = () => { const r = riwayat.current; const nxt = r.depan.pop(); if (!nxt || !tRef.current) return; r.lalu.push(tRef.current); r.terakhir = 0; setT(nxt); setKotor(true); setVerRiwayat(v => v + 1); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const setKol = <K extends keyof TenderRow>(k: K, v: TenderRow[K]) => { catat(); setT(x => x && ({ ...x, [k]: v })); setKotor(true); };
  const setA = (patch: Partial<Asumsi>) => { catat(); setT(x => x && ({ ...x, asumsi: { ...x.asumsi, ...patch } })); setKotor(true); };

  async function simpan(extra: Partial<TenderRow> = {}) {
    if (!t) return false;
    const { id: _id, updated_at: _u, ...rest } = { ...t, ...extra };
    if (!bisaEdit) { setPesan('Draft ini milik akun lain — hanya bisa dilihat.'); return false; }
    const { data: upd, error } = await sb.from('tenders').update(rest).eq('id', t.id).select('id');
    if (error) { setPesan(`Gagal menyimpan: ${error.message}`); return false; }
    if (!upd?.length) { setPesan('Tidak tersimpan: draft ini hanya bisa diedit oleh pembuatnya.'); return false; }
    setKotor(false); setPesan('Tersimpan.'); setTimeout(() => setPesan(null), 2500);
    return true;
  }

  async function hitung(pindahTab = true) {
    if (!t) return;
    setPesan('Menghitung…');
    const { master, catatan } = await muatMaster(sb, t);
    const h = hitungTender(keInput(t), master);
    for (const c of catatan) h.redFlags.push({ level: 'peringatan', kode: 'MASTER_DATA', pesan: c });
    setHasil(h); setCatatanMaster(catatan); if (pindahTab) setTab('Hasil'); setPesan(pindahTab ? null : 'Dihitung ulang.'); if (!pindahTab) setTimeout(() => setPesan(null), 2000);
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

  // Margin diubah di tab Hasil → hitung ulang otomatis (tanpa pindah tab)
  const kunciMargin = JSON.stringify([t?.asumsi.marginManual ?? {}, t?.asumsi.pajak ?? null]);
  useEffect(() => {
    if (!hasil || tab !== 'Hasil') return;
    const id = setTimeout(() => { hitung(false); }, 400);
    return () => clearTimeout(id);
  }, [kunciMargin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draft tender hanya bisa diedit pembuatnya (atau admin/master); akun lain hanya melihat. Aturan sama dipasang di database.
  const bisaEdit = !!t && !!profile && (profile.role === 'admin' || t.created_by === profile.id || !STATUS_DRAFT.includes(t.status));

  const toolsDipakai = useMemo(() => Array.from(new Set((t?.asumsi.aktivitas ?? []).map(a => a.tool).filter(x => x && x !== 'Manual'))), [t]);
  const spaceH = useMemo(() => {
    if (!t) return null;
    const v = (ar: Arus) => t.asumsi.volumes.find(x => x.arus === ar)?.peakBulan ?? 0;
    return hitungSpaceExcel(lengkapiSpaceExcel(t.asumsi.space.excel), v('storage'), v('inbound'), v('outbound'), t.jumlah_shift);
  }, [t]);
  const pdFull = useMemo(() => t ? hitungProcessDesign(t.asumsi.aktivitas, t.asumsi.volumes, { ...PD_DEFAULT, ...(t.asumsi.processDesign ?? {}) },
    t.asumsi.faktorProduktivitas, t.asumsi.efisiensi, t.jumlah_shift,
    { spanOfControl: t.asumsi.spanOfControl, roleSupervisor: t.asumsi.roleSupervisor, alatSupervisor: t.asumsi.alatSupervisor, peranTetap: t.asumsi.peranTetap }) : null, [t]);
  const pdMhe = pdFull?.mhe ?? [];
  // headcount total untuk konsumsi (galon): hasil Hitung bila ada, kalau tidak dari process design (direct + indirect/tetap)
  const headcountTotal = (hasil?.manpower?.reduce((s, m) => s + m.headcount, 0)) || ((pdFull?.totalMp ?? 0) + (pdFull?.indirect.total ?? 0));

  if (!t) return <p className="muted">{pesan ?? 'Memuat tender…'}</p>;
  const a = t.asumsi;

  const aksi = (atas: boolean) => (
    <div className="row" style={atas ? undefined : { justifyContent: 'flex-end' }}>
      {pesan && <span className="small" role="status">{pesan}</span>}
      {bisaEdit && <>
        <button className="ghost" onClick={undo} disabled={!riwayat.current.lalu.length} title="Undo (Ctrl+Z)" aria-label="Undo">↶ Undo</button>
        <button className="ghost" onClick={redo} disabled={!riwayat.current.depan.length} title="Redo (Ctrl+Y)" aria-label="Redo">↷ Redo</button>
      </>}
      {bisaEdit && <button className="ghost" onClick={() => simpan()} disabled={!kotor}>{kotor ? 'Simpan input' : 'Tersimpan'}</button>}
      <button onClick={() => hitung()}>Hitung</button>
    </div>);

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{t.kode} · v{t.versi} · {labelStatus(t.status)}</div>
          <h1>{t.customer}</h1>
          <p className="muted">{t.kab_kota}, {t.provinsi} · {t.skenario_aset} · {t.jumlah_shift} shift · kontrak {t.durasi_kontrak_bulan} bln</p>
        </div>
        {aksi(true)}
      </div>
      {profile && !bisaEdit && <div className="ro-banner" role="note"><b>Hanya lihat</b> · Draft ini dibuat oleh {pembuat ?? 'akun lain'}. Anda bisa melihat isi dan menjalankan Hitung untuk simulasi, tetapi tidak bisa menyimpan perubahan, mengubah status, atau membuat quotation.</div>}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        {bisaEdit ? <StatusControl tender={t} onBerubah={st => setT(x => x && ({ ...x, status: st }))} /> : <span />}
        {profile && (profile.role === 'admin' || (t.created_by === profile.id && STATUS_DRAFT.includes(t.status))) && <HapusTender id={t.id} kode={t.kode ?? t.customer} customer={t.customer} />}
      </div>

      <div className="tabs" role="tablist">
        {([...(a.historis ? [TAB_EXCEL] : []), ...TABS] as ((typeof TABS)[number] | typeof TAB_EXCEL)[]).map(x => <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>{x}</button>)}
      </div>

      {tab === TAB_EXCEL && a.historis && <HistorisPanel h={a.historis} nama={(t.kode ?? t.customer).replace(/[^\w]+/g, '_')} />}

      <fieldset className="ro-fieldset" disabled={!bisaEdit}>
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
            <thead><tr><th>Arus</th><th>UoM</th><th className="num">Rata-rata/bln</th><th className="num">Peak/bln</th><th className="num">Komitmen/bln</th><th className="num">Faktor peak</th><th title="1 UoM = berapa case/karton">Isi per UoM</th><th title="1 case = berapa pcs">Isi per case</th><th></th></tr></thead>
            <tbody>{a.volumes.map((v, i) => (
              <tr key={i}>
                <td><select aria-label="Arus" value={v.arus} style={{ minWidth: 130 }} onChange={e => setA({ volumes: ubahArray(a.volumes, i, { arus: e.target.value as Arus }) })}>{ARUS.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select></td>
                <td><select aria-label="UoM" value={v.uom} style={{ minWidth: 100 }} onChange={e => setA({ volumes: ubahArray(a.volumes, i, { uom: e.target.value }) })}>{UOM.map(u => <option key={u}>{u}</option>)}</select></td>
                {(['rataRataBulan', 'peakBulan', 'komitmenBulan'] as const).map(k => (
                  <td key={k} className="num"><input aria-label={k} type="number" step="any" value={v[k]} onChange={e => setA({ volumes: ubahArray(a.volumes, i, { [k]: Number(e.target.value) }) })} /></td>
                ))}
                <td className="num">{v.rataRataBulan > 0 ? (v.peakBulan / v.rataRataBulan).toFixed(2) + '×' : '—'}</td>
                {(() => {
                  const k = v.konversi ?? { uom1: 'case', per1: 0, uom2: 'pcs', per2: 0 };
                  const uk = (p: Partial<typeof k>) => setA({ volumes: ubahArray(a.volumes, i, { konversi: { ...k, ...p } }) });
                  return <>
                    <td><div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}><span className="small muted">1 {v.uom} =</span>
                      <input aria-label={`Isi per ${v.uom}`} type="number" step="any" min={0} value={k.per1 || ''} placeholder="0" onChange={e => uk({ per1: Number(e.target.value) })} style={{ width: 70, minWidth: 70 }} />
                      <select aria-label="UoM isi" value={k.uom1} onChange={e => uk({ uom1: e.target.value })} style={{ minWidth: 96 }}>{(UOM_ISI.includes(k.uom1) ? UOM_ISI : [k.uom1, ...UOM_ISI]).map(u => <option key={u}>{u}</option>)}</select></div></td>
                    <td><div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}><span className="small muted">1 {k.uom1} =</span>
                      <input aria-label={`Isi per ${k.uom1}`} type="number" step="any" min={0} value={k.per2 || ''} placeholder="0" onChange={e => uk({ per2: Number(e.target.value) })} style={{ width: 70, minWidth: 70 }} />
                      <select aria-label="UoM isi kecil" value={k.uom2} onChange={e => uk({ uom2: e.target.value })} style={{ minWidth: 96 }}>{(UOM_ISI.includes(k.uom2) ? UOM_ISI : [k.uom2, ...UOM_ISI]).map(u => <option key={u}>{u}</option>)}</select></div></td>
                  </>;
                })()}
                <td><button className="danger" onClick={() => setA({ volumes: a.volumes.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>))}
            </tbody></table></div>
          {a.volumes.some(v => (v.konversi?.per1 ?? 0) > 0) && <>
            <h3>Volume dipecah per UoM (peak/bln)</h3>
            <div className="tablewrap"><table>
              <thead><tr><th>Arus</th><th className="num">Rata-rata</th><th className="num">Peak</th><th className="num">Komitmen</th></tr></thead>
              <tbody>{a.volumes.map((v, i) => {
                const k = v.konversi; const p1 = k?.per1 || 0, p2 = k?.per2 || 0;
                const sel = (x: number) => <>{angka(x)} {v.uom}{p1 > 0 && <div className="small">{angka(x * p1)} {k!.uom1}</div>}{p1 > 0 && p2 > 0 && <div className="small muted">{angka(x * p1 * p2)} {k!.uom2}</div>}</>;
                return <tr key={i}><td>{ARUS.find(o => o.v === v.arus)?.l ?? v.arus}</td><td className="num">{sel(v.rataRataBulan)}</td><td className="num">{sel(v.peakBulan)}</td><td className="num">{sel(v.komitmenBulan)}</td></tr>;
              })}</tbody></table></div>
            <p className="small muted">Aktivitas dengan UoM case/pcs (mis. Case Picking per karton) otomatis memakai konversi ini bila pengali UoM-nya 1.</p>
          </>}
          <div className="row"><button className="ghost" onClick={() => setA({ volumes: [...a.volumes, { arus: 'vas', uom: 'karton', rataRataBulan: 0, peakBulan: 0, komitmenBulan: 0 }] })}>Tambah baris volume</button></div>
          <h3>Stok untuk tarif storage alternatif</h3>
          <div className="grid3">
            <Num id="ton" label="Stok rata-rata" suffix="ton" value={a.stokTon} onChange={v => setA({ stokTon: v })} />
            <Num id="cbm" label="Stok rata-rata" suffix="CBM" value={a.stokCbm} onChange={v => setA({ stokCbm: v })} />
            <Num id="liter" label="Stok rata-rata" suffix="liter" value={a.stokLiter} onChange={v => setA({ stokLiter: v })} />
          </div>
        </div>
      )}

      {tab === 'Volume' && <ProfilVolumePanel profil={a.profilVolume} volumes={a.volumes} hariBulan={a.processDesign?.hariKerjaBulan ?? 25}
        onChange={profilVolume => setA({ profilVolume })}
        onTerapkan={(arus, total) => setA({ volumes: a.volumes.map(v => {
          if (v.arus !== arus) return v;
          const faktor = v.rataRataBulan > 0 && v.peakBulan > 0 ? v.peakBulan / v.rataRataBulan : 1;
          const tot = Math.round(total);
          const fk = v.rataRataBulan > 0 && v.komitmenBulan > 0 ? v.komitmenBulan / v.rataRataBulan : 1;
          return { ...v, uom: 'palet', rataRataBulan: tot, peakBulan: Math.round(tot * faktor), komitmenBulan: Math.round(tot * fk) };
        }) })} />}

      {tab === 'Aktivitas & manpower' && (<>
        {<>
          <ProcessDesignPanel bagian="ringkasan" indirect={{ spanOfControl: a.spanOfControl, roleSupervisor: a.roleSupervisor, alatSupervisor: a.alatSupervisor, peranTetap: a.peranTetap }} aktivitas={a.aktivitas} volumes={a.volumes} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
              jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={n => setKol('jumlah_shift', n)} />
          <ProcessDesignPanel bagian="rincian" aktivitas={a.aktivitas} volumes={a.volumes} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
              jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={n => setKol('jumlah_shift', n)} />
          <ProcessDesignPanel bagian="desain" aktivitas={a.aktivitas} volumes={a.volumes} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
              jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={n => setKol('jumlah_shift', n)} />
        </>}
        <div className="card">
          <h2>Indirect & peran tetap</h2>
          <div className="grid3">
            <Num id="span" label="Span of control" suffix="direct per supervisor" value={a.spanOfControl} onChange={v => setA({ spanOfControl: v })} />
            <Sel id="spv" label="Role supervisor" value={a.roleSupervisor} options={jabatan.map(j => ({ v: j, l: j }))} onChange={v => setA({ roleSupervisor: v })} />
            <label className="f" htmlFor="alat-spv">Alat pendukung supervisor
              <AlatInput id="alat-spv" value={a.alatSupervisor ?? []} onChange={v => setA({ alatSupervisor: v })} /></label>
          </div>
          <p className="small muted">Supervisor dihitung otomatis = ROUNDUP(direct per shift ÷ span) × shift aktif — kecuali role supervisor sudah Anda isi di tabel peran tetap; maka jumlahnya mengikuti input Anda. Isi span 0 untuk mematikan perhitungan otomatis. Alat pendukung (mis. PC, HT, Scanner RDT) dihitung 1 unit per orang dan masuk ke MHE Summary serta Kebutuhan MHE. Pisahkan dengan koma.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Role</th><th className="num">Headcount</th><th>Alat pendukung</th><th>Alokasi</th><th></th></tr></thead>
            <tbody>{a.peranTetap.map((r, i) => (
              <tr key={i}>
                <td><select aria-label="Role" value={r.roleName} onChange={e => setA({ peranTetap: ubahArray(a.peranTetap, i, { roleName: e.target.value }) })}>{jabatan.map(j => <option key={j}>{j}</option>)}</select></td>
                <td className="num"><input aria-label="Headcount" type="number" min={0} value={r.qty} onChange={e => setA({ peranTetap: ubahArray(a.peranTetap, i, { qty: Number(e.target.value) }) })} /></td>
                <td><AlatInput aria-label={`Alat pendukung ${r.roleName}`} value={r.alat ?? []} onChange={v => setA({ peranTetap: ubahArray(a.peranTetap, i, { alat: v }) })} /></td>
                <td><select aria-label="Alokasi" value={namaAlokasi(r.alokasi)} onChange={e => setA({ peranTetap: ubahArray(a.peranTetap, i, { alokasi: ALOKASI[e.target.value] }) })}>{Object.keys(ALOKASI).map(k => <option key={k}>{k}</option>)}</select></td>
                <td><button className="danger" onClick={() => setA({ peranTetap: a.peranTetap.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>))}</tbody></table></div>
          <div className="row"><button className="ghost" onClick={() => setA({ peranTetap: [...a.peranTetap, { roleName: jabatan[0] ?? '', qty: 1 }] })}>Tambah peran tetap</button></div>
        </div>
        <div className="card">
          <h2>Aktivitas (VSM) & manpower</h2>
          <p className="small muted">Pilih aktivitas dari database produktivitas (Operations) atau tambah baris kosong. Semua kolom kuning bisa diubah: task, aktivitas, equipment, alat pendukung, role, produktivitas, UoM, arus, volume, %. Volume/bln kosong = volume peak arus × pengali. <b>Arus</b> = alur barang yang menjadi dasar volume aktivitas: Inbound (barang masuk), Outbound (barang keluar), Storage (stok/penyimpanan), VAS (value added service).</p>
          <TambahAktivitas prods={prods} industri={t.industri} onTambah={p => setA({ aktivitas: [...a.aktivitas, { ...dariProd(p), persenVolume: 1, pengaliUom: 1 }] })} />
          <div className="row">
            <button className="ghost" onClick={() => setA({ aktivitas: [...a.aktivitas, { aktivitas: 'Aktivitas baru', tahap: a.aktivitas.at(-1)?.tahap ?? 'Inbound', tool: 'Manual', roleName: jabatan[0] ?? '',
              uom: 'palet', prodPerJam: 20, arus: 'inbound', persenVolume: 1, pengaliUom: 1 }] })}>Tambah baris kosong</button>
            <span className="small muted">Manpower dihitung dengan FTE per bulan (Process Design) + multi-skill pooling. Operator RT/Forklift CB hanya saling backup sesama operator; TKBM & Helper (daily worker) tidak dirangkap.</span>
          </div>
          <datalist id="dl-tool">{TOOLS.concat(prods.map(p => p.tool), a.mhe.map(m => m.tool)).filter((v, k, xs) => v && xs.indexOf(v) === k).map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="dl-tahap">{Array.from(new Set([...prods.map(p => p.tahap), ...a.aktivitas.map(x => x.tahap)])).map(v => <option key={v} value={v} />)}</datalist>
          <div className="tablewrap"><table className="akt-edit">
            <thead><tr><th>Task / tahap</th><th>Aktivitas (workload driver)</th><th>Equipment</th><th>Alat pendukung</th><th>Role (man power)</th><th className="num">Prod/jam</th><th>UoM</th><th title="Alur barang yang menjadi dasar volume aktivitas">Arus (alur barang)</th>
              <th className="num" title="Kosongkan untuk memakai volume peak arus × pengali">Volume/bln</th><th className="num">% volume</th><th className="num">Pengali UoM</th><th></th></tr></thead>
            <tbody>
              {a.aktivitas.length === 0 && <tr><td colSpan={12} className="muted">Belum ada aktivitas. Tambahkan dari daftar di atas atau baris kosong.</td></tr>}
              {a.aktivitas.map((x, i) => {
                const ub = (patch: Partial<typeof x>) => setA({ aktivitas: ubahArray(a.aktivitas, i, patch) });
                const vArus = a.volumes.find(v => v.arus === x.arus);
                const pEf = pengaliEfektif(x, vArus);
                const vAuto = (vArus?.peakBulan ?? 0) * pEf;
                return (
                <tr key={i}>
                  <td><input aria-label="Tahap" list="dl-tahap" value={x.tahap} onChange={e => ub({ tahap: e.target.value })} style={{ minWidth: 140 }} /></td>
                  <td><select aria-label="Aktivitas" value={x.productivityId ? String(x.productivityId) : 'manual'} style={{ minWidth: 220 }}
                    onChange={e => { const p = prods.find(q => q.id === Number(e.target.value)); if (p) ub(dariProd(p)); }}>
                    {!x.productivityId && <option value="manual">{x.aktivitas} (manual)</option>}
                    {Array.from(new Set(prods.map(p => p.tahap))).map(th => (
                      <optgroup key={th} label={th}>{prods.filter(p => p.tahap === th).map(p => <option key={p.id} value={p.id}>{p.aktivitas} · {p.tool} · {p.prod_per_jam} {p.uom}/jam</option>)}</optgroup>))}
                  </select></td>
                  <td><input aria-label="Equipment" list="dl-tool" value={x.tool} onChange={e => ub({ tool: e.target.value })} style={{ minWidth: 130 }} /></td>
                  <td><input aria-label="Alat pendukung" list="dl-tool" placeholder="mis. Scanner RDT" value={(x.alatTambahan ?? []).join(', ')}
                    onChange={e => ub({ alatTambahan: e.target.value.split(',').map(t => t.trimStart()) })} onBlur={e => ub({ alatTambahan: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} style={{ minWidth: 130 }} /></td>
                  <td><select aria-label="Role" value={x.roleName} onChange={e => ub({ roleName: e.target.value })} style={{ minWidth: 160 }}>
                    {(jabatan.includes(x.roleName) ? jabatan : [x.roleName, ...jabatan]).map(j => <option key={j}>{j}</option>)}</select></td>
                  <td className="num db"><input aria-label="Produktivitas" type="number" step="any" value={x.prodPerJam} onChange={e => ub({ prodPerJam: Number(e.target.value) })} style={{ width: 80, minWidth: 80 }} /></td>
                  <td><select aria-label="UoM" value={x.uom} style={{ minWidth: 100 }} onChange={e => ub({ uom: e.target.value })}>{(UOM.includes(x.uom) ? UOM : [x.uom, ...UOM]).map(u => <option key={u}>{u}</option>)}</select></td>
                  <td><select aria-label="Arus" value={x.arus} style={{ minWidth: 130 }} title="Alur barang: inbound (masuk), outbound (keluar), storage (penyimpanan), VAS" onChange={e => ub({ arus: e.target.value as Arus })}>{ARUS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></td>
                  <td className="num"><input aria-label="Volume per bulan" type="number" step="any" placeholder={Math.round(vAuto).toLocaleString('id-ID')} value={x.volumeManual ?? ''}
                    onChange={e => ub({ volumeManual: e.target.value === '' ? null : Number(e.target.value) })} style={{ width: 96, minWidth: 96 }} /></td>
                  <td className="num"><input aria-label="Persen volume" type="number" step="any" value={+(x.persenVolume * 100).toFixed(2)} onChange={e => ub({ persenVolume: Number(e.target.value) / 100 })} style={{ width: 70, minWidth: 70 }} /></td>
                  <td className="num"><input aria-label="Pengali UoM" type="number" step="any" value={x.pengaliUom} onChange={e => ub({ pengaliUom: Number(e.target.value) })} title="Mis. 1 palet = 40 karton → 40. Biarkan 1 agar memakai konversi di tab Volume." style={{ width: 70, minWidth: 70 }} />
                    {(x.pengaliUom || 1) === 1 && pEf !== 1 && <div className="small muted" title="dari konversi di tab Volume">auto ×{angka(pEf)}</div>}
                    {vArus && faktorUom(vArus, x.uom) == null && (x.pengaliUom || 1) === 1 && <div className="small" style={{ color: 'var(--warn, #b45309)' }} title={`UoM ${x.uom} belum ada di konversi arus (${vArus.uom})`}>isi konversi</div>}</td>
                  <td className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                    <button className="ghost" title="Duplikat baris" onClick={() => setA({ aktivitas: [...a.aktivitas.slice(0, i + 1), { ...x }, ...a.aktivitas.slice(i + 1)] })}>Salin</button>
                    <button className="danger" onClick={() => setA({ aktivitas: a.aktivitas.filter((_, j) => j !== i) })}>Hapus</button></td>
                </tr>); })}
            </tbody></table></div>
        </div>
      </>)}

      {tab === 'Gudang, space & MHE' && (<>
        <GudangPicker provinsi={t.provinsi} terpilih={a.gudang} kebutuhanM2={hasil?.space.totalM2} onPilih={(g, tarifM2) => {
          setKol('warehouse_id', g?.id ?? null);
          setA({ gudang: g, space: { ...a.space, tarifManual: g ? false : a.space.tarifManual, tarifSewaM2Bulan: g ? Math.round(tarifM2) : a.space.tarifSewaM2Bulan } });
        }} />
        <SpacePanel excel={a.space.excel} ppTotal={a.volumes.find(v => v.arus === 'storage')?.peakBulan ?? 0}
          inboundBulan={a.volumes.find(v => v.arus === 'inbound')?.peakBulan ?? 0} outboundBulan={a.volumes.find(v => v.arus === 'outbound')?.peakBulan ?? 0}
          uomIn={a.volumes.find(v => v.arus === 'inbound')?.uom ?? 'palet'} uomOut={a.volumes.find(v => v.arus === 'outbound')?.uom ?? 'palet'}
          jumlahShift={t.jumlah_shift} onChange={excel => setA({ space: { ...a.space, excel } })}
          komersial={<BiayaSpacePanel space={a.space} gudang={a.gudang} items={items} spaceRentM2={spaceH?.spaceRent ?? 0}
            posSpr={Math.ceil((spaceH?.sd.ppReq ?? 0) - 1e-9)} posDdr={Math.ceil((spaceH?.dd.ppReq ?? 0) - 1e-9)}
            posBlock={Math.ceil(spaceH?.block.ppReq ?? 0)} posFloor={Math.ceil(spaceH?.floor.ppReq ?? 0)}
            skenarioAset={t.skenario_aset} kontrakBulan={t.durasi_kontrak_bulan}
            onSpace={space => setA({ space })} onGudang={gudang => setA({ gudang })} />} />
        <MhePanel mhe={a.mhe} items={items} metodeExcel={true} onChange={mhe => setA({ mhe })}
          kebutuhan={true
            ? pdMhe.map(r => ({ nama: r.nama, fte: r.fte, unit: r.resources }))
            : toolsDipakai.map(tl => { const r = hasil?.mhe.find(x => x.tool === tl); return { nama: tl, fte: null, unit: r ? r.unitDasar : null }; })} />
      </>)}

      {tab === 'IT' && <ItPanel sheet={a.it} onChange={it => setA({ it })} kontrakBulan={t.durasi_kontrak_bulan} />}

      {tab === 'Biaya lain' && (
        <div className="card">
          <h2>Biaya lain</h2>
          {a.it.lines.length > 0 && <p className="small notice">IT dari tab IT ikut dihitung otomatis: ±{rp(ringkasIt(a.it, { kontrakBulan: t.durasi_kontrak_bulan, bungaTahun: 0.1 }).totalBulan)}/bln (termasuk depresiasi/amortisasi OTC {rp(ringkasIt(a.it).sekali)}). Jangan diinput dua kali di sini.</p>}
          <p className="small muted">Dipisah per klasifikasi sesuai Price Inquiry; pilihan item di tiap bagian hanya dari kategorinya. Bulanan/sewa = qty × harga per bulan. Beli = depresiasi selama min(umur, kontrak) + bunga modal. Sekali = diamortisasi selama kontrak + bunga modal.</p>
          <BiayaLainPanel lines={a.costLines} items={items} kontrakBulan={t.durasi_kontrak_bulan} onChange={costLines => setA({ costLines })}
            startup={a.startupAuto ?? STARTUP_DEFAULT} onStartup={startupAuto => setA({ startupAuto })}
            hasilBaris={hasil?.biaya} onHitung={() => hitung(false)} headcount={headcountTotal} hariKerjaBulan={a.processDesign?.hariKerjaBulan ?? 25} />

          <h2>Listrik</h2>
          <ListrikTender simulasi={a.listrikSimulasi} listrik={a.listrik} golongan={a.golonganListrik} tarifKwh={a.tarifListrikKwh} tarif={tarif} items={items}
            onSimulasi={listrikSimulasi => setA({ listrikSimulasi })} onListrik={listrik => setA({ listrik })}
            onTarif={(golonganListrik, tarifListrikKwh) => setA({ golonganListrik, tarifListrikKwh })} />
        </div>
      )}

      {tab === 'Hasil' && <HasilPanel hasil={hasil} catatan={catatanMaster} onSimpan={simpanHasil} onHitung={() => hitung()}
        marginManual={a.marginManual ?? {}} onMargin={marginManual => setA({ marginManual })} kurs={a.kurs} onKurs={kurs => setA({ kurs })} kontrakBulan={t.durasi_kontrak_bulan}
        pajak={a.pajak ?? PAJAK_DEFAULT} onPajak={pajak => setA({ pajak })} gudang={a.gudang} />}
      {tab === 'Quotation' && <QuotationPanel tender={t} profile={profile} />}
      </fieldset>
      {tab !== 'Hasil' && tab !== 'Quotation' && <div className="aksi-bawah">{aksi(false)}</div>}
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

function HasilPanel({ hasil, catatan, onSimpan, onHitung, marginManual, onMargin, kurs, onKurs, kontrakBulan, pajak, onPajak, gudang }: {
  hasil: HasilTender | null; catatan: string[]; onSimpan: () => void; onHitung: () => void; gudang: { nama: string; luas_m2: number } | null | undefined;
  marginManual: Partial<Record<Bucket, number | null>>; onMargin: (m: Partial<Record<Bucket, number | null>>) => void;
  kurs: Kurs | null | undefined; onKurs: (k: Kurs | null) => void; kontrakBulan: number; pajak: Pajak; onPajak: (p: Pajak) => void;
}) {
  if (!hasil) return <div className="card"><p>Belum dihitung.</p><div className="row"><button onClick={onHitung}>Hitung sekarang</button></div></div>;
  const h = hasil;
  const kritis = h.redFlags.filter(f => f.level === 'kritis').length;
  return (
    <>
      {(() => {
        const s0 = h.simulasi[0];
        const sell = s0?.pendapatanBulan ?? 0, cost = h.totalBiayaBulan, profit = s0?.gp ?? sell - cost;
        const kpi: [string, string, string?][] = [
          ['Cost per bulan', rp(cost)], ['Selling per bulan', rp(sell), 'bersih setelah PPh'],
          ['Cost per tahun', rp(cost * 12)], ['Selling per tahun', rp(sell * 12)],
          ['Profit per bulan', rp(profit), `per tahun ${rp(profit * 12)}`], ['Margin (GP%)', persen(s0?.gpPersen), 'volume komitmen'],
          ['Jumlah manpower', `${h.totalHeadcount} orang`], ['Luas gudang', `${angka(h.space.totalM2)} m²`, gudang ? `dari ${angka(Number(gudang.luas_m2))} m² tersedia` : undefined],
          ['Jumlah gudang', gudang ? '1 gudang' : '–', gudang ? gudang.nama : 'belum dipilih'],
        ];
        return <div className="kpis">{kpi.map(([l, v, k]) => <div key={l} className="kpi"><span className="small muted">{l}</span><b>{v}</b>{k && <span className="small muted">{k}</span>}</div>)}</div>;
      })()}
      <div className="row hasil-aksi"><button className="ghost" onClick={onHitung}>Hitung ulang</button><button onClick={onSimpan}>Simpan hasil sebagai versi baru</button></div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Red flag {kritis > 0 ? <span className="pill bad">{kritis} kritis</span> : <span className="pill ok">tidak ada yang kritis</span>}</h2>
        </div>
        {h.redFlags.length === 0 && <p className="muted">Tidak ada red flag.</p>}
        {h.redFlags.map((f, i) => <div key={i} className={`flag ${f.level}`}><b className="small">{f.level.toUpperCase()} · {f.kode}</b><div>{f.pesan}</div></div>)}
        {catatan.length > 0 && <p className="small muted">Catatan master data ikut dimasukkan sebagai red flag MASTER_DATA.</p>}
      </div>

      <HasilKomersial h={h} marginManual={marginManual} onMargin={onMargin} kurs={kurs} onKurs={onKurs} kontrakBulan={kontrakBulan} pajak={pajak} onPajak={onPajak} />

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
      <div className="row hasil-aksi"><button className="ghost" onClick={onHitung}>Hitung ulang</button><button onClick={onSimpan}>Simpan hasil sebagai versi baru</button></div>
    </>
  );
}
