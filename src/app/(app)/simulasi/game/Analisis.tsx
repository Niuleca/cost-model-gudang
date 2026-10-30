'use client';
// Leca Game · analisis hasil simulasi (gaya laporan KPI CLASS): ringkasan lampu lalu lintas, alur inbound/outbound,
// pemakaian dock, staging, tenaga kerja & MHE, laju penyelesaian tugas per operator vs standar productivity,
// grafik per jam (throughput, pemakaian tenaga kerja) dan waktu layanan truk (lebih awal / terlambat).
import { useMemo, useState } from 'react';
import { bertugas, HARI, type Dunia, type JenisTugas } from '@/lib/game';
import type { LayoutGudang } from '@/lib/simulasi3d/layout';
import { LABEL_TUGAS } from './panel';
import { gridStaging } from './Sim2D';

const JAM = 3600;
const angka = (v: number, k = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: k, minimumFractionDigits: k });
const pct = (v: number) => `${angka(v * 100, 1)}%`;
type Lampu = 'hijau' | 'kuning' | 'merah' | 'abu';
const lampuUtil = (u: number): Lampu => (u >= 0.9 ? 'merah' : u >= 0.75 ? 'kuning' : u < 0.35 ? 'abu' : 'hijau');
const lampuIsi = (r: number): Lampu => (r >= 0.85 ? 'merah' : r >= 0.6 ? 'kuning' : 'hijau');
const Titik = ({ l }: { l: Lampu }) => <i className={`gm-lampu ${l}`} aria-label={l} />;

function Batang({ data, tinggi = 150, warna, seri, satuanY }: { data: { label: string; nilai: number[] }[]; tinggi?: number; warna: string[]; seri: string[]; satuanY: string }) {
  const maks = Math.max(1, ...data.map(x => x.nilai.reduce((a, b) => a + Math.max(0, b), 0)), ...data.map(x => -Math.min(0, ...x.nilai)));
  const adaNeg = data.some(x => x.nilai.some(v => v < 0));
  const lebar = Math.max(320, data.length * 22 + 50), nol = adaNeg ? tinggi / 2 : tinggi - 18;
  const skala = (adaNeg ? tinggi / 2 - 14 : tinggi - 30) / maks;
  return (
    <div className="gm-grafik">
      <svg viewBox={`0 0 ${lebar} ${tinggi}`} width="100%" height={tinggi} preserveAspectRatio="none" role="img" aria-label={seri.join(', ')}>
        <line x1={40} x2={lebar} y1={nol} y2={nol} stroke="#cbd5e1" />
        <text x={36} y={12} fontSize={10} textAnchor="end" fill="#64748b">{angka(maks)}</text>
        <text x={36} y={nol + 3} fontSize={10} textAnchor="end" fill="#64748b">0</text>
        {data.map((x, i) => {
          let atas = nol; const xk = 46 + i * 22;
          return (
            <g key={i}>
              {x.nilai.map((v, j) => {
                if (v >= 0) { const h = v * skala; atas -= h; return <rect key={j} x={xk} y={atas} width={16} height={Math.max(0, h)} fill={warna[j]} rx={2}><title>{`${x.label}: ${seri[j]} ${angka(v, 1)} ${satuanY}`}</title></rect>; }
                const h = -v * skala; return <rect key={j} x={xk} y={nol} width={16} height={h} fill={warna[j]} rx={2}><title>{`${x.label}: ${seri[j]} ${angka(v, 1)} ${satuanY}`}</title></rect>;
              })}
              {(data.length <= 26 || i % 2 === 0) && <text x={xk + 8} y={tinggi - 4} fontSize={9.5} textAnchor="middle" fill="#64748b">{x.label}</text>}
            </g>
          );
        })}
      </svg>
      <div className="gm-grafik-legenda small">{seri.map((s, j) => <span key={s}><i style={{ background: warna[j] }} />{s}</span>)}<span className="muted">{satuanY}</span></div>
    </div>
  );
}

