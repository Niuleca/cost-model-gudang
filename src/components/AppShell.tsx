'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { ROLE_LABEL, TIM_TENDER, type AppRole } from '@/lib/format';
import { PRICE_PAGES, PROD_PAGES } from '@/lib/masterTabs';

type Item = { href: string; label: string; roles: AppRole[] | 'semua'; pisah?: boolean };
const MENU: { id: string; label: string; item: Item[] }[] = [
  { id: 'dashboard', label: 'Dashboard', item: [
    { href: '/', label: 'Ringkasan', roles: TIM_TENDER },
    { href: '/status', label: 'Status Project', roles: TIM_TENDER },
    { href: '/heatmap', label: 'Heatmap penyelesaian, backlog & waiting', roles: TIM_TENDER },
  ] },
  { id: 'tender', label: 'Tender', item: [
    { href: '/tender/baru', label: 'New Tender', roles: TIM_TENDER },
    { href: '/tender?grup=draft', label: 'Draft Tender', roles: TIM_TENDER },
    { href: '/perbandingan', label: 'Comparation Tender', roles: TIM_TENDER },
    { href: '/riwayat', label: 'Riwayat Tender', roles: TIM_TENDER },
    { href: '/implementasi', label: 'Implementation / Project Charter', roles: 'semua' },
  ] },
  { id: 'price', label: 'Price Inquiry', item: PRICE_PAGES.map(p => ({ href: `/price/${p.slug}`, label: p.label, roles: 'semua' as const, pisah: p.slug === 'hr' })) },
  { id: 'prod', label: 'Productivity', item: [
    ...PROD_PAGES.map(p => ({ href: `/produktivitas/${p.slug}`, label: p.label, roles: 'semua' as const, pisah: false })),
    { href: '/produktivitas', label: 'Semua UoM', roles: 'semua' },
  ] },
];
const AKUN: Item[] = [
  { href: '/admin', label: 'Pengguna & role', roles: ['admin'] },
  { href: '/master', label: 'Master data (kalender, keuangan, margin, T&C)', roles: 'semua' },
  { href: '/akun', label: 'Ganti password', roles: 'semua' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { profile } = useProfile();
  const [buka, setBuka] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => { setBuka(null); }, [path]);
  useEffect(() => {
    const tutup = (e: MouseEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) setBuka(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBuka(null); };
    document.addEventListener('mousedown', tutup); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', tutup); document.removeEventListener('keydown', esc); };
  }, []);

  const boleh = (i: Item) => !profile || i.roles === 'semua' || profile.role === 'admin' || i.roles.includes(profile.role);
  const aktif = (href: string) => {
    const dasar = href.split('?')[0];
    if (dasar === '/') return path === '/';
    if (dasar === '/produktivitas') return path === '/produktivitas';
    if (dasar === '/tender') return path === '/tender' || (/^\/tender\/(?!baru)/.test(path));
    return path === dasar || path.startsWith(dasar + '/');
  };

  async function keluar() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
  }

  const Dropdown = ({ id, label, item, kanan }: { id: string; label: string; item: Item[]; kanan?: boolean }) => {
    const isi = item.filter(boleh);
    if (!isi.length) return null;
    const on = isi.some(i => aktif(i.href));
    return (
      <div className={`dd${buka === id ? ' open' : ''}`} onMouseEnter={() => window.matchMedia('(hover: hover)').matches && setBuka(id)} onMouseLeave={() => window.matchMedia('(hover: hover)').matches && setBuka(null)}>
        <button className={`ddbtn${on ? ' on' : ''}`} aria-haspopup="true" aria-expanded={buka === id} onClick={() => setBuka(buka === id ? null : id)}>
          {label} <span aria-hidden="true" className="caret">▾</span>
        </button>
        {buka === id && (
          <div className={`ddmenu${kanan ? ' kanan' : ''}`} role="menu">
            {isi.map(i => (
              <Link key={i.href} role="menuitem" href={i.href} className={`${aktif(i.href) ? 'on' : ''}${i.pisah ? ' pisah' : ''}`}>{i.label}</Link>))}
            {kanan && <button role="menuitem" className="ddkeluar" onClick={keluar}>Keluar</button>}
          </div>)}
      </div>);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">Cost Model <span>Gudang</span></Link>
        <nav aria-label="Menu utama" ref={navRef} className="topnav">
          {MENU.map(m => <Dropdown key={m.id} {...m} />)}
          <div className="sela" />
          <Dropdown id="akun" kanan item={AKUN}
            label={`${profile?.full_name || profile?.email?.split('@')[0] || '…'}${profile ? ` · ${ROLE_LABEL[profile.role]}` : ''}`} />
        </nav>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
