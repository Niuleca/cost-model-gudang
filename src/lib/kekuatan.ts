// Dasar cek kekuatan rak & lantai dari data tender: berat palet default (palet rak terberat di Produk, atau berat per palet
// Parameter muatan), daya dukung lantai gudang terpilih, kapasitas beam per posisi (aturan berat di tab Produk).
import { hitungKekuatan, hitungLevelRak, lengkapiSpaceExcel } from '@/lib/engine/space';
import { ATURAN_BERAT_DEFAULT, beratPaletRakMaks, paletDariSpace, produkEfektif } from '@/lib/produk';
import { PARAM_DEFAULT } from '@/lib/profilVolume';
import type { Asumsi } from '@/lib/tender';

export function dasarKekuatan(a: Asumsi, customer?: string) {
  const sx = lengkapiSpaceExcel(a.space?.excel), at = a.aturanBerat ?? ATURAN_BERAT_DEFAULT;
  const maks = beratPaletRakMaks(produkEfektif(a.produk, a.volumes, a.profilVolume, customer), at, Math.max(1, hitungLevelRak(sx.rak).level || 1), paletDariSpace(sx));
  const param = { ...PARAM_DEFAULT, ...(a.profilVolume?.param ?? {}) };
  const daya = Number(a.gudang?.daya_lantai_ton_m2) || 0;
  return {
    beratDefaultKg: maks ?? param.tonPerPalet * 1000,
    sumberBerat: maks != null ? 'palet rak terberat (tab Produk)' : 'berat per palet (Volume → Parameter muatan)',
    kapLantaiDefaultKgM2: daya > 0 ? daya * 1000 : null,
    sumberLantai: daya > 0 ? `gudang terpilih ${daya.toLocaleString('id-ID')} ton/m²` : 'default 3.000',
    kapPosisiKg: at.kapPosisiKg,
  };
}
/** Hasil cek kekuatan untuk tender (dipakai web & export Excel). */
export const kekuatanTender = (a: Asumsi, customer?: string) => hitungKekuatan(lengkapiSpaceExcel(a.space?.excel), dasarKekuatan(a, customer));
