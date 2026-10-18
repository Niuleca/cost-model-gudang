import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKET_FOTO = 'warehouse-photos';

export interface Warehouse {
  id: string; nama: string; pemilik: string | null; provinsi: string; kab_kota: string; alamat: string | null;
  gmaps_url: string | null; latitude: number | null; longitude: number | null; luas_m2: number;
  harga_sewa_m2_bulan: number | null; harga_per_bulan: number | null; tinggi_bersih_m: number | null;
  daya_lantai_ton_m2: number | null; jumlah_dock: number | null; daya_listrik_kva: number | null; tipe: string;
  fasilitas: string | null; foto: string[]; kontak: string | null; pic_nama?: string | null; pic_telepon?: string | null; sumber: string | null; tanggal_harga: string | null;
  berlaku_sampai: string | null; status: string; updated_at: string;
}

/** Foto = path di Storage, atau URL/path statis (foto hasil import database gudang ada di /warehouses/...). */
export const fotoUrl = (sb: SupabaseClient, path: string) =>
  path.startsWith('/') || path.startsWith('http') ? path : sb.storage.from(BUCKET_FOTO).getPublicUrl(path).data.publicUrl;
export const fotoDiStorage = (path: string) => !path.startsWith('/') && !path.startsWith('http');

/** Tarif sewa per m² efektif: pakai harga per m² kalau ada, kalau tidak harga per bulan ÷ luas. */
export const adaHarga = (w: Pick<Warehouse, 'harga_sewa_m2_bulan' | 'harga_per_bulan'>) => w.harga_sewa_m2_bulan != null || w.harga_per_bulan != null;
export const tarifM2 = (w: Pick<Warehouse, 'harga_sewa_m2_bulan' | 'harga_per_bulan' | 'luas_m2'>) =>
  w.harga_sewa_m2_bulan != null ? Number(w.harga_sewa_m2_bulan) : w.harga_per_bulan != null ? Number(w.harga_per_bulan) / Number(w.luas_m2) : 0;

export const sewaBulanPenuh = (w: Pick<Warehouse, 'harga_sewa_m2_bulan' | 'harga_per_bulan' | 'luas_m2'>) =>
  w.harga_per_bulan != null ? Number(w.harga_per_bulan) : Number(w.harga_sewa_m2_bulan ?? 0) * Number(w.luas_m2);

/** Link Google Maps: pakai URL yang diisi, atau bentuk dari koordinat. */
export const gmapsLink = (w: Pick<Warehouse, 'gmaps_url' | 'latitude' | 'longitude' | 'alamat' | 'kab_kota'>) =>
  w.gmaps_url || (w.latitude != null && w.longitude != null ? `https://www.google.com/maps?q=${w.latitude},${w.longitude}` :
    `https://www.google.com/maps/search/${encodeURIComponent(`${w.alamat ?? ''} ${w.kab_kota}`.trim())}`);

export const kedaluwarsa = (w: Pick<Warehouse, 'berlaku_sampai'>) => !!w.berlaku_sampai && w.berlaku_sampai < new Date().toISOString().slice(0, 10);
