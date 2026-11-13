import type { Metadata } from 'next';
import LecaMark from '@/components/LecaMark';
import { supabaseServer } from '@/lib/supabase/server';
import Kontak from './Kontak';
import MenuHp from './MenuHp';
import Pamer3D from './Pamer3D';
import { DENAH } from './denahContoh';
import './situs.css';

export const metadata: Metadata = {
  title: { absolute: 'Leca — Cost model & tender gudang · niuleca.com' },
  description: 'Leca menghitung cost model gudang, merancang layout 2D/3D, menyusun manpower, MHE, SOP, hingga quotation tender — dalam satu platform.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website', url: '/', siteName: 'Leca', locale: 'id_ID',
    title: 'Leca — Cost model, layout & simulasi gudang dalam satu platform',
    description: 'Dari volume customer sampai quotation — lengkap dengan denah 2D, gudang 3D, dan simulasi operasi.',
    images: [{ url: '/og-leca.jpg', width: 1200, height: 630, alt: 'Leca — cost model, layout & simulasi gudang' }],
  },
  twitter: { card: 'summary_large_image', title: 'Leca — Cost model, layout & simulasi gudang', images: ['/og-leca.jpg'] },
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
            <a href="#beranda" className="ld-link">Beranda</a>
            <a href="#kontak" className="ld-link">Contact</a>
            <a href={masuk ? '/' : '/login'} className="ld-masuk">{masuk ? 'Buka Leca' : 'Login'}</a>
            <MenuHp masuk={masuk} />
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
              <a href="#tiga-d" className="ld-baru"><span>Baru</span>Simulasi gudang 3D &amp; mode jelajah</a>
            </div>
            <KartuContoh />
          </div>
        </section>

        {/* ---------- yang bisa dikerjakan */}
        <section className="ld-bagian" aria-labelledby="bisa">
          <div className="ld-wrap">
            <h2 id="bisa">Dari volume customer sampai quotation</h2>
            <p className="ld-lead">Semua yang biasanya tersebar di belasan sheet Excel, kini saling terhubung. Ubah satu angka, seluruh hitungan ikut menyesuaikan.</p>
            <div className="ld-kemampuan ld-geser">
              {KEMAMPUAN.map(k => (
                <article key={k.judul}>
                  <Ikon jenis={k.ikon} />
                  <h3>{k.judul}</h3>
                  <p>{k.isi}</p>
                </article>
              ))}
            </div>
            <p className="ld-geser-hint" aria-hidden="true">Geser ke samping untuk melihat lainnya</p>
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
              <p className="ld-lead">Tarik area rak, dan baris, lorong, serta bay terbentuk otomatis menghindari kolom, office, dan ramp. Geser baris rak dengan presisi, lihat hasilnya di 3D, lalu jalankan simulasi operasi harian.</p>
              <ul className="ld-cek">
                <li>Lebar lorong pas sesuai isian, sisa ruang terlihat jelas</li>
                <li>Kekuatan rak &amp; lantai dicek per level dan per jenis palet</li>
                <li>Potongan rak, ekspor PNG/PDF A3, dan simulasi 2D/3D</li>
              </ul>
            </div>
            <DenahMini />
          </div>
        </section>

        {/* ---------- sorotan 3D & mode jelajah */}
        <section className="ld-bagian ld-gelap" id="tiga-d" aria-labelledby="tiga-d-judul">
          <div className="ld-wrap">
            <h2 id="tiga-d-judul">Lihat, jalankan, dan jelajahi gudang Anda dalam 3D</h2>
            <p className="ld-lead terang">Desain dari denah 2D langsung menjadi gudang 3D lengkap dengan rak, palet, truk, MHE, dan operator. Jalankan operasi harian untuk menguji kapasitas, atau masuk sendiri ke lorongnya.</p>
            <Pamer3D />
          </div>
        </section>

        {/* ---------- kelebihan */}
        <section className="ld-bagian ld-kertas" aria-labelledby="kenapa">
          <div className="ld-wrap">
            <h2 id="kenapa">Kenapa tim solution design memakai Leca</h2>
            <div className="ld-kelebihan ld-geser">
              {KELEBIHAN.map(k => (
                <div key={k.judul}><b>{k.judul}</b><p>{k.isi}</p></div>
              ))}
            </div>
            <p className="ld-geser-hint" aria-hidden="true">Geser ke samping untuk melihat lainnya</p>
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

      {/* bilah aksi HP */}
      <div className="ld-bawah" role="navigation" aria-label="Aksi cepat">
        <a href="https://wa.me/6288291919234" target="_blank" rel="noopener noreferrer" className="ld-tombol garis gelap">WhatsApp</a>
        <a href={masuk ? '/' : '/login'} className="ld-tombol utama">{masuk ? 'Buka Leca' : 'Login'}</a>
      </div>

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
  { ikon: 'denah', judul: 'Warehouse planning & 3D', isi: 'Kapasitas palet, level rak, kekuatan lantai, denah 2D berskala sebenarnya, gudang 3D, simulasi operasi, dan mode jelajah.' },
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

