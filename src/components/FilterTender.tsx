'use client';
import { JENIS_TENDER, type JenisTender } from '@/lib/tenderOverview';

/** Filter jenis tender (All / Warehouse / Transportation / Intermodal) + tahun dibuat. */
export default function FilterTender({ jenis, setJenis, tahun, setTahun, tahunList }: {
  jenis: '' | JenisTender; setJenis: (j: '' | JenisTender) => void; tahun: string; setTahun: (t: string) => void; tahunList: string[];
}) {
  return (
    <div className="row" style={{ alignItems: 'end' }}>
      <div className="tabs" role="tablist" aria-label="Jenis tender">
        {([['', 'All'], ...JENIS_TENDER.map(j => [j.v, j.l])] as [string, string][]).map(([v, l]) =>
          <button key={v} role="tab" aria-selected={jenis === v} className={jenis === v ? 'on' : ''} onClick={() => setJenis(v as '' | JenisTender)}>{l}</button>)}
      </div>
      <label className="f" style={{ minWidth: 120 }}>Tahun
        <select value={tahun} onChange={e => setTahun(e.target.value)}><option value="">Semua</option>{tahunList.map(t => <option key={t}>{t}</option>)}</select></label>
    </div>);
}
