// Landmark VSM per tender: lane (Inbound / Storage / VAS / Outbound / Return …) disusun otomatis dari tahap aktivitas
// di tab Value Stream Mapping; tiap proses (tahap) punya SOP draft otomatis (tujuan, PIC, manpower, MHE, alat, dokumen,
// langkah kerja, KPI, K3) yang bisa diedit atau diganti file upload. Aktivitas yang dimatikan tidak dihitung biayanya.
import type { AktivitasInput } from '@/lib/engine/types';

export interface SopFile { path: string; nama: string; ukuran?: number; at?: string }
export interface SopInput {
  wi?: string; tujuan?: string; lingkup?: string; dokumen?: string; langkah?: string; kpi?: string; k3?: string; catatan?: string;
  sistem?: string;         // sistem / aplikasi yang dipakai (WMS-RF, Excel, email …), 1 per baris
  file?: SopFile | null;   // SOP diganti file upload (Word / PDF)
}
export interface VsmInput {
  sop?: Record<string, SopInput>;          // kunci = tahap aktivitas (mis. "Inbound - Receiving")
  leadTime?: Record<string, string>;       // kunci = lane (mis. "Inbound" → "dock to stock ≤ 24 jam")
  wiPrefix?: string;                       // awalan nomor WI, default "WI-<kode tender>"
  buffer?: Record<string, boolean>;        // kunci = tahap → ada buffer / staging (segitiga) setelah proses ini
  leadKpi?: Partial<Record<KunciLead, number>>;   // target lead time (jam) dock to receive / receive to stock / stock to dock
  versi?: string;                          // versi dokumen Landmark VSM (mis. v.01)
}
/** Lead time utama seperti Landmark VSM: dock to receive, receive to stock, stock to dock (jam). */
export type KunciLead = 'dockToReceive' | 'receiveToStock' | 'stockToDock';
export const LEAD_KPI: { k: KunciLead; label: string; lane: RegExp; def: number }[] = [
  { k: 'dockToReceive', label: 'Dock to receive', lane: /inbound|receiv|unload/i, def: 24 },
  { k: 'receiveToStock', label: 'Receive to stock', lane: /put ?away|storage|inventory|vas/i, def: 24 },
  { k: 'stockToDock', label: 'Stock to dock', lane: /outbound|pick|pack|dispatch|load/i, def: 24 },
];
export const leadKpi = (v: VsmInput | undefined, k: KunciLead) => { const x = Number(v?.leadKpi?.[k]); return x > 0 ? x : LEAD_KPI.find(z => z.k === k)!.def; };

export interface FteAktivitas { role: number; tool: number; alat: Record<string, number> }
export interface ItemVsm { idx: number; aktivitas: string; tool: string; alat: string[]; role: string; uom: string; aktif: boolean; fte: FteAktivitas | null }
export interface ProsesVsm { tahap: string; label: string; lane: string; items: ItemVsm[]; aktif: boolean; wiNo: number }
export interface LaneVsm { lane: string; proses: ProsesVsm[]; aktif: boolean }

const URUT_LANE = ['inbound', 'receiving', 'putaway', 'storage', 'inventory', 'replenishment', 'vas', 'outbound', 'picking', 'packing', 'dispatch', 'loading', 'return', 'transfer', 'admin'];
const LABEL_LANE: Record<string, string> = { inbound: 'Inbound', storage: 'Storage', inventory: 'Inventory', replenishment: 'Replenishment', vas: 'VAS', outbound: 'Outbound', return: 'Return', transfer: 'Transfer', admin: 'Admin' };

