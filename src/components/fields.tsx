'use client';
// Komponen input kecil untuk form tender.
import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { useT } from '@/lib/i18n';
import InputDesimal from '@/components/InputDesimal';

/** Input angka yang boleh dikosongkan sementara saat mengetik (tidak langsung jadi "0") */
export function AngkaInput({ value, onValue, bulat, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | undefined; onValue: (v: number) => void; bulat?: boolean;
}) {
  // koma atau titik sebagai desimal (keyboard HP Indonesia hanya punya koma); kosong sementara saat mengetik, jadi 0 saat keluar kolom
  return <InputDesimal {...rest} value={value == null || Number.isNaN(value) ? '' : value}
    onChange={e => { const x = e.target.value; if (x === '') return; const n = Number(x); if (Number.isFinite(n)) onValue(bulat ? Math.round(n) : n); }}
    onBlur={e => { if (e.target.value === '') onValue(0); rest.onBlur?.(e); }} />;
}

/** Baca angka gaya Indonesia: titik = pemisah ribuan ("10.673" → 10673, "1.250.000" → 1250000), koma = desimal ("2,5" → 2.5).
 *  Satu titik yang tidak diikuti tepat 3 angka tetap dibaca desimal ("1.5" → 1.5). */
export function bacaAngkaId(x: string): number | null {
  const t = x.trim().replace(/\s/g, '');
  if (!t) return null;
  let n: number;
  if (/^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t)) n = Number(t.replace(/\./g, '').replace(',', '.'));
  else if (/^-?\d+(,\d+)?$/.test(t)) n = Number(t.replace(',', '.'));
  else n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Input volume: tampil dengan pemisah ribuan (10.673), mengetik "10.673" dibaca sepuluh ribu enam ratus tujuh puluh tiga. */
export function AngkaVolume({ value, onValue, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | undefined; onValue: (v: number) => void;
}) {
  const fmt = (v: number | undefined) => (v == null || Number.isNaN(v) ? '' : v.toLocaleString('id-ID', { maximumFractionDigits: 3 }));
  const [teks, setTeks] = useState(fmt(value));
  const [fokus, setFokus] = useState(false);
  useEffect(() => { if (!fokus) setTeks(fmt(value)); }, [value, fokus]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input {...rest} type="text" inputMode="decimal" value={teks}
    onFocus={e => { setFokus(true); rest.onFocus?.(e); }}
    onChange={e => { const x = e.target.value; setTeks(x); const n = bacaAngkaId(x); if (n != null && n >= 0) onValue(n); }}
    onBlur={e => { setFokus(false); const n = bacaAngkaId(e.target.value); if (n == null) onValue(0); setTeks(fmt(n ?? 0)); rest.onBlur?.(e); }} />;
}

/** Input angka bebas diketik: batas min/max baru diterapkan saat Enter / keluar kolom (bukan per ketikan),
 *  jadi mengetik "30" tidak berubah jadi "10" atau "400" di tengah jalan. Nilai dalam batas langsung dipakai (pratinjau). */
export function AngkaBebas({ value, onValue, min, max, bulat, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'> & {
  value: number; onValue: (v: number) => void; min?: number; max?: number; bulat?: boolean;
}) {
  const [teks, setTeks] = useState(String(value));
  const [fokus, setFokus] = useState(false);
  useEffect(() => { if (!fokus) setTeks(String(value)); }, [value, fokus]);
  const baca = (x: string) => { const n = Number(x.trim().replace(',', '.')); return x.trim() === '' || !Number.isFinite(n) ? null : bulat ? Math.round(n) : n; };
  const dalam = (n: number) => (min == null || n >= min) && (max == null || n <= max);
  const n = baca(teks);
  const luar = fokus && n != null && !dalam(n);
  const simpan = () => {
    const v = baca(teks);
    if (v == null) { setTeks(String(value)); return; }
    const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (c !== value) onValue(c);
    setTeks(String(c));
  };
  return <input {...rest} type="text" inputMode="decimal" value={teks}
    aria-invalid={luar || undefined}
    title={luar ? `Batas ${min ?? '–'} s/d ${max ?? '–'}; disesuaikan saat Enter / keluar kolom` : rest.title}
    style={{ ...(rest.style ?? {}), ...(luar ? { borderColor: 'var(--warn, #b45309)', outlineColor: 'var(--warn, #b45309)' } : {}) }}
    onFocus={e => { setFokus(true); rest.onFocus?.(e); }}
    onChange={e => { setTeks(e.target.value); const v = baca(e.target.value); if (v != null && dalam(v)) onValue(v); }}
    onBlur={e => { setFokus(false); simpan(); rest.onBlur?.(e); }}
    onKeyDown={e => { if (e.key === 'Enter') { simpan(); (e.target as HTMLInputElement).blur(); } rest.onKeyDown?.(e); }} />;
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
      <InputDesimal id={id} step="any" value={value == null ? '' : +(value * 100).toFixed(4)} onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value) / 100)} />
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
