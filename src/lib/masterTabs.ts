// Konfigurasi tab master data per departemen (dipakai halaman HR, Procurement, IT, Operations, Master).
import type { Kolom } from '@/components/TableEditor';
import type { AppRole } from '@/lib/format';
import { INDUSTRI } from '@/lib/format';
import { COST_TYPES, KELOMPOK_IT } from '@/lib/it';

export const KAT_HARGA = ['Gudang','MHE','Racking','Palet','Office','ATK','Seragam','Konsumsi','Printer','Rental Office','IT','Software','HSE','Konstruksi','Pest Control','Asuransi','Security','Cleaning','Utilitas','Lainnya'];
export const KAT_KANTOR = ['Office', 'ATK', 'Printer', 'Konsumsi', 'Rental Office'];
export const KAT_GUDANG = ['Palet', 'Racking', 'HSE', 'Seragam', 'Pest Control', 'Asuransi', 'Security', 'Cleaning', 'Utilitas', 'Konstruksi', 'Lainnya'];
const ROLES: AppRole[] = ['procurement','it','engineering','operations','hr','finance','commercial','solution_design','admin'];

export interface Tab {
  id: string; label: string; pemilik: string; table: string; view?: string; idKey?: string;
  kolom: Kolom[]; editorRoles: AppRole[]; approval?: boolean; orderBy?: { col: string; asc?: boolean }[];
  cari?: string[]; catatan?: string; defaults?: Record<string, unknown>; filter?: Record<string, string | string[]>;
  kelompok?: string;
}