/** Lane = bagian sebelum " - " pada tahap (mis. "Inbound - Receiving" → Inbound); tanpa " - " → dikenali dari kata kunci. */
export function laneDari(tahap: string): { lane: string; label: string } {
  const t = (tahap || 'Lainnya').trim();
  const [a, ...b] = t.split(/\s+[-–]\s+/);
  if (b.length) return { lane: a.trim(), label: b.join(' - ').trim() };
  const k = t.toLowerCase();
  if (/unload|bongkar|receiv|inbound|putaway|put away/.test(k)) return { lane: 'Inbound', label: t };
  if (/pick|pack|load|muat|outbound|dispatch|ship/.test(k)) return { lane: 'Outbound', label: t };
  if (/replen|count|opname|storage|simpan|inventory/.test(k)) return { lane: 'Storage', label: t };
  if (/vas|label|kitting|bundl|repack/.test(k)) return { lane: 'VAS', label: t };
  if (/return|retur/.test(k)) return { lane: 'Return', label: t };
  return { lane: t, label: t };
}
const urutLane = (lane: string) => { const k = lane.toLowerCase(); const i = URUT_LANE.findIndex(x => k.includes(x)); return i < 0 ? 99 : i; };

/**
 * Susun peta VSM dari aktivitas tender (urutan kemunculan tahap dipertahankan dalam lane).
 * `fte`: FTE per aktivitas aktif (index aktivitas asli → FTE role / tool / alat) dari Process Design.
 */
export function susunVsm(aktivitas: AktivitasInput[], fte: Map<number, FteAktivitas>): LaneVsm[] {
  const lanes: LaneVsm[] = [];
  let wi = 0;
  aktivitas.forEach((a, idx) => {
    const { lane, label } = laneDari(a.tahap);
    let L = lanes.find(x => x.lane.toLowerCase() === lane.toLowerCase());
    if (!L) { L = { lane: LABEL_LANE[lane.toLowerCase()] ?? lane, proses: [], aktif: false }; lanes.push(L); }
    let P = L.proses.find(p => p.tahap === a.tahap);
    if (!P) { P = { tahap: a.tahap, label, lane: L.lane, items: [], aktif: false, wiNo: 0 }; L.proses.push(P); }
    P.items.push({ idx, aktivitas: a.aktivitas, tool: a.tool || 'Manual', alat: (a.alatTambahan ?? []).filter(Boolean), role: a.roleName, uom: a.uom, aktif: !a.nonaktif, fte: fte.get(idx) ?? null });
  });
  lanes.sort((x, y) => urutLane(x.lane) - urutLane(y.lane));
  for (const L of lanes) for (const P of L.proses) { P.aktif = P.items.some(i => i.aktif); P.wiNo = ++wi; }
  for (const L of lanes) L.aktif = L.proses.some(p => p.aktif);
  return lanes;
}

// ---------------------------------------------------------------- SOP draft
const ada = (re: RegExp, ...xs: string[]) => xs.some(x => re.test((x || '').toLowerCase()));
const fmt = (x: number) => x.toLocaleString('id-ID', { maximumFractionDigits: 1 });
const NAMA_TOOL: Record<string, string> = {
  RT: 'Reach Truck', CBT: 'Forklift Counter Balance', CB: 'Forklift Counter Balance', HPT: 'Hand Pallet Truck', EPT: 'Electric Pallet Truck', RF: 'RF scanner / handheld terminal',
  PC: 'PC / laptop admin', VNA: 'VNA truck', OP: 'Order picker', Manual: 'Manual (tanpa alat)',
};
export const namaTool = (t: string) => NAMA_TOOL[t] ?? t;
const isMhe = (t: string) => /\b(RT|CBT?|HPT|EPT|VNA|OP|forklift|reach|stacker|pallet)\b/i.test(t);

