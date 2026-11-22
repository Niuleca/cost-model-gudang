'use client';
// Beranda: grafik penyelesaian task project (checklist Implementation / Project Charter).
// Logistics Opportunity Radar pindah ke /radar (menu Dashboard).
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import Grafik from '@/components/Grafik';
import { angka } from '@/lib/format';

interface Tg { tender_id: string; status: string; target: string | null; selesai: string | null }
interface T { id: string; kode: string | null; customer: string }

/** Kelompok status task — warna status: hijau selesai, merah terlambat, kuning blocked. */
const KEL = [
  { k: 'selesai', l: 'Selesai', warna: '#1baf7a' },
  { k: 'berjalan', l: 'Berjalan', warna: '#2a78d6' },
  { k: 'belum', l: 'Belum mulai', warna: '#bdbdbd' },
  { k: 'blocked', l: 'Blocked', warna: '#eda100' },
  { k: 'telat', l: 'Terlambat', warna: '#e34948' },
] as const;
type Kel = (typeof KEL)[number]['k'];
const hariIni = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Task yang lewat target dan belum selesai dihitung Terlambat. */
const kelompok = (t: Tg, hari: string): Kel =>
  t.status === 'Selesai' ? 'selesai'
    : t.status === 'Terlambat' || (!!t.target && t.target < hari) ? 'telat'
      : t.status === 'Blocked' ? 'blocked'
        : t.status === 'Berjalan' ? 'berjalan' : 'belum';

export default function Beranda() {
  const sb = supabaseBrowser();
  const [tugas, setTugas] = useState<Tg[]>([]);
  const [tender, setTender] = useState<T[]>([]);
  const [siap, setSiap] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      sb.from('implementation_tasks').select('tender_id, status, target, selesai'),
      sb.from('tenders').select('id, kode, customer'),
    ]).then(([a, b]) => {
      if (a.error) setErr(a.error.message);
      setTugas((a.data ?? []) as Tg[]); setTender((b.data ?? []) as T[]); setSiap(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hari = hariIni();
  // per project: jumlah task per kelompok, diurut dari % selesai tertinggi
  const proj = useMemo(() => {
    const ids = Array.from(new Set(tugas.map(t => t.tender_id)));
    return ids.map(id => {
      const xs = tugas.filter(t => t.tender_id === id);
      const n = Object.fromEntries(KEL.map(k => [k.k, 0])) as Record<Kel, number>;
      for (const t of xs) n[kelompok(t, hari)]++;
      const tn = tender.find(x => x.id === id);
      return { id, nama: tn ? `${tn.kode ? `${tn.kode} · ` : ''}${tn.customer}` : 'Project', n, total: xs.length, pct: xs.length ? n.selesai / xs.length : 0 };
    }).sort((x, y) => y.pct - x.pct || y.total - x.total);
  }, [tugas, tender, hari]);

  // task selesai per bulan (12 bulan terakhir) dari tanggal selesai
  const bulan = useMemo(() => {
    const now = new Date(); const xs: string[] = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); xs.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    return xs;
  }, []);
  const perBulan = bulan.map(b => tugas.filter(t => t.status === 'Selesai' && t.selesai?.slice(0, 7) === b).length);
  const adaTanggalSelesai = perBulan.some(v => v > 0);

  const total = tugas.length;
  const jml = (k: Kel) => proj.reduce((a, p) => a + p.n[k], 0);
  const pctSelesai = total ? Math.round((jml('selesai') / total) * 100) : 0;

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Beranda</div><h1>Penyelesaian task project</h1>
          <p className="small muted">Dari checklist Implementation / Project Charter · task lewat target yang belum selesai dihitung terlambat</p></div>
        <Link className="btn ghost" href="/implementasi">Buka checklist project</Link>
      </div>
      {err && <p className="error small" role="alert">{err}</p>}

      {!siap ? <div className="card"><p className="muted">Memuat…</p></div>
        : !total ? <div className="card"><p className="muted">Belum ada task project. Checklist dibuat di menu Logistics Tender → Implementation / Project Charter.</p></div>
          : <>
            <div className="card">
              <Grafik judul="Status task per project" keterangan={`${angka(jml('selesai'))} dari ${angka(total)} task selesai (${pctSelesai}%) · ${angka(jml('telat'))} terlambat · ${proj.length} project`}
                kategori={proj.map(p => p.nama)} seri={KEL.map(k => ({ nama: k.l, nilai: proj.map(p => p.n[k.k]), warna: k.warna }))}
                jenis="tumpuk" pilihan={['tumpuk', 'batang']} persen100 labelUjung={i => `${Math.round(proj[i].pct * 100)}% · ${proj[i].n.selesai}/${proj[i].total}`}
                fmt={v => `${angka(v)} task`} fmtSumbu={v => angka(v)} />
            </div>
            {adaTanggalSelesai && <div className="card">
              <Grafik judul="Task selesai per bulan" keterangan="12 bulan terakhir · kolom = selesai di bulan itu, garis = kumulatif"
                kategori={bulan.map(b => new Date(`${b}-01`).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }))}
                seri={[{ nama: 'Task selesai', nilai: perBulan, warna: '#1baf7a' }]} jenis="combo" pilihan={['combo', 'kolom', 'garis']}
                fmt={v => `${angka(v)} task`} fmtSumbu={v => angka(v)} tinggi={220} />
            </div>}
          </>}
    </>
  );
}
