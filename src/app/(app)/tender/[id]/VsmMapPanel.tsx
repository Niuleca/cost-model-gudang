'use client';
// Tab "Landmark VSM": peta value stream per lane (dari tahap aktivitas), centang proses / aktivitas (yang dimatikan tidak
// dihitung biaya), dan SOP per proses — draft otomatis yang bisa diedit, diganti file upload, dan diunduh sebagai Word.
import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import type { AktivitasInput } from '@/lib/engine/types';
import type { HasilPD } from '@/lib/engine/processDesign';
import { angka } from '@/lib/format';
import { supabaseBrowser } from '@/lib/supabase/client';
import { buatDocx, type BlokDocx } from '@/lib/docxSederhana';
import { buatPdf } from '@/lib/pdfDariBlok';
import { LEAD_KPI, adaBuffer, ikonAlat, leadKpi, leadTimeDefault, namaTool, sopEfektif, susunVsm, type FteAktivitas, type ProsesVsm, type SopInput, type VsmInput } from '@/lib/vsmSop';
import IkonAlat from '@/components/IkonAlat';

const BUCKET = 'tender-sop';
const WARNA_LANE = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#db2777', '#4b5563'];
const unduhBlob = (b: Blob, nama: string) => { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = nama; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
const aman = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);

export default function VsmMapPanel({ tenderId, kode, customer, aktivitas, pd, vsm, onVsm, onAktif, bisaEdit }: {
  tenderId: string; kode: string; customer: string; aktivitas: AktivitasInput[]; pd: HasilPD | null;
  vsm: VsmInput | undefined; onVsm: (v: VsmInput) => void; onAktif: (idx: number[], aktif: boolean) => void; bisaEdit: boolean;
}) {
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  // FTE per aktivitas (index asli) dari Process Design (dihitung hanya atas aktivitas aktif)
  const fte = useMemo(() => {
    const aktifIdx = aktivitas.map((a, i) => (a.nonaktif ? -1 : i)).filter(i => i >= 0);
    const m = new Map<number, FteAktivitas>();
    for (const b of pd?.baris ?? []) {
      const idx = aktifIdx[b.no - 1]; if (idx == null) continue;
      const f = m.get(idx) ?? { role: 0, tool: 0, alat: {} };
      if (b.jenis === 'Man Power') f.role += b.fte;
      else if (b.resource === aktivitas[idx].tool) f.tool += b.fte;
      else f.alat[b.resource] = (f.alat[b.resource] ?? 0) + b.fte;
      m.set(idx, f);
    }
    return m;
  }, [aktivitas, pd]);
  const lanes = useMemo(() => susunVsm(aktivitas, fte), [aktivitas, fte]);
  const wiPrefix = vsm?.wiPrefix?.trim() || `WI-${kode || 'TND'}`;
  const sopMap = vsm?.sop ?? {};
  const setSop = (tahap: string, patch: Partial<SopInput> | null) => {
    const sop = { ...sopMap };
    if (patch === null) delete sop[tahap]; else sop[tahap] = { ...(sop[tahap] ?? {}), ...patch };
    onVsm({ ...(vsm ?? {}), sop });
  };
  const nAktif = aktivitas.filter(a => !a.nonaktif).length;
  const fteTotal = Array.from(fte.values()).reduce((s, f) => s + f.role, 0);

  async function unggah(p: ProsesVsm, f: File) {
    if (f.size > 15 * 1024 * 1024) { setPesan('File maksimal 15 MB.'); return; }
    if (!/\.(pdf|docx?|DOCX?|PDF)$/.test(f.name)) { setPesan('Format yang diterima: Word (.docx / .doc) atau PDF.'); return; }
    setSibuk(true); setPesan(null);
    const sb = supabaseBrowser();
    const path = `${tenderId}/${Date.now()}-${aman(p.tahap).replace(/\s/g, '_')}.${f.name.split('.').pop()?.toLowerCase()}`;
    const up = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (up.error) { setPesan(`Gagal upload: ${up.error.message}`); setSibuk(false); return; }
    const lama = sopMap[p.tahap]?.file?.path;
    setSop(p.tahap, { file: { path, nama: f.name, ukuran: f.size, at: new Date().toISOString() } });
    if (lama) await sb.storage.from(BUCKET).remove([lama]);
    setPesan(`SOP "${p.label}" diganti file ${f.name}. Jangan lupa simpan tender.`); setSibuk(false);
  }
  async function bukaFile(path: string) {
    const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(path, 600);
    if (error || !data) { setPesan(`Gagal membuka file: ${error?.message ?? ''}`); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }
  async function hapusFile(p: ProsesVsm) {
    const path = sopMap[p.tahap]?.file?.path; if (!path) return;
    await supabaseBrowser().storage.from(BUCKET).remove([path]);
    setSop(p.tahap, { file: null });
  }

  /** Dokumen Word SOP (semua proses aktif). */
  function blokSop(): BlokDocx[] {
    const b: BlokDocx[] = [
      { t: 'judul', teks: `Landmark VSM & SOP Operasional Gudang — ${customer || 'Customer'}` },
      { t: 'p', teks: `Tender ${kode || '-'} · dibuat ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · disusun dari Landmark VSM (Leca)`, kecil: true },
      { t: 'h1', teks: '1. Value Stream Map (ringkasan proses)' },
      { t: 'tabel', kolom: ['Lane', 'Proses', 'Aktivitas', 'Tools / MHE', 'Manpower (FTE)', 'Dokumen & sistem', 'WI'], lebar: [0.09, 0.13, 0.22, 0.15, 0.14, 0.18, 0.09],
        baris: lanes.flatMap(L => L.proses.filter(p => p.aktif).map(p => {
          const s = sopEfektif(p, wiPrefix, sopMap[p.tahap]);
          return [L.lane, `${p.label}${adaBuffer(p, vsm) ? '\n▲ buffer / staging' : ''}`, p.items.filter(i => i.aktif).map(i => i.aktivitas).join('\n'), [...s.mhe, ...s.alat].join('\n') || 'Manual', s.manpower.join('\n'),
            [...s.dokumen.split('\n'), ...s.sistem.split('\n').map(x => `[${x}]`)].filter(Boolean).join('\n'), s.wi];
        })) },
      { t: 'h3', teks: 'Lead time' },
      { t: 'list', item: [...LEAD_KPI.map(z => `${z.label}: ≤ ${angka(leadKpi(vsm, z.k), 1)} jam`), `Total dock to dock: ${angka(LEAD_KPI.reduce((a2, z) => a2 + leadKpi(vsm, z.k), 0), 1)} jam`,
        ...lanes.filter(L => L.aktif).map(L => `${L.lane}: ${vsm?.leadTime?.[L.lane] ?? leadTimeDefault(L.lane) ?? '-'}`)] },
    ];
    let no = 1;
    for (const L of lanes.filter(x => x.aktif)) {
      b.push({ t: 'halaman' }, { t: 'h1', teks: `${++no}. ${L.lane}` });
      for (const p of L.proses.filter(x => x.aktif)) {
        const s = sopEfektif(p, wiPrefix, sopMap[p.tahap]);
        b.push({ t: 'h2', teks: `${s.wi} — ${p.label}` });
        if (s.file) { b.push({ t: 'p', teks: `SOP proses ini mengikuti dokumen terlampir: ${s.file.nama} (file upload, disertakan di paket ZIP).`, miring: true }); continue; }
        b.push({ t: 'tabel', lebar: [0.24, 0.76], baris: [
          ['Tujuan', s.tujuan], ['Ruang lingkup', s.lingkup], ['Penanggung jawab (PIC)', s.pic],
          ['Manpower', s.manpower.join('\n') || '-'], ['MHE', s.mhe.join('\n') || 'Tidak ada (manual)'], ['Alat pendukung', s.alat.join('\n') || '-'],
          ['Dokumen', s.dokumen], ['Sistem', s.sistem], ['Buffer / staging', adaBuffer(p, vsm) ? 'Ya — barang menunggu di area staging setelah proses ini' : 'Tidak'],
          ['Lead time lane', vsm?.leadTime?.[L.lane] ?? leadTimeDefault(L.lane) ?? '-'],
        ] });
        b.push({ t: 'h3', teks: 'Langkah kerja' }, { t: 'list', nomor: true, item: s.langkah.split('\n') });
        b.push({ t: 'h3', teks: 'KPI / target' }, { t: 'list', item: s.kpi.split('\n') });
        b.push({ t: 'h3', teks: 'K3 / keselamatan' }, { t: 'list', item: s.k3.split('\n') });
        if (s.catatan.trim()) b.push({ t: 'h3', teks: 'Catatan' }, { t: 'p', teks: s.catatan });
      }
    }
    const mati = lanes.flatMap(L => L.proses.flatMap(p => p.items.filter(i => !i.aktif).map(i => `${L.lane} · ${p.label}: ${i.aktivitas}`)));
    if (mati.length) b.push({ t: 'h3', teks: 'Proses / aktivitas yang tidak dipakai di tender ini' }, { t: 'list', item: mati });
    return b;
  }
  async function unduhWord() {
    setSibuk(true);
    try { unduhBlob(await buatDocx(blokSop(), `SOP ${customer}`), `SOP_${aman(customer || 'tender')}_${kode || ''}.docx`); }
    finally { setSibuk(false); }
  }
  async function unduhPdf() {
    setSibuk(true);
    try { unduhBlob(await buatPdf(blokSop(), `Landmark VSM & SOP — ${customer || ''} ${kode || ''}`), `SOP_${aman(customer || 'tender')}_${kode || ''}.pdf`); }
    finally { setSibuk(false); }
  }
  async function unduhZip() {
    setSibuk(true); setPesan(null);
    try {
      const z = new JSZip(); const sb = supabaseBrowser();
      z.file(`SOP_${aman(customer || 'tender')}_${kode || ''}.docx`, await buatDocx(blokSop(), `SOP ${customer}`));
      for (const L of lanes) for (const p of L.proses.filter(x => x.aktif)) {
        const f = sopMap[p.tahap]?.file; if (!f) continue;
        const { data, error } = await sb.storage.from(BUCKET).download(f.path);
        if (error || !data) { setPesan(`Lampiran ${f.nama} gagal diunduh: ${error?.message ?? ''}`); continue; }
        z.file(`lampiran/${aman(sopEfektif(p, wiPrefix, sopMap[p.tahap]).wi)} - ${aman(f.nama)}`, data);
      }
      unduhBlob(await z.generateAsync({ type: 'blob' }), `Paket_SOP_${aman(customer || 'tender')}_${kode || ''}.zip`);
    } finally { setSibuk(false); }
  }
  const adaFile = lanes.some(L => L.proses.some(p => p.aktif && sopMap[p.tahap]?.file));

  const tglVersi = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const setBuffer = (tahap: string, v: boolean) => onVsm({ ...(vsm ?? {}), buffer: { ...(vsm?.buffer ?? {}), [tahap]: v } });
  const totalLead = LEAD_KPI.reduce((a2, z) => a2 + leadKpi(vsm, z.k), 0);

  return <>
    <div className="card lm-card">
      <div className="lm-kop">
        <div>
          <h2 style={{ margin: 0 }}>LANDMARK VALUE STREAM MAP</h2>
          <div className="small muted">{customer || 'Customer'} · tender {kode || '-'} · versi{' '}
            <input aria-label="Versi Landmark VSM" className="lm-versi" value={vsm?.versi ?? ''} placeholder="v.01" disabled={!bisaEdit} onChange={e => onVsm({ ...(vsm ?? {}), versi: e.target.value })} /> · {tglVersi}</div>
        </div>
        <span className="small muted"><b>{nAktif}</b> dari {aktivitas.length} aktivitas aktif · manpower direct ± <b>{angka(fteTotal, 1)}</b> FTE</span>
      </div>
      <div className="lm-entitas" aria-label="Alur entitas">
        <div className="lm-ent">Supplier / pengirim</div><span className="lm-panah">→</span>
        <div className="lm-ent utama">Gudang {customer || ''}</div><span className="lm-panah">→</span>
        <div className="lm-ent">Toko / customer akhir</div>
      </div>
      <p className="small muted">Peta otomatis dari tahap aktivitas di tab <b>Value Stream Mapping</b> (lane = bagian sebelum &quot;-&quot;, mis. <i>Inbound</i> - Receiving).
        Hapus centang proses / aktivitas yang tidak dipakai — proses itu <b>tidak dihitung</b> di manpower, MHE dan biaya, dan tidak masuk SOP (bisa dicentang lagi kapan saja).</p>
      <div className="lm-legend small">
        <span><i className="lm-box" />proses operasi</span><span><i className="lm-doc" />dokumen</span><span><i className="lm-db" />sistem</span>
        <span><i className="lm-seg" />buffer / staging</span><span><IkonAlat jenis="rf" ukuran={16} />RF</span><span><IkonAlat jenis="scanner" ukuran={16} />barcode</span>
        <span><IkonAlat jenis="kertas" ukuran={16} />manual (kertas)</span><span><IkonAlat jenis="forklift" ukuran={16} />MHE</span><span><i className="vsm-chip wi">WI</i> instruksi kerja</span>
      </div>
      {lanes.length === 0 && <p className="muted">Belum ada aktivitas. Isi dulu di tab Value Stream Mapping.</p>}
      {lanes.map((L, li) => {
        const warna = WARNA_LANE[li % WARNA_LANE.length];
        return <div key={L.lane} className={`vsm-lane${L.aktif ? '' : ' mati'}`} style={{ borderColor: warna }}>
          <div className="vsm-lane-judul" style={{ background: warna }}>
            <label><input type="checkbox" disabled={!bisaEdit} checked={L.aktif} onChange={e => onAktif(L.proses.flatMap(p => p.items.map(i => i.idx)), e.target.checked)} /> {L.lane}</label>
            <input aria-label={`Lead time ${L.lane}`} className="vsm-lt" value={vsm?.leadTime?.[L.lane] ?? leadTimeDefault(L.lane)} disabled={!bisaEdit}
              onChange={e => onVsm({ ...(vsm ?? {}), leadTime: { ...(vsm?.leadTime ?? {}), [L.lane]: e.target.value } })} placeholder="lead time / target" />
          </div>
          <div className="vsm-alur">
            {L.proses.map((p, pi) => {
              const s = sopEfektif(p, wiPrefix, sopMap[p.tahap]);
              const prev = pi > 0 ? L.proses[pi - 1] : null;
              const alatProses = new Map<string, number>();
              for (const it of p.items.filter(x => x.aktif)) {
                if (it.tool && it.tool !== 'Manual') alatProses.set(it.tool, (alatProses.get(it.tool) ?? 0) + (it.fte?.tool ?? 0));
                for (const a2 of it.alat) alatProses.set(a2, (alatProses.get(a2) ?? 0) + (it.fte?.alat[a2] ?? 0));
              }
              const manual = p.items.some(x => x.aktif && (!x.tool || x.tool === 'Manual'));
              const roles = new Map<string, number>();
              for (const it of p.items.filter(x => x.aktif)) roles.set(it.role, (roles.get(it.role) ?? 0) + (it.fte?.role ?? 0));
              return <div key={p.tahap} className="vsm-langkah">
                {pi > 0 && <span className="vsm-panah" aria-hidden="true">{prev && adaBuffer(prev, vsm) && prev.aktif ? <i className="lm-seg" title="buffer / staging" /> : null}▶</span>}
                <div className={`vsm-proses lm-proses${p.aktif ? '' : ' mati'}`}>
                  <div className="vsm-proses-head">
                    <label><input type="checkbox" disabled={!bisaEdit} checked={p.aktif} onChange={e => onAktif(p.items.map(i => i.idx), e.target.checked)} /> <b>{p.label}</b></label>
                    <i className="vsm-chip wi" title={s.file ? `SOP file: ${s.file.nama}` : 'nomor WI / SOP'}>{s.wi}{s.file ? ' 📎' : ''}</i>
                  </div>
                  {p.aktif && <>
                    <div className="lm-ikon">
                      {Array.from(alatProses.entries()).map(([t2, f]) => <span key={t2} className="lm-alat" title={`${namaTool(t2)}${f > 0 ? ` · ${angka(f, 1)} unit (FTE)` : ''}`}>
                        <IkonAlat jenis={ikonAlat(t2)} judul={namaTool(t2)} /><small>{t2}{f >= 0.05 ? ` ${angka(f, 1)}` : ''}</small></span>)}
                      {manual && <span className="lm-alat" title="Manual / form kertas"><IkonAlat jenis="kertas" judul="Manual" /><small>manual</small></span>}
                    </div>
                    <div className="vsm-chips" style={{ marginLeft: 0 }}>
                      {Array.from(roles.entries()).map(([r, f]) => <i key={r} className="vsm-chip mp">{r}{f >= 0.05 ? ` · ${angka(f, 1)} FTE` : ''}</i>)}
                    </div>
                    <div className="lm-dok">
                      {s.dokumen.split('\n').filter(Boolean).slice(0, 4).map(d => <i key={d} className="lm-doc-chip" title="dokumen">{d}</i>)}
                      {s.sistem.split('\n').filter(Boolean).map(d => <i key={d} className="lm-db-chip" title="sistem">{d}</i>)}
                    </div>
                  </>}
                  <details className="lm-akt-list"><summary className="small">{p.items.filter(x => x.aktif).length}/{p.items.length} aktivitas</summary>
                    {p.items.map(it => <div key={it.idx} className={`vsm-akt${it.aktif ? '' : ' mati'}`}>
                      <label><input type="checkbox" disabled={!bisaEdit} checked={it.aktif} onChange={e => onAktif([it.idx], e.target.checked)} /> {it.aktivitas}</label>
                      <div className="vsm-chips">
                        {it.tool !== 'Manual' && <i className={`vsm-chip ${/RT|CBT?|HPT|EPT|VNA|forklift|reach/i.test(it.tool) ? 'mhe' : 'alat'}`} title={namaTool(it.tool)}>{it.tool}{it.fte?.tool ? ` · ${angka(it.fte.tool, 1)}` : ''}</i>}
                        {it.alat.map(x => <i key={x} className="vsm-chip alat">{x}</i>)}
                        <i className="vsm-chip mp">{it.role}{it.fte?.role ? ` · ${angka(it.fte.role, 1)} FTE` : ''}</i>
                      </div>
                    </div>)}
                  </details>
                  {p.aktif && bisaEdit && <label className="small muted lm-buf"><input type="checkbox" checked={adaBuffer(p, vsm)} onChange={e => setBuffer(p.tahap, e.target.checked)} /> buffer / staging setelah proses ini</label>}
                </div>
              </div>;
            })}
          </div>
        </div>;
      })}
      <div className="lm-lead" aria-label="Lead time">
        {LEAD_KPI.map(z => <div key={z.k} className="lm-lead-seg" style={{ flexGrow: Math.max(1, leadKpi(vsm, z.k)) }}>
          <span>{z.label}</span>
          <label className="small"><input type="number" min={0} step="any" aria-label={`${z.label} (jam)`} value={vsm?.leadKpi?.[z.k] ?? ''} placeholder={String(z.def)} disabled={!bisaEdit}
            onChange={e => onVsm({ ...(vsm ?? {}), leadKpi: { ...(vsm?.leadKpi ?? {}), [z.k]: e.target.value === '' ? undefined : Number(e.target.value) } })} /> jam</label>
        </div>)}
        <div className="lm-lead-tot">Total dock to dock <b>{angka(totalLead, 1)} jam</b> ({angka(totalLead / 24, 1)} hari)</div>
      </div>
    </div>

    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>SOP per proses</h2>
        <div className="row" style={{ gap: 6 }}>
          <button onClick={unduhWord} disabled={sibuk || nAktif === 0}>Unduh SOP (Word)</button>
          <button className="ghost" onClick={unduhPdf} disabled={sibuk || nAktif === 0}>Unduh SOP (PDF)</button>
          {adaFile && <button className="ghost" onClick={unduhZip} disabled={sibuk}>Unduh paket (Word + file upload, ZIP)</button>}
        </div>
      </div>
      <p className="small muted">Draft otomatis dari aktivitas, tool, alat & role di atas. Ubah isian bila perlu (kosongkan untuk kembali ke draft), atau <b>ganti dengan file</b> SOP sendiri (Word / PDF, maks 15 MB) — file itu yang dipakai dan ikut di paket ZIP.</p>
      <label className="f" style={{ maxWidth: 320 }}>Awalan nomor WI
        <input value={vsm?.wiPrefix ?? ''} placeholder={`WI-${kode || 'TND'}`} disabled={!bisaEdit} onChange={e => onVsm({ ...(vsm ?? {}), wiPrefix: e.target.value })} /></label>
      {pesan && <p className="notice small" role="status">{pesan}</p>}
      {lanes.map(L => L.proses.map(p => {
        const s = sopEfektif(p, wiPrefix, sopMap[p.tahap]); const x = sopMap[p.tahap] ?? {};
        const area = (k: keyof SopInput, label: string, def: string, baris = 3) => (
          <label className="f" key={k}>{label}{x[k] != null && String(x[k]).trim() !== '' ? <span className="small" style={{ color: 'var(--warn)' }}> · diubah</span> : null}
            <textarea rows={baris} value={(x[k] as string | undefined) ?? ''} placeholder={def} disabled={!bisaEdit} onChange={e => setSop(p.tahap, { [k]: e.target.value })} /></label>);
        return <details key={p.tahap} className={`vsm-sop${p.aktif ? '' : ' mati'}`}>
          <summary><b>{s.wi}</b> — {L.lane} · {p.label}{!p.aktif ? ' (tidak dipakai)' : ''}{s.file ? ` · 📎 ${s.file.nama}` : s.diubah ? ' · diedit' : ' · draft otomatis'}</summary>
          {!p.aktif ? <p className="small muted">Semua aktivitas proses ini dimatikan — tidak masuk SOP & biaya.</p> : <>
            <div className="row small" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '6px 0' }}>
              {s.file ? <>
                <span>SOP memakai file <b>{s.file.nama}</b>{s.file.ukuran ? ` (${angka(s.file.ukuran / 1024, 0)} KB)` : ''}</span>
                <button className="ghost" style={{ padding: '3px 10px' }} onClick={() => bukaFile(s.file!.path)}>Buka</button>
                {bisaEdit && <button className="danger" style={{ padding: '3px 10px' }} onClick={() => hapusFile(p)}>Hapus file → pakai draft</button>}
              </> : bisaEdit && <label className="ghost-file">Ganti dengan file SOP (Word / PDF)
                <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" disabled={sibuk}
                  onChange={e => { const f = e.target.files?.[0]; if (f) void unggah(p, f); e.target.value = ''; }} /></label>}
              {!s.file && s.diubah && bisaEdit && <button className="link-kecil" onClick={() => setSop(p.tahap, { wi: undefined, tujuan: undefined, lingkup: undefined, dokumen: undefined, sistem: undefined, langkah: undefined, kpi: undefined, k3: undefined, catatan: undefined })}>kembalikan semua ke draft</button>}
            </div>
            <table className="sp-tabel sp-kecil" style={{ marginBottom: 8 }}><tbody>
              <tr><td style={{ width: 180 }}>Penanggung jawab (PIC)</td><td>{s.pic}</td></tr>
              <tr><td>Manpower</td><td>{s.manpower.join(' · ') || '—'}</td></tr>
              <tr><td>MHE</td><td>{s.mhe.join(' · ') || 'Tidak ada (manual)'}</td></tr>
              <tr><td>Alat pendukung</td><td>{s.alat.join(' · ') || '—'}</td></tr>
              <tr><td>Buffer / staging</td><td>{adaBuffer(p, vsm) ? 'Ya (▲ di peta)' : 'Tidak'}</td></tr>
            </tbody></table>
            {!s.file && <div className="grid2" style={{ gap: 8 }}>
              <label className="f">Nomor WI<input value={x.wi ?? ''} placeholder={s.wi} disabled={!bisaEdit} onChange={e => setSop(p.tahap, { wi: e.target.value })} /></label>
              {area('tujuan', 'Tujuan', sopEfektif(p, wiPrefix).tujuan, 2)}
              {area('lingkup', 'Ruang lingkup', sopEfektif(p, wiPrefix).lingkup, 2)}
              {area('dokumen', 'Dokumen (1 per baris)', sopEfektif(p, wiPrefix).dokumen, 3)}
              {area('sistem', 'Sistem / aplikasi (1 per baris)', sopEfektif(p, wiPrefix).sistem, 2)}
              {area('langkah', 'Langkah kerja (1 langkah per baris)', sopEfektif(p, wiPrefix).langkah, 8)}
              {area('kpi', 'KPI / target (1 per baris)', sopEfektif(p, wiPrefix).kpi, 3)}
              {area('k3', 'K3 / keselamatan (1 per baris)', sopEfektif(p, wiPrefix).k3, 4)}
              {area('catatan', 'Catatan', '', 2)}
            </div>}
          </>}
        </details>;
      }))}
    </div>
  </>;
}
