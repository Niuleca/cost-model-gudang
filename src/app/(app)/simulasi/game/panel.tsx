'use client';
// Leca Game · panel mengambang di atas tampilan 3D: info objek terpilih, pelacakan order, daftar dock/MHE/truk.
import { useState } from 'react';
import { ARMADA, HARI, JAM, type Dunia, type JenisTugas, type Order } from '@/lib/game';
import type { Pilihan } from './lapisan3d';

export const LABEL_TUGAS: Record<JenisTugas, string> = {
  admin_in: 'Admin inbound', bongkar: 'Bongkar', cek_in: 'Cek inbound', putaway: 'Putaway', admin_out: 'Admin outbound',
  pick_palet: 'Pick palet', pick_karton: 'Pick karton', pack: 'Packing', cek_out: 'Cek outbound', muat: 'Muat',
};
const LABEL_MHE: Record<string, string> = { reach: 'Reach truck', forklift: 'Forklift', stacker: 'Stacker', hpt: 'Hand pallet' };
const STATUS_LPN: Record<string, string> = { diterima: 'Di staging inbound', disimpan: 'Tersimpan', dipick: 'Di staging outbound', dimuat: 'Dimuat', rusak: 'Rusak' };
const STATUS_TRUK: Record<string, string> = { dijadwalkan: 'Dalam perjalanan', antre: 'Antre dock', di_dock: 'Di dock', berangkat: 'Sudah berangkat' };
const STATUS_ORDER: Record<string, string> = { baru: 'Baru', teralokasi: 'Menunggu pick', dipick: 'Dipick', di_staging: 'Siap muat', dimuat: 'Dimuat', terkirim: 'Terkirim', batal: 'Batal' };

const jamMenit = (t: number) => { const s = ((t % HARI) + HARI) % HARI; return `${String(Math.floor(s / JAM)).padStart(2, '0')}:${String(Math.floor((s % JAM) / 60)).padStart(2, '0')}`; };
export function waktu(d: Dunia, t: number) {
  const tgl = new Date(`${d.sk.mulai}T00:00:00Z`); tgl.setUTCDate(tgl.getUTCDate() + Math.floor(t / HARI));
  return `${tgl.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })} ${jamMenit(t)}`;
}
const tanggalHari = (d: Dunia, hari: number) => { const tgl = new Date(`${d.sk.mulai}T00:00:00Z`); tgl.setUTCDate(tgl.getUTCDate() + hari); return tgl.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const durasi = (det: number) => { const m = Math.max(0, Math.round(det / 60)); return m >= 60 ? `${Math.floor(m / 60)} j ${m % 60} m` : `${m} m`; };
const angka = (v: number, k = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: k });

/** Ikon garis sederhana (24×24). */
export function Ikon({ n }: { n: 'palet' | 'truk' | 'jam' | 'mhe' | 'orang' | 'order' | 'tutup' | 'dock' }) {
  const p: Record<typeof n, JSX.Element> = {
    palet: <><path d="M3 8l9-5 9 5-9 5-9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
    truk: <><path d="M2 6h11v10H2z" /><path d="M13 9h4l4 4v3h-8z" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
    jam: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    mhe: <><path d="M4 18V8h6l2 4v6" /><path d="M16 3v15h5" /><circle cx="6" cy="19" r="2" /><circle cx="12" cy="19" r="2" /></>,
    orang: <><circle cx="12" cy="6" r="3" /><path d="M6 21v-5a6 6 0 0112 0v5" /></>,
    order: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 15h7M9 7h4" /></>,
    tutup: <><path d="M6 6l12 12M18 6L6 18" /></>,
    dock: <><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8" /></>,
  };
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p[n]}</svg>;
}

interface Info { ikon: Parameters<typeof Ikon>[0]['n']; jenis: string; judul: string; sub: string; status: string; nada: 'ok' | 'jalan' | 'info' | 'warn'; baris: [string, string][] }

