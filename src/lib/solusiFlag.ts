// Solusi untuk tiap red flag + saran solusi gudang dari hasil hitung tender.
import type { HasilTender } from '@/lib/engine';
import type { Asumsi } from '@/lib/tender';

export interface Solusi { solusi: string; tab?: string }

/** Cara memperbaiki per kode red flag (tab = tempat memperbaikinya). */
export const SOLUSI_FLAG: Record<string, Solusi> = {
  PEAK_LT_AVG: { solusi: 'Peak harus ≥ rata-rata. Isi peak bulan tersibuk (biasanya 1,2–1,5 × rata-rata) atau samakan dengan rata-rata bila volume stabil.', tab: 'Volume' },
  MGV_GT_PEAK: { solusi: 'Volume komitmen (MGV) biasanya ≤ rata-rata. Turunkan komitmen, atau naikkan peak bila customer memang menjamin volume setinggi itu.', tab: 'Volume' },
  KONVERSI_PALET: { solusi: 'Isi kolom "1 palet = … UoM" supaya volume bisa diubah ke posisi palet (dasar luas gudang, MHE & tarif storage).', tab: 'Volume' },
  PORSI_SPACE: { solusi: 'Jumlah porsi SPR + DDR + block stack + pallet floor harus 100%. Ubah salah satu porsi di bagian A Capacity Requirement.', tab: 'Warehouse Planning' },
  RAK_TERLALU_TINGGI: { solusi: 'Kurangi jumlah level (isi Level manual), turunkan tinggi Product / Clearance, atau pilih gudang dengan side height lebih tinggi.', tab: 'Warehouse Planning' },
  CAD_GAP: { solusi: 'Samakan panjang × lebar gudang dari CAD dengan kebutuhan luas, atau kosongkan panjang CAD supaya dihitung otomatis dari luas ÷ lebar.', tab: 'Warehouse Planning' },
  ROLE_TIDAK_ADA: { solusi: 'Pilih role yang ada di master jabatan untuk aktivitas ini, atau tambahkan jabatannya di Price Inquiry → Manpower.', tab: 'Value Stream Mapping' },
  UTILISASI_RENDAH: { solusi: 'Gabungkan tugas ke role lain (multi-skill / rangkap) di matriks multi-skill, atau pakai tenaga paruh waktu / pool dengan customer lain.', tab: 'Value Stream Mapping' },
  ROLE_SPV_TIDAK_WAJAR: { solusi: 'Pilih role supervisi (Supervisor / Team Leader) di Key Assumption → Role supervisor.', tab: 'Key Assumption' },
  SPAN_KECIL: { solusi: 'Span of control umum 1 supervisor : 8–15 orang direct. Naikkan span, atau rangkap supervisor dengan admin bila tim kecil.', tab: 'Key Assumption' },
  MHE_TANPA_HARGA: { solusi: 'Tambahkan alat ini di Technology & Equipment (harga beli / sewa), atau ganti tool aktivitas ke alat yang sudah ada harganya.', tab: 'Technology & Equipment' },
  GUDANG_KURANG: { solusi: 'Pilih gudang yang lebih luas, naikkan porsi rak / level rak (lebih padat), atau kurangi stok peak dengan replenishment lebih sering.', tab: 'Warehouse Planning' },
  GUDANG_LONGGAR: { solusi: 'Sewa sebagian (bukan utuh), cari gudang lebih kecil, atau tawarkan sisa ruang ke customer lain (shared warehouse) supaya biaya idle tidak dibebankan penuh.', tab: 'Key Assumption' },
  INTEREST_SUMBER: { solusi: 'Baris sumber interest sudah tidak ada di rincian biaya. Pilih ulang sumbernya di Loan & Interest Calculator.', tab: 'Loan & Interest Calculator' },
  UMUR_GT_KONTRAK: { solusi: 'Wajar bila kontrak pendek: aset disusutkan penuh selama kontrak. Untuk harga lebih rendah: sewa alat (bukan beli), atau minta buy-back / perpanjangan kontrak.', tab: 'Technology & Equipment' },
  OVERHEAD_NOL: { solusi: 'Isi overhead perusahaan (umumnya 3–5% dari subtotal) di master Finance supaya biaya kantor pusat ikut tertagih.' },
  ALOKASI_KAT_BUKAN_100: { solusi: 'Samakan pembagian kategori ini ke 100% (Storage + Handling In + Handling Out + VAS) atau pakai pola cepat.', tab: 'Cost Allocation' },
  SEMUA_TERMASUK: { solusi: 'Centang minimal satu layanan sebagai layanan yang dijual di rate card supaya biaya tertagih.', tab: 'Result' },
  KOMITMEN_NOL: { solusi: 'Isi volume komitmen arus ini, atau tandai layanan ini "termasuk" layanan lain di rate card.', tab: 'Volume' },
  GP_RENDAH: { solusi: 'Naikkan GP% di rate card, kurangi biaya (rangkap manpower, sewa MHE, gudang lebih efisien), atau naikkan volume komitmen yang dijamin customer.', tab: 'Result' },
  UMK_ASUMSI: { solusi: 'UMK kab/kota belum ada — cek SK Gubernur terbaru lalu isi di master UMK sebelum quotation final.', tab: 'Key Assumption' },
  HARGA_KEDALUWARSA: { solusi: 'Minta harga terbaru ke vendor lalu perbarui di Price Inquiry; harga lama bisa membuat quotation meleset.' },
  MASTER_DATA: { solusi: 'Lengkapi master data yang disebut (Price Inquiry / master) lalu tekan Hitung lagi.' },
  PRODUK: { solusi: 'Periksa dimensi, berat, UPP & jenis palet produk ini di tab Produk.', tab: 'Produk' },
  UTIL_MHE: { solusi: 'Utilisasi MHE rendah: pakai alat bersama antar arus / shift, sewa harian saat peak, atau ganti ke alat yang lebih murah.', tab: 'Technology & Equipment' },
  LEMBUR: { solusi: 'Lembur tinggi menandakan kapasitas kurang: tambah shift / orang, atau ratakan jadwal inbound–outbound.', tab: 'Value Stream Mapping' },
  DOCK: { solusi: 'Jumlah dock kurang untuk peak: atur jadwal kedatangan (booking slot), atau tambah dock / gunakan dock leveler portable.', tab: 'Warehouse Planning' },
};
export const solusiUntuk = (kode: string): Solusi | null => SOLUSI_FLAG[kode] ?? null;

