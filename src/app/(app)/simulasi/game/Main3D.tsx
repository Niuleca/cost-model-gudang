'use client';
// Leca Game · mode main 3D: gudang 3D + lapisan simulasi, kontrol waktu, HUD operasi.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HARI, jalankanSampai, shiftBerikut, waktuGame, type Dunia, type JenisTugas } from '@/lib/game';
import type { LayoutGudang } from '@/lib/simulasi3d/layout';
import type { Kamera, OpsiViewer, ViewerApi } from '../Viewer3D';
import { WARNA_ORANG } from '../warna';
import { buatLapisanGame, type KontrolGame } from './lapisan3d';

const Viewer3D = dynamic(() => import('../Viewer3D'), { ssr: false, loading: () => <div className="sim3d-wadah sim3d-muat">Menyiapkan 3D…</div> });

const KECEPATAN = [1, 10, 60, 300, 1200, 3600];
const labelKec = (k: number) => (k < 60 ? `${k}×` : k < 3600 ? `${k / 60} mnt/dtk` : '1 jam/dtk');
const LABEL_TUGAS: Record<JenisTugas, string> = {
  admin_in: 'Admin in', bongkar: 'Bongkar', cek_in: 'Cek in', putaway: 'Putaway', admin_out: 'Admin out',
  pick_palet: 'Pick palet', pick_karton: 'Pick karton', pack: 'Packing', cek_out: 'Cek out', muat: 'Muat',
};
const LABEL_KEMAMPUAN: Record<string, string> = { admin: 'Admin', checker: 'Checker', operator: 'Operator MHE', picker: 'Picker', tkbm: 'TKBM' };
const jt = (v: number) => `${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
const hariId = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function Main3D({ dunia, layout, hariMaks, onTick }: { dunia: Dunia; layout: LayoutGudang; hariMaks: number; onTick: () => void }) {
  const kontrol = useRef<KontrolGame>({ jalan: false, kecepatan: 60, batas: hariMaks * HARI - 1 });
  kontrol.current.batas = hariMaks * HARI - 1;
  const [jalan, setJalan] = useState(false);
  const [kec, setKec] = useState(60);
  const [, setVersi] = useState(0);
  const [opsi, setOpsi] = useState<OpsiViewer>({ atap: false, dinding: true, label: true, animasi: true, truk: true, orang: true });
  const api = useRef<ViewerApi>(null);
  const onTickRef = useRef(onTick); onTickRef.current = onTick;

  const lapisan = useMemo(() => buatLapisanGame(dunia, layout, kontrol, () => setJalan(false)), [dunia, layout]);
  useEffect(() => { const id = setInterval(() => { setVersi(x => x + 1); onTickRef.current(); }, 400); return () => clearInterval(id); }, []);
  useEffect(() => { kontrol.current.jalan = false; setJalan(false); }, [dunia]);

  const putar = (v: boolean) => { kontrol.current.jalan = v && dunia.t < kontrol.current.batas; setJalan(kontrol.current.jalan); };
  const aturKec = (k: number) => { kontrol.current.kecepatan = k; setKec(k); };
  const lompat = (t: number) => { jalankanSampai(dunia, Math.min(kontrol.current.batas, t)); setVersi(x => x + 1); onTick(); };

  const w = waktuGame(dunia);
  const hi = dunia.hariIni;
  const antre: Partial<Record<JenisTugas, number>> = {};
  for (const id of dunia.menunggu) { const t = dunia.tugas.get(id); if (t) antre[t.jenis] = (antre[t.jenis] ?? 0) + 1; }
  const jalanTugas: Partial<Record<JenisTugas, number>> = {};
  for (const p of dunia.pekerja) { const t = p.sibuk ? dunia.tugas.get(p.sibuk) : undefined; if (t) jalanTugas[t.jenis] = (jalanTugas[t.jenis] ?? 0) + 1; }
  const jenisTampil = (Object.keys(LABEL_TUGAS) as JenisTugas[]).filter(j => (antre[j] ?? 0) + (jalanTugas[j] ?? 0) > 0 || !dunia.sk.prod[j].luar);
  const kerja = dunia.pekerja.filter(p => p.kemampuan);
  const sibuk = kerja.filter(p => p.sibuk).length, hadir = kerja.filter(p => !p.absen && (p.sibuk || w.shiftAktif.includes(p.shift))).length;
  const mheSibuk = dunia.mhe.filter(m => m.sibuk).length;
  const dock = dunia.dock.filter(x => x.truk).length;
  const antreTruk = dunia.antreDock.inbound.length + dunia.antreDock.outbound.length;
  const selesai = dunia.t >= kontrol.current.batas;
  const kemampuan = [...new Set(kerja.map(p => p.kemampuan!))];

  return (
    <div className="card game-main">
      <div className="game-bar">
        <div className="game-jam">
          <b>Hari {w.hari + 1} · {hariId(w.tanggal)} · {w.teks}</b>
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

      <div className="game-layar">
        <Viewer3D ref={api} layout={layout} shift={0} opsi={opsi} kecepatan={{ faktor: 0, siklus: {} }} lapisan={lapisan} />
        <div className="game-hud">
          <div><span>Kas</span><b className={dunia.kas < 0 ? 'neg' : ''}>{jt(dunia.kas)}</b></div>
          <div><span>Hari ini</span><b>{jt(hi.pendapatan)}</b><small>pendapatan berjalan</small></div>
          <div><span>Palet masuk / keluar</span><b>{hi.paletMasuk} / {Math.round(hi.paletKeluarEq)}</b></div>
          <div><span>Order terkirim</span><b>{hi.orderSelesai}</b><small>{hi.orderTepat} tepat waktu{hi.orderTerlambat ? ` · ${hi.orderTerlambat} terlambat` : ''}</small></div>
          <div><span>Pekerja sibuk</span><b>{sibuk} / {hadir}</b><small>MHE {mheSibuk} / {dunia.mhe.length}</small></div>
          <div><span>Truk</span><b>{dock} di dock</b><small>{antreTruk ? `${antreTruk} antre` : 'tidak ada antrean'}</small></div>
        </div>
      </div>

      <div className="game-bawah">
        <div>
          <h3>Tugas (jalan / antre)</h3>
          <div className="game-tugas">
            {jenisTampil.map(j => (
              <div key={j} className={(antre[j] ?? 0) > 20 ? 'padat' : ''}><span>{LABEL_TUGAS[j]}</span><b>{jalanTugas[j] ?? 0}</b><i>{antre[j] ?? 0}</i></div>
            ))}
          </div>
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
          </div>
          <div className="tabs" role="group" aria-label="Kamera">
            {([['iso', 'Isometrik'], ['atas', 'Atas'], ['dock', 'Dock'], ['lorong', 'Lorong']] as [Kamera, string][]).map(([k, l]) => <button key={k} type="button" onClick={() => api.current?.kamera(k)}>{l}</button>)}
          </div>
          <div className="game-legenda small">
            {kemampuan.map(k => <span key={k}><i style={{ background: WARNA_ORANG[k] }} />{LABEL_KEMAMPUAN[k] ?? k}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
