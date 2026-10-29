// Simulasi gudang 3D — mengubah hasil hitung tender (space, rak, staging, MHE, manpower) menjadi tata letak 3D.
// Satuan meter. Sumbu X = panjang gudang (0 = dinding dock, makin besar makin ke belakang), Z = lebar gudang (kiri → kanan), Y = tinggi.
// Standar SPR: baris rak memanjang dari depan ke belakang (tegak lurus dinding dock), lorong reach truck terbuka ke jalur utama di depan.
import type { HasilTender } from '@/lib/engine/index.ts';
import type { TenderRow } from '@/lib/tender';
import { hitungLevelRak, lengkapiSpaceExcel } from '@/lib/engine/space';

export type JenisZona = 'stagingIn' | 'stagingOut' | 'spr' | 'ddr' | 'block' | 'floor' | 'fasilitas' | 'jalur';
export interface Zona { id: string; jenis: JenisZona; label: string; x0: number; x1: number; z0: number; z1: number; ket: string }
/** Satu baris rak: memanjang di sumbu X (bay berjejer ke belakang), kedalaman di sumbu Z. hadap = sisi lorong (+1 = ke arah Z besar). */
export interface BarisRak { jenis: 'spr' | 'ddr'; x0: number; z0: number; depth: number; hadap: 1 | -1; nBay: number; bayW: number; level: number; deep: number; ppl: number }
export interface Palet { x: number; y: number; z: number; jenis: 'spr' | 'ddr' | 'block' | 'floor' | 'stagingIn' | 'stagingOut'; rot?: boolean }
/** Lorong rak memanjang di sumbu X pada posisi z; x0 = mulut lorong (di jalur utama). */
export interface Lorong { z: number; x0: number; x1: number; zona: 'spr' | 'ddr' }
export interface Dock { z: number; arus: 'inbound' | 'outbound' }
export interface Fasilitas { nama: string; x0: number; x1: number; z0: number; z1: number }
export type JenisMhe = 'reach' | 'forklift' | 'stacker' | 'hpt' | 'perangkat';
export interface UnitMhe { nama: string; jenis: JenisMhe; unit: number }
export type KategoriOrang = 'admin' | 'checker' | 'picker' | 'operator' | 'tkbm' | 'supervisor' | 'security' | 'inventory' | 'lain';
export interface GrupOrang { nama: string; kategori: KategoriOrang; perShift: number[]; total: number; jenis: 'Direct' | 'Indirect' }
export interface AktSim { no: number; aktivitas: string; tahap: string; tool: string; role: string; uom: string; arus: string; prod: number; productivityId?: number }

/** Parameter simulasi — angka awal dari sheet Space tender, bisa direvisi di halaman simulasi (tidak mengubah tender). */
export interface ParamSim {
  lebarM: number;
  sideMm: number; centerMm: number; beamMm: number; palletMm: number; productMm: number; clearanceMm: number; levelManual: number | null;
  porsi: { spr: number; ddr: number; block: number; floor: number };
  spr: { koridor: number; depth: number; width: number; ppl: number };
  ddr: { koridor: number; depth: number; width: number; ppl: number; deep: number };
  blockTumpuk: number;
  dockIn: number; dockOut: number;
  okupansi: number | null;
}

export interface LayoutGudang {
  L: number; W: number; H: number; puncak: number;
  luasRencana: number; luasLayout: number;
  zona: Zona[]; rak: BarisRak[]; palet: Palet[]; lorong: Lorong[]; dock: Dock[]; fasilitas: Fasilitas[];
  tinggiPalet: number; tinggiRak: number; levelY: number[]; level: number;
  stagingIn: { x0: number; x1: number; z0: number; z1: number }; stagingOut: { x0: number; x1: number; z0: number; z1: number };
  mhe: UnitMhe[]; orang: GrupOrang[]; shiftAktif: number[]; aktivitas: AktSim[];
  ringkas: { label: string; nilai: string }[];
  asumsi: string[];
}