/** Langkah kerja standar per jenis aktivitas (dikenali dari nama aktivitas / tahap). */
function langkahAktivitas(a: ItemVsm, tahap: string): string[] {
  const n = `${a.aktivitas} ${tahap}`, alat = namaTool(a.tool);
  if (ada(/admin|confirm|konfirmasi|receipt|dokumen|document|order processing|input|invoice|report|laporan/, n)) return [
    `${a.aktivitas}: buka dokumen / order di sistem (WMS / Excel) sesuai jadwal.`,
    'Cocokkan data sistem dengan dokumen fisik (DO / packing list / pick list); catat selisih.',
    'Konfirmasi transaksi di sistem (GR / pick confirm / shipment) dan cetak dokumen yang dibutuhkan.',
    'Arsipkan dokumen & kirim laporan harian ke customer / supervisor.',
  ];
  if (ada(/unload|bongkar/, n)) return [
    'Terima kedatangan truk: cek surat jalan / DO, packing list, nomor segel & kondisi armada; catat jam tiba.',
    'Arahkan truk ke dock, pasang wheel chock / ganjal ban sebelum bongkar.',
    `Bongkar barang ${/palet|pallet/i.test(a.uom) ? `palet dengan ${alat}` : 'loose / per karton secara manual (susun ke palet)'} ke area staging inbound.`,
    'Pisahkan barang rusak / basah, foto bukti, dan laporkan ke admin inbound.',
  ];
  if (ada(/cek|check|inspect|inspeksi|qc|verif|receiv|terima|count/, n) && !ada(/cycle|opname/, n)) return [
    'Ambil dokumen penerimaan (ASN / packing list) atau task di RF.',
    `Hitung & periksa barang per ${a.uom || 'unit'}: SKU, qty, batch / lot, expired date, kondisi kemasan.`,
    `Scan barcode barang ${a.tool === 'RF' || a.alat.some(x => /scan|rf|rdt/i.test(x)) ? 'dengan RF scanner' : 'dan catat di form penerimaan'}; tempel label palet / LPN.`,
    'Barang tidak sesuai (selisih, rusak, expired) → area karantina + berita acara; informasikan ke customer.',
  ];
  if (ada(/put ?away|simpan|storing|penyimpanan/, n)) return [
    'Ambil palet / barang yang sudah lolos penerimaan dari staging inbound.',
    'Scan label palet; ikuti lokasi saran sistem (system-directed putaway) sesuai aturan berat & level rak.',
    `Simpan ke lokasi rak dengan ${alat}; pastikan palet rapi, tidak overhang dan label menghadap lorong.`,
    'Scan lokasi tujuan untuk konfirmasi putaway di sistem.',
  ];
  if (ada(/replen|turun palet|pallet down/, n)) return [
    'Cek task replenishment dari sistem (stok lokasi picking di bawah minimum).',
    `Turunkan palet dari lokasi reserve dengan ${alat} ke lokasi picking.`,
    'Scan lokasi asal & tujuan; konfirmasi replenishment di sistem.',
  ];
  if (ada(/cycle|opname|stock count|stocktake/, n)) return [
    'Ambil daftar lokasi cycle count dari sistem (blind count).',
    'Hitung fisik per lokasi & SKU; scan lokasi dan barang.',
    'Selisih → hitung ulang oleh orang kedua; kirim hasil ke inventory controller untuk adjustment.',
  ];
  if (ada(/pick/, n)) return [
    'Terima pick list / task picking di RF sesuai prioritas order (cut-off).',
    `Ambil barang dari lokasi sesuai FEFO / FIFO ${/palet|pallet/i.test(a.uom) ? `(palet utuh dengan ${alat})` : '(per karton / pcs)'}.`,
    'Scan lokasi, SKU & qty; laporkan short-pick ke supervisor.',
    'Bawa barang ke area packing / staging outbound sesuai nomor order.',
  ];
  if (ada(/pack|kemas|wrap|label|vas|kitting|bundl|sticker|stiker/, n)) return [
    'Ambil barang hasil picking / VAS sesuai order.',
    `${a.aktivitas}: kerjakan sesuai instruksi customer (packing, wrapping, labeling, bundling).`,
    'Timbang / ukur bila diperlukan; tempel label pengiriman & packing list.',
    'Letakkan di staging outbound per rute / customer.',
  ];
  if (ada(/load|muat|dispatch|kirim/, n)) return [
    'Cek kesiapan armada (kebersihan, kondisi bak, dokumen driver).',
    'Cocokkan barang di staging dengan DO / manifest (qty, SKU, tujuan).',
    `Muat barang ke truk ${/palet|pallet/i.test(a.uom) ? `dengan ${alat}` : 'secara manual'}; susun sesuai urutan drop.`,
    'Foto muatan, pasang segel, tanda tangan serah terima; kirim dokumen ke admin outbound.',
  ];
  if (ada(/return|retur/, n)) return [
    'Terima barang retur beserta dokumen retur / berita acara.',
    'Periksa kondisi barang: layak jual / rusak / expired; pisahkan per kondisi.',
    'Input retur di sistem dan simpan ke lokasi sesuai disposisi.',
  ];
  return [`${a.aktivitas}: kerjakan sesuai instruksi kerja dan target produktivitas.`, 'Catat hasil kerja di sistem / form harian.'];
}