export const TABS: Tab[] = [
  { id: 'umk', label: 'UMK / UMP', pemilik: 'HR', table: 'umk', editorRoles: ['hr'],
    orderBy: [{ col: 'provinsi' }, { col: 'kab_kota' }], cari: ['provinsi', 'kab_kota', 'status_verifikasi'],
    catatan: 'Nilai UMK kosong = mengikuti UMP provinsi. Status "Asumsi ikut UMP" wajib diverifikasi ke SK sebelum quotation final.',
    defaults: { tahun: 2026 },
    kolom: [
      { key: 'tahun', label: 'Tahun', type: 'number', width: 70 },
      { key: 'provinsi', label: 'Provinsi' }, { key: 'kab_kota', label: 'Kabupaten/Kota' },
      { key: 'jenis', label: 'Jenis', type: 'select', options: ['Kabupaten', 'Kota'] },
      { key: 'nilai_umk', label: 'UMK (Rp)', type: 'number' },
      { key: 'status_verifikasi', label: 'Verifikasi', type: 'select', options: ['SK resmi', 'Media + no. SK', 'Media', 'Asumsi ikut UMP'] },
      { key: 'dasar_hukum', label: 'Dasar hukum' }, { key: 'sumber', label: 'Sumber' }, { key: 'catatan', label: 'Catatan' },
    ] },
  { id: 'ump', label: 'UMP Provinsi', pemilik: 'HR', table: 'ump', editorRoles: ['hr'], orderBy: [{ col: 'provinsi' }],
    defaults: { tahun: 2026 },
    kolom: [
      { key: 'tahun', label: 'Tahun', type: 'number', width: 70 }, { key: 'provinsi', label: 'Provinsi' },
      { key: 'nilai', label: 'UMP (Rp)', type: 'number' }, { key: 'dasar_hukum', label: 'Dasar hukum' },
      { key: 'sumber', label: 'Sumber' }, { key: 'catatan', label: 'Catatan' },
    ] },
  { id: 'jabatan', label: 'Jabatan', pemilik: 'HR', table: 'job_levels', editorRoles: ['hr', 'solution_design'], approval: true,
    orderBy: [{ col: 'klasifikasi' }, { col: 'role_name' }],
    catatan: 'Upah = UMK lokasi × faktor. Outsourcing = kena contingency 7% dan fee OS.',
    kolom: [
      { key: 'role_name', label: 'Jabatan' },
      { key: 'klasifikasi', label: 'Klasifikasi', type: 'select', options: ['Blue Collar', 'White Collar'] },
      { key: 'faktor_umk', label: 'Faktor × UMK', type: 'number', width: 80 },
      { key: 'tunjangan_bulan', label: 'Tunjangan/bln', type: 'number' },
      { key: 'is_outsourcing', label: 'Outsourcing', type: 'bool' }, { key: 'sumber', label: 'Sumber' },
    ] },
  { id: 'payroll', label: 'Komponen OS', pemilik: 'HR', table: 'payroll_params', idKey: 'key', editorRoles: ['hr', 'solution_design'], approval: true,
    orderBy: [{ col: 'key' }],
    catatan: 'Persentase diisi dalam %. Batas upah diisi dalam Rupiah (kolom nilai).',
    kolom: [
      { key: 'key', label: 'Kode', readonly: true }, { key: 'label', label: 'Komponen' },
      { key: 'nilai', label: 'Nilai', type: 'number' }, { key: 'dasar_hukum', label: 'Dasar hukum' }, { key: 'catatan', label: 'Catatan' },
    ] },
  { id: 'harga', label: 'Harga item', pemilik: 'Procurement / IT / Engineering', table: 'price_items', view: 'price_items_status', editorRoles: ['procurement', 'it', 'engineering'],
    approval: true, orderBy: [{ col: 'kategori' }, { col: 'item' }], cari: ['kategori', 'item', 'vendor', 'sumber'],
    catatan: 'Isi vendor, tanggal harga, dan masa berlaku. Harga yang lewat masa berlaku otomatis berstatus expired dan muncul sebagai red flag di tender.',
    kolom: [
      { key: 'kategori', label: 'Kategori', type: 'select', options: KAT_HARGA }, { key: 'item', label: 'Item', width: 240 },
      { key: 'satuan', label: 'Satuan', width: 90 },
      { key: 'harga_beli', label: 'Harga beli', type: 'number' }, { key: 'harga_sewa_bulan', label: 'Sewa/bln', type: 'number' },
      { key: 'umur_ekonomis_bulan', label: 'Umur (bln)', type: 'number', width: 70 }, { key: 'daya_watt', label: 'Watt', type: 'number', width: 70 },
      { key: 'vendor', label: 'Vendor' }, { key: 'tanggal_harga', label: 'Tgl harga', type: 'date' }, { key: 'berlaku_sampai', label: 'Berlaku s.d.', type: 'date' },
      { key: 'owner_role', label: 'Pemilik', type: 'select', options: ROLES }, { key: 'sumber', label: 'Sumber', width: 220 },
    ] },
  { id: 'mhe', kelompok: 'mhe_tipe', label: 'MHE / forklift', pemilik: 'Procurement', table: 'price_items', view: 'price_items_status', editorRoles: ['procurement'],
    approval: true, filter: { kategori: 'MHE' }, defaults: { kategori: 'MHE', owner_role: 'procurement', satuan: 'unit' },
    orderBy: [{ col: 'mhe_tipe' }, { col: 'kapasitas_ton' }], cari: ['item', 'mhe_tipe', 'vendor', 'sumber_tenaga'],
    catatan: 'Isi tipe & tonase supaya Solution Design bisa memilih unit yang sesuai beban (2,5 / 3 / 5 / 10 ton). Sewa/bln untuk skema sewa, harga beli + umur untuk skema beli.',
    kolom: [
      { key: 'mhe_tipe', label: 'Tipe', type: 'select', options: ['Counter Balance', 'Reach Truck', 'Pallet Mover', 'Hand Pallet', 'Stacker', 'VNA', 'Order Picker', 'Clamp', 'Lainnya'] },
      { key: 'kapasitas_ton', label: 'Kapasitas (ton)', type: 'number', width: 70 },
      { key: 'sumber_tenaga', label: 'Tenaga', type: 'select', options: ['Electric', 'Diesel', 'LPG', 'Manual'] },
      { key: 'tinggi_angkat_m', label: 'Tinggi angkat (m)', type: 'number', width: 70 },
      { key: 'item', label: 'Nama item', width: 220 },
      { key: 'harga_sewa_bulan', label: 'Sewa/bln', type: 'number' }, { key: 'harga_beli', label: 'Harga beli', type: 'number' },
      { key: 'umur_ekonomis_bulan', label: 'Umur (bln)', type: 'number', width: 70 }, { key: 'daya_watt', label: 'Watt charger', type: 'number', width: 80 },
      { key: 'vendor', label: 'Vendor' }, { key: 'spesifikasi', label: 'Spesifikasi' },
      { key: 'tanggal_harga', label: 'Tgl harga', type: 'date' }, { key: 'berlaku_sampai', label: 'Berlaku s.d.', type: 'date' }, { key: 'sumber', label: 'Sumber' },
    ] },
  { id: 'kantor', kelompok: 'kategori', label: 'Kebutuhan kantor', pemilik: 'Procurement / Engineering', table: 'price_items', view: 'price_items_status', editorRoles: ['procurement', 'engineering'],
    approval: true, filter: { kategori: KAT_KANTOR }, defaults: { owner_role: 'procurement', kategori: 'Office' },
    orderBy: [{ col: 'kategori' }, { col: 'item' }], cari: ['kategori', 'item', 'vendor', 'sumber'],
    catatan: 'Kebutuhan ruang kantor: furnitur & elektronik office, ATK, printer (termasuk dot matrix), konsumsi/air minum, sewa ruang kantor. Harga lewat masa berlaku otomatis expired dan jadi red flag di tender.',
    kolom: [
      { key: 'kategori', label: 'Kategori', type: 'select', options: KAT_KANTOR }, { key: 'item', label: 'Item', width: 240 },
      { key: 'satuan', label: 'Satuan', width: 90 },
      { key: 'harga_beli', label: 'Harga beli', type: 'number' }, { key: 'harga_sewa_bulan', label: 'Sewa/bln', type: 'number' },
      { key: 'umur_ekonomis_bulan', label: 'Umur (bln)', type: 'number', width: 70 }, { key: 'daya_watt', label: 'Watt', type: 'number', width: 70 },
      { key: 'vendor', label: 'Vendor' }, { key: 'tanggal_harga', label: 'Tgl harga', type: 'date' }, { key: 'berlaku_sampai', label: 'Berlaku s.d.', type: 'date' },
      { key: 'owner_role', label: 'Pemilik', type: 'select', options: ['procurement', 'engineering'] }, { key: 'sumber', label: 'Sumber', width: 220 },
    ] },
  { id: 'gudangkeb', kelompok: 'kategori', label: 'Kebutuhan gudang', pemilik: 'Procurement / Engineering', table: 'price_items', view: 'price_items_status', editorRoles: ['procurement', 'engineering'],
    approval: true, filter: { kategori: KAT_GUDANG }, defaults: { owner_role: 'procurement', kategori: 'Palet' },
    orderBy: [{ col: 'kategori' }, { col: 'item' }], cari: ['kategori', 'item', 'vendor', 'sumber'],
    catatan: 'Kebutuhan area gudang: palet, racking, HSE/APD, seragam, pest control, asuransi, security, cleaning, utilitas, konstruksi. Harga lewat masa berlaku otomatis expired dan jadi red flag di tender.',
    kolom: [
      { key: 'kategori', label: 'Kategori', type: 'select', options: KAT_GUDANG }, { key: 'item', label: 'Item', width: 240 },
      { key: 'satuan', label: 'Satuan', width: 90 },
      { key: 'harga_beli', label: 'Harga beli', type: 'number' }, { key: 'harga_sewa_bulan', label: 'Sewa/bln', type: 'number' },
      { key: 'umur_ekonomis_bulan', label: 'Umur (bln)', type: 'number', width: 70 }, { key: 'daya_watt', label: 'Watt', type: 'number', width: 70 },
      { key: 'vendor', label: 'Vendor' }, { key: 'tanggal_harga', label: 'Tgl harga', type: 'date' }, { key: 'berlaku_sampai', label: 'Berlaku s.d.', type: 'date' },
      { key: 'owner_role', label: 'Pemilik', type: 'select', options: ['procurement', 'engineering'] }, { key: 'sumber', label: 'Sumber', width: 220 },
    ] },
  { id: 'itkatalog', kelompok: 'kelompok', label: 'Katalog IT', pemilik: 'IT', table: 'it_catalog', editorRoles: ['it'], approval: true,
    orderBy: [{ col: 'kelompok' }, { col: 'urutan' }, { col: 'item' }], cari: ['kelompok', 'item', 'cost_type', 'deskripsi'],
    catatan: 'Format BAP KLOG. Basis menentukan cara masuk cost model: Bulanan (PUPM, PDPM, Cost/Month, Monthly/Site), Transaksi (slab per bulan), Tahunan (÷12), Sekali (OTC, OTC/Unit, Cost/Mandays). Harga slab diisi satu baris per slab dengan rentang min–maks.',
    defaults: { basis: 'Bulanan' },
    kolom: [
      { key: 'kelompok', label: 'Kelompok', type: 'select', options: KELOMPOK_IT }, { key: 'item', label: 'Item', width: 220 },
      { key: 'deskripsi', label: 'Deskripsi', width: 200 },
      { key: 'cost_type', label: 'Cost type', type: 'select', options: COST_TYPES.map(c => c.v) },
      { key: 'basis', label: 'Basis', type: 'select', options: ['Bulanan', 'Transaksi', 'Tahunan', 'Sekali'] },
      { key: 'harga', label: 'Harga (Rp)', type: 'number' },
      { key: 'slab_min', label: 'Slab min', type: 'number', width: 80 }, { key: 'slab_max', label: 'Slab maks', type: 'number', width: 80 },
      { key: 'urutan', label: 'Urutan', type: 'number', width: 60 },
      { key: 'tanggal_harga', label: 'Tgl harga', type: 'date' }, { key: 'berlaku_sampai', label: 'Berlaku s.d.', type: 'date' }, { key: 'sumber', label: 'Sumber', width: 200 },
    ] },
  { id: 'produktivitas', label: 'Produktivitas', pemilik: 'Operations', table: 'productivity', editorRoles: ['operations', 'solution_design'], approval: true,
    orderBy: [{ col: 'tahap' }, { col: 'aktivitas' }], cari: ['aktivitas', 'tahap', 'tool', 'role_name', 'uom', 'industri'],
    catatan: 'Prod/jam = angka yang dipakai cost model (hasil time motion study atau benchmark). Kolom industri = rentang benchmark, mis. "30-40". Detik/UoM = 3.600 ÷ prod/jam (otomatis).',
    kolom: [
      { key: 'tahap', label: 'Tahap' }, { key: 'aktivitas', label: 'Aktivitas', width: 240 }, { key: 'tool', label: 'Tool', width: 90 },
      { key: 'role_name', label: 'Role' },
      { key: 'uom', label: 'UoM', type: 'select', options: ['pcs', 'karton', 'ton', 'cbm', 'liter', 'bag', 'pail', 'pack', 'roll', 'palet', 'order', 'line', 'lokasi'] },
      { key: 'kelas_berat', label: 'Kelas berat', type: 'select', options: ['semua', 'light', 'medium', 'heavy'] },
      { key: 'industri', label: 'Industri' }, { key: 'prod_per_jam', label: 'Prod/jam', type: 'number', width: 80 },
      { key: 'detik_per_uom', label: 'Detik/UoM', type: 'number', readonly: true, width: 70 },
      ...INDUSTRI.slice(0, 6).map(i => ({ key: `benchmark.${i}`, label: `${i} (rentang/jam)`, width: 90 } as Kolom)),
      { key: 'metode', label: 'Metode', type: 'select', options: ['Time Motion Study', 'Benchmark', 'Asumsi'] },
      { key: 'sumber', label: 'Sumber' }, { key: 'tanggal', label: 'Tanggal', type: 'date' }, { key: 'catatan', label: 'Catatan' },
    ] },
  { id: 'kalender', label: 'Kalender libur', pemilik: 'Operations', table: 'holidays', idKey: 'tanggal', editorRoles: ['operations', 'hr'],
    orderBy: [{ col: 'tanggal' }],
    kolom: [
      { key: 'tanggal', label: 'Tanggal', type: 'date' }, { key: 'nama', label: 'Nama' },
      { key: 'jenis', label: 'Jenis', type: 'select', options: ['Libur Nasional', 'Cuti Bersama'] }, { key: 'sumber', label: 'Sumber' },
    ] },
  { id: 'listrik', label: 'Tarif listrik', pemilik: 'Engineering', table: 'electricity_tariffs', editorRoles: ['engineering'], approval: true,
    orderBy: [{ col: 'golongan' }],
    kolom: [
      { key: 'golongan', label: 'Golongan' }, { key: 'daya_min_va', label: 'Daya min (VA)', type: 'number' },
      { key: 'daya_max_va', label: 'Daya maks (VA)', type: 'number' }, { key: 'tarif_kwh', label: 'Tarif/kWh', type: 'number' },
      { key: 'berlaku_mulai', label: 'Berlaku mulai', type: 'date' }, { key: 'sumber', label: 'Sumber' },
    ] },
  { id: 'keuangan', label: 'Parameter keuangan', pemilik: 'Finance', table: 'finance_params', idKey: 'key', editorRoles: ['finance'],
    orderBy: [{ col: 'key' }],
    kolom: [{ key: 'key', label: 'Kode', readonly: true }, { key: 'label', label: 'Parameter' }, { key: 'nilai', label: 'Nilai', type: 'number' }, { key: 'catatan', label: 'Catatan' }] },
  { id: 'margin', label: 'Margin per risiko', pemilik: 'Finance', table: 'margin_policy', idKey: 'kategori_risiko', editorRoles: ['finance'],
    orderBy: [{ col: 'margin' }],
    kolom: [{ key: 'kategori_risiko', label: 'Kategori risiko', readonly: true }, { key: 'margin', label: 'Margin', type: 'percent' }, { key: 'keterangan', label: 'Berlaku untuk', width: 320 }] },
  { id: 'tc', label: 'Template T&C', pemilik: 'Commercial', table: 'tc_templates', editorRoles: ['commercial'],
    orderBy: [{ col: 'nama' }],
    catatan: 'Placeholder {payment_term} dan {durasi} otomatis diganti saat quotation dibuat.',
    kolom: [{ key: 'nama', label: 'Nama' }, { key: 'isi', label: 'Isi', type: 'textarea', width: 480 }, { key: 'aktif', label: 'Aktif', type: 'bool' }] },
];


