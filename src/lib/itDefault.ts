// Kebutuhan IT default per tender, dihitung dari Warehouse Planning (luas gudang & office), volume order,
// dan manpower / alat di Value Stream Mapping & MHE Summary.
// Semua baris hasilnya biasa (bisa diubah qty, harga, atau dihapus); aturan qty dicatat di kolom catatan.
// Baris default menyimpan `kunci` + `qtyDefault`: selama qty belum diubah manual, qty ikut data tender (lihat sinkronDefault).
import { UMUR_IT_DEFAULT, basisDari, type ItLine } from './it.ts';

export interface DriverIt {
  luasM2: number;            // total space (m²)
  officeM2?: number;         // office + meeting + control tower (fasilitas Warehouse Planning)
  transaksiBulan: number;    // inbound + outbound palet ekuivalen per bulan (cadangan bila order belum ada)
  orderBulan?: number;       // order / DO inbound + outbound per bulan (dasar WMS per transaksi)
  userKantor: number;        // role white collar (admin, SPV, manager, controller, QHSE)
  manajer: number;           // SPV / manager (laptop & Power BI)
  operatorScan?: number;     // checker / picker / receiving / inventory (total semua shift) → RF scanner
  shift?: number;
  unitRf: number;            // RF / scanner dari MHE Summary
  unitPc: number;            // PC dari MHE Summary
  unitLaptop: number;        // laptop dari MHE Summary
}
export interface KatalogIt { id: number; kelompok: string; item: string; cost_type: string; harga: number | string; slab_min?: number | null; slab_max?: number | null }

const ceil = (v: number) => Math.ceil(Math.max(0, v) - 1e-9);
const rb = (v: number) => Math.round(v).toLocaleString('id-ID');

/** Slab WMS yang rentangnya memuat volume transaksi (semua transaksi memakai tarif slab tersebut). */
export function slabWms(katalog: KatalogIt[], transaksi: number) {
  const wms = katalog.filter(k => /WMS SaaS/i.test(k.item));
  const ada = wms.filter(k => k.slab_min != null);
  const cocok = ada.find(k => transaksi >= Number(k.slab_min) && (k.slab_max == null || transaksi <= Number(k.slab_max)));
  return cocok ?? wms.find(k => /slab 1/i.test(k.item)) ?? wms[0];
}

