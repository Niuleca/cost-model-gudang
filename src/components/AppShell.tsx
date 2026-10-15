'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { ROLE_LABEL, TIM_TENDER } from '@/lib/format';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { profile } = useProfile();
  const on = (p: string) => (p === '/' ? path === '/' : path.startsWith(p)) ? 'on' : '';
  const timTender = profile ? TIM_TENDER.includes(profile.role) : false;

  async function keluar() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Cost Model<br />Gudang</div>
        <nav>
          {timTender && <Link className={on('/')} href="/">Tender</Link>}
          {timTender && <Link className={on('/tender/baru')} href="/tender/baru">Tender baru</Link>}
          <Link className={on('/master')} href="/master">Master data</Link>
          {profile?.role === 'admin' && <Link className={on('/admin')} href="/admin">Pengguna</Link>}
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
