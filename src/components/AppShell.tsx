'use client';
import { PilihSatuanPanjang } from '@/lib/satuanPanjang';
import Link from 'next/link';
import LecaMark from './LecaMark';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { ROLE_LABEL, TIM_TENDER, type AppRole } from '@/lib/format';
import { PRICE_PAGES } from '@/lib/masterTabs';
import { KATEGORI_BISNIS } from '@/lib/kategoriBisnis';
import { BAHASA, useBahasa, type Bahasa } from '@/lib/i18n';
import { useBrandingSaya } from './BrandingProfil';

type Item = { href: string; label: string; roles: AppRole[] | 'semua'; pisah?: boolean; grup?: string; segera?: boolean };
/** Penguji boleh membuat & membuka project miliknya sendiri (dan yang dibagikan ke mereka). */
const TIM_PENGUJI: AppRole[] = [...TIM_TENDER, 'penguji'];
const MENU: { id: string; label: string; item: Item[] }[] = [
  { id: 'dashboard', label: 'Dashboard', item: [
    { href: '/beranda', label: 'Logistics Opportunity Radar', roles: 'semua' },
    { href: '/trend-bisnis', label: 'Business Trend Intelligence', roles: TIM_TENDER },
    { href: '/', label: 'Summary', roles: TIM_TENDER, pisah: true },
    { href: '/status', label: 'Project Status', roles: TIM_TENDER },
    { href: '/analisis', label: 'Project Analysis', roles: TIM_TENDER },
    { href: '/heatmap', label: 'Opportunity Control Tower', roles: TIM_TENDER },
  ] },
  { id: 'tender', label: 'Logistics Tender', item: [
    { href: '/tender/baru', label: 'New Tender', roles: TIM_PENGUJI, grup: 'Warehouse Tender' },
    { href: '/tender?grup=draft', label: 'Draft Tender', roles: TIM_PENGUJI, grup: 'Warehouse Tender' },
    { href: '/perbandingan', label: 'Tender Comparison', roles: TIM_TENDER, grup: 'Warehouse Tender' },
    { href: '/riwayat', label: 'Tender History', roles: TIM_PENGUJI, grup: 'Warehouse Tender' },
    { href: '/approval-quotation', label: 'Approval quotation', roles: ['admin', 'manager'], grup: 'Warehouse Tender' },
    { href: '/implementasi', label: 'Implementation / Project Charter', roles: 'semua', grup: 'Warehouse Tender' },
    { href: '/transport', label: 'Transportation Tender', roles: TIM_TENDER, grup: 'Transport & Intermodal' },
    { href: '/intermodal', label: 'Intermodal Tender', roles: TIM_TENDER, grup: 'Transport & Intermodal' },
    { href: '/market-price', label: 'Market Price (semua moda)', roles: 'semua', grup: 'Transport & Intermodal' },
    { href: '/pipeline', label: 'Tender Pipeline', roles: TIM_TENDER, grup: 'Monitoring' },
    { href: '/tracking', label: 'Tender Status & Tracking', roles: TIM_TENDER, grup: 'Monitoring' },
    { href: '/analytics', label: 'Tender Performance Analytics', roles: TIM_TENDER, grup: 'Monitoring' },
  ] },
  { id: 'simulasi', label: 'Simulasi Warehouse', item: [
    { href: '/simulasi', label: 'Desain gudang 2D ⇄ 3D', roles: 'semua' },
    { href: '/simulasi/game', label: 'Leca Game (simulasi operasi)', roles: 'semua' },
  ] },
  { id: 'price', label: 'Price Inquiry', item: [...PRICE_PAGES.map(p => ({ href: `/price/${p.slug}`, label: p.label, roles: 'semua' as const, pisah: p.slug === 'hr' || p.slug === 'semua' })),
    { href: '/price/perbandingan', label: 'Price Comparison (vendor)', roles: 'semua' as const, pisah: true }] },
  { id: 'prod', label: 'Productivity', item: [
    ...KATEGORI_BISNIS.map(k => ({ href: `/produktivitas?kategori=${encodeURIComponent(k.nama)}`, label: k.nama, roles: 'semua' as const, grup: 'Business category' })),
    { href: '/produktivitas/referensi-uom', label: 'UoM & weight class reference', roles: 'semua', grup: 'Reference' },
    { href: '/produktivitas/semua', label: 'All productivity data', roles: 'semua', grup: 'Reference' },
    { href: '/produktivitas/kalender', label: 'Holiday calendar', roles: 'semua', grup: 'Reference' },
  ] },
];
const AKUN: Item[] = [
  { href: '/admin', label: 'Pengguna & role', roles: ['admin'] },
  { href: '/admin/approval', label: 'Approval akun', roles: ['admin'] },
  { href: '/master', label: 'Master data (kalender, keuangan, margin, T&C)', roles: 'semua' },
  { href: '/akun', label: 'Profil & password', roles: 'semua' },
  { href: '/akun/tim', label: 'Tim & berbagi project', roles: 'semua' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { profile } = useProfile();
  const { bahasa, setBahasa, t } = useBahasa();
  const [buka, setBuka] = useState<string | null>(null);
  // Hover: buka langsung, tutup dengan jeda agar kursor sempat pindah ke menu
  const tutupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;
  const masuk = (id: string) => { if (tutupTimer.current) clearTimeout(tutupTimer.current); if (hover()) setBuka(id); };
  const keluarMenu = () => { if (!hover()) return; if (tutupTimer.current) clearTimeout(tutupTimer.current); tutupTimer.current = setTimeout(() => setBuka(null), 450); };
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => { setBuka(null); setLaci(false); }, [path]);
  // Menu HP: panel geser (laci) dengan akordeon per menu
  const [laci, setLaci] = useState(false);
  const [grupLaci, setGrupLaci] = useState<string | null>(null);
  useEffect(() => {
    document.body.classList.toggle('laci-buka', laci);
    if (!laci) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setLaci(false); };
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('laci-buka'); };
  }, [laci]);
  useEffect(() => {
    const tutup = (e: MouseEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) setBuka(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBuka(null); };
    document.addEventListener('mousedown', tutup); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', tutup); document.removeEventListener('keydown', esc); };
  }, []);

  const boleh = (i: Item) => !profile || i.roles === 'semua' || profile.role === 'admin' || !!profile.is_master || i.roles.includes(profile.role);
  const aktif = (href: string) => {
    const dasar = href.split('?')[0];
    if (dasar === '/') return path === '/';
    if (dasar === '/produktivitas') return path === '/produktivitas';
    if (dasar === '/admin') return path === '/admin';
    if (dasar === '/simulasi') return path === '/simulasi';
    if (dasar === '/tender') return path === '/tender' || (/^\/tender\/(?!baru)/.test(path));
    return path === dasar || path.startsWith(dasar + '/');
  };

  const brand = useBrandingSaya(profile);
  useEffect(() => { brand.muat(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sel tabel yang terpotong (…): tampilkan teks lengkap saat disorot, klik untuk membuka / menutup
  useEffect(() => {
    const sel = (e: Event) => (e.target as HTMLElement | null)?.closest?.('.main td') as HTMLTableCellElement | null;
    const sorot = (e: Event) => {
      const td = sel(e); if (!td || td.classList.contains('buka')) return;
      const terpotong = td.scrollWidth > td.clientWidth + 1;
      td.classList.toggle('potong-ada', terpotong);
      if (terpotong && !td.title) td.title = (td.innerText || '').trim().slice(0, 600);
    };
    const klik = (e: Event) => {
      const t = e.target as HTMLElement; if (t.closest('a, button, input, select, textarea, label, summary')) return;
      const td = sel(e); if (!td) return;
      if (td.classList.contains('buka')) td.classList.remove('buka');
      else if (td.classList.contains('potong-ada') || td.scrollWidth > td.clientWidth + 1) td.classList.add('buka');
    };
    document.addEventListener('mouseover', sorot); document.addEventListener('click', klik);
    return () => { document.removeEventListener('mouseover', sorot); document.removeEventListener('click', klik); };
  }, []);
  // Jumlah akun menunggu persetujuan (badge untuk Super Admin)
  const [nPending, setNPending] = useState(0);
  useEffect(() => {
    if (!profile?.is_master) return;
    supabaseBrowser().from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }: { count: number | null }) => setNPending(count ?? 0));
  }, [profile?.is_master, path]);

  async function keluar() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
  }

  const namaAkun = profile?.full_name || profile?.email?.split('@')[0] || '…';
  const peranAkun = profile ? (profile.is_master ? 'Super Admin' : ROLE_LABEL[profile.role]) : '';
  const menuAktif = !profile || profile.status === undefined || profile.status === 'aktif';
  const itemLaci = (isi: Item[]) => isi.map((i, k) => (
    <Fragment key={i.href}>
      {i.grup && i.grup !== isi[k - 1]?.grup && <div className="laci-sub">{t(i.grup)}</div>}
      {i.segera ? <span className="laci-item segera">{t(i.label)} <span className="pill info small">segera</span></span>
        : <Link href={i.href} className={`laci-item${aktif(i.href) ? ' on' : ''}`} onClick={() => setLaci(false)}>{t(i.label)}
          {i.href === '/admin/approval' && nPending > 0 && <span className="pill warn small" style={{ marginLeft: 6 }}>{nPending}</span>}</Link>}
    </Fragment>));

  const Dropdown = ({ id, label, item, kanan }: { id: string; label: string; item: Item[]; kanan?: boolean }) => {
    const isi = item.filter(boleh);
    if (!isi.length) return null;
    const on = isi.some(i => aktif(i.href));
    return (
      <div className={`dd${buka === id ? ' open' : ''}`} onMouseEnter={() => masuk(id)} onMouseLeave={keluarMenu}>
        <button className={`ddbtn${on ? ' on' : ''}`} aria-haspopup="true" aria-expanded={buka === id} onClick={() => {
          if (tutupTimer.current) clearTimeout(tutupTimer.current);
          // Desktop: klik selalu membuka (tidak menutup menu yang baru terbuka oleh hover); layar sentuh: buka/tutup
          setBuka(hover() ? id : buka === id ? null : id);
        }}>
          <span className="ddlabel" title={t(label)}>{t(label)}</span> <span aria-hidden="true" className="caret">▾</span>
        </button>
        {buka === id && (
          <div className={`ddmenu${kanan ? ' kanan' : ''}`} role="menu">
            {isi.map((i, k) => (
              <Fragment key={i.href}>
                {i.grup && i.grup !== isi[k - 1]?.grup && <div className={`ddgrup${k > 0 ? ' pisah' : ''}`} role="presentation">{t(i.grup)}</div>}
                {i.segera ? <span role="menuitem" aria-disabled="true" className={`ddsegera${i.grup ? ' bergrup' : ''}`}>{t(i.label)} <span className="pill info small">segera</span></span> : <Link role="menuitem" href={i.href} className={`${aktif(i.href) ? 'on' : ''}${i.pisah ? ' pisah' : ''}${i.grup ? ' bergrup' : ''}`}>{t(i.label)}
                  {i.href === '/admin/approval' && nPending > 0 && <span className="pill warn small" style={{ marginLeft: 6 }}>{nPending}</span>}</Link>}
              </Fragment>))}
            {kanan && <button role="menuitem" className="ddkeluar" onClick={keluar}>{t('Keluar')}</button>}
          </div>)}
      </div>);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/beranda" className="brand" aria-label="Leca — beranda"><LecaMark /><span className="brand-nama">Leca</span><span className="brand-oleh">by esapanghegar</span></Link>
        <nav aria-label="Menu utama" ref={navRef} className="topnav">
          {(!profile || profile.status === undefined || profile.status === 'aktif') && MENU.map(m => <Fragment key={m.id}>{Dropdown(m)}</Fragment>)}
          <div className="sela" />
          <label className="bahasa-pilih" title={t('Bahasa')}><span aria-hidden="true">🌐</span>
            <select aria-label={t('Bahasa')} value={bahasa} onChange={e => setBahasa(e.target.value as Bahasa)}>
              {BAHASA.map(b => <option key={b.v} value={b.v} title={b.l}>{b.short}</option>)}</select></label>
          <PilihSatuanPanjang className="bahasa-pilih" />
          {Dropdown({ id: 'akun', kanan: true, item: profile && profile.status && profile.status !== 'aktif' ? [] : AKUN,
            label: `${profile?.full_name || profile?.email?.split('@')[0] || '…'}${profile ? ` · ${profile.is_master ? 'Super Admin' : ROLE_LABEL[profile.role]}` : ''}${nPending ? ` (${nPending})` : ''}` })}
        </nav>
        <button type="button" className="burger-app" aria-label={laci ? t('Tutup menu') : t('Buka menu')} aria-expanded={laci} aria-controls="laci-app" onClick={() => setLaci(v => !v)}>
          <span /><span /><span />
        </button>
      </header>
      {laci && (
        <div className="laci-latar" onClick={() => setLaci(false)}>
          <aside id="laci-app" className="laci" role="dialog" aria-modal="true" aria-label={t('Menu')} onClick={e => e.stopPropagation()}>
            <div className="laci-kepala">
              <div className="laci-akun-nama"><b>{namaAkun}</b>{peranAkun && <span>{peranAkun}{nPending ? ` · ${nPending} menunggu ACC` : ''}</span>}</div>
              <button type="button" className="laci-tutup" aria-label={t('Tutup menu')} onClick={() => setLaci(false)}>✕</button>
            </div>
            {menuAktif && <nav className="laci-menu" aria-label={t('Menu utama')}>
              {MENU.map(m => {
                const isi = m.item.filter(boleh); if (!isi.length) return null;
                const on = isi.some(i => aktif(i.href));
                const terbuka = grupLaci === null ? on : grupLaci === m.id;
                return (
                  <section key={m.id} className="laci-grup">
                    <button type="button" className={`laci-grup-btn${on ? ' on' : ''}`} aria-expanded={terbuka} onClick={() => setGrupLaci(terbuka ? '' : m.id)}>
                      <span>{t(m.label)}</span><span aria-hidden="true" className={`laci-caret${terbuka ? ' buka' : ''}`}>▾</span>
                    </button>
                    {terbuka && <div className="laci-isi">{itemLaci(isi)}</div>}
                  </section>);
              })}
            </nav>}
            <div className="laci-setelan">
              <label><span>{t('Bahasa')}</span>
                <select aria-label={t('Bahasa')} value={bahasa} onChange={e => setBahasa(e.target.value as Bahasa)}>
                  {BAHASA.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}</select></label>
              <div className="laci-satuan-wadah"><span>{t('Satuan panjang')}</span><PilihSatuanPanjang className="laci-satuan" /></div>
            </div>
            <div className="laci-akun">
              {menuAktif && itemLaci(AKUN.filter(boleh))}
              <button type="button" className="laci-keluar" onClick={keluar}>{t('Keluar')}</button>
            </div>
          </aside>
        </div>)}
      {brand.wajib && brand.siap && !brand.lengkap && path !== '/akun' && <div className="notice small" role="alert" style={{ margin: '10px 24px 0' }}>
        <b>Lengkapi profil:</b> unggah {[!brand.logo && 'logo perusahaan', !brand.ttd && 'tanda tangan'].filter(Boolean).join(' & ')} Anda — wajib sebelum membuat quotation. <Link href="/akun#branding">Unggah sekarang →</Link></div>}
      {profile && profile.role === 'penguji' && !profile.is_master && profile.status === 'aktif' && <div className="notice small" role="status" style={{ margin: '10px 24px 0' }}>
        Akun <b>Penguji (beta)</b>: Anda bisa membuat project sendiri dan membuka project yang dibagikan ke Anda. Data kerja tim lain (harga, gudang, kontak customer) tidak ditampilkan. Hubungi admin bila perlu akses tambahan — WhatsApp 0882-9191-9234.</div>}
      <main className="main">{profile && (profile.status === 'pending' || profile.status === 'ditolak') ? (
        <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
          <h2>{profile.status === 'pending' ? 'Menunggu persetujuan' : 'Pendaftaran ditolak'}</h2>
          {profile.status === 'pending'
            ? <p>Akun <b>{profile.email}</b> sudah terdaftar dan sedang menunggu persetujuan (ACC) Admin. Setelah disetujui dan diberi role, menu Leca akan terbuka — muat ulang halaman ini nanti. Terima kasih<br />CP : 088291919234 / Email : Niuleca@gmail.com</p>
            : <p>Pendaftaran akun <b>{profile.email}</b> tidak disetujui. Hubungi Super Admin bila ini keliru.</p>}
          <div className="row"><button className="ghost" onClick={() => location.reload()}>Muat ulang</button><button onClick={keluar}>Keluar</button></div>
        </div>) : children}</main>
      <footer className="app-foot"><span><b>Leca</b> · {t('cost model, tender & quotation gudang')}</span><span>{t('Dibuat oleh')} <b>esapanghegar</b> · © {new Date().getFullYear()}</span></footer>
    </div>
  );
}
