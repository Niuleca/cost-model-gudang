'use client';
import { useEffect, useState } from 'react';

// Menu HP: tombol ☰ membuka lembar menu (Beranda · Contact · Login); tertutup otomatis setelah memilih.
export default function MenuHp({ masuk }: { masuk: boolean }) {
  const [buka, setBuka] = useState(false);
  useEffect(() => {
    if (!buka) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setBuka(false); };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [buka]);
  return (
    <div className="ld-menu-hp">
      <button type="button" className="ld-burger" aria-expanded={buka} aria-controls="ld-lembar" aria-label={buka ? 'Tutup menu' : 'Buka menu'} onClick={() => setBuka(v => !v)}>
        <span /><span /><span />
      </button>
      {buka && (
        <div id="ld-lembar" className="ld-lembar" onClick={() => setBuka(false)}>
          <nav aria-label="Menu" onClick={e => e.stopPropagation()}>
            <a href="#beranda" onClick={() => setBuka(false)}>Beranda</a>
            <a href="#kontak" onClick={() => setBuka(false)}>Contact</a>
            <a href={masuk ? '/' : '/login'} className="ld-tombol utama">{masuk ? 'Buka Leca' : 'Login'}</a>
          </nav>
        </div>
      )}
    </div>
  );
}
