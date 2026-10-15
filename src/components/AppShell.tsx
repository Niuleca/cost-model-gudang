'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { ROLE_LABEL, TIM_TENDER, type AppRole } from '@/lib/format';

type Item = { href: string; label: string; roles: AppRole[] | 'semua' };
const MENU: { grup: string; item: Item[] }[] = [
  { grup: 'Ringkasan', item: [
    { href: '/', label: 'Dashboard', roles: TIM_TENDER },
    { href: '/status', label: 'Status project', roles: TIM_TENDER },
  ] },
  { grup: 'Solution design', item: [
    { href: '/tender', label: 'Tender & cost model', roles: TIM_TENDER },
    { href: '/tender/baru', label: 'Tender baru', roles: TIM_TENDER },
    { href: '/perbandingan', label: 'Perbandingan harga', roles: TIM_TENDER },
    { href: '/riwayat', label: 'Riwayat', roles: TIM_TENDER },
  ] },
  { grup: 'Eksekusi', item: [
    { href: '/implementasi', label: 'Implementasi', roles: 'semua' },
  ] },
  { grup: 'Input departemen', item: [
    { href: '/procurement', label: 'Procurement', roles: 'semua' },
    { href: '/it', label: 'IT', roles: 'semua' },
    { href: '/produktivitas', label: 'Operations', roles: 'semua' },
    { href: '/hr', label: 'HR · UMK', roles: 'semua' },
    { href: '/master', label: 'Master lainnya', roles: 'semua' },
  ] },
  { grup: 'Akun', item: [
    { href: '/admin', label: 'Pengguna', roles: ['admin'] },
    { href: '/akun', label: 'Ganti password', roles: 'semua' },
  ] },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { profile } = useProfile();
  const on = (p: string) => (p === '/' || p === '/tender' ? path === p || (p === '/tender' && /^\/tender\/(?!baru)/.test(path)) : path.startsWith(p)) ? 'on' : '';

  async function keluar() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Cost Model<br />Gudang</div>
        <nav aria-label="Menu utama">
          {MENU.map(g => {
            const isi = g.item.filter(i => !profile || i.roles === 'semua' || i.roles.includes(profile.role) || profile.role === 'admin');
            if (!isi.length) return null;
            return (
              <div key={g.grup} className="navgrup">
                <span className="navjudul">{g.grup}</span>
                {isi.map(i => <Link key={i.href} className={on(i.href)} href={i.href}>{i.label}</Link>)}
              </div>);
          })}
        </nav>
        <div className="who">
          <span>{profile?.full_name || profile?.email || '…'}</span>
          {profile && <span className="pill" style={{ color: 'var(--floor)' }}>{ROLE_LABEL[profile.role]}</span>}
          <button className="ghost" style={{ color: 'inherit', borderColor: 'currentColor' }} onClick={keluar}>Keluar</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