// ---------- Price Inquiry: satu halaman per kelompok harga (kategori price_items) ----------
const kolomItem = (kats: string[]): Kolom[] => [
  { key: 'kategori', label: 'Kategori', type: 'select', options: kats }, { key: 'item', label: 'Item', width: 240 },
  { key: 'satuan', label: 'Satuan', width: 90 },
  { key: 'harga_beli', label: 'Harga beli', type: 'number' }, { key: 'harga_sewa_bulan', label: 'Sewa/bln', type: 'number' },
  { key: 'umur_ekonomis_bulan', label: 'Umur (bln)', type: 'number', width: 70 }, { key: 'daya_watt', label: 'Watt', type: 'number', width: 70 },
  { key: 'vendor', label: 'Vendor' }, { key: 'spesifikasi', label: 'Spesifikasi' },
  { key: 'tanggal_harga', label: 'Tgl harga', type: 'date' }, { key: 'berlaku_sampai', label: 'Berlaku s.d.', type: 'date' },
  { key: 'owner_role', label: 'Pemilik', type: 'select', options: ['procurement', 'engineering', 'it'] }, { key: 'sumber', label: 'Sumber', width: 220 },
];
const tabItem = (id: string, label: string, kats: string[], catatan: string, owner: AppRole = 'procurement'): Tab => ({
  id, label, pemilik: owner === 'it' ? 'IT' : 'Procurement / Engineering', table: 'price_items', view: 'price_items_status',
  editorRoles: ['procurement', 'engineering', 'it'], approval: true, filter: { kategori: kats }, defaults: { owner_role: owner, kategori: kats[0] },
  orderBy: [{ col: 'kategori' }, { col: 'item' }], cari: ['kategori', 'item', 'vendor', 'sumber', 'spesifikasi'],
  kelompok: kats.length > 1 ? 'kategori' : undefined, catatan, kolom: kolomItem(kats),
});
const CATATAN_HARGA = ' Harga lewat masa berlaku otomatis expired dan jadi red flag di tender.';
TABS.push(
  tabItem('pi-racking', 'Racking', ['Racking'], 'Selective, double deep, drive-in, shelving, mezzanine. Isi harga per posisi palet atau per unit di kolom satuan.' + CATATAN_HARGA),
  tabItem('pi-palet', 'Pallet', ['Palet'], 'Palet kayu, plastik, slipsheet. Sewa/bln untuk skema sewa, harga beli + umur untuk skema beli.' + CATATAN_HARGA),
  tabItem('pi-consumable', 'Consumable', ['Konsumsi', 'Seragam', 'Lainnya'], 'Air minum, konsumsi, seragam, stretch film, label dan bahan habis pakai lain.' + CATATAN_HARGA),
  tabItem('pi-stationery', 'Stationery', ['ATK', 'Printer', 'Office', 'Rental Office'], 'ATK, printer & tinta, perlengkapan/furnitur kantor, sewa ruang kantor.' + CATATAN_HARGA),
  tabItem('pi-hse', 'HSE & Fire Protection', ['HSE'], 'APD, APAR, hydrant, sprinkler, fire alarm, P3K, safety sign, training K3.' + CATATAN_HARGA),
  tabItem('pi-it', 'Perangkat IT', ['IT', 'Software'], 'Hardware & software IT gudang (PC, scanner, printer label, CCTV, jaringan). Biaya sistem format BAP ada di tab Katalog IT.' + CATATAN_HARGA, 'it'),
  tabItem('pi-services', 'Services', ['Pest Control', 'Security', 'Cleaning', 'Asuransi', 'Konstruksi'], 'Jasa pihak ketiga: pest control, security, cleaning, asuransi, pekerjaan konstruksi/fit-out.' + CATATAN_HARGA),
  tabItem('pi-utilitas', 'Utilities', ['Utilitas'], 'Air, gas, internet, genset & utilitas lain. Tarif listrik PLN ada di tab Tarif listrik.' + CATATAN_HARGA),
);

