// Kebutuhan IT default per tender, dihitung dari luas gudang (m²), volume transaksi, dan manpower / alat di Process Design.
// Semua baris hasilnya biasa (bisa diubah qty, harga, atau dihapus); aturan qty dicatat di kolom catatan.
import { UMUR_IT_DEFAULT, basisDari, type ItLine } from './it.ts';

export interface DriverIt {
  luasM2: number;            // total space (m²)
  transaksiBulan: number;    // inbound + outbound per bulan (dasar WMS per transaksi)
  userKantor: number;        // role white collar (admin, SPV, manager, controller, QHSE)
  manajer: number;           // SPV / manager (laptop & Power BI)
  unitRf: number;            // RF / scanner dari MHE Summary
  unitPc: number;            // PC dari MHE Summary
  unitLaptop: number;        // laptop dari MHE Summary
}
export interface KatalogIt { id: number; kelompok: string; item: string; cost_type: string; harga: number | string }

/** Aturan default: [nama item di katalog, qty, catatan]. */
export function aturanIt(d: DriverIt): { cari: RegExp; qty: number; ket: string }[] {
  const pc = Math.max(1, d.unitPc || Math.ceil(d.userKantor * 0.6));
  const laptop = Math.max(1, d.unitLaptop || d.manajer);
  const user = Math.max(1, pc + laptop);
  const kamera = Math.max(8, Math.ceil(d.luasM2 / 200));
  return [
    { cari: /WMS SaaS.*slab 1/i, qty: Math.round(d.transaksiBulan), ket: 'transaksi/bln = volume inbound + outbound (peak)' },
    { cari: /^Office Tools$/i, qty: user, ket: `1 lisensi per user (PC ${pc} + laptop ${laptop})` },
    { cari: /^Antivirus$/i, qty: user, ket: 'per user (PC + laptop)' },
    { cari: /^Email$/i, qty: user, ket: 'per user (PC + laptop)' },
    { cari: /^Power BI$/i, qty: Math.max(1, d.manajer), ket: 'per SPV / manager' },
    { cari: /Scanner HHT/i, qty: Math.max(d.unitRf, 1), ket: d.unitRf ? 'unit RF di MHE Summary' : 'min. 1 (belum ada RF di aktivitas)' },
    { cari: /^PC Desktop$/i, qty: pc, ket: d.unitPc ? 'unit PC di MHE Summary' : '≈ 60% user kantor' },
    { cari: /Laptop Operasional/i, qty: laptop, ket: d.unitLaptop ? 'unit laptop di MHE Summary' : 'per SPV / manager' },
    { cari: /Printer Dot Matrix/i, qty: 1, ket: '1 per site (surat jalan)' },
    { cari: /Printer All-in-One/i, qty: Math.max(1, Math.ceil(d.luasM2 / 5000)), ket: '1 per 5.000 m² (min. 1)' },
    { cari: /Printer Barcode/i, qty: Math.max(1, Math.ceil(d.luasM2 / 5000)), ket: '1 per 5.000 m² (min. 1)' },
    { cari: /^TV Display$/i, qty: 1, ket: '1 per site (dashboard KPI)' },
    { cari: /^UPS$/i, qty: pc, ket: '1 per PC' },
    { cari: /Kamera CCTV/i, qty: kamera, ket: `1 per 200 m² (min. 8) · luas ${Math.round(d.luasM2).toLocaleString('id-ID')} m²` },
    { cari: /^NVR$/i, qty: Math.max(1, Math.ceil(kamera / 32)), ket: '1 per 32 kamera' },
    { cari: /TV Monitor CCTV/i, qty: 1, ket: '1 per site' },
    { cari: /^KVM$/i, qty: 1, ket: '1 per site' },
    { cari: /Cabling CCTV/i, qty: kamera, ket: 'per titik kamera' },
    { cari: /Firewall & WAN.*instalasi/i, qty: 1, ket: '1 per site' },
    { cari: /Firewall & WAN.*bulanan/i, qty: 1, ket: '1 per site' },
  ];
}

export function itDefault(d: DriverIt, katalog: KatalogIt[]): ItLine[] {
  const out: ItLine[] = [];
  for (const a of aturanIt(d)) {
    const k = katalog.find(x => a.cari.test(x.item));
    if (!k || !(a.qty > 0)) continue;
    out.push({ catalogId: k.id, kelompok: k.kelompok, item: k.item, costType: k.cost_type, qty: a.qty, hargaBudget: Number(k.harga) || 0,
      umurBulan: basisDari(k.cost_type) === 'Sekali' ? UMUR_IT_DEFAULT : undefined, catatan: `Default: ${a.ket}` });
  }
  return out;
}
