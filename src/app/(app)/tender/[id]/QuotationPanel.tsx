'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { TenderRow, GudangTerpilih } from '@/lib/tender';
import type { HasilTender } from '@/lib/engine/index.ts';
import type { Profile } from '@/lib/useProfile';
import { rp, tanggal, angka, BUCKET_LABEL } from '@/lib/format';
import { ringkasIt, IT_SHEET_DEFAULT } from '@/lib/it';
import { unduhQuotationPdf, blobQuotationPdf, type InfoGudangPdf, type QuotationPdfData } from '@/lib/quotationPdf';
import PdfPreview, { cetakPdf } from './PdfPreview';
import { isApprover, STATUS_QUOTATION, bolehRilis } from '@/lib/akses';
import { gambarUntukPdf, useBrandingSaya, BrandingRingkas } from '@/components/BrandingProfil';

interface RateRow { layanan: string; satuan: string; tarif: number; catatan?: string }
interface Sekali { deskripsi: string; nilai: number }
interface Quo {
  id: string; nomor: string; tanggal: string; berlaku_sampai: string; kepada: string | null; rate_card: RateRow[];
  term_condition: string; status: string; approved_at: string | null; revisi: number; parent_id: string | null;
  catatan_revisi: string | null; tagihan_sekali: Sekali[]; info_gudang: InfoGudangPdf | null; created_at: string;
  catatan_approval?: string | null; diputus_at?: string | null;
}
type Draft = Omit<Quo, 'id' | 'status' | 'approved_at' | 'created_at' | 'catatan_approval' | 'diputus_at'>;
interface Tc { id: number; nama: string; isi: string }

const SATUAN: Record<string, (uom: string) => string> = {
  storage: u => `per ${u} per bulan`, handling_in: u => `per ${u} masuk`, handling_out: u => `per ${u} keluar`, vas: u => `per ${u}`,
};

const infoGudang = (g: GudangTerpilih | null | undefined, hasil: HasilTender): InfoGudangPdf | null => g ? {
  nama: g.nama, alamat: g.alamat ?? `${g.kab_kota}, ${g.provinsi}`, kota: `${g.kab_kota}, ${g.provinsi}`, luasM2: g.luas_m2,
  luasDipakaiM2: hasil.space.totalM2, tinggiM: g.tinggi_bersih_m, dock: g.jumlah_dock, tipe: g.tipe, gmaps: g.gmaps_url,
} : null;

