'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import LecaMark from '@/components/LecaMark';

const SITUS = 'https://niuleca.com';
const DETIK = 6;

function Isi() {
  const gagal = useSearchParams().get('status') === 'gagal';
  const [sisa, setSisa] = useState(DETIK);
  const tujuan = `${SITUS}/login${gagal ? '' : '?terdaftar=1'}`;
  useEffect(() => {
    if (gagal) return;
    // keluar dulu (sesi dari link konfirmasi) supaya halaman login tampil, lalu pindah ke niuleca.com
    supabaseBrowser().auth.signOut().catch(() => {});
    const t = setInterval(() => setSisa(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [gagal]);
  useEffect(() => { if (!gagal && sisa <= 0) window.location.href = tujuan; }, [sisa, gagal, tujuan]);
  return (
    <div className="login">
      <div className="card terdaftar">
        <div className="login-brand"><LecaMark size={40} /><div><div className="nama">Leca</div><div className="oleh">niuleca.com</div></div></div>
        {gagal ? (<>
          <h1 style={{ fontSize: 22 }}>Link konfirmasi tidak berlaku</h1>
          <p>Link sudah kedaluwarsa atau sudah pernah dipakai. Bila email Anda sudah terkonfirmasi sebelumnya, langsung saja login. Bila belum, daftar ulang dengan email yang sama untuk menerima link baru.</p>
          <a className="btn" href={`${SITUS}/login`}>Ke halaman login niuleca.com</a>
        </>) : (<>
          <div className="terdaftar-cek" aria-hidden="true">✓</div>
          <h1 style={{ fontSize: 22 }}>Anda telah terdaftar</h1>
          <p>Email Anda sudah terkonfirmasi dan akun Anda tercatat di <b>niuleca.com</b>. Akun akan aktif setelah disetujui (ACC) Admin.</p>
          <p className="small muted">Mengarahkan ke halaman login niuleca.com dalam {Math.max(0, sisa)} detik…</p>
          <a className="btn" href={tujuan}>Login sekarang</a>
        </>)}
        <p className="small muted" style={{ marginTop: 4 }}>Butuh bantuan? WhatsApp 0882-9191-9234 · Niuleca@gmail.com</p>
      </div>
    </div>
  );
}

export default function Terdaftar() { return <Suspense><Isi /></Suspense>; }
