'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import LecaMark from '@/components/LecaMark';
import InputPassword from '@/components/InputPassword';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'masuk' | 'daftar' | 'lupa'>(params.get('mode') === 'lupa' ? 'lupa' : 'masuk');
  const [emailIsi, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nama, setNama] = useState('');
  const [pesan, setPesan] = useState<string | null>(params.get('error') === 'reset' ? 'Link reset tidak bisa dipakai — mungkin sudah dipakai, lebih dari 1 jam, atau dibuka di browser lain. Minta link baru di bawah, lalu buka link terbaru saja.' : params.get('error') ? 'Link login tidak valid atau kedaluwarsa.' : params.get('terdaftar') ? 'Akun Anda sudah terdaftar dan email terkonfirmasi. Silakan login setelah akun disetujui (ACC) Admin.' : null);
  const [sibuk, setSibuk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSibuk(true); setPesan(null);
    const sb = supabaseBrowser();
    const redirect = `${window.location.origin}/auth/callback`;
    const email = emailIsi.trim().toLowerCase();   // spasi / huruf besar dari keyboard HP sering membuat login gagal
    try {
      if (mode === 'masuk') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(params.get('next') || '/beranda');
        router.refresh();
      } else if (mode === 'daftar') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: nama }, emailRedirectTo: `${redirect}?next=/auth/terdaftar` } });
        if (error) throw error;
        if (data.session) {
          // konfirmasi email tidak diwajibkan: langsung masuk, lalu menunggu ACC admin
          router.replace('/beranda'); router.refresh();
          return;
        }
        setPesan('Akun dibuat. Buka email Anda dan klik link konfirmasi. Setelah itu akun menunggu persetujuan (ACC) Admin sebelum bisa dipakai. Terima kasih\nCP : 088291919234 / Email : Niuleca@gmail.com');
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${redirect}?next=/auth/password-baru` });
        if (error) {
          setPesan('Email reset password belum bisa dikirim saat ini. Hubungi admin untuk mengatur ulang password Anda: WhatsApp 0882-9191-9234 / Niuleca@gmail.com');
          return;
        }
        setPesan('Link reset sudah dikirim ke email Anda (cek juga folder spam). Buka link TERBARU di browser ini juga, lalu buat password baru. Link berlaku 1 jam dan hanya bisa dipakai sekali.');
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setPesan(pesanAuth(m));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <a href="/" className="login-brand" style={{ color: 'inherit', textDecoration: 'none' }}><LecaMark size={40} /><div><div className="nama">Leca</div><div className="oleh">by esapanghegar</div></div></a>
        <p className="login-tagline">Cost model, tender &amp; quotation gudang dalam satu tempat.</p>
        <h1 style={{ fontSize: 20 }}>{mode === 'masuk' ? 'Masuk' : mode === 'daftar' ? 'Buat akun' : 'Reset password'}</h1>
        {mode === 'daftar' && (
          <label className="f" htmlFor="nama">Nama lengkap
            <input id="nama" value={nama} onChange={e => setNama(e.target.value)} required />
          </label>
        )}
        <label className="f" htmlFor="email">Email
          <input id="email" type="email" autoComplete="email" value={emailIsi} onChange={e => setEmail(e.target.value)} required autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </label>
        {mode !== 'lupa' && (
          <InputPassword id="password" label="Password" value={password} onChange={setPassword}
            autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'} minLength={mode === 'masuk' ? 1 : 8} />
        )}
        {pesan && <p className="small" role="status" style={{ whiteSpace: 'pre-line' }}>{pesan}</p>}
        <button type="submit" disabled={sibuk}>{sibuk ? 'Memproses…' : mode === 'masuk' ? 'Masuk' : mode === 'daftar' ? 'Buat akun' : 'Kirim link reset'}</button>
        <div className="row small">
          {mode !== 'masuk' && <button type="button" className="ghost" onClick={() => setMode('masuk')}>Sudah punya akun</button>}
          {mode !== 'daftar' && <button type="button" className="ghost" onClick={() => setMode('daftar')}>Buat akun</button>}
          {mode !== 'lupa' && <button type="button" className="ghost" onClick={() => setMode('lupa')}>Lupa password</button>}
        </div>
      </form>
      <p className="small" style={{ color: 'var(--g400)', marginTop: 16 }}>Leca · dibuat oleh esapanghegar</p>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

/** Pesan error Supabase Auth → bahasa yang mudah dipahami pengguna. */
function pesanAuth(m: string) {
  const KONTAK = 'Hubungi admin: WhatsApp 0882-9191-9234 / Niuleca@gmail.com';
  if (/invalid login credentials/i.test(m)) return 'Email atau password salah. Tekan "Lihat" untuk mengecek ketikan password, pastikan email akun yang benar, atau pakai "Lupa password". Bila browser mengisi password otomatis, hapus dan ketik ulang — bisa jadi itu password lama.';
  if (/email not confirmed/i.test(m)) return `Email belum dikonfirmasi. Buka link konfirmasi di email Anda, atau ${KONTAK.toLowerCase()}`;
  if (/user already registered|already been registered/i.test(m)) return 'Email ini sudah terdaftar. Silakan masuk, atau gunakan "Lupa password".';
  if (/password should be at least|weak password/i.test(m)) return 'Password terlalu pendek/lemah — minimal 8 karakter, campur huruf & angka.';
  if (/error sending|smtp|email.*(send|deliver)/i.test(m)) return `Email dari sistem sedang tidak bisa dikirim. ${KONTAK}`;
  if (/rate limit|too many requests|security purposes/i.test(m)) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  if (/invalid email|unable to validate email/i.test(m)) return 'Format email tidak valid.';
  if (/failed to fetch|network/i.test(m)) return 'Koneksi bermasalah. Periksa internet Anda lalu coba lagi.';
  return m;
}
