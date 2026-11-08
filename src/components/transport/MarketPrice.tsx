'use client';
// Sheet Market Price: database harga beli vendor per rute (transport_rates). Ubah langsung di tabel, atau
// unduh template Excel → isi banyak harga sekaligus → upload → pratinjau (baru / harga berubah / sama / error) → simpan.
import { useMemo, useState } from 'react';
import TableEditor, { type Kolom } from '@/components/TableEditor';
import { useProfile } from '@/lib/useProfile';
import { supabaseBrowser } from '@/lib/supabase/client';
import { importExcel, type KolomExcel } from '@/lib/excel';
import { ARMADA, BASIS, MODA, type Moda } from '@/lib/transport';
import { LOKASI } from '@/lib/lokasiIndonesia';
import { rp } from '@/lib/format';

const PERAN_EDIT = ['procurement', 'commercial', 'solution_design'] as const;
type Row = Record<string, unknown>;

export function kolomMarket(moda?: Moda[]): Kolom[] {
  const armada = ARMADA.filter(a => !moda || moda.includes(a.moda)).map(a => a.nama);
  return [
    { key: 'moda', label: 'Moda', type: 'select', options: (moda ?? MODA.map(m => m.v)) as string[], width: 90 },
    { key: 'origin', label: 'Origin', width: 140 }, { key: 'destination', label: 'Destination', width: 140 },
    { key: 'armada', label: 'Armada', type: 'select', options: armada, width: 150 },
    { key: 'basis', label: 'Basis', type: 'select', options: BASIS.map(b => b.v), width: 90 },
    { key: 'harga', label: 'Harga beli (Rp)', type: 'number', width: 120 },
    { key: 'vendor', label: 'Vendor', width: 150 },
    { key: 'lead_time_hari', label: 'Lead time (hari)', type: 'number', width: 80 },
    { key: 'min_charge', label: 'Min. charge (Rp)', type: 'number', width: 110 },
    { key: 'cakupan', label: 'Cakupan (termasuk / tidak)', width: 180 },
    { key: 'berlaku_sampai', label: 'Berlaku sampai', type: 'date', width: 120 },
    { key: 'sumber', label: 'Sumber', width: 140 }, { key: 'catatan', label: 'Catatan', width: 140 },
  ];
}

const kunci = (r: Row) => [r.moda, r.origin, r.destination, r.armada, r.basis, r.vendor].map(x => String(x ?? '').trim().toLowerCase()).join('|');

