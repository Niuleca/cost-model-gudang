'use client';
import { useEffect } from 'react';
import { AIR_DEFAULT, SUMBER_AIR, hitungAir, type AirInput, type SumberAir } from '@/lib/air';
import { angka, rp } from '@/lib/format';

/** Utilities Management → Water. Kebutuhan dari headcount & luas (tab lain), tarif per m³ bisa diubah. */
export default function AirPanel({ air, headcount, luasM2, hariKerjaBulan, onChange }: {
  air?: AirInput; headcount: number; luasM2: number; hariKerjaBulan: number; onChange: (a: AirInput) => void;
}) {
  const a: AirInput = { ...AIR_DEFAULT, ...(air ?? {}), headcount, luasM2, hariKerjaBulan };
  // simpan driver terbaru supaya mesin hitung (Result) memakai headcount & luas yang sama dengan layar
  useEffect(() => {
    if (!air || air.headcount !== headcount || air.luasM2 !== luasM2 || air.hariKerjaBulan !== hariKerjaBulan) onChange(a);
  }, [headcount, luasM2, hariKerjaBulan]); // eslint-disable-line react-hooks/exhaustive-deps
  const h = hitungAir(a);
  const set = (p: Partial<AirInput>) => onChange({ ...a, ...p });
  const sumber = SUMBER_AIR[a.sumber];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="grid-isi">
        <label className="f">Sumber air
          <select value={a.sumber} onChange={e => set({ sumber: e.target.value as SumberAir })}>
            {(Object.keys(SUMBER_AIR) as SumberAir[]).map(k => <option key={k} value={k}>{SUMBER_AIR[k].l}{SUMBER_AIR[k].berbayar ? '' : ' (tidak dihitung)'}</option>)}
          </select></label>
        <label className="f">Pemakaian per orang (L/hari)<input type="number" min={0} value={a.literOrangHari} onChange={e => set({ literOrangHari: Number(e.target.value) })} /></label>
        <label className="f">Cleaning per m² (L/hari)<input type="number" min={0} step={0.05} value={a.literM2Hari} onChange={e => set({ literM2Hari: Number(e.target.value) })} /></label>
        <label className="f">Tarif (Rp/m³)<input type="number" min={0} step={500} value={a.tarifM3} onChange={e => set({ tarifM3: Number(e.target.value) })} disabled={!sumber.berbayar} /></label>
        <label className="f">Biaya beban / abonemen (Rp/bln)<input type="number" min={0} step={10000} value={a.abonemenBulan} onChange={e => set({ abonemenBulan: Number(e.target.value) })} disabled={!sumber.berbayar} /></label>
      </div>
      <p className="small muted">{sumber.ket} Dasar 50 L/orang/hari mengikuti kebutuhan air pekerja industri/kantor (SNI 03-7065-2005); cleaning ±0,2 L/m²/hari untuk lantai, toilet & area umum. Tarif kawasan industri umumnya Rp10.000–25.000/m³ — sesuaikan dengan tarif pengelola/PDAM setempat.</p>
      <div className="tablewrap fit"><table className="tabel-fit"><tbody>
        <tr><td>Pekerja</td><td className="num">{angka(headcount)} orang × {angka(a.literOrangHari)} L × {angka(hariKerjaBulan)} hari</td><td className="num">{angka(h.m3Orang, 1)} m³</td></tr>
        <tr><td>Cleaning area</td><td className="num">{angka(luasM2)} m² × {angka(a.literM2Hari, 2)} L × {angka(hariKerjaBulan)} hari</td><td className="num">{angka(h.m3Area, 1)} m³</td></tr>
        <tr><td><b>Total pemakaian</b></td><td></td><td className="num"><b>{angka(h.m3Bulan, 1)} m³/bln</b></td></tr>
        <tr className="sp-hitam"><td><b>Biaya air per bulan (masuk cost model)</b></td><td className="num">{sumber.berbayar ? `${angka(h.m3Bulan, 1)} m³ × ${rp(a.tarifM3)} + beban ${rp(a.abonemenBulan)}` : 'termasuk sewa gudang'}</td><td className="num"><b>{rp(h.biayaBulan)}</b></td></tr>
      </tbody></table></div>
      {headcount <= 0 && <p className="small" style={{ color: 'var(--bad)' }}>Headcount belum ada — isi Value Stream Mapping lalu Hitung supaya pemakaian air pekerja terhitung.</p>}
    </div>);
}
