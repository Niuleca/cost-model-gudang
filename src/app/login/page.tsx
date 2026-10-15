'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'masuk' | 'daftar' | 'lupa'>('masuk');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nama, setNama] = useState('');
  const [pesan, setPesan] = useState<string | null>(params.get('error') ? 'Link login tidak valid atau kedaluwarsa.' : null);
  const [sibuk, setSibuk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSibuk(true); setPesan(null);
    const sb = supabaseBrowser();
    const redirect = `${window.location.origin}/auth/callback`;
    try {
      if (mode === 'masuk') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(params.get('next') || '/');
        router.refresh();
      } else if (mode === 'daftar') {
        const { error } = await sb.auth.signUp({ email, password, options: { data: { full_name: nama }, emailRedirectTo: redirect } });
        if (error) throw error;
        setPesan('Akun dibuat. Cek email untuk konfirmasi, lalu minta admin mengatur role Anda.');
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${redirect}?next=/akun` });
        if (error) throw error;
        setPesan('Link reset password sudah dikirim ke email Anda.');
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setPesan(m === 'Invalid login credentials' ? 'Email atau password salah.' : m);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="eyebrow">Cost Model Gudang</div>
        <h1>{mode === 'masuk' ? 'Masuk' : mode === 'daftar' ? 'Buat akun' : 'Reset password'}</h1>
        {mode === 'daftar' && (
          <label className="f" htmlFor="nama">Nama lengkap
            <input id="nama" value={nama} onChange={e => setNama(e.target.value)} required />
          </label>
        )}
        <label className="f" htmlFor="email">Email
          <input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        {mode !== 'lupa' && (
          <label className="f" htmlFor="password">Password
            <input id="password" type="password" minLength={8} autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'}
              value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
        )}
        {pesan && <p className="small" role="status">{pesan}</p>}
        <button type="submit" disabled={sibuk}>{sibuk ? 'Memproses…' : mode === 'masuk' ? 'Masuk' : mode === 'daftar' ? 'Buat akun' : 'Kirim link reset'}</button>
        <div className="row small">
          {mode !== 'masuk' && <button type="button" className="ghost" onClick={() => setMode('masuk')}>Sudah punya akun</button>}
          {mode !== 'daftar' && <button type="button" className="ghost" onClick={() => setMode('daftar')}>Buat akun</button>}
          {mode !== 'lupa' && <button type="button" className="ghost" onClick={() => setMode('lupa')}>Lupa password</button>}
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
