'use client';
// Leca Game · mode main 3D: gudang 3D (gaya bersih) + lapisan simulasi, kontrol waktu, kartu KPI,
// panel info objek terpilih, pelacakan order, daftar dock/MHE/truk.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HARI, jalankanSampai, shiftBerikut, waktuGame, type Dunia, type JenisTugas } from '@/lib/game';
import type { LayoutGudang } from '@/lib/simulasi3d/layout';
import type { Kamera, OpsiViewer, TemaViewer, ViewerApi } from '../Viewer3D';
import { WARNA_ORANG } from '../warna';
import { buatLapisanGame, type KontrolGame, type Pilihan } from './lapisan3d';
import { Ikon, LABEL_TUGAS, PanelArmada, PanelInfo, PanelOrder, orderDilacak } from './panel';

const Viewer3D = dynamic(() => import('../Viewer3D'), { ssr: false, loading: () => <div className="sim3d-wadah sim3d-muat">Menyiapkan 3D…</div> });

const KECEPATAN = [1, 10, 60, 300, 1200, 3600];
const labelKec = (k: number) => (k < 60 ? `${k}×` : k < 3600 ? `${k / 60} mnt/dtk` : '1 jam/dtk');
const LABEL_KEMAMPUAN: Record<string, string> = { admin: 'Admin', checker: 'Checker', operator: 'Operator MHE', picker: 'Picker', tkbm: 'TKBM' };
const jt = (v: number) => `${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
const hariId = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const angka = (v: number, k = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: k });

export default function Main3D({ dunia, layout, hariMaks, onTick }: { dunia: Dunia; layout: LayoutGudang; hariMaks: number; onTick: () => void }) {
  const kontrol = useRef<KontrolGame>({ jalan: false, kecepatan: 60, batas: hariMaks * HARI - 1, pilih: null });
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
  useEffect(() => { kontrol.current.jalan = false; setJalan(false); setPilih(null); }, [dunia]);

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
        </div>
      </div>

      <div className={`game-layar${panel ? '' : ' tanpa-panel'}`}>
        <Viewer3D ref={api} layout={layout} shift={0} opsi={opsi} kecepatan={{ faktor: 0, siklus: {} }} lapisan={lapisan} tema={tema} />
        <div className="gm-kpi">
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="palet" /></span><div><small>Stok di gudang</small><b>{angka(stok)}</b><span>palet · {kap ? angka((stok / kap) * 100) : 0}% terisi <em className={hi.paletMasuk - Math.round(hi.paletKeluarEq) >= 0 ? 'naik' : 'turun'}>{hi.paletMasuk - Math.round(hi.paletKeluarEq) >= 0 ? '▲' : '▼'} {Math.abs(hi.paletMasuk - Math.round(hi.paletKeluarEq))}</em></span></div></div>
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="truk" /></span><div><small>Truk di lokasi</small><b>{trukDiLokasi}</b><span>{inbDiLokasi} inbound · {trukDiLokasi - inbDiLokasi} outbound</span></div></div>
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="jam" /></span><div><small>Tepat waktu</small><b>{kirim ? `${angka((tepat / kirim) * 100, 1)}%` : '—'}</b><span>{angka(kirim)} order terkirim</span></div></div>
          <div className="gm-kartu"><span className="gm-ikon"><Ikon n="orang" /></span><div><small>Kas</small><b className={dunia.kas < 0 ? 'neg' : ''}>{jt(dunia.kas)}</b><span>hari ini +{jt(hi.pendapatan)} · {sibuk}/{hadir} orang sibuk</span></div></div>
        </div>
        {pilih && panel && <PanelInfo d={dunia} p={pilih} tutup={() => setPilih(null)} />}
        {panel && <PanelOrder d={dunia} o={order} pilih={p => setPilih(p)} />}
        {panel && <PanelArmada d={dunia} pilih={p => setPilih(p)} />}
        <button type="button" className="gm-tombol-panel ghost" onClick={() => setPanel(!panel)}>{panel ? 'Sembunyikan panel' : 'Tampilkan panel'}</button>
      </div>

      <div className="game-bawah">
        <div>
          <h3>Tugas (jalan / antre)</h3>
          <div className="game-tugas">
            {jenisTampil.map(j => (
              <div key={j} className={(antre[j] ?? 0) > 20 ? 'padat' : ''}><span>{LABEL_TUGAS[j]}{dunia.sk.prod[j].luar ? ' *' : ''}</span><b>{jalanTugas[j] ?? 0}</b><i>{antre[j] ?? 0}</i></div>
            ))}
          </div>
          {jenisTampil.some(j => dunia.sk.prod[j].luar) && <p className="small muted">* dikerjakan pihak luar (tidak ada aktivitasnya di tender).</p>}
        </div>
        <div>
          <h3>Kejadian hari ini</h3>
          <ul className="small game-kejadian">{hi.kejadian.length ? hi.kejadian.slice(-6).reverse().map((k, i) => <li key={i}>{k}</li>) : <li className="muted">Belum ada kejadian.</li>}</ul>
        </div>
        <div>
          <h3>Tampilan</h3>
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
      </div>
    </div>
  );
}