function dokumenDefault(p: ProsesVsm): string {
  // label proses + nama aktivitas (bukan nama lane) supaya Putaway tidak mewarisi dokumen penerimaan
  const n = `${p.label} ${p.items.filter(i => i.aktif).map(i => i.aktivitas).join(' ')}`.toLowerCase();
  const d: string[] = [];
  if (/unload|bongkar|receiv|inbound/.test(n)) d.push('Surat jalan / DO supplier', 'Packing list / ASN', 'Form penerimaan / GR (WMS)');
  if (/put ?away|replen/.test(n)) d.push('Label palet / LPN', 'Task putaway / replenishment (WMS)');
  if (/pick/.test(n)) d.push('Order / pick list (WMS)', 'Laporan short-pick');
  if (/pack|label|vas/.test(n)) d.push('Instruksi VAS customer', 'Label pengiriman', 'Packing list per karton');
  if (/load|muat|outbound|dispatch/.test(n)) d.push('Delivery order (DO) / manifest', 'Berita acara serah terima', 'Nomor segel');
  if (/count|opname/.test(n)) d.push('Count sheet / task cycle count', 'Laporan selisih stok');
  if (/return|retur/.test(n)) d.push('Dokumen retur / berita acara', 'Laporan disposisi retur');
  if (/admin/.test(n)) d.push('Laporan harian ke customer');
  return Array.from(new Set(d.length ? d : ['Form kerja harian'])).join('\n');
}

/** Sistem default: WMS + RF bila ada RF / scanner, PC admin → WMS / Excel, selain itu form manual (kertas). */
export function sistemDefault(p: ProsesVsm): string {
  const xs = p.items.filter(i => i.aktif);
  const alat = xs.flatMap(i => [i.tool, ...i.alat]).join(' ');
  const n = `${p.tahap} ${xs.map(i => i.aktivitas).join(' ')}`.toLowerCase();
  const s: string[] = [];
  if (/\bRF\b|rdt|scan|handheld|terminal/i.test(alat)) s.push('WMS (RF / barcode scan)');
  if (/\bPC\b|laptop|admin|komputer/i.test(alat) || /admin|confirm|report|laporan|input|order/.test(n)) s.push('WMS (PC admin)');
  if (/report|laporan|admin/.test(n)) s.push('Excel / email laporan ke customer');
  if (!s.length) s.push('Form manual (kertas) → input WMS oleh admin');
  return Array.from(new Set(s)).join('\n');
}
/** Buffer / staging default setelah bongkar, penerimaan, picking & packing (barang menunggu proses berikutnya). */
export const bufferDefault = (p: ProsesVsm) => /unload|bongkar|receiv|terima|check|cek|pick|pack|kemas|staging|vas/i.test(`${p.tahap} ${p.items.map(i => i.aktivitas).join(' ')}`);
export const adaBuffer = (p: ProsesVsm, v?: VsmInput) => v?.buffer?.[p.tahap] ?? bufferDefault(p);

