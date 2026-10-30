'use client';
// 3D di Desain gudang: gaya "Leca" = visual yang sama dengan Leca Game (model Meshy, palet bertekstur, MHE parkir,
// pekerja di posnya, truk di dock) memakai cuplikan diam simulasi dari layout yang sedang diedit; gaya "skematik" = viewer lama.
import { useMemo, type MutableRefObject } from 'react';
import { buatDunia, jalankanSampai, shiftBerikut, skenarioDariTender } from '@/lib/game';
import type { TenderRow } from '@/lib/tender';
import type { HasilTender } from '@/lib/engine/index.ts';
import type { LayoutGudang } from '@/lib/simulasi3d/layout';
import { keLayoutGudang, ringkas, type LayoutEdit } from '@/lib/simulasi3d/editor';
import Viewer3D, { type OpsiViewer, type ViewerApi } from '../Viewer3D';
import { buatLapisanGame, type KontrolGame } from '../game/lapisan3d';

export type Gaya3D = 'leca' | 'skematik';

export default function Desain3D({ edit, data, layoutSkematik, gaya, opsi, apiRef, kec }: {
  edit: LayoutEdit; data: { t: TenderRow; h: HasilTender; auto: LayoutGudang }; layoutSkematik: LayoutGudang; gaya: Gaya3D;
  opsi: OpsiViewer; apiRef: MutableRefObject<ViewerApi | null>; kec: { faktor: number; siklus: Record<string, number> };
}) {
  const leca = useMemo(() => {
    if (gaya !== 'leca') return null;
    try {
      const lay = keLayoutGudang({ ...edit, okupansi: 1 }, data.auto);
      const sk = skenarioDariTender(data.t, data.h, { seed: 1, layout: lay });
      // isi rak = okupansi desain (stok desain ÷ kapasitas layout) supaya sama dengan angka di panel kapasitas
      const nPos = sk.lokasi.filter(l => l.tipe === 'rak' || l.tipe === 'lantai').length;
      sk.stokAwal = Math.min(nPos, Math.round(ringkas(edit).okupansi * nPos));
      const d = buatDunia(sk);
      jalankanSampai(d, shiftBerikut(d) + 45 * 60);   // cuplikan 45 menit setelah shift mulai: pekerja di pos, truk di dock
      const kontrol: { current: KontrolGame } = { current: { jalan: false, kecepatan: 1, batas: d.t, pilih: null, jelajah: false, tombol: { maju: false, mundur: false, kiri: false, kanan: false, lari: false }, amatan: null, statGerak: {} } };
      return { lay, lapisan: buatLapisanGame(d, lay, kontrol, () => {}, () => {}) };
    } catch { return null; }
  }, [edit, data, gaya]);
  if (leca) return <Viewer3D apiRef={apiRef} layout={leca.lay} shift={0} opsi={{ ...opsi, label: false }} kecepatan={{ faktor: 0, siklus: {} }} lapisan={leca.lapisan} tema="bersih" />;
  return <Viewer3D apiRef={apiRef} layout={layoutSkematik} shift={layoutSkematik.shiftAktif[0] ?? 0} opsi={opsi} kecepatan={kec} />;
}
