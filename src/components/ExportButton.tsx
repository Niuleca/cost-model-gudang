'use client';
import { useState } from 'react';
import { exportExcel, type KolomExcel } from '@/lib/excel';

/** Tombol "Export Excel" untuk tabel laporan (tender, perbandingan, implementasi, riwayat). */
export default function ExportButton({ nama, kolom, rows }: { nama: string; kolom: KolomExcel[]; rows: Record<string, unknown>[] }) {
  const [sibuk, setSibuk] = useState(false);
  return (
    <button className="ghost" disabled={sibuk || rows.length === 0} onClick={async () => {
      setSibuk(true);
      try { await exportExcel(nama, nama, kolom, rows); } finally { setSibuk(false); }
    }}>{sibuk ? 'Menyiapkan…' : 'Export Excel'}</button>
  );
}
