// Input volume gaya Spesifikasi Tender Warehouse (Simple CM): "Volume 1 bulan" + Max / Avg / Min opsional.
// Dipetakan ke model engine: Volume 1 bulan = komitmen (dasar tarif, MGV), Max = peak (sizing), Avg = rata-rata, Min = minBulan.
// Max / Avg yang dikosongkan otomatis = Volume 1 bulan (dan ikut berubah saat Volume 1 bulan diubah).
import type { VolumeInput } from '@/lib/engine/types';

export type KolomSpek = 'vol' | 'max' | 'avg' | 'min';

/** Nilai Volume 1 bulan: komitmen; data lama tanpa komitmen memakai rata-rata lalu peak. */
export const volSpek = (v: VolumeInput) => (v.komitmenBulan > 0 ? v.komitmenBulan : v.rataRataBulan > 0 ? v.rataRataBulan : v.peakBulan > 0 ? v.peakBulan : 0);

/** Nilai yang ditampilkan per kolom: Max / Avg kosong (undefined) bila sama dengan Volume 1 bulan. */
export function tampilSpek(v: VolumeInput): Record<KolomSpek, number | undefined> {
  const vol = volSpek(v);
  const beda = (x: number) => (x > 0 && Math.abs(x - vol) > 1e-9 ? x : undefined);
  return { vol: vol || undefined, max: beda(v.peakBulan), avg: beda(v.rataRataBulan), min: v.minBulan && v.minBulan > 0 ? v.minBulan : undefined };
}

/** Ubah satu kolom spesifikasi → patch VolumeInput. */
export function ubahSpek(v: VolumeInput, kolom: KolomSpek, n: number): Partial<VolumeInput> {
  const x = Number.isFinite(n) && n > 0 ? n : 0;
  const lama = volSpek(v);
  const ikut = (y: number) => !(y > 0) || Math.abs(y - lama) < 1e-9;
  switch (kolom) {
    case 'vol': return {
      komitmenBulan: x,
      ...(ikut(v.peakBulan) ? { peakBulan: x } : {}),
      ...(ikut(v.rataRataBulan) ? { rataRataBulan: x } : {}),
    };
    case 'max': return { peakBulan: x || lama };
    case 'avg': return { rataRataBulan: x || lama };
    case 'min': return { minBulan: x > 0 ? x : undefined };
  }
}

/** Peringatan isian yang tidak masuk akal (mis. Max < Volume 1 bulan). */
export function cekSpek(v: VolumeInput): string[] {
  const t = tampilSpek(v), vol = t.vol ?? 0, out: string[] = [];
  if (t.max != null && vol > 0 && t.max < vol) out.push('Max lebih kecil dari Volume 1 bulan');
  if (t.min != null && vol > 0 && t.min > vol) out.push('Min lebih besar dari Volume 1 bulan');
  if (t.avg != null && t.max != null && t.avg > t.max) out.push('Avg lebih besar dari Max');
  if (t.avg != null && t.min != null && t.avg < t.min) out.push('Avg lebih kecil dari Min');
  return out;
}
