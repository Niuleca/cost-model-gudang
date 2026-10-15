'use client';
// Komponen input kecil untuk form tender.

export function Num({ id, label, value, onChange, step = 'any', min, suffix, hint }: {
  id: string; label: string; value: number | undefined; onChange: (v: number) => void; step?: string; min?: number; suffix?: string; hint?: string;
}) {
  return (
    <label className="f" htmlFor={id}>{label}{suffix ? ` (${suffix})` : ''}
      <input id={id} type="number" step={step} min={min} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
      {hint && <span className="small muted">{hint}</span>}
    </label>
  );
}

export function Pct({ id, label, value, onChange, hint }: { id: string; label: string; value: number | undefined; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="f" htmlFor={id}>{label} (%)
      <input id={id} type="number" step="any" value={value == null ? '' : +(value * 100).toFixed(4)} onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value) / 100)} />
      {hint && <span className="small muted">{hint}</span>}
    </label>
  );
}

export function Txt({ id, label, value, onChange }: { id: string; label: string; value: string | undefined; onChange: (v: string) => void }) {
  return <label className="f" htmlFor={id}>{label}<input id={id} value={value ?? ''} onChange={e => onChange(e.target.value)} /></label>;
}

export function Sel<T extends string | number>({ id, label, value, options, onChange }: {
  id: string; label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void;
}) {
  return (
    <label className="f" htmlFor={id}>{label}
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