function kpiDefault(p: ProsesVsm): string {
  const n = `${p.lane} ${p.tahap}`.toLowerCase();
  if (/return|retur/.test(n)) return 'Retur diproses ≤ 2 × 24 jam\nAkurasi disposisi retur 100%';
  if (/vas/.test(n)) return 'VAS selesai sesuai cut-off 100%\nAkurasi label / packing ≥ 99,8%';
  if (/count|opname|storage|inventory|replen/.test(n)) return 'Akurasi stok (IRA) ≥ 99,8%\nTidak ada stok-out di lokasi picking akibat telat replenishment';
  if (/outbound|pick|pack|load|dispatch/.test(n)) return 'Order terkirim tepat waktu (OTIF) ≥ 98%\nAkurasi picking ≥ 99,8%\nStock to dock ≤ 24 jam';
  if (/inbound|receiv|unload|put/.test(n)) return 'Dock to stock ≤ 24 jam\nAkurasi penerimaan ≥ 99,5%\nWaktu bongkar per truk sesuai SLA';
  return 'Target produktivitas tercapai ≥ 95%';
}

function k3Default(p: ProsesVsm): string {
  const tools = new Set(p.items.filter(i => i.aktif).map(i => i.tool));
  const s = ['APD wajib: sepatu safety, rompi reflektif; helm di area rak & dock.'];
  if (Array.from(tools).some(t => /RT|CBT?|VNA|forklift|reach/i.test(t))) s.push('Operator MHE wajib ber-SIO; cek harian P2H sebelum dipakai; kecepatan maks 10 km/jam, klakson di persimpangan.');
  if (Array.from(tools).some(t => /HPT|EPT|pallet/i.test(t))) s.push('Hand / electric pallet: periksa roda & rem, jangan melebihi kapasitas angkat.');
  if (p.items.some(i => !/palet|pallet/i.test(i.uom))) s.push('Angkat manual maks 25 kg per orang (ISO 11228-1); di atas itu angkat berdua / pakai alat.');
  if (/unload|load|bongkar|muat|dock/i.test(p.tahap + p.items.map(i => i.aktivitas).join(' '))) s.push('Truk wajib diganjal (wheel chock) & mesin mati selama bongkar / muat; area dock bebas pejalan kaki.');
  return s.join('\n');
}

export interface SopDraft {
  wi: string; tujuan: string; lingkup: string; pic: string; manpower: string[]; mhe: string[]; alat: string[];
  dokumen: string; sistem: string; langkah: string; kpi: string; k3: string;
}
/** Draft SOP otomatis untuk satu proses (hanya aktivitas aktif). */
export function draftSop(p: ProsesVsm, wiPrefix: string): SopDraft {
  const xs = p.items.filter(i => i.aktif);
  const roles = new Map<string, number>(), mhe = new Map<string, number>(), alat = new Map<string, number>();
  for (const i of xs) {
    roles.set(i.role, (roles.get(i.role) ?? 0) + (i.fte?.role ?? 0));
    if (i.tool && i.tool !== 'Manual') (isMhe(i.tool) ? mhe : alat).set(i.tool, ((isMhe(i.tool) ? mhe : alat).get(i.tool) ?? 0) + (i.fte?.tool ?? 0));
    for (const a2 of i.alat) alat.set(a2, (alat.get(a2) ?? 0) + (i.fte?.alat[a2] ?? 0));
  }
  const fteTxt = (v: number) => (v >= 0.05 ? ` — ${fmt(v)} FTE` : '');
  const langkah = xs.flatMap(i => langkahAktivitas(i, p.tahap));
  return {
    wi: `${wiPrefix}-${String(p.wiNo).padStart(3, '0')}`,
    tujuan: `Memastikan proses ${p.label.toLowerCase()} (${p.lane}) berjalan aman, akurat dan sesuai target waktu, dengan tanggung jawab, alat dan dokumen yang jelas.`,
    lingkup: `Berlaku untuk aktivitas: ${xs.map(i => i.aktivitas).join('; ') || '—'}.`,
    pic: Array.from(roles.keys()).join(', ') || '—',
    manpower: Array.from(roles.entries()).map(([r, v]) => `${r}${fteTxt(v)}`),
    mhe: Array.from(mhe.entries()).map(([t, v]) => `${namaTool(t)} (${t})${fteTxt(v)}`),
    alat: Array.from(alat.entries()).map(([t, v]) => `${namaTool(t)}${fteTxt(v)}`),
    dokumen: dokumenDefault(p),
    sistem: sistemDefault(p),
    langkah: Array.from(new Set(langkah)).join('\n'),
    kpi: kpiDefault(p),
    k3: k3Default(p),
  };
}
/** SOP efektif = draft otomatis ditimpa isian manual (bila ada). */
export function sopEfektif(p: ProsesVsm, wiPrefix: string, input?: SopInput) {
  const d = draftSop(p, wiPrefix), x = input ?? {};
  const pilih = (v: string | undefined, def: string) => (v != null && v.trim() !== '' ? v : def);
  return {
    ...d, wi: pilih(x.wi, d.wi), tujuan: pilih(x.tujuan, d.tujuan), lingkup: pilih(x.lingkup, d.lingkup), dokumen: pilih(x.dokumen, d.dokumen), sistem: pilih(x.sistem, d.sistem),
    langkah: pilih(x.langkah, d.langkah), kpi: pilih(x.kpi, d.kpi), k3: pilih(x.k3, d.k3), catatan: x.catatan ?? '', file: x.file ?? null,
    diubah: ['wi', 'tujuan', 'lingkup', 'dokumen', 'sistem', 'langkah', 'kpi', 'k3', 'catatan'].some(k => (x as Record<string, unknown>)[k] != null && String((x as Record<string, unknown>)[k]).trim() !== ''),
  };
}
export type SopEfektif = ReturnType<typeof sopEfektif>;

