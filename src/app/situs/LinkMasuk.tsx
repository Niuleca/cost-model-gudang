'use client';
// Tombol Login / Buka Leca: status login dibaca di browser supaya halaman depan bisa statis (cepat, dari CDN).
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export function useSudahMasuk() {
  const [masuk, setMasuk] = useState(false);
  useEffect(() => { supabaseBrowser().auth.getSession().then(({ data }: { data: { session: unknown } }) => setMasuk(!!data.session)).catch(() => {}); }, []);
  return masuk;
}
export default function LinkMasuk({ className, tamu = 'Login' }: { className: string; tamu?: string }) {
  const masuk = useSudahMasuk();
  return <a href={masuk ? '/' : '/login'} className={className}>{masuk ? 'Buka Leca' : tamu}</a>;
}