export function infoPilihan(d: Dunia, p: Pilihan): Info | null {
  switch (p.jenis) {
    case 'palet': {
      const l = d.lpn.get(p.id);
      if (!l) return { ikon: 'palet', jenis: 'Palet', judul: p.id, sub: 'Palet sudah dikirim atau tidak ada lagi', status: 'Selesai', nada: 'info', baris: [] };
      const s = d.sku.get(l.sku)!; const lok = d.lokasi.get(l.lokasi);
      const sedang = [...d.tugas.values()].find(t => t.status === 'jalan' && t.lpn === l.id);
      return {
        ikon: 'palet', jenis: `Palet · kelas ${s.kelas}`, judul: s.nama, sub: `${l.id} · ${s.kode}`,
        status: sedang ? LABEL_TUGAS[sedang.jenis] : STATUS_LPN[l.status] ?? l.status, nada: sedang ? 'jalan' : l.status === 'disimpan' ? 'ok' : 'info',
        baris: [
          ['Isi', `${angka(l.karton)} / ${s.kartonPerPalet} karton`], ['Lot', l.lot],
          ['Kedaluwarsa', l.expiry == null ? '—' : tanggalHari(d, l.expiry)], ['Lokasi', lok?.kode ?? l.lokasi],
          ['Diterima', l.terima < 0 ? 'stok awal' : waktu(d, l.terima)], ...(l.order ? [['Order', l.order] as [string, string]] : []),
          ...(l.dialokasi > 0 && !l.order ? [['Dialokasi', `${l.dialokasi} karton`] as [string, string]] : []),
        ],
      };
    }
    case 'mhe': {
      const m = d.mhe.find(x => x.id === p.id); if (!m) return null;
      const t = m.sibuk ? d.tugas.get(m.sibuk) : undefined; const op = t?.pekerja ? d.pekerja.find(x => x.id === t.pekerja) : undefined;
      return {
        ikon: 'mhe', jenis: LABEL_MHE[m.jenis] ?? m.jenis, judul: m.nama, sub: m.id, status: t ? LABEL_TUGAS[t.jenis] : 'Siaga', nada: t ? 'jalan' : 'info',
        baris: [
          ...(t ? [['Progres', `${Math.round(Math.min(1, (d.t - (t.mulai ?? d.t)) / (t.durasi || 1)) * 100)}% · selesai ${jamMenit(t.selesai ?? d.t)}`] as [string, string]] : []),
          ...(op ? [['Operator', op.nama] as [string, string]] : []),
          ...(t?.lpn ? [['Palet', t.lpn] as [string, string]] : []), ...(t?.ke ? [['Ke lokasi', d.lokasi.get(t.ke)?.kode ?? t.ke] as [string, string]] : []),
          ['Jam kerja total', `${angka(m.jamKerja, 1)} jam`],
        ],
      };
    }
    case 'pekerja': {
      const w = d.pekerja.find(x => x.id === p.id); if (!w) return null;
      const t = w.sibuk ? d.tugas.get(w.sibuk) : undefined;
      return {
        ikon: 'orang', jenis: w.role, judul: w.nama, sub: `${w.id} · shift ${w.shift + 1}`, status: w.absen ? 'Tidak masuk' : t ? LABEL_TUGAS[t.jenis] : 'Siaga', nada: w.absen ? 'warn' : t ? 'jalan' : 'info',
        baris: [
          ['Kemampuan', w.kemampuan ?? '—'],
          ...(t ? [['Progres', `${Math.round(Math.min(1, (d.t - (t.mulai ?? d.t)) / (t.durasi || 1)) * 100)}% · selesai ${jamMenit(t.selesai ?? d.t)}`] as [string, string]] : []),
          ...(t?.order ? [['Order', t.order] as [string, string]] : []),
          ['Jam kerja total', `${angka(w.jamKerja, 1)} jam`], ['Biaya / bulan', `Rp ${angka(Math.round(w.biayaBulan))}`],
        ],
      };
    }
    case 'truk': {
      const tr = d.truk.get(p.id); if (!tr) return null;
      const telat = tr.tiba - tr.rencanaTiba;
      const isi = tr.arus === 'inbound' ? `${tr.palet.length} palet` : `${tr.order.length} order · ${angka(tr.order.reduce((a, o) => a + (d.order.get(o)?.paletEq ?? 0), 0), 1)} palet`;
      return {
        ikon: 'truk', jenis: `${tr.arus === 'inbound' ? 'Truk inbound' : 'Truk outbound'}${tr.jenis ? ` · ${ARMADA[tr.jenis].nama}` : ''}`, judul: tr.id, sub: isi,
        status: STATUS_TRUK[tr.status] ?? tr.status, nada: tr.status === 'di_dock' ? 'jalan' : tr.status === 'antre' ? 'warn' : 'info',
        baris: [
          ['Dock', tr.dock ? tr.dock.replace('DI', 'IN ').replace('DO', 'OUT ') : '—'], ['Rencana tiba', waktu(d, tr.rencanaTiba)],
          ['Tiba', `${waktu(d, tr.tiba)}${telat > 60 ? ` (telat ${durasi(telat)})` : ''}`],
          ...(tr.status === 'di_dock' ? [['Sisa pekerjaan', tr.arus === 'inbound' ? `${tr.sisaTugas} palet` : `${tr.order.filter(o => d.order.get(o)?.status !== 'terkirim').length} order`] as [string, string]] : []),
          ...(tr.berangkat ? [['Berangkat', waktu(d, tr.berangkat)] as [string, string]] : []),
        ],
      };
    }
    case 'order': {
      const o = d.order.get(p.id); if (!o) return null;
      return {
        ikon: 'order', jenis: 'Order outbound', judul: o.id, sub: `${o.baris.length} baris · ${angka(o.paletEq, 1)} palet`, status: STATUS_ORDER[o.status], nada: o.status === 'terkirim' ? 'ok' : 'jalan',
        baris: [['Batas kirim', waktu(d, o.batas)], ['Truk', o.truk ?? '—'], ...(o.kurang ? [['Kurang stok', `${o.kurang} karton`] as [string, string]] : []),
          ...o.baris.map(b => [d.sku.get(b.sku)?.kode ?? b.sku, `${angka(b.terpick)} / ${angka(b.karton)} karton`] as [string, string])],
      };
    }
  }
}

