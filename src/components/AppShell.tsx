'use client';
import Link from 'next/link';
import LecaMark from './LecaMark';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { ROLE_LABEL, TIM_TENDER, type AppRole } from '@/lib/format';
import { PRICE_PAGES, PROD_PAGES } from '@/lib/masterTabs';
import { BAHASA, useBahasa, type Bahasa } from '@/lib/i18n';
import { useBrandingSaya } from './BrandingProfil';

type Item = { href: string; label: string; roles: AppRole[] | 'semua'; pisah?: boolean };
const MENU: { id: string; label: string; item: Item[] }[] = [
  { id: 'dashboard', label: 'Dashboard', item: [
    { href: '/beranda', label: 'Beranda · Radar tender', roles: 'semua' },
    { href: '/', label: 'Ringkasan', roles: TIM_TENDER },
    { href: '/status', label: 'Status Project', roles: TIM_TENDER },
    { href: '/heatmap', label: 'Heatmap penyelesaian, backlog & waiting', roles: TIM_TENDER },
  ] },
  { id: 'tender', label: 'Tender', item: [
    { href: '/tender/baru', label: 'New Tender', roles: TIM_TENDER },
    { href: '/tender?grup=draft', label: 'Draft Tender', roles: TIM_TENDER },
    { href: '/perbandingan', label: 'Comparation Tender', roles: TIM_TENDER },
    { href: '/riwayat', label: 'Riwayat Tender', roles: TIM_TENDER },
    { href: '/approval-quotation', label: 'Approval quotation', roles: ['admin', 'manager'] },
    { href: '/implementasi', label: 'Implementation / Project Charter', roles: 'semua' },
  ] },
  { id: 'price', label: 'Price Inquiry', item: [...PRICE_PAGES.map(p => ({ href: `/price/${p.slug}`, label: p.label, roles: 'semua' as const, pisah: p.slug === 'hr' || p.slug === 'semua' })),
    { href: '/price/perbandingan', label: 'Comparation Price (vendor)', roles: 'semua' as const, pisah: true }] },
  { id: 'prod', label: 'Productivity', item: [
    ...PROD_PAGES.map(p => ({ href: `/produktivitas/${p.slug}`, label: p.label, roles: 'semua' as const, pisah: false })),
    { href: '/produktivitas', label: 'Semua UoM', roles: 'semua' },
  ] },
];
const AKUN: Item[] = [
  { href: '/admin', label: 'Pengguna & role', roles: ['admin'] },
  { href: '/admin/approval', label: 'Approval akun', roles: ['admin'] },
  { href: '/master', label: 'Master data (kalender, keuangan, margin, T&C)', roles: 'semua' },
  { href: '/akun', label: 'Profil & password', roles: 'semua' },
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

  useEffect(() => { setBuka(null); }, [path]);
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
    if (dasar === '/tender') return path === '/tender' || (/^\/tender\/(?!baru)/.test(path));
    return path === dasar || path.startsWith(dasar + '/');
  };

  const brand = useBrandingSaya(profile);
  useEffect(() => { brand.muat(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const Dropdown = ({ id, label, item, kanan }: { id: string; label: string; item: Item[]; kanan?: boolean }) => {
    const isi = item.filter(boleh);
    if (!isi.length) return null;
    const on = isi.some(i => aktif(i.href));
    return (
      <div className={`dd${buka === id ? ' open' : ''}`} onMouseEnter={() => masuk(id)} onMouseLeave={keluarMenu}>
        <button className={`ddbtn${on ? ' on' : ''}`} aria-haspopup="true" aria-expanded={buka === id} onClick={() => {
          if (tutupTimer.current) clearTimeout(tutupTimer.current);
          if (id === 'dashboard') { setBuka(null); router.push('/beranda'); return; }
          // Desktop: klik selalu membuka (tidak menutup menu yang baru terbuka oleh hover); layar sentuh: buka/tutup
          setBuka(hover() ? id : buka === id ? null : id);
        }}>
          {t(label)} <span aria-hidden="true" className="caret">▾</span>
        </button>
        {buka === id && (
          <div className={`ddmenu${kanan ? ' kanan' : ''}`} role="menu">
            {isi.map(i => (
              <Link key={i.href} role="menuitem" href={i.href} className={`${aktif(i.href) ? 'on' : ''}${i.pisah ? ' pisah' : ''}`}>{t(i.label)}
                {i.href === '/admin/approval' && nPending > 0 && <span className="pill warn small" style={{ marginLeft: 6 }}>{nPending}</span>}</Link>))}
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
              {BAHASA.map(b => <option key={b.v} value={b.v}>{b.short} · {b.l}</option>)}</select></label>
          {Dropdown({ id: 'akun', kanan: true, item: profile && profile.status && profile.status !== 'aktif' ? [] : AKUN,
            label: `${profile?.full_name || profile?.email?.split('@')[0] || '…'}${profile ? ` · ${profile.is_master ? 'Super Admin' : ROLE_LABEL[profile.role]}` : ''}${nPending ? ` (${nPending})` : ''}` })}
        </nav>
      </header>
      {brand.wajib && brand.siap && !brand.lengkap && path !== '/akun' && <div className="notice small" role="alert" style={{ margin: '10px 24px 0' }}>
        <b>Lengkapi profil:</b> unggah {[!brand.logo && 'logo perusahaan', !brand.ttd && 'tanda tangan'].filter(Boolean).join(' & ')} Anda — wajib sebelum membuat quotation. <Link href="/akun#branding">Unggah sekarang →</Link></div>}
      <main className="main">{profile && (profile.status === 'pending' || profile.status === 'ditolak') ? (
        <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
          <h2>{profile.status === 'pending' ? 'Menunggu persetujuan' : 'Pendaftaran ditolak'}</h2>
          {profile.status === 'pending'
            ? <p>Akun <b>{profile.email}</b> sudah terdaftar dan sedang menunggu persetujuan (ACC) Admin. Setelah disetujui dan diberi role, menu Leca akan terbuka — muat ulang halaman ini nanti. Terimakasih<br />CP : 088291919234 / Email : Niuleca@gmail.com</p>
            : <p>Pendaftaran akun <b>{profile.email}</b> tidak disetujui. Hubungi Super Admin bila ini keliru.</p>}
          <div className="row"><button className="ghost" onClick={() => location.reload()}>Muat ulang</button><button onClick={keluar}>Keluar</button></div>
        </div>) : children}</main>
      <footer className="app-foot"><span><b>Leca</b> · {t('cost model, tender & quotation gudang')}</span><span>{t('Dibuat oleh')} <b>esapanghegar</b> · © {new Date().getFullYear()}</span></footer>
    </div>
  );
}
