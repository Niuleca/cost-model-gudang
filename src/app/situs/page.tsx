import type { Metadata } from 'next';
import LecaMark from '@/components/LecaMark';
import { supabaseServer } from '@/lib/supabase/server';
import Kontak from './Kontak';
import './situs.css';

export const metadata: Metadata = {
  title: { absolute: 'Leca — Cost model & tender gudang · niuleca.com' },
  description: 'Leca menghitung cost model gudang, merancang layout 2D/3D, menyusun manpower, MHE, SOP, hingga quotation tender — dalam satu platform.',
};

// Halaman awal niuleca.com untuk pengunjung (belum login). Menu: Beranda · Contact · Login.
export default async function Situs() {
  let masuk = false;
  try { const { data } = await supabaseServer().auth.getUser(); masuk = !!data.user; } catch { /* abaikan */ }
  return (
    <div className="ld">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap" />
      <header className="ld-nav">
        <div className="ld-wrap ld-nav-isi">
          <a href="#beranda" className="ld-merek" aria-label="Leca — beranda"><LecaMark size={30} /><span>Leca</span></a>
          <nav aria-label="Menu utama">
            <a href="#beranda">Beranda</a>
            <a href="#kontak">Contact</a>
            <a href={masuk ? '/' : '/login'} className="ld-masuk">{masuk ? 'Buka Leca' : 'Login'}</a>
          </nav>
        </div>
      </header>

      <main>
        {/* ---------- hero */}
        <section className="ld-hero" id="beranda">
          <DenahLatar />
          <div className="ld-wrap ld-hero-isi">
            <div className="ld-hero-teks">
              <h1>Hitung, rancang, dan menangkan tender gudang dalam satu platform.</h1>
              <p>Leca menyatukan volume customer, space planning, manpower, MHE, biaya, hingga rate card dan quotation. Angka di web sama persis dengan file Excel yang Anda kirim ke customer.</p>
              <div className="ld-cta">
                <a href={masuk ? '/' : '/login'} className="ld-tombol utama">{masuk ? 'Buka Leca' : 'Masuk ke Leca'}</a>
                <a href="#kontak" className="ld-tombol garis">Hubungi kami</a>
              </div>
            </div>
            <KartuContoh />
          </div>
        </section>

        {/* ---------- yang bisa dikerjakan */}
        <section className="ld-bagian" aria-labelledby="bisa">
          <div className="ld-wrap">
            <h2 id="bisa">Dari volume customer sampai quotation</h2>
            <p className="ld-lead">Semua yang biasanya tersebar di belasan sheet Excel, kini saling terhubung. Ubah satu angka, seluruh hitungan ikut menyesuaikan.</p>
            <div className="ld-kemampuan">
              {KEMAMPUAN.map(k => (
                <article key={k.judul}>
                  <Ikon jenis={k.ikon} />
                  <h3>{k.judul}</h3>
                  <p>{k.isi}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- alur kerja (berurutan) */}
        <section className="ld-bagian ld-alur-latar" aria-labelledby="alur">
          <div className="ld-wrap">
            <h2 id="alur">Satu alur, dari data ke dokumen tender</h2>
            <ol className="ld-alur">
              {ALUR.map((a, i) => (
                <li key={a.judul}><span className="ld-alur-no">{String(i + 1).padStart(2, '0')}</span><b>{a.judul}</b><span>{a.isi}</span></li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- sorotan: denah & simulasi */}
        <section className="ld-bagian" aria-labelledby="denah">
          <div className="ld-wrap ld-sorot">
            <div>
              <h2 id="denah">Denah gudang yang ikut menghitung</h2>
              <p className="ld-lead">Tarik area rak, dan baris, lorong, serta bay terbentuk otomatis menghindari kolom, office, dan ramp. Geser baris dengan perintah gaya CAD, lihat hasilnya di 3D, lalu jalankan simulasi operasi harian.</p>
              <ul className="ld-cek">
                <li>Lebar lorong pas sesuai isian, sisa ruang terlihat jelas</li>
                <li>Kekuatan rak &amp; lantai dicek per level dan per jenis palet</li>
                <li>Potongan rak, ekspor PNG/PDF A3, dan simulasi 2D/3D</li>
              </ul>
            </div>
            <DenahMini />
          </div>
        </section>

        {/* ---------- kelebihan */}
        <section className="ld-bagian ld-gelap" aria-labelledby="kenapa">
          <div className="ld-wrap">
            <h2 id="kenapa">Kenapa tim solution design memakai Leca</h2>
            <div className="ld-kelebihan">
              {KELEBIHAN.map(k => (
                <div key={k.judul}><b>{k.judul}</b><p>{k.isi}</p></div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- kontak */}
        <section className="ld-bagian" id="kontak" aria-labelledby="kontak-judul">
          <div className="ld-wrap ld-kontak">
            <div>
              <h2 id="kontak-judul">Mari diskusikan tender Anda</h2>
              <p className="ld-lead">Ingin mencoba Leca untuk tim, atau butuh bantuan menyusun cost model gudang? Kirim pesan, kami balas secepatnya.</p>
              <dl className="ld-kontak-data">
                <div><dt>WhatsApp</dt><dd><a href="https://wa.me/6288291919234" target="_blank" rel="noopener noreferrer">0882-9191-9234</a></dd></div>
                <div><dt>Email</dt><dd><a href="mailto:Niuleca@gmail.com">Niuleca@gmail.com</a></dd></div>
                <div><dt>Situs</dt><dd>niuleca.com</dd></div>
              </dl>
            </div>
            <Kontak />
          </div>
        </section>
      </main>

      <footer className="ld-kaki">
        <div className="ld-wrap ld-kaki-isi">
          <span className="ld-merek kecil"><LecaMark size={22} /><span>Leca</span></span>
          <span>Cost model, tender &amp; quotation gudang · dibuat oleh esapanghegar</span>
          <span>© {new Date().getFullYear()} niuleca.com</span>
        </div>
      </footer>
    </div>
  );
}

const KEMAMPUAN: { ikon: JenisIkon; judul: string; isi: string }[] = [
  { ikon: 'biaya', judul: 'Cost model gudang', isi: 'Space, manpower, MHE, IT, overhead hingga margin dihitung dari volume customer, lengkap dengan red flag dan cara memperbaikinya.' },
  { ikon: 'denah', judul: 'Warehouse planning 2D/3D', isi: 'Kapasitas palet, level rak, kelas rak, kekuatan lantai, dan denah yang bisa diedit lalu dilihat dalam 3D.' },
  { ikon: 'orang', judul: 'Manpower, MHE & VSM', isi: 'Aktivitas, produktivitas, matriks multi-skill, Landmark VSM, serta SOP dan WI per proses dalam Word atau PDF.' },
  { ikon: 'harga', judul: 'Rate card & quotation', isi: 'Tarif per palet, per hari, per UoM (karton, drum, IBC), VAS, alokasi biaya, sampai quotation siap kirim.' },
  { ikon: 'truk', judul: 'Transport & intermodal', isi: 'Tender trucking dan intermodal di platform yang sama, dengan perbandingan harga vendor.' },
  { ikon: 'grafik', judul: 'Pipeline & approval', isi: 'Status tender, win rate, heatmap per provinsi, approval quotation, dan riwayat versi.' },
];

const ALUR = [
  { judul: 'Volume', isi: 'Inbound, outbound, peak & UoM' },
  { judul: 'Space', isi: 'Palet, rak, luas gudang' },
  { judul: 'Operasi', isi: 'Manpower, MHE, shift' },
  { judul: 'Biaya', isi: 'OPEX, CAPEX, overhead' },
  { judul: 'Harga', isi: 'Rate card & margin' },
  { judul: 'Dokumen', isi: 'Excel, quotation, SOP' },
];

const KELEBIHAN = [
  { judul: 'Excel sama persis', isi: 'Ekspor Excel dengan rumus hidup. Angkanya diverifikasi sama dengan yang tampil di web, jadi customer bisa menelusuri setiap angka.' },
  { judul: 'Salah langsung ketahuan', isi: 'Setiap red flag datang dengan solusinya dan tombol ke tab tempat memperbaikinya, plus saran solusi gudang dari hasil hitung.' },
  { judul: 'Satu sumber data', isi: 'Jenis palet, satuan panjang m / cm / mm, dan master harga dipakai bersama di seluruh tender, tanpa angka yang terlewat.' },
  { judul: 'Siap untuk tim', isi: 'Akun disetujui Admin, peran per departemen, multi bahasa (ID, EN, KO, ZH), dan bisa dibuka dari laptop maupun HP.' },
];

type JenisIkon = 'biaya' | 'denah' | 'orang' | 'harga' | 'truk' | 'grafik';
function Ikon({ jenis }: { jenis: JenisIkon }) {
  const p: Record<JenisIkon, React.ReactNode> = {
    biaya: <><rect x="6" y="5" width="20" height="24" rx="2" /><path d="M10 11h12M10 16h12M10 21h7" /><circle cx="23" cy="23" r="5" className="isi" /><path d="M23 20.5v5M21 23h4" className="putih" /></>,
    denah: <><rect x="4" y="6" width="24" height="20" rx="1.5" /><path d="M9 10h14M9 13.5h14" className="beam" /><path d="M9 18h14M9 21.5h14" className="beam" /><path d="M7 26v-3" /></>,
    orang: <><circle cx="12" cy="10" r="4" /><path d="M5 26v-3a7 7 0 0 1 14 0v3" /><circle cx="23" cy="12" r="3" className="isi" /><path d="M19 26v-2.5a5 5 0 0 1 9-3" /></>,
    harga: <><path d="M5 16 16 5h10v10L15 26z" /><circle cx="21.5" cy="9.5" r="2" className="isi" /><path d="M11 17l5 5" /></>,
    truk: <><rect x="3" y="9" width="16" height="12" rx="1" /><path d="M19 13h5l4 4v4h-9" /><circle cx="9" cy="23" r="2.5" className="isi" /><circle cx="23" cy="23" r="2.5" className="isi" /></>,
    grafik: <><path d="M5 27h22" /><rect x="7" y="16" width="4" height="9" className="isi" /><rect x="14" y="11" width="4" height="14" /><rect x="21" y="6" width="4" height="19" className="isi" /></>,
  };
  return <svg className="ld-ikon" viewBox="0 0 32 32" aria-hidden="true">{p[jenis]}</svg>;
}

/** Kartu contoh hasil cost model (ilustrasi, data fiktif). */
function KartuContoh() {
  const biaya = [{ l: 'Space', v: 46 }, { l: 'Manpower', v: 31 }, { l: 'MHE', v: 14 }, { l: 'Lainnya', v: 9 }];
  return (
    <div className="ld-kartu" aria-label="Contoh ringkasan hasil cost model (ilustrasi)">
      <div className="ld-kartu-kepala"><LecaMark size={20} /><span>Tender · PT Contoh Distribusi · Bekasi</span><em>contoh</em></div>
      <div className="ld-kartu-kpi">
        <div><span>Selling / bulan</span><b>Rp 412 jt</b></div>
        <div><span>GP</span><b className="ok">18,4%</b></div>
        <div><span>Posisi palet</span><b>1.212</b></div>
      </div>
      <div className="ld-kartu-bar" role="img" aria-label="Komposisi biaya: space 46%, manpower 31%, MHE 14%, lainnya 9%">
        {biaya.map(b => <i key={b.l} style={{ flexBasis: `${b.v}%` }} title={`${b.l} ${b.v}%`} />)}
      </div>
      <div className="ld-kartu-legenda">{biaya.map(b => <span key={b.l}><i />{b.l} {b.v}%</span>)}</div>
      <table className="ld-kartu-tabel">
        <thead><tr><th>Rate card</th><th>Satuan</th><th>Tarif</th></tr></thead>
        <tbody>
          <tr><td>Storage</td><td>palet / hari</td><td>Rp 3.950</td></tr>
          <tr><td>Handling in</td><td>palet</td><td>Rp 18.500</td></tr>
          <tr><td>Handling out</td><td>karton</td><td>Rp 1.250</td></tr>
          <tr><td>VAS banding strap</td><td>palet</td><td>Rp 9.000</td></tr>
        </tbody>
      </table>
      <div className="ld-kartu-flag"><b>1 red flag</b> · Utilisasi reach truck 34%. Solusi: pakai bersama antar shift.</div>
    </div>
  );
}

/** Latar hero: denah rak bergaya blueprint (tergambar saat halaman dibuka). */
function DenahLatar() {
  // gudang 60 × 30 m digambar 12 px/m di sisi kanan; pasangan rak back-to-back + lorong 3,5 m, kolom tiap 6 m
  const X0 = 700, Y0 = 120, S = 12, L = 60 * S, Wd = 30 * S;
  const baris: { y: number; muka: 1 | -1 }[] = [];
  for (let z = 1.5, i = 0; z + 1.1 <= 29 && i < 12; i++) { const pas = i % 2 === 0; baris.push({ y: Y0 + z * S, muka: pas ? -1 : 1 }); z += pas ? 1.1 + 0.3 : 1.1 + 3.5; }
  return (
    <svg className="ld-denah" viewBox="0 0 1440 720" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <defs>
        <pattern id="ldkisi" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0v24" fill="none" stroke="currentColor" strokeWidth=".5" opacity=".35" /></pattern>
      </defs>
      <rect width="1440" height="720" fill="url(#ldkisi)" />
      <rect x={X0} y={Y0} width={L} height={Wd} className="ld-dinding" />
      <rect x={X0 + 6} y={Y0 + 6} width={4 * S} height={Wd - 12} className="ld-zona" />
      {Array.from({ length: 11 }, (_, a) => Array.from({ length: 6 }, (_, b) => <rect key={`${a}-${b}`} x={X0 + a * 6 * S - 3} y={Y0 + b * 6 * S - 3} width="6" height="6" className="ld-kolom" />))}
      {baris.map((r, i) => (
        <g key={i} className="ld-baris" style={{ animationDelay: `${0.15 + i * 0.07}s` }}>
          <rect x={X0 + 8 * S} y={r.y} width={50 * S} height={1.1 * S} />
          {Array.from({ length: 18 }, (_, b) => <line key={b} x1={X0 + 8 * S + (b + 1) * 2.7 * S} x2={X0 + 8 * S + (b + 1) * 2.7 * S} y1={r.y} y2={r.y + 1.1 * S} className="ld-bay" />)}
          <line x1={X0 + 8 * S} x2={X0 + 58 * S} y1={r.muka === 1 ? r.y + 1.1 * S : r.y} y2={r.muka === 1 ? r.y + 1.1 * S : r.y} className="ld-beam" />
        </g>
      ))}
      <g className="ld-ukur"><line x1={X0} x2={X0 + L} y1={Y0 - 26} y2={Y0 - 26} /><path d={`M${X0 + 6} ${Y0 - 30}l-6 4 6 4M${X0 + L - 6} ${Y0 - 30}l6 4-6 4`} /><text x={X0 + L / 2} y={Y0 - 34} textAnchor="middle">60 m</text></g>
      <g className="ld-ukur"><line x1={X0 + L + 26} x2={X0 + L + 26} y1={Y0} y2={Y0 + Wd} /><text x={X0 + L + 34} y={Y0 + Wd / 2} transform={`rotate(90 ${X0 + L + 34} ${Y0 + Wd / 2})`} textAnchor="middle">30 m</text></g>
    </svg>
  );
}

/** Cuplikan denah editor (ilustrasi). */
function DenahMini() {
  const baris = [{ y: 30, h: 1 }, { y: 54, h: -1 }, { y: 74, h: 1 }, { y: 122, h: -1 }, { y: 142, h: 1 }, { y: 190, h: -1 }];
  return (
    <figure className="ld-mini" aria-label="Cuplikan editor denah gudang Leca">
      <svg viewBox="0 0 520 250">
        <rect x="10" y="10" width="500" height="230" className="m-dinding" />
        <rect x="18" y="18" width="56" height="214" className="m-staging" /><text x="46" y="128" transform="rotate(-90 46 128)">Staging</text>
        <rect x="80" y="18" width="22" height="214" className="m-jalur" />
        {baris.map((b, i) => (
          <g key={i} className={i === 3 ? 'm-pilih' : undefined}>
            <rect x="118" y={b.y} width="372" height="20" className="m-rak" />
            {Array.from({ length: 11 }, (_, k) => <line key={k} x1={118 + (k + 1) * 31} x2={118 + (k + 1) * 31} y1={b.y} y2={b.y + 20} className="m-bay" />)}
            <line x1="118" x2="490" y1={b.h === 1 ? b.y + 20 : b.y} y2={b.h === 1 ? b.y + 20 : b.y} className="m-beam" />
          </g>
        ))}
        <g className="m-ukur"><line x1="300" x2="300" y1="94" y2="122" /><text x="306" y="112">3,5 m</text></g>
        <g className="m-ukur oranye"><line x1="380" x2="380" y1="162" y2="190" /><text x="386" y="180">3,5 m</text></g>
        {[150, 260, 370, 480].map(x => [10, 110, 210].map(y => <rect key={`${x}${y}`} x={x - 3} y={y - 3} width="6" height="6" className="m-kolom" />))}
      </svg>
      <figcaption><span className="m-cmd">Perintah › M</span><span>Titik kedua: 0,85 m</span><span className="m-st">ORTHO</span><span className="m-st on">OSNAP</span></figcaption>
    </figure>
  );
}