/** Latar hero: denah gudang bergaya blueprint dari DENAH (hasil mesin layout, skala 10 px/m), tergambar saat halaman dibuka. */
function DenahLatar() {
  const S = 10, X0 = 690, Y0 = 200, { L, W } = DENAH;
  const px = (x: number) => X0 + x * S, pz = (z: number) => Y0 + z * S;
  const lor = DENAH.lorong.find(l => l[0] === 'lorong')!;
  return (
    <svg className="ld-denah" viewBox="0 0 1440 720" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <defs>
        <pattern id="ldkisi" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0v20" fill="none" stroke="currentColor" strokeWidth=".5" opacity=".35" /></pattern>
      </defs>
      <rect width="1440" height="720" fill="url(#ldkisi)" />
      <rect x={px(0)} y={pz(0)} width={L * S} height={W * S} className="ld-dinding" />
      {[DENAH.stagingIn, DENAH.stagingOut].map((b, i) => <rect key={i} x={px(b[0])} y={pz(b[1])} width={b[2] * S} height={b[3] * S} className="ld-zona" />)}
      <rect x={px(DENAH.jalur[0])} y={pz(0)} width={DENAH.jalur[2] * S} height={W * S} className="ld-jalur" />
      {DENAH.rak.map(([x, z, w, d, h], i) => (
        <g key={i} className="ld-baris" style={{ animationDelay: `${0.15 + i * 0.07}s` }}>
          <rect x={px(x)} y={pz(z)} width={w * S} height={d * S} />
          {Array.from({ length: Math.round(w / DENAH.bayW) - 1 }, (_, b) => <line key={b} x1={px(x + (b + 1) * DENAH.bayW)} x2={px(x + (b + 1) * DENAH.bayW)} y1={pz(z)} y2={pz(z + d)} className="ld-bay" />)}
          <line x1={px(x)} x2={px(x + w)} y1={pz(h === 1 ? z + d : z)} y2={pz(h === 1 ? z + d : z)} className="ld-beam" />
        </g>
      ))}
      {DENAH.kolom.map(([x, z], i) => <rect key={i} x={px(x) - 2.5} y={pz(z) - 2.5} width="5" height="5" className="ld-kolom" />)}
      <g className="ld-ukur"><line x1={px(0)} x2={px(L)} y1={pz(0) - 24} y2={pz(0) - 24} /><text x={px(L / 2)} y={pz(0) - 32} textAnchor="middle">{L} m</text></g>
      <g className="ld-ukur"><line x1={px(L) + 22} x2={px(L) + 22} y1={pz(0)} y2={pz(W)} /><text x={px(L) + 30} y={pz(W / 2)} transform={`rotate(90 ${px(L) + 30} ${pz(W / 2)})`} textAnchor="middle">{W} m</text></g>
      <g className="ld-ukur ungu"><line x1={px(60)} x2={px(60)} y1={pz(lor[1])} y2={pz(lor[2])} /><text x={px(60) + 6} y={pz((lor[1] + lor[2]) / 2) + 5}>3,5 m</text></g>
    </svg>
  );
}

