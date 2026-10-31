// Leca Game · mode "pakai data tender sungguhan": skenario permainan dari project tender Leca.
// Sumber angka: hasil hitung tender (manpower, biaya, rate card, kalender), layout 3D (lokasi rak), aktivitas (productivity).
import { faktorUom, type VolumeInput } from '../engine/types';
import type { HasilTender } from '../engine/index';
import type { TenderRow } from '../tender';
import { kategoriOrang, jenisMhe, susunLayout, type LayoutGudang } from '../simulasi3d/layout';
import { buatRng } from './dasar';
import type { JenisTugas, Kemampuan, Lokasi, Produktivitas, Skenario, Sku } from './tipe';

/** Role khusus arus dari namanya: "Inbound Admin" → in, "Outbound Checker" → out, selain itu umum. */
export const arusPeran = (nama: string): 'in' | 'out' | undefined =>
  /inbound|receiv|penerima|\bin\b|unload|bongkar/i.test(nama) ? 'in' : /outbound|dispatch|shipping|pengirim|\bout\b|delivery|loading|muat/i.test(nama) ? 'out' : undefined;
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Productivity bawaan bila aktivitas tender tidak ada yang cocok (per jam). */
export const PROD_DEFAULT: Record<JenisTugas, Produktivitas> = {
  admin_in: { prod: 20, satuan: 'dokumen', sumber: 'default' }, admin_out: { prod: 20, satuan: 'dokumen', sumber: 'default' },
  bongkar: { prod: 25, satuan: 'palet', sumber: 'default' }, cek_in: { prod: 40, satuan: 'palet', sumber: 'default' },
  putaway: { prod: 20, satuan: 'palet', sumber: 'default' }, pick_palet: { prod: 20, satuan: 'palet', sumber: 'default' },
  pick_karton: { prod: 120, satuan: 'karton', sumber: 'default' }, pack: { prod: 150, satuan: 'karton', sumber: 'default' },
  cek_out: { prod: 40, satuan: 'palet', sumber: 'default' }, muat: { prod: 25, satuan: 'palet', sumber: 'default' },
};

const isPalet = (u: string) => /^pal+et/i.test(u.trim());
const isKarton = (u: string) => /^(case|karton|dus|carton|ctn|box)$/i.test(u.trim());

/** Cocokkan aktivitas tender ke jenis tugas game (kata kunci + arus + UoM). */
export function prodDariAktivitas(akt: LayoutGudang['aktivitas']): { prod: Record<JenisTugas, Produktivitas>; catatan: string[] } {
  const prod = { ...PROD_DEFAULT } as Record<JenisTugas, Produktivitas>;
  const catatan: string[] = [];
  const aturan: [JenisTugas, (a: LayoutGudang['aktivitas'][number]) => boolean][] = [
    ['bongkar', a => /unload|bongkar|bongkaran|receiv/i.test(a.aktivitas) && isPalet(a.uom)],
    ['cek_in', a => /cek|check|qc|inspeksi|verif/i.test(a.aktivitas) && a.arus === 'inbound'],
    ['putaway', a => /put ?away|simpan|storing/i.test(a.aktivitas)],
    ['pick_palet', a => /pick/i.test(a.aktivitas) && isPalet(a.uom)],
    ['pick_karton', a => /pick/i.test(a.aktivitas) && isKarton(a.uom)],
    ['pack', a => /pack|kemas/i.test(a.aktivitas) && isKarton(a.uom)],
    ['cek_out', a => /cek|check|qc|verif/i.test(a.aktivitas) && a.arus === 'outbound'],
    ['muat', a => /(^|[^n])load|muat/i.test(a.aktivitas) && !/unload/i.test(a.aktivitas) && a.arus === 'outbound' && isPalet(a.uom)],
    ['admin_in', a => /admin|dokumen|document|gr\b|asn/i.test(a.aktivitas) && a.arus === 'inbound'],
    ['admin_out', a => /admin|dokumen|document|order|do\b/i.test(a.aktivitas) && a.arus === 'outbound'],
  ];
  for (const [j, cocok] of aturan) {
    const a = akt.find(x => x.prod > 0 && cocok(x));
    if (!a) { prod[j] = { ...PROD_DEFAULT[j], luar: true }; catatan.push(`${j}: tidak ada aktivitas di tender → dianggap dikerjakan pihak luar (sopir/vendor) dengan ${PROD_DEFAULT[j].prod} ${PROD_DEFAULT[j].satuan}/jam, tidak memakai manpower gudang.`); continue; }
    const satuan = isPalet(a.uom) ? 'palet' : isKarton(a.uom) ? 'karton' : PROD_DEFAULT[j].satuan;
    prod[j] = { prod: a.prod, satuan, sumber: `Aktivitas #${a.no} "${a.aktivitas}" (${a.prod} ${a.uom}/jam)` };
  }
  return { prod, catatan };
}

