'use client';
// Leca Game · mode main 3D: gudang 3D (gaya bersih) + lapisan simulasi, kontrol waktu, kartu KPI,
// panel info objek terpilih, pelacakan order, daftar dock/MHE/truk, productivity yang bisa diubah saat main,
// mode jelajah (1 karakter + observasi & stopwatch time study), dan red flag.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HARI, hitungRedFlag, jalankanSampai, shiftBerikut, waktuGame, type Dunia, type JenisTugas, type RedFlag } from '@/lib/game';
import type { LayoutGudang } from '@/lib/simulasi3d/layout';
import type { Kamera, OpsiViewer, TemaViewer, ViewerApi } from '../Viewer3D';
import { WARNA_ORANG } from '../warna';
import { buatLapisanGame, type KontrolGame, type Pilihan, type StatGerak } from './lapisan3d';
import { csvStudi, ELEMEN, LABEL_AKSI, MODE_PEMAIN, PFD, ringkasStudi, studiAwal, type ModePemain } from './pemain';
import { Ikon, LABEL_TUGAS, PanelArmada, PanelInfo, PanelOrder, orderDilacak } from './panel';
import Sim2D, { type Opsi2D } from './Sim2D';
import Analisis from './Analisis';

const Viewer3D = dynamic(() => import('../Viewer3D'), { ssr: false, loading: () => <div className="sim3d-wadah sim3d-muat">Menyiapkan 3D…</div> });

