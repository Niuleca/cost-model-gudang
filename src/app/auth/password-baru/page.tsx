'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import LecaMark from '@/components/LecaMark';
import InputPassword from '@/components/InputPassword';

/** Tujuan link "Lupa password": langsung minta password baru (dua kali), lalu masuk. */
export default function PasswordBaru() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pesan, setPesan] = useState<{ jenis: 'ok' | 'error'; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => setEmail(data.user?.email ?? null));
  }, []);

  async function simpan(e: React.FormEvent) {
    e.preventDefault(); setPesan(null);
    if (pw.length < 8) { setPesan({ jenis: 'error', teks: 'Password minimal 8 karakter.' }); return; }
    if (pw !== pw2) { setPesan({ jenis: 'error', teks: 'Kedua password tidak sama. Ketik ulang.' }); return; }
    setSibuk(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setSibuk(false);
    if (error) {
      const m = error.message;
      setPesan({ jenis: 'error', teks: /same.*password|different from the old/i.test(m) ? 'Password baru tidak boleh sama dengan password lama.'
        : /weak|at least/i.test(m) ? 'Password terlalu lemah — minimal 8 karakter, campur huruf & angka.'
        : /session|jwt|not authenticated/i.test(m) ? 'Sesi reset sudah habis. Minta link reset baru dari halaman login.' : m });
      return;
    }
    setPesan({ jenis: 'ok', teks: 'Password baru tersimpan. Mengalihkan…' });
    setTimeout(() => { router.replace('/beranda'); router.refresh(); }, 900);
  }

  return (
    <div className="login">
      <form className="card" onSubmit={simpan}>
        <a href="/" className="login-brand" style={{ color: 'inherit', textDecoration: 'none' }}><LecaMark size={40} /><div><div className="nama">Leca</div><div className="oleh">by esapanghegar</div></div></a>
        <h1 style={{ fontSize: 20 }}>Buat password baru</h1>
        {email === undefined && <p className="small muted">Memeriksa link…</p>}
        {email === null && (
          <>
            <p className="error small">Link reset tidak aktif — mungkin sudah dipakai, kedaluwarsa (lebih dari 1 jam), atau dibuka di browser berbeda dari tempat Anda memintanya.</p>
            <a className="btn" href="/login?mode=lupa">Minta link reset baru</a>
          </>
        )}
        {email && (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>Untuk akun <b>{email}</b>. Setelah disimpan, pakai password ini setiap kali masuk.</p>
            <InputPassword id="pw" label="Password baru" value={pw} onChange={setPw} autoComplete="new-password" />
            <InputPassword id="pw2" label="Ulangi password baru" value={pw2} onChange={setPw2} autoComplete="new-password" />
            {pesan && <p className={pesan.jenis === 'ok' ? 'ok small' : 'error small'} role="status">{pesan.teks}</p>}
            <button type="submit" disabled={sibuk}>{sibuk ? 'Menyimpan…' : 'Simpan password'}</button>
          </>
        )}
      </form>
    </div>
  );
}