export const PRICE_PAGES: { slug: string; label: string; judul: string; ids: string[]; gudang?: boolean }[] = [
  { slug: 'warehouse', label: 'List Rental Warehouse', judul: 'Daftar gudang sewa', ids: [], gudang: true },
  { slug: 'mhe', label: 'MHE', judul: 'MHE / forklift', ids: ['mhe'] },
  { slug: 'racking', label: 'Racking', judul: 'Racking', ids: ['pi-racking'] },
  { slug: 'pallet', label: 'Pallet', judul: 'Pallet', ids: ['pi-palet'] },
  { slug: 'consumable', label: 'Consumable', judul: 'Consumable', ids: ['pi-consumable'] },
  { slug: 'stationery', label: 'Stationery', judul: 'Stationery & perlengkapan kantor', ids: ['pi-stationery'] },
  { slug: 'hse', label: 'HSE & Fire Protection', judul: 'HSE & fire protection', ids: ['pi-hse'] },
  { slug: 'it', label: 'IT & Automation', judul: 'IT & automation', ids: ['itkatalog', 'pi-it'] },
  { slug: 'services', label: 'Services', judul: 'Services (jasa pihak ketiga)', ids: ['pi-services'] },
  { slug: 'utilities', label: 'Utilities', judul: 'Utilities', ids: ['pi-utilitas', 'listrik'] },
  { slug: 'hr', label: 'HR (UMK Manpower per area)', judul: 'HR: UMK & komponen manpower per area', ids: ['umk', 'ump', 'jabatan', 'payroll'] },
];

