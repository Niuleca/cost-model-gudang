'use client';
// Leca Game · halaman uji mesin simulasi (M1, tanpa 3D): pilih project tender → skenario data sungguhan →
// jalankan N hari → laporan harian, keuangan vs cost model, status invariant.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ASUMSI_DEFAULT, keInput, muatMaster, type TenderRow } from '@/lib/tender';
import { IT_SHEET_DEFAULT } from '@/lib/it';
import { hitungTender, type HasilTender } from '@/lib/engine/index.ts';
import { labelStatus } from '@/lib/status';
import { buatDunia, jalankanHari, ringkasDunia, skenarioDariTender, type Dunia, type JenisTugas, type Skenario } from '@/lib/game';

interface T { id: string; kode: string | null; customer: string; status: string; updated_at: string }
const rp = (v: number) => `Rp ${Math.round(v).toLocaleString('id-ID')}`;
const jt = (v: number) => `${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
const angka = (v: number, d = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d });
const LABEL_TUGAS: Record<JenisTugas, string> = {
  admin_in: 'Admin inbound', bongkar: 'Bongkar', cek_in: 'Cek inbound', putaway: 'Putaway', admin_out: 'Admin outbound',
  pick_palet: 'Pick palet', pick_karton: 'Pick karton', pack: 'Packing', cek_out: 'Cek outbound', muat: 'Muat',
};

export default function LecaGame() {
  const sb = supabaseBrowser();
  const [daftar, setDaftar] = useState<T[]>([]);
  const [cari, setCari] = useState('');
  const [id, setId] = useState('');
  const [data, setData] = useState<{ t: TenderRow; h: HasilTender } | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<number | null>(null);
  const [hari, setHari] = useState(30);
  const [seed, setSeed] = useState(1);
  const [mulai, setMulai] = useState('');
  const [dunia, setDunia] = useState<Dunia | null>(null);
  const [jalan, setJalan] = useState<{ selesai: number; total: number } | null>(null);
  const [versi, setVersi] = useState(0);
  const batalRef = useRef(false);

  useEffect(() => {
    sb.from('tenders').select('id, kode, customer, status, updated_at').order('updated_at', { ascending: false }).then(({ data: d, error }: { data: unknown[] | null; error: { message: string } | null }) => {
      if (error) setErr(error.message);
      setDaftar((d ?? []) as T[]);
      const q = new URLSearchParams(window.location.search).get('id');
      if (q) setId(q);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDunia(null);
    if (!id) { setData(null); return; }
    let batal = false;
    setMemuat(true); setErr(null);
    (async () => {
      const { data: row, error } = await sb.from('tenders').select('*').eq('id', id).single();
      if (error || !row) throw new Error(error?.message ?? 'Tender tidak ditemukan');
      const t = row as TenderRow;
      t.asumsi = { ...ASUMSI_DEFAULT, ...(t.asumsi ?? {}) }; t.asumsi.it = { ...IT_SHEET_DEFAULT, ...(t.asumsi.it ?? {}) };
      try { const { master } = await muatMaster(sb, t); return { t, h: hitungTender(keInput(t), master) }; }
      catch { if (t.hasil) return { t, h: t.hasil as HasilTender }; throw new Error('Tender ini belum bisa dihitung — lengkapi input di halaman tender.'); }
    })().then(r => {
      if (batal) return;
      setData(r); setModal(Math.round(r.h.totalBiayaBulan * 3));
      setMulai((r.t.tanggal_go_live || new Date().toISOString()).slice(0, 10));
      const u = new URL(window.location.href); u.searchParams.set('id', id); window.history.replaceState(null, '', u);
    }).catch(e => { if (!batal) { setErr(e.message); setData(null); } }).finally(() => { if (!batal) setMemuat(false); });
    return () => { batal = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return q ? daftar.filter(x => `${x.kode ?? ''} ${x.customer}`.toLowerCase().includes(q)) : daftar;
  }, [daftar, cari]);

  const [sk, errSk] = useMemo((): [Skenario | null, string | null] => {
    if (!data) return [null, null];
    try { return [skenarioDariTender(data.t, data.h, { modal: modal ?? undefined, seed, mulai: mulai || undefined }), null]; }
    catch (e) { return [null, `Skenario tidak bisa dibuat: ${(e as Error).message}`]; }
  }, [data, modal, seed, mulai]);

  /** Jalankan hari per hari (dipecah supaya halaman tetap responsif). */
  const mainkan = () => {
    if (!sk) return;
    const d = buatDunia(sk); setDunia(d); batalRef.current = false;
    const total = Math.max(1, Math.min(365, hari));
    setJalan({ selesai: 0, total });
    const langkah = () => {
      if (batalRef.current) { setJalan(null); return; }
      const t0 = performance.now();
      while (d.laporan.length < total && performance.now() - t0 < 40) jalankanHari(d, 1);
      setJalan({ selesai: d.laporan.length, total }); setVersi(v => v + 1);
      if (d.laporan.length < total) setTimeout(langkah, 0); else setJalan(null);
    };
    setTimeout(langkah, 0);
  };

  const r = dunia ? ringkasDunia(dunia) : null;
  // per 30 hari untuk dibandingkan dengan cost model bulanan
  const per30 = r && r.hari ? 30 / r.hari : 0;
  const rataPend = data?.h.simulasi.find(s => s.skenario === 'Volume rata-rata')?.pendapatanBulan ?? 0;
  void versi;

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Simulasi Warehouse · internal</div><h1>Leca Game</h1></div>
        {data && <Link className="btn ghost" href={`/tender/${data.t.id}`}>Buka tender</Link>}
      </div>

      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>Tahap M1: mesin simulasi tanpa 3D, pakai data tender sungguhan. Manpower, biaya, tarif rate card, productivity aktivitas, dan lokasi rak diambil dari project. Hasilnya bisa dibandingkan langsung dengan cost model.</p>
        <div className="sim3d-pilih">
          <label className="f">Cari project<input value={cari} onChange={e => setCari(e.target.value)} placeholder="kode / customer" /></label>
          <label className="f">Project
            <select value={id} onChange={e => setId(e.target.value)}>
              <option value="">— pilih project —</option>
              {tersaring.map(x => <option key={x.id} value={x.id}>{x.kode ? `${x.kode} · ` : ''}{x.customer} ({labelStatus(x.status)})</option>)}
            </select>
          </label>
        </div>
        {(err || errSk) && <p className="error small" role="alert">{err || errSk}</p>}
        {memuat && <p className="small muted">Menghitung tender…</p>}
        {sk && data && (
          <div className="game-isian">
            <label className="f">Modal awal (Rp)<input type="number" step={1000000} value={modal ?? ''} onChange={e => setModal(e.target.value === '' ? null : Number(e.target.value))} />
              <span className="small muted">default 3 × biaya bulanan ({jt(data.h.totalBiayaBulan * 3)})</span></label>
            <label className="f">Lama main (hari)<input type="number" min={1} max={365} value={hari} onChange={e => setHari(Number(e.target.value))} /></label>
            <label className="f">Seed<input type="number" value={seed} onChange={e => setSeed(Number(e.target.value) || 0)} /><span className="small muted">seed sama = hasil sama</span></label>
            <label className="f">Tanggal mulai<input type="date" value={mulai} onChange={e => setMulai(e.target.value)} /></label>
            <div className="game-tombol">
              {jalan ? <button type="button" className="ghost" onClick={() => { batalRef.current = true; }}>Hentikan ({jalan.selesai}/{jalan.total})</button>
                : <button type="button" onClick={mainkan}>Jalankan simulasi</button>}
            </div>
          </div>
        )}
      </div>

      {sk && data && (
        <details className="card">
          <summary><b>Skenario dari tender</b> <span className="small muted">— {sk.pekerja.length} orang · {sk.mhe.length} MHE · {angka(sk.lokasi.filter(l => l.tipe === 'rak' || l.tipe === 'lantai').length)} posisi simpan · stok awal {angka(sk.stokAwal)} palet</span></summary>
          <div className="game-grid">
            <div>
              <h3>Volume & tarif</h3>
              <table className="sim3d-tabel"><tbody>
                <tr><td>Inbound / hari</td><td className="num">{angka(sk.permintaan.paletInHari, 1)} palet</td></tr>
                <tr><td>Outbound / hari</td><td className="num">{angka(sk.permintaan.paletOutHari, 1)} palet · ±{sk.permintaan.orderHari} order</td></tr>
                <tr><td>Shift</td><td className="num">{sk.shift.jumlah} × {sk.shift.jamKerja} jam, mulai {String(sk.shift.mulaiJam).padStart(2, '0')}.00</td></tr>
                <tr><td>Tarif storage</td><td className="num">{rp(sk.tarif.storagePerPaletBulan)} /palet/bln</td></tr>
                <tr><td>Tarif inbound</td><td className="num">{rp(sk.tarif.inboundPerPalet)} /palet</td></tr>
                <tr><td>Tarif outbound</td><td className="num">{rp(sk.tarif.outboundPerPalet)} /palet</td></tr>
                {sk.tarif.tetapBulan > 0 && <tr><td>Tagihan tetap</td><td className="num">{rp(sk.tarif.tetapBulan)} /bln</td></tr>}
                <tr><td>Biaya manpower</td><td className="num">{rp(sk.pekerja.reduce((a, p) => a + p.biayaBulan, 0))} /bln</td></tr>
                <tr><td>Biaya lain (sewa, MHE, IT, dll.)</td><td className="num">{rp(sk.biaya.tetapBulan)} /bln</td></tr>
                <tr><td><b>Total biaya = cost model</b></td><td className="num"><b>{rp(data.h.totalBiayaBulan)}</b></td></tr>
              </tbody></table>
            </div>
            <div>
              <h3>Productivity (× faktor {angka(sk.faktor, 3)})</h3>
              <table className="sim3d-tabel"><tbody>
                {(Object.keys(sk.prod) as JenisTugas[]).map(j => (
                  <tr key={j}><td>{LABEL_TUGAS[j]}</td><td className="num">{angka(sk.prod[j].prod)} {sk.prod[j].satuan}/jam</td><td className="small muted">{sk.prod[j].sumber === 'default' ? 'default' : sk.prod[j].sumber}</td></tr>
                ))}
              </tbody></table>
              <h3>Pekerja & MHE</h3>
              <table className="sim3d-tabel"><tbody>
                {Object.entries(sk.pekerja.reduce<Record<string, { n: number; k: string | null; s: number[] }>>((a, p) => {
                  const x = (a[p.role] ??= { n: 0, k: p.kemampuan, s: Array(sk.shift.jumlah).fill(0) }); x.n++; x.s[p.shift]++; return a;
                }, {})).map(([role, x]) => <tr key={role}><td>{role}</td><td className="num">{x.n} org</td><td className="small muted">{x.k ?? 'tidak mengerjakan tugas lantai'} · shift {x.s.join('/')}</td></tr>)}
                {Object.entries(sk.mhe.reduce<Record<string, number>>((a, m) => { const n = m.nama.replace(/ \d+$/, ''); a[n] = (a[n] ?? 0) + 1; return a; }, {})).map(([n, u]) => <tr key={n}><td>{n}</td><td className="num">{u} unit</td><td /></tr>)}
              </tbody></table>
            </div>
          </div>
          <h3>Asumsi</h3>
          <ul className="small">{[...sk.asumsi, ...sk.tarif.catatan].map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      )}

      {dunia && r && data && (
        <>
          <div className="kpis kpis-hasil">
            <div className="kpi"><span className="small muted">Pendapatan ({r.hari} hari)</span><b>{jt(r.pendapatan)}</b><span className="small muted">≈ {jt(r.pendapatan * per30)} / 30 hari · cost model {jt(rataPend)}</span></div>
            <div className="kpi"><span className="small muted">Biaya ({r.hari} hari)</span><b>{jt(r.biaya)}</b><span className="small muted">≈ {jt(r.biaya * per30)} / 30 hari · cost model {jt(data.h.totalBiayaBulan)}</span></div>
            <div className="kpi"><span className="small muted">Laba</span><b>{jt(r.laba)}</b><span className="small muted">GP {r.pendapatan ? angka((r.laba / r.pendapatan) * 100, 1) : 0}%</span></div>
            <div className="kpi"><span className="small muted">Kas akhir</span><b>{jt(r.kas)}</b><span className="small muted">{r.bangkrut ? 'BANGKRUT' : `piutang ${jt(dunia.piutang.reduce((a, p) => a + p.nilai, 0))} + akrual ${jt(dunia.akrual.pendapatan)}`}</span></div>
            <div className="kpi"><span className="small muted">SLA tepat waktu</span><b>{angka(r.sla * 100, 1)}%</b><span className="small muted">{angka(r.orderSelesai)} order terkirim</span></div>
            <div className="kpi"><span className="small muted">Palet masuk / keluar</span><b>{angka(r.paletMasuk)} / {angka(r.paletKeluarEq)}</b><span className="small muted">jam kerja orang {angka(r.jamPekerja)} · MHE {angka(r.jamMhe)}</span></div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Pemeriksaan konsistensi {dunia.pelanggaran.length ? <span className="pill bad">{dunia.pelanggaran.length} pelanggaran</span> : <span className="pill ok">semua lolos</span>}</h2>
            <p className="small muted">Dicek tiap akhir hari: stok fisik per SKU = saldo = ledger transaksi, tiap LPN tercatat di satu lokasi, isi lokasi ≤ kapasitas, karton dialokasi ≤ isi, tidak ada stok negatif.</p>
            {dunia.pelanggaran.length > 0 && <ul className="small error">{dunia.pelanggaran.slice(0, 20).map((p, i) => <li key={i}>{p}</li>)}</ul>}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Laporan harian</h2>
            <div className="tbl-wrap">
              <table className="sim3d-tabel game-tabel">
                <thead><tr><th>Tanggal</th><th className="num">Masuk</th><th className="num">Keluar</th><th className="num">Order</th><th className="num">Tepat</th><th className="num">Tertunda</th><th className="num">Stok</th><th className="num">Utilisasi</th><th className="num">Antrean tugas</th><th className="num">Pendapatan</th><th className="num">Biaya</th><th className="num">Kas</th><th>Kejadian</th></tr></thead>
                <tbody>
                  {dunia.laporan.map(x => (
                    <tr key={x.hari} className={x.operasi ? '' : 'muted'}>
                      <td>{x.tanggal}{x.operasi ? '' : ' (libur)'}</td>
                      <td className="num">{angka(x.paletMasuk)}</td><td className="num">{angka(x.paletKeluarEq, 1)}</td>
                      <td className="num">{x.orderSelesai}</td><td className="num">{x.orderTepat}</td><td className="num">{x.orderTertunda}</td>
                      <td className="num">{angka(x.stokPalet)}</td><td className="num">{angka(x.utilisasi * 100, 1)}%</td><td className="num">{x.tugasTertunda}</td>
                      <td className="num">{angka(x.pendapatan / 1e6, 2)}</td><td className="num">{angka(x.biaya / 1e6, 2)}</td><td className="num">{angka(x.kas / 1e6, 1)}</td>
                      <td className="small">{x.kejadian.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">Pendapatan, biaya, kas dalam juta rupiah. Pendapatan diakui harian (storage per hari + handling saat putaway/muat); invoice terbit akhir bulan dan dibayar setelah term {sk?.termBayarHari ?? 0} hari; gaji & biaya dibayar akhir bulan.</p>
          </div>
        </>
      )}
    </>
  );
}
