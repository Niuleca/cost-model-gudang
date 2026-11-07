// Master UoM (unit of measure) logistik + kelas berat — sumber drop list di tab Produk, menu Productivity, dan Volume.
// Kode kemasan mengikuti UN/ECE Recommendation 21 (codes for types of cargo, packages and packaging materials);
// hierarki each → inner → case → pallet mengikuti praktik WMS 3PL. Kelas berat memakai acuan:
//  - ISO 11228-1: massa acuan angkat manual 25 kg (kondisi ideal) → di atas itu tim / alat bantu
//  - Heavy lift: ≥ 5.000 kg per potong; FIBC (jumbo bag) SWL umum 500–2.000 kg (faktor aman 5:1 / 6:1)
//  - Palet EUR/standar: beban dinamis ±1.500 kg, statis s/d ±4.000 kg
// Kode lama ('karton', 'palet', 'bag', …) dipertahankan supaya data produktivitas & tender lama tetap cocok.

export type KelompokUom = 'Each / unit' | 'Packaging' | 'Liquid & bulk container' | 'Unit load' | 'Weight' | 'Volume' | 'Order & transaction';

export interface KelasBeratUom {
  kode: string;            // unik per UoM, mis. 'bag-50'
  label: string;           // tampil di drop list, mis. 'Bag 50 kg'
  minKg: number; maxKg: number; tipikalKg: number;
  handling: string;        // cara angkat / alat
  catatan?: string;
}

export interface UomMaster {
  kode: string;            // dipakai di database (productivity.uom, produk.uom)
  nama: string;            // English
  namaId: string;          // Bahasa Indonesia
  kelompok: KelompokUom;
  unece?: string;          // kode UN/ECE Rec. 21 / unit (bila ada)
  ket: string;
  kelas: KelasBeratUom[];  // pilihan berat tipikal (kosong = tidak relevan, mis. order)
}

const k = (kode: string, label: string, minKg: number, maxKg: number, tipikalKg: number, handling: string, catatan?: string): KelasBeratUom =>
  ({ kode, label, minKg, maxKg, tipikalKg, handling, catatan });

// kelas umum per potong (dipakai UoM tanpa kelas khusus)
export const KELAS_UMUM: KelasBeratUom[] = [
  k('light', 'Light ≤ 10 kg', 0, 10, 5, 'manual 1 orang'),
  k('medium', 'Medium 10–25 kg', 10, 25, 18, 'manual 1 orang (batas acuan ISO 11228-1: 25 kg)'),
  k('heavy', 'Heavy 25–50 kg', 25, 50, 40, 'team lift 2 orang / trolley / conveyor'),
  k('xheavy', 'Extra heavy 50–200 kg', 50, 200, 100, 'mekanis: hand pallet, hoist, drum handler'),
  k('unitload', 'Unit load 200–2.000 kg', 200, 2000, 900, 'forklift / reach truck'),
  k('heavycargo', 'Heavy cargo 2–5 ton', 2000, 5000, 3500, 'forklift kapasitas besar (≥ 5 t) / crane'),
  k('heavylift', 'Heavy lift ≥ 5 ton per potong', 5000, 100000, 10000, 'crane / heavy-lift equipment, rigging khusus', 'definisi heavy lift: ≥ 5.000 kg per unit'),
];