const paletPerBulan = (v: VolumeInput | undefined, pakai: 'rataRataBulan' | 'komitmenBulan' = 'rataRataBulan') => {
  if (!v) return 0;
  const f = faktorUom(v, 'palet');
  return v[pakai] * (f ?? 1 / 40);
};
const kartonPerPaletDari = (v: VolumeInput | undefined) => {
  const k = v?.konversi;
  if (k?.paletIsi && k.paletIsi > 0) return Math.round(k.paletIsi);
  if (v && isPalet(v.uom) && k?.per1 && k.per1 > 0 && isKarton(k.uom1 ?? '')) return Math.round(k.per1);
  return 40;
};

export interface OpsiSkenario { modal?: number; seed?: number; mulai?: string; layout?: LayoutGudang; peluang?: Partial<Skenario['peluang']> }

/** Bangun skenario permainan dari project tender (data sungguhan). */
export function skenarioDariTender(t: TenderRow, h: HasilTender, o: OpsiSkenario = {}): Skenario {
  const asumsi: string[] = [];
  const layout = o.layout ?? susunLayout(t, h, { param: { okupansi: 1 } });
  const seed = o.seed ?? 1;
  const rng = buatRng(seed ^ 0x5eed);
  const vols = (t.asumsi.volumes ?? []) as VolumeInput[];
  const vIn = vols.find(v => v.arus === 'inbound'), vOut = vols.find(v => v.arus === 'outbound'), vSt = vols.find(v => v.arus === 'storage');
  const hariOps = Math.max(1, num(h.kalender.hariOperasionalBulan, 22));

  // ---- Shift & hari kerja
  const nShift = Math.max(1, Math.min(3, num(t.jumlah_shift, 1)));
  const jamKerja = Math.max(4, Math.min(12, num(Number(t.jam_kerja_per_shift), 8)));
  const hk = num(t.hari_kerja_per_minggu, 5);
  const hariKerja = hk >= 7 ? [0, 1, 2, 3, 4, 5, 6] : hk === 6 ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  asumsi.push(`Shift pertama mulai 07.00, ${nShift} shift × ${jamKerja} jam, ${hk} hari kerja/minggu.`);

  // ---- SKU (sintetis — tender tidak menyimpan master SKU)
  const kpp = kartonPerPaletDari(vOut ?? vSt ?? vIn);
  const kelas: { k: Sku['kelas']; n: number; porsi: number }[] = [{ k: 'A', n: 4, porsi: 0.6 }, { k: 'B', n: 6, porsi: 0.3 }, { k: 'C', n: 10, porsi: 0.1 }];
  const sku: Sku[] = []; let no = 0;
  for (const c of kelas) for (let i = 0; i < c.n; i++) {
    no++;
    const exp = rng() < 0.5;
    sku.push({ id: `SKU${String(no).padStart(2, '0')}`, kode: `${c.k}-${String(no).padStart(3, '0')}`, nama: `Produk ${c.k}${i + 1}`,
      kartonPerPalet: kpp, kontrol: exp ? 'expiry' : 'none', umurHari: exp ? 180 + Math.floor(rng() * 540) : 0, kelas: c.k, bobot: c.porsi / c.n });
  }
  asumsi.push(`20 SKU contoh (A 4 / B 6 / C 10; porsi permintaan 60/30/10%), ${kpp} karton per palet${kpp === 40 ? ' (default, konversi tender tidak diisi)' : ' dari konversi volume tender'}.`);

  // ---- Lokasi dari layout 3D
  const lokasi: Lokasi[] = [];
  let i = 0;
  for (const p of layout.palet) {
    if (p.jenis === 'stagingIn' || p.jenis === 'stagingOut') continue;
    i++;
    const tipe: Lokasi['tipe'] = p.jenis === 'spr' || p.jenis === 'ddr' ? 'rak' : 'lantai';
    lokasi.push({ id: `L${i}`, kode: `${p.jenis.toUpperCase()}-${String(i).padStart(5, '0')}`, tipe, kapasitas: 1, x: p.x, z: p.z, y: p.y, lpn: [], dipesan: 0 });
  }
  const si = layout.stagingIn, so = layout.stagingOut;
  lokasi.push({ id: 'STG-IN', kode: 'STAGING-IN', tipe: 'staging_in', kapasitas: 1e6, x: (si.x0 + si.x1) / 2, z: (si.z0 + si.z1) / 2, y: 0, lpn: [], dipesan: 0 });
  lokasi.push({ id: 'STG-OUT', kode: 'STAGING-OUT', tipe: 'staging_out', kapasitas: 1e6, x: (so.x0 + so.x1) / 2, z: (so.z0 + so.z1) / 2, y: 0, lpn: [], dipesan: 0 });
  lokasi.push({ id: 'RUSAK', kode: 'KARANTINA', tipe: 'rusak', kapasitas: 1e6, x: si.x0, z: si.z0, y: 0, lpn: [], dipesan: 0 });
  const nPosisi = i;
  if (!nPosisi) asumsi.push('Layout tidak punya posisi simpan — isi sheet Space tender lebih dulu.');

  // ---- Pekerja dari manpower tender (biaya per orang = biaya bulan ÷ headcount)
  const pekerja: Skenario['pekerja'] = [];
  for (const mp of h.manpower) {
    const n = Math.max(0, Math.round(num(mp.headcount)));
    if (!n) continue;
    const kat = kategoriOrang(mp.roleName);
    const kemampuan: Kemampuan | null = kat === 'admin' || kat === 'checker' || kat === 'operator' || kat === 'tkbm' || kat === 'picker' ? kat : kat === 'lain' ? 'picker' : null;
    const grup = layout.orang.find(g => g.nama === mp.roleName);
    const ps = grup?.perShift?.length ? grup.perShift.slice(0, nShift) : [];
    const totPs = ps.reduce((a, b) => a + b, 0);
    const biaya = num(mp.biayaBulan) / n;
    for (let k = 0; k < n; k++) {
      // distribusi shift proporsional rencana per shift; sisanya (pengganti) bergiliran
      let shift = k % nShift;
      if (totPs > 0) { let acc = 0; const pos = ((k + 0.5) / n) * totPs; for (let s = 0; s < ps.length; s++) { acc += ps[s]; if (pos <= acc) { shift = s; break; } } }
      pekerja.push({ id: `W${pekerja.length + 1}`, nama: `${mp.roleName} ${k + 1}`, role: mp.roleName, kemampuan, arus: arusPeran(mp.roleName), shift, biayaBulan: biaya });
    }
  }
  if (!pekerja.some(p => p.kemampuan === 'operator') && !pekerja.some(p => p.kemampuan === 'tkbm')) asumsi.push('Tidak ada operator/TKBM di manpower tender — bongkar, putaway & picking palet tidak bisa berjalan.');

  // ---- MHE dari layout (process design)
  const mhe: Skenario['mhe'] = [];
  for (const u of layout.mhe) {
    const j = u.jenis === 'perangkat' ? jenisMhe(u.nama) : u.jenis;
    if (j === 'perangkat') continue;
    for (let k = 0; k < Math.max(0, Math.round(u.unit)); k++) mhe.push({ id: `M${mhe.length + 1}`, nama: `${u.nama} ${k + 1}`, jenis: j });
  }
  if (!mhe.length) asumsi.push('Tidak ada unit MHE di tender — operator tidak punya alat; tugas putaway/picking palet menunggu.');

  // ---- Productivity dari aktivitas tender
  const { prod, catatan } = prodDariAktivitas(layout.aktivitas);
  // role yang ada di manpower mengerjakan aktivitasnya sendiri walau aktivitas itu tidak tercantum di tender (productivity default)
  const ada = (k: Kemampuan) => pekerja.some(p => p.kemampuan === k);
  const ambilAlih: [JenisTugas, Kemampuan][] = [['admin_in', 'admin'], ['admin_out', 'admin'], ['cek_in', 'checker'], ['cek_out', 'checker'], ['bongkar', 'tkbm'], ['muat', 'tkbm']];
  const diambil = new Set<string>();
  for (const [j, k] of ambilAlih) if (prod[j].luar && ada(k)) {
    diambil.add(j);
    prod[j] = { ...PROD_DEFAULT[j], sumber: `default ${PROD_DEFAULT[j].prod} ${PROD_DEFAULT[j].satuan}/jam — ${k} ada di manpower, aktivitas belum ada di tender` };
    asumsi.push(`${j}: dikerjakan ${k} gudang dengan productivity default ${PROD_DEFAULT[j].prod} ${PROD_DEFAULT[j].satuan}/jam (aktivitas belum ada di tender).`);
  }
  asumsi.push(...catatan.filter(c => !diambil.has(c.split(':')[0])));
  const faktor = num(t.asumsi.faktorProduktivitas, 0.95) * num(t.asumsi.efisiensi, 0.9);

  // ---- Permintaan harian
  const paletInHari = paletPerBulan(vIn) / hariOps, paletOutHari = paletPerBulan(vOut) / hariOps;
  const orderHari = Math.max(1, Math.round(paletOutHari / 2));
  // batas kirim order = akhir shift (order masuk di awal shift); truk outbound tiba 3 jam sebelumnya
  const cutoffJam = 7 + jamKerja;
  const adaKarton = prod.pick_karton.sumber !== 'default';
  const porsiKartonLepas = adaKarton ? 0.3 : 0;
  asumsi.push(adaKarton ? '30% baris order berisi karton lepas (ada aktivitas picking karton di tender).' : 'Order dalam palet utuh — tender tidak punya aktivitas picking karton.');
  asumsi.push(`Volume harian = volume rata-rata ÷ ${hariOps.toFixed(2)} hari operasi: inbound ${paletInHari.toFixed(1)} palet, outbound ${paletOutHari.toFixed(1)} palet, ±${orderHari} order (≈2 palet/order).`);
  const stokRencana = Math.round(num(h.space.ppDesain, paletPerBulan(vSt)));
  const stokAwal = Math.min(nPosisi, Math.round(0.85 * stokRencana));

  // ---- Tarif dari rate card (per palet), basis tetap → tetap bulanan
  const tarif: Skenario['tarif'] = { storagePerPaletBulan: 0, inboundPerPalet: 0, outboundPerPalet: 0, tetapBulan: 0, catatan: [] };
  for (const rc of h.rateCard) {
    const v = rc.bucket === 'storage' ? vSt : rc.bucket === 'handling_in' ? vIn : rc.bucket === 'handling_out' ? vOut : undefined;
    if (rc.volumeTetap || !v) {
      tarif.tetapBulan += rc.tarifPerUnit * rc.volumeTarif;
      tarif.catatan.push(`${rc.bucket}: basis tetap ${rc.volumeTarif} ${rc.uom} × ${rc.tarifPerUnit} = tagihan tetap/bulan.`);
      continue;
    }
    const plt = paletPerBulan(v, 'komitmenBulan');
    const perPalet = plt > 0 ? (rc.tarifPerUnit * rc.rasioUom * v.komitmenBulan) / plt : 0;
    if (rc.bucket === 'storage') tarif.storagePerPaletBulan = perPalet;
    else if (rc.bucket === 'handling_in') tarif.inboundPerPalet = perPalet;
    else tarif.outboundPerPalet = perPalet;
    tarif.catatan.push(`${rc.bucket}: ${rc.tarifPerUnit} per ${rc.uom} → ${Math.round(perPalet)} per palet.`);
  }

  // ---- Biaya: manpower per orang + sisanya tetap (sewa, MHE, IT, overhead, bunga…) = total biaya cost model
  const mpBulan = pekerja.reduce((a, p) => a + p.biayaBulan, 0);
  const tetap = Math.max(0, num(h.totalBiayaBulan) - mpBulan);
  const rincian = Object.entries(h.perKelompok ?? {}).map(([nama, bulan]) => ({ nama, bulan: Number(bulan) }));

  return {
    nama: `${t.kode ?? ''} ${t.customer}`.trim(), pelanggan: t.customer, sumber: 'tender', tenderId: t.id,
    mulai: o.mulai ?? (t.tanggal_go_live || new Date().toISOString().slice(0, 10)).slice(0, 10),
    modal: o.modal ?? Math.round(num(h.totalBiayaBulan) * 3), seed,
    shift: { jumlah: nShift, mulaiJam: 7, jamKerja }, hariKerja,
    sku, lokasi, dockIn: Math.max(1, layout.dock.filter(x => x.arus === 'inbound').length), dockOut: Math.max(1, layout.dock.filter(x => x.arus === 'outbound').length),
    pekerja, mhe, prod, faktor,
    permintaan: { paletInHari, paletOutHari, orderHari, paletPerTruk: 20, cutoffJam, slaJam: jamKerja, porsiKartonLepas, trukOutJamSebelum: 3 },
    stokAwal, tarif, biaya: { tetapBulan: tetap, rincian }, termBayarHari: Math.max(0, num(t.payment_term_hari, 30)),
    peluang: { trukTerlambat: 0.1, rusakPerPalet: 0.002, absenPerOrang: 0.03, klaimPerPaletRusak: 500000, ...(o.peluang ?? {}) },
    asumsi,
  };
}
