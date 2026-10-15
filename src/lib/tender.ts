// Penghubung antara database (Supabase) dan mesin hitung.
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TenderInput, MasterData, KategoriRisiko, VolumeInput, AktivitasInput, PeranTetap, SpaceInput, MheInput, CostLineInput, ListrikInput,
} from './engine/index.ts';
import { itKeCostLines, IT_SHEET_DEFAULT, type ItSheet } from './it.ts';

export interface TenderRow {
  id: string; kode: string | null; customer: string; industri: string | null; provinsi: string; kab_kota: string;
  alamat_lokasi: string | null; tipe_gudang: string; skema: 'Dedicated' | 'Shared';
  skenario_aset: 'Rental' | 'Own Asset' | 'Built-to-Suit'; durasi_kontrak_bulan: number; tanggal_go_live: string | null;
  jumlah_shift: number; jam_kerja_per_shift: number; jam_efektif_per_shift: number; hari_kerja_per_minggu: 5 | 6 | 7;
  payment_term_hari: number; asumsi: Asumsi; hasil: unknown; status: string; versi: number; updated_at: string;
  warehouse_id: string | null; pic: string | null; alasan_hasil: string | null; tanggal_keputusan: string | null; created_at?: string;
}

/** Snapshot gudang terpilih (disalin dari master gudang saat dipilih, supaya tender tetap utuh walau master berubah). */
export interface GudangTerpilih {
  id: string; nama: string; alamat: string | null; kab_kota: string; provinsi: string; gmaps_url: string | null;
  luas_m2: number; harga_sewa_m2_bulan: number | null; harga_per_bulan: number | null; tinggi_bersih_m: number | null;
  jumlah_dock: number | null; tipe: string; foto: string[]; sewaUtuh: boolean;
}

// Bagian input yang disimpan di tenders.asumsi
export interface Asumsi {
  cutiTahunanHari: number;
  faktorProduktivitas: number;
  efisiensi: number;
  spanOfControl: number;
  roleSupervisor: string;
  volumes: VolumeInput[];
  aktivitas: (AktivitasInput & { productivityId?: number })[];
  peranTetap: PeranTetap[];
  space: SpaceInput;
  mhe: (MheInput & { priceItemId?: number })[];
  costLines: (CostLineInput & { priceItemId?: number })[];
  listrik: ListrikInput[];
  golonganListrik: string;
  tarifListrikKwh: number;
  advanceSewaBulan: number;
  depositBulan: number;
  stokTon?: number; stokCbm?: number; stokLiter?: number;
  it: ItSheet;
  gudang?: GudangTerpilih | null;
}

export const ASUMSI_DEFAULT: Asumsi = {
  cutiTahunanHari: 12, faktorProduktivitas: 0.95, efisiensi: 0.9, spanOfControl: 15, roleSupervisor: 'Operational SPV',
  volumes: [
    { arus: 'storage', uom: 'palet', rataRataBulan: 0, peakBulan: 0, komitmenBulan: 0 },
    { arus: 'inbound', uom: 'palet', rataRataBulan: 0, peakBulan: 0, komitmenBulan: 0 },
    { arus: 'outbound', uom: 'palet', rataRataBulan: 0, peakBulan: 0, komitmenBulan: 0 },
  ],
  aktivitas: [],
  peranTetap: [{ roleName: 'Admin Inbound-Outbound', qty: 1, alokasi: { handling_in: 0.5, handling_out: 0.5 } }],
  space: { metodeSimpan: 'spr', palletPanjangM: 1.2, palletLebarM: 1.0, levelSimpan: 4, faktorAisle: 1.0, stagingM2PerPalet: 1.8,
    sequencePerShift: 2, fasilitasM2: 60, allowancePersen: 0.1, tarifSewaM2Bulan: 0, hargaRakPerPosisi: 0, umurRakBulan: 120 },
  mhe: [], costLines: [], listrik: [],
  golonganListrik: 'B-2/TR', tarifListrikKwh: 1444.70, advanceSewaBulan: 0, depositBulan: 0,
  it: IT_SHEET_DEFAULT, gudang: null,
};