export const UOM_MASTER: UomMaster[] = [
  // ---- each / unit
  { kode: 'pcs', nama: 'Piece / each', namaId: 'Pcs / satuan', kelompok: 'Each / unit', unece: 'PP / EA', ket: 'Satuan jual terkecil (each).', kelas: KELAS_UMUM.slice(0, 4) },
  { kode: 'unit', nama: 'Unit (finished good)', namaId: 'Unit', kelompok: 'Each / unit', unece: 'C62', ket: 'Barang jadi per unit: elektronik, appliance, mesin, kendaraan.',
    kelas: [k('unit-small', 'Small unit ≤ 25 kg', 0, 25, 10, 'manual 1 orang'), k('unit-large', 'Large unit 25–100 kg (kulkas, mesin cuci)', 25, 100, 60, '2 orang / trolley / clamp'),
      k('unit-bike', 'Sepeda motor 100–200 kg', 100, 200, 130, 'didorong / crate + forklift'), k('unit-car', 'Mobil 1–2,5 ton', 1000, 2500, 1500, 'dikemudikan / car carrier'),
      k('unit-machine', 'Mesin 200 kg–5 ton', 200, 5000, 1500, 'forklift / crane'), k('unit-heavylift', 'Mesin / alat berat ≥ 5 ton', 5000, 100000, 12000, 'crane, heavy lift', 'heavy lift ≥ 5 t')] },
  { kode: 'set', nama: 'Set / kit', namaId: 'Set', kelompok: 'Each / unit', unece: 'SET', ket: 'Kumpulan item yang dijual satu paket.', kelas: KELAS_UMUM.slice(0, 4) },
  { kode: 'pair', nama: 'Pair', namaId: 'Pasang', kelompok: 'Each / unit', unece: 'PR', ket: 'Sepatu, sarung tangan.', kelas: KELAS_UMUM.slice(0, 2) },
  { kode: 'sheet', nama: 'Sheet / plate', namaId: 'Lembar / plat', kelompok: 'Each / unit', unece: 'ST', ket: 'Plat, panel, kaca, gypsum.', kelas: KELAS_UMUM.slice(0, 5) },
  // ---- packaging
  { kode: 'inner', nama: 'Inner pack', namaId: 'Inner / pak dalam', kelompok: 'Packaging', unece: 'PA', ket: 'Kemasan antara: beberapa pcs di dalam karton.', kelas: KELAS_UMUM.slice(0, 2) },
  { kode: 'pack', nama: 'Pack / packet', namaId: 'Pack', kelompok: 'Packaging', unece: 'PK', ket: 'Paket / polybag e-commerce.', kelas: KELAS_UMUM.slice(0, 3) },
  { kode: 'box', nama: 'Box', namaId: 'Box / dus kecil', kelompok: 'Packaging', unece: 'BX', ket: 'Kotak (farmasi, sparepart).', kelas: KELAS_UMUM.slice(0, 3) },
  { kode: 'karton', nama: 'Carton / case', namaId: 'Karton / case', kelompok: 'Packaging', unece: 'CT / CS', ket: 'Master carton / outer case — UoM handling paling umum.',
    kelas: [k('ctn-light', 'Carton light ≤ 10 kg', 0, 10, 6, 'manual 1 orang'), k('ctn-std', 'Carton standard 10–25 kg', 10, 25, 15, 'manual 1 orang'),
      k('ctn-heavy', 'Carton heavy 25–35 kg', 25, 35, 30, 'team lift / conveyor / clamp'), k('ctn-xheavy', 'Carton > 35 kg', 35, 80, 45, 'mekanis (clamp, hoist)')] },
  { kode: 'crate', nama: 'Crate', namaId: 'Peti kayu / crate', kelompok: 'Packaging', unece: 'CR', ket: 'Peti kayu untuk sparepart besar, mesin.', kelas: KELAS_UMUM.slice(2) },
  { kode: 'bag', nama: 'Bag / sack', namaId: 'Bag / sak / karung', kelompok: 'Packaging', unece: 'BG / SA', ket: 'Karung: beras, gula, tepung, semen, pupuk, resin, pakan.',
    kelas: [k('bag-5', 'Bag 5 kg', 4, 6, 5, 'manual'), k('bag-10', 'Bag 10 kg', 8, 12, 10, 'manual'), k('bag-20', 'Bag 20 kg', 18, 22, 20, 'manual'),
      k('bag-25', 'Bag 25 kg (resin, tepung, gula)', 23, 27, 25, 'manual 1 orang — batas acuan ISO 11228-1'),
      k('bag-40', 'Bag 40 kg (semen 40 kg)', 38, 42, 40, 'manual berat: rotasi / 2 orang / conveyor'),
      k('bag-50', 'Bag 50 kg (semen, pupuk, beras)', 48, 52, 50, 'heavy: 2 orang / conveyor / palletize + hand pallet'),
      k('bag-100', 'Bag 100 kg', 95, 105, 100, 'mekanis saja (hoist / forklift)', 'di atas kemampuan angkat manual')] },
  { kode: 'jumbo_bag', nama: 'Jumbo bag (FIBC / bulk bag)', namaId: 'Jumbo bag (FIBC)', kelompok: 'Packaging', unece: 'JB', ket: 'Flexible intermediate bulk container — diangkat dengan loop oleh forklift/crane.',
    kelas: [k('fibc-500', 'Jumbo bag 500 kg', 450, 550, 500, 'forklift dengan loop'), k('fibc-1000', 'Jumbo bag 1.000 kg', 900, 1100, 1000, 'forklift dengan loop'),
      k('fibc-1500', 'Jumbo bag 1.500 kg', 1400, 1600, 1500, 'forklift ≥ 2,5 t'), k('fibc-2000', 'Jumbo bag 2.000 kg', 1900, 2100, 2000, 'forklift ≥ 3 t / crane', 'SWL umum FIBC s/d 2.000 kg')] },
  { kode: 'bale', nama: 'Bale', namaId: 'Bal', kelompok: 'Packaging', unece: 'BL', ket: 'Kapas, tekstil, kertas bekas, karet.',
    kelas: [k('bale-50', 'Bale ≤ 50 kg (tekstil)', 20, 50, 40, 'manual 2 orang'), k('bale-250', 'Bale 150–250 kg (kapas)', 150, 250, 220, 'forklift / clamp'), k('bale-1000', 'Bale 500–1.000 kg (kertas bekas)', 500, 1000, 700, 'forklift clamp')] },
  { kode: 'bundle', nama: 'Bundle', namaId: 'Ikat / bundel', kelompok: 'Packaging', unece: 'BE', ket: 'Besi beton, pipa, kayu, profil.', kelas: KELAS_UMUM.slice(3) },
  { kode: 'roll', nama: 'Roll', namaId: 'Rol', kelompok: 'Packaging', unece: 'RO', ket: 'Kain, film plastik, kertas, kabel.',
    kelas: [k('roll-fabric', 'Roll kain / film ≤ 60 kg', 10, 60, 30, 'manual 2 orang / trolley'), k('roll-paper', 'Roll kertas 500–3.000 kg', 500, 3000, 1200, 'forklift paper-roll clamp')] },
  { kode: 'reel', nama: 'Reel / drum kabel', namaId: 'Reel', kelompok: 'Packaging', unece: 'RL', ket: 'Kabel, selang.', kelas: KELAS_UMUM.slice(2, 6) },
  { kode: 'coil', nama: 'Coil', namaId: 'Coil / gulungan', kelompok: 'Packaging', unece: 'CL', ket: 'Coil baja/aluminium — heavy cargo.',
    kelas: [k('coil-light', 'Coil ≤ 5 ton (wire rod, alu)', 500, 5000, 2500, 'forklift ram / crane'), k('coil-steel', 'Coil baja 5–25 ton', 5000, 25000, 15000, 'overhead crane, C-hook', 'heavy lift ≥ 5 t')] },
  // ---- liquid & bulk containers
  { kode: 'pail', nama: 'Pail', namaId: 'Pail / ember', kelompok: 'Liquid & bulk container', unece: 'PL', ket: 'Cat, oli, bahan kimia.',
    kelas: [k('pail-5', 'Pail 5 L (± 5–7 kg)', 4, 8, 6, 'manual'), k('pail-20', 'Pail 20 L (± 20–25 kg)', 18, 27, 23, 'manual 1 orang — mendekati batas 25 kg')] },
  { kode: 'jerrican', nama: 'Jerrican', namaId: 'Jeriken', kelompok: 'Liquid & bulk container', unece: 'JC', ket: 'Cairan 20–30 L.',
    kelas: [k('jc-20', 'Jerrican 20 L (± 20–25 kg)', 18, 27, 23, 'manual'), k('jc-30', 'Jerrican 30 L (± 30–35 kg)', 28, 37, 33, 'team lift / trolley')] },
  { kode: 'drum', nama: 'Drum', namaId: 'Drum', kelompok: 'Liquid & bulk container', unece: 'DR', ket: 'Drum 200 L baja / plastik.',
    kelas: [k('drum-50', 'Drum 50 L (± 50–60 kg)', 45, 65, 55, 'drum trolley'), k('drum-200', 'Drum 200 L (± 180–250 kg)', 180, 250, 220, 'drum handler / forklift drum grab, 4 drum per palet')] },
  { kode: 'ibc', nama: 'IBC tote 1.000 L', namaId: 'IBC 1.000 L', kelompok: 'Liquid & bulk container', unece: 'WA', ket: 'Intermediate bulk container cairan.',
    kelas: [k('ibc-1000', 'IBC 1.000 L (± 1.000–1.300 kg)', 950, 1400, 1150, 'forklift, tidak ditumpuk > 2 tingkat')] },
  { kode: 'cylinder', nama: 'Gas cylinder', namaId: 'Tabung gas', kelompok: 'Liquid & bulk container', unece: 'CY', ket: 'Tabung gas industri (DG).',
    kelas: [k('cyl-small', 'Tabung ≤ 25 kg', 5, 25, 15, 'manual / trolley tabung'), k('cyl-std', 'Tabung 50–80 kg (6 m³)', 50, 80, 65, 'trolley tabung / rak tabung')] },
  // ---- unit load
  { kode: 'palet', nama: 'Pallet', namaId: 'Palet', kelompok: 'Unit load', unece: 'PX', ket: 'Unit load standar (1,2 × 1,0 m / 1,2 × 0,8 m).',
    kelas: [k('plt-light', 'Pallet light ≤ 500 kg', 0, 500, 400, 'semua level rak'), k('plt-std', 'Pallet standard 500–1.000 kg', 500, 1000, 750, 'rak s/d level sesuai beam'),
      k('plt-heavy', 'Pallet heavy 1.000–1.500 kg', 1000, 1500, 1200, 'level bawah / beam berat', 'beban dinamis palet ±1.500 kg'),
      k('plt-xheavy', 'Pallet > 1.500 kg', 1500, 4000, 2000, 'lantai / block stack saja', 'statis s/d ±4.000 kg')] },
  { kode: 'skid', nama: 'Skid', namaId: 'Skid', kelompok: 'Unit load', unece: 'SI', ket: 'Alas mesin / barang berat.', kelas: KELAS_UMUM.slice(4) },
  { kode: 'container', nama: 'Container 20\' / 40\'', namaId: 'Kontainer', kelompok: 'Unit load', unece: 'CN', ket: 'Stuffing / stripping per kontainer.',
    kelas: [k('cont-20', 'Container 20\' (payload ± 21–28 t)', 0, 28000, 18000, 'reach stacker / side loader'), k('cont-40', 'Container 40\' (payload ± 26–28 t)', 0, 28000, 22000, 'reach stacker / side loader')] },
  // ---- weight / volume
  { kode: 'kg', nama: 'Kilogram', namaId: 'Kilogram', kelompok: 'Weight', unece: 'KGM', ket: 'Barang curah / timbang.', kelas: [] },
  { kode: 'ton', nama: 'Ton (metric)', namaId: 'Ton', kelompok: 'Weight', unece: 'TNE', ket: 'Bulk, bahan baku.', kelas: [] },
  { kode: 'liter', nama: 'Liter', namaId: 'Liter', kelompok: 'Volume', unece: 'LTR', ket: 'Cairan.', kelas: [] },
  { kode: 'cbm', nama: 'Cubic meter', namaId: 'CBM / m³', kelompok: 'Volume', unece: 'MTQ', ket: 'Barang voluminous (furniture, appliance).', kelas: [] },
  // ---- order & transaction (produktivitas admin / picking)
  { kode: 'order', nama: 'Order', namaId: 'Order / DO', kelompok: 'Order & transaction', ket: 'Dokumen order / delivery order.', kelas: [] },
  { kode: 'line', nama: 'Order line', namaId: 'Line', kelompok: 'Order & transaction', ket: 'Baris SKU dalam order.', kelas: [] },
  { kode: 'lokasi', nama: 'Location', namaId: 'Lokasi', kelompok: 'Order & transaction', ket: 'Lokasi rak (cycle count).', kelas: [] },
];

