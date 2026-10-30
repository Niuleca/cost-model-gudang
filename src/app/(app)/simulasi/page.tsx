'use client';
// Menu Simulasi Warehouse · Desain gudang 2D ⇄ 3D (gabungan simulasi 3D + layout editor).
// Layout otomatis dari parameter Space tender (bisa direvisi & disusun ulang) → edit komponen gudang (rak, block stack, staging, dock,
// fasilitas, kolom, jalur, zona), atur jarak & tinggi, kapasitas dihitung ulang, 3D mengikuti. Simpan beberapa versi per project;
// versi tersimpan dipakai sebagai gudang di Leca Game. Export PNG / PDF. Latar denah gambar / DXF.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ASUMSI_DEFAULT, keInput, muatMaster, type TenderRow } from '@/lib/tender';
import { IT_SHEET_DEFAULT } from '@/lib/it';
import { hitungTender, type HasilTender } from '@/lib/engine/index.ts';
import { paramAwal, susunLayout, type LayoutGudang, type ParamSim } from '@/lib/simulasi3d/layout';
import { dariOtomatis, tarikRak, keLayoutGudang, komponenBaru, levelDariTinggi, nBay, pasanganRak, putar, ringkas, tinggiRak, uid, kapasitasRak, tapakBlok, dimRak,
  DEFAULT_RAK, gabungJadiArea, pecahArea, ringkasArea, type JenisKomp, type Komponen, type LayoutEdit, type SpekArea, type SpekRak } from '@/lib/simulasi3d/editor';
import { bacaDxf } from '@/lib/simulasi3d/dxf';
import { labelStatus } from '@/lib/status';
import Editor2D, { WARNA_KOMP, type Editor2DApi, type Mode } from './layout/Editor2D';
import Potongan, { potongAwal, type ArahPotong, type PotonganApi } from './layout/Potongan';
import ParamSpace from './ParamSpace';
import type { Kamera, OpsiViewer, ViewerApi } from './Viewer3D';

const Viewer3D = dynamic(() => import('./Viewer3D'), { ssr: false, loading: () => <div className="sim3d-wadah sim3d-muat">Menyiapkan 3D…</div> });

interface T { id: string; kode: string | null; customer: string; status: string }
interface Versi { id: string; nama: string; updated_at: string; data: LayoutEdit }
const angka = (v: number, d = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d });
const r2 = (v: number) => Math.round(v * 100) / 100;

const PALET: { jenis: JenisKomp | 'pasSpr' | 'pasDdr'; label: string }[] = [
  { jenis: 'areaRak', label: 'Area rak otomatis (tarik → baris & lorong terbentuk)' },
  { jenis: 'spr', label: 'Rak SPR (1 baris)' }, { jenis: 'pasSpr', label: 'Rak SPR back-to-back' }, { jenis: 'ddr', label: 'Rak DDR (1 baris)' }, { jenis: 'pasDdr', label: 'Rak DDR back-to-back' },
  { jenis: 'block', label: 'Block stack' }, { jenis: 'stagingIn', label: 'Staging inbound' }, { jenis: 'stagingOut', label: 'Staging outbound' },
  { jenis: 'dock', label: 'Dock' }, { jenis: 'fasilitas', label: 'Office / fasilitas' }, { jenis: 'kolom', label: 'Kolom' }, { jenis: 'jalur', label: 'Jalur / gang' }, { jenis: 'zona', label: 'Zona (charging, QC, dll.)' },
];

/** Isian angka di panel properti. */
function Angka({ l, v, set, step = 0.1, min, u }: { l: string; v: number; set: (x: number) => void; step?: number; min?: number; u?: string }) {
  const [teks, setTeks] = useState(String(v));
  useEffect(() => { setTeks(String(v)); }, [v]);
  return (
    <label className="f">{l}{u ? ` (${u})` : ''}
      <input type="number" step={step} min={min} value={teks} onChange={e => { setTeks(e.target.value); const x = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(x)) set(x); }} />
    </label>
  );
}

