'use client';
// Rincian satu kategori biaya (dibuka di tab browser baru dari "Porsi biaya per kategori").
// Biaya/bln tiap baris bisa direvisi manual; tersimpan di asumsi.revisiBiaya dan ikut ke rate card, quotation & export.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ASUMSI_DEFAULT, keInput, muatMaster, type TenderRow } from '@/lib/tender';
import { hitungTender, type HasilTender } from '@/lib/engine/index.ts';
import type { MasterData } from '@/lib/engine/types';
import { IT_SHEET_DEFAULT } from '@/lib/it';
import { rp, persen } from '@/lib/format';
import { useProfile } from '@/lib/useProfile';
import { STATUS_DRAFT } from '@/lib/status';

export default function KategoriBiayaPage() {
  const { id, kelompok: kRaw } = useParams<{ id: string; kelompok: string }>();
  const kelompok = decodeURIComponent(kRaw);
  const sb = supabaseBrowser();
  const { profile } = useProfile();
  const [t, setT] = useState<TenderRow | null>(null);
  const [master, setMaster] = useState<MasterData | null>(null);
  const [catatan, setCatatan] = useState<string[]>([]);
  const [revisi, setRevisi] = useState<Record<string, number>>({});
  const [pesan, setPesan] = useState<string | null>('Memuat…');
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => { (async () => {
    const { data, error } = await sb.from('tenders').select('*').eq('id', id).single();
    if (error || !data) { setPesan(error?.message ?? 'Tender tidak ditemukan.'); return; }
    const row = data as TenderRow;
    row.asumsi = { ...ASUMSI_DEFAULT, ...(row.asumsi ?? {}) };
    row.asumsi.it = { ...IT_SHEET_DEFAULT, ...(row.asumsi.it ?? {}) };
    const m = await muatMaster(sb, row);
    setT(row); setMaster(m.master); setCatatan(m.catatan); setRevisi(row.asumsi.revisiBiaya ?? {}); setPesan(null);
  })(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hitung langsung di halaman ini supaya dampak revisi terlihat sebelum disimpan
  const h: HasilTender | null = useMemo(() => {
    if (!t || !master) return null;
    try { return hitungTender(keInput({ ...t, asumsi: { ...t.asumsi, revisiBiaya: revisi } }), master); } catch { return null; }
  }, [t, master, revisi]);
  const awal: HasilTender | null = useMemo(() => {
    if (!t || !master) return null;
    try { return hitungTender(keInput(t), master); } catch { return null; }
  }, [t, master]);

  const bisaEdit = !!t && !!profile && (profile.role === 'admin' || t.created_by === profile.id || !STATUS_DRAFT.includes(t.status));
  const baris = (h?.biaya ?? []).filter(b => b.kelompok === kelompok);
  const totKat = baris.reduce((s, b) => s + b.biayaBulan, 0);
  const totKatSistem = baris.reduce((s, b) => s + (b.biayaSistem ?? b.biayaBulan), 0);
  const kategoriLain = Object.keys(h?.perKelompok ?? {}).filter(k => k !== kelompok);
  const adaPerubahan = JSON.stringify(revisi) !== JSON.stringify(t?.asumsi.revisiBiaya ?? {});

  const setRev = (desk: string, v: number | null) => setRevisi(r => {
    const n = { ...r }; if (v == null || !Number.isFinite(v)) delete n[desk]; else n[desk] = Math.max(0, v); return n;
  });

  async function simpan() {
    if (!t || !h || !bisaEdit) return;
    setSibuk(true); setPesan('Menyimpan…');
    for (const c of catatan) h.redFlags.push({ level: 'peringatan', kode: 'MASTER_DATA', pesan: c });
    const versi = (t.versi ?? 1) + (t.hasil ? 1 : 0);
    const asumsi = { ...t.asumsi, revisiBiaya: revisi };
    const status = t.status === 'draft' ? 'dihitung' : t.status;
    const { data, error } = await sb.from('tenders').update({ asumsi, hasil: h, versi, status }).eq('id', t.id).select('id');
    if (error || !data?.length) { setPesan(`Gagal menyimpan: ${error?.message ?? 'hanya pembuat tender / admin'}`); setSibuk(false); return; }
    await sb.from('tender_versions').insert({ tender_id: t.id, versi, snapshot: { input: { ...t, asumsi }, hasil: h }, catatan: `Revisi biaya kategori ${kelompok} v${versi}` });
    setT({ ...t, asumsi, hasil: h, versi, status });
    try { localStorage.setItem('leca.tenderDiubah', `${t.id}|${Date.now()}`); } catch { /* abaikan */ }
    setPesan(`Tersimpan sebagai versi ${versi}. Tab tender akan memuat ulang otomatis.`); setSibuk(false);
  }

  if (!t || !h) return <div className="card"><p className="muted">{pesan ?? 'Memuat…'}</p></div>;
  const s0 = h.simulasi[0], a0 = awal?.simulasi[0];

  return (<>
    <div>
      <p className="small muted" style={{ letterSpacing: '.06em', textTransform: 'uppercase' }}>{t.kode ?? ''} · v{t.versi} · Rincian kategori</p>
      <h1 style={{ margin: '2px 0' }}>{kelompok} — {t.customer}</h1>
      <p className="small muted"><Link href={`/tender/${t.id}?tab=Hasil`}>← Kembali ke tab Hasil</Link>
        {kategoriLain.length > 0 && <> · Kategori lain: {kategoriLain.map((k, i) => <span key={k}>{i ? ', ' : ''}<Link href={`/tender/${t.id}/kategori/${encodeURIComponent(k)}`}>{k}</Link></span>)}</>}</p>
    </div>

    <div className="kpis">
      <div className="kpi"><span className="small muted">Biaya {kelompok}/bln</span><b>{rp(totKat)}</b><span className="small muted">{totKat !== totKatSistem ? `sistem ${rp(totKatSistem)}` : 'sesuai hitungan sistem'}</span></div>
      <div className="kpi"><span className="small muted">Total cost/bln</span><b>{rp(h.totalBiayaBulan)}</b><span className="small muted">{awal && awal.totalBiayaBulan !== h.totalBiayaBulan ? `sebelumnya ${rp(awal.totalBiayaBulan)}` : ' '}</span></div>
      <div className="kpi"><span className="small muted">Selling/bln</span><b>{rp(s0?.pendapatanBulan)}</b><span className="small muted">{a0 && a0.pendapatanBulan !== s0?.pendapatanBulan ? `sebelumnya ${rp(a0.pendapatanBulan)}` : ' '}</span></div>
      <div className="kpi"><span className="small muted">Margin (GP%)</span><b>{persen(s0?.gpPersen)}</b><span className="small muted">{a0 && a0.gpPersen !== s0?.gpPersen ? `sebelumnya ${persen(a0.gpPersen)}` : ' '}</span></div>
    </div>

    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Rincian {kelompok}</h2>
        <div className="row">
          {pesan && <span className="small" role="status">{pesan}</span>}
          <button className="ghost" disabled={!Object.keys(revisi).some(k => baris.some(b => b.deskripsi === k))} onClick={() => setRevisi(r => Object.fromEntries(Object.entries(r).filter(([k]) => !baris.some(b => b.deskripsi === k))))}>Kembalikan ke sistem</button>
          <button onClick={simpan} disabled={!bisaEdit || !adaPerubahan || sibuk}>Simpan revisi</button>
        </div>
      </div>
      {!bisaEdit && <p className="notice small">Hanya pembuat tender / admin yang bisa merevisi. Anda tetap bisa melihat rinciannya.</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Baris</th><th>Risiko</th><th>Dasar hitung (sistem)</th><th className="num">Biaya sistem/bln</th><th className="num">Biaya/bln (revisi)</th><th className="num">Selisih</th><th /></tr></thead>
        <tbody>
          {baris.map(b => {
            const sistem = b.biayaSistem ?? b.biayaBulan; const rev = revisi[b.deskripsi];
            const dasar = b.biayaSistem != null ? b.dasar.replace(/^direvisi manual \(sistem: [^·]*· /, '').replace(/\)$/, '') : b.dasar;
            return <tr key={b.deskripsi} style={rev != null ? { background: 'var(--res)' } : undefined}>
              <td>{b.deskripsi}</td><td>{b.kategoriRisiko}</td><td className="small muted">{dasar}</td>
              <td className="num">{rp(sistem)}</td>
              <td className="num"><input type="number" min={0} step={1000} style={{ width: 150, textAlign: 'right' }} disabled={!bisaEdit} aria-label={`Revisi biaya ${b.deskripsi}`}
                value={rev ?? ''} placeholder={String(Math.round(sistem))} onChange={e => setRev(b.deskripsi, e.target.value === '' ? null : Number(e.target.value))} /></td>
              <td className="num">{rev != null ? <b className={rev > sistem ? 'bad' : undefined}>{rev - sistem >= 0 ? '+' : ''}{rp(rev - sistem)}</b> : '—'}</td>
              <td>{rev != null && bisaEdit && <button className="linkbtn" onClick={() => setRev(b.deskripsi, null)}>reset</button>}</td>
            </tr>;
          })}
          {!baris.length && <tr><td colSpan={7} className="muted">Tidak ada baris biaya di kategori ini.</td></tr>}
          <tr className="pd-sub"><td colSpan={3}><b>Total {kelompok}</b></td><td className="num"><b>{rp(totKatSistem)}</b></td><td className="num out"><b>{rp(totKat)}</b></td><td className="num"><b>{totKat !== totKatSistem ? `${totKat - totKatSistem >= 0 ? '+' : ''}${rp(totKat - totKatSistem)}` : '—'}</b></td><td /></tr>
        </tbody>
      </table></div>
      <p className="small muted">Kosongkan kolom revisi = pakai hitungan sistem. Revisi disimpan per baris (berdasarkan nama baris); kalau nama baris berubah — misalnya jumlah orang/unit berubah — revisinya tidak dipakai lagi dan kembali ke hitungan sistem.
        Setelah disimpan, rate card, quotation, dan export memakai angka revisi.</p>
    </div>
  </>);
}
