'use client';
import { useState } from 'react';
import { T } from '@/lib/i18n';
import type { DataExport } from '@/lib/exportTender';

type Pratinjau = { nama: string; baris: number; kolom: number; rows: (string | number | null)[][]; gaya?: ({ bg?: string; b?: boolean; pct?: boolean } | null)[][] };
const KET: Record<string, string> = {
  'Ringkasan': 'Cost, selling, profit, GP, headcount, luas, rate card, biaya per kelompok, red flag',
  'Input': 'Data tender & key assumption',
  'Volume': 'Volume, volume desain, profil order, order admin',
  'Process Design': 'Aktivitas, rincian per task, Man Power & MHE Summary, kalender',
  'Biaya Manpower': 'Format sheet manpower dengan rumus Excel aktif + skema kenaikan',
  'Space & MHE': 'Hasil space & MHE + input MHE',
  'Biaya': 'Semua baris biaya per bulan + biaya lain & listrik',
  'Rate & Simulasi': 'Rate card, margin total, simulasi, tarif storage alternatif',
  'Master Data': 'UMK, payroll, finance, margin, jabatan, hari libur yang dipakai',
  'Data Mentah': 'Seluruh isi asumsi & hasil (path → nilai) untuk audit',
};
const kolom = (c: number) => { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
const fmt = (v: string | number | null) => v == null ? '' : typeof v === 'number' ? (Math.abs(v) >= 10000 ? Math.round(v).toLocaleString('id-ID') : Number.isInteger(v) ? String(v) : v.toLocaleString('id-ID', { maximumFractionDigits: 4 })) : String(v);

/** Tab Export: siapkan data → review isi tiap sheet → pilih sheet → unduh .xlsx. */
export default function ExportPanel({ siapkan, namaFile }: { siapkan: () => Promise<DataExport>; namaFile: string }) {
  const [data, setData] = useState<DataExport | null>(null);
  const [pv, setPv] = useState<Pratinjau[] | null>(null);
  const [aktif, setAktif] = useState(0);
  const [pilih, setPilih] = useState<string[]>([]);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function muatReview() {
    setSibuk(true); setPesan('Menghitung ulang & menyusun workbook…');
    try {
      const d = await siapkan();
      const { pratinjauWorkbook } = await import('@/lib/exportTender');
      const p = await pratinjauWorkbook(d);
      setData(d); setPv(p); setPilih(p.map(x => x.nama)); setAktif(0); setPesan(null);
    } catch (e) { setPesan(`Gagal menyiapkan: ${(e as Error).message}`); }
    setSibuk(false);
  }
  async function unduh() {
    if (!data) return;
    setSibuk(true); setPesan('Membuat file…');
    try { const { exportTenderLengkap } = await import('@/lib/exportTender'); await exportTenderLengkap(data, pilih); setPesan('File diunduh.'); }
    catch (e) { setPesan(`Gagal export: ${(e as Error).message}`); }
    setSibuk(false);
  }
  const sh = pv?.[aktif];

  return (
    <div className="card" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2><T>Export Excel</T></h2>
        <div className="row">
          {pesan && <span className="small" role="status">{pesan}</span>}
          <button className="ghost" onClick={muatReview} disabled={sibuk}>{pv ? '↻ Muat ulang review' : 'Siapkan review'}</button>
          <button onClick={unduh} disabled={!data || sibuk || !pilih.length}>⬇ Unduh {pilih.length ? `${pilih.length} sheet` : ''} (.xlsx)</button>
        </div>
      </div>
      <p className="small muted">Tender dihitung ulang dengan data master terbaru, lalu disusun menjadi workbook <b>{namaFile}</b>. Review isi tiap sheet di bawah, hapus centang sheet yang tidak perlu, lalu unduh.
        Sheet <b>Biaya Manpower</b> berisi rumus aktif — di Excel, ubah sel kuning untuk simulasi.</p>

      {!pv && <div className="umk-box"><span className="small">Tekan <b>Siapkan review</b> untuk melihat isi file sebelum diunduh.</span></div>}

      {pv && <>
        <div className="tablewrap"><table>
          <thead><tr><th style={{ width: 36 }}><input type="checkbox" aria-label="Pilih semua sheet" checked={pilih.length === pv.length} onChange={e => setPilih(e.target.checked ? pv.map(x => x.nama) : [])} /></th>
            <th>Sheet</th><th>Isi</th><th className="num">Baris</th><th /></tr></thead>
          <tbody>{pv.map((x, i) => <tr key={x.nama} style={i === aktif ? { background: 'var(--res)' } : undefined}>
            <td><input type="checkbox" aria-label={`Sertakan ${x.nama}`} checked={pilih.includes(x.nama)} onChange={e => setPilih(e.target.checked ? [...pilih, x.nama] : pilih.filter(n => n !== x.nama))} /></td>
            <td><b>{x.nama}</b></td><td className="small muted">{KET[x.nama] ?? ''}</td><td className="num">{x.baris.toLocaleString('id-ID')}</td>
            <td><button className="ghost" onClick={() => setAktif(i)} disabled={i === aktif}>{i === aktif ? 'Sedang direview' : 'Review'}</button></td>
          </tr>)}</tbody>
        </table></div>

        {sh && <div style={{ minWidth: 0 }}>
          <div className="tabs" role="tablist" style={{ marginBottom: 8 }}>
            {pv.map((x, i) => <button key={x.nama} role="tab" aria-selected={i === aktif} className={i === aktif ? 'on' : ''} onClick={() => setAktif(i)}>{x.nama}</button>)}
          </div>
          <p className="small muted">Pratinjau sheet <b>{sh.nama}</b>{sh.baris > sh.rows.length ? ` — ${sh.rows.length} dari ${sh.baris.toLocaleString('id-ID')} baris pertama` : ''}. Warna & angka sama seperti di file Excel (header rumus/hasil silver · header input abu-abu muda · isi input putih tulang · isi hasil abu-abu).</p>
          <div className="tablewrap xl-prev" style={{ maxHeight: '65vh' }}><table>
            <thead><tr><th className="num">#</th>{Array.from({ length: Math.min(sh.kolom, 40) }, (_, c) => <th key={c} className="num">{kolom(c)}</th>)}</tr></thead>
            <tbody>{sh.rows.map((r, i) => <tr key={i}>
              <td className="num muted small">{i + 1}</td>
              {Array.from({ length: Math.min(sh.kolom, 40) }, (_, c) => { const v = r[c] ?? null; const g = sh.gaya?.[i]?.[c];
                return <td key={c} className={typeof v === 'number' ? 'num' : undefined} style={g ? { background: g.bg, fontWeight: g.b ? 700 : undefined } : undefined}>
                  {g?.pct && typeof v === 'number' ? `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%` : fmt(v)}</td>; })}
            </tr>)}</tbody>
          </table></div>
        </div>}
      </>}
    </div>);
}
