'use client';
// Langkah ② Simulasi operasi di Desain gudang: menjalankan mesin Leca Game di atas layout yang sedang diedit
// (termasuk perubahan yang belum disimpan) → amati di 2D (tampak atas, gaya CLASS) dan 3D, lalu nilai lewat Analisis KPI & red flag.
import { useMemo, useState } from 'react';
import { buatDunia, skenarioDariTender, type Dunia } from '@/lib/game';
import type { TenderRow } from '@/lib/tender';
import type { HasilTender } from '@/lib/engine/index.ts';
import type { LayoutGudang } from '@/lib/simulasi3d/layout';
import { keLayoutGudang, ringkas, type LayoutEdit } from '@/lib/simulasi3d/editor';
import Main3D from '../game/Main3D';

const angka = (v: number) => v.toLocaleString('id-ID');

export default function SimulasiDesain({ edit, data, kotor }: { edit: LayoutEdit; data: { t: TenderRow; h: HasilTender; auto: LayoutGudang }; kotor: boolean }) {
  const [hari, setHari] = useState(7);
  const [seed, setSeed] = useState(1);
  const [sim, setSim] = useState<{ dunia: Dunia; layout: LayoutGudang; kunci: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, setVersi] = useState(0);
  const rk = useMemo(() => ringkas(edit), [edit]);
  const kunciEdit = useMemo(() => JSON.stringify(edit.komponen) + JSON.stringify(edit.gedung), [edit]);

  const mulai = () => {
    setErr(null);
    try {
      const layout = keLayoutGudang({ ...edit, okupansi: 1 }, data.auto);
      const sk = skenarioDariTender(data.t, data.h, { seed, layout });
      setSim({ dunia: buatDunia(sk), layout, kunci: kunciEdit });
    } catch (e) { setErr(`Simulasi tidak bisa dibuat: ${(e as Error).message}`); }
  };

  return (
    <>
      <div className="card sim-desain-setup">
        <div>
          <b>Simulasi operasi pada layout ini</b>
          <p className="small muted" style={{ margin: '2px 0 0' }}>
            Memakai layout yang sedang diedit{kotor ? ' (termasuk perubahan yang belum disimpan)' : ''}: {angka(rk.totalRak)} posisi simpan, data volume, manpower, MHE & productivity dari tender.
            Amati pergerakan di <b>2D</b> (tampak atas) dan <b>3D</b>, lalu nilai di tab <b>Analisis KPI</b> dan <b>Red flag</b>.
          </p>
        </div>
        <label className="f">Hari simulasi<input type="number" min={1} max={60} value={hari} onChange={e => setHari(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} /></label>
        <label className="f">Seed<input type="number" value={seed} onChange={e => setSeed(Number(e.target.value) || 0)} /></label>
        <button type="button" onClick={mulai}>{sim ? '↻ Ulang simulasi' : '▶ Mulai simulasi'}</button>
      </div>
      {sim && sim.kunci !== kunciEdit && <p className="small" style={{ color: 'var(--warn)' }}>Layout berubah sejak simulasi dimulai — tekan <b>Ulang simulasi</b> supaya memakai layout terbaru.</p>}
      {err && <p className="error small" role="alert">{err}</p>}
      {sim ? <Main3D dunia={sim.dunia} layout={sim.layout} hariMaks={hari} onTick={() => setVersi(v => v + 1)} tampilAwal="split" />
        : <div className="card small muted">Tekan <b>Mulai simulasi</b>. Truk, order, putaway, picking, dan muat berjalan sesuai skenario tender; waktu bisa dipercepat, dilompati per shift, atau dijalankan sampai akhir hari.</div>}
    </>
  );
}
