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
import { buatLapisanGame, LANGKAH_DIAM, LANGKAH_TUGAS, type KontrolGame, type Pilihan, type StatGerak } from './lapisan3d';
import { Ikon, LABEL_TUGAS, PanelArmada, PanelInfo, PanelOrder, orderDilacak } from './panel';

const Viewer3D = dynamic(() => import('../Viewer3D'), { ssr: false, loading: () => <div className="sim3d-wadah sim3d-muat">Menyiapkan 3D…</div> });

const KECEPATAN = [1, 10, 60, 300, 1200, 3600];
const labelKec = (k: number) => (k < 60 ? `${k}×` : k < 3600 ? `${k / 60} mnt/dtk` : '1 jam/dtk');
const LABEL_KEMAMPUAN: Record<string, string> = { admin: 'Admin', checker: 'Checker', operator: 'Operator MHE', picker: 'Picker', tkbm: 'TKBM' };
const jt = (v: number) => `${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
const hariId = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const angka = (v: number, k = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: k });
const durasiTeks = (det: number) => { const s = Math.max(0, Math.round(det)); return s >= 3600 ? `${Math.floor(s / 3600)} j ${Math.floor((s % 3600) / 60)} m` : s >= 60 ? `${Math.floor(s / 60)} m ${s % 60} d` : `${s} d`; };
type TabBawah = 'tugas' | 'flag' | 'prod' | 'kejadian' | 'tampilan';

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

export default function Main3D({ dunia, layout, hariMaks, onTick }: { dunia: Dunia; layout: LayoutGudang; hariMaks: number; onTick: () => void }) {
  const kontrol = useRef<KontrolGame>({ jalan: false, kecepatan: 60, batas: hariMaks * HARI - 1, pilih: null,
    jelajah: false, tombol: { maju: false, mundur: false, kiri: false, kanan: false, lari: false }, amatan: null, statGerak: {} });
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
  const [panel, setPanel] = useState(true);
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
    const jamAmati = (dunia.t - catat.mulai) / 3600;
    const per = new Map<JenisTugas, { n: number; qty: number; satuan: string; jamKerja: number }>();
    for (const t of dunia.tugas.values()) {
      if (t.status !== 'selesai' || (t.selesai ?? 0) < catat.mulai) continue;
      if (catat.jenis === 'pekerja' ? t.pekerja !== catat.id : t.mhe !== catat.id) continue;
      const x = per.get(t.jenis) ?? { n: 0, qty: 0, satuan: t.satuan, jamKerja: 0 }; x.n++; x.qty += t.qty; x.jamKerja += (t.durasi ?? 0) / 3600; per.set(t.jenis, x);
    }
    const kerja = [...per.values()].reduce((a, x) => a + x.jamKerja, 0);
    return { jamAmati, per, utilisasi: jamAmati > 0 ? kerja / jamAmati : 0 };
  })();
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
          <button type="button" className={jelajah ? '' : 'ghost'} onClick={() => setJelajah(!jelajah)} title="Kendalikan 1 karakter untuk menjelajah gudang dan mengamati pekerjaan">{jelajah ? '✕ Keluar jelajah' : '🧭 Mode jelajah'}</button>
          <button type="button" className={`ghost gm-flag-tombol${nKritis ? ' kritis' : ''}`} onClick={() => setTabBawah('flag')}>⚑ {flags.length} red flag{nKritis ? ` · ${nKritis} kritis` : ''}</button>
        </div>
      </div>

      <div className={`game-layar${panel ? '' : ' tanpa-panel'}`}>
        <Viewer3D apiRef={api} layout={layout} shift={0} opsi={opsi} kecepatan={{ faktor: 0, siklus: {} }} lapisan={lapisan} tema={tema} />
        <div className="gm-kpi">
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="palet" /></span><div><small>Stok di gudang</small><b>{angka(stok)}</b><span>palet · {kap ? angka((stok / kap) * 100) : 0}% terisi <em className={hi.paletMasuk - Math.round(hi.paletKeluarEq) >= 0 ? 'naik' : 'turun'}>{hi.paletMasuk - Math.round(hi.paletKeluarEq) >= 0 ? '▲' : '▼'} {Math.abs(hi.paletMasuk - Math.round(hi.paletKeluarEq))}</em></span></div></div>
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="truk" /></span><div><small>Truk di lokasi</small><b>{trukDiLokasi}</b><span>{inbDiLokasi} inbound · {trukDiLokasi - inbDiLokasi} outbound</span></div></div>
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="jam" /></span><div><small>Tepat waktu</small><b>{kirim ? `${angka((tepat / kirim) * 100, 1)}%` : '—'}</b><span>{angka(kirim)} order terkirim</span></div></div>
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="orang" /></span><div><small>Kas</small><b className={dunia.kas < 0 ? 'neg' : ''}>{jt(dunia.kas)}</b><span>hari ini +{jt(hi.pendapatan)} · {sibuk}/{hadir} orang sibuk</span></div></div>
        </div>
        {pilih && panel && !jelajah && <PanelInfo d={dunia} p={pilih} tutup={() => setPilih(null)} />}
        {jelajah && (
          <>
            <div className="gm-kartu gm-amati">
              <div className="gm-judul"><Ikon n="orang" /> <b>Observasi</b><span className="small muted" style={{ marginLeft: 'auto' }}>dekati pekerja / MHE ≤ 8 m</span></div>
              {!am ? <p className="small muted">Tidak ada pekerja atau MHE di dekat Anda. Jalan ke area staging, lorong rak, atau dock.</p> : (
                <>
                  <div className="gm-amati-nama"><b>{am.nama}</b><span className="small muted">{angka(am.jarak, 1)} m dari Anda</span></div>
                  {!am.tugas ? <p className="small"><span className="gm-pill info">Siaga</span> tidak sedang mengerjakan tugas.</p> : (
                    <>
                      <div className="small"><span className="gm-pill jalan">{LABEL_TUGAS[am.tugas.jenis]}</span> <span className="muted">{am.tugas.id}</span></div>
                      <ol className="gm-langkah-list">
                        {(am.tugas.fase.startsWith('Jalan ke lokasi') || am.tugas.fase.startsWith('Mengerjakan') ? LANGKAH_DIAM : LANGKAH_TUGAS).map((l, i) => (
                          <li key={l} className={i < am.tugas!.langkah ? 'lewat' : i === am.tugas!.langkah ? 'kini' : ''}>{l}</li>
                        ))}
                      </ol>
                      <dl className="gm-info-baris">
                        <div><dt>Waktu standar (productivity)</dt><dd>{durasiTeks(am.tugas.durasiStd)}</dd></div>
                        <div><dt>Berjalan</dt><dd>{durasiTeks(am.tugas.berjalan)} · {Math.round(am.tugas.f * 100)}%</dd></div>
                        <div><dt>Jarak jalur di layout</dt><dd>{angka(am.tugas.jarakJalur)} m</dd></div>
                        <div><dt>Kecepatan yang dituntut</dt><dd style={{ color: am.tugas.kecepatan > (am.jenis === 'mhe' ? 3 : 1.8) ? 'var(--bad)' : undefined }}>{angka(am.tugas.kecepatan, 2)} m/dtk {am.tugas.kecepatan > (am.jenis === 'mhe' ? 3 : 1.8) ? '— tidak realistis' : '— wajar'}</dd></div>
                      </dl>
                    </>
                  )}
                  {catat?.id === am.id
                    ? <button type="button" className="ghost" onClick={() => setCatat(null)}>■ Hentikan catatan</button>
                    : <button type="button" onClick={() => setCatat({ id: am.id, jenis: am.jenis, nama: am.nama, mulai: dunia.t })}>⏱ Mulai catat (time study)</button>}
                </>
              )}
              {catat && hasilCatat && (
                <div className="gm-catat">
                  <div className="small"><b>Time study: {catat.nama}</b> · diamati {durasiTeks(hasilCatat.jamAmati * 3600)} · utilisasi {Math.round(hasilCatat.utilisasi * 100)}%</div>
                  <table className="sim3d-tabel"><thead><tr><th>Tugas</th><th className="num">Selesai</th><th className="num">Aktual /jam</th><th className="num">Standar /jam</th></tr></thead><tbody>
                    {[...hasilCatat.per.entries()].map(([j, x]) => {
                      const p = dunia.sk.prod[j]; const std = p.prod * dunia.sk.faktor;
                      const aktual = x.jamKerja > 0 ? x.qty / x.jamKerja : 0;
                      return <tr key={j}><td>{LABEL_TUGAS[j]}</td><td className="num">{x.n} · {angka(x.qty)} {x.satuan}</td><td className="num">{x.satuan === p.satuan ? angka(aktual, 1) : `${angka(x.n / Math.max(0.001, x.jamKerja), 1)} tugas`}</td><td className="num">{angka(std, 1)} {p.satuan}</td></tr>;
                    })}
                    {!hasilCatat.per.size && <tr><td colSpan={4} className="small muted">Belum ada tugas selesai sejak dicatat — jalankan waktu (▶).</td></tr>}
                  </tbody></table>
                  <p className="small muted" style={{ margin: 0 }}>Aktual = qty ÷ jam kerja (tanpa waktu menganggur). Utilisasi = jam kerja ÷ waktu diamati.</p>
                </div>
              )}
            </div>
            <div className="gm-dpad" aria-label="Kendali karakter">
              {([['maju', '▲', 'atas'], ['kiri', '◀', 'kiri'], ['kanan', '▶', 'kanan'], ['mundur', '▼', 'bawah']] as const).map(([t, ikon, kls]) => (
                <button key={t} type="button" className={`ghost ${kls}`} aria-label={t}
                  onPointerDown={e => { e.preventDefault(); tekan(t, true); }} onPointerUp={() => tekan(t, false)} onPointerLeave={() => tekan(t, false)} onPointerCancel={() => tekan(t, false)}>{ikon}</button>
              ))}
              <button type="button" className="ghost lari" onPointerDown={e => { e.preventDefault(); tekan('lari', true); }} onPointerUp={() => tekan('lari', false)} onPointerLeave={() => tekan('lari', false)}>Lari</button>
            </div>
            <p className="gm-petunjuk small">WASD / panah = jalan · Shift = lari · seret layar = putar kamera · scroll = zoom</p>
          </>
        )}
        {panel && !jelajah && <PanelOrder d={dunia} o={order} pilih={p => setPilih(p)} />}
        {panel && !jelajah && <PanelArmada d={dunia} pilih={p => setPilih(p)} />}
        {!jelajah && <button type="button" className="gm-tombol-panel ghost" onClick={() => setPanel(!panel)}>{panel ? 'Sembunyikan panel' : 'Tampilkan panel'}</button>}
      </div>

      <div className="tabs game-tab-bawah" role="tablist">
        {([['flag', `Red flag (${flags.length})`], ['tugas', 'Tugas'], ['prod', 'Productivity'], ['kejadian', 'Kejadian'], ['tampilan', 'Tampilan']] as [TabBawah, string][]).map(([k, l]) => (
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
        {tabBawah === 'tampilan' && (
          <div>
            <div className="game-opsi">
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