/** Template Excel: sheet Market Price (header sama dengan tabel, pilihan moda/armada/basis berupa dropdown), sheet Daftar & Petunjuk. */
async function unduhTemplate(kolom: Kolom[], contoh: Row[], nama: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); wb.creator = 'Leca';
  const ws = wb.addWorksheet('Market Price');
  const daftar = wb.addWorksheet('Daftar');
  const petunjuk = wb.addWorksheet('Petunjuk');
  ws.columns = kolom.map(k => ({ header: k.label, key: k.key, width: Math.max(12, Math.round((k.width ?? 120) / 7)) }));
  for (const r of contoh) ws.addRow(kolom.map(k => r[k.key] ?? null));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  // daftar pilihan
  const lists: Record<string, string[]> = {
    moda: kolom.find(k => k.key === 'moda')?.options ?? [], armada: kolom.find(k => k.key === 'armada')?.options ?? [],
    basis: BASIS.map(b => b.v), lokasi: LOKASI.map(l => l.nama),
  };
  const kolDaftar = Object.keys(lists);
  kolDaftar.forEach((nm, i) => { daftar.getCell(1, i + 1).value = nm; lists[nm].forEach((v, j) => { daftar.getCell(j + 2, i + 1).value = v; }); daftar.getColumn(i + 1).width = 26; });
  daftar.getRow(1).font = { bold: true };
  const huruf = (i: number) => String.fromCharCode(65 + i);
  for (let baris = 2; baris <= 1000; baris++) {
    kolom.forEach((k, i) => {
      const nm = k.key === 'origin' || k.key === 'destination' ? 'lokasi' : k.key;
      const j = kolDaftar.indexOf(nm); if (j < 0) return;
      const sel = ws.getCell(baris, i + 1);
      sel.dataValidation = { type: 'list', allowBlank: true, showErrorMessage: nm !== 'lokasi',
        formulae: [`Daftar!$${huruf(j)}$2:$${huruf(j)}$${lists[nm].length + 1}`] };
    });
    ws.getCell(baris, kolom.findIndex(k => k.key === 'harga') + 1).numFmt = '#,##0';
  }
  petunjuk.columns = [{ width: 110 }];
  [
    'Cara isi Market Price',
    '1. Satu baris = satu harga beli vendor untuk satu rute (origin → destination), satu armada, satu basis.',
    '2. Moda: darat / laut / udara / kereta. Basis: trip, cbm, ton, kg, pallet, liter, container (pilih dari dropdown).',
    '3. Origin & Destination: pilih dari dropdown (kota, pelabuhan, bandara) atau ketik nama lain.',
    '4. Harga beli dalam Rupiah per basis (mis. per trip). Min. charge opsional.',
    '5. Upload kembali di menu Market Price → "Upload Excel". Baris dengan moda + origin + destination + armada + basis + vendor yang sama',
    '   dianggap harga yang sama → harganya diperbarui; kombinasi baru → ditambahkan. Pratinjau muncul sebelum disimpan.',
    '6. Harga baru berstatus draft sampai di-approve.',
  ].forEach((t, i) => { petunjuk.getCell(i + 1, 1).value = t; if (i === 0) petunjuk.getCell(1, 1).font = { bold: true, size: 13 }; });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = `${nama}_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click(); URL.revokeObjectURL(url);
}

interface Pratinjau { file: string; baru: Row[]; ubah: { id: number; lama: number; row: Row }[]; sama: number; error: { baris: number; pesan: string }[] }

/** Contoh baris template: satu per moda (trucking, laut, udara, kereta) supaya transport & intermodal bisa diisi di satu sheet. */
const CONTOH: Row[] = [
  { moda: 'darat', origin: 'Jakarta', destination: 'Surabaya', armada: 'CDD Box', basis: 'trip', harga: null, vendor: '(nama vendor)', lead_time_hari: 2, cakupan: 'termasuk tol & BBM; tidak termasuk bongkar muat', sumber: 'quotation vendor' },
  { moda: 'darat', origin: 'Cibitung', destination: 'Tanjung Priok', armada: 'Trailer 20 ft', basis: 'trip', harga: null, vendor: '(nama vendor)', lead_time_hari: 1, cakupan: 'pickup / delivery container', sumber: 'quotation vendor' },
  { moda: 'laut', origin: 'Tanjung Priok', destination: 'Makassar New Port', armada: 'Container 20 ft', basis: 'container', harga: null, vendor: '(shipping line)', lead_time_hari: 5, cakupan: 'port to port, belum THC', sumber: 'quotation vendor' },
  { moda: 'udara', origin: 'Soekarno-Hatta (CGK)', destination: 'Sultan Hasanuddin (UPG)', armada: 'Air Cargo General', basis: 'kg', harga: null, vendor: '(airline / GSA)', lead_time_hari: 1, min_charge: null, cakupan: 'airport to airport, min. 10 kg', sumber: 'quotation vendor' },
  { moda: 'kereta', origin: 'Jakarta', destination: 'Surabaya', armada: 'Kereta Container 20 ft', basis: 'container', harga: null, vendor: '(operator KA)', lead_time_hari: 2, cakupan: 'stasiun ke stasiun', sumber: 'quotation vendor' },
];

export default function MarketPrice({ moda, judul }: { moda?: Moda[]; judul: string }) {
  const { profile } = useProfile();
  const sb = supabaseBrowser();
  const kolom = useMemo(() => kolomMarket(moda), [moda]);
  const [versi, setVersi] = useState(0);
  const [pv, setPv] = useState<Pratinjau | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [filterModa, setFilterModa] = useState<Moda | 'semua'>('semua');
  const bolehEdit = !!profile && (!!profile.is_master || ['admin', 'manager', ...PERAN_EDIT].includes(profile.role));
  const kolomExcel: KolomExcel[] = kolom.map(k => ({ key: k.key, label: k.label, type: k.type === 'number' || k.type === 'date' ? k.type : 'text' }));
  const modaDefault = moda?.[0] ?? 'darat';
  const contoh: Row[] = CONTOH.filter(r => !moda || moda.includes(r.moda as Moda));
  const modaTampil = filterModa === 'semua' ? moda : [filterModa];

  async function unggah(f: File | undefined) {
    if (!f) return;
    setErr(null); setOk(null); setSibuk('Membaca file…');
    try {
      const { rows } = await importExcel(f, kolomExcel);
      const { data: ada, error } = await sb.from('transport_rates').select('id, moda, origin, destination, armada, basis, vendor, harga').limit(10000);
      if (error) throw new Error(error.message);
      const peta = new Map((ada ?? []).map((r: Row) => [kunci(r), r]));
      const hasil: Pratinjau = { file: f.name, baru: [], ubah: [], sama: 0, error: [] };
      const sudah = new Set<string>();
      rows.forEach((r, i) => {
        const baris = i + 2;
        const row: Row = { ...r, moda: String(r.moda ?? modaDefault).toLowerCase(), basis: String(r.basis ?? 'trip').toLowerCase(), vendor: String(r.vendor ?? '').trim() };
        if (!row.origin || !row.destination) { hasil.error.push({ baris, pesan: 'origin / destination kosong' }); return; }
        if (!row.armada) { hasil.error.push({ baris, pesan: 'armada kosong' }); return; }
        if (!MODA.some(m => m.v === row.moda)) { hasil.error.push({ baris, pesan: `moda "${row.moda}" tidak dikenal` }); return; }
        if (!BASIS.some(b => b.v === row.basis)) { hasil.error.push({ baris, pesan: `basis "${row.basis}" tidak dikenal` }); return; }
        if (!(Number(row.harga) > 0)) { hasil.error.push({ baris, pesan: 'harga beli kosong / 0' }); return; }
        const k = kunci(row);
        if (sudah.has(k)) { hasil.error.push({ baris, pesan: 'baris dobel di file (rute, armada, basis & vendor sama)' }); return; }
        sudah.add(k);
        const lama = peta.get(k) as Row | undefined;
        if (!lama) hasil.baru.push(row);
        else if (Number(lama.harga) !== Number(row.harga)) hasil.ubah.push({ id: Number(lama.id), lama: Number(lama.harga), row });
        else hasil.sama++;
      });
      setPv(hasil);
    } catch (e) { setErr(`Upload gagal: ${(e as Error).message}`); }
    setSibuk(null);
  }

  async function simpan() {
    if (!pv) return;
    setSibuk('Menyimpan…'); setErr(null);
    const gagal: string[] = [];
    const bersih = (r: Row) => Object.fromEntries(kolom.map(k => [k.key, r[k.key] === '' ? null : r[k.key] ?? null]));
    for (let i = 0; i < pv.baru.length; i += 200) {
      const { error } = await sb.from('transport_rates').insert(pv.baru.slice(i, i + 200).map(r => ({ ...bersih(r), status: 'draft' })));
      if (error) gagal.push(`baris baru ${i + 1}–${Math.min(i + 200, pv.baru.length)}: ${error.message}`);
    }
    for (const u of pv.ubah) {
      const { error } = await sb.from('transport_rates').update({ ...bersih(u.row), status: 'draft' }).eq('id', u.id);
      if (error) gagal.push(`ID ${u.id}: ${error.message}`);
    }
    setSibuk(null);
    if (gagal.length) setErr(`Sebagian gagal (${gagal.length}): ${gagal.slice(0, 3).join(' · ')}`);
    else setOk(`${pv.baru.length} harga baru ditambahkan, ${pv.ubah.length} harga diperbarui.`);
    setPv(null); setVersi(v => v + 1);
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h2>{judul}</h2>
        <p className="small muted" style={{ margin: 0 }}>Harga beli vendor per rute. Dipakai tender sebagai pilihan vendor & harga (termurah tampil pertama). Isi banyak harga sekaligus: unduh template → isi di Excel → upload. Baris dengan moda, origin, destination, armada, basis & vendor yang sama dianggap harga yang sama → diperbarui; kombinasi baru → ditambahkan.</p>
        <div className="row">
          <button className="ghost" onClick={() => unduhTemplate(kolom, contoh, 'Template_Market_Price')}>Unduh template Excel (semua moda)</button>
          {bolehEdit && <label className="btn ghost" style={{ cursor: 'pointer' }}>Upload Excel
            <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={e => { unggah(e.target.files?.[0]); e.target.value = ''; }} /></label>}
          {sibuk && <span className="small muted">{sibuk}</span>}
          {ok && <span className="pill ok">{ok}</span>}
        </div>
        {err && <p className="error small">{err}</p>}
        {pv && <div className="notice small" style={{ display: 'grid', gap: 6 }}>
          <div><b>Pratinjau {pv.file}</b>: {pv.baru.length} harga baru · {pv.ubah.length} harga berubah · {pv.sama} sama (dilewati) · {pv.error.length} baris error (dilewati)</div>
          {pv.ubah.length > 0 && <div className="tablewrap fit"><table className="tabel-fit">
            <thead><tr><th>Rute</th><th>Armada · basis</th><th>Vendor</th><th className="num">Harga lama</th><th className="num">Harga baru</th></tr></thead>
            <tbody>{pv.ubah.slice(0, 50).map(u => <tr key={u.id}><td>{String(u.row.origin)} → {String(u.row.destination)}</td><td>{String(u.row.armada)} · {String(u.row.basis)}</td><td>{String(u.row.vendor)}</td><td className="num">{rp(u.lama)}</td><td className="num"><b>{rp(Number(u.row.harga))}</b></td></tr>)}</tbody>
          </table></div>}
          {pv.error.length > 0 && <div style={{ color: 'var(--bad)' }}>{pv.error.slice(0, 8).map(e => `baris ${e.baris}: ${e.pesan}`).join(' · ')}{pv.error.length > 8 ? ' …' : ''}</div>}
          <div className="row"><button disabled={!pv.baru.length && !pv.ubah.length || !!sibuk} onClick={simpan}>Simpan {pv.baru.length + pv.ubah.length} harga</button><button className="ghost" onClick={() => setPv(null)}>Batal</button></div>
        </div>}
      </div>
      {(!moda || moda.length > 1) && <div className="tabs" role="tablist" aria-label="Filter moda">
        {(['semua', ...(moda ?? MODA.map(m => m.v))] as (Moda | 'semua')[]).map(m => <button key={m} role="tab" aria-selected={filterModa === m} className={filterModa === m ? 'on' : ''} onClick={() => setFilterModa(m)}>
          {m === 'semua' ? 'Semua moda' : MODA.find(x => x.v === m)?.l}</button>)}</div>}
      <TableEditor key={`${versi}-${filterModa}`} table="transport_rates" kolom={kolom} editorRoles={[...PERAN_EDIT]} approval orderBy={[{ col: 'moda' }, { col: 'origin' }, { col: 'destination' }, { col: 'harga' }]}
        cari={['origin', 'destination', 'armada', 'vendor']} defaults={{ moda: filterModa === 'semua' ? modaDefault : filterModa, basis: filterModa === 'laut' || filterModa === 'kereta' ? 'container' : filterModa === 'udara' ? 'kg' : 'trip' }} filter={modaTampil ? { moda: modaTampil } : undefined}
        profile={profile} namaExport="Market_Price" tanpaImport />
    </div>);
}
