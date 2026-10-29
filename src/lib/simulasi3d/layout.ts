// Simulasi gudang 3D — mengubah hasil hitung tender (space, rak, staging, MHE, manpower) menjadi tata letak 3D.
// Satuan meter. Sumbu X = panjang gudang (0 = dinding dock), Z = lebar gudang (kiri → kanan), Y = tinggi.
import type { HasilTender } from '@/lib/engine/index.ts';
import type { TenderRow } from '@/lib/tender';
import { lengkapiSpaceExcel } from '@/lib/engine/space';

export type JenisZona = 'stagingIn' | 'stagingOut' | 'spr' | 'ddr' | 'block' | 'floor' | 'fasilitas' | 'jalur';
export interface Zona { id: string; jenis: JenisZona; label: string; x0: number; x1: number; z0: number; z1: number; ket: string }
export interface BarisRak { jenis: 'spr' | 'ddr'; x0: number; depth: number; hadap: 1 | -1; z0: number; nBay: number; bayW: number; level: number; deep: number; ppl: number }
export interface Palet { x: number; y: number; z: number; jenis: 'spr' | 'ddr' | 'block' | 'floor' | 'stagingIn' | 'stagingOut'; rot?: boolean }
export interface Lorong { x: number; z0: number; z1: number; zona: 'spr' | 'ddr' }
export interface Dock { z: number; arus: 'inbound' | 'outbound' }
export interface Fasilitas { nama: string; x0: number; x1: number; z0: number; z1: number }
export type JenisMhe = 'reach' | 'forklift' | 'stacker' | 'hpt' | 'perangkat';
export interface UnitMhe { nama: string; jenis: JenisMhe; unit: number }
export type KategoriOrang = 'admin' | 'checker' | 'picker' | 'operator' | 'tkbm' | 'supervisor' | 'security' | 'inventory' | 'lain';
export interface GrupOrang { nama: string; kategori: KategoriOrang; perShift: number[]; total: number; jenis: 'Direct' | 'Indirect' }

export interface LayoutGudang {
  L: number; W: number; H: number; puncak: number;
  luasRencana: number; luasLayout: number;
  zona: Zona[]; rak: BarisRak[]; palet: Palet[]; lorong: Lorong[]; dock: Dock[]; fasilitas: Fasilitas[];
  tinggiPalet: number; tinggiRak: number; levelY: number[];
  stagingIn: { x0: number; x1: number; z0: number; z1: number }; stagingOut: { x0: number; x1: number; z0: number; z1: number };
  mhe: UnitMhe[]; orang: GrupOrang[]; shiftAktif: number[];
  ringkas: { label: string; nilai: string }[];
  asumsi: string[];
}

