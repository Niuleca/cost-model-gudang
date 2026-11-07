// Utilities Management → Electrical: daftar peralatan listrik default dari data tender yang sudah diinput
// (luas & dimensi gedung di Warehouse Planning, manpower & shift di Value Stream Mapping, MHE & IT di Technology & Equipment).
// Baris yang datanya belum ada ditandai `belumDiketahui` (merah di layar) — qty 0 sampai datanya diisi.
import type { ListrikInput } from './engine/types';

export interface DriverListrik {
  luasM2: number;          // luas gudang dipakai cost model
  officeM2: number;        // office + meeting + control tower (fasilitas Warehouse Planning)
  tinggiM: number;         // tinggi sisi gedung (m)
  shift: number;           // jumlah shift
  jamPerShift: number;     // jam kerja per shift
  dock: number;            // jumlah pintu dock (0 = belum diketahui)
  mheListrik: number | null;  // reach truck / pallet mover / stacker (unit baterai) — null = belum ada data MHE
  pc: number; laptop: number; rf: number; printer: number; cctv: number; ap: number;
  adaIt: boolean;          // sudah ada baris IT di Technology & Equipment
}

export interface BarisListrik extends ListrikInput { dasar: string; belumDiketahui?: boolean; kunci?: string }

const ceil = (v: number) => Math.ceil(Math.max(0, v) - 1e-9);

/** Peralatan listrik default. Watt = daya rata-rata saat menyala (bukan daya puncak). */
export function listrikDefault(d: DriverListrik): BarisListrik[] {
  const jamOps = Math.min(24, Math.max(8, d.shift * d.jamPerShift));
  const gudangM2 = Math.max(0, d.luasM2 - d.officeM2);
  const rows: BarisListrik[] = [];
  const add = (kunci: string, item: string, watt: number, qty: number, jam: number, dasar: string, belum = false) =>
    rows.push({ kunci, item, watt, qty: belum ? 0 : qty, jamPerHari: jam, dasar, belumDiketahui: belum || undefined });

  // penerangan & ventilasi gudang
  const jarakLampu = d.tinggiM >= 10 ? 9 : 8;   // high bay: jarak antar titik ≈ 0,8–0,9 × tinggi pasang
  add('highbay', 'Lampu high bay LED 150 W', 150, ceil(gudangM2 / (jarakLampu * jarakLampu)), jamOps,
    d.luasM2 > 0 ? `1 titik per ${jarakLampu}×${jarakLampu} m area gudang (${Math.round(gudangM2).toLocaleString('id-ID')} m²) · menyala selama jam operasi ${jamOps} jam` : 'Luas gudang belum ada (Warehouse Planning)', d.luasM2 <= 0);
  add('exhaust', 'Exhaust fan industri 370 W', 370, ceil(gudangM2 / 250), jamOps, '1 unit per 250 m² area gudang', d.luasM2 <= 0);
  add('flood', 'Lampu sorot area luar LED 100 W', 100, Math.max(4, ceil(Math.sqrt(Math.max(d.luasM2, 1)) * 4 / 25)), 12, 'keliling gedung, 1 titik per 25 m · 12 jam/malam', d.luasM2 <= 0);
  add('darurat', 'Lampu darurat & exit sign 10 W', 10, Math.max(4, ceil(d.luasM2 / 200)), 24, '1 per 200 m² (jalur evakuasi)', d.luasM2 <= 0);

  // office
  const adaOffice = d.officeM2 > 0;
  add('lampuOffice', 'Lampu panel LED office 36 W', 36, ceil(d.officeM2 / 8), 10, adaOffice ? `1 per 8 m² office (${Math.round(d.officeM2)} m²)` : 'Luas office belum diisi (Warehouse Planning → fasilitas Office)', !adaOffice);
  add('ac', 'AC split 1 PK', 800, ceil(d.officeM2 / 15), 9, adaOffice ? `1 PK per 15 m² office` : 'Luas office belum diisi', !adaOffice);
  add('dispenser', 'Dispenser air minum', 350, Math.max(1, ceil(d.officeM2 / 40)), 10, 'pantry / area istirahat', false);

  // IT & perangkat (dari Technology & Equipment)
  add('pc', 'PC desktop + monitor', 150, d.pc, 9, d.pc ? 'qty dari Technology & Equipment' : 'Belum ada PC di Technology & Equipment', !d.pc);
  add('laptop', 'Laptop (charger)', 65, d.laptop, 8, d.laptop ? 'qty dari Technology & Equipment' : 'Belum ada laptop di Technology & Equipment', !d.laptop);
  add('printer', 'Printer (rata-rata)', 60, d.printer, 9, d.printer ? 'qty dari Technology & Equipment' : 'Belum ada printer di Technology & Equipment', !d.printer);
  add('rf', 'Charger RF / HHT scanner', 15, d.rf, 8, d.rf ? 'qty dari Technology & Equipment' : 'Belum ada RF/HHT di Technology & Equipment', !d.rf);
  add('ap', 'WiFi access point', 15, d.ap, 24, d.ap ? 'qty dari Technology & Equipment' : 'Belum ada access point di Technology & Equipment', !d.ap);
  add('cctv', 'Kamera CCTV', 6, d.cctv, 24, d.cctv ? 'qty dari Technology & Equipment' : 'Belum ada CCTV di Technology & Equipment', !d.cctv);
  add('nvr', 'NVR + switch jaringan', 100, d.cctv ? Math.max(1, ceil(d.cctv / 32)) : 1, 24, '1 per 32 kamera + switch', !d.adaIt);

  // MHE & dock
  add('charger', 'Charger baterai MHE (reach truck / stacker)', 4500, d.mheListrik ?? 0, 6,
    d.mheListrik == null ? 'Data MHE belum ada (Value Stream Mapping → Technology & Equipment)' : d.mheListrik ? `${d.mheListrik} unit MHE listrik, ±6 jam pengisian/hari` : 'Tidak ada MHE listrik', d.mheListrik == null);
  add('leveler', 'Dock leveler hidrolik', 750, d.dock, 1.5, d.dock ? `${d.dock} pintu dock · ±1,5 jam/hari` : 'Jumlah dock belum diketahui (gudang / Price Inquiry)', !d.dock);
  add('pompa', 'Pompa air bersih', 750, 1, 3, '1 unit per site', false);
  add('fire', 'Panel fire alarm & detektor', 60, 1, 24, '1 per site', false);
  return rows;
}

/** Item default yang masih kosong / belum diketahui. */
export const barisMerah = (rows: (ListrikInput & { belumDiketahui?: boolean })[]) => rows.filter(r => r.belumDiketahui);
