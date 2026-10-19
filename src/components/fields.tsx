'use client';
// Komponen input kecil untuk form tender.
import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { useT } from '@/lib/i18n';

/** Input angka yang boleh dikosongkan sementara saat mengetik (tidak langsung jadi "0") */
export function AngkaInput({ value, onValue, bulat, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | undefined; onValue: (v: number) => void; bulat?: boolean;
}) {
  const [teks, setTeks] = useState(value == null || Number.isNaN(value) ? '' : String(value));
  useEffect(() => { if (Number(teks) !== value || (teks === '' && value)) setTeks(value == null || Number.isNaN(value) ? '' : String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input {...rest} type="number" inputMode="decimal" value={teks}
    onChange={e => { const x = e.target.value; setTeks(x); if (x === '' || x === '-') return; const n = Number(x.replace(',', '.')); if (Number.isFinite(n)) onValue(bulat ? Math.round(n) : n); }}
    onBlur={e => { if (e.target.value === '') { setTeks('0'); onValue(0); } rest.onBlur?.(e); }} />;
}

export function Num({ id, label, value, onChange, step = 'any', min, suffix, hint }: {
  id: string; label: string; value: number | undefined; onChange: (v: number) => void; step?: string; min?: number; suffix?: string; hint?: string;
}) {
  const t = useT();
  return (
    <label className="f" htmlFor={id}>{t(label)}{suffix ? ` (${suffix})` : ''}
      <AngkaInput id={id} step={step} min={min} value={value} onValue={onChange} />
      {hint && <span className="small muted">{hint}</span>}
    </label>
  );
}

export function Pct({ id, label, value, onChange, hint }: { id: string; label: string; value: number | undefined; onChange: (v: number) => void; hint?: string }) {
  const t = useT();
  return (
    <label className="f" htmlFor={id}>{t(label)} (%)
      <input id={id} type="number" step="any" value={value == null ? '' : +(value * 100).toFixed(4)} onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value) / 100)} />
      {hint && <span className="small muted">{hint}</span>}
    </label>
  );
}

export function Txt({ id, label, value, onChange }: { id: string; label: string; value: string | undefined; onChange: (v: string) => void }) {
  const t = useT();
  return <label className="f" htmlFor={id}>{t(label)}<input id={id} value={value ?? ''} onChange={e => onChange(e.target.value)} /></label>;
}

export function Sel<T extends string | number>({ id, label, value, options, onChange }: {
  id: string; label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void;
}) {
  const t = useT();
  return (
    <label className="f" htmlFor={id}>{t(label)}
      <select id={id} value={String(value)} onChange={e => {
        const o = options.find(x => String(x.v) === e.target.value); if (o) onChange(o.v);
      }}>{options.map(o => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}</select>
    </label>
  );
}

/** Ubah satu elemen array tanpa mutasi */
export function ubahArray<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
}