/** Lead time default per lane. */
export function leadTimeDefault(lane: string) {
  const k = lane.toLowerCase();
  if (/inbound|receiv/.test(k)) return 'Dock to stock ≤ 24 jam';
  if (/outbound|pick|dispatch/.test(k)) return 'Stock to dock ≤ 24 jam';
  if (/return/.test(k)) return 'Retur diproses ≤ 2 × 24 jam';
  if (/vas/.test(k)) return 'VAS selesai sebelum cut-off';
  if (/storage|inventory|replen/.test(k)) return 'Akurasi stok ≥ 99,8%';
  return '';
}

// ---------------------------------------------------------------- ikon tools / MHE (Landmark VSM)
export type JenisIkon = 'forklift' | 'reach' | 'handpallet' | 'rf' | 'scanner' | 'printer' | 'timbangan' | 'meteran' | 'trolley' | 'pc' | 'kertas' | 'truk' | 'wrap' | 'orang';
/** Kenali ikon dari kode tool / nama alat (RT, CBT, HPT, RF, PC, Scanner RDT, Label printer, Timbangan, …). */
export function ikonAlat(t: string): JenisIkon {
  const x = (t || '').toLowerCase();
  if (/\brt\b|reach|vna|order picker|\bop\b|stacker/.test(x)) return 'reach';
  if (/\bcbt?\b|forklift|counter ?balance/.test(x)) return 'forklift';
  if (/\bhpt\b|\bept\b|hand ?pallet|pallet (truck|mover|jack)|pallet mover/.test(x)) return 'handpallet';
  if (/\brf\b|rdt|handheld|terminal|\bpda\b/.test(x)) return 'rf';
  if (/scan|barcode/.test(x)) return 'scanner';
  if (/print|label/.test(x)) return 'printer';
  if (/timbang|scale|weigh/.test(x)) return 'timbangan';
  if (/meter|tape|ukur|dimens/.test(x)) return 'meteran';
  if (/trolley|troli|cart|kereta/.test(x)) return 'trolley';
  if (/\bpc\b|laptop|komputer|computer|admin/.test(x)) return 'pc';
  if (/wrap|stretch/.test(x)) return 'wrap';
  if (/truk|truck|mobil/.test(x)) return 'truk';
  if (/manual|kertas|paper|form/.test(x)) return 'kertas';
  return 'orang';
}