export function keInput(t: TenderRow): TenderInput {
  const a = { ...ASUMSI_DEFAULT, ...(t.asumsi ?? {}) };
  const tahun = t.tanggal_go_live ? new Date(t.tanggal_go_live).getFullYear() : new Date().getFullYear();
  return {
    customer: t.customer, provinsi: t.provinsi, kabKota: t.kab_kota, tahun,
    durasiKontrakBulan: t.durasi_kontrak_bulan, jumlahShift: t.jumlah_shift, jamEfektifPerShift: Number(t.jam_efektif_per_shift),
    hariKerjaPerMinggu: t.hari_kerja_per_minggu, cutiTahunanHari: a.cutiTahunanHari, skenarioAset: t.skenario_aset,
    paymentTermHari: t.payment_term_hari, volumes: a.volumes, aktivitas: a.aktivitas, peranTetap: a.peranTetap,
    spanOfControl: a.spanOfControl, roleSupervisor: a.roleSupervisor, faktorProduktivitas: a.faktorProduktivitas,
    efisiensi: a.efisiensi, mhe: a.mhe, listrik: a.listrik,
    space: a.gudang ? { ...a.space, luasTersediaM2: Number(a.gudang.luas_m2), namaGudang: a.gudang.nama,
      sewaTetapBulan: a.gudang.sewaUtuh ? Number(a.gudang.harga_per_bulan ?? (a.gudang.harga_sewa_m2_bulan ?? 0) * a.gudang.luas_m2) : undefined } : a.space,
    costLines: [...a.costLines, ...itKeCostLines(a.it ?? IT_SHEET_DEFAULT)],
    tarifListrikKwh: a.tarifListrikKwh, advanceSewaBulan: a.advanceSewaBulan, depositBulan: a.depositBulan,
    stokTon: a.stokTon, stokCbm: a.stokCbm, stokLiter: a.stokLiter,
  };
}