const KECEPATAN = [1, 10, 60, 300, 1200, 3600];
const labelKec = (k: number) => (k < 60 ? `${k}×` : k < 3600 ? `${k / 60} mnt/dtk` : '1 jam/dtk');
const LABEL_KEMAMPUAN: Record<string, string> = { admin: 'Admin', checker: 'Checker', operator: 'Operator MHE', picker: 'Picker', tkbm: 'TKBM' };
const jt = (v: number) => `${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
const hariId = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const angka = (v: number, k = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: k });
const durasiTeks = (det: number) => { const s = Math.max(0, Math.round(det)); return s >= 3600 ? `${Math.floor(s / 3600)} j ${Math.floor((s % 3600) / 60)} m` : s >= 60 ? `${Math.floor(s / 60)} m ${s % 60} d` : `${s} d`; };
type TabBawah = 'tugas' | 'flag' | 'analisis' | 'prod' | 'kejadian' | 'tampilan';
export type TampilSim = '3d' | '2d' | 'split';

/** Red flag dari jarak layout: kecepatan gerak yang dituntut productivity (jarak ÷ waktu jalan) dibanding batas wajar. */
function flagGerak(sg: Partial<Record<JenisTugas, StatGerak>>): RedFlag[] {
  const out: RedFlag[] = [];
  for (const [j, x] of Object.entries(sg) as [JenisTugas, StatGerak][]) {
    if (!x || x.n < 3) continue;
    const rata = x.kecTotal / x.n, orang = x.olehOrang / x.n > 0.5, batas = orang ? 1.8 : 3.0;
    if (rata > batas) out.push({ kode: `GERAK_${j}`, tingkat: rata > batas * 1.5 ? 'kritis' : 'peringatan', judul: `Productivity ${LABEL_TUGAS[j].toLowerCase()} tidak realistis untuk jarak layout`,
      detail: `Jarak rata-rata ${angka(x.jarakTotal / x.n)} m per tugas menuntut kecepatan ${angka(rata, 1)} m/dtk (wajar ≤ ${batas} m/dtk ${orang ? 'jalan kaki' : 'MHE'}).`,
      saran: 'Turunkan productivity di tender, atau dekatkan lokasi (slotting ABC, staging dekat rak, dock dekat area simpan).' });
  }
  return out;
}

export default function Main3D({ dunia, layout, hariMaks, onTick, tampilAwal = '3d' }: { dunia: Dunia; layout: LayoutGudang; hariMaks: number; onTick: () => void; tampilAwal?: TampilSim }) {
  const [tampilan, setTampilan] = useState<TampilSim>(tampilAwal);
  const [opsi2d, setOpsi2d] = useState<Opsi2D>({ alur: false, okupansi: true, label: true });
  const kontrol = useRef<KontrolGame>({ jalan: false, kecepatan: 60, batas: hariMaks * HARI - 1, pilih: null,
    jelajah: false, tombol: { maju: false, mundur: false, kiri: false, kanan: false, lari: false }, amatan: null, statGerak: {} });
  if (typeof window !== 'undefined' && (window as unknown as { __LECA_DEBUG?: unknown }).__LECA_DEBUG) (window as unknown as { __LECA_DEBUG: unknown }).__LECA_DEBUG = kontrol.current;   // hook uji otomatis
  const [jelajah, setJelajahS] = useState(false);
  const [tabBawah, setTabBawah] = useState<TabBawah>('flag');
  const [catat, setCatat] = useState<{ id: string; jenis: 'pekerja' | 'mhe'; nama: string; mulai: number } | null>(null);
  const setJelajah = (v: boolean) => { kontrol.current.jelajah = v; setJelajahS(v); if (v) { setPanel(false); if (kontrol.current.kecepatan > 10) aturKec(1); } };
  const tekan = (t: keyof KontrolGame['tombol'], v: boolean) => { kontrol.current.tombol[t] = v; };
  kontrol.current.batas = hariMaks * HARI - 1;
  const [jalan, setJalan] = useState(false);
  const [kec, setKec] = useState(60);
  const [pilih, setPilihState] = useState<Pilihan | null>(null);
  const [tema, setTema] = useState<TemaViewer>('bersih');
  const [, setVersi] = useState(0);
  const [opsi, setOpsi] = useState<OpsiViewer>({ atap: false, dinding: true, label: false, animasi: true, truk: true, orang: true });
  const [panel, setPanel] = useState(tampilAwal === '3d');
  const api = useRef<ViewerApi>(null);
  const onTickRef = useRef(onTick); onTickRef.current = onTick;
  const setPilih = (p: Pilihan | null) => { kontrol.current.pilih = p; setPilihState(p); };

  const lapisan = useMemo(() => buatLapisanGame(dunia, layout, kontrol, () => setJalan(false), p => setPilih(p)), [dunia, layout]);
  useEffect(() => { const id = setInterval(() => { setVersi(x => x + 1); onTickRef.current(); }, 400); return () => clearInterval(id); }, []);
  useEffect(() => { kontrol.current.jalan = false; kontrol.current.statGerak = {}; setJalan(false); setPilih(null); setCatat(null); }, [dunia]);

  const putar = (v: boolean) => { kontrol.current.jalan = v && dunia.t < kontrol.current.batas; setJalan(kontrol.current.jalan); };
  const aturKec = (k: number) => { kontrol.current.kecepatan = k; setKec(k); };
  const lompat = (t: number) => { jalankanSampai(dunia, Math.min(kontrol.current.batas, t)); setVersi(x => x + 1); onTick(); };

  const w = waktuGame(dunia);
  const hi = dunia.hariIni;
  const antre: Partial<Record<JenisTugas, number>> = {};
  for (const id of dunia.menunggu) { const t = dunia.tugas.get(id); if (t) antre[t.jenis] = (antre[t.jenis] ?? 0) + 1; }
  const jalanTugas: Partial<Record<JenisTugas, number>> = {};
  for (const t of dunia.tugas.values()) if (t.status === 'jalan') jalanTugas[t.jenis] = (jalanTugas[t.jenis] ?? 0) + 1;
  const jenisTampil = (Object.keys(LABEL_TUGAS) as JenisTugas[]).filter(j => (antre[j] ?? 0) + (jalanTugas[j] ?? 0) > 0 || !dunia.sk.prod[j].luar);
  const kerja = dunia.pekerja.filter(p => p.kemampuan);
  const sibuk = kerja.filter(p => p.sibuk).length, hadir = kerja.filter(p => !p.absen && (p.sibuk || w.shiftAktif.includes(p.shift))).length;
  const selesai = dunia.t >= kontrol.current.batas;
  const kemampuan = [...new Set(kerja.map(p => p.kemampuan!))];
  // KPI
  let stok = 0; for (const l of dunia.lpn.values()) if (l.status === 'disimpan' || l.status === 'diterima') stok++;
  const trukDiLokasi = dunia.dock.filter(x => x.truk).length + dunia.antreDock.inbound.length + dunia.antreDock.outbound.length;
  const inbDiLokasi = dunia.dock.filter(x => x.truk && x.arus === 'inbound').length + dunia.antreDock.inbound.length;
  let kirim = 0, tepat = 0; for (const r of dunia.laporan) { kirim += r.orderSelesai; tepat += r.orderTepat; }
  kirim += hi.orderSelesai; tepat += hi.orderTepat;
  const kap = [...dunia.lokasi.values()].reduce((a, l) => a + (l.tipe === 'rak' || l.tipe === 'lantai' ? l.kapasitas : 0), 0);
  const order = orderDilacak(dunia, pilih);
  const flags = hitungRedFlag(dunia, flagGerak(kontrol.current.statGerak));
  const nKritis = flags.filter(f => f.tingkat === 'kritis').length;
  const am = kontrol.current.amatan;
  // stopwatch time study: tugas yang selesai oleh resource ini sejak mulai dicatat
  const hasilCatat = (() => {
    if (!catat) return null;
    const jamAmati = Math.max(0, dunia.t - catat.mulai) / 3600;
    const per = new Map<JenisTugas, { n: number; qty: number; satuan: string; jamSiklus: number; jarak: number }>();
    let kerja = 0, jalanTugas = 0;
    for (const t of dunia.tugas.values()) {
      if (t.mulai == null || (catat.jenis === 'pekerja' ? t.pekerja !== catat.id : t.mhe !== catat.id)) continue;
      const akhir = t.status === 'selesai' ? t.selesai ?? dunia.t : dunia.t;
      const tumpang = Math.max(0, Math.min(akhir, dunia.t) - Math.max(t.mulai, catat.mulai)); if (tumpang <= 0) continue;
      kerja += tumpang / 3600; if (t.status !== 'selesai') { jalanTugas++; continue; }
      if ((t.selesai ?? 0) < catat.mulai) continue;
      const x = per.get(t.jenis) ?? { n: 0, qty: 0, satuan: t.satuan, jamSiklus: 0, jarak: 0 }; x.n++; x.qty += t.qty; x.jamSiklus += (t.durasi ?? 0) / 3600; per.set(t.jenis, x);
    }
    return { jamAmati, per, kerja, jalanTugas, utilisasi: jamAmati > 0 ? Math.min(1, kerja / jamAmati) : 0 };
  })();
  const [amatKecil, setAmatKecil] = useState(false);
  const sp = (kontrol.current.pemain ??= studiAwal());
  const pilihMode = (m: ModePemain) => { sp.mode = m; setVersi(x => x + 1); };
  const unduhStudi = () => {
    const blob = new Blob(['\ufeff' + csvStudi(sp.siklus)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `motion-study-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const studi = ringkasStudi(sp.siklus);
  const detik = (x: number) => `${angka(x, x < 10 ? 1 : 0)} dtk`;
  const berjalan = sp.berjalan;
  const ubahProd = (j: JenisTugas, x: number) => { if (!(x > 0)) return; dunia.sk.prod[j] = { ...dunia.sk.prod[j], prod: x, sumber: 'diubah saat main' }; setVersi(v => v + 1); };

  return (
    <div className="card game-main">
      <div className="game-bar">
        <div className="game-jam">
          <b><span className={`gm-live${jalan ? ' on' : ''}`} />Hari {w.hari + 1} · {hariId(w.tanggal)} · {w.teks}</b>
          <span className="small muted">{!w.operasi ? 'hari libur' : w.shiftAktif.length ? `shift ${w.shiftAktif.map(s => s + 1).join(' & ')} berjalan` : 'di luar jam kerja'}{selesai ? ' · batas hari main tercapai' : ''}</span>
        </div>
        <div className="game-kontrol">
          <button type="button" onClick={() => putar(!jalan)} disabled={selesai} aria-label={jalan ? 'Jeda' : 'Jalankan'}>{jalan ? '❚❚ Jeda' : '▶ Jalan'}</button>
          <div className="tabs" role="group" aria-label="Kecepatan">
            {KECEPATAN.map(k => <button key={k} type="button" className={kec === k ? 'on' : ''} onClick={() => aturKec(k)}>{labelKec(k)}</button>)}
          </div>
          <button type="button" className="ghost" disabled={selesai} onClick={() => lompat(shiftBerikut(dunia))}>Ke shift berikutnya ⏭</button>
          <button type="button" className="ghost" disabled={selesai} onClick={() => lompat((w.hari + 1) * HARI - 1)}>Selesaikan hari ini</button>
          <div className="tabs" role="group" aria-label="Tampilan">
            {([['2d', '2D'], ['split', '2D + 3D'], ['3d', '3D']] as [TampilSim, string][]).map(([k, l]) => <button key={k} type="button" className={tampilan === k ? 'on' : ''} onClick={() => { setTampilan(k); if (k === '2d' && jelajah) setJelajah(false); if (k !== '3d') setPanel(false); }}>{l}</button>)}
          </div>
          <button type="button" className={jelajah ? '' : 'ghost'} disabled={tampilan === '2d'} onClick={() => setJelajah(!jelajah)} title="Kendalikan 1 karakter untuk menjelajah gudang dan mengamati pekerjaan">{jelajah ? '✕ Keluar jelajah' : '🧭 Mode jelajah'}</button>
          <button type="button" className={`ghost gm-flag-tombol${nKritis ? ' kritis' : ''}`} onClick={() => setTabBawah('flag')}>⚑ {flags.length} red flag{nKritis ? ` · ${nKritis} kritis` : ''}</button>
        </div>
      </div>

      <div className={`game-layar tampil-${tampilan}${panel ? '' : ' tanpa-panel'}`}>
        {tampilan !== '3d' && <Sim2D dunia={dunia} layout={layout} kontrol={kontrol} pilih={pilih} onPilih={p => setPilih(p)} opsi={opsi2d} />}
        <div className="gm-3d"><Viewer3D apiRef={api} layout={layout} shift={0} opsi={opsi} kecepatan={{ faktor: 0, siklus: {} }} lapisan={lapisan} tema={tema} /></div>
        <div className="gm-kpi">
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="palet" /></span><div><small>Stok di gudang</small><b>{angka(stok)}</b><span>palet · {kap ? angka((stok / kap) * 100) : 0}% terisi <em className={hi.paletMasuk - Math.round(hi.paletKeluarEq) >= 0 ? 'naik' : 'turun'}>{hi.paletMasuk - Math.round(hi.paletKeluarEq) >= 0 ? '▲' : '▼'} {Math.abs(hi.paletMasuk - Math.round(hi.paletKeluarEq))}</em></span></div></div>
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="truk" /></span><div><small>Truk di lokasi</small><b>{trukDiLokasi}</b><span>{inbDiLokasi} inbound · {trukDiLokasi - inbDiLokasi} outbound</span></div></div>
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="jam" /></span><div><small>Tepat waktu</small><b>{kirim ? `${angka((tepat / kirim) * 100, 1)}%` : '—'}</b><span>{angka(kirim)} order terkirim</span></div></div>
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="orang" /></span><div><small>Kas</small><b className={dunia.kas < 0 ? 'neg' : ''}>{jt(dunia.kas)}</b><span>hari ini +{jt(hi.pendapatan)} · {sibuk}/{hadir} orang sibuk</span></div></div>
        </div>
        {pilih && panel && !jelajah && <PanelInfo d={dunia} p={pilih} tutup={() => setPilih(null)} />}
        {jelajah && (
          <>
            <div className={`gm-kartu gm-amati${amatKecil ? ' kecil' : ''}`}>
              <div className="gm-judul"><Ikon n="orang" /> <b>Motion study</b>
                <span className="small muted" style={{ marginLeft: 'auto' }}>{sp.mode === 'bebas' ? (am ? `${angka(am.jarak, 1)} m` : 'dekati ≤ 8 m') : `${angka(sp.kecepatan, 1)} m/dtk`}</span>
                <button type="button" className="ghost gm-amati-lipat" onClick={() => setAmatKecil(!amatKecil)} aria-label={amatKecil ? 'Buka panel' : 'Kecilkan panel'}>{amatKecil ? '▴' : '▾'}</button>
              </div>
              <div className="gm-mode-pemain" role="group" aria-label="Mode kerja">
                {(Object.keys(MODE_PEMAIN) as ModePemain[]).map(m => <button key={m} type="button" className={sp.mode === m ? 'on' : 'ghost'} title={MODE_PEMAIN[m].ket} onClick={() => pilihMode(m)}>{MODE_PEMAIN[m].ikon} {MODE_PEMAIN[m].label}</button>)}
              </div>
              {sp.mode !== 'bebas' && (
                <div className="gm-kerja">
                  <p className="small muted" style={{ margin: 0 }}>{MODE_PEMAIN[sp.mode].ket}</p>
                  <div className="gm-kerja-aksi">
                    <button type="button" disabled={!!sp.aksi} onClick={() => { sp.minta++; }}>E · {sp.aksi ? LABEL_AKSI[sp.aksi.nama] ?? sp.aksi.nama : 'Aksi'}</button>
                    {(sp.mode === 'cbt' || sp.mode === 'reach') && <span className="gm-level">
                      <button type="button" className="ghost" onClick={() => { sp.level = Math.max(0, sp.level - 1); setVersi(x => x + 1); }} title="F">▼</button>
                      <b>Level {sp.level + 1}</b><span className="small muted">{angka(layout.levelY[sp.level] ?? 0, 2)} m</span>
                      <button type="button" className="ghost" onClick={() => { sp.level = Math.min(layout.levelY.length - 1, sp.level + 1); setVersi(x => x + 1); }} title="R">▲</button>
                    </span>}
                  </div>
                  <div className="small gm-kerja-petunjuk">{sp.petunjuk}</div>
                  {sp.aksi && <div className="gm-fase" style={{ gridTemplateColumns: '1fr' }}><div className="kini"><i style={{ width: `${Math.round(sp.aksi.f * 100)}%` }} /></div></div>}
                  {berjalan && (
                    <div className="gm-amati-grid">
                      <div><small>Siklus berjalan</small><b>{detik(berjalan.jalan.s + berjalan.bawa.s + berjalan.diam + Object.values(berjalan.aksi).reduce((a, b) => a + b, 0))}</b><span>{sp.bawa ? `membawa ${sp.bawa}` : 'tanpa muatan'}</span></div>
                      <div><small>Jalan kosong</small><b>{detik(berjalan.jalan.s)}</b><span>{angka(berjalan.jalan.m, 1)} m</span></div>
                      <div><small>Jalan bermuatan</small><b>{detik(berjalan.bawa.s)}</b><span>{angka(berjalan.bawa.m, 1)} m</span></div>
                      <div><small>Aksi · diam</small><b>{detik(Object.values(berjalan.aksi).reduce((a, b) => a + b, 0))}</b><span>diam {detik(berjalan.diam)}</span></div>
                    </div>
                  )}
                </div>
              )}
              {sp.siklus.length > 0 && !amatKecil && (
                <div className="gm-catat">
                  <div className="small"><b>Hasil motion study · {sp.siklus.length} siklus</b></div>
                  <table className="sim3d-tabel"><thead><tr><th>Pekerjaan</th><th className="num">n</th><th className="num">Siklus rata²</th><th className="num">Output /jam</th></tr></thead><tbody>
                    {studi.map(r => {
                      const p = dunia.sk.prod[r.jenis]; const tender = p ? p.prod * dunia.sk.faktor : 0; const satuanSama = p?.satuan === r.satuan;
                      const selisih = satuanSama && tender > 0 ? r.standarJam / tender - 1 : null;
                      return (<tr key={`${r.jenis}${r.ket}`}><td>{LABEL_TUGAS[r.jenis]}<div className="small muted">{r.ket}</div></td><td className="num">{r.n}</td>
                        <td className="num">{detik(r.siklus)}<div className="small muted">jalan {detik(r.jalan.s + r.bawa.s)} · {angka(r.jalan.m + r.bawa.m, 0)} m</div><div className="small muted">aksi {detik(r.aksi)} · diam {detik(r.diam)}</div></td>
                        <td className="num"><b>{angka(r.standarJam, 1)}</b> {r.satuan}<div className="small muted">murni {angka(r.outputJam, 1)} · tender {satuanSama ? angka(tender, 1) : '—'}</div>
                          {selisih != null && <div className="small" style={{ color: selisih < -0.1 ? 'var(--bad)' : selisih > 0.1 ? 'var(--ok)' : undefined }}>{selisih < 0 ? 'tender lebih cepat' : 'studi lebih cepat'} {angka(Math.abs(selisih) * 100, 0)}%</div>}</td></tr>);
                    })}
                  </tbody></table>
                  <details className="small"><summary>Siklus terakhir</summary>
                    <table className="sim3d-tabel"><thead><tr><th>#</th><th>Pekerjaan</th><th className="num">Jalan</th><th className="num">Bawa</th><th className="num">Aksi</th><th className="num">Total</th></tr></thead><tbody>
                      {sp.siklus.slice(-8).reverse().map(c => <tr key={c.no}><td>{c.no}</td><td>{LABEL_TUGAS[c.jenis]}</td><td className="num">{angka(c.jalan.s, 0)}s · {angka(c.jalan.m, 0)}m</td><td className="num">{angka(c.bawa.s, 0)}s · {angka(c.bawa.m, 0)}m</td><td className="num">{angka(Object.values(c.aksi).reduce((a, b) => a + b, 0), 0)}s</td><td className="num"><b>{angka(c.total, 0)}s</b></td></tr>)}
                    </tbody></table>
                  </details>
                  <p className="small muted" style={{ margin: 0 }}>Output /jam = 3.600 ÷ (siklus × {1 + PFD}) — sudah termasuk allowance PF&D {PFD * 100}%; "murni" tanpa allowance. Jalan diukur nyata (kecepatan {MODE_PEMAIN[sp.mode].kec.kosong} m/dtk kosong, {MODE_PEMAIN[sp.mode].kec.bawa} bermuatan); aksi memakai waktu elemen standar (mis. posisi {ELEMEN.posisi} dtk, scan {ELEMEN.scan} dtk, input dokumen {ELEMEN.dokInput} dtk).</p>
                  <div className="row"><button type="button" className="ghost" onClick={unduhStudi}>⬇ CSV</button><button type="button" className="ghost danger" onClick={() => { sp.siklus = []; sp.berjalan = null; setVersi(x => x + 1); }}>Reset studi</button></div>
                </div>
              )}
              {sp.mode === 'bebas' && (<>
              {!am ? <p className="small muted" style={{ margin: 0 }}>Jalan (W/A/S/D) mendekati pekerja atau MHE di staging, lorong rak, atau dock.</p> : (
                <>
                  <div className="gm-amati-nama"><b>{am.nama}</b>{am.role && am.jenis === 'pekerja' && <span className="small muted">{am.role}</span>}</div>
                  {!am.tugas ? <p className="small" style={{ margin: 0 }}><span className="gm-pill info">{am.ket ? 'Patroli' : 'Siaga'}</span> {am.ket ?? 'menunggu tugas berikutnya di area kerjanya.'}</p> : (() => {
                    const tg = am.tugas; const realistis = tg.kecepatan <= (am.jenis === 'mhe' ? 3 : 1.8);
                    const sisa = Math.max(0, tg.durasiStd - tg.berjalan);
                    return (<>
                      <div className="small"><span className="gm-pill jalan">{LABEL_TUGAS[tg.jenis]}</span>{tg.bantu && <span className="gm-pill info" title="Role serumpun membantu karena antrean tugas utamanya kosong">membantu</span>} <span className="muted">{tg.id}</span></div>
                      <div className="gm-fase" style={{ gridTemplateColumns: `repeat(${tg.langkahList.length}, 1fr)` }}>
                        {tg.langkahList.map((l, i) => <div key={l} className={i < tg.langkah ? 'lewat' : i === tg.langkah ? 'kini' : ''} title={l}><i style={i === tg.langkah ? { width: `${Math.round(Math.min(1, Math.max(0, (tg.f - [0, 0.22, 0.32, 0.88][i]) / ([0.22, 0.1, 0.56, 0.12][i] || 1))) * 100)}%` } : undefined} /></div>)}
                      </div>
                      <div className="small"><b>Langkah {tg.langkah + 1}/{tg.langkahList.length}:</b> {tg.fase}</div>
                      {!amatKecil && catat && <div className="small muted">Standar {durasiTeks(tg.durasiStd)} · progres {Math.round(tg.f * 100)}% · {angka(tg.jarakJalur)} m · <span style={{ color: realistis ? undefined : 'var(--bad)' }}>{angka(tg.kecepatan, 2)} m/dtk ({realistis ? 'wajar' : 'tidak realistis'})</span></div>}
                      {!amatKecil && !catat && <div className="gm-amati-grid">
                        <div><small>Waktu standar</small><b>{durasiTeks(tg.durasiStd)}</b><span>dari productivity</span></div>
                        <div><small>Progres</small><b>{Math.round(tg.f * 100)}%</b><span>sisa {durasiTeks(sisa)}</span></div>
                        <div><small>Jarak tempuh</small><b>{angka(tg.jarakJalur)} m</b><span>jalur di layout</span></div>
                        <div className={realistis ? '' : 'buruk'}><small>Kecepatan dituntut</small><b>{angka(tg.kecepatan, 2)} m/dtk</b><span>{realistis ? 'wajar' : 'tidak realistis'}</span></div>
                      </div>}
                    </>);
                  })()}
                  {catat?.id === am.id
                    ? <button type="button" className="ghost" onClick={() => setCatat(null)}>■ Hentikan time study</button>
                    : <button type="button" onClick={() => setCatat({ id: am.id, jenis: am.jenis, nama: am.nama, mulai: dunia.t })}>⏱ Mulai time study</button>}
                </>
              )}
              {catat && hasilCatat && !amatKecil && (
                <div className="gm-catat">
                  <div className="small"><b>Time study · {catat.nama}</b></div>
                  {!jalan && hasilCatat.jamAmati < 1 / 60 && <p className="small gm-catat-tip">Waktu sedang dijeda — tekan <b>▶ Jalan</b> supaya pekerja bergerak dan hasil terisi.</p>}
                  <div className="gm-amati-grid">
                    <div><small>Diamati</small><b>{durasiTeks(hasilCatat.jamAmati * 3600)}</b><span>waktu game</span></div>
                    <div><small>Bekerja</small><b>{durasiTeks(hasilCatat.kerja * 3600)}</b><span>{hasilCatat.jalanTugas ? '1 tugas berjalan' : 'tidak ada tugas berjalan'}</span></div>
                    <div><small>Menganggur</small><b>{durasiTeks(Math.max(0, hasilCatat.jamAmati - hasilCatat.kerja) * 3600)}</b><span>menunggu tugas</span></div>
                    <div className={hasilCatat.utilisasi < 0.5 && hasilCatat.jamAmati > 0.25 ? 'buruk' : ''}><small>Utilisasi</small><b>{Math.round(hasilCatat.utilisasi * 100)}%</b><span>bekerja ÷ diamati</span></div>
                  </div>
                  {hasilCatat.per.size > 0 ? (
                    <table className="sim3d-tabel"><thead><tr><th>Tugas</th><th className="num">Selesai</th><th className="num">Siklus</th><th className="num" title="hasil ÷ waktu diamati, dibanding standar productivity">Output / standar per jam</th></tr></thead><tbody>
                      {[...hasilCatat.per.entries()].map(([j, x]) => {
                        const p = dunia.sk.prod[j]; const std = p.prod * dunia.sk.faktor;
                        const out = hasilCatat.jamAmati > 0 ? x.qty / hasilCatat.jamAmati : 0;
                        return <tr key={j}><td>{LABEL_TUGAS[j]}</td><td className="num">{x.n}×</td><td className="num">{durasiTeks((x.jamSiklus / x.n) * 3600)}</td>
                          <td className="num"><b style={{ color: out < std * 0.5 ? 'var(--bad)' : undefined }}>{angka(out, 1)}</b> / {angka(std, 1)} {p.satuan}</td></tr>;
                      })}
                    </tbody></table>
                  ) : <p className="small muted" style={{ margin: 0 }}>Belum ada tugas yang selesai sejak time study dimulai.</p>}
                  <p className="small muted" style={{ margin: 0 }}>Siklus = waktu rata-rata per tugas. Output /jam = hasil ÷ waktu diamati (termasuk menganggur) — bandingkan dengan standar untuk melihat kapasitas yang tidak terpakai.</p>
                </div>
              )}
              </>)}
            </div>
            <div className="gm-dpad" aria-label="Kendali karakter">
              {([['maju', '▲', 'atas'], ['kiri', '◀', 'kiri'], ['kanan', '▶', 'kanan'], ['mundur', '▼', 'bawah']] as const).map(([t, ikon, kls]) => (
                <button key={t} type="button" className={`ghost ${kls}`} aria-label={t}
                  onPointerDown={e => { e.preventDefault(); tekan(t, true); }} onPointerUp={() => tekan(t, false)} onPointerLeave={() => tekan(t, false)} onPointerCancel={() => tekan(t, false)}>{ikon}</button>
              ))}
              <button type="button" className="aksi" onPointerDown={e => { e.preventDefault(); sp.minta++; }} aria-label="Aksi (E)">E</button>
              <button type="button" className="ghost lari" onPointerDown={e => { e.preventDefault(); tekan('lari', true); }} onPointerUp={() => tekan('lari', false)} onPointerLeave={() => tekan('lari', false)}>Lari</button>
            </div>
            <p className="gm-petunjuk small">{sp.mode === 'bebas' ? 'WASD / panah = jalan · Shift = lari · seret layar = putar kamera · scroll = zoom' : `WASD = gerak · E = ${sp.petunjuk.startsWith('E = ') ? sp.petunjuk.slice(4) : 'aksi'}${sp.mode === 'cbt' || sp.mode === 'reach' ? ' · R / F = level garpu' : ''}`}</p>
          </>
        )}
        {panel && !jelajah && <PanelOrder d={dunia} o={order} pilih={p => setPilih(p)} />}
        {panel && !jelajah && <PanelArmada d={dunia} pilih={p => setPilih(p)} />}
        {!jelajah && <button type="button" className="gm-tombol-panel ghost" onClick={() => setPanel(!panel)}>{panel ? 'Sembunyikan panel' : 'Tampilkan panel'}</button>}
      </div>

      <div className="tabs game-tab-bawah" role="tablist">
        {([['flag', `Red flag (${flags.length})`], ['analisis', 'Analisis KPI'], ['tugas', 'Tugas'], ['prod', 'Productivity'], ['kejadian', 'Kejadian'], ['tampilan', 'Tampilan']] as [TabBawah, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tabBawah === k} className={tabBawah === k ? 'on' : ''} onClick={() => setTabBawah(k)}>{l}</button>
        ))}
      </div>
      <div className="game-bawah-isi">
        {tabBawah === 'flag' && (
          flags.length === 0 ? <p className="small muted">Belum ada masalah terdeteksi. Jalankan simulasi beberapa jam/hari supaya pola terlihat.</p> : (
            <div className="gm-flag-list">
              {flags.map(f => (
                <div key={f.kode} className={`gm-flag ${f.tingkat}`}>
                  <div className="kepala"><span className={`gm-pill ${f.tingkat === 'kritis' ? 'warn kritis' : f.tingkat === 'peringatan' ? 'warn' : 'info'}`}>{f.tingkat}</span><b>{f.judul}</b></div>
                  <p className="small">{f.detail}</p>
                  <p className="small muted"><b>Saran:</b> {f.saran}</p>
                </div>
              ))}
            </div>
          )
        )}
        {tabBawah === 'tugas' && (
          <>
            <div className="game-tugas">
              {jenisTampil.map(j => (
                <div key={j} className={(antre[j] ?? 0) > 20 ? 'padat' : ''}><span>{LABEL_TUGAS[j]}{dunia.sk.prod[j].luar ? ' *' : ''}</span><b>{jalanTugas[j] ?? 0}</b><i>{antre[j] ?? 0}</i></div>
              ))}
            </div>
            <p className="small muted">Angka tebal = sedang dikerjakan, abu-abu = antre.{jenisTampil.some(j => dunia.sk.prod[j].luar) ? ' * dikerjakan pihak luar (tidak ada aktivitasnya di tender).' : ''}</p>
          </>
        )}
        {tabBawah === 'prod' && (
          <>
            <p className="small muted" style={{ margin: '0 0 6px' }}>Ubah productivity langsung saat bermain — berlaku untuk tugas berikutnya. Durasi tugas = 3600 × qty ÷ (productivity × faktor {angka(dunia.sk.faktor, 3)}). Kolom <b>kecepatan dituntut</b> = jarak jalur di layout ÷ waktu jalan; merah bila tidak realistis.</p>
            <div className="tablewrap"><table className="sim3d-tabel">
              <thead><tr><th>Tugas</th><th className="num">Productivity /jam</th><th className="num">Tugas tercatat</th><th className="num">Jarak rata-rata</th><th className="num">Kecepatan dituntut</th><th>Sumber</th></tr></thead>
              <tbody>
                {(Object.keys(dunia.sk.prod) as JenisTugas[]).map(j => {
                  const p = dunia.sk.prod[j]; const sg = kontrol.current.statGerak[j];
                  const kecR = sg && sg.n ? sg.kecTotal / sg.n : null; const batas = sg && sg.olehOrang / Math.max(1, sg.n) > 0.5 ? 1.8 : 3.0;
                  return (
                    <tr key={j}>
                      <td>{LABEL_TUGAS[j]}{p.luar ? ' *' : ''}</td>
                      <td className="num"><input type="number" min={1} step={1} defaultValue={p.prod} key={`${j}-${p.sumber}`} style={{ width: 76, background: p.sumber === 'diubah saat main' ? 'var(--asumsi)' : undefined }}
                        onBlur={e => ubahProd(j, Number(e.target.value))} onKeyDown={e => { if (e.key === 'Enter') ubahProd(j, Number((e.target as HTMLInputElement).value)); }} /> <span className="small muted">{p.satuan}</span></td>
                      <td className="num">{dunia.stat.selesai[j]?.n ?? 0}</td>
                      <td className="num">{sg && sg.n ? `${angka(sg.jarakTotal / sg.n)} m` : '—'}</td>
                      <td className="num" style={{ color: kecR != null && kecR > batas ? 'var(--bad)' : undefined }}>{kecR != null ? `${angka(kecR, 2)} m/dtk` : '—'}</td>
                      <td className="small muted">{p.luar ? 'pihak luar' : p.sumber}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </>
        )}
        {tabBawah === 'kejadian' && <ul className="small game-kejadian">{hi.kejadian.length ? hi.kejadian.slice(-12).reverse().map((k, i) => <li key={i}>{k}</li>) : <li className="muted">Belum ada kejadian.</li>}</ul>}
        {tabBawah === 'analisis' && <Analisis d={dunia} layout={layout} />}
        {tabBawah === 'tampilan' && (
          <div>
            <div className="game-opsi">
              <b className="small">2D:</b>
              {([['okupansi', 'Okupansi rak'], ['alur', 'Peta alur (flow)'], ['label', 'Label']] as [keyof Opsi2D, string][]).map(([k, l]) => (
                <label key={k} className="small"><input type="checkbox" checked={opsi2d[k]} onChange={e => setOpsi2d({ ...opsi2d, [k]: e.target.checked })} /> {l}</label>
              ))}
            </div>
            <div className="game-opsi">
              <b className="small">3D:</b>
              {([['label', 'Label'], ['dinding', 'Dinding'], ['atap', 'Atap'], ['truk', 'Truk'], ['orang', 'Pekerja']] as const).map(([k, l]) => (
                <label key={k} className="small"><input type="checkbox" checked={opsi[k]} onChange={e => setOpsi({ ...opsi, [k]: e.target.checked })} /> {l}</label>
              ))}
              <label className="small"><input type="checkbox" checked={tema === 'bersih'} onChange={e => setTema(e.target.checked ? 'bersih' : 'standar')} /> Gaya bersih</label>
            </div>
            <div className="tabs" role="group" aria-label="Kamera">
              {([['dekat', 'Dekat'], ['iso', 'Seluruh'], ['atas', 'Atas'], ['dock', 'Dock'], ['lorong', 'Lorong']] as [Kamera, string][]).map(([k, l]) => <button key={k} type="button" onClick={() => api.current?.kamera(k)}>{l}</button>)}
            </div>
            <div className="game-legenda small">
              {kemampuan.map(k => <span key={k}><i style={{ background: WARNA_ORANG[k] }} />{LABEL_KEMAMPUAN[k] ?? k}</span>)}
            </div>
            <p className="small muted">Klik palet, forklift, pekerja, atau truk untuk melihat detailnya.</p>
          </div>
        )}
      </div>
    </div>
  );
}