export default function DesainGudang() {
  const sb = supabaseBrowser();
  const [daftar, setDaftar] = useState<T[]>([]);
  const [id, setId] = useState('');
  const [data, setData] = useState<{ t: TenderRow; h: HasilTender; p: ParamSim; auto: LayoutGudang } | null>(null);
  const [versi, setVersi] = useState<Versi[]>([]);
  const [versiId, setVersiId] = useState<string | null>(null);
  const [nama, setNama] = useState('Layout A');
  const [edit, setEditS] = useState<LayoutEdit | null>(null);
  const [kotor, setKotor] = useState(false);
  const [pilih, setPilih] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('pilih');
  const [grid, setGrid] = useState(0.1);
  const [snapTepi, setSnapTepi] = useState(true);
  const [tampil, setTampil] = useState<'2d' | 'split' | '3d'>('split');
  const [pesan, setPesan] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [lapis, setLapis] = useState({ n: 2, jarak: 0, arah: 'z' as 'x' | 'z' });
  const [jarakDinding, setJarakDinding] = useState(0.5);
  const [potongan, setPotongan] = useState<{ arah: ArahPotong; nilai: number } | null>(null);
  const apiPotong = useRef<PotonganApi>(null);
  const [zoomPotong, setZoomPotong] = useState(1);
  const [param, setParam] = useState<ParamSim | null>(null);
  const [opsi3d, setOpsi3d] = useState<OpsiViewer>({ atap: false, dinding: true, label: true, animasi: true, truk: true, orang: true });
  const riwayat = useRef<{ lalu: LayoutEdit[]; depan: LayoutEdit[] }>({ lalu: [], depan: [] });
  const ed2 = useRef<Editor2DApi>(null);
  const api3 = useRef<ViewerApi>(null);
  const editRef = useRef<LayoutEdit | null>(null); editRef.current = edit;

  const ubah = useCallback((f: (e: LayoutEdit) => LayoutEdit) => { setEditS(e => (e ? f(e) : e)); setKotor(true); }, []);
  const mulaiAksi = useCallback(() => { const e = editRef.current; if (!e) return; riwayat.current.lalu.push(e); if (riwayat.current.lalu.length > 80) riwayat.current.lalu.shift(); riwayat.current.depan = []; }, []);
  const aksi = (f: (e: LayoutEdit) => LayoutEdit) => { mulaiAksi(); ubah(f); };
  const undo = () => { const r = riwayat.current; const e = editRef.current; const p = r.lalu.pop(); if (!p || !e) return; r.depan.push(e); setEditS(p); setKotor(true); };
  const redo = () => { const r = riwayat.current; const e = editRef.current; const n = r.depan.pop(); if (!n || !e) return; r.lalu.push(e); setEditS(n); setKotor(true); };

  useEffect(() => {
    sb.from('tenders').select('id, kode, customer, status').order('updated_at', { ascending: false }).then(({ data: d, error }: { data: unknown[] | null; error: { message: string } | null }) => {
      if (error) setErr(error.message);
      setDaftar((d ?? []) as T[]);
      const q = new URLSearchParams(window.location.search).get('id'); if (q) setId(q);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- muat project: hitung tender → layout otomatis; muat versi tersimpan
  useEffect(() => {
    if (!id) { setData(null); setEditS(null); return; }
    let batal = false; setSibuk(true); setErr(null); setPesan(null);
    (async () => {
      const { data: row, error } = await sb.from('tenders').select('*').eq('id', id).single();
      if (error || !row) throw new Error(error?.message ?? 'Tender tidak ditemukan');
      const t = row as TenderRow;
      t.asumsi = { ...ASUMSI_DEFAULT, ...(t.asumsi ?? {}) }; t.asumsi.it = { ...IT_SHEET_DEFAULT, ...(t.asumsi.it ?? {}) };
      let h: HasilTender;
      try { const { master } = await muatMaster(sb, t); h = hitungTender(keInput(t), master); }
      catch { if (!t.hasil) throw new Error('Tender ini belum bisa dihitung — lengkapi input di halaman tender.'); h = t.hasil as HasilTender; }
      const p = paramAwal(t, h); const auto = susunLayout(t, h, { param: p });
      const { data: vs, error: ev } = await sb.from('warehouse_layouts').select('id, nama, updated_at, data').eq('tender_id', id).order('updated_at', { ascending: false });
      if (ev) throw new Error(ev.message);
      return { t, h, p, auto, vs: (vs ?? []) as Versi[] };
    })().then(r => {
      if (batal) return;
      setData({ t: r.t, h: r.h, p: r.p, auto: r.auto }); setVersi(r.vs); setParam(r.p);
      if (r.vs.length) { setVersiId(r.vs[0].id); setNama(r.vs[0].nama); setEditS(r.vs[0].data); }
      else { setVersiId(null); setNama('Layout A'); setEditS(dariOtomatis(r.auto, r.p, Math.round(r.h.space.ppDesain ?? 0))); }
      riwayat.current = { lalu: [], depan: [] }; setKotor(false); setPilih(null);
      const u = new URL(window.location.href); u.searchParams.set('id', id); window.history.replaceState(null, '', u);
    }).catch(e => { if (!batal) setErr(e.message); }).finally(() => { if (!batal) setSibuk(false); });
    return () => { batal = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rk = useMemo(() => (edit ? ringkas(edit) : null), [edit]);
  // 3D mengikuti 2D (ditunda 400 ms supaya drag tetap lancar)
  const [edit3d, setEdit3d] = useState<LayoutEdit | null>(null);
  useEffect(() => { const tm = setTimeout(() => setEdit3d(edit), 400); return () => clearTimeout(tm); }, [edit]);
  const layout3d = useMemo(() => (edit3d && data ? keLayoutGudang(edit3d, data.auto) : null), [edit3d, data]);
  const kec = useMemo(() => ({ faktor: 10, siklus: {} }), []);

  const terpilih = edit?.komponen.find(k => k.id === pilih) ?? null;
  /** Tarik rak otomatis: rak terpilih saja (kalau yang dipilih rak), selain itu semua rak. */
  const tarik = (hanyaTerpilih: boolean) => {
    if (!edit) return;
    const ids = hanyaTerpilih && pilih ? [pilih] : undefined;
    const h = tarikRak(edit, { ids, jarakDinding });
    if (!h.n) { setPesan('Tidak ada rak yang bisa ditarik — ujung rak sudah menempel rintangan atau dinding.'); return; }
    aksi(() => h.edit);
    const sel = (a: number, b: number) => `${b - a >= 0 ? '+' : ''}${(b - a).toLocaleString('id-ID')}`;
    setPesan(`${h.n} baris rak ditarik: ${h.bayAwal.toLocaleString('id-ID')} → ${h.bayAkhir.toLocaleString('id-ID')} bay (${sel(h.bayAwal, h.bayAkhir)}), kapasitas ${h.posAwal.toLocaleString('id-ID')} → ${h.posAkhir.toLocaleString('id-ID')} posisi (${sel(h.posAwal, h.posAkhir)}).`);
  };
  const ubahK = (f: (k: Komponen) => Komponen) => { if (!pilih) return; aksi(e => ({ ...e, komponen: e.komponen.map(k => (k.id === pilih ? f(k) : k)) })); };

  function tambah(j: (typeof PALET)[number]['jenis']) {
    if (!edit || !data) return;
    const c = ed2.current?.pusatLayar() ?? { x: edit.gedung.L / 2, z: edit.gedung.W / 2 };
    const pos = { x: r2(Math.max(0, c.x - 5)), z: r2(Math.max(0, c.z - 1)) };
    const baru = j === 'pasSpr' ? pasanganRak(data.p, false, pos) : j === 'pasDdr' ? pasanganRak(data.p, true, pos) : komponenBaru(j, data.p, pos, edit.tinggiPalet);
    aksi(e => ({ ...e, komponen: [...e.komponen, ...baru] })); setPilih(baru[0].id); setMode('pilih');
  }
  /** Rak satuan sekolom → 1 area rak yang bisa ditarik. */
  function jadikanArea() {
    if (!edit || !pilih) return;
    const h = gabungJadiArea(edit, pilih); if (!h) return;
    aksi(() => h.edit); setPilih(h.id);
    setPesan('Rak digabung jadi 1 area rak. Tarik tepi area — baris rak, lorong, dan bay menyesuaikan otomatis.');
  }
  /** Semua rak satuan → area rak per kolom. */
  function semuaJadiArea() {
    if (!edit) return;
    let e = edit; let n = 0;
    for (let i = 0; i < 200; i++) { const k = e.komponen.find(c => c.rak); if (!k) break; const h = gabungJadiArea(e, k.id); if (!h) break; e = h.edit; n++; }
    if (!n) { setPesan('Tidak ada rak satuan untuk digabung.'); return; }
    aksi(() => e); setPilih(null);
    setPesan(`${n} area rak dibuat dari rak satuan. Klik area lalu tarik tepinya — baris, lorong, dan bay menyesuaikan otomatis.`);
  }
  /** Area rak → baris rak satuan. */
  function pecah() {
    if (!terpilih?.area) return;
    const rows = pecahArea(terpilih); const id = terpilih.id;
    aksi(e => ({ ...e, komponen: [...e.komponen.filter(k => k.id !== id), ...rows] })); setPilih(null);
    setPesan(`Area dipecah jadi ${rows.length} baris rak satuan.`);
  }
  const ubahArea = (p: Partial<SpekArea>) => ubahK(k => (k.area ? { ...k, area: { ...k.area, ...p } } : k));
  const ubahAreaRak = (p: Partial<SpekRak>) => ubahK(k => { if (!k.area) return k; const r = { ...k.area.rak, ...p }; return { ...k, tinggi: r2(tinggiRak(r)), area: { ...k.area, rak: r } }; });
  function hapus() { if (!pilih) return; aksi(e => ({ ...e, komponen: e.komponen.filter(k => k.id !== pilih) })); setPilih(null); }
  function gandakan(n = 1, jarak = 0, arah: 'x' | 'z' = 'z') {
    if (!terpilih) return;
    const salin: Komponen[] = [];
    for (let i = 1; i <= n; i++) salin.push({ ...terpilih, id: uid(), x: r2(terpilih.x + (arah === 'x' ? i * (terpilih.w + jarak) : n === 1 ? 1 : 0)), z: r2(terpilih.z + (arah === 'z' ? i * (terpilih.d + jarak) : n === 1 ? 1 : 0)), rak: terpilih.rak ? { ...terpilih.rak } : undefined, area: terpilih.area ? { ...terpilih.area, rak: { ...terpilih.area.rak } } : undefined });
    aksi(e => ({ ...e, komponen: [...e.komponen, ...salin] })); setPilih(salin[salin.length - 1].id);
  }

  // ---------- keyboard
  useEffect(() => {
    const f = (ev: KeyboardEvent) => {
      const tg = ev.target as HTMLElement; if (tg && ['INPUT', 'SELECT', 'TEXTAREA'].includes(tg.tagName)) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { ev.preventDefault(); gandakan(); return; }
      if (ev.key === 'Escape') { setPilih(null); setMode('pilih'); return; }
      if (!pilih) return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); hapus(); return; }
      if (ev.key.toLowerCase() === 'r') { ubahK(putar); return; }
      const lang = ev.shiftKey ? 1 : grid || 0.1;
      const d = ({ ArrowLeft: [-lang, 0], ArrowRight: [lang, 0], ArrowUp: [0, -lang], ArrowDown: [0, lang] } as Record<string, number[]>)[ev.key];
      if (d) { ev.preventDefault(); ubahK(k => ({ ...k, x: r2(k.x + d[0]), z: r2(k.z + d[1]) })); }
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- simpan versi
  async function simpan(sebagaiBaru = false) {
    if (!edit || !data) return;
    setSibuk(true); setErr(null);
    const isi = { tender_id: data.t.id, nama: nama.trim() || 'Layout', data: edit };
    const q = !sebagaiBaru && versiId ? sb.from('warehouse_layouts').update(isi).eq('id', versiId).select('id, nama, updated_at, data').single()
      : sb.from('warehouse_layouts').insert(isi).select('id, nama, updated_at, data').single();
    const { data: row, error } = await q;
    setSibuk(false);
    if (error || !row) { setErr(error?.message ?? 'Gagal menyimpan'); return; }
    const v = row as Versi;
    setVersi(vs => [v, ...vs.filter(x => x.id !== v.id)]); setVersiId(v.id); setKotor(false); setPesan(`Tersimpan: ${v.nama}`);
  }
  async function hapusVersi() {
    if (!versiId || !window.confirm(`Hapus versi "${nama}"?`)) return;
    const { error } = await sb.from('warehouse_layouts').delete().eq('id', versiId);
    if (error) { setErr(error.message); return; }
    const sisa = versi.filter(v => v.id !== versiId); setVersi(sisa);
    if (sisa.length) { setVersiId(sisa[0].id); setNama(sisa[0].nama); setEditS(sisa[0].data); } else { setVersiId(null); }
    setKotor(false);
  }
  function bukaVersi(v: string) {
    if (kotor && !window.confirm('Perubahan belum disimpan akan hilang. Lanjut?')) return;
    if (v === 'baru') {
      if (!data) return; setVersiId(null); setNama(`Layout ${String.fromCharCode(65 + versi.length)}`);
      setEditS(dariOtomatis(data.auto, data.p, Math.round(data.h.space.ppDesain ?? 0))); setKotor(true);
    } else { const x = versi.find(y => y.id === v); if (!x) return; setVersiId(x.id); setNama(x.nama); setEditS(x.data); setKotor(false); }
    riwayat.current = { lalu: [], depan: [] }; setPilih(null);
  }

  // ---------- susun ulang layout otomatis dari parameter Space (revisi)
  const autoParam = useMemo(() => { if (!data || !param) return null; try { return susunLayout(data.t, data.h, { param }); } catch { return null; } }, [data, param]);
  function susunUlang() {
    if (!data || !param || !autoParam) return;
    if (!window.confirm('Susun ulang layout dari parameter? Semua komponen di versi ini diganti layout otomatis baru (versi tersimpan tidak berubah sampai Anda simpan).')) return;
    aksi(() => dariOtomatis(autoParam, param, Math.round(data.h.space.ppDesain ?? 0))); setPilih(null);
    setPesan('Layout disusun ulang dari parameter. Simpan untuk dipakai di Leca Game.');
  }

  // ---------- export
  async function kePng(skala = 1, sumber?: string): Promise<{ url: string; w: number; h: number } | null> {
    const s = sumber ?? ed2.current?.svgEkspor(); if (!s) return null;
    const img = new Image(); const blob = new Blob([s], { type: 'image/svg+xml;charset=utf-8' }); const u = URL.createObjectURL(blob);
    await new Promise<void>((ok, gagal) => { img.onload = () => ok(); img.onerror = () => gagal(new Error('Gagal membuat gambar')); img.src = u; });
    const c = document.createElement('canvas'); c.width = img.width * skala; c.height = img.height * skala;
    const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
    return { url: c.toDataURL('image/png'), w: c.width, h: c.height };
  }
  const namaFile = () => `Layout_${(data?.t.kode ?? data?.t.customer ?? 'gudang').replace(/[^\w-]+/g, '_')}_${nama.replace(/[^\w-]+/g, '_')}`;
  async function unduhPng() { const p = await kePng(1.5).catch(e => { setErr(e.message); return null; }); if (!p) return; const a = document.createElement('a'); a.href = p.url; a.download = `${namaFile()}.png`; a.click(); }
  async function unduhPdf() {
    if (!edit || !rk || !data) return;
    const p = await kePng(1.5).catch(e => { setErr(e.message); return null; }); if (!p) return;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
    const W = 420, H = 297, m = 12;
    doc.setFontSize(16); doc.text(`Layout gudang — ${data.t.kode ? `${data.t.kode} · ` : ''}${data.t.customer}`, m, m + 4);
    doc.setFontSize(10); doc.setTextColor(90); doc.text(`${nama} · ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · Leca by esapanghegar`, m, m + 10);
    const lebarGbr = W - 2 * m - 95, tinggiMaks = H - 2 * m - 20;
    const sk = Math.min(lebarGbr / p.w, tinggiMaks / p.h);
    doc.addImage(p.url, 'PNG', m, m + 16, p.w * sk, p.h * sk);
    const g = edit.gedung; let y = m + 20; const x0 = W - m - 88;
    doc.setTextColor(20); doc.setFontSize(11); doc.text('Ringkasan', x0, y); y += 6; doc.setFontSize(9);
    const baris: [string, string][] = [
      ['Gedung', `${angka(g.L, 1)} × ${angka(g.W, 1)} m = ${angka(g.L * g.W)} m²`], ['Side / center height', `${angka(g.sideMm / 1000, 1)} / ${angka(g.centerMm / 1000, 1)} m`],
      ['Posisi SPR', angka(rk.posisiSpr)], ['Posisi DDR', angka(rk.posisiDdr)], ['Posisi block stack', angka(rk.posisiBlock)], ['Total posisi', angka(rk.totalRak)],
      ['Stok desain (tender)', `${angka(edit.stokDesain)} palet`], ['Okupansi', `${Math.round(rk.okupansi * 100)}%`],
      ['Luas rak', `${angka(rk.luasRak)} m²`], ['Luas block stack', `${angka(rk.luasBlock)} m²`], ['Luas staging', `${angka(rk.luasStaging)} m²`], ['Luas fasilitas', `${angka(rk.luasFasilitas)} m²`],
    ];
    for (const [a, b] of baris) { doc.text(a, x0, y); doc.text(b, x0 + 86, y, { align: 'right' }); y += 5.2; }
    if (rk.peringatan.length) { y += 3; doc.setFontSize(10); doc.text('Catatan', x0, y); y += 5; doc.setFontSize(8); for (const w of rk.peringatan.slice(0, 18)) { const ls = doc.splitTextToSize(`• ${w.pesan}`, 86); doc.text(ls, x0, y); y += ls.length * 4; } }
    doc.save(`${namaFile()}.pdf`);
  }

  // ---------- latar denah (gambar / DXF)
  async function unggahLatar(f: File) {
    if (!edit) return; setErr(null);
    if (/\.dxf$/i.test(f.name)) {
      const hasil = bacaDxf(await f.text());
      if (!hasil.garis.length) { setErr('DXF tidak berisi garis yang bisa dibaca (LINE / POLYLINE / CIRCLE / ARC).'); return; }
      const fk = hasil.satuanKeMeter ?? (hasil.lebar > 2000 ? 0.001 : 1);
      const garis = hasil.garis.map(([a, b, c, d]) => [a, b, c, d].map(v => Math.round(v * fk * 1000) / 1000) as [number, number, number, number]);
      aksi(e => ({ ...e, latar: { jenis: 'dxf', garis, x: 0, z: 0, w: 1, d: 1, opasitas: 0.7, nama: f.name } }));
      setPesan(`DXF dimuat: ${garis.length.toLocaleString('id-ID')} garis, ${angka(hasil.lebar * fk, 1)} × ${angka(hasil.tinggi * fk, 1)} m (${hasil.satuanKeMeter ? 'satuan dari file' : fk === 0.001 ? 'dianggap mm' : 'dianggap m'}).`);
      return;
    }
    if (!f.type.startsWith('image/')) { setErr('Format latar: gambar (PNG/JPG) atau DXF. DWG perlu disimpan sebagai DXF dulu; PDF bisa di-screenshot / export ke PNG.'); return; }
    const url = await new Promise<string>((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => gagal(r.error); r.readAsDataURL(f); });
    const img = new Image(); await new Promise<void>(ok => { img.onload = () => ok(); img.src = url; });
    const sk = Math.min(1, 2000 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * sk); c.height = Math.round(img.height * sk);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const kecil = c.toDataURL('image/jpeg', 0.8);
    const g = edit.gedung;
    aksi(e => ({ ...e, latar: { jenis: 'gambar', url: kecil, x: 0, z: 0, w: g.L, d: r2(g.L * (c.height / c.width)), opasitas: 0.6, nama: f.name } }));
    setPesan('Denah dimuat. Atur "Lebar latar (m)" sesuai ukuran asli supaya skalanya pas.');
  }

  const tersaring = daftar;
  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Simulasi Warehouse</div><h1>Desain gudang 2D ⇄ 3D</h1></div>
        <div className="row">
          {data && (versiId && !kotor
            ? <Link className="btn" href={`/simulasi/game?id=${data.t.id}&layout=${versiId}`}>▶ Main di Leca Game</Link>
            : <button type="button" className="ghost" disabled={sibuk || !edit} title="Simpan dulu supaya layout ini bisa dipakai di Leca Game" onClick={() => simpan(false)}>Simpan untuk Leca Game</button>)}
          {data && <Link className="btn ghost" href={`/tender/${data.t.id}`}>Buka tender</Link>}
        </div>
      </div>

      <div className="card">
        <div className="sim2d-atas">
          <label className="f">Project
            <select value={id} onChange={e => { if (kotor && !window.confirm('Perubahan belum disimpan akan hilang. Lanjut?')) return; setId(e.target.value); }}>
              <option value="">— pilih project —</option>
              {tersaring.map(x => <option key={x.id} value={x.id}>{x.kode ? `${x.kode} · ` : ''}{x.customer} ({labelStatus(x.status)})</option>)}
            </select>
          </label>
          {data && (<>
            <label className="f">Versi layout
              <select value={versiId ?? 'baru'} onChange={e => bukaVersi(e.target.value)}>
                {versi.map(v => <option key={v.id} value={v.id}>{v.nama} · {new Date(v.updated_at).toLocaleDateString('id-ID')}</option>)}
                <option value="baru">+ Baru dari layout otomatis</option>
              </select>
            </label>
            <label className="f">Nama versi<input value={nama} onChange={e => { setNama(e.target.value); setKotor(true); }} /></label>
            <div className="row" style={{ alignSelf: 'end' }}>
              <button onClick={() => simpan(false)} disabled={sibuk || !edit}>{versiId ? 'Simpan' : 'Simpan versi'}</button>
              {versiId && <button className="ghost" onClick={() => simpan(true)} disabled={sibuk}>Simpan sebagai baru</button>}
              {versiId && <button className="ghost danger" onClick={hapusVersi} disabled={sibuk}>Hapus</button>}
            </div>
          </>)}
        </div>
        {err && <p className="error small" role="alert">{err}</p>}
        {pesan && !err && <p className="small muted">{pesan}{kotor ? ' · ada perubahan belum disimpan' : ''}</p>}
        {!pesan && kotor && <p className="small" style={{ color: 'var(--warn)' }}>Ada perubahan belum disimpan.</p>}
        {!id && <p className="small muted">Pilih project. Desain dimulai dari layout otomatis (parameter Space tender, bisa direvisi lalu disusun ulang); setiap komponen bisa digeser, diubah ukuran & tingginya, ditambah atau dihapus — 3D mengikuti. Versi yang disimpan dipakai sebagai gudang di Leca Game.</p>}
        {sibuk && <p className="small muted">Memuat…</p>}
      </div>

      {edit && data && rk && (
        <div className="sim2d-tata">
          {/* ---------- kiri: alat & komponen */}
          <div className="card sim2d-kiri">
            <div className="eyebrow">Mode</div>
            <div className="tabs">
              {([['pilih', 'Pilih / geser'], ['geser', 'Pan'], ['ukur', 'Ukur jarak']] as [Mode, string][]).map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}
            </div>
            <div className="grid2" style={{ gap: 6 }}>
              <label className="f">Snap grid
                <select value={grid} onChange={e => setGrid(Number(e.target.value))}>{[0, 0.05, 0.1, 0.25, 0.5, 1].map(g => <option key={g} value={g}>{g ? `${g} m` : 'tanpa'}</option>)}</select>
              </label>
              <label className="sim3d-cek" style={{ alignSelf: 'end' }}><input type="checkbox" checked={snapTepi} onChange={e => setSnapTepi(e.target.checked)} />Tempel ke tepi</label>
            </div>
            <div className="row">
              <button className="ghost" onClick={undo} title="Ctrl+Z">↶ Undo</button><button className="ghost" onClick={redo} title="Ctrl+Y">↷ Redo</button>
              <button className="ghost" onClick={() => ed2.current?.pasFit()}>Pas layar</button>
            </div>
            <div className="sim2d-tarik">
              <button type="button" onClick={() => tarik(false)} title="Panjangkan semua baris rak sampai rintangan / dinding terdekat; jumlah bay & kapasitas menyesuaikan">↔ Tarik rak otomatis</button>
              <button type="button" className="ghost" onClick={semuaJadiArea} title="Gabungkan rak satuan per kolom jadi area rak yang bisa ditarik (gaya CLASS)">▦ Semua rak → area otomatis</button>
              <label className="small">Jarak ke dinding <input type="number" min={0} step={0.1} value={jarakDinding} onChange={e => setJarakDinding(Math.max(0, Number(e.target.value) || 0))} /> m</label>
            </div>
            <div className="eyebrow">Tambah komponen</div>
            <div className="sim2d-palet">
              {PALET.map(p => (
                <button key={p.jenis} className="ghost" onClick={() => tambah(p.jenis)}>
                  <i style={{ background: (WARNA_KOMP[p.jenis.startsWith('pas') ? (p.jenis === 'pasSpr' ? 'spr' : 'ddr') : p.jenis] ?? WARNA_KOMP.zona).isi, borderColor: (WARNA_KOMP[p.jenis.startsWith('pas') ? (p.jenis === 'pasSpr' ? 'spr' : 'ddr') : p.jenis] ?? WARNA_KOMP.zona).garis }} />{p.label}
                </button>
              ))}
            </div>
            <div className="eyebrow">Gedung</div>
            <div className="grid2" style={{ gap: 6 }}>
              <Angka l="Panjang (X)" u="m" v={edit.gedung.L} set={x => aksi(e => ({ ...e, gedung: { ...e.gedung, L: Math.max(5, x) } }))} />
              <Angka l="Lebar (Z)" u="m" v={edit.gedung.W} set={x => aksi(e => ({ ...e, gedung: { ...e.gedung, W: Math.max(5, x) } }))} />
              <Angka l="Side height" u="mm" step={100} v={edit.gedung.sideMm} set={x => aksi(e => ({ ...e, gedung: { ...e.gedung, sideMm: Math.max(2000, x) } }))} />
              <Angka l="Center height" u="mm" step={100} v={edit.gedung.centerMm} set={x => aksi(e => ({ ...e, gedung: { ...e.gedung, centerMm: Math.max(2000, x) } }))} />
            </div>
            <label className="f">Okupansi rak {edit.okupansi == null ? '(sesuai stok desain)' : `${Math.round(edit.okupansi * 100)}%`}
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input type="range" min={0} max={100} value={Math.round(rk.okupansi * 100)} onChange={e => ubah(x => ({ ...x, okupansi: Number(e.target.value) / 100 }))} />
                {edit.okupansi != null && <button className="ghost" style={{ padding: '4px 10px' }} onClick={() => ubah(x => ({ ...x, okupansi: null }))}>Reset</button>}
              </div>
            </label>
            {param && (
              <details className="sim2d-detail">
                <summary className="eyebrow">Parameter Space (layout otomatis)</summary>
                <ParamSpace param={param} awal={data.p} setParam={setParam} level={autoParam ? { level: autoParam.level, tinggi: autoParam.tinggiRak } : undefined} />
                <button type="button" onClick={susunUlang} disabled={!autoParam} style={{ marginTop: 8, width: '100%' }}>Susun ulang layout dari parameter</button>
              </details>
            )}
            <div className="eyebrow">Latar denah / CAD</div>
            <input type="file" accept="image/*,.dxf" onChange={e => { const f = e.target.files?.[0]; if (f) unggahLatar(f).catch(x => setErr(String(x))); e.target.value = ''; }} />
            {edit.latar && (
              <div className="grid2" style={{ gap: 6 }}>
                <span className="small muted" style={{ gridColumn: '1 / -1' }}>{edit.latar.nama}</span>
                <Angka l="Geser X" u="m" v={edit.latar.x} set={x => ubah(e => ({ ...e, latar: e.latar ? { ...e.latar, x } : e.latar }))} />
                <Angka l="Geser Z" u="m" v={edit.latar.z} set={x => ubah(e => ({ ...e, latar: e.latar ? { ...e.latar, z: x } : e.latar }))} />
                {edit.latar.jenis === 'gambar'
                  ? <Angka l="Lebar latar" u="m" v={edit.latar.w} set={x => ubah(e => ({ ...e, latar: e.latar ? { ...e.latar, w: Math.max(1, x), d: r2(Math.max(1, x) * (e.latar.d / Math.max(0.001, e.latar.w))) } : e.latar }))} />
                  : <Angka l="Skala DXF" u="×" step={0.01} v={edit.latar.w} set={x => ubah(e => ({ ...e, latar: e.latar ? { ...e.latar, w: Math.max(0.0001, x) } : e.latar }))} />}
                <label className="f">Transparansi<input type="range" min={10} max={100} value={Math.round(edit.latar.opasitas * 100)} onChange={e => ubah(x => ({ ...x, latar: x.latar ? { ...x.latar, opasitas: Number(e.target.value) / 100 } : x.latar }))} /></label>
                <button className="ghost danger" style={{ gridColumn: '1 / -1' }} onClick={() => aksi(e => ({ ...e, latar: null }))}>Hapus latar</button>
              </div>
            )}
            <div className="eyebrow">Ekspor</div>
            <div className="row"><button className="ghost" onClick={unduhPng}>PNG denah</button><button className="ghost" onClick={unduhPdf}>PDF A3</button>
              <button className="ghost" onClick={() => { const u = api3.current?.screenshot(); if (u) { const a = document.createElement('a'); a.href = u; a.download = `${namaFile()}_3D.png`; a.click(); } }} disabled={tampil === '2d'}>PNG 3D</button></div>
            <p className="small muted">Pintasan: Delete hapus · R putar · Ctrl+D gandakan · panah geser (Shift = 1 m) · Ctrl+Z / Ctrl+Y · scroll zoom · seret area kosong = pan.</p>
          </div>

          {/* ---------- tengah: kanvas */}
          <div className="sim2d-tengah">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row">
                <div className="tabs">{([['2d', '2D'], ['split', '2D + 3D'], ['3d', '3D']] as const).map(([k, l]) => <button key={k} className={tampil === k ? 'on' : ''} onClick={() => setTampil(k)}>{l}</button>)}</div>
                <div className="tabs" title="Potongan 2D bagian dalam gudang: tiang, beam, palet per level, lebar lorong">
                  {([['kiri', 'Potongan kiri'], ['kanan', 'Potongan kanan'], ['depan', 'Potongan depan']] as [ArahPotong, string][]).map(([k, l]) => (
                    <button key={k} className={potongan?.arah === k ? 'on' : ''} onClick={() => {
                      if (potongan?.arah === k) { setPotongan(null); return; }
                      const tetap = potongan && (potongan.arah === 'depan') === (k === 'depan');
                      setPotongan({ arah: k, nilai: tetap ? potongan!.nilai : potongAwal(edit, k) }); if (tampil === '2d') setTampil('split');
                    }}>{l}</button>
                  ))}
                </div>
                {tampil !== '2d' && (<>
                  <div className="tabs">{([['iso', 'Iso'], ['atas', 'Atas'], ['dock', 'Dock'], ['lorong', 'Lorong']] as [Kamera, string][]).map(([k, l]) => <button key={k} onClick={() => { setPotongan(null); setTimeout(() => api3.current?.kamera(k), 0); }}>{l}</button>)}</div>
                  {([['label', 'Label'], ['orang', 'Manpower'], ['truk', 'Truk'], ['dinding', 'Dinding'], ['atap', 'Atap']] as [keyof OpsiViewer, string][]).map(([k, l]) => (
                    <label key={k} className="sim3d-cek small"><input type="checkbox" checked={opsi3d[k]} onChange={e => setOpsi3d(o => ({ ...o, [k]: e.target.checked }))} />{l}</label>
                  ))}
                </>)}
              </div>
              <span className="small muted">{edit.komponen.length} komponen · {edit.ukur.length} garis ukur {edit.ukur.length > 0 && <button className="ghost" style={{ padding: '2px 8px', marginLeft: 6 }} onClick={() => aksi(e => ({ ...e, ukur: [] }))}>hapus ukur</button>}</span>
            </div>
            <div className={`sim2d-kanvas ${tampil}`}>
              <div className="sim2d-panel2d" style={{ display: tampil === '3d' ? 'none' : undefined }}>
                <Editor2D ref={ed2} edit={edit} pilih={pilih} setPilih={setPilih} mulaiAksi={mulaiAksi} ubah={ubah} mode={mode} grid={grid} snapTepi={snapTepi}
                  potong={potongan ? { sumbu: potongan.arah === 'depan' ? 'x' : 'z', nilai: potongan.nilai } : null} />
              </div>
              {tampil !== '2d' && layout3d && (
                <div className="sim2d-panel3d">
                  <div style={{ display: potongan ? 'none' : 'contents' }}><Viewer3D apiRef={api3} layout={layout3d} shift={layout3d.shiftAktif[0] ?? 0} opsi={opsi3d} kecepatan={kec} /></div>
                  {potongan && (
                    <div className="sim2d-potong-wadah">
                      <div className="sim2d-potong-gulir"><div style={{ width: `${zoomPotong * 100}%`, height: `${zoomPotong * 100}%` }}><Potongan ref={apiPotong} edit={edit} arah={potongan.arah} nilai={potongan.nilai} /></div></div>
                      <div className="sim2d-potong-alat">
                        <label className="small">Posisi potong {potongan.arah === 'depan' ? 'X' : 'Z'}
                          <input type="range" min={0} max={potongan.arah === 'depan' ? edit.gedung.L : edit.gedung.W} step={0.05} value={potongan.nilai} onChange={e => setPotongan(p => (p ? { ...p, nilai: Number(e.target.value) } : p))} />
                          <input type="number" step={0.1} value={potongan.nilai} onChange={e => setPotongan(p => (p ? { ...p, nilai: Number(e.target.value) || 0 } : p))} style={{ width: 70 }} /> m
                        </label>
                        <button className="ghost" onClick={() => setPotongan(p => (p ? { ...p, nilai: potongAwal(edit, p.arah) } : p))}>Ke rak</button>
                        <span className="small">Zoom</span>
                        <button className="ghost" onClick={() => setZoomPotong(z => Math.max(1, z / 1.5))} disabled={zoomPotong <= 1}>−</button>
                        <button className="ghost" onClick={() => setZoomPotong(z => Math.min(8, z * 1.5))}>+</button>
                        <button className="ghost" onClick={async () => { const pp = await kePng(1, apiPotong.current?.svgEkspor()).catch(er => { setErr(er.message); return null; }); if (!pp) return; const a = document.createElement('a'); a.href = pp.url; a.download = `${namaFile()}_potongan_${potongan.arah}.png`; a.click(); }}>PNG potongan</button>
                        <button className="ghost" onClick={() => setPotongan(null)}>Kembali ke 3D</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ---------- kanan: properti & kapasitas */}
          <div className="card sim2d-kanan">
            {terpilih ? (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}><div className="eyebrow">Komponen terpilih</div><button className="ghost" style={{ padding: '2px 8px' }} onClick={() => setPilih(null)}>×</button></div>
                <label className="f">Nama<input value={terpilih.label} onChange={e => ubahK(k => ({ ...k, label: e.target.value }))} /></label>
                <div className="grid2" style={{ gap: 6 }}>
                  <Angka l="X (dari dinding dock)" u="m" v={terpilih.x} set={x => ubahK(k => ({ ...k, x }))} />
                  <Angka l="Z (dari dinding kiri)" u="m" v={terpilih.z} set={x => ubahK(k => ({ ...k, z: x }))} />
                  {terpilih.rak ? (<>
                    <Angka l="Jumlah bay" step={1} min={1} v={nBay(terpilih)} set={x => ubahK(k => { const p = Math.max(1, Math.round(x)) * k.rak!.bayW; return k.rak!.arah === 'x' ? { ...k, w: r2(p) } : { ...k, d: r2(p) }; })} />
                    <Angka l="Kedalaman rak" u="m" step={0.05} v={dimRak(terpilih).dalam} set={x => ubahK(k => (k.rak!.arah === 'x' ? { ...k, d: Math.max(0.3, x) } : { ...k, w: Math.max(0.3, x) }))} />
                  </>) : (<>
                    <Angka l="Panjang (X)" u="m" v={terpilih.w} set={x => ubahK(k => ({ ...k, w: Math.max(0.1, x) }))} />
                    <Angka l="Lebar (Z)" u="m" v={terpilih.d} set={x => ubahK(k => ({ ...k, d: Math.max(0.1, x) }))} />
                  </>)}
                </div>
                {terpilih.area && data && (() => { const a = terpilih.area; const s = a.rak; const ra = ringkasArea(terpilih); return (
                  <>
                    <div className="eyebrow">Rak</div>
                    <div className="grid2" style={{ gap: 6 }}>
                      <label className="f">Jenis rak<select value={a.jenisRak} onChange={e => { const ddr = e.target.value === 'ddr'; const d = DEFAULT_RAK(data.p, ddr);
                        ubahK(k => ({ ...k, label: k.label.replace(/SPR|DDR/, ddr ? 'DDR' : 'SPR'), area: { ...k.area!, jenisRak: ddr ? 'ddr' : 'spr', dalam: ddr ? data.p.ddr.depth : data.p.spr.depth, rak: { ...d, arah: k.area!.rak.arah, level: k.area!.rak.level } } })); }}>
                        <option value="spr">SPR (selective)</option><option value="ddr">DDR (double deep)</option></select></label>
                      <label className="f">Arah baris<select value={s.arah} onChange={() => ubahK(putar)}><option value="x">Depan → belakang</option><option value="z">Kiri → kanan</option></select></label>
                      <label className="f">Konfigurasi<select value={a.konfigurasi} onChange={e => ubahArea({ konfigurasi: e.target.value as SpekArea['konfigurasi'] })}><option value="b2b">Back-to-back</option><option value="single">Single</option></select></label>
                      <label className="f">Mulai dari tepi<select value={a.mulai} onChange={e => ubahArea({ mulai: e.target.value as SpekArea['mulai'] })}><option value="rak">Rak (single di tepi)</option><option value="lorong">Lorong</option></select></label>
                      <Angka l="Kedalaman 1 baris" u="m" step={0.05} v={a.dalam} set={x => ubahArea({ dalam: Math.max(0.3, x) })} />
                      <Angka l="Jarak back-to-back" u="m" step={0.05} v={a.b2b} set={x => ubahArea({ b2b: Math.max(0, x) })} />
                      <Angka l="Lebar bay" u="m" step={0.05} v={s.bayW} set={x => ubahAreaRak({ bayW: Math.max(0.5, x) })} />
                      <Angka l="Palet / level / bay" step={1} min={1} v={s.ppl} set={x => ubahAreaRak({ ppl: Math.max(1, Math.round(x)) })} />
                      <Angka l="Deep (1 SPR · 2 DDR)" step={1} min={1} v={s.deep} set={x => ubahAreaRak({ deep: Math.max(1, Math.round(x)) })} />
                      <Angka l="Level" step={1} min={1} v={s.level} set={x => ubahAreaRak({ level: Math.max(1, Math.round(x)) })} />
                      <Angka l="Tinggi level 1" u="mm" step={50} v={s.level1Mm} set={x => ubahAreaRak({ level1Mm: Math.max(300, x) })} />
                      <Angka l="Tinggi per level" u="mm" step={50} v={s.levelNMm} set={x => ubahAreaRak({ levelNMm: Math.max(300, x) })} />
                    </div>
                    <div className="eyebrow">Lorong</div>
                    <div className="grid2" style={{ gap: 6 }}>
                      <Angka l="Lebar lorong (muka-ke-muka)" u="m" step={0.1} v={s.lebarLorong} set={x => ubahAreaRak({ lebarLorong: Math.max(0.5, x) })} />
                      <Angka l="Cross aisle awal" u="m" step={0.5} v={a.crossAwal} set={x => ubahArea({ crossAwal: Math.max(0, x) })} />
                      <Angka l="Jumlah cross aisle tengah" step={1} min={0} v={a.nTengah} set={x => ubahArea({ nTengah: Math.max(0, Math.round(x)) })} />
                      <Angka l="Lebar cross aisle tengah" u="m" step={0.5} v={a.crossTengah} set={x => ubahArea({ crossTengah: Math.max(0, x) })} />
                      <Angka l="Cross aisle akhir" u="m" step={0.5} v={a.crossAkhir} set={x => ubahArea({ crossAkhir: Math.max(0, x) })} />
                    </div>
                    <p className="small muted" style={{ margin: 0 }}><b>{ra.baris} baris · {angka(ra.bay)} bay · {angka(ra.posisi)} posisi</b> · tinggi rak {angka(tinggiRak(s), 2)} m. Tarik tepi area di denah — baris, lorong, dan bay terbentuk ulang otomatis.</p>
                  </>); })()}
                {terpilih.rak && (() => { const s = terpilih.rak; const set = (p: Partial<typeof s>) => ubahK(k => { const r = { ...k.rak!, ...p }; return { ...k, rak: r, tinggi: r2(tinggiRak(r)) }; }); return (
                  <>
                    <div className="grid2" style={{ gap: 6 }}>
                      <label className="f">Arah baris<select value={s.arah} onChange={() => ubahK(putar)}><option value="x">Depan → belakang</option><option value="z">Kiri → kanan</option></select></label>
                      <label className="f">Muka lorong<select value={s.hadap} onChange={e => set({ hadap: Number(e.target.value) as 1 | -1 })}>
                        <option value={1}>{s.arah === 'x' ? 'Kanan (Z+)' : 'Belakang (X+)'}</option><option value={-1}>{s.arah === 'x' ? 'Kiri (Z−)' : 'Depan (X−)'}</option></select></label>
                      <Angka l="Lebar bay" u="m" step={0.05} v={s.bayW} set={x => ubahK(k => { const n = nBay(k); const r = { ...k.rak!, bayW: Math.max(0.5, x) }; const p = r2(n * r.bayW); return k.rak!.arah === 'x' ? { ...k, rak: r, w: p } : { ...k, rak: r, d: p }; })} />
                      <Angka l="Palet / level / bay" step={1} min={1} v={s.ppl} set={x => set({ ppl: Math.max(1, Math.round(x)) })} />
                      <Angka l="Deep (1 SPR · 2 DDR)" step={1} min={1} v={s.deep} set={x => set({ deep: Math.max(1, Math.round(x)) })} />
                      <Angka l="Level" step={1} min={1} v={s.level} set={x => set({ level: Math.max(1, Math.round(x)) })} />
                      <Angka l="Tinggi level 1" u="mm" step={50} v={s.level1Mm} set={x => set({ level1Mm: Math.max(300, x) })} />
                      <Angka l="Tinggi per level" u="mm" step={50} v={s.levelNMm} set={x => set({ levelNMm: Math.max(300, x) })} />
                      <Angka l="Tinggi rak (isi → level)" u="m" step={0.1} v={r2(tinggiRak(s))} set={x => set({ level: levelDariTinggi(s, x) })} />
                      <Angka l="Lebar lorong perlu" u="m" step={0.1} v={s.lebarLorong} set={x => set({ lebarLorong: Math.max(0.5, x) })} />
                    </div>
                    <p className="small muted" style={{ margin: 0 }}>{nBay(terpilih)} bay × {s.ppl} palet × {s.deep} deep × {s.level} level = <b>{angka(kapasitasRak(terpilih))} posisi</b> · tinggi {angka(tinggiRak(s), 2)} m</p>
                  </>); })()}
                {terpilih.jenis === 'block' && (<div className="grid2" style={{ gap: 6 }}>
                  <Angka l="Tumpuk" step={1} min={1} v={terpilih.tumpuk ?? 1} set={x => ubahK(k => ({ ...k, tumpuk: Math.max(1, Math.round(x)), tinggi: r2(Math.max(1, Math.round(x)) * edit.tinggiPalet) }))} />
                  <div className="f small"><span className="muted">Kapasitas</span><b>{tapakBlok(terpilih)} tapak × {terpilih.tumpuk ?? 1} = {tapakBlok(terpilih) * (terpilih.tumpuk ?? 1)}</b></div>
                </div>)}
                {(terpilih.jenis === 'stagingIn' || terpilih.jenis === 'stagingOut') && (<div className="grid2" style={{ gap: 6 }}>
                  <Angka l="Palet / sequence" step={1} min={0} v={terpilih.palet ?? 0} set={x => ubahK(k => ({ ...k, palet: Math.max(0, Math.round(x)) }))} />
                  <Angka l="Tumpuk" step={1} min={1} v={terpilih.tumpuk ?? 1} set={x => ubahK(k => ({ ...k, tumpuk: Math.max(1, Math.round(x)) }))} />
                  <label className="f">Arus<select value={terpilih.jenis} onChange={e => ubahK(k => ({ ...k, jenis: e.target.value as JenisKomp }))}><option value="stagingIn">Inbound</option><option value="stagingOut">Outbound</option></select></label>
                </div>)}
                {terpilih.jenis === 'dock' && (<label className="f">Arus<select value={terpilih.arus ?? 'inbound'} onChange={e => ubahK(k => ({ ...k, arus: e.target.value as 'inbound' | 'outbound' }))}><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></label>)}
                {['fasilitas', 'kolom', 'dock'].includes(terpilih.jenis) && <Angka l="Tinggi" u="m" step={0.1} v={terpilih.tinggi} set={x => ubahK(k => ({ ...k, tinggi: Math.max(0.1, x) }))} />}
                {terpilih.jenis === 'zona' && <label className="f">Warna<input type="color" value={terpilih.warna ?? '#0ea5e9'} onChange={e => ubahK(k => ({ ...k, warna: e.target.value }))} /></label>}
                <div className="row">
                  {terpilih.rak && <button className="ghost" onClick={() => tarik(true)} title="Panjangkan rak ini sampai rintangan / dinding terdekat">↔ Tarik otomatis</button>}
                  {terpilih.rak && <button className="ghost" onClick={jadikanArea} title="Gabungkan rak sejenis yang sekolom jadi 1 area rak yang bisa ditarik">▦ Jadikan area</button>}
                  {terpilih.area && <button className="ghost" onClick={pecah} title="Ubah area jadi baris rak satuan yang bisa diedit satu per satu">Pecah jadi rak satuan</button>}
                  <button className="ghost" onClick={() => ubahK(putar)}>Putar 90°</button>
                  <button className="ghost" onClick={() => gandakan()}>Gandakan</button>
                  <button className="ghost danger" onClick={hapus}>Hapus</button>
                </div>
                <div className="sim2d-lapis">
                  <span className="small">Ulangi</span>
                  <input type="number" min={1} max={50} value={lapis.n} onChange={e => setLapis(l => ({ ...l, n: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))} />
                  <span className="small">× jarak</span>
                  <input type="number" step={0.1} value={lapis.jarak} onChange={e => setLapis(l => ({ ...l, jarak: Number(e.target.value) || 0 }))} />
                  <span className="small">m ke</span>
                  <select value={lapis.arah} onChange={e => setLapis(l => ({ ...l, arah: e.target.value as 'x' | 'z' }))}><option value="z">kanan (Z)</option><option value="x">belakang (X)</option></select>
                  <button className="ghost" onClick={() => gandakan(lapis.n, lapis.jarak, lapis.arah)}>Buat</button>
                </div>
                <p className="small muted" style={{ margin: 0 }}>Garis oranye di denah = jarak bebas ke rintangan / dinding terdekat. Untuk lorong rak, isi jarak = lebar lorong (mis. 2 × corridor).</p>
              </>
            ) : <p className="small muted">Klik komponen di denah untuk mengedit posisi, ukuran, tinggi, dan spesifikasinya.</p>}

            <div className="eyebrow">Kapasitas (otomatis)</div>
            <table className="sim3d-tabel"><tbody>
              <tr><td>Posisi SPR</td><td className="num">{angka(rk.posisiSpr)}</td></tr>
              <tr><td>Posisi DDR</td><td className="num">{angka(rk.posisiDdr)}</td></tr>
              <tr><td>Posisi block stack</td><td className="num">{angka(rk.posisiBlock)}</td></tr>
              <tr><td><b>Total posisi</b></td><td className="num"><b>{angka(rk.totalRak)}</b></td></tr>
              <tr><td>Stok desain (tender)</td><td className="num">{angka(edit.stokDesain)} palet</td></tr>
              <tr><td>Selisih</td><td className="num" style={{ color: rk.totalRak >= edit.stokDesain ? 'var(--ok)' : 'var(--bad)' }}>{rk.totalRak >= edit.stokDesain ? '+' : ''}{angka(rk.totalRak - edit.stokDesain)}</td></tr>
              <tr><td>Okupansi</td><td className="num">{Math.round(rk.okupansi * 100)}%</td></tr>
              <tr><td>Staging (palet / sequence)</td><td className="num">{angka(rk.posisiStaging)}</td></tr>
            </tbody></table>
            <div className="eyebrow">Luas</div>
            <table className="sim3d-tabel"><tbody>
              <tr><td>Gedung</td><td className="num">{angka(rk.luasGedung)} m²</td></tr>
              <tr><td>Rak (tapak)</td><td className="num">{angka(rk.luasRak)} m² · {angka((rk.luasRak / Math.max(1, rk.luasGedung)) * 100, 0)}%</td></tr>
              <tr><td>Block stack</td><td className="num">{angka(rk.luasBlock)} m²</td></tr>
              <tr><td>Staging</td><td className="num">{angka(rk.luasStaging)} m²</td></tr>
              <tr><td>Fasilitas</td><td className="num">{angka(rk.luasFasilitas)} m²</td></tr>
              <tr><td>Luas rencana (cost model)</td><td className="num">{angka(data.auto.luasRencana)} m²</td></tr>
            </tbody></table>
            {rk.peringatan.length > 0 && (
              <div className="notice small">
                <b>Cek layout ({rk.peringatan.length})</b>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {rk.peringatan.slice(0, 30).map((w, i) => <li key={i} style={{ color: w.level === 'kritis' ? 'var(--bad)' : undefined, cursor: w.id ? 'pointer' : undefined }} onClick={() => w.id && setPilih(w.id)}>{w.pesan}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