export function PanelInfo({ d, p, tutup }: { d: Dunia; p: Pilihan; tutup: () => void }) {
  const i = infoPilihan(d, p); if (!i) return null;
  return (
    <div className="gm-kartu gm-info" role="dialog" aria-label={`Info ${i.judul}`}>
      <div className="gm-info-kepala">
        <span className="gm-ikon"><Ikon n={i.ikon} /></span>
        <div><small>{i.jenis}</small><b>{i.judul}</b><span>{i.sub}</span></div>
        <button type="button" className="gm-x" onClick={tutup} aria-label="Tutup"><Ikon n="tutup" /></button>
      </div>
      <div className="gm-info-status"><span className={`gm-pill ${i.nada}`}>{i.status}</span></div>
      <dl className="gm-info-baris">{i.baris.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  );
}

/** Order yang dilacak: dari pilihan, atau order aktif dengan batas paling dekat. */
export function orderDilacak(d: Dunia, p: Pilihan | null): Order | null {
  if (p?.jenis === 'order') return d.order.get(p.id) ?? null;
  if (p?.jenis === 'palet') { const o = d.lpn.get(p.id)?.order; if (o) return d.order.get(o) ?? null; }
  if (p?.jenis === 'truk') { const tr = d.truk.get(p.id); if (tr?.arus === 'outbound' && tr.order[0]) return d.order.get(tr.order.find(x => d.order.get(x)?.status !== 'terkirim') ?? tr.order[0]) ?? null; }
  let best: Order | null = null, last: Order | null = null;
  for (const o of d.order.values()) {
    if (o.status === 'batal') continue;
    if (o.status !== 'terkirim') { if (!best || o.batas < best.batas || (o.batas === best.batas && o.dibuat < best.dibuat)) best = o; }
    else if (!last || (o.selesai ?? 0) > (last.selesai ?? 0)) last = o;
  }
  return best ?? last;
}

export function PanelOrder({ d, o, pilih }: { d: Dunia; o: Order | null; pilih: (p: Pilihan) => void }) {
  if (!o) return <div className="gm-kartu gm-order"><div className="gm-judul"><Ikon n="truk" /> <b>Pelacakan order</b></div><p className="small muted">Belum ada order. Jalankan waktu ke jam kerja.</p></div>;
  const j = o.jejak ?? {};
  const tahap: { l: string; t?: number; ikon: Parameters<typeof Ikon>[0]['n'] }[] = [
    { l: 'Order masuk', t: o.dibuat, ikon: 'order' }, { l: 'Dipick', t: j.dipick, ikon: 'palet' }, { l: 'Siap muat', t: j.staging, ikon: 'dock' },
    { l: 'Dimuat', t: j.dimuat, ikon: 'mhe' }, { l: 'Terkirim', t: j.terkirim, ikon: 'truk' },
  ];
  const aktif = tahap.filter(x => x.t != null).length - 1;
  const tr = o.truk ? d.truk.get(o.truk) : undefined;
  const aktifList = [...d.order.values()].filter(x => x.status !== 'terkirim' && x.status !== 'batal').sort((a, b) => a.batas - b.batas).slice(0, 40);
  const sisa = o.batas - d.t;
  return (
    <div className="gm-kartu gm-order">
      <div className="gm-judul">
        <Ikon n="truk" /> <b>Pelacakan order</b>
        <select value={o.id} onChange={e => pilih({ jenis: 'order', id: e.target.value })} aria-label="Pilih order">
          {!aktifList.some(x => x.id === o.id) && <option value={o.id}>{o.id}</option>}
          {aktifList.map(x => <option key={x.id} value={x.id}>{x.id} · {STATUS_ORDER[x.status]}</option>)}
        </select>
      </div>
      <div className="gm-langkah">
        {tahap.map((x, i) => (
          <div key={x.l} className={i < aktif ? 'lewat' : i === aktif ? 'kini' : ''}>
            <span className="gm-bulat"><Ikon n={x.ikon} /></span>
            <b>{x.l}</b><small>{x.t != null ? jamMenit(x.t) : i === 4 ? `batas ${jamMenit(o.batas)}` : '—'}</small>
          </div>
        ))}
      </div>
      <div className="gm-order-kartu" role="button" tabIndex={0} onClick={() => pilih({ jenis: 'order', id: o.id })} onKeyDown={e => { if (e.key === 'Enter') pilih({ jenis: 'order', id: o.id }); }}>
        <div><b>{o.id}</b><span>{o.baris.length} baris · {angka(o.paletEq, 1)} palet{tr ? ` · ${tr.id}${tr.dock ? ` di ${tr.dock.replace('DO', 'OUT ')}` : ''}` : ''}</span></div>
        <div className="kanan">
          <span className={`gm-pill ${o.status === 'terkirim' ? (o.tepatWaktu ? 'ok' : 'warn') : sisa < 0 ? 'warn' : 'jalan'}`}>{o.status === 'terkirim' ? (o.tepatWaktu ? 'Tepat waktu' : 'Terlambat') : STATUS_ORDER[o.status]}</span>
          <small>{o.status === 'terkirim' ? `terkirim ${jamMenit(o.selesai ?? d.t)}` : sisa >= 0 ? `sisa ${durasi(sisa)}` : `lewat ${durasi(-sisa)}`}</small>
        </div>
      </div>
    </div>
  );
}

export function PanelArmada({ d, pilih }: { d: Dunia; pilih: (p: Pilihan) => void }) {
  const [tab, setTab] = useState<'dock' | 'mhe' | 'truk'>('dock');
  const dockIsi = d.dock.filter(x => x.truk).length;
  const mheJalan = d.mhe.filter(m => m.sibuk).length;
  const datang = [...d.truk.values()].filter(t => t.status === 'dijadwalkan' && t.tiba >= d.t).sort((a, b) => a.tiba - b.tiba);
  const antre = [...d.antreDock.inbound, ...d.antreDock.outbound].map(x => d.truk.get(x)!).filter(Boolean);
  return (
    <div className="gm-kartu gm-armada">
      <div className="gm-tab" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'dock'} className={tab === 'dock' ? 'on' : ''} onClick={() => setTab('dock')}>Dock <i>{dockIsi}/{d.dock.length}</i></button>
        <button type="button" role="tab" aria-selected={tab === 'mhe'} className={tab === 'mhe' ? 'on' : ''} onClick={() => setTab('mhe')}>MHE <i>{mheJalan}/{d.mhe.length}</i></button>
        <button type="button" role="tab" aria-selected={tab === 'truk'} className={tab === 'truk' ? 'on' : ''} onClick={() => setTab('truk')}>Truk <i>{antre.length + datang.length}</i></button>
      </div>
      <div className="gm-daftar">
        {tab === 'dock' && d.dock.map(dk => {
          const tr = dk.truk ? d.truk.get(dk.truk) : undefined;
          const tot = tr ? (tr.arus === 'inbound' ? tr.palet.length : tr.order.length) : 0;
          const sel = tr ? (tr.arus === 'inbound' ? tr.palet.length - Math.max(0, tr.sisaTugas) : tr.order.filter(o => d.order.get(o)?.status === 'terkirim').length) : 0;
          return (
            <button type="button" key={dk.id} className="gm-baris" disabled={!tr} onClick={() => tr && pilih({ jenis: 'truk', id: tr.id })}>
              <span className="nama"><b>{dk.arus === 'inbound' ? 'IN' : 'OUT'} {dk.id.slice(2)}</b><small>{dk.arus}</small></span>
              <span className="isi">{tr ? <><i className="titik" />{tr.id}</> : <span className="muted">Kosong</span>}</span>
              <span className={`gm-pill ${tr ? 'jalan' : 'info'}`}>{tr ? (tr.arus === 'inbound' ? 'Bongkar' : 'Muat') : 'Tersedia'}</span>
              <span className="gm-bar">{tr && <><i style={{ width: `${tot ? (sel / tot) * 100 : 0}%` }} /><small>{sel}/{tot}</small></>}</span>
            </button>
          );
        })}
        {tab === 'mhe' && d.mhe.map(m => {
          const t = m.sibuk ? d.tugas.get(m.sibuk) : undefined;
          return (
            <button type="button" key={m.id} className="gm-baris" onClick={() => pilih({ jenis: 'mhe', id: m.id })}>
              <span className="nama"><b>{m.nama}</b><small>{LABEL_MHE[m.jenis]}</small></span>
              <span className="isi">{t ? (t.lpn ?? t.order ?? '') : <span className="muted">di parkir</span>}</span>
              <span className={`gm-pill ${t ? 'jalan' : 'info'}`}>{t ? LABEL_TUGAS[t.jenis] : 'Siaga'}</span>
              <span className="gm-bar">{t && <><i style={{ width: `${Math.min(100, ((d.t - (t.mulai ?? d.t)) / (t.durasi || 1)) * 100)}%` }} /></>}</span>
            </button>
          );
        })}
        {tab === 'truk' && (antre.length + datang.length === 0 ? <p className="small muted" style={{ margin: 8 }}>Tidak ada truk yang menuju gudang.</p>
          : [...antre, ...datang].slice(0, 12).map(tr => (
            <button type="button" key={tr.id} className="gm-baris" onClick={() => pilih({ jenis: 'truk', id: tr.id })}>
              <span className="nama"><b>{tr.id}</b><small>{tr.jenis ? ARMADA[tr.jenis].nama : tr.arus}</small></span>
              <span className="isi">{tr.arus === 'inbound' ? `${tr.palet.length} palet` : `${tr.order.length} order`}</span>
              <span className={`gm-pill ${tr.status === 'antre' ? 'warn' : 'info'}`}>{tr.status === 'antre' ? 'Antre' : 'Dalam perjalanan'}</span>
              <span className="gm-bar"><small>{tr.status === 'antre' ? '' : `${durasi(tr.tiba - d.t)}`}</small></span>
            </button>
          )))}
      </div>
    </div>
  );
}