/** Aturan default: [kunci, item katalog, qty, catatan]. */
export function aturanIt(d: DriverIt, katalog: KatalogIt[] = []): { kunci: string; cari: RegExp | ((k: KatalogIt) => boolean); qty: number; ket: string }[] {
  const shift = Math.max(1, d.shift || 1);
  const officeM2 = Math.max(0, d.officeM2 || 0);
  const gudangM2 = Math.max(0, d.luasM2 - officeM2);
  const pc = Math.max(1, d.unitPc || ceil(d.userKantor * 0.6));
  const laptop = Math.max(1, d.unitLaptop || d.manajer);
  const user = Math.max(1, pc + laptop);
  const rfEst = d.operatorScan ? ceil((d.operatorScan / shift) * 1.1) : 0;
  const rf = Math.max(1, d.unitRf || rfEst);
  const kamera = Math.max(8, ceil(d.luasM2 / 200));
  const ap = d.luasM2 > 0 ? Math.max(2, ceil(gudangM2 / 600)) + (officeM2 > 0 ? Math.max(1, ceil(officeM2 / 150)) : 1) : 0;
  const printerAio = Math.max(1, ceil(d.luasM2 / 5000)), printerBc = Math.max(1, ceil(d.luasM2 / 5000));
  const trx = d.orderBulan && d.orderBulan > 0 ? d.orderBulan : d.transaksiBulan;
  const slab = slabWms(katalog, trx);
  const ketSlab = slab?.slab_min != null ? ` → ${slab.item.replace(/^WMS SaaS – /, '')} (${rb(Number(slab.slab_min))}–${slab.slab_max != null ? rb(Number(slab.slab_max)) : '∞'} trx/bln)` : '';
  return [
    { kunci: 'wms', cari: k => !!slab && k.id === slab.id, qty: Math.round(trx),
      ket: (d.orderBulan && d.orderBulan > 0 ? `order inbound + outbound ${rb(trx)}/bln (profil order)` : `transaksi = volume inbound + outbound ${rb(trx)} palet/bln (profil order belum ada)`) + ketSlab },
    { kunci: 'office', cari: /^Office Tools$/i, qty: user, ket: `1 lisensi per user (PC ${pc} + laptop ${laptop})` },
    { kunci: 'antivirus', cari: /^Antivirus$/i, qty: user, ket: 'per user (PC + laptop)' },
    { kunci: 'email', cari: /^Email$/i, qty: user, ket: 'per user (PC + laptop)' },
    { kunci: 'powerbi', cari: /^Power BI$/i, qty: Math.max(1, d.manajer), ket: 'per SPV / manager' },
    { kunci: 'hht', cari: /Scanner HHT/i, qty: rf, ket: d.unitRf ? 'unit RF di MHE Summary' : rfEst ? `${d.operatorScan} operator scan (checker/picker/receiving/inventory) ÷ ${shift} shift + 10% cadangan` : 'min. 1 (belum ada operator scan / RF di aktivitas)' },
    { kunci: 'pc', cari: /^PC Desktop$/i, qty: pc, ket: d.unitPc ? 'unit PC di MHE Summary' : `≈ 60% user kantor (${d.userKantor})` },
    { kunci: 'laptop', cari: /Laptop Operasional/i, qty: laptop, ket: d.unitLaptop ? 'unit laptop di MHE Summary' : 'per SPV / manager' },
    { kunci: 'dotmatrix', cari: /Printer Dot Matrix/i, qty: 1, ket: '1 per site (surat jalan)' },
    { kunci: 'aio', cari: /Printer All-in-One/i, qty: printerAio, ket: '1 per 5.000 m² (min. 1)' },
    { kunci: 'barcode', cari: /Printer Barcode/i, qty: printerBc, ket: '1 per 5.000 m² (min. 1)' },
    { kunci: 'tv', cari: /^TV Display$/i, qty: 1, ket: '1 per site (dashboard KPI)' },
    { kunci: 'ups', cari: /^UPS$/i, qty: pc, ket: '1 per PC' },
    { kunci: 'ap', cari: /Access Point/i, qty: ap, ket: d.luasM2 > 0 ? `gudang ${rb(gudangM2)} m² ÷ 600 m² (cakupan RF di antara rak, min. 2) + office ${officeM2 ? `${rb(officeM2)} m² ÷ 150 m²` : '1 unit'}` : 'luas gudang belum ada (Warehouse Planning)' },
    { kunci: 'switch', cari: /Switch PoE/i, qty: ap ? Math.max(1, ceil((ap + kamera) / 20)) : 0, ket: `port PoE untuk ${ap} access point + ${kamera} kamera, 20 port terpakai per switch` },
    { kunci: 'lan', cari: /kabel LAN per titik/i, qty: ap ? ap + pc + printerAio + printerBc + 1 : 0, ket: 'titik access point + PC + printer + TV' },
    { kunci: 'cctv', cari: /Kamera CCTV/i, qty: kamera, ket: `1 per 200 m² (min. 8) · luas ${rb(d.luasM2)} m²` },
    { kunci: 'nvr', cari: /^NVR$/i, qty: Math.max(1, ceil(kamera / 32)), ket: '1 per 32 kamera' },
    { kunci: 'tvcctv', cari: /TV Monitor CCTV/i, qty: 1, ket: '1 per site' },
    { kunci: 'kvm', cari: /^KVM$/i, qty: 1, ket: '1 per site' },
    { kunci: 'kabelcctv', cari: /Cabling CCTV/i, qty: kamera, ket: 'per titik kamera' },
    { kunci: 'fw-ins', cari: /Firewall & WAN.*instalasi/i, qty: 1, ket: '1 per site' },
    { kunci: 'fw-bln', cari: /Firewall & WAN.*bulanan/i, qty: 1, ket: '1 per site' },
  ];
}

export function itDefault(d: DriverIt, katalog: KatalogIt[]): ItLine[] {
  const out: ItLine[] = [];
  for (const a of aturanIt(d, katalog)) {
    const k = katalog.find(x => typeof a.cari === 'function' ? a.cari(x) : a.cari.test(x.item));
    if (!k || !(a.qty > 0)) continue;
    out.push({ catalogId: k.id, kelompok: k.kelompok, item: k.item, costType: k.cost_type, qty: a.qty, hargaBudget: Number(k.harga) || 0,
      umurBulan: basisDari(k.cost_type) === 'Sekali' ? UMUR_IT_DEFAULT : undefined, catatan: `Default: ${a.ket}`, kunci: a.kunci, qtyDefault: a.qty });
  }
  return out;
}

/** Baris default yang qty-nya belum diubah manual (qty = qtyDefault) mengikuti hitungan baru; item & catatan ikut diperbarui.
 *  Mengembalikan null bila tidak ada perubahan. */
export function sinkronIt(lines: ItLine[], def: ItLine[]): ItLine[] | null {
  let ubah = false;
  const out = lines.map(l => {
    if (!l.kunci || l.qtyDefault == null || l.qty !== l.qtyDefault) return l;
    const b = def.find(x => x.kunci === l.kunci);
    if (!b) return l;
    const ganti = l.qty !== b.qty || l.catatan !== b.catatan || (l.kunci === 'wms' && l.catalogId !== b.catalogId);
    if (!ganti) return l;
    ubah = true;
    return { ...l, qty: b.qty, qtyDefault: b.qty, catatan: b.catatan,
      ...(l.kunci === 'wms' ? { catalogId: b.catalogId, item: b.item, hargaBudget: b.hargaBudget } : {}) };
  });
  return ubah ? out : null;
}