export interface Saran { judul: string; isi: string; tab?: string }

/** Saran solusi gudang: peluang efisiensi / mitigasi risiko dari angka hasil hitung. */
export function saranGudang(h: HasilTender, a: Asumsi, jamEfektifPerShift = 7): Saran[] {
  const s: Saran[] = [];
  const sx = h.space?.excel as unknown as { porsi?: { spr: number; ddr: number; block: number; floor: number }; level?: { level: number; tinggi: number }; luasDipakai?: number } | undefined;
  const porsi = sx?.porsi;
  // 1. kepadatan penyimpanan
  if (porsi && porsi.floor > 0.25) s.push({ judul: 'Naikkan kepadatan penyimpanan', isi: `${Math.round(porsi.floor * 100)}% palet di lantai. Bila barang boleh ditumpuk, pakai block stack; bila tidak, rak selective (SPR) memakai tinggi gudang dan menghemat luas sewa.`, tab: 'Warehouse Planning' });
  if (porsi && porsi.spr >= 0.9 && (a.produk?.length ?? 0) > 0 && (a.produk?.length ?? 0) <= 15) s.push({ judul: 'Pertimbangkan double deep / drive-in', isi: 'SKU sedikit dengan banyak palet per SKU cocok untuk double deep (DDR) atau drive-in: lorong lebih sedikit, posisi palet per m² naik ±30–40%.', tab: 'Warehouse Planning' });
  // 2. gudang & luas
  const flags = new Set(h.redFlags.map(f => f.kode));
  if (flags.has('GUDANG_LONGGAR')) s.push({ judul: 'Manfaatkan ruang sisa', isi: 'Gudang lebih besar dari kebutuhan: tawarkan sebagai area overflow / peak customer (tarif per palet per hari) atau bagi dengan customer lain.', tab: 'Key Assumption' });
  // 3. manpower
  const rendah = h.redFlags.filter(f => f.kode === 'UTILISASI_RENDAH').map(f => f.pesan.split(':')[0].split(' terisi')[0]);
  if (rendah.length) s.push({ judul: 'Rangkap peran berbeban rendah', isi: `${rendah.slice(0, 4).join(', ')} terisi < 50%. Gabungkan lewat matriks multi-skill (mis. admin inbound + outbound) untuk menghemat headcount.`, tab: 'Value Stream Mapping' });
  const v = h.volume.find(x => x.arus === 'outbound');
  if (v && v.rataRataBulan > 0 && v.peakBulan / v.rataRataBulan >= 1.3) s.push({ judul: 'Tenaga fleksibel untuk peak', isi: `Peak outbound ${(v.peakBulan / v.rataRataBulan).toFixed(1)}× rata-rata. Pakai tenaga harian / outsourcing saat peak, bukan headcount tetap sebesar peak.`, tab: 'Volume' });
  // 4. MHE
  const mheIdle = h.mhe.filter(m => m.unit > 0 && m.jamPerShift > 0 && m.jamPerShift < 0.4 * jamEfektifPerShift * Math.max(1, m.unitDasar));
  if (mheIdle.length) s.push({ judul: 'Optimalkan MHE', isi: `${mheIdle.map(m => m.tool).join(', ')} terpakai < 40% jam efektif. Pakai bersama antar arus / shift, sewa jangka pendek, atau ganti ke alat yang lebih sederhana (mis. hand pallet elektrik).`, tab: 'Technology & Equipment' });
  // 5. margin & komersial
  const gp = h.marginTotal?.gpPersen ?? 0;
  if (gp > 0 && gp < 0.1) s.push({ judul: 'Lindungi margin', isi: 'GP di bawah 10%: pasang klausul eskalasi tahunan (UMK & BBM), minimum charge storage, dan tarif tambahan untuk layanan di luar scope (VAS, lembur, handling loose).', tab: 'Result' });
  if ((a.tarifTambahan?.length ?? 0) === 0) s.push({ judul: 'Lengkapi layanan tambahan', isi: 'Belum ada layanan tambahan di rate card. Tambahkan yang sering muncul: labeling, wrapping, banding strap, unloading per container, stock opname per event.', tab: 'Result' });
  // 6. proses & kontrol
  s.push({ judul: 'Kontrol inventori', isi: 'Jadwalkan cycle count mingguan untuk SKU fast moving (ABC) dan rekonsiliasi stok bulanan dengan customer; target akurasi stok ≥ 99,8%.', tab: 'Landmark VSM' });
  if (!(a.aktivitas ?? []).some(x => /rf|scan/i.test(`${x.tool ?? ''} ${(x as { alatTambahan?: string[] }).alatTambahan?.join(' ') ?? ''}`)))
    s.push({ judul: 'Pakai barcode / RF', isi: 'Belum ada proses dengan RF / scanner. Scan barcode saat receiving, putaway & picking menekan salah kirim dan mempercepat stock opname.', tab: 'Value Stream Mapping' });
  return s.slice(0, 8);
}
