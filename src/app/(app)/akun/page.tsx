'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function AkunPage() {
  const [pw, setPw] = useState('');
  const [pesan, setPesan] = useState<string | null>(null);
  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setPesan(error ? error.message : 'Password diperbarui.'); setPw('');
  }
  return (
    <>
      <div className="head"><div><div className="eyebrow">Akun</div><h1>Ganti password</h1></div></div>
      <form className="card" onSubmit={simpan} style={{ maxWidth: 420 }}>
        <label className="f" htmlFor="pw">Password baru<input id="pw" type="password" minLength={8} required value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" /></label>
        {pesan && <p className="small" role="status">{pesan}</p>}
        <button type="submit">Simpan</button>
      </form>
    </>
  );
}