// ---------- Productivity: satu halaman per UoM ----------
export const UOM_PROD = ['pcs', 'karton', 'ton', 'cbm', 'liter', 'bag', 'pail', 'pack', 'roll', 'palet', 'order', 'line', 'lokasi'];
export const PROD_PAGES: { slug: string; label: string; uom: string[] }[] = [
  { slug: 'pcs', label: 'Pcs', uom: ['pcs'] },
  { slug: 'carton', label: 'Case/Carton', uom: ['karton'] },
  { slug: 'ton', label: 'Ton', uom: ['ton'] },
  { slug: 'cbm', label: 'CBM', uom: ['cbm'] },
  { slug: 'liter', label: 'Liter', uom: ['liter'] },
  { slug: 'bag', label: 'Bag', uom: ['bag'] },
  { slug: 'pail', label: 'Pail', uom: ['pail'] },
  { slug: 'pack', label: 'Pack', uom: ['pack'] },
  { slug: 'roll', label: 'Roll', uom: ['roll'] },
  { slug: 'lainnya', label: 'Pallet, order & line', uom: ['palet', 'order', 'line', 'lokasi'] },
];
export const tabProduktivitas = (uom: string[], label: string): Tab => {
  const dasar = TABS.find(t => t.id === 'produktivitas')!;
  return { ...dasar, id: `prod-${uom[0]}`, label, filter: { uom }, defaults: { ...(dasar.defaults ?? {}), uom: uom[0] },
    kelompok: 'tahap', kolom: dasar.kolom.map(k => k.key === 'uom' ? { ...k, options: uom.length > 1 ? uom : UOM_PROD } : k) };
};