const ceil = (v: number) => Math.max(0, Math.ceil(v - 1e-9));
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const fmt = (v: number, d = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Pengacak deterministik (posisi palet terisi tersebar rata, tapi sama setiap kali dibuka). */
function acak(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function jenisMhe(nama: string): JenisMhe {
  if (/reach|\bRT\b/i.test(nama)) return 'reach';
  if (/stacker/i.test(nama)) return 'stacker';
  if (/hand\s*pallet|\bHPT\b|hand\s*lift|handlift|\bEPT\b|pallet\s*jack|\bHP\b/i.test(nama)) return 'hpt';
  if (/forklift|\bCBT?\b|counter|\bPM\b|diesel|\bFL\b/i.test(nama)) return 'forklift';
  return 'perangkat';
}
export function kategoriOrang(nama: string): KategoriOrang {
  if (/security|satpam/i.test(nama)) return 'security';
  if (/manager|manajer|kepala|ka\.? ?gudang|head|spv|supervisor|leader|koordinator|coordinator|foreman|mandor/i.test(nama)) return 'supervisor';
  if (/admin|clerk|qhse|k3|hse/i.test(nama)) return 'admin';
  if (/tkbm|kuli|bongkar|buruh|helper|loader|daily|harian|runner/i.test(nama)) return 'tkbm';
  if (/operator|reach|forklift|\bRT\b|\bCBT?\b/i.test(nama)) return 'operator';
  if (/checker/i.test(nama)) return 'checker';
  if (/stock|inventory|controller/i.test(nama)) return 'inventory';
  if (/picker|packer|sorter|vas/i.test(nama)) return 'picker';
  return 'lain';
}

/** Isi rak dengan palet: urutan acak deterministik supaya terlihat seperti gudang yang terisi sebagian. */
function isiRak(rows: BarisRak[], n: number, levelY: number[], seed: number) {
  const slot: Palet[] = [];
  for (const r of rows) {
    const bayW = r.bayW;
    for (let b = 0; b < r.nBay; b++) for (let l = 0; l < r.level; l++) for (let j = 0; j < r.ppl; j++) for (let e = 0; e < r.deep; e++) {
      const dPos = (e + 0.5) * (r.depth / r.deep);                 // posisi kedalaman dari muka lorong
      const x = r.hadap === -1 ? r.x0 + dPos : r.x0 + r.depth - dPos;
      slot.push({ x, y: levelY[l] ?? 0, z: r.z0 + b * bayW + (j + 0.5) * (bayW / r.ppl), jenis: r.jenis });
    }
  }
  const rnd = acak(seed);
  for (let i = slot.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [slot[i], slot[k]] = [slot[k], slot[i]]; }
  // palet terisi dari level bawah lebih dulu (lebih realistis): urutkan sebagian berdasar tinggi
  const pilih = slot.slice(0, Math.min(slot.length, Math.round(n)));
  return { pilih, kapasitas: slot.length };
}

export interface OpsiLayout { lebarM?: number; dockIn?: number; dockOut?: number; okupansi?: number | null }

export function susunLayout(t: TenderRow, h: HasilTender, o: OpsiLayout = {}): LayoutGudang {
  const sxIn = lengkapiSpaceExcel(t.asumsi.space?.excel);
  const sx = h.space.excel;
  const asumsi: string[] = [];
  const luasRencana = num(h.space.totalM2);
  // Lebar gudang: isian di simulasi → isian "Desain gudang (kiri-kanan)" di Space → otomatis (rasio panjang : lebar ≈ 1,6 : 1)
  const lebarIsi = num(t.asumsi.space?.excel?.lebarGudangM, 0);
  const lebarAuto = Math.max(15, Math.round(Math.sqrt(Math.max(luasRencana, 150) / 1.6)));
  const W = Math.max(8, num(o.lebarM, 0) || lebarIsi || lebarAuto);
  if (!o.lebarM && !lebarIsi) asumsi.push(`Lebar gudang belum diisi di Space ("Desain gudang kiri-kanan") → otomatis ${lebarAuto} m (rasio panjang : lebar ± 1,6 : 1).`);
  const lv = sx.level;
  const sideM = num(sxIn.rak.sideMm, 10000) / 1000, centerM = Math.max(sideM, num(sxIn.rak.centerMm, 13000) / 1000);
  const tinggiPalet = (num(sxIn.rak.palletMm, 150) + num(sxIn.rak.productMm, 1250)) / 1000;
  const levelY = [0];
  for (let l = 1; l < Math.max(1, lv.level); l++) levelY.push((lv.level1 + (l - 1) * lv.levelN + num(sxIn.rak.beamMm, 100)) / 1000);
  const tinggiRak = Math.max(lv.tinggi / 1000, levelY[levelY.length - 1] + tinggiPalet + 0.1);

  const zona: Zona[] = []; const rak: BarisRak[] = []; const palet: Palet[] = []; const lorong: Lorong[] = [];
  const sisi = 1.0;                                   // lorong samping (ujung baris rak) kiri & kanan
  const pakai = Math.max(3, W - 2 * sisi);

  // ---------- 1. Staging inbound (kiri) & outbound (kanan) di depan dock — lebar dibagi sesuai luas masing-masing
  const stg = (s: typeof sx.inbound) => ({ tapak: ceil(num(s.perSequence) / Math.max(1, num(s.tumpuk, 1))), tumpuk: Math.max(1, num(s.tumpuk, 1)), m2: num(s.footprint), m2pp: Math.max(1.25, num(s.m2PerPalet, 1.4)) });
  const sIn = stg(sx.inbound), sOut = stg(sx.outbound);
  const porsiIn = sIn.m2 + sOut.m2 > 0 ? Math.min(0.7, Math.max(0.3, sIn.m2 / (sIn.m2 + sOut.m2))) : 0.5;
  const zBagi = W * porsiIn, apron = 3.5;
  const dalam = (s2: ReturnType<typeof stg>, lebar: number) => {
    const nk = Math.max(1, Math.floor((lebar - 1) / 1.1)); const dx = s2.m2pp / 1.1;
    return { nk, dx, d: ceil(s2.tapak / nk) * dx };
  };
  const gIn = dalam(sIn, zBagi), gOut = dalam(sOut, W - zBagi);
  const D0 = Math.max(apron + 4, apron + Math.max(gIn.d, gOut.d) + 0.5);
  const stagingIn = { x0: 0, x1: D0, z0: 0, z1: zBagi }, stagingOut = { x0: 0, x1: D0, z0: zBagi, z1: W };
  zona.push({ id: 'stgIn', jenis: 'stagingIn', label: 'Staging inbound', ...stagingIn, ket: `${fmt(num(sx.inbound.perSequence), 0)} palet / sequence · ${fmt(sIn.m2, 0)} m²` });
  zona.push({ id: 'stgOut', jenis: 'stagingOut', label: 'Staging outbound', ...stagingOut, ket: `${fmt(num(sx.outbound.perSequence), 0)} palet / sequence · ${fmt(sOut.m2, 0)} m²` });
  const isiStaging = (s2: ReturnType<typeof stg>, g: ReturnType<typeof dalam>, r: typeof stagingIn, jenis: 'stagingIn' | 'stagingOut') => {
    for (let i = 0; i < s2.tapak; i++) {
      const baris = Math.floor(i / g.nk), k = i % g.nk;
      const x = r.x1 - 0.8 - baris * g.dx, z = r.z0 + 0.6 + k * 1.1 + 0.5;
      if (x < r.x0 + apron) break;
      for (let u = 0; u < s2.tumpuk; u++) palet.push({ x, y: u * tinggiPalet, z, jenis });
    }
  };
  isiStaging(sIn, gIn, stagingIn, 'stagingIn'); isiStaging(sOut, gOut, stagingOut, 'stagingOut');

  // ---------- 2. Jalur utama (cross aisle)
  let x = D0;
  const jalur0 = x; x += 3.5;
  zona.push({ id: 'jalur', jenis: 'jalur', label: 'Jalur utama', x0: jalur0, x1: x, z0: 0, z1: W, ket: 'cross aisle MHE' });
  const jalurAkhir = x;

  // ---------- 3. Rak SPR & DDR
  const okup = o.okupansi != null ? Math.min(1, Math.max(0, o.okupansi)) : null;
  const bangunRak = (jenis: 'spr' | 'ddr', d: typeof sx.sd, seed: number) => {
    if (num(d.bay) <= 0) return;
    const bayW = Math.max(0.8, num(d.width, 2.7)), depth = Math.max(0.6, num(d.depth, 1.15)), A = Math.max(1.2, 2 * num(d.koridor, 1.7));
    const deep = jenis === 'ddr' ? Math.max(1, num(d.deep, 2)) : 1, ppl = Math.max(1, num(d.paletPerLevel, 2));
    const perBaris = Math.max(1, Math.floor(pakai / bayW));
    const nBaris = ceil(num(d.bay) / perBaris);
    const x0 = x; const rows: BarisRak[] = [];
    let cx = x + (Math.abs(x - jalurAkhir) < 1e-6 ? 0 : A); let sisaBay = num(d.bay);
    for (let i = 0; i < nBaris; i++) {
      const nBay = Math.min(perBaris, sisaBay); sisaBay -= nBay;
      const hadap: 1 | -1 = i % 2 === 0 ? -1 : 1;     // baris genap menghadap lorong di depannya, ganjil ke belakang (back-to-back)
      rows.push({ jenis, x0: cx, depth, hadap, z0: sisi + (pakai - perBaris * bayW) / 2, nBay, bayW, level: Math.max(1, lv.level), deep, ppl });
      if (hadap === -1) lorong.push({ x: Math.abs(cx - jalurAkhir) < 1e-6 ? cx - 1.75 : cx - A / 2, z0: sisi, z1: W - sisi, zona: jenis });
      cx += depth + (hadap === 1 || i === nBaris - 1 ? A : 0);
      if (hadap === 1 && i === nBaris - 1) lorong.push({ x: cx - A / 2, z0: sisi, z1: W - sisi, zona: jenis });
    }
    x = cx;
    const target = okup != null ? okup * rows.reduce((s, r) => s + r.nBay * r.level * r.ppl * r.deep, 0) : num(d.ppReq);
    const { pilih, kapasitas } = isiRak(rows, target, levelY, seed);
    rak.push(...rows); palet.push(...pilih);
    zona.push({ id: jenis, jenis, label: jenis === 'spr' ? 'Rak SPR (selective)' : 'Rak DDR (double deep)', x0, x1: x, z0: 0, z1: W,
      ket: `${fmt(num(d.bay))} bay · ${nBaris} baris · ${lv.level} level · ${fmt(kapasitas)} posisi · terisi ${fmt(pilih.length)} palet` });
  };
  bangunRak('spr', sx.sd, 11); bangunRak('ddr', sx.dd, 23);

  // ---------- 4. Block stack & pallet floor
  const bangunLantai = (jenis: 'block' | 'floor', d: typeof sx.block, label: string) => {
    const n = num(d.ppReq); if (n <= 0) return;
    const tumpuk = Math.max(1, num(d.tumpuk, 1)), tapak = ceil(n / tumpuk);
    const pl = num(sxIn.palet.panjang, 1.2), lb = num(sxIn.palet.lebar, 1);
    const nz = Math.max(1, Math.floor(pakai / (lb + 0.15))), blokX = 6;
    const nBlok = ceil(tapak / (nz * blokX));
    const x0 = x; x += 3;
    let i = 0;
    for (let b = 0; b < nBlok; b++) {
      for (let r = 0; r < blokX && i < tapak; r++) for (let k = 0; k < nz && i < tapak; k++, i++) {
        const px = x + r * (pl + 0.1) + pl / 2, pz = sisi + k * (lb + 0.15) + lb / 2;
        for (let u = 0; u < tumpuk; u++) palet.push({ x: px, y: u * tinggiPalet, z: pz, jenis });
      }
      x += blokX * (pl + 0.1) + 3;
      lorong.push({ x: x - 1.5, z0: sisi, z1: W - sisi, zona: 'spr' });
    }
    zona.push({ id: jenis, jenis, label, x0, x1: x, z0: 0, z1: W, ket: `${fmt(n)} palet · tumpuk ${tumpuk} · ${fmt(tapak)} tapak` });
  };
  bangunLantai('block', sx.block, 'Block stack'); bangunLantai('floor', sx.floor, 'Pallet floor');

  // ---------- 5. Fasilitas (belakang)
  const fasList = (sxIn.fasilitas ?? []).filter(f => num(f.m2) > 0);
  const fasM2 = fasList.reduce((s, f) => s + num(f.m2), 0);
  // luas rencana lebih besar dari layout geometris → sisa dijadikan area allowance / jalur sebelum fasilitas
  const Df = fasM2 > 0 ? Math.max(4, fasM2 / W) : 0;
  const kurang = luasRencana / W - (x + Df);
  if (kurang > 0.5) {
    zona.push({ id: 'allow', jenis: 'jalur', label: 'Allowance / jalur', x0: x, x1: x + kurang, z0: 0, z1: W, ket: `${fmt(kurang * W, 0)} m² (pembulatan & allowance)` });
    x += kurang;
  }
  const fasilitas: Fasilitas[] = [];
  if (Df > 0) {
    let z = 0;
    for (const f of fasList) { const lebar = (num(f.m2) / fasM2) * W; fasilitas.push({ nama: f.nama, x0: x, x1: x + Df, z0: z, z1: z + lebar }); z += lebar; }
    zona.push({ id: 'fas', jenis: 'fasilitas', label: 'Fasilitas', x0: x, x1: x + Df, z0: 0, z1: W, ket: `${fmt(fasM2, 0)} m²` });
    x += Df;
  }
  const L = Math.max(x, 10);

  // ---------- 6. Dock
  const gd = t.asumsi.gudang;
  let dIn = num(o.dockIn, 0), dOut = num(o.dockOut, 0);
  if (!dIn && !dOut) {
    const tot = num(gd?.jumlah_dock, 0);
    if (tot > 0) { dIn = Math.max(1, Math.floor(tot / 2)); dOut = Math.max(1, tot - dIn); }
    else { dIn = 2; dOut = 2; asumsi.push('Jumlah dock belum ada di data gudang → dipakai 2 inbound + 2 outbound (bisa diubah).'); }
  }
  const maxDock = Math.max(1, Math.floor((W / 2 - 1) / 4));
  dIn = Math.min(dIn, maxDock); dOut = Math.min(dOut, maxDock);
  const dock: Dock[] = [];
  for (let i = 0; i < dIn; i++) dock.push({ z: (W / 2) * (i + 0.5) / dIn, arus: 'inbound' });
  for (let i = 0; i < dOut; i++) dock.push({ z: W / 2 + (W / 2) * (i + 0.5) / dOut, arus: 'outbound' });

  // ---------- 7. MHE & manpower
  const pd = h.processDesign;
  const mhe: UnitMhe[] = [];
  for (const e of pd?.mhe ?? []) {
    const harga = h.mhe.find(m => m.tool === e.nama);
    const unit = harga ? num(harga.unit) : num(e.resources);
    if (unit > 0) mhe.push({ nama: e.nama, jenis: jenisMhe(e.nama), unit });
  }
  const shiftAktif = pd?.shiftAktifIdx?.length ? pd.shiftAktifIdx : [0];
  const orang: GrupOrang[] = [];
  for (const r of pd?.mp ?? []) if (num(r.resources) > 0) orang.push({ nama: r.nama, kategori: kategoriOrang(r.nama), perShift: (r.perShift ?? []).map(v => num(v)), total: num(r.resources), jenis: 'Direct' });
  for (const r of pd?.indirect.rows ?? []) {
    if (num(r.qty) <= 0) continue;
    const ps = r.perShift ? r.perShift.map(v => Math.round(num(v))) : [0, 1, 2].map(i => (i === (shiftAktif[0] ?? 0) ? num(r.qty) : 0));
    orang.push({ nama: r.nama, kategori: kategoriOrang(r.nama), perShift: ps, total: num(r.qty), jenis: 'Indirect' });
  }

  const nSpr = rak.filter(r => r.jenis === 'spr').reduce((s, r) => s + r.nBay * r.level * r.ppl, 0);
  const nDdr = rak.filter(r => r.jenis === 'ddr').reduce((s, r) => s + r.nBay * r.level * r.ppl * r.deep, 0);
  const ringkas = [
    { label: 'Luas rencana (cost model)', nilai: `${fmt(luasRencana)} m²` },
    { label: 'Dimensi layout 3D', nilai: `${fmt(L, 1)} × ${fmt(W, 1)} m = ${fmt(L * W)} m²` },
    { label: 'Tinggi sisi / puncak', nilai: `${fmt(sideM, 1)} / ${fmt(centerM, 1)} m` },
    { label: 'Stok desain', nilai: `${fmt(num(h.space.ppDesain))} palet` },
    { label: 'Posisi rak SPR / DDR', nilai: `${fmt(nSpr)} / ${fmt(nDdr)}` },
    { label: 'Level rak · tinggi rak', nilai: `${lv.level} level · ${fmt(lv.tinggi / 1000, 2)} m` },
    { label: 'Dock inbound / outbound', nilai: `${dIn} / ${dOut}` },
  ];
  if (!lv.ok && sx.posisiRak > 0) asumsi.push(`Tinggi rak ${fmt(lv.tinggi / 1000, 2)} m melebihi tinggi sisi gudang ${fmt(sideM, 1)} m.`);
  if (L * W > luasRencana * 1.05 && luasRencana > 0) asumsi.push(`Layout 3D butuh ${fmt(L * W)} m² (lebih besar dari luas rencana ${fmt(luasRencana)} m²) karena lorong ujung rak & pembulatan baris — cek lebar gudang.`);

  return { L, W, H: sideM, puncak: centerM, luasRencana, luasLayout: L * W, zona, rak, palet, lorong, dock, fasilitas, tinggiPalet, tinggiRak, levelY,
    stagingIn, stagingOut, mhe, orang, shiftAktif, ringkas, asumsi };
}