const ceil = (v: number) => Math.max(0, Math.ceil(v - 1e-9));
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const fmt = (v: number, d = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Pengacak deterministik (posisi palet terisi tersebar, tapi sama setiap kali dibuka). */
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

/** Angka awal parameter = isian sheet Space tender (gambar "Space" di halaman tender). */
export function paramAwal(t: TenderRow, h: HasilTender): ParamSim {
  const x = lengkapiSpaceExcel(t.asumsi.space?.excel);
  const luas = num(h.space.totalM2);
  const lebarIsi = num(t.asumsi.space?.excel?.lebarGudangM, 0);
  const gd = t.asumsi.gudang; const tot = num(gd?.jumlah_dock, 0);
  return {
    lebarM: lebarIsi || Math.max(15, Math.round(Math.sqrt(Math.max(luas, 150) / 1.6))),
    sideMm: num(x.rak.sideMm, 10000), centerMm: num(x.rak.centerMm, 13000), beamMm: num(x.rak.beamMm, 100), palletMm: num(x.rak.palletMm, 150),
    productMm: num(x.rak.productMm, 1250), clearanceMm: num(x.rak.clearanceMm, 100), levelManual: x.rak.levelManual && x.rak.levelManual > 0 ? x.rak.levelManual : null,
    porsi: { spr: num(x.porsi?.spr), ddr: num(x.porsi?.ddr), block: num(x.porsi?.block), floor: num(x.porsi?.floor) },
    spr: { koridor: num(x.sd.koridor, 1.7), depth: num(x.sd.depth, 1.15), width: num(x.sd.width, 2.7), ppl: num(x.sd.paletPerLevel, 2) },
    ddr: { koridor: num(x.dd.koridor, 1.85), depth: num(x.dd.depth, 2.4), width: num(x.dd.width, 2.7), ppl: num(x.dd.paletPerLevel, 2), deep: num(x.dd.deep, 2) },
    blockTumpuk: Math.max(1, num(x.block.tumpuk, 2)),
    dockIn: tot > 0 ? Math.max(1, Math.floor(tot / 2)) : 2, dockOut: tot > 0 ? Math.max(1, tot - Math.max(1, Math.floor(tot / 2))) : 2,
    okupansi: null,
  };
}

/** Susunan baris rak melintang lebar gudang: baris tunggal di dinding kiri, pasangan back-to-back di tengah, baris tunggal di dinding kanan; lorong di antaranya. */
function polaBaris(W: number, d: number, A: number) {
  const tepi = 0.3, guna = W - 2 * tepi;
  let terbaik: { baris: { z0: number; hadap: 1 | -1 }[]; lorong: number[]; lebar: number } | null = null;
  for (let k = 0; k <= 40; k++) for (const kanan of [true, false]) {
    const lebar = d + k * 2 * d + (k + 1) * A + (kanan ? d : 0);
    if (lebar > guna + 1e-9) continue;
    const baris: { z0: number; hadap: 1 | -1 }[] = []; const lorong: number[] = [];
    let z = tepi + (guna - lebar) / 2;
    baris.push({ z0: z, hadap: 1 }); z += d;                                  // baris tunggal kiri, menghadap lorong di kanannya
    for (let i = 0; i < k; i++) { lorong.push(z + A / 2); z += A; baris.push({ z0: z, hadap: -1 }); z += d; baris.push({ z0: z, hadap: 1 }); z += d; }
    lorong.push(z + A / 2); z += A;
    if (kanan) baris.push({ z0: z, hadap: -1 });
    if (!terbaik || baris.length > terbaik.baris.length || (baris.length === terbaik.baris.length && lebar < terbaik.lebar)) terbaik = { baris, lorong, lebar };
  }
  return terbaik ?? { baris: [{ z0: tepi, hadap: 1 as const }], lorong: [Math.min(W - 0.5, tepi + d + A / 2)], lebar: d + A };
}

export interface OpsiLayout { param?: Partial<ParamSim> }

export function susunLayout(t: TenderRow, h: HasilTender, o: OpsiLayout = {}): LayoutGudang {
  const awal = paramAwal(t, h);
  const p: ParamSim = { ...awal, ...(o.param ?? {}), porsi: { ...awal.porsi, ...(o.param?.porsi ?? {}) }, spr: { ...awal.spr, ...(o.param?.spr ?? {}) }, ddr: { ...awal.ddr, ...(o.param?.ddr ?? {}) } };
  const sx = h.space.excel;
  const asumsi: string[] = [];
  const luasRencana = num(h.space.totalM2);
  const W = Math.max(8, num(p.lebarM, 23));
  if (!num(t.asumsi.space?.excel?.lebarGudangM, 0) && !o.param?.lebarM) asumsi.push(`Lebar gudang belum diisi di Space ("Desain gudang kiri-kanan") → otomatis ${fmt(W)} m (rasio panjang : lebar ± 1,6 : 1).`);
  const lv = hitungLevelRak({ centerMm: p.centerMm, sideMm: p.sideMm, beamMm: p.beamMm, palletMm: p.palletMm, productMm: p.productMm, clearanceMm: p.clearanceMm, levelManual: p.levelManual });
  const level = Math.max(1, lv.level);
  const sideM = p.sideMm / 1000, centerM = Math.max(sideM, p.centerMm / 1000);
  const tinggiPalet = (p.palletMm + p.productMm) / 1000;
  const levelY = [0];
  for (let l = 1; l < level; l++) levelY.push((lv.level1 + (l - 1) * lv.levelN + p.beamMm) / 1000);
  const tinggiRak = Math.max(lv.tinggi / 1000, levelY[levelY.length - 1] + tinggiPalet + 0.1);
  const ppTotal = num(h.space.ppDesain, num(sx.ppTotal));

  const zona: Zona[] = []; const rak: BarisRak[] = []; const palet: Palet[] = []; const lorong: Lorong[] = [];

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

  let x = D0;
  const jalurUtama = (label: string, lebar: number, ket: string) => { zona.push({ id: `jalur${zona.length}`, jenis: 'jalur', label, x0: x, x1: x + lebar, z0: 0, z1: W, ket }); x += lebar; };
  jalurUtama('Jalur utama', 3.5, 'cross aisle MHE · mulut lorong rak');

  // ---------- 2. Rak SPR & DDR — baris memanjang ke belakang, lorong tegak lurus dock
  const okup = p.okupansi != null ? Math.min(1, Math.max(0, p.okupansi)) : null;
  const info: string[] = [];
  const bangunRak = (jenis: 'spr' | 'ddr', seed: number) => {
    const d0 = jenis === 'spr' ? p.spr : p.ddr;
    const deep = jenis === 'ddr' ? Math.max(1, num(p.ddr.deep, 2)) : 1;
    const ppl = Math.max(1, Math.round(num(d0.ppl, 2)));
    const ppReq = ppTotal * Math.max(0, num(jenis === 'spr' ? p.porsi.spr : p.porsi.ddr));
    const kapBay = ppl * deep * level;
    const nBayTot = ceil(ppReq / kapBay);
    if (nBayTot <= 0) return;
    const bayW = Math.max(0.8, num(d0.width, 2.7)), depth = Math.max(0.6, num(d0.depth, 1.15)), A = Math.max(1.2, 2 * num(d0.koridor, 1.7));
    const pola = polaBaris(W, depth, A);
    const nBaris = pola.baris.length;
    const perBaris = ceil(nBayTot / nBaris);
    const x0 = x; const rows: BarisRak[] = [];
    let sisa = nBayTot;
    for (const b of pola.baris) {
      const nBay = Math.min(perBaris, sisa); sisa -= nBay;
      if (nBay > 0) rows.push({ jenis, x0, z0: b.z0, depth, hadap: b.hadap, nBay, bayW, level, deep, ppl });
    }
    const panjang = perBaris * bayW;
    for (const zc of pola.lorong) lorong.push({ z: zc, x0: x0 - 1.75, x1: x0 + panjang, zona: jenis });
    x += panjang;
    // isi palet (acak deterministik)
    const slot: Palet[] = [];
    for (const r of rows) for (let b = 0; b < r.nBay; b++) for (let l = 0; l < r.level; l++) for (let j = 0; j < r.ppl; j++) for (let e = 0; e < r.deep; e++) {
      const dPos = (e + 0.5) * (r.depth / r.deep);                    // jarak dari muka lorong
      const z = r.hadap === 1 ? r.z0 + r.depth - dPos : r.z0 + dPos;
      slot.push({ x: r.x0 + b * r.bayW + (j + 0.5) * (r.bayW / r.ppl), y: levelY[l] ?? 0, z, jenis, rot: true });
    }
    const rnd = acak(seed);
    for (let i = slot.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [slot[i], slot[k]] = [slot[k], slot[i]]; }
    const target = okup != null ? okup * slot.length : ppReq;
    const pilih = slot.slice(0, Math.min(slot.length, Math.round(target)));
    rak.push(...rows); palet.push(...pilih);
    const nama = jenis === 'spr' ? 'Rak SPR (selective)' : 'Rak DDR (double deep)';
    zona.push({ id: jenis, jenis, label: nama, x0, x1: x, z0: 0, z1: W,
      ket: `${fmt(nBayTot)} bay · ${nBaris} baris × ${perBaris} bay · ${level} level · ${fmt(slot.length)} posisi · terisi ${fmt(pilih.length)}` });
    info.push(`${jenis.toUpperCase()}: ${nBaris} baris (lorong ${fmt(A, 1)} m × ${pola.lorong.length}) × ${perBaris} bay, panjang ${fmt(panjang, 1)} m`);
    jalurUtama(jenis === 'spr' && num(p.porsi.ddr) > 0 ? 'Jalur antar-zona' : 'Gang belakang', jenis === 'spr' && num(p.porsi.ddr) > 0 ? 3.5 : 2, 'akses MHE & jalur evakuasi');
  };
  bangunRak('spr', 11); bangunRak('ddr', 23);

  // ---------- 3. Block stack & pallet floor (blok palet, gang di antara blok)
  const pl = 1.2, lb = 1.0;
  const bangunLantai = (jenis: 'block' | 'floor', porsi: number, tumpuk: number, label: string) => {
    const n = ppTotal * Math.max(0, porsi); if (n <= 0) return;
    const tapak = ceil(n / tumpuk);
    const nz = Math.max(1, Math.floor((W - 2) / (lb + 0.15))), blokX = 6;
    const nBlok = ceil(tapak / (nz * blokX));
    const x0 = x;
    let i = 0;
    for (let b = 0; b < nBlok; b++) {
      for (let r = 0; r < blokX && i < tapak; r++) for (let k = 0; k < nz && i < tapak; k++, i++) {
        const px = x + r * (pl + 0.1) + pl / 2, pz = 1 + k * (lb + 0.15) + lb / 2;
        for (let u = 0; u < tumpuk; u++) palet.push({ x: px, y: u * tinggiPalet, z: pz, jenis });
      }
      x += blokX * (pl + 0.1) + 3;
    }
    zona.push({ id: jenis, jenis, label, x0, x1: x, z0: 0, z1: W, ket: `${fmt(n)} palet · tumpuk ${tumpuk} · ${fmt(tapak)} tapak` });
  };
  bangunLantai('block', num(p.porsi.block), Math.max(1, Math.round(p.blockTumpuk)), 'Block stack');
  bangunLantai('floor', num(p.porsi.floor), 1, 'Pallet floor');

  // ---------- 4. Fasilitas (belakang)
  const sxIn = lengkapiSpaceExcel(t.asumsi.space?.excel);
  const fasList = (sxIn.fasilitas ?? []).filter(f => num(f.m2) > 0);
  const fasM2 = fasList.reduce((s, f) => s + num(f.m2), 0);
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

  // ---------- 5. Dock
  if (!num(t.asumsi.gudang?.jumlah_dock, 0) && o.param?.dockIn == null && o.param?.dockOut == null) asumsi.push('Jumlah dock belum ada di data gudang → dipakai 2 inbound + 2 outbound (bisa diubah).');
  const maxDock = Math.max(1, Math.floor((W / 2 - 1) / 4));
  const dIn = Math.min(Math.max(1, Math.round(p.dockIn)), maxDock), dOut = Math.min(Math.max(1, Math.round(p.dockOut)), maxDock);
  const dock: Dock[] = [];
  for (let i = 0; i < dIn; i++) dock.push({ z: zBagi * (i + 0.5) / dIn, arus: 'inbound' });
  for (let i = 0; i < dOut; i++) dock.push({ z: zBagi + (W - zBagi) * (i + 0.5) / dOut, arus: 'outbound' });

  // ---------- 6. MHE, manpower, aktivitas (productivity)
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
  const aktivitas: AktSim[] = (t.asumsi.aktivitas ?? []).map((a, i) => ({ no: i + 1, aktivitas: a.aktivitas, tahap: a.tahap, tool: a.tool, role: a.roleName, uom: a.uom, arus: a.arus,
    prod: num(a.prodPerJam), productivityId: (a as { productivityId?: number }).productivityId })).filter(a => a.aktivitas || a.role);

  const nSpr = rak.filter(r => r.jenis === 'spr').reduce((s, r) => s + r.nBay * r.level * r.ppl, 0);
  const nDdr = rak.filter(r => r.jenis === 'ddr').reduce((s, r) => s + r.nBay * r.level * r.ppl * r.deep, 0);
  const ringkas = [
    { label: 'Luas rencana (cost model)', nilai: `${fmt(luasRencana)} m²` },
    { label: 'Dimensi layout 3D', nilai: `${fmt(L, 1)} × ${fmt(W, 1)} m = ${fmt(L * W)} m²` },
    { label: 'Tinggi sisi / puncak', nilai: `${fmt(sideM, 1)} / ${fmt(centerM, 1)} m` },
    { label: 'Stok desain', nilai: `${fmt(ppTotal)} palet` },
    { label: 'Posisi rak SPR / DDR', nilai: `${fmt(nSpr)} / ${fmt(nDdr)}` },
    { label: 'Level rak · tinggi rak', nilai: `${level} level · ${fmt(lv.tinggi / 1000, 2)} m` },
    ...info.map(s => ({ label: 'Susunan rak', nilai: s })),
    { label: 'Dock inbound / outbound', nilai: `${dIn} / ${dOut}` },
  ];
  if (!lv.ok && ppTotal > 0) asumsi.push(`Tinggi rak ${fmt(lv.tinggi / 1000, 2)} m melebihi tinggi sisi gudang ${fmt(sideM, 1)} m.`);
  const porsiTot = p.porsi.spr + p.porsi.ddr + p.porsi.block + p.porsi.floor;
  if (Math.abs(porsiTot - 1) > 0.001) asumsi.push(`Total porsi SPR + DDR + block + floor = ${fmt(porsiTot * 100, 1)}% (seharusnya 100%).`);
  if (L * W > luasRencana * 1.05 && luasRencana > 0) asumsi.push(`Layout 3D butuh ${fmt(L * W)} m² (lebih besar dari luas rencana ${fmt(luasRencana)} m²): apron dock, jalur utama, gang belakang & pembulatan baris rak tidak masuk rumus luas — cek lebar gudang atau parameter rak.`);

  return { L, W, H: sideM, puncak: centerM, luasRencana, luasLayout: L * W, zona, rak, palet, lorong, dock, fasilitas, tinggiPalet, tinggiRak, levelY, level,
    stagingIn, stagingOut, mhe, orang, shiftAktif, aktivitas, ringkas, asumsi };
}
