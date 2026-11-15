'use client';
import { BASIS, GRUP_BASIS, type Basis } from '@/lib/transport';

/** Dropdown satuan harga dikelompokkan: Armada / perjalanan · Berat · Volume · Unit barang. */
export default function SelectBasis({ value, onChange, label = 'Satuan harga', className, pilihan }: {
  value: Basis; onChange: (b: Basis) => void; label?: string; className?: string; pilihan?: Basis[];
}) {
  const ada = (b: Basis) => !pilihan || pilihan.includes(b);
  return (
    <select aria-label={label} className={className} value={value} onChange={e => onChange(e.target.value as Basis)}>
      {GRUP_BASIS.map(g => {
        const xs = BASIS.filter(b => b.grup === g && ada(b.v));
        return xs.length ? <optgroup key={g} label={g}>{xs.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}</optgroup> : null;
      })}
    </select>);
}
