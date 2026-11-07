// Kategori bisnis (business category) — dipakai di Key assumption (industri tender), menu Productivity (drop list pertama),
// benchmark produktivitas, dan filter analitik. Disusun dari industri tender & sektor di data customer (Business Trend Intelligence).

export interface KategoriBisnis {
  nama: string;            // label & nilai tersimpan (English)
  contoh: string;          // contoh komoditas
  uom: string[];           // UoM yang relevan (urut paling umum) — kode dari lib/uom
  lama: string[];          // nama industri lama yang dipetakan ke kategori ini
}

export const KATEGORI_BISNIS: KategoriBisnis[] = [
  { nama: 'FMCG', contoh: 'Food & beverage, personal & home care', uom: ['karton', 'palet', 'pcs', 'inner', 'bag', 'pail', 'liter', 'order', 'line'], lama: ['FMCG', 'FMCG (makanan & minuman)', 'Makanan & minuman'] },
  { nama: 'Retail & E-commerce', contoh: 'Ritel modern, marketplace, fulfillment', uom: ['pcs', 'pack', 'karton', 'order', 'line', 'palet'], lama: ['Retail-Consumer', 'E-Commerce', 'E-commerce', 'Retail'] },
  { nama: 'Fashion, Textile & Footwear', contoh: 'Garmen, kain, sepatu', uom: ['pcs', 'pair', 'pack', 'karton', 'roll', 'bale', 'palet', 'order', 'line'], lama: ['Fashion Retail', 'Fashion', 'Tekstil'] },
  { nama: 'Healthcare & Pharma', contoh: 'Obat, alat kesehatan, suplemen', uom: ['pcs', 'box', 'karton', 'palet', 'order', 'line'], lama: ['Healthcare', 'Farmasi'] },
  { nama: 'Cold Chain', contoh: 'Frozen, chilled, seafood, vaksin', uom: ['karton', 'palet', 'kg', 'pcs', 'order'], lama: ['Healthcare + Cold Chain', 'Cold chain'] },
  { nama: 'Technology & Electronics', contoh: 'Gadget, komponen, baterai EV', uom: ['unit', 'pcs', 'karton', 'palet', 'order', 'line'], lama: ['Tech', 'Elektronik'] },
  { nama: 'Home Appliances & Furniture', contoh: 'Kulkas, mesin cuci, mebel', uom: ['unit', 'karton', 'crate', 'cbm', 'palet'], lama: ['Home appliance'] },
  { nama: 'Automotive & Spare Parts', contoh: 'Kendaraan, sparepart, ban', uom: ['pcs', 'unit', 'box', 'karton', 'crate', 'palet'], lama: ['Otomotif'] },
  { nama: 'Heavy Cargo & Machinery', contoh: 'Mesin, alat berat, project cargo', uom: ['unit', 'crate', 'skid', 'coil', 'ton', 'cbm'], lama: ['Heavy cargo', 'Machine'] },
  { nama: 'Raw Material & Bulk', contoh: 'Logam, mineral, sawit, resin, pakan', uom: ['bag', 'jumbo_bag', 'ton', 'drum', 'coil', 'bale', 'palet'], lama: ['Raw material'] },
  { nama: 'Building Materials', contoh: 'Semen, keramik, baja ringan, cat', uom: ['bag', 'palet', 'pcs', 'sheet', 'bundle', 'pail', 'ton'], lama: ['Bahan bangunan'] },
  { nama: 'Chemicals (non-DG)', contoh: 'Kimia industri non-B3', uom: ['drum', 'ibc', 'pail', 'bag', 'jumbo_bag', 'palet', 'liter'], lama: ['Kimia', 'kimia'] },
  { nama: 'Dangerous Goods (DG)', contoh: 'B3: flammable, corrosive, gas', uom: ['drum', 'ibc', 'jerrican', 'cylinder', 'pail', 'karton', 'palet'], lama: ['DG', 'B3'] },
  { nama: 'Paper, Pulp & Packaging', contoh: 'Kertas, pulp, kemasan', uom: ['roll', 'bale', 'karton', 'palet', 'ton', 'sheet'], lama: ['Kertas'] },
  { nama: 'General Cargo', contoh: 'Umum / campuran — berlaku untuk semua kategori', uom: ['pcs', 'karton', 'palet', 'bag', 'ton', 'cbm', 'liter', 'pail', 'pack', 'roll', 'order', 'line', 'lokasi'], lama: ['Umum'] },
];
export const NAMA_KATEGORI = KATEGORI_BISNIS.map(k => k.nama);
export const KATEGORI_UMUM = 'General Cargo';
/** Nama industri lama / bebas → kategori baru (null bila tidak dikenali). */
export function kategoriDari(v?: string | null): string | null {
  const s = (v ?? '').trim().toLowerCase(); if (!s) return null;
  const k = KATEGORI_BISNIS.find(x => x.nama.toLowerCase() === s || x.lama.some(l => l.toLowerCase() === s));
  return k?.nama ?? null;
}
export const kategori = (nama?: string | null) => KATEGORI_BISNIS.find(k => k.nama === kategoriDari(nama)) ?? KATEGORI_BISNIS[KATEGORI_BISNIS.length - 1];