/** Cuplikan editor denah: potongan dari DENAH yang sama (skala 12 px/m) — baris back-to-back terpilih + celah lorong. */
function DenahMini() {
  const S = 12, A = 41, B = 23.4;   // area tampil: 41 × 23,4 m dari sudut dock
  const px = (x: number) => 10 + x * S, pz = (z: number) => 10 + z * S;
  const pilih = [3, 4];            // pasangan back-to-back di garis kolom Z = 12 m
  const rak = DENAH.rak.filter(r => r[1] + r[3] <= B);
  const p0 = DENAH.rak[pilih[0]], p1 = DENAH.rak[pilih[1]], sebelum = DENAH.rak[pilih[0] - 1], sesudah = DENAH.rak[pilih[1] + 1];
  const garis = (z0: number, z1: number, x: number, kelas: string, teks: string) => (
    <g className={kelas}><line x1={px(x)} x2={px(x)} y1={pz(z0)} y2={pz(z1)} /><text x={px(x) + 6} y={pz((z0 + z1) / 2) + 4}>{teks}</text></g>);
  return (
    <figure className="ld-mini" aria-label="Cuplikan editor denah gudang Leca (skala sebenarnya)">
      <svg viewBox={`0 0 ${A * S + 10} ${B * S + 20}`}>
        <rect x={px(0)} y={pz(0)} width={A * S + 20} height={B * S + 20} className="m-dinding" />
        <rect x={px(DENAH.stagingIn[0])} y={pz(DENAH.stagingIn[1])} width={DENAH.stagingIn[2] * S} height={DENAH.stagingIn[3] * S} className="m-staging" />
        <text x={px(3.9)} y={pz(9)} transform={`rotate(-90 ${px(3.9)} ${pz(9)})`} textAnchor="middle">Staging inbound</text>
        <rect x={px(DENAH.jalur[0])} y={pz(0)} width={DENAH.jalur[2] * S} height={B * S + 20} className="m-jalur" />
        <text x={px(9.6)} y={pz(16)} transform={`rotate(-90 ${px(9.6)} ${pz(16)})`} textAnchor="middle" className="m-jalur-t">Jalur utama 4 m</text>
        {rak.map(([x, z, , d, h], i) => { const w = A - x + 1; const nb = Math.ceil(w / DENAH.bayW); return (
          <g key={i} className={pilih.includes(i) ? 'm-pilih' : undefined}>
            <rect x={px(x)} y={pz(z)} width={w * S} height={d * S} className="m-rak" />
            {Array.from({ length: nb }, (_, k) => <line key={k} x1={px(x + (k + 1) * DENAH.bayW)} x2={px(x + (k + 1) * DENAH.bayW)} y1={pz(z)} y2={pz(z + d)} className="m-bay" />)}
            <line x1={px(x)} x2={px(x + w)} y1={pz(h === 1 ? z + d : z)} y2={pz(h === 1 ? z + d : z)} className="m-beam" />
          </g>); })}
        {DENAH.kolom.filter(([x, z]) => x <= A + 0.5 && z <= B + 0.5).map(([x, z], i) => <rect key={i} x={px(x - 0.2)} y={pz(z - 0.2)} width={0.4 * S} height={0.4 * S} className="m-kolom" />)}
        {garis(sebelum[1] + sebelum[3], p0[1], 21, 'm-ukur oranye', '3,5 m')}
        {garis(p1[1] + p1[3], sesudah[1], 21, 'm-ukur oranye', '3,5 m')}
        {garis(DENAH.rak[0][1] + DENAH.rak[0][3], DENAH.rak[1][1], 33, 'm-ukur', '3,5 m')}
        <path d={`M${px(0) - 6} ${pz(3)} l6 3 -6 3z M${px(0) - 6} ${pz(10)} l6 3 -6 3z`} className="m-dock" />
      </svg>
      <figcaption><span className="m-cmd">Perintah › M</span><span className="m-ket">Skala sebenarnya · rak 1,0 m · lorong 3,5 m · kolom di celah back-to-back</span><span className="m-st">ORTHO</span><span className="m-st on">OSNAP</span></figcaption>
    </figure>
  );
}
