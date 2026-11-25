// Pilih item harga MHE otomatis: jenis alat dari kode equipment VSM, kapasitas ≥ berat palet, tinggi angkat ≥ beam teratas,
// lalu yang TERMURAH per bulan (sewa; beli dihitung harga ÷ umur ekonomis). Prioritas harga approved, bila tidak ada pakai draft.
export interface ItemHargaMhe {
  id: number; kategori: string; item: string; harga_beli: number | null; harga_sewa_bulan: number | null; umur_ekonomis_bulan: number | null;
  status_efektif: string; mhe_tipe: string | null; kapasitas_ton: number | null; sumber_tenaga?: string | null; tinggi_angkat_m?: number | null; vendor?: string | null;
}

/** Jenis alat dari kode equipment di VSM. null = bukan MHE (PC, RF, printer → biaya di Kebutuhan IT). */
export function jenisMhe(tool: string): string | null {
  const t = tool.trim();
  if (/^(cbt|fl|flt|forklift|counter ?balance|cb)\b/i.test(t)) return 'Counter Balance';
  if (/^(rt|reach( truck)?)\b/i.test(t)) return 'Reach Truck';
  if (/hand ?pallet|^hp(t)?$|^hpj$/i.test(t)) return 'Hand Pallet';
  if (/pallet mover|^pm$|^ept$|stacker|^wpt$/i.test(t)) return 'Pallet Mover';
  return null;
}
export const ALAT_IT = /^(pc|rf|hht|pdt|laptop|printer|scanner)\b/i;

const perBulan = (it: ItemHargaMhe) => {
  const sewa = Number(it.harga_sewa_bulan) || 0, beli = Number(it.harga_beli) || 0, umur = Number(it.umur_ekonomis_bulan) || 60;
  return sewa > 0 ? { mode: 'sewa' as const, harga: sewa, bulan: sewa } : beli > 0 ? { mode: 'beli' as const, harga: beli, bulan: beli / umur } : null;
};

export function pilihItemMhe(tool: string, items: ItemHargaMhe[], opsi: { tonPerPalet?: number; tinggiBeamM?: number } = {}) {
  const jenis = jenisMhe(tool);
  if (!jenis) return null;
  const beban = (opsi.tonPerPalet ?? 0) + 0.03;                       // berat palet + tare
  const cocok = items.filter(it => it.kategori === 'MHE' && (it.mhe_tipe ?? '').toLowerCase() === jenis.toLowerCase() && perBulan(it))
    .filter(it => !(Number(it.kapasitas_ton) > 0) || Number(it.kapasitas_ton) >= beban)
    .filter(it => jenis !== 'Reach Truck' || !opsi.tinggiBeamM || !(Number(it.tinggi_angkat_m) > 0) || Number(it.tinggi_angkat_m) >= opsi.tinggiBeamM);
  if (!cocok.length) return null;
  const urut = (xs: ItemHargaMhe[]) => [...xs].sort((a, b) => perBulan(a)!.bulan - perBulan(b)!.bulan);
  const approved = urut(cocok.filter(x => x.status_efektif === 'approved'));
  const it = approved[0] ?? urut(cocok)[0];
  const h = perBulan(it)!;
  return { item: it, mode: h.mode, harga: h.harga, jumlahPilihan: cocok.length,
    alasan: `termurah dari ${cocok.length} pilihan ${jenis}${beban > 0.05 ? ` (kapasitas ≥ ${beban.toLocaleString('en-US', { maximumFractionDigits: 2 })} t)` : ''}${it.vendor ? ` · vendor ${it.vendor}` : ''}${it.status_efektif !== 'approved' ? ` · harga ${it.status_efektif}` : ''}` };
}

/** Lengkapi / perbarui baris MHE otomatis untuk semua alat kebutuhan. null bila tidak ada perubahan. */
export function sesuaikanMhe<M extends { tool: string; nama: string; mode: 'sewa' | 'beli'; harga: number; umurBulan?: number; ketersediaan: number; sparePersen: number; otomatis?: boolean; vendor?: string | null; priceItemId?: number }>(
  mhe: M[], tools: string[], items: ItemHargaMhe[], opsi: { tonPerPalet?: number; tinggiBeamM?: number }): M[] | null {
  let ubah = false; const out = [...mhe];
  for (const tool of tools) {
    const ada = out.findIndex(m => m.tool === tool);
    if (ada >= 0 && !out[ada].otomatis) continue;      // dipilih / dikosongkan manual oleh user → tidak diubah
    const p = pilihItemMhe(tool, items, opsi);
    if (!p) continue;
    const baru = { ...(ada >= 0 ? out[ada] : { tool, ketersediaan: 0.85, sparePersen: 0 }), nama: p.item.item, mode: p.mode, harga: p.harga,
      umurBulan: p.item.umur_ekonomis_bulan ?? 60, priceItemId: p.item.id, otomatis: true, vendor: p.item.vendor ?? null } as M;
    if (ada >= 0) { const o = out[ada]; if (o.priceItemId === baru.priceItemId && o.harga === baru.harga && o.mode === baru.mode) continue; out[ada] = baru; }
    else out.push(baru);
    ubah = true;
  }
  return ubah ? out : null;
}