export default function Analisis({ d, layout }: { d: Dunia; layout: LayoutGudang }) {
  const hariKini = Math.floor(d.t / HARI);
  const [hariGrafik, setHariGrafik] = useState<number | null>(null);
  const hg = Math.min(hariKini, hariGrafik ?? hariKini);
  const sk = d.sk;

  const a = useMemo(() => {
    const tugas = [...d.tugas.values()];
    const selesai = tugas.filter(t => t.status === 'selesai' && t.mulai != null && t.selesai != null);
    const hariOp = Math.max(1, d.laporan.filter(r => r.operasi).length + (d.t % HARI > 0 ? 1 : 0));
    const jamOpPerUnit = hariOp * sk.shift.jumlah * sk.shift.jamKerja;
    // --- alur
    const truk = [...d.truk.values()];
    const trIn = truk.filter(t => t.arus === 'inbound'), trOut = truk.filter(t => t.arus === 'outbound');
    const layan = (ts: typeof truk) => {
      const sandar = ts.filter(t => t.masukDock != null);
      const tunggu = sandar.map(t => (t.masukDock! - t.tiba) / 60), servis = ts.filter(t => t.berangkat != null && t.masukDock != null).map(t => (t.berangkat! - t.masukDock!) / 60);
      const rata = (x: number[]) => (x.length ? x.reduce((p, q) => p + q, 0) / x.length : 0);
      return { tiba: ts.filter(t => t.status !== 'dijadwalkan').length, selesai: ts.filter(t => t.status === 'berangkat').length, antre: ts.filter(t => t.status === 'antre').length,
        tunggu: rata(tunggu), tungguMaks: tunggu.length ? Math.max(...tunggu) : 0, tungguPct: tunggu.length ? tunggu.filter(x => x > 1).length / tunggu.length : 0, servis: rata(servis) };
    };
    const lIn = layan(trIn), lOut = layan(trOut);
    const paletBongkar = selesai.filter(t => t.jenis === 'bongkar').reduce((p, t) => p + t.qty, 0);
    // putaway per area simpan
    const area = layout.zona.filter(z => z.jenis === 'spr' || z.jenis === 'ddr' || z.jenis === 'block' || z.jenis === 'floor');
    const perArea = new Map<string, { label: string; put: number }>();
    const namaArea = (lid?: string) => {
      const lok = lid ? d.lokasi.get(lid) : undefined; if (!lok) return 'Lain';
      const z = area.find(zz => lok.x >= zz.x0 - 0.05 && lok.x <= zz.x1 + 0.05 && lok.z >= zz.z0 - 0.05 && lok.z <= zz.z1 + 0.05);
      return z ? (z.jenis === 'block' || z.jenis === 'floor' ? 'Block stack' : z.jenis === 'ddr' ? 'Rak DDR' : 'Rak SPR') : lok.tipe === 'lantai' ? 'Block stack' : 'Rak';
    };
    for (const t of selesai) {
      if (t.jenis === 'putaway') { const n = namaArea(t.ke); const e = perArea.get(n) ?? { label: n, put: 0 }; e.put += t.qty; perArea.set(n, e); }
    }
    const orderSelesai = [...d.order.values()].filter(o => o.status === 'terkirim');
    const telat = orderSelesai.filter(o => o.tepatWaktu === false);
    const tundaMenit = telat.map(o => ((o.selesai ?? 0) - o.batas) / 60);
    // --- dock
    const dock = d.dock.map(dk => {
      const jam = truk.filter(t => t.dock === dk.id && t.masukDock != null).reduce((p, t) => p + ((t.berangkat ?? d.t) - t.masukDock!) / JAM, 0);
      return { id: dk.id, arus: dk.arus, jam, util: jam / jamOpPerUnit, layan: truk.filter(t => t.dock === dk.id && t.masukDock != null).length };
    });
    // --- staging
    const lok = [...d.lokasi.values()];
    const sIn0 = lok.find(l => l.tipe === 'staging_in')!, sOut0 = lok.find(l => l.tipe === 'staging_out')!;
    // kapasitas staging = tapak palet di area staging layout (lokasi staging di mesin tidak dibatasi)
    const sIn = { lpn: sIn0.lpn, kapasitas: gridStaging(layout.stagingIn).kap }, sOut = { lpn: sOut0.lpn, kapasitas: gridStaging(layout.stagingOut).kap };
    const pickPalet = selesai.filter(t => t.jenis === 'pick_palet').reduce((p, t) => p + t.qty, 0), pickKarton = selesai.filter(t => t.jenis === 'pick_karton').reduce((p, t) => p + t.qty, 0);
    // --- tenaga kerja & MHE
    const lantai = d.pekerja.filter(p => p.kemampuan);
    const perKem = new Map<string, { n: number; jam: number }>();
    for (const p of lantai) { const e = perKem.get(p.kemampuan!) ?? { n: 0, jam: 0 }; e.n++; e.jam += p.jamKerja; perKem.set(p.kemampuan!, e); }
    const jamTersediaPerOrang = d.stat.jamTersedia / Math.max(1, lantai.length);
    const tenaga = [...perKem.entries()].map(([k, e]) => ({ k, n: e.n, jam: e.jam, util: e.jam / Math.max(1e-6, e.n * jamTersediaPerOrang) }));
    const utilTotal = lantai.reduce((p, x) => p + x.jamKerja, 0) / Math.max(1e-6, d.stat.jamTersedia);
    const perMhe = new Map<string, { n: number; jam: number }>();
    for (const m of d.mhe) { const e = perMhe.get(m.jenis) ?? { n: 0, jam: 0 }; e.n++; e.jam += m.jamKerja; perMhe.set(m.jenis, e); }
    const mhe = [...perMhe.entries()].map(([k, e]) => ({ k, n: e.n, jam: e.jam, util: e.jam / Math.max(1e-6, e.n * jamOpPerUnit) }));
    // --- laju penyelesaian tugas per operator
    const laju = (Object.keys(sk.prod) as JenisTugas[]).map(j => {
      const ts = selesai.filter(t => t.jenis === j); const qty = ts.reduce((p, t) => p + t.qty, 0); const jam = ts.reduce((p, t) => p + (t.durasi ?? 0), 0) / JAM;
      const std = sk.prod[j].prod * sk.faktor; const aktual = jam > 0 ? qty / jam : 0;
      return { j, n: ts.length, qty, jam, aktual, std, satuan: sk.prod[j].satuan, luar: !!sk.prod[j].luar, antre: tugas.filter(t => t.jenis === j && t.status === 'menunggu').length };
    }).filter(x => x.n || x.antre);
    return { lIn, lOut, paletBongkar, perArea: [...perArea.values()], orderSelesai: orderSelesai.length, telat: telat.length, tunda: tundaMenit.length ? tundaMenit.reduce((p, q) => p + q, 0) / tundaMenit.length : 0, tundaMaks: tundaMenit.length ? Math.max(...tundaMenit) : 0,
      dock, sIn, sOut, pickPalet, pickKarton, tenaga, utilTotal, mhe, laju, hariOp, menunggu: d.menunggu.size };
  }, [d, d.seq, layout, sk]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- grafik per jam untuk hari terpilih
  const g = useMemo(() => {
    const awal = hg * HARI; const jamKe = Array.from({ length: 24 }, (_, i) => i);
    const masuk = Array(24).fill(0), keluar = Array(24).fill(0), sibuk = Array(24).fill(0), hadir = Array(24).fill(0);
    for (const t of d.tugas.values()) {
      if (t.status !== 'selesai' || t.selesai == null || t.mulai == null) continue;
      if (t.selesai >= awal && t.selesai < awal + HARI) { const h = Math.floor((t.selesai - awal) / JAM); if (t.jenis === 'putaway') masuk[h] += t.qty; if (t.jenis === 'muat') keluar[h] += t.qty; }
      if (!t.pekerja || t.selesai < awal || t.mulai >= awal + HARI) continue;
      for (let h = Math.max(0, Math.floor((t.mulai - awal) / JAM)); h <= Math.min(23, Math.floor((t.selesai - awal - 1) / JAM)); h++) {
        const a0 = Math.max(t.mulai, awal + h * JAM), a1 = Math.min(t.selesai, awal + (h + 1) * JAM); if (a1 > a0) sibuk[h] += (a1 - a0) / JAM;
      }
    }
    for (const h of jamKe) { const t = awal + h * JAM + JAM / 2; if (t > d.t) break; hadir[h] = d.pekerja.filter(p => p.kemampuan && !p.absen && bertugas(d, p.shift, t)).length; }
    // layanan truk outbound: menit lebih awal (+) / terlambat (−) terhadap batas order paling awal
    const layanan = [...d.truk.values()].filter(t => t.arus === 'outbound' && t.berangkat != null && t.berangkat >= awal && t.berangkat < awal + HARI).sort((p, q) => p.berangkat! - q.berangkat!).map(t => {
      const batas = Math.min(...t.order.map(o => d.order.get(o)?.batas ?? Infinity)); const sisa = Number.isFinite(batas) ? (batas - t.berangkat!) / 60 : 0;
      const jm = new Date((t.berangkat! - awal) * 1000).toISOString().slice(11, 16);
      return { label: jm, nilai: sisa >= 0 ? [sisa, 0] : [0, sisa] };
    });
    return {
      throughput: jamKe.map(h => ({ label: String(h).padStart(2, '0'), nilai: [masuk[h], keluar[h]] })),
      tenaga: jamKe.map(h => ({ label: String(h).padStart(2, '0'), nilai: [Math.min(sibuk[h], hadir[h] || sibuk[h]), Math.max(0, hadir[h] - sibuk[h])] })),
      layanan,
    };
  }, [d, d.seq, hg]); // eslint-disable-line react-hooks/exhaustive-deps

  const rIn = a.sIn.lpn.length / Math.max(1, a.sIn.kapasitas), rOut = a.sOut.lpn.length / Math.max(1, a.sOut.kapasitas);
  const rInMaks = d.stat.stagingMaks.in / Math.max(1, a.sIn.kapasitas), rOutMaks = d.stat.stagingMaks.out / Math.max(1, a.sOut.kapasitas);
  const dockMaks = Math.max(0, ...a.dock.map(x => x.util));
  const mheMaks = Math.max(0, ...a.mhe.map(x => x.util));
  const sla = a.orderSelesai ? 1 - a.telat / a.orderSelesai : 1;
  const ringkas: { judul: string; nilai: string; ket: string; l: Lampu }[] = [
    { judul: 'Tenaga kerja', nilai: pct(a.utilTotal), ket: 'utilisasi jam kerja', l: lampuUtil(a.utilTotal) },
    { judul: 'MHE', nilai: pct(mheMaks), ket: 'utilisasi tertinggi per jenis', l: lampuUtil(mheMaks) },
    { judul: 'Dock', nilai: pct(dockMaks), ket: `tertinggi · tunggu rata ${angka(a.lIn.tunggu + a.lOut.tunggu, 0)} mnt`, l: lampuUtil(dockMaks) },
    { judul: 'Staging inbound', nilai: `${a.sIn.lpn.length}/${a.sIn.kapasitas}`, ket: `maks ${d.stat.stagingMaks.in} palet`, l: lampuIsi(Math.max(rIn, rInMaks)) },
    { judul: 'Staging outbound', nilai: `${a.sOut.lpn.length}/${a.sOut.kapasitas}`, ket: `maks ${d.stat.stagingMaks.out} palet`, l: lampuIsi(Math.max(rOut, rOutMaks)) },
    { judul: 'SLA tepat waktu', nilai: pct(sla), ket: `${a.telat} dari ${a.orderSelesai} order terlambat`, l: sla >= 0.95 ? 'hijau' : sla >= 0.85 ? 'kuning' : 'merah' },
    { judul: 'Tugas menunggu', nilai: angka(a.menunggu), ket: 'antrean tugas saat ini', l: a.menunggu >= 40 ? 'merah' : a.menunggu >= 15 ? 'kuning' : 'hijau' },
  ];

  return (
    <div className="gm-analisis">
      <p className="small muted" style={{ margin: '0 0 8px' }}>Hasil sampai {angka(d.t / HARI, 2)} hari simulasi ({a.hariOp} hari operasi). Lampu: <Titik l="hijau" /> aman · <Titik l="kuning" /> waspada · <Titik l="merah" /> masalah · <Titik l="abu" /> utilisasi rendah (kapasitas berlebih).</p>
      <div className="gm-lampu-grid">
        {ringkas.map(r => <div key={r.judul} className={`gm-lampu-kartu ${r.l}`}><Titik l={r.l} /><div><small>{r.judul}</small><b>{r.nilai}</b><span>{r.ket}</span></div></div>)}
      </div>

      <div className="gm-analisis-grid">
        <section>
          <h3>Alur inbound</h3>
          <table className="sim3d-tabel"><tbody>
            <tr><td>Truk tiba / selesai</td><td className="num">{a.lIn.tiba} / {a.lIn.selesai}{a.lIn.antre ? ` · ${a.lIn.antre} antre` : ''}</td></tr>
            <tr><td>Tunggu dock rata / terlama</td><td className="num"><Titik l={a.lIn.tungguMaks > 60 ? 'merah' : a.lIn.tungguMaks > 15 ? 'kuning' : 'hijau'} /> {angka(a.lIn.tunggu)} / {angka(a.lIn.tungguMaks)} mnt</td></tr>
            <tr><td>Waktu di dock rata-rata</td><td className="num">{angka(a.lIn.servis)} mnt</td></tr>
            <tr><td>Palet dibongkar</td><td className="num">{angka(a.paletBongkar)}</td></tr>
            {a.perArea.map(x => <tr key={x.label}><td>Putaway ke {x.label}</td><td className="num">{angka(x.put)} palet</td></tr>)}
          </tbody></table>
        </section>
        <section>
          <h3>Alur outbound</h3>
          <table className="sim3d-tabel"><tbody>
            <tr><td>Truk tiba / berangkat</td><td className="num">{a.lOut.tiba} / {a.lOut.selesai}{a.lOut.antre ? ` · ${a.lOut.antre} antre` : ''}</td></tr>
            <tr><td>Order terkirim</td><td className="num">{angka(a.orderSelesai)}</td></tr>
            <tr><td>Order terlambat</td><td className="num"><Titik l={sla >= 0.95 ? 'hijau' : sla >= 0.85 ? 'kuning' : 'merah'} /> {a.telat} ({pct(1 - sla)})</td></tr>
            <tr><td>Keterlambatan rata / terburuk</td><td className="num">{angka(a.tunda)} / {angka(a.tundaMaks)} mnt</td></tr>
            <tr><td>Waktu di dock rata-rata</td><td className="num">{angka(a.lOut.servis)} mnt</td></tr>
            <tr><td>Pick palet / karton</td><td className="num">{angka(a.pickPalet)} palet · {angka(a.pickKarton)} karton</td></tr>
          </tbody></table>
        </section>
        <section>
          <h3>Pemakaian dock & staging</h3>
          <table className="sim3d-tabel"><thead><tr><th>Dock</th><th className="num">Truk</th><th className="num">Jam sandar</th><th className="num">Utilisasi</th></tr></thead><tbody>
            {a.dock.map(x => <tr key={x.id}><td>{x.arus === 'inbound' ? 'IN' : 'OUT'} {x.id.slice(2)}</td><td className="num">{x.layan}</td><td className="num">{angka(x.jam, 1)}</td><td className="num"><Titik l={lampuUtil(x.util)} /> {pct(x.util)}</td></tr>)}
            <tr><td>Staging inbound</td><td className="num" colSpan={2}>sekarang {a.sIn.lpn.length} · maks {d.stat.stagingMaks.in} / {a.sIn.kapasitas}</td><td className="num"><Titik l={lampuIsi(rInMaks)} /> {pct(rInMaks)}</td></tr>
            <tr><td>Staging outbound</td><td className="num" colSpan={2}>sekarang {a.sOut.lpn.length} · maks {d.stat.stagingMaks.out} / {a.sOut.kapasitas}</td><td className="num"><Titik l={lampuIsi(rOutMaks)} /> {pct(rOutMaks)}</td></tr>
          </tbody></table>
        </section>
        <section>
          <h3>Tenaga kerja & MHE</h3>
          <table className="sim3d-tabel"><thead><tr><th>Sumber daya</th><th className="num">Unit</th><th className="num">Jam kerja</th><th className="num">Utilisasi</th></tr></thead><tbody>
            {a.tenaga.map(x => <tr key={x.k}><td className="cap">{x.k}</td><td className="num">{x.n} org</td><td className="num">{angka(x.jam, 1)}</td><td className="num"><Titik l={lampuUtil(x.util)} /> {pct(x.util)}</td></tr>)}
            {a.mhe.map(x => <tr key={x.k}><td className="cap">MHE {x.k}</td><td className="num">{x.n} unit</td><td className="num">{angka(x.jam, 1)}</td><td className="num"><Titik l={lampuUtil(x.util)} /> {pct(x.util)}</td></tr>)}
            <tr><td>Lembur</td><td className="num" colSpan={3}>{angka(d.stat.lemburJam, 1)} jam-orang</td></tr>
          </tbody></table>
        </section>
      </div>

      <section>
        <h3>Laju penyelesaian tugas per operator — validasi productivity</h3>
        <p className="small muted" style={{ margin: '0 0 6px' }}>Aktual = jumlah unit ÷ jam kerja operator untuk tugas itu. Standar = productivity tender × faktor {angka(sk.faktor, 3)}. Selisih besar menandakan productivity tidak cocok dengan cara kerja di layout ini.</p>
        <div className="tablewrap"><table className="sim3d-tabel">
          <thead><tr><th>Tugas</th><th className="num">Selesai</th><th className="num">Unit</th><th className="num">Jam kerja</th><th className="num">Aktual /jam/operator</th><th className="num">Standar /jam</th><th className="num">Antre</th></tr></thead>
          <tbody>{a.laju.map(x => {
            const sel = x.std ? x.aktual / x.std : 1; const l: Lampu = x.antre >= 40 ? 'merah' : x.antre >= 15 || Math.abs(sel - 1) > 0.15 ? 'kuning' : 'hijau';
            return <tr key={x.j}><td><Titik l={l} /> {LABEL_TUGAS[x.j]}{x.luar ? ' *' : ''}</td><td className="num">{angka(x.n)}</td><td className="num">{angka(x.qty)} {x.satuan}</td><td className="num">{angka(x.jam, 1)}</td><td className="num">{angka(x.aktual, 1)}</td><td className="num">{angka(x.std, 1)}</td><td className="num">{x.antre}</td></tr>;
          })}</tbody>
        </table></div>
        {a.laju.some(x => x.luar) && <p className="small muted">* dikerjakan pihak luar (aktivitas tidak ada di tender).</p>}
      </section>

      <section>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Grafik per jam</h3>
          <label className="small">Hari <select value={hg} onChange={e => setHariGrafik(Number(e.target.value))}>{Array.from({ length: hariKini + 1 }, (_, i) => <option key={i} value={i}>{i + 1}{i === hariKini ? ' (berjalan)' : ''}</option>)}</select></label>
        </div>
        <div className="gm-analisis-grid">
          <div><h4>Throughput</h4><Batang data={g.throughput} warna={['#2563eb', '#059669']} seri={['Putaway', 'Muat']} satuanY="palet / jam" /></div>
          <div><h4>Pemakaian tenaga kerja lantai</h4><Batang data={g.tenaga} warna={['#f59e0b', '#cbd5e1']} seri={['Sibuk', 'Menganggur']} satuanY="orang (rata-rata per jam)" /></div>
        </div>
        <h4>Waktu layanan truk outbound</h4>
        {g.layanan.length ? <Batang data={g.layanan} warna={['#2563eb', '#dc2626']} seri={['Lebih awal', 'Terlambat']} satuanY="menit terhadap batas order" />
          : <p className="small muted">Belum ada truk outbound berangkat pada hari ini.</p>}
      </section>
    </div>
  );
}