export const KODE_UOM = UOM_MASTER.map(u => u.kode);
export const uomDari = (kode?: string | null) => UOM_MASTER.find(u => u.kode === kode || u.kode === normalUom(kode));
/** Sinonim lama → kode master (data lama memakai 'case', 'dus', 'sak', 'pallet', dll). */
export function normalUom(v?: string | null): string {
  const s = (v ?? '').trim().toLowerCase();
  const peta: Record<string, string> = { case: 'karton', carton: 'karton', ctn: 'karton', dus: 'karton', cs: 'karton', pallet: 'palet', plt: 'palet', sak: 'bag', karung: 'bag', sack: 'bag',
    each: 'pcs', ea: 'pcs', pc: 'pcs', piece: 'pcs', botol: 'pcs', kaleng: 'pcs', sachet: 'pcs', fibc: 'jumbo_bag', 'jumbo bag': 'jumbo_bag', tote: 'ibc', m3: 'cbm', 'm³': 'cbm', l: 'liter', kgs: 'kg' };
  return peta[s] ?? s;
}
/** Kelas berat yang cocok dengan berat per UoM (kg). */
export function kelasDariBerat(kode: string, kg: number): KelasBeratUom | undefined {
  const u = uomDari(kode); const daftar = u?.kelas.length ? u.kelas : KELAS_UMUM;
  return daftar.find(c => kg >= c.minKg && kg <= c.maxKg) ?? daftar.find(c => kg < c.maxKg) ?? daftar[daftar.length - 1];
}
export const SUMBER_UOM = [
  { judul: 'UN/ECE Recommendation 21 — codes for types of cargo, packages and packaging materials', url: 'https://docs.peppol.eu/poacc/upgrade-3/codelist/UNECERec21/' },
  { judul: 'Extensiv 3PL Warehouse Manager — understanding units of measure', url: 'https://help.extensiv.com/en_US/understanding-units-of-measure' },
  { judul: 'Packaging hierarchy: each, inner pack, case, pallet', url: 'https://racklify.com/encyclopedia/packaging-hierarchy-definition-and-standard-levels/' },
  { judul: 'ISO 11228-1 — reference mass 25 kg for manual lifting (Schmalz glossary)', url: 'https://www.schmalz.com/en/support/know-how/glossary/iso-11228' },
  { judul: 'FIBC safe working load & safety factor 5:1 / 6:1 (Global-Pak)', url: 'https://www.global-pak.com/blog/safe-working-load-from-global-pak-newsletter-june-2017' },
  { judul: 'Heavy lift cargo: minimum 5.000 kg per unit', url: 'https://jur.ph/law/facts/heavy-lift-cargo-definition-clarification-and-classification' },
  { judul: 'EUR pallet: dynamic ±1.500 kg, static up to 4.000 kg', url: 'https://hz-containers.com/en/news/how-many-kg-can-be-on-a-eur-pallet-in-a-shipping-container/' },
  { judul: 'Maersk — break bulk & out-of-gauge cargo', url: 'https://www.maersk.com/logistics-explained/transportation-and-freight/2024/09/18/break-bulk-cargo' },
];
