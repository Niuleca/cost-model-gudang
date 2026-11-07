'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import {
  ANALISIS_DEFAULT, KOLOM_AKTUAL, analisisAkar, hitungMetrik, rataAktual, rencanaTransport, rencanaWarehouse,
  type AktualBulan, type AnalisisProyek, type Metrik, type StatusTindakan, type Tindakan,
} from '@/lib/analisisProyek';
import { importExcel } from '@/lib/excel';
import { angka, rp } from '@/lib/format';
import { labelStatus, pillStatus } from '@/lib/status';
import { hrefTender } from '@/lib/tenderOverview';

interface Tender { id: string; kode: string | null; customer: string; kab_kota: string; status: string; jenis_tender: string; asumsi: Record<string, unknown>; hasil: unknown }
const WARNA: Record<string, string> = { hijau: 'ok', kuning: 'warn', merah: 'bad', kosong: 'info' };
const LABEL_ST: Record<string, string> = { hijau: 'Sesuai', kuning: 'Perhatian', merah: 'Kritis', kosong: 'Belum ada data' };
const ST_TINDAKAN: { v: StatusTindakan; l: string }[] = [{ v: 'rencana', l: 'Rencana' }, { v: 'berjalan', l: 'Berjalan' }, { v: 'selesai', l: 'Selesai' }, { v: 'batal', l: 'Batal' }];
const idBaru = () => Math.random().toString(36).slice(2, 10);

