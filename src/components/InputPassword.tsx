'use client';
import { useState } from 'react';

/** Kolom password dengan tombol Lihat/Sembunyikan dan peringatan Caps Lock. */
export default function InputPassword({ id, label, value, onChange, autoComplete, minLength = 8 }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; minLength?: number;
}) {
  const [lihat, setLihat] = useState(false);
  const [caps, setCaps] = useState(false);
  const cekCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false);
  return (
    <label className="f" htmlFor={id}>{label}
      <span className="pw-kolom">
        <input id={id} type={lihat ? 'text' : 'password'} minLength={minLength} required autoComplete={autoComplete}
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={value} onChange={e => onChange(e.target.value)} onKeyUp={cekCaps} onKeyDown={cekCaps} />
        <button type="button" className="ghost pw-lihat" onClick={() => setLihat(v => !v)} aria-pressed={lihat} aria-controls={id}>
          {lihat ? 'Sembunyikan' : 'Lihat'}
        </button>
      </span>
      {caps && <span className="small" style={{ color: 'var(--warn)' }}>Caps Lock menyala</span>}
    </label>
  );
}