/** Ambil master data yang dibutuhkan mesin hitung untuk satu tender. */
export async function muatMaster(sb: SupabaseClient, t: TenderRow): Promise<{ master: MasterData; catatan: string[] }> {
  const tahun = t.tanggal_go_live ? new Date(t.tanggal_go_live).getFullYear() : new Date().getFullYear();
  const [upah, jab, libur, pay, fin, mar, harga, itc] = await Promise.all([
    sb.from('upah_minimum_berlaku').select('upah_berlaku, status_verifikasi, tahun').eq('provinsi', t.provinsi).eq('kab_kota', t.kab_kota).order('tahun', { ascending: false }).limit(1),
    sb.from('job_levels').select('role_name, klasifikasi, faktor_umk, tunjangan_bulan, is_outsourcing, status'),
    sb.from('holidays').select('tanggal, nama').gte('tanggal', `${tahun}-01-01`).lte('tanggal', `${tahun}-12-31`),
    sb.from('payroll_params').select('key, nilai, status'),
    sb.from('finance_params').select('key, nilai'),
    sb.from('margin_policy').select('kategori_risiko, margin'),
    sb.from('price_items_status').select('id, item, status_efektif'),
    sb.from('it_catalog').select('id, item, status, berlaku_sampai'),
  ]);
  const catatan: string[] = [];
  const u = upah.data?.[0];
  if (!u) catatan.push(`UMK ${t.kab_kota} belum ada di master data.`);
  else if (u.tahun !== tahun) catatan.push(`UMK yang dipakai tahun ${u.tahun}, go-live tahun ${tahun} — perbarui UMK.`);
  const p = Object.fromEntries((pay.data ?? []).map(r => [r.key, Number(r.nilai)]));
  const f = Object.fromEntries((fin.data ?? []).map(r => [r.key, Number(r.nilai)]));
  const draftPay = (pay.data ?? []).filter(r => r.status !== 'approved').map(r => r.key);
  if (draftPay.length) catatan.push(`Komponen OS belum di-approve: ${draftPay.join(', ')}.`);
  const roleDipakai = new Set([...(t.asumsi?.aktivitas ?? []).map(a => a.roleName), ...(t.asumsi?.peranTetap ?? []).map(r => r.roleName), t.asumsi?.roleSupervisor]);
  const jabDraft = (jab.data ?? []).filter(j => roleDipakai.has(j.role_name) && j.status !== 'approved').map(j => j.role_name);
  if (jabDraft.length) catatan.push(`Jabatan belum di-approve: ${jabDraft.join(', ')}.`);
  const itemDipakai = new Set([...(t.asumsi?.costLines ?? []).map(c => c.priceItemId), ...(t.asumsi?.mhe ?? []).map(m => m.priceItemId)].filter(Boolean));
  const hargaBermasalah = (harga.data ?? []).filter(h => itemDipakai.has(h.id) && h.status_efektif !== 'approved');
  const kedaluwarsa = hargaBermasalah.filter(h => h.status_efektif === 'expired').map(h => h.item);
  const hargaDraft = hargaBermasalah.filter(h => h.status_efektif !== 'expired').map(h => h.item);
  if (hargaDraft.length) catatan.push(`Harga belum di-approve: ${hargaDraft.join(', ')}.`);
  const itDipakai = new Set((t.asumsi?.it?.lines ?? []).map(l => l.catalogId).filter(Boolean));
  const hariIni = new Date().toISOString().slice(0, 10);
  for (const c of itc.data ?? []) {
    if (!itDipakai.has(c.id)) continue;
    if (c.berlaku_sampai && c.berlaku_sampai < hariIni) kedaluwarsa.push(`IT ${c.item}`);
    else if (c.status !== 'approved') catatan.push(`Harga IT belum di-approve: ${c.item}.`);
  }
  if (t.asumsi?.gudang && t.warehouse_id == null) catatan.push('Gudang terpilih tidak tertaut ke master gudang.');

  const margin = Object.fromEntries((mar.data ?? []).map(r => [r.kategori_risiko, Number(r.margin)])) as Record<KategoriRisiko, number>;
  return {
    catatan,
    master: {
      upahMinimum: Number(u?.upah_berlaku ?? 0),
      statusUpah: u?.status_verifikasi ?? 'Asumsi',
      jobLevels: (jab.data ?? []).map(j => ({ roleName: j.role_name, klasifikasi: j.klasifikasi, faktorUmk: Number(j.faktor_umk), tunjanganBulan: Number(j.tunjangan_bulan), isOutsourcing: j.is_outsourcing })),
      holidays: (libur.data ?? []).map(h => ({ tanggal: h.tanggal, nama: h.nama })),
      payroll: {
        bpjsJht: p.bpjs_jht ?? 0.037, bpjsJkk: p.bpjs_jkk ?? 0.0089, bpjsJkm: p.bpjs_jkm ?? 0.003, bpjsJp: p.bpjs_jp ?? 0.02, bpjsKes: p.bpjs_kes ?? 0.04,
        batasUpahJp: p.batas_upah_jp ?? 10547400, batasUpahKes: p.batas_upah_kes ?? 12000000,
        thr: p.thr ?? 1 / 12, pesangon: p.pesangon ?? 0.08, contingencyOs: p.contingency_os ?? 0.07, feeOs: p.fee_os ?? 0.05,
      },
      finance: {
        bungaModalTahun: f.bunga_modal_tahun ?? 0.1, apHari: f.ap_hari ?? 30, overheadPersen: f.overhead_persen ?? 0.03,
        pphGrossUp: f.pph_grossup ?? 0.02, gpMinimum: f.gp_minimum ?? 0.08,
      },
      margin: { Rendah: margin.Rendah ?? 0.08, Sedang: margin.Sedang ?? 0.12, Tinggi: margin.Tinggi ?? 0.18 },
      hargaKedaluwarsa: kedaluwarsa,
    },
  };
}