function fmt(m: Metrik, v: number | null) {
  if (v == null) return '—';
  if (m.satuan === '%') return `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
  if (m.satuan.startsWith('Rp')) return rp(v);
  return angka(v, v < 100 ? 1 : 0);
}
function fmtSelisih(m: Metrik) {
  if (m.selisih == null) return '—';
  if (m.satuan === '%') return `${m.selisih >= 0 ? '+' : ''}${(m.selisih * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })} poin`;
  return `${m.selisih >= 0 ? '+' : ''}${m.satuan.startsWith('Rp') ? rp(m.selisih) : angka(m.selisih, Math.abs(m.selisih) < 100 ? 1 : 0)}`;
}

/** Grafik tren bulanan: pendapatan & biaya aktual (batang) + garis rencana. */
function Tren({ rows, rencana }: { rows: AktualBulan[]; rencana: { biaya: number; pendapatan: number } }) {
  if (!rows.length) return null;
  const maks = Math.max(rencana.biaya, rencana.pendapatan, ...rows.map(r => Math.max(Number(r.biayaBulan) || 0, Number(r.pendapatanBulan) || 0))) * 1.1 || 1;
  const W = 640, H = 200, kiri = 8, bawah = 24, lebar = (W - kiri) / rows.length;
  const y = (v: number) => H - bawah - (v / maks) * (H - bawah - 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tren pendapatan dan biaya bulanan vs rencana" style={{ width: '100%', maxWidth: 760, height: 'auto' }}>
      <line x1={kiri} x2={W} y1={y(rencana.pendapatan)} y2={y(rencana.pendapatan)} stroke="#1f6f43" strokeDasharray="5 4" />
      <line x1={kiri} x2={W} y1={y(rencana.biaya)} y2={y(rencana.biaya)} stroke="#b45309" strokeDasharray="5 4" />
      {rows.map((r, i) => {
        const x = kiri + i * lebar, bw = Math.min(26, lebar / 2.6);
        const p = Number(r.pendapatanBulan) || 0, b = Number(r.biayaBulan) || 0;
        return <g key={r.periode}>
          <rect x={x + lebar / 2 - bw - 1} y={y(p)} width={bw} height={H - bawah - y(p)} fill="#2f8f5b" rx="2"><title>{`${r.periode} pendapatan ${rp(p)}`}</title></rect>
          <rect x={x + lebar / 2 + 1} y={y(b)} width={bw} height={H - bawah - y(b)} fill="#d08a2b" rx="2"><title>{`${r.periode} biaya ${rp(b)}`}</title></rect>
          <text x={x + lebar / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="currentColor">{r.periode.slice(2)}</text>
        </g>;
      })}
    </svg>);
}

export default function AnalisisProyekDetail() {
  const { id } = useParams<{ id: string }>();
  const sb = supabaseBrowser();
  const [t, setT] = useState<Tender | null>(null);
  const [an, setAn] = useState<AnalisisProyek>(ANALISIS_DEFAULT);
  const [err, setErr] = useState<string | null>(null);
  const [kotor, setKotor] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [mode, setMode] = useState<'terakhir' | '3' | 'semua' | string>('terakhir');
  useEffect(() => {
    sb.from('tenders').select('id, kode, customer, kab_kota, status, jenis_tender, asumsi, hasil').eq('id', id).single()
      .then(({ data, error }: { data: Tender | null; error: { message: string } | null }) => {
        if (error || !data) { setErr(error?.message ?? 'Project tidak ditemukan'); return; }
        setT(data); setAn({ ...ANALISIS_DEFAULT, ...((data.asumsi?.analisis as AnalisisProyek | undefined) ?? {}) });
      });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // simpan otomatis: ambil asumsi terbaru dulu supaya perubahan di halaman tender tidak tertimpa
  const anRef = useRef(an); anRef.current = an;
  useEffect(() => {
    if (!kotor) return;
    const h = setTimeout(async () => {
      const { data, error } = await sb.from('tenders').select('asumsi').eq('id', id).single();
      if (error) { setErr(error.message); return; }
      const { data: upd, error: e2 } = await sb.from('tenders').update({ asumsi: { ...(data?.asumsi ?? {}), analisis: anRef.current } }).eq('id', id).select('id');
      if (e2) setErr(`Gagal menyimpan: ${e2.message}`); else if (!upd?.length) setErr('Tidak tersimpan: tidak punya akses ubah project ini.'); else { setErr(null); setKotor(false); }
    }, 2000);
    return () => clearTimeout(h);
  }, [kotor, an]); // eslint-disable-line react-hooks/exhaustive-deps
  const ubah = (p: Partial<AnalisisProyek>) => { setAn(x => ({ ...x, ...p })); setKotor(true); };

  const urut = useMemo(() => [...an.aktual].sort((a, b) => a.periode.localeCompare(b.periode)), [an.aktual]);
  const rencana = useMemo(() => (t ? (t.jenis_tender === 'warehouse' ? rencanaWarehouse(t) : rencanaTransport(t)) : null), [t]);
  const pilihan = mode === 'terakhir' ? urut.slice(-1) : mode === '3' ? urut.slice(-3) : mode === 'semua' ? urut : urut.filter(r => r.periode === mode);
  const aktual = rataAktual(pilihan);
  const metrik = rencana ? hitungMetrik(rencana, aktual, { hijau: an.ambangHijau ?? 0.05, kuning: an.ambangKuning ?? 0.15 }) : [];
  const temuan = analisisAkar(metrik);
  if (!t) return <p className="muted">{err ?? 'Memuat project…'}</p>;

  const setBaris = (i: number, p: Partial<AktualBulan>) => ubah({ aktual: an.aktual.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const tambahBulan = () => {
    const akhir = urut.at(-1)?.periode;
    const d = akhir ? new Date(`${akhir}-01T00:00:00`) : new Date();
    if (akhir) d.setMonth(d.getMonth() + 1);
    const periode = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    ubah({ aktual: [...an.aktual, { periode, volumeIn: null, volumeOut: null, stokRata: null, headcount: null, headcountDirect: null, hariKerja: rencana?.hariKerja ?? 25,
      luasDipakaiM2: null, posisiPalet: rencana?.posisiPalet || null, biayaBulan: null, pendapatanBulan: null }] });
  };
  const tambahTindakan = (metrikNama: string, akar: string, tindakan: string) =>
    ubah({ tindakan: [...an.tindakan, { id: idBaru(), metrik: metrikNama, akarMasalah: akar, tindakan, pic: '', target: '', status: 'rencana' }] });
  const setTindakan = (i: number, p: Partial<Tindakan>) => ubah({ tindakan: an.tindakan.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  async function unduhTemplate() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Aktual bulanan');
    ws.columns = KOLOM_AKTUAL.map(k => ({ header: k.label, key: k.key as string, width: k.key === 'catatan' ? 30 : 18 }));
    for (const r of urut) ws.addRow(KOLOM_AKTUAL.map(k => (r[k.key] ?? null) as string | number | null));
    if (!urut.length) ws.addRow(['2026-01']);
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = `Aktual_${t!.kode ?? t!.customer}.xlsx`; a.click(); URL.revokeObjectURL(url);
  }
  async function unggah(f?: File) {
    if (!f) return; setInfo(null);
    try {
      const { rows } = await importExcel(f, KOLOM_AKTUAL.map(k => ({ key: k.key as string, label: k.label, type: k.type })));
      const valid = rows.map(r => ({ ...r, periode: String(r.periode ?? '').slice(0, 7) })).filter(r => /^\d{4}-\d{2}$/.test(r.periode)) as unknown as AktualBulan[];
      const peta = new Map(an.aktual.map(r => [r.periode, r]));
      let baru = 0, ganti = 0;
      for (const r of valid) { if (peta.has(r.periode)) ganti++; else baru++; peta.set(r.periode, { ...(peta.get(r.periode) ?? {}), ...r }); }
      ubah({ aktual: Array.from(peta.values()) });
      setInfo(`${f.name}: ${baru} bulan baru, ${ganti} bulan diperbarui${rows.length - valid.length ? `, ${rows.length - valid.length} baris dilewati (periode bukan YYYY-MM)` : ''}.`);
    } catch (e) { setInfo(`Upload gagal: ${(e as Error).message}`); }
  }

  const kolomInput = KOLOM_AKTUAL.filter(k => !['biayaManpower', 'biayaSewa', 'biayaMhe', 'biayaUtilitas', 'biayaLain'].includes(k.key as string));
  return (
    <>
      <div className="head">
        <div><div className="eyebrow"><Link href="/analisis">Project Analysis</Link> · {t.kode}</div><h1>{t.customer}</h1></div>
        <div className="row small"><span className={`pill ${pillStatus(t.status)}`}>{labelStatus(t.status)}</span>
          <span className="muted">{kotor ? 'Menyimpan…' : 'Tersimpan'}</span>
          <Link className="btn ghost" href={hrefTender(t)}>Buka tender</Link></div>
      </div>
      {err && <p className="error">{err}</p>}
      {!rencana && <div className="notice">Asumsi sistem belum ada: buka tender, tekan <b>Hitung</b> lalu <b>Simpan hasil</b> di tab Result supaya angka rencana bisa dibandingkan.</div>}

      {rencana && <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>System assumption vs actual performance</h2>
          <label className="row small" style={{ gap: 6 }}>Aktual
            <select value={mode} onChange={e => setMode(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="terakhir">Bulan terakhir{urut.length ? ` (${urut.at(-1)!.periode})` : ''}</option>
              <option value="3">Rata-rata 3 bulan terakhir</option><option value="semua">Rata-rata semua bulan</option>
              {urut.map(r => <option key={r.periode} value={r.periode}>{r.periode}</option>)}
            </select></label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Asumsi sistem: {rencana.sumber}. Aktual: {aktual ? aktual.periode : 'belum diisi — tambahkan data bulanan di bawah'}. Warna: hijau ≤ {Math.round((an.ambangHijau ?? 0.05) * 100)}% menyimpang ke arah buruk, kuning ≤ {Math.round((an.ambangKuning ?? 0.15) * 100)}%, merah di atasnya; GP dinilai per poin persen (≤ 1 poin hijau, ≤ 3 poin kuning).</p>
        <div className="kpis">
          {metrik.filter(m => ['volOut', 'hc', 'prod', 'util', 'biaya', 'gp'].includes(m.kode)).map(m => (
            <div key={m.kode} className="kpi"><span className="small muted">{m.label}</span><b>{fmt(m, m.aktual)}</b>
              <span className="small">rencana {fmt(m, m.rencana)} · <span className={`pill ${WARNA[m.status]}`}>{m.persen != null && m.satuan !== '%' ? `${m.persen >= 0 ? '+' : ''}${(m.persen * 100).toFixed(1)}%` : LABEL_ST[m.status]}</span></span></div>))}
        </div>
        <div className="tablewrap fit"><table className="tabel-fit">
          <thead><tr><th>Metrik</th><th className="num">Asumsi sistem</th><th className="num">Aktual</th><th className="num">Selisih</th><th className="num">Variance</th><th>Status</th><th>Keterangan</th></tr></thead>
          <tbody>{metrik.map(m => (
            <tr key={m.kode} className={m.status === 'merah' ? 'baris-merah' : undefined}>
              <td><b>{m.label}</b><div className="small muted">{m.satuan}</div></td>
              <td className="num">{fmt(m, m.rencana)}</td><td className="num"><b>{fmt(m, m.aktual)}</b></td>
              <td className="num">{fmtSelisih(m)}</td><td className="num">{m.persen == null || m.satuan === '%' ? '—' : `${m.persen >= 0 ? '+' : ''}${(m.persen * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`}</td>
              <td><span className={`pill ${WARNA[m.status]}`}>{LABEL_ST[m.status]}</span></td><td className="small">{m.ket}</td>
            </tr>))}</tbody>
        </table></div>
        {urut.length > 0 && <div><h3 style={{ margin: '6px 0' }}>Tren bulanan</h3>
          <Tren rows={urut} rencana={{ biaya: rencana.biayaBulan, pendapatan: rencana.pendapatanBulan }} />
          <div className="small muted">Batang hijau = pendapatan aktual, oranye = biaya aktual; garis putus hijau / oranye = rencana.</div></div>}
      </div>}

      {rencana && <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Root cause & corrective action</h2>
        {!aktual && <p className="muted small">Isi data aktual untuk melihat analisis akar masalah.</p>}
        {aktual && !temuan.length && <p className="small"><span className="pill ok">Sesuai rencana</span> Tidak ada variance yang perlu ditindaklanjuti untuk periode ini.</p>}
        {temuan.map(f => (
          <div key={f.kode} className="bl-seksi">
            <div className="row" style={{ justifyContent: 'space-between' }}><h3>{f.judul}</h3><span className={`pill ${WARNA[f.tingkat]}`}>{LABEL_ST[f.tingkat]}</span></div>
            <p className="small" style={{ margin: 0 }}>{f.bukti}</p>
            <div className="grid-isi" style={{ alignItems: 'start' }}>
              <div><b className="small">Kemungkinan akar masalah</b><ul className="small" style={{ margin: '4px 0 0 18px' }}>{f.akar.map(x => <li key={x}>{x}</li>)}</ul></div>
              <div><b className="small">Rekomendasi tindakan korektif</b><ul className="small" style={{ margin: '4px 0 0 18px' }}>{f.tindakan.map(x => (
                <li key={x}>{x} <button className="link-kecil" onClick={() => tambahTindakan(f.judul, f.akar[0], x)}>+ jadikan tindakan</button></li>))}</ul></div>
            </div>
          </div>))}
        <h3 style={{ margin: '8px 0 0' }}>Action tracker (perbaikan & improvement)</h3>
        <div className="tablewrap fit"><table className="tabel-fit">
          <thead><tr><th>Metrik</th><th>Akar masalah (konfirmasi)</th><th>Tindakan</th><th>PIC</th><th>Target</th><th>Status</th><th>Hasil / improvement</th><th></th></tr></thead>
          <tbody>
            {an.tindakan.length === 0 && <tr><td colSpan={8} className="muted">Belum ada tindakan. Pilih “+ jadikan tindakan” dari rekomendasi, atau tambah manual.</td></tr>}
            {an.tindakan.map((x, i) => (
              <tr key={x.id}>
                <td><input aria-label="Metrik" value={x.metrik} onChange={e => setTindakan(i, { metrik: e.target.value })} /></td>
                <td><input aria-label="Akar masalah" value={x.akarMasalah} onChange={e => setTindakan(i, { akarMasalah: e.target.value })} /></td>
                <td><input aria-label="Tindakan" value={x.tindakan} onChange={e => setTindakan(i, { tindakan: e.target.value })} /></td>
                <td><input aria-label="PIC" value={x.pic} onChange={e => setTindakan(i, { pic: e.target.value })} /></td>
                <td><input aria-label="Target" type="date" value={x.target} onChange={e => setTindakan(i, { target: e.target.value })} /></td>
                <td><select aria-label="Status tindakan" value={x.status} onChange={e => setTindakan(i, { status: e.target.value as StatusTindakan })}>{ST_TINDAKAN.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select></td>
                <td><input aria-label="Hasil" value={x.dampak ?? ''} placeholder="mis. produktivitas +12%" onChange={e => setTindakan(i, { dampak: e.target.value })} /></td>
                <td><button className="danger" aria-label="Hapus" onClick={() => ubah({ tindakan: an.tindakan.filter((_, j) => j !== i) })}>×</button></td>
              </tr>))}
          </tbody>
        </table></div>
        <div className="row"><button className="ghost" onClick={() => tambahTindakan('', '', '')}>+ Tindakan manual</button></div>
      </div>}

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Data aktual bulanan</h2>
          <div className="row">
            <button className="ghost" onClick={unduhTemplate}>Unduh template Excel</button>
            <label className="btn ghost" style={{ cursor: 'pointer' }}>Upload Excel<input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={e => { unggah(e.target.files?.[0]); e.target.value = ''; }} /></label>
            <button onClick={tambahBulan}>+ Bulan</button>
          </div>
        </div>
        {info && <p className="small notice">{info}</p>}
        {rencana && <p className="small muted" style={{ margin: 0 }}>Isi dengan satuan yang sama dengan rencana: volume dalam <b>{rencana.satuanVolume}</b>, stok dalam <b>{rencana.satuanStok}</b>. Rincian biaya (manpower, sewa, MHE, utilitas, lain) bisa diisi lewat Excel.</p>}
        <div className="tablewrap fit"><table className="tabel-fit tabel-aktual">
          <thead><tr>{kolomInput.map(k => <th key={k.key as string} className={k.type === 'number' ? 'num' : undefined}>{k.label}</th>)}<th></th></tr></thead>
          <tbody>
            {an.aktual.length === 0 && <tr><td colSpan={kolomInput.length + 1} className="muted">Belum ada data aktual. Klik “+ Bulan” atau upload Excel.</td></tr>}
            {an.aktual.map((r, i) => (
              <tr key={`${r.periode}-${i}`}>
                {kolomInput.map(k => (
                  <td key={k.key as string} className={k.type === 'number' ? 'num' : undefined}>
                    {k.key === 'periode' ? <input aria-label="Periode" type="month" value={r.periode} onChange={e => setBaris(i, { periode: e.target.value })} />
                      : <input aria-label={k.label} type={k.type === 'number' ? 'number' : 'text'} step="any" value={(r[k.key] as string | number | null) ?? ''}
                        onChange={e => setBaris(i, { [k.key]: k.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value } as Partial<AktualBulan>)} />}
                  </td>))}
                <td><button className="danger" aria-label="Hapus bulan" onClick={() => ubah({ aktual: an.aktual.filter((_, j) => j !== i) })}>×</button></td>
              </tr>))}
          </tbody>
        </table></div>
      </div>
    </>);
}