export default function QuotationPanel({ tender, profile }: { tender: TenderRow; profile: Profile | null }) {
  const sb = supabaseBrowser();
  const [list, setList] = useState<Quo[]>([]);
  const [tc, setTc] = useState<Tc[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ttd, setTtd] = useState({ nama: profile?.full_name ?? '', jabatan: 'Solution Design', perusahaan: 'PT LX Pantos Indonesia' });
  const [err, setErr] = useState<string | null>(null);
  const brand = useBrandingSaya(profile);
  const branding = brand.pilihan;
  const kurangBranding = brand.wajib && brand.siap && !brand.lengkap;
  const [hapusId, setHapusId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [pratinjau, setPratinjau] = useState<{ blob: Blob; data: QuotationPdfData; rilis: boolean } | null>(null);
  const [sibukPv, setSibukPv] = useState(false);
  const [tambahIdx, setTambahIdx] = useState('');
  // Nomor otomatis: DDMMYYYY/Customer/Akun/Pembuatan ke-/Urutan hari ini. Berhenti otomatis kalau diketik manual.
  const [nomorAuto, setNomorAuto] = useState<{ pembuatan: number; urutan: number } | null>(null);
  const hasil = tender.hasil as HasilTender | null;
  const bolehApprove = isApprover(profile);
  const [putus, setPutus] = useState<{ id: string; jenis: 'revisi' | 'ditolak'; note: string } | null>(null);

  const muat = useCallback(async () => {
    const [q, t] = await Promise.all([
      sb.from('quotations').select('*').eq('tender_id', tender.id).order('created_at', { ascending: false }),
      sb.from('tc_templates').select('id, nama, isi').eq('aktif', true),
    ]);
    setList((q.data ?? []) as Quo[]); setTc((t.data ?? []) as Tc[]);
  }, [tender.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { muat(); }, [muat]);
  // Penanda tangan default dari Profil (menu akun → Profil & password); masih bisa diubah per quotation
  useEffect(() => { if (profile) setTtd({ nama: profile.full_name || '', jabatan: profile.jabatan || 'Solution Design', perusahaan: profile.perusahaan || 'PT LX Pantos Indonesia' }); }, [profile]);

  const isiTc = (isi: string) => isi.replaceAll('{payment_term}', String(tender.payment_term_hari)).replaceAll('{durasi}', String(tender.durasi_kontrak_bulan));

  /** Rate card + tagihan sekali dari hasil hitung tersimpan. */
  function dariHasil(h: HasilTender) {
    const inclPpn = (tender.asumsi.pajak?.ppn ?? 'exclude') === 'include';
    const rate: RateRow[] = h.rateCard.map(r => ({ layanan: BUCKET_LABEL[r.bucket], satuan: (SATUAN[r.bucket] ?? (u => u))(r.uom), tarif: inclPpn ? (r.tarifInclPpn ?? r.tarifPerUnit) : r.tarifPerUnit,
      catatan: `Minimum ${r.volumeKomitmen.toLocaleString('id-ID')} ${r.uom}/bulan` }));
    for (const alt of h.storageAlternatif.slice(1))
      rate.push({ layanan: 'Storage (alternatif)', satuan: `per ${alt.uom} per bulan`, tarif: alt.tarif, catatan: 'Pilih salah satu basis storage' });
    const sekali = ringkasIt(tender.asumsi.it ?? IT_SHEET_DEFAULT).tagihSekali;
    return { rate, sekali };
  }

  function cekKritis(h: HasilTender) {
    const kritis = h.redFlags.filter(f => f.level === 'kritis');
    if (kritis.length) { setErr(`Masih ada ${kritis.length} red flag kritis. Selesaikan dulu di tab Hasil.`); return false; }
    setErr(null); return true;
  }

  const tglLokal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const bersih = (t: string) => t.replace(/[\/\\]+/g, '-').replace(/\s+/g, ' ').trim();
  const akun = () => bersih(profile?.full_name || profile?.email?.split('@')[0] || 'akun');
  /** Singkatan: huruf pertama tiap kata, huruf besar (PT Otsuka Indonesia → POI, Egha esa → EE). */
  const inisial = (t: string) => t.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase() || 'X';
  function susunNomor(tgl: string, kepada: string | null, pembuatan: number, urutan: number) {
    const [y, m, d] = tgl.split('-');
    const p3 = (n: number) => String(n).padStart(3, '0');
    return `${d}${m}${y.slice(2)}/${inisial(kepada || tender.customer)}/${inisial(akun())}/${p3(pembuatan)}/${p3(urutan)}`;
  }
  /** Urutan quotation yang dibuat hari ini (semua tender) + 1. */
  async function urutanHariIni() {
    const awal = new Date(); awal.setHours(0, 0, 0, 0);
    const { count } = await sb.from('quotations').select('id', { count: 'exact', head: true }).gte('created_at', awal.toISOString());
    return (count ?? 0) + 1;
  }

  async function mulai() {
    if (kurangBranding) { setErr('Unggah logo perusahaan & tanda tangan di Profil dulu sebelum membuat quotation.'); return; }
    if (!hasil || !cekKritis(hasil)) return;
    const hari = new Date();
    const urutan = await urutanHariIni();
    const { rate, sekali } = dariHasil(hasil);
    const berlaku = new Date(hari); berlaku.setDate(berlaku.getDate() + 30);
    setNomorAuto({ pembuatan: 1, urutan });
    setDraft({ nomor: susunNomor(tglLokal(hari), tender.customer, 1, urutan), tanggal: tglLokal(hari), berlaku_sampai: tglLokal(berlaku),
      kepada: tender.customer, rate_card: rate, term_condition: isiTc(tc[0]?.isi ?? ''), revisi: 0, parent_id: null, catatan_revisi: null,
      tagihan_sekali: sekali, info_gudang: infoGudang(tender.asumsi.gudang, hasil) });
  }

  /** Revisi: tarif diambil ulang dari hasil hitung terakhir; nomor pembuatan ke-(revisi+1), T&C ikut versi sebelumnya. */
  async function revisi(q: Quo) {
    if (!hasil || !cekKritis(hasil)) return;
    const akar = q.parent_id ? list.find(x => x.id === q.parent_id) ?? q : q;
    const n = Math.max(...list.filter(x => x.id === akar.id || x.parent_id === akar.id).map(x => x.revisi)) + 1;
    const { rate, sekali } = dariHasil(hasil);
    const hari = new Date(); const berlaku = new Date(hari); berlaku.setDate(berlaku.getDate() + 30);
    const urutan = await urutanHariIni();
    setNomorAuto({ pembuatan: n + 1, urutan });
    setDraft({ nomor: susunNomor(tglLokal(hari), q.kepada, n + 1, urutan), tanggal: tglLokal(hari), berlaku_sampai: tglLokal(berlaku),
      kepada: q.kepada, rate_card: rate, term_condition: q.term_condition, revisi: n, parent_id: akar.id, catatan_revisi: '',
      tagihan_sekali: sekali, info_gudang: infoGudang(tender.asumsi.gudang, hasil) ?? q.info_gudang });
  }

  /** Edit quotation draft/batal: dibuka di editor, disimpan ke baris yang sama (batal → kembali draft). */
  function edit(q: Quo) {
    const { id: _i, status: _s, approved_at: _a, created_at: _c, catatan_approval: _ca, diputus_at: _da, ...isi } = q;
    setDraft({ ...isi, rate_card: q.rate_card ?? [], tagihan_sekali: q.tagihan_sekali ?? [] }); setEditId(q.id); setErr(null); setNomorAuto(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function tutupDraft() { setDraft(null); setEditId(null); setNomorAuto(null); }

  async function simpanDraft() {
    if (!draft) return;
    if (draft.revisi > 0 && !draft.catatan_revisi?.trim()) { setErr('Isi catatan revisi (apa yang berubah dan kenapa).'); return; }
    if (editId) {
      const { data, error } = await sb.from('quotations').update({ ...draft, status: bolehApprove ? 'approved' : 'draft' }).eq('id', editId).select('id');
      if (error || !data?.length) { setErr(error?.message ?? 'Tidak tersimpan (hanya pembuat tender / admin).'); return; }
      tutupDraft(); muat(); return;
    }
    let nomor = draft.nomor;
    if (nomorAuto) nomor = susunNomor(draft.tanggal, draft.kepada, nomorAuto.pembuatan, await urutanHariIni());
    const { error } = await sb.from('quotations').insert({ ...draft, nomor, tender_id: tender.id });
    if (error) { setErr(error.message); return; }
    if (draft.parent_id) {   // versi lama yang masih aktif ditandai direvisi
      const lama = list.filter(x => (x.id === draft.parent_id || x.parent_id === draft.parent_id) && ['approved', 'terkirim', 'draft'].includes(x.status));
      for (const x of lama) await sb.from('quotations').update({ status: 'direvisi' }).eq('id', x.id);
    }
    tutupDraft(); muat();
  }
  async function setStatus(q: Quo, status: string, extra: Record<string, unknown> = {}) {
    if ((status === 'revisi' || status === 'ditolak') && !String(extra.catatan_approval ?? '').trim()) { setErr('Catatan wajib diisi untuk revisi / tolak.'); return; }
    const { error } = await sb.from('quotations').update({ status, ...extra }).eq('id', q.id);
    if (error) { setErr(error.message); return; }
    setPutus(null); setErr(null);
    if (status === 'terkirim') await sb.from('tenders').update({ status: q.revisi > 0 ? 'negosiasi' : 'quotation_terkirim' }).eq('id', tender.id);
    muat();
  }
  async function hapusQuotation(q: Quo) {
    if (list.some(x => x.parent_id === q.id)) { setErr('Quotation ini punya revisi — hapus revisinya dulu, atau cukup biarkan berstatus batal.'); setHapusId(null); return; }
    const { data, error } = await sb.from('quotations').delete().eq('id', q.id).select('id');
    if (error || !data?.length) { setErr(error?.message ?? 'Tidak bisa menghapus (hanya pembuat tender / admin).'); setHapusId(null); return; }
    setHapusId(null); setErr(null); muat();
  }
  /** Data PDF dari quotation tersimpan atau draft yang sedang diedit; draft diberi watermark. */
  async function dataPdf(q: Draft & { status?: string }): Promise<QuotationPdfData> {
    const [logo, ttdImg] = await Promise.all([gambarUntukPdf(branding.logoPath), gambarUntukPdf(branding.ttdPath)]);
    return { logo, ttd: ttdImg, watermark: !q.status || ['draft', 'menunggu', 'revisi'].includes(q.status) ? 'DRAFT' : q.status === 'ditolak' ? 'DITOLAK' : q.status === 'batal' ? 'BATAL' : undefined,
      nomor: q.nomor, tanggal: q.tanggal, berlakuSampai: q.berlaku_sampai, kepada: q.kepada ?? tender.customer, customer: tender.customer,
      lokasi: `${tender.kab_kota}, ${tender.provinsi}`, perihal: q.revisi > 0 ? `Revisi ${q.revisi} Penawaran Harga Jasa Pergudangan` : 'Penawaran Harga Jasa Pergudangan',
      rateCard: q.rate_card, tagihanSekali: q.tagihan_sekali ?? [], gudang: q.info_gudang, catatanRevisi: q.catatan_revisi,
      durasiBulan: tender.durasi_kontrak_bulan, termasukPpn: (tender.asumsi.pajak?.ppn ?? 'exclude') === 'include', ppnPersen: tender.asumsi.pajak?.ppnPersen ?? 0.11,
      termCondition: q.term_condition, penandatangan: ttd.nama, jabatan: ttd.jabatan, perusahaan: ttd.perusahaan };
  }
  async function unduh(q: Quo) {
    if (kurangBranding) { setErr('Unggah logo perusahaan & tanda tangan di Profil dulu sebelum mengunduh PDF.'); return; }
    if (!bolehRilis(q.status)) { setErr('Quotation harus di-approve manager dulu sebelum diunduh / dicetak.'); return; }
    await unduhQuotationPdf(await dataPdf(q));
  }
  async function cetak(q: Quo) {
    if (kurangBranding) { setErr('Unggah logo perusahaan & tanda tangan di Profil dulu.'); return; }
    if (!bolehRilis(q.status)) { setErr('Quotation harus di-approve manager dulu sebelum dicetak.'); return; }
    cetakPdf(await blobQuotationPdf(await dataPdf(q)));
  }
  async function lihat(q: Draft & { status?: string }) {
    setSibukPv(true);
    try { const data = await dataPdf(q); setPratinjau({ blob: await blobQuotationPdf(data), data, rilis: !!q.status && bolehRilis(q.status) && !kurangBranding }); }
    catch (e) { setErr(`Gagal membuat pratinjau: ${e instanceof Error ? e.message : e}`); }
    finally { setSibukPv(false); }
  }

  const ubahRate = (i: number, patch: Partial<RateRow>) => draft && setDraft({ ...draft, rate_card: draft.rate_card.map((x, j) => j === i ? { ...x, ...patch } : x) });

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Quotation</h2>
        {!draft && <button onClick={mulai} disabled={!hasil || kurangBranding} title={kurangBranding ? 'Unggah logo & TTD di Profil dulu' : undefined}>Buat quotation baru dari hasil tersimpan</button>}
      </div>
      {!hasil && <p className="muted">Simpan hasil hitung dulu di tab Hasil.</p>}
      {err && <p className="error small" role="alert">{err}</p>}

      {draft && (
        <div className="card" style={{ background: 'var(--surface-2)' }}>
          {editId && <p className="notice small"><b>Mengedit {draft.nomor}</b> — disimpan ke quotation yang sama{list.find(x => x.id === editId)?.status === 'batal' ? '; status kembali menjadi draft (perlu approve lagi)' : ''}.</p>}
          {draft.revisi > 0 && <p className="notice small">Revisi {draft.revisi}: tarif diambil dari hasil hitung terakhir (v{tender.versi}). Kalau negosiasi mengubah asumsi, ubah input lalu hitung ulang dulu.</p>}
          <div className="grid3">
            <label className="f" htmlFor="qno">Nomor<input id="qno" value={draft.nomor} onChange={e => { setNomorAuto(null); setDraft({ ...draft, nomor: e.target.value }); }} />
              <span className="small muted">{nomorAuto ? 'Otomatis: ddmmyy / inisial customer / inisial akun / pembuatan ke- / urutan hari ini' : 'Manual'}
                {!nomorAuto && !editId && <> · <button type="button" className="linkbtn" onClick={async () => { const u = await urutanHariIni(); const p = draft.revisi + 1; setNomorAuto({ pembuatan: p, urutan: u }); setDraft({ ...draft, nomor: susunNomor(draft.tanggal, draft.kepada, p, u) }); }}>pakai otomatis</button></>}</span></label>
            <label className="f" htmlFor="qkpd">Kepada<input id="qkpd" value={draft.kepada ?? ''} onChange={e => setDraft({ ...draft, kepada: e.target.value, nomor: nomorAuto ? susunNomor(draft.tanggal, e.target.value, nomorAuto.pembuatan, nomorAuto.urutan) : draft.nomor })} /></label>
            <label className="f" htmlFor="qbs">Berlaku sampai<input id="qbs" type="date" value={draft.berlaku_sampai} onChange={e => setDraft({ ...draft, berlaku_sampai: e.target.value })} /></label>
          </div>
          {draft.revisi > 0 && <label className="f" htmlFor="qrev">Catatan revisi (wajib)<input id="qrev" value={draft.catatan_revisi ?? ''} onChange={e => setDraft({ ...draft, catatan_revisi: e.target.value })} placeholder="mis. volume komitmen naik 1.200 → 1.500 palet; payment term 45 hari" /></label>}
          <div className="tablewrap"><table>
            <thead><tr><th>Layanan</th><th>Satuan</th><th className="num">Tarif</th><th>Keterangan</th><th></th></tr></thead>
            <tbody>{draft.rate_card.map((r, i) => (
              <tr key={i}>
                <td><input aria-label="Layanan" value={r.layanan} onChange={e => ubahRate(i, { layanan: e.target.value })} /></td>
                <td><input aria-label="Satuan" value={r.satuan} onChange={e => ubahRate(i, { satuan: e.target.value })} /></td>
                <td className="num out">{rp(r.tarif)}</td>
                <td><input aria-label="Keterangan" value={r.catatan ?? ''} onChange={e => ubahRate(i, { catatan: e.target.value })} /></td>
                <td><button className="danger" onClick={() => setDraft({ ...draft, rate_card: draft.rate_card.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>))}</tbody></table></div>
          {hasil && (() => {
            const semua = dariHasil(hasil).rate;
            const kunci = (r: RateRow) => `${r.layanan}|${r.satuan}`;
            const ada = new Set(draft.rate_card.map(kunci));
            const hilang = semua.map((r, i) => ({ r, i })).filter(x => !ada.has(kunci(x.r)));
            return hilang.length > 0 && <div className="row">
              <select aria-label="Baris tarif yang bisa ditambahkan" value={tambahIdx} onChange={e => setTambahIdx(e.target.value)} style={{ maxWidth: 420 }}>
                <option value="">+ Pilih baris tarif untuk ditambahkan kembali ({hilang.length})</option>
                {hilang.map(x => <option key={x.i} value={x.i}>{x.r.layanan} · {x.r.satuan} · {rp(x.r.tarif)}</option>)}
              </select>
              <button className="ghost" disabled={tambahIdx === ''} onClick={() => { const r = semua[Number(tambahIdx)]; if (r) setDraft({ ...draft, rate_card: [...draft.rate_card, r] }); setTambahIdx(''); }}>Tambah</button>
              <button className="ghost" onClick={() => setDraft({ ...draft, rate_card: [...draft.rate_card, ...hilang.map(x => x.r)] })}>Kembalikan semua</button>
            </div>;
          })()}
          <p className="small muted">Tarif dikunci dari hasil hitung supaya angka quotation = angka cost model. Baris yang dihapus bisa ditambahkan kembali dari pilihan di atas.</p>
          {draft.tagihan_sekali.length > 0 && <>
            <h3>Biaya sekali (ditagih terpisah)</h3>
            <table><tbody>{draft.tagihan_sekali.map((x, i) => <tr key={i}><td>{x.deskripsi}</td><td className="num out">{rp(x.nilai)}</td></tr>)}</tbody></table>
          </>}
          {draft.info_gudang
            ? <p className="small">Data gudang ikut di PDF: <b>{draft.info_gudang.nama}</b>, {draft.info_gudang.kota}, {angka(draft.info_gudang.luasDipakaiM2)} m² dari {angka(draft.info_gudang.luasM2)} m².</p>
            : <p className="small muted">Belum memilih gudang di tab Gudang — PDF tidak memuat data lokasi gudang.</p>}
          {tc.length > 1 && (
            <label className="f" htmlFor="tpl">Template T&C
              <select id="tpl" onChange={e => { const x = tc.find(y => y.id === Number(e.target.value)); if (x) setDraft({ ...draft, term_condition: isiTc(x.isi) }); }}>
                {tc.map(x => <option key={x.id} value={x.id}>{x.nama}</option>)}</select></label>
          )}
          <label className="f" htmlFor="qtc">Syarat dan ketentuan<textarea id="qtc" rows={10} value={draft.term_condition} onChange={e => setDraft({ ...draft, term_condition: e.target.value })} /></label>
          <div className="row"><button onClick={simpanDraft}>{editId ? 'Simpan perubahan' : `Simpan draft ${draft.revisi > 0 ? `revisi ${draft.revisi}` : 'quotation'}`}</button><button className="ghost" disabled={sibukPv} onClick={() => lihat(draft)}>{sibukPv ? 'Menyiapkan…' : 'Pratinjau'}</button><button className="ghost" onClick={tutupDraft}>Batal</button></div>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}><h3>Penanda tangan PDF</h3>
        <span className="small muted">Default dari <Link href="/akun">Profil</Link> · ubah di sini hanya untuk unduhan ini</span></div>
      <div className="grid3">
        <label className="f" htmlFor="ttdn">Nama<input id="ttdn" value={ttd.nama} onChange={e => setTtd({ ...ttd, nama: e.target.value })} /></label>
        <label className="f" htmlFor="ttdj">Jabatan<input id="ttdj" value={ttd.jabatan} onChange={e => setTtd({ ...ttd, jabatan: e.target.value })} /></label>
        <label className="f" htmlFor="ttdp">Perusahaan<input id="ttdp" value={ttd.perusahaan} onChange={e => setTtd({ ...ttd, perusahaan: e.target.value })} /></label>
      </div>
      <div className="card" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><h3>Logo & tanda tangan PDF</h3>
          <span className="small muted">Milik akun Anda · kelola di <Link href="/akun#branding">Profil</Link></span></div>
        {kurangBranding && <p className="notice small" role="alert"><b>Wajib:</b> unggah {[!brand.logo && 'logo perusahaan', !brand.ttd && 'tanda tangan'].filter(Boolean).join(' & ')} di <Link href="/akun#branding">Profil</Link> dulu sebelum membuat quotation / unduh PDF.</p>}
        <BrandingRingkas logo={brand.logo} ttd={brand.ttd} />
      </div>

      <div className="tablewrap"><table>
        <thead><tr><th>Nomor</th><th className="num">Rev</th><th>Tanggal</th><th>Berlaku s.d.</th><th>Status</th><th>Catatan</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={7} className="muted">Belum ada quotation.</td></tr>}
          {list.map(q => { const st = STATUS_QUOTATION[q.status] ?? { l: q.status, kelas: 'info' }; const bisaEdit = ['draft', 'revisi', 'ditolak', 'batal'].includes(q.status) || (bolehApprove && q.status === 'menunggu');
            return <tr key={q.id}>
              <td>{q.nomor}</td><td className="num">{q.revisi}</td><td>{tanggal(q.tanggal)}</td><td>{tanggal(q.berlaku_sampai)}</td>
              <td><span className={`pill ${st.kelas}`}>{st.l}</span></td>
              <td className="small">{q.catatan_approval && <div><b>{q.status === 'ditolak' ? 'Alasan tolak' : q.status === 'revisi' ? 'Catatan revisi manager' : 'Catatan manager'}:</b> {q.catatan_approval}</div>}{q.catatan_revisi ?? ''}</td>
              <td><div className="row">
                {(q.status === 'draft' || q.status === 'revisi') && !bolehApprove && <button onClick={() => setStatus(q, 'menunggu', { catatan_approval: null })}>Ajukan approval</button>}
                {q.status === 'menunggu' && !bolehApprove && <span className="small muted">Menunggu approval manager</span>}
                {['draft', 'menunggu', 'revisi'].includes(q.status) && bolehApprove && <>
                  <button onClick={() => setStatus(q, 'approved', { catatan_approval: null })}>Approve</button>
                  <button className="ghost" onClick={() => setPutus({ id: q.id, jenis: 'revisi', note: '' })}>Revisi</button>
                  <button className="danger" onClick={() => setPutus({ id: q.id, jenis: 'ditolak', note: '' })}>Tolak</button></>}
                <button className="ghost" disabled={sibukPv} onClick={() => lihat(q)}>Pratinjau</button>
                {bolehRilis(q.status) && <><button onClick={() => unduh(q)}>Unduh PDF</button><button className="ghost" onClick={() => cetak(q)}>🖨 Print</button></>}
                {q.status === 'approved' && <button className="ghost" onClick={() => setStatus(q, 'terkirim')}>Tandai terkirim</button>}
                {(q.status === 'approved' || q.status === 'terkirim') && !draft && <button className="ghost" onClick={() => revisi(q)}>Buat revisi</button>}
                {!['batal', 'direvisi', 'ditolak'].includes(q.status) && <button className="danger" onClick={() => setStatus(q, 'batal')}>Batalkan</button>}
                {bisaEdit && !draft && <button className="ghost" onClick={() => edit(q)}>Edit</button>}
                {['draft', 'batal', 'revisi', 'ditolak'].includes(q.status) && (hapusId === q.id
                  ? <><button className="danger" onClick={() => hapusQuotation(q)}>Yakin hapus permanen</button><button className="ghost" onClick={() => setHapusId(null)}>Batal</button></>
                  : <button className="danger" onClick={() => setHapusId(q.id)}>Hapus</button>)}
              </div>
              {putus?.id === q.id && <div className="card" style={{ marginTop: 8, gap: 8 }}>
                <label className="f" htmlFor={`pn-${q.id}`}>{putus.jenis === 'revisi' ? 'Catatan revisi (wajib) — apa yang harus diperbaiki' : 'Alasan penolakan (wajib)'}
                  <textarea id={`pn-${q.id}`} rows={3} value={putus.note} onChange={e => setPutus({ ...putus, note: e.target.value })} placeholder={putus.jenis === 'revisi' ? 'mis. GP storage terlalu tipis, naikkan ke 18%; cek ulang jumlah forklift' : 'mis. volume customer tidak realistis'} /></label>
                <div className="row"><button className={putus.jenis === 'ditolak' ? 'danger' : undefined} disabled={!putus.note.trim()} onClick={() => setStatus(q, putus.jenis, { catatan_approval: putus.note.trim() })}>{putus.jenis === 'revisi' ? 'Kirim permintaan revisi' : 'Tolak quotation'}</button>
                  <button className="ghost" onClick={() => setPutus(null)}>Batal</button></div>
              </div>}
              </td>
            </tr>; })}
        </tbody>
      </table></div>
      <p className="small muted">{bolehApprove
        ? 'Anda manager / master: quotation yang Anda buat langsung berstatus Approved. Quotation dari Solution Design / Business Development muncul dengan status Menunggu approval — pilih Approve, Revisi, atau Tolak (catatan wajib).'
        : 'Alur: simpan draft → Ajukan approval → manager memilih Approve / Revisi / Tolak. Unduh, print & kirim terbuka setelah Approved; sebelum itu hanya pratinjau.'}</p>
      {pratinjau && <PdfPreview blob={pratinjau.blob} judul={pratinjau.data.nomor} onTutup={() => setPratinjau(null)} rilis={pratinjau.rilis} onUnduh={() => unduhQuotationPdf(pratinjau.data)} />}
    </div>
  );
}
