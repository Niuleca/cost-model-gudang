'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { TenderRow } from '@/lib/tender';
import type { HasilTender } from '@/lib/engine/index.ts';
import type { Profile } from '@/lib/useProfile';
import { rp, tanggal, BUCKET_LABEL } from '@/lib/format';
import { unduhQuotationPdf } from '@/lib/quotationPdf';

interface RateRow { layanan: string; satuan: string; tarif: number; catatan?: string }
interface Quo {
  id: string; nomor: string; tanggal: string; berlaku_sampai: string; kepada: string | null; rate_card: RateRow[];
  term_condition: string; status: string; approved_at: string | null;
}
interface Tc { id: number; nama: string; isi: string }

const SATUAN: Record<string, (uom: string) => string> = {
  storage: u => `per ${u} per bulan`, handling_in: u => `per ${u} masuk`, handling_out: u => `per ${u} keluar`, vas: u => `per ${u}`,
};

export default function QuotationPanel({ tender, profile }: { tender: TenderRow; profile: Profile | null }) {
  const sb = supabaseBrowser();
  const [list, setList] = useState<Quo[]>([]);
  const [tc, setTc] = useState<Tc[]>([]);
  const [draft, setDraft] = useState<Omit<Quo, 'id' | 'status' | 'approved_at'> | null>(null);
  const [ttd, setTtd] = useState({ nama: profile?.full_name ?? '', jabatan: 'Solution Design', perusahaan: 'PT LX Pantos Indonesia' });
  const [err, setErr] = useState<string | null>(null);
  const hasil = tender.hasil as HasilTender | null;
  const bolehApprove = !!profile && ['commercial', 'finance', 'admin'].includes(profile.role);

  const muat = useCallback(async () => {
    const [q, t] = await Promise.all([
      sb.from('quotations').select('*').eq('tender_id', tender.id).order('created_at', { ascending: false }),
      sb.from('tc_templates').select('id, nama, isi').eq('aktif', true),
    ]);
    setList((q.data ?? []) as Quo[]); setTc((t.data ?? []) as Tc[]);
  }, [tender.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => { if (profile?.full_name) setTtd(x => ({ ...x, nama: x.nama || profile.full_name })); }, [profile]);

  function mulai() {
    if (!hasil) return;
    const kritis = hasil.redFlags.filter(f => f.level === 'kritis');
    if (kritis.length) { setErr(`Masih ada ${kritis.length} red flag kritis. Selesaikan dulu di tab Hasil.`); return; }
    setErr(null);
    const hari = new Date();
    const nomor = `Q/${hari.getFullYear()}${String(hari.getMonth() + 1).padStart(2, '0')}/${tender.kode ?? tender.id.slice(0, 6)}/${list.length + 1}`;
    const isiTc = (tc[0]?.isi ?? '').replaceAll('{payment_term}', String(tender.payment_term_hari)).replaceAll('{durasi}', String(tender.durasi_kontrak_bulan));
    const rate: RateRow[] = hasil.rateCard.map(r => ({ layanan: `${BUCKET_LABEL[r.bucket]}`, satuan: (SATUAN[r.bucket] ?? (u => u))(r.uom), tarif: r.tarifPerUnit,
      catatan: `Minimum ${r.volumeKomitmen.toLocaleString('id-ID')} ${r.uom}/bulan` }));
    const berlaku = new Date(hari); berlaku.setDate(berlaku.getDate() + 30);
    setDraft({ nomor, tanggal: hari.toISOString().slice(0, 10), berlaku_sampai: berlaku.toISOString().slice(0, 10), kepada: tender.customer, rate_card: rate, term_condition: isiTc });
  }

  async function simpanDraft() {
    if (!draft) return;
    const { error } = await sb.from('quotations').insert({ ...draft, tender_id: tender.id });
    if (error) { setErr(error.message); return; }
    setDraft(null); muat();
  }
  async function setStatus(q: Quo, status: string) {
    const { error } = await sb.from('quotations').update({ status }).eq('id', q.id);
    if (error) { setErr(error.message); return; }
    if (status === 'terkirim') await sb.from('tenders').update({ status: 'quotation_terkirim' }).eq('id', tender.id);
    muat();
  }
  async function unduh(q: Quo) {
    await unduhQuotationPdf({
      nomor: q.nomor, tanggal: q.tanggal, berlakuSampai: q.berlaku_sampai, kepada: q.kepada ?? tender.customer, customer: tender.customer,
      lokasi: `${tender.kab_kota}, ${tender.provinsi}`, perihal: 'Penawaran Harga Jasa Pergudangan', rateCard: q.rate_card,
      termCondition: q.term_condition, penandatangan: ttd.nama, jabatan: ttd.jabatan, perusahaan: ttd.perusahaan,
    });
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Quotation</h2>
        {!draft && <button onClick={mulai} disabled={!hasil}>Buat quotation dari hasil tersimpan</button>}
      </div>
      {!hasil && <p className="muted">Simpan hasil hitung dulu di tab Hasil.</p>}
      {err && <p className="error small" role="alert">{err}</p>}

      {draft && (
        <div className="card" style={{ background: 'var(--surface-2)' }}>
          <div className="grid3">
            <label className="f" htmlFor="qno">Nomor<input id="qno" value={draft.nomor} onChange={e => setDraft({ ...draft, nomor: e.target.value })} /></label>
            <label className="f" htmlFor="qkpd">Kepada<input id="qkpd" value={draft.kepada ?? ''} onChange={e => setDraft({ ...draft, kepada: e.target.value })} /></label>
            <label className="f" htmlFor="qbs">Berlaku sampai<input id="qbs" type="date" value={draft.berlaku_sampai} onChange={e => setDraft({ ...draft, berlaku_sampai: e.target.value })} /></label>
          </div>
          <div className="tablewrap"><table>
            <thead><tr><th>Layanan</th><th>Satuan</th><th className="num">Tarif</th><th>Keterangan</th></tr></thead>
            <tbody>{draft.rate_card.map((r, i) => (
              <tr key={i}>
                <td><input aria-label="Layanan" value={r.layanan} onChange={e => setDraft({ ...draft, rate_card: draft.rate_card.map((x, j) => j === i ? { ...x, layanan: e.target.value } : x) })} /></td>
                <td><input aria-label="Satuan" value={r.satuan} onChange={e => setDraft({ ...draft, rate_card: draft.rate_card.map((x, j) => j === i ? { ...x, satuan: e.target.value } : x) })} /></td>
                <td className="num out">{rp(r.tarif)}</td>
                <td><input aria-label="Keterangan" value={r.catatan ?? ''} onChange={e => setDraft({ ...draft, rate_card: draft.rate_card.map((x, j) => j === i ? { ...x, catatan: e.target.value } : x) })} /></td>
              </tr>))}</tbody></table></div>
          <p className="small muted">Tarif dikunci dari hasil hitung. Untuk mengubah tarif, ubah asumsi lalu hitung ulang, supaya angka quotation = angka cost model.</p>
          {tc.length > 1 && (
            <label className="f" htmlFor="tpl">Template T&C
              <select id="tpl" onChange={e => { const x = tc.find(y => y.id === Number(e.target.value)); if (x) setDraft({ ...draft, term_condition: x.isi.replaceAll('{payment_term}', String(tender.payment_term_hari)).replaceAll('{durasi}', String(tender.durasi_kontrak_bulan)) }); }}>
                {tc.map(x => <option key={x.id} value={x.id}>{x.nama}</option>)}</select></label>
          )}
          <label className="f" htmlFor="qtc">Syarat dan ketentuan<textarea id="qtc" rows={10} value={draft.term_condition} onChange={e => setDraft({ ...draft, term_condition: e.target.value })} /></label>
          <div className="row"><button onClick={simpanDraft}>Simpan draft quotation</button><button className="ghost" onClick={() => setDraft(null)}>Batal</button></div>
        </div>
      )}

      <h3>Penanda tangan PDF</h3>
      <div className="grid3">
        <label className="f" htmlFor="ttdn">Nama<input id="ttdn" value={ttd.nama} onChange={e => setTtd({ ...ttd, nama: e.target.value })} /></label>
        <label className="f" htmlFor="ttdj">Jabatan<input id="ttdj" value={ttd.jabatan} onChange={e => setTtd({ ...ttd, jabatan: e.target.value })} /></label>
        <label className="f" htmlFor="ttdp">Perusahaan<input id="ttdp" value={ttd.perusahaan} onChange={e => setTtd({ ...ttd, perusahaan: e.target.value })} /></label>
      </div>

      <div className="tablewrap"><table>
        <thead><tr><th>Nomor</th><th>Tanggal</th><th>Berlaku s.d.</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={5} className="muted">Belum ada quotation.</td></tr>}
          {list.map(q => (
            <tr key={q.id}>
              <td>{q.nomor}</td><td>{tanggal(q.tanggal)}</td><td>{tanggal(q.berlaku_sampai)}</td>
              <td><span className={`pill ${q.status === 'draft' ? 'warn' : q.status === 'batal' ? 'bad' : 'ok'}`}>{q.status}</span></td>
              <td className="row">
                {q.status === 'draft' && bolehApprove && <button onClick={() => setStatus(q, 'approved')}>Approve</button>}
                {q.status === 'draft' && !bolehApprove && <span className="small muted">Menunggu approve Commercial/Finance</span>}
                {q.status !== 'draft' && <button onClick={() => unduh(q)}>Unduh PDF</button>}
                {q.status === 'approved' && <button className="ghost" onClick={() => setStatus(q, 'terkirim')}>Tandai terkirim</button>}
                {q.status !== 'batal' && <button className="danger" onClick={() => setStatus(q, 'batal')}>Batalkan</button>}
              </td>
            </tr>))}
        </tbody>
      </table></div>
    </div>
  );
}
