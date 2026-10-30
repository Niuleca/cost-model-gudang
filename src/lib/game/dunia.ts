// Leca Game · mesin simulasi berbasis event (deterministik dari seed).
// Alur: truk inbound → bongkar → cek → putaway → stok rak → order → alokasi FIFO/FEFO → pick → pack → cek → muat → truk berangkat.
// Durasi tugas = 3600 × qty ÷ (prod/jam × faktor) — sama dengan dasar FTE di cost model Leca.
import { buatAntrian, buatHeap, buatRng, bulatAcak, hariDalamBulan, hariMinggu, pilihBerbobot, tanggalHari } from './dasar';
import { ARMADA, HARI, JAM, jenisTrukDari, type JenisTruk, type Dunia, type EventSim, type JenisTugas, type Kemampuan, type LaporanHarian, type Lpn, type Lokasi, type Order, type Skenario, type Tugas, type Truk, type TipeTxn } from './tipe';

const KANDIDAT: Record<JenisTugas, Kemampuan[]> = {
  admin_in: ['admin', 'checker'], admin_out: ['admin', 'checker'],
  bongkar: ['operator', 'tkbm'], muat: ['operator', 'tkbm'],
  cek_in: ['checker', 'admin', 'operator'], cek_out: ['checker', 'admin', 'operator'],
  putaway: ['operator'], pick_palet: ['operator'],
  pick_karton: ['picker', 'tkbm', 'checker'], pack: ['picker', 'tkbm', 'checker'],
};
const MHE_UNTUK: Partial<Record<JenisTugas, ('reach' | 'forklift' | 'stacker' | 'hpt')[]>> = {
  putaway: ['reach', 'forklift', 'stacker'], pick_palet: ['reach', 'forklift', 'stacker'],
  bongkar: ['forklift', 'hpt', 'stacker', 'reach'], muat: ['forklift', 'hpt', 'stacker', 'reach'],
};

const kosongHari = () => ({ paletMasuk: 0, paletKeluarEq: 0, kartonKeluar: 0, orderSelesai: 0, orderTepat: 0, orderTerlambat: 0, orderTertunda: 0, kartonKurang: 0, paletRusak: 0, kejadian: [] as string[], pendapatan: 0, biaya: 0 });

export function buatDunia(sk: Skenario): Dunia {
  const rng = buatRng(sk.seed);
  const d: Dunia = {
    sk, t: 0, rng,
    sku: new Map(sk.sku.map(s => [s.id, s])),
    lokasi: new Map(sk.lokasi.map(l => [l.id, { ...l, lpn: [], dipesan: 0 }])),
    lpn: new Map(), lpnPerSku: new Map(sk.sku.map(s => [s.id, new Set<string>()])),
    ledger: [], saldo: new Map(sk.sku.map(s => [s.id, 0])),
    truk: new Map(), antreDock: { inbound: [], outbound: [] },
    dock: [...Array.from({ length: Math.max(1, sk.dockIn) }, (_, i) => ({ id: `DI${i + 1}`, arus: 'inbound' as const, truk: null })),
      ...Array.from({ length: Math.max(1, sk.dockOut) }, (_, i) => ({ id: `DO${i + 1}`, arus: 'outbound' as const, truk: null }))],
    order: new Map(), tugas: new Map(), menunggu: new Set(),
    pekerja: sk.pekerja.map(p => ({ ...p, sibuk: null, absen: false, jamKerja: 0 })),
    mhe: sk.mhe.map(m => ({ ...m, sibuk: null, jamKerja: 0 })),
    antrian: buatAntrian(), seq: 0,
    kas: sk.modal, piutang: [], akrual: { pendapatan: 0, biaya: 0 },
    hariIni: kosongHari(), laporan: [], hariKasNegatif: 0, bangkrut: false, pelanggaran: [],
    stat: { lemburJam: 0, tungguTruk: { n: 0, jam: 0, maks: 0 }, selesai: {}, jamTersedia: 0 },
  };
  stokAwal(d);
  jadwal(d, 0, 'awal_hari');
  return d;
}

// ---------- utilitas
const id = (d: Dunia, p: string) => `${p}${++d.seq}`;
function jadwal(d: Dunia, t: number, jenis: EventSim['jenis'], ref?: string) { d.antrian.push({ t, seq: ++d.seq, jenis, ref }); }
const hariKe = (t: number) => Math.floor(t / HARI);
const tanggal = (d: Dunia, t: number) => tanggalHari(d.sk.mulai, hariKe(t));
const hariOperasi = (d: Dunia, hari: number) => hari >= 0 && d.sk.hariKerja.includes(hariMinggu(tanggalHari(d.sk.mulai, hari)));
const mulaiShift = (d: Dunia, hari: number, s: number) => hari * HARI + (d.sk.shift.mulaiJam + s * d.sk.shift.jamKerja) * JAM;
/** Akhir shift yang sedang berjalan (atau t bila di luar shift). */
function akhirShift(d: Dunia, shift: number, t: number) {
  const h = hariKe(t);
  for (const k of [h, h - 1]) { const s = mulaiShift(d, k, shift); if (t >= s && t < s + d.sk.shift.jamKerja * JAM) return s + d.sk.shift.jamKerja * JAM; }
  return t;
}
export function bertugas(d: Dunia, shift: number, t: number) {
  const h = hariKe(t);
  for (const k of [h, h - 1]) {
    if (!hariOperasi(d, k)) continue;
    const s = mulaiShift(d, k, shift);
    if (t >= s && t < s + d.sk.shift.jamKerja * JAM) return true;
  }
  return false;
}

function txn(d: Dunia, tipe: TipeTxn, l: Lpn, karton: number, extra: { dari?: string; ke?: string; ref?: string } = {}) {
  d.ledger.push({ t: d.t, tipe, sku: l.sku, lot: l.lot, karton, lpn: l.id, ...extra });
  if (tipe === 'receive' || tipe === 'opening' || tipe === 'ship' || tipe === 'damage') d.saldo.set(l.sku, (d.saldo.get(l.sku) ?? 0) + karton);
}
function buang(a: string[], x: string) { const i = a.lastIndexOf(x); if (i >= 0) a.splice(i, 1); }
function taruh(d: Dunia, l: Lpn, lokasi: string) {
  const lama = d.lokasi.get(l.lokasi); if (lama) buang(lama.lpn, l.id);
  l.lokasi = lokasi; d.lokasi.get(lokasi)!.lpn.push(l.id);
}
function hapusLpn(d: Dunia, l: Lpn) {
  const lok = d.lokasi.get(l.lokasi); if (lok) buang(lok.lpn, l.id);
  d.lpn.delete(l.id); d.lpnPerSku.get(l.sku)?.delete(l.id);
}
function lpnBaru(d: Dunia, sku: string, lot: string, expiry: number | null, karton: number, lokasi: string, status: Lpn['status']) {
  const l: Lpn = { id: id(d, 'P'), lokasi: '', sku, lot, expiry, karton, dialokasi: 0, status, terima: d.t };
  d.lpn.set(l.id, l); d.lpnPerSku.get(sku)!.add(l.id); taruh(d, l, lokasi);
  return l;
}
const lokasiTipe = (d: Dunia, tipe: Lokasi['tipe']) => [...d.lokasi.values()].find(l => l.tipe === tipe)!;

/** Lokasi rak/lantai diurutkan sekali dari yang terdekat ke staging inbound (jarak Manhattan + tinggi). */
const URUT = new WeakMap<Dunia, Lokasi[]>();
function urutLokasi(d: Dunia) {
  let u = URUT.get(d);
  if (!u) {
    const st = lokasiTipe(d, 'staging_in');
    const j = (l: Lokasi) => Math.abs(l.x - st.x) + Math.abs(l.z - st.z) + l.y * 2;
    u = [...d.lokasi.values()].filter(l => l.tipe === 'rak' || l.tipe === 'lantai').sort((a, b) => j(a) - j(b) || (a.id < b.id ? -1 : 1));
    URUT.set(d, u);
  }
  return u;
}
/** Lokasi rak/lantai kosong terdekat dari staging inbound. */
function cariLokasiKosong(d: Dunia, mulai = 0) {
  const u = urutLokasi(d);
  for (let i = mulai; i < u.length; i++) if (u[i].lpn.length + u[i].dipesan < u[i].kapasitas) return u[i];
  return null;
}

function lotBaru(d: Dunia, skuId: string, umurHariIni: number) {
  const s = d.sku.get(skuId)!; const hari = hariKe(d.t);
  const prod = hari - umurHariIni;
  return { lot: `L${tanggalHari(d.sk.mulai, prod).replace(/-/g, '').slice(2)}-${skuId.slice(-2)}`, expiry: s.kontrol === 'expiry' ? prod + s.umurHari : null };
}

function stokAwal(d: Dunia) {
  const skus = d.sk.sku; const bobot = skus.map(s => s.bobot);
  const u = urutLokasi(d); let k = 0;
  for (let i = 0; i < d.sk.stokAwal; i++) {
    while (k < u.length && u[k].lpn.length >= u[k].kapasitas) k++;
    const lok = u[k]; if (!lok) { d.sk.asumsi.push(`Stok awal dipotong: rak penuh setelah ${i} palet.`); break; }
    const s = skus[pilihBerbobot(d.rng, bobot)];
    const { lot, expiry } = lotBaru(d, s.id, 5 + Math.floor(d.rng() * 60));
    const l = lpnBaru(d, s.id, lot, expiry, s.kartonPerPalet, lok.id, 'disimpan');
    l.terima = -Math.floor(d.rng() * 30) * HARI;
    txn(d, 'opening', l, l.karton);
  }
}

// ---------- tugas & penjadwalan
function tugasBaru(d: Dunia, jenis: JenisTugas, qty: number, prioritas: number, x: Partial<Tugas> = {}) {
  const t: Tugas = { id: id(d, 'T'), jenis, qty, satuan: d.sk.prod[jenis].satuan, prioritas, status: 'menunggu', dibuat: d.t, ...x };
  const antre = antreTugas(d); d.tugas.set(t.id, t);
  if (d.sk.prod[jenis].luar) {
    // di luar lingkup tender: langsung jalan tanpa pekerja/MHE gudang
    let siap = true;
    if (jenis === 'putaway') { const lok = cariLokasiKosong(d); if (lok) { lok.dipesan++; t.ke = lok.id; } else siap = false; }
    if (siap) { t.status = 'jalan'; t.mulai = d.t; t.durasi = durasi(d, t); t.selesai = d.t + t.durasi; jadwal(d, t.selesai, 'tugas_selesai', t.id); return t; }
  }
  d.menunggu.add(t.id); antre.get(jenis)!.push(t);
  return t;
}
function durasi(d: Dunia, t: Tugas) {
  const p = d.sk.prod[t.jenis]; const s = d.sku.get(d.lpn.get(t.lpn ?? '')?.sku ?? '') ?? d.sk.sku[0];
  // konversi qty tugas ke satuan productivity
  let q = t.qty;
  if (t.satuan === 'palet' && p.satuan === 'karton') q = t.qty * s.kartonPerPalet;
  if (t.satuan === 'karton' && p.satuan === 'palet') q = t.qty / s.kartonPerPalet;
  return Math.max(20, (JAM * q) / Math.max(0.01, p.prod * d.sk.faktor));
}

type HeapTugas = ReturnType<typeof buatHeap<Tugas>>;
const lebihDulu = (a: Tugas, b: Tugas) => a.prioritas < b.prioritas || (a.prioritas === b.prioritas && (a.dibuat < b.dibuat || (a.dibuat === b.dibuat && a.id < b.id)));
/** Antrean tugas menunggu per jenis (min-heap prioritas → waktu dibuat); dibangun ulang dari d.menunggu bila perlu. */
const ANTRE = new WeakMap<Dunia, Map<JenisTugas, HeapTugas>>();
function antreTugas(d: Dunia) {
  let m = ANTRE.get(d);
  if (!m) {
    m = new Map((Object.keys(KANDIDAT) as JenisTugas[]).map(j => [j, buatHeap<Tugas>(lebihDulu)]));
    for (const x of d.menunggu) { const tg = d.tugas.get(x)!; m.get(tg.jenis)!.push(tg); }
    ANTRE.set(d, m);
  }
  return m;
}

function jadwalkan(d: Dunia) {
  if (!d.menunggu.size) return;
  const bebas = d.pekerja.filter(p => !p.sibuk && !p.absen && p.kemampuan && bertugas(d, p.shift, d.t));
  if (!bebas.length) return;
  const antre = antreTugas(d);
  const buntu = new Set<JenisTugas>();
  while (bebas.length) {
    // tugas paling mendesak di antara jenis yang belum buntu
    let tg: Tugas | undefined;
    for (const [j, hp] of antre) { if (buntu.has(j)) continue; const x = hp.peek(); if (x && (!tg || lebihDulu(x, tg))) tg = x; }
    if (!tg) return;
    let pk = -1, alat: (typeof d.mhe)[number] | undefined;
    for (const k of KANDIDAT[tg.jenis]) {
      const i = bebas.findIndex(p => p.kemampuan === k);
      if (i < 0) continue;
      if (k === 'operator') {
        const boleh = MHE_UNTUK[tg.jenis] ?? ['forklift', 'reach', 'stacker', 'hpt'];
        alat = boleh.map(j => d.mhe.find(m => !m.sibuk && m.jenis === j)).find(Boolean);
        if (!alat) continue;
      }
      pk = i; break;
    }
    if (pk < 0) { buntu.add(tg.jenis); continue; }
    if (tg.jenis === 'putaway') {
      const lok = cariLokasiKosong(d); if (!lok) { buntu.add(tg.jenis); continue; }
      lok.dipesan++; tg.ke = lok.id;
    }
    antre.get(tg.jenis)!.pop();
    const p = bebas.splice(pk, 1)[0];
    tg.status = 'jalan'; tg.pekerja = p.id; tg.mulai = d.t; tg.durasi = durasi(d, tg); tg.selesai = d.t + tg.durasi;
    p.sibuk = tg.id; if (alat) { alat.sibuk = tg.id; tg.mhe = alat.id; }
    tg.akhirShift = akhirShift(d, p.shift, d.t);
    d.menunggu.delete(tg.id);
    jadwal(d, tg.selesai, 'tugas_selesai', tg.id);
  }
}

// ---------- truk & dock
function dockkan(d: Dunia, tr: Truk) {
  const dk = d.dock.find(x => x.arus === tr.arus && !x.truk);
  if (!dk) { tr.status = 'antre'; d.antreDock[tr.arus].push(tr.id); return; }
  dk.truk = tr.id; tr.dock = dk.id; tr.status = 'di_dock'; tr.masukDock = d.t;
  const tunggu = Math.max(0, d.t - tr.tiba) / JAM; const st = d.stat.tungguTruk; st.n++; st.jam += tunggu; st.maks = Math.max(st.maks, tunggu);
  if (tr.arus === 'inbound') {
    const pr = d.t + 4 * JAM;
    tugasBaru(d, 'admin_in', 1, pr, { truk: tr.id });
    for (const b of tr.palet) tugasBaru(d, 'bongkar', 1, pr, { truk: tr.id, barisAsn: b });
    tr.sisaTugas = tr.palet.length;
  } else {
    for (const oid of tr.order) siapMuat(d, d.order.get(oid)!);
    cekBerangkat(d, tr);
  }
}
function lepasDock(d: Dunia, tr: Truk) {
  tr.status = 'berangkat'; tr.berangkat = d.t;
  const dk = d.dock.find(x => x.id === tr.dock); if (dk) dk.truk = null;
  const next = d.antreDock[tr.arus].shift(); if (next) dockkan(d, d.truk.get(next)!);
}

// ---------- order outbound
function alokasi(d: Dunia, o: Order) {
  const urut = (a: Lpn, b: Lpn) => (a.expiry ?? Infinity) - (b.expiry ?? Infinity) || a.terima - b.terima;
  for (const br of o.baris) {
    const s = d.sku.get(br.sku)!;
    const ada = [...(d.lpnPerSku.get(br.sku) ?? [])].map(x => d.lpn.get(x)!).filter(l => l.status === 'disimpan' && l.karton - l.dialokasi > 0 && (l.expiry == null || l.expiry > hariKe(d.t) + 7)).sort(urut);
    let sisa = br.karton;
    // palet utuh dulu
    for (const l of ada) {
      if (sisa < s.kartonPerPalet) break;
      if (l.dialokasi === 0 && l.karton === s.kartonPerPalet) {
        l.dialokasi = l.karton; sisa -= l.karton; br.teralokasi += l.karton;
        tugasBaru(d, 'pick_palet', 1, o.batas, { lpn: l.id, order: o.id }); o.sisaPick++;
      }
    }
    // sisa karton: habiskan palet yang sudah terbuka dulu (FEFO)
    const terbuka = ada.filter(l => l.karton - l.dialokasi > 0).sort((a, b) => Number(b.karton < s.kartonPerPalet) - Number(a.karton < s.kartonPerPalet) || urut(a, b));
    for (const l of terbuka) {
      if (sisa <= 0) break;
      const ambil = Math.min(sisa, l.karton - l.dialokasi);
      l.dialokasi += ambil; sisa -= ambil; br.teralokasi += ambil; o.kartonLepas += ambil;
      tugasBaru(d, 'pick_karton', ambil, o.batas, { lpn: l.id, order: o.id }); o.sisaPick++;
    }
    if (sisa > 0) { o.kurang += sisa; d.hariIni.kartonKurang += sisa; }
  }
  o.paletEq = o.baris.reduce((a, b) => a + b.teralokasi / d.sku.get(b.sku)!.kartonPerPalet, 0);
  o.status = o.sisaPick > 0 ? 'teralokasi' : 'batal';
  if (o.status === 'batal') d.hariIni.kejadian.push(`Order ${o.id} batal: stok tidak tersedia.`);
}
function siapMuat(d: Dunia, o: Order) {
  const tr = o.truk ? d.truk.get(o.truk) : undefined;
  if (!tr || tr.status !== 'di_dock' || o.status !== 'di_staging') return;
  o.status = 'dimuat'; (o.jejak ??= {}).dimuat = d.t;
  tugasBaru(d, 'muat', Math.max(1, Math.ceil(o.paletEq - 1e-9)), o.batas, { order: o.id, truk: tr.id });
  tr.sisaTugas++;
}
function cekBerangkat(d: Dunia, tr: Truk) {
  if (tr.status !== 'di_dock' || tr.arus !== 'outbound') return;
  const os = tr.order.map(x => d.order.get(x)!).filter(o => o.status !== 'batal');
  if (os.length && os.every(o => o.status === 'terkirim')) lepasDock(d, tr);
  if (!os.length) lepasDock(d, tr);
}

// ---------- penanganan event
function awalHari(d: Dunia) {
  const h = hariKe(d.t), sk = d.sk;
  d.hariIni = kosongHari();
  for (const p of d.pekerja) { p.absen = d.rng() < sk.peluang.absenPerOrang; }
  const absen = d.pekerja.filter(p => p.absen).length;
  if (hariOperasi(d, h)) d.stat.jamTersedia += d.pekerja.filter(p => !p.absen && p.kemampuan).length * sk.shift.jamKerja;
  if (absen && hariOperasi(d, h)) d.hariIni.kejadian.push(`${absen} pekerja tidak masuk.`);
  if (hariOperasi(d, h)) {
    for (let s = 0; s < sk.shift.jumlah; s++) jadwal(d, mulaiShift(d, h, s), 'shift');
    const m0 = mulaiShift(d, h, 0), akhir = mulaiShift(d, h, sk.shift.jumlah - 1) + sk.shift.jamKerja * JAM;
    // truk inbound tersebar di jam operasi (sisakan 2 jam terakhir)
    // armada campuran: CDE / Fuso / Tronton / container 40HC; total palet harian = volume tender
    let sisaPalet = bulatAcak(d.rng, sk.permintaan.paletInHari);
    const pilihan: JenisTruk[] = ['cde', 'cdd', 'fuso', 'tronton', 'container20', 'container'], bobotArmada = [0.1, 0.15, 0.2, 0.25, 0.1, 0.2];
    while (sisaPalet > 0) {
      const jenisTruk = pilihan[pilihBerbobot(d.rng, bobotArmada)];
      const jml = Math.min(sisaPalet, ARMADA[jenisTruk].kapasitas);
      sisaPalet -= jml;
      const rencana = m0 + Math.floor(d.rng() * Math.max(JAM, akhir - m0 - 2 * JAM));
      const telat = d.rng() < sk.peluang.trukTerlambat ? Math.floor((1 + d.rng() * 3) * JAM) : 0;
      const palet = Array.from({ length: jml }, () => {
        const s = sk.sku[pilihBerbobot(d.rng, sk.sku.map(x => x.bobot))];
        const { lot, expiry } = lotBaru(d, s.id, 3 + Math.floor(d.rng() * 20));
        return { sku: s.id, lot, expiry, karton: s.kartonPerPalet };
      });
      const tr: Truk = { id: id(d, 'TI'), arus: 'inbound', jenis: jenisTruk, rencanaTiba: rencana, tiba: rencana + telat, dock: null, status: 'dijadwalkan', palet, order: [], sisaTugas: 0 };
      d.truk.set(tr.id, tr); jadwal(d, tr.tiba, 'truk_tiba', tr.id);
      if (telat) d.hariIni.kejadian.push(`Truk inbound ${tr.id} terlambat ${Math.round(telat / JAM)} jam.`);
    }
    // order masuk di awal tiap shift; batas kirim = akhir shift tersebut (cutoff)
    for (let s = 0; s < sk.shift.jumlah; s++) jadwal(d, mulaiShift(d, h, s), 'order_baru', String(s));
  }
  jadwal(d, (h + 1) * HARI - 1, 'akhir_hari');
  jadwal(d, (h + 1) * HARI, 'awal_hari');
}

function orderBaru(d: Dunia, shift: number) {
  const sk = d.sk, h = hariKe(d.t), P = sk.permintaan;
  const n = Math.max(1, bulatAcak(d.rng, P.orderHari / sk.shift.jumlah));
  const paletPerOrder = P.paletOutHari / Math.max(1, P.orderHari);
  const akhirShift = mulaiShift(d, h, shift) + sk.shift.jamKerja * JAM;
  const batas = Math.max(d.t + 3 * JAM, Math.min(akhirShift, h * HARI + P.cutoffJam * JAM + shift * sk.shift.jamKerja * JAM));
  const baru: Order[] = [];
  for (let i = 0; i < n; i++) {
    const target = paletPerOrder * (0.5 + d.rng());
    const nb = 1 + Math.floor(d.rng() * 3);
    // pembulatan probabilistik supaya rata-rata palet keluar = volume tender (tidak bias ke atas)
    const baris = Array.from({ length: nb }, () => {
      const s = sk.sku[pilihBerbobot(d.rng, sk.sku.map(x => x.bobot))];
      const plt = target / nb;
      const karton = d.rng() < P.porsiKartonLepas ? Math.max(1, bulatAcak(d.rng, plt * s.kartonPerPalet)) : bulatAcak(d.rng, plt) * s.kartonPerPalet;
      return { sku: s.id, karton, teralokasi: 0, terpick: 0 };
    }).filter(b => b.karton > 0);
    if (!baris.length) { const s = sk.sku[pilihBerbobot(d.rng, sk.sku.map(x => x.bobot))]; baris.push({ sku: s.id, karton: s.kartonPerPalet, teralokasi: 0, terpick: 0 }); }
    const o: Order = { id: id(d, 'SO'), dibuat: d.t, batas, baris, status: 'baru', truk: null, sisaPick: 0, kartonLepas: 0, paletEq: 0, kurang: 0 };
    d.order.set(o.id, o); alokasi(d, o);
    if (o.status !== 'batal') { baru.push(o); tugasBaru(d, 'admin_out', 1, batas, { order: o.id }); }
  }
  // kelompokkan ke truk outbound (kapasitas palet per truk)
  let tr: Truk | null = null, isi = 0;
  for (const o of baru) {
    if (!tr || isi + o.paletEq > P.paletPerTruk) {
      const tiba = Math.max(d.t + JAM, batas - P.trukOutJamSebelum * JAM);
      tr = { id: id(d, 'TO'), arus: 'outbound', rencanaTiba: tiba, tiba, dock: null, status: 'dijadwalkan', palet: [], order: [], sisaTugas: 0 };
      d.truk.set(tr.id, tr); jadwal(d, tiba, 'truk_tiba', tr.id); isi = 0;
    }
    tr.order.push(o.id); o.truk = tr.id; isi += o.paletEq; tr.jenis = jenisTrukDari(Math.ceil(isi - 1e-9));
  }
}

function tugasSelesai(d: Dunia, tg: Tugas) {
  tg.status = 'selesai';
  const p = d.pekerja.find(x => x.id === tg.pekerja); if (p) { p.sibuk = null; p.jamKerja += (tg.durasi ?? 0) / JAM; }
  if (tg.akhirShift != null && d.t > tg.akhirShift) d.stat.lemburJam += (d.t - Math.max(tg.akhirShift, tg.mulai ?? d.t)) / JAM;
  const sj = (d.stat.selesai[tg.jenis] ??= { n: 0, jam: 0 }); sj.n++; sj.jam += (tg.durasi ?? 0) / JAM;
  const m = d.mhe.find(x => x.id === tg.mhe); if (m) { m.sibuk = null; m.jamKerja += (tg.durasi ?? 0) / JAM; }
  const sk = d.sk; const tr = tg.truk ? d.truk.get(tg.truk) : undefined; const o = tg.order ? d.order.get(tg.order) : undefined;
  switch (tg.jenis) {
    case 'bongkar': {
      const b = tg.barisAsn!;
      const l = lpnBaru(d, b.sku, b.lot, b.expiry, b.karton, lokasiTipe(d, 'staging_in').id, 'diterima');
      txn(d, 'receive', l, l.karton, { ref: tr?.id });
      d.hariIni.paletMasuk++;
      if (d.rng() < sk.peluang.rusakPerPalet) {
        l.status = 'rusak'; taruh(d, l, lokasiTipe(d, 'rusak').id); txn(d, 'damage', l, -l.karton, { ref: 'klaim' });
        d.hariIni.paletRusak++; d.hariIni.biaya += sk.peluang.klaimPerPaletRusak; d.hariIni.kejadian.push(`Palet ${l.id} rusak saat bongkar (klaim).`);
        hapusLpn(d, l);
      } else tugasBaru(d, 'cek_in', 1, d.t + 4 * JAM, { lpn: l.id });
      if (tr && --tr.sisaTugas <= 0) lepasDock(d, tr);
      break;
    }
    case 'cek_in': tugasBaru(d, 'putaway', 1, d.t + 6 * JAM, { lpn: tg.lpn }); break;
    case 'putaway': {
      const l = d.lpn.get(tg.lpn!)!; const lok = d.lokasi.get(tg.ke!)!;
      lok.dipesan--; const dari = l.lokasi; taruh(d, l, lok.id); l.status = 'disimpan';
      txn(d, 'putaway', l, 0, { dari, ke: lok.id });
      d.hariIni.pendapatan += sk.tarif.inboundPerPalet;
      break;
    }
    case 'pick_palet': {
      const l = d.lpn.get(tg.lpn!)!; const dari = l.lokasi;
      taruh(d, l, lokasiTipe(d, 'staging_out').id); l.status = 'dipick';
      txn(d, 'move', l, 0, { dari, ke: l.lokasi, ref: o?.id });
      const br = o!.baris.find(b => b.sku === l.sku); if (br) br.terpick += l.karton;
      l.order = o!.id;
      if (--o!.sisaPick === 0) setelahPick(d, o!);
      break;
    }
    case 'pick_karton': {
      const src = d.lpn.get(tg.lpn!)!;
      src.karton -= tg.qty; src.dialokasi -= tg.qty;
      const out = lpnBaru(d, src.sku, src.lot, src.expiry, tg.qty, lokasiTipe(d, 'staging_out').id, 'dipick');
      out.order = o!.id;
      txn(d, 'pick', src, 0, { dari: src.lokasi, ke: out.lokasi, ref: o!.id });
      if (src.karton <= 0) hapusLpn(d, src);
      const br = o!.baris.find(b => b.sku === out.sku); if (br) br.terpick += tg.qty;
      if (--o!.sisaPick === 0) setelahPick(d, o!);
      break;
    }
    case 'pack': tugasBaru(d, 'cek_out', Math.max(1, Math.ceil(o!.paletEq - 1e-9)), o!.batas, { order: o!.id }); break;
    case 'cek_out': o!.status = 'di_staging'; (o!.jejak ??= {}).staging = d.t; siapMuat(d, o!); break;
    case 'muat': {
      const lp = [...d.lpn.values()].filter(l => l.order === o!.id);
      for (const l of lp) { txn(d, 'ship', l, -l.karton, { ref: o!.id }); d.hariIni.kartonKeluar += l.karton; hapusLpn(d, l); }
      o!.status = 'terkirim'; o!.selesai = d.t; (o!.jejak ??= {}).terkirim = d.t; o!.tepatWaktu = d.t <= o!.batas;
      d.hariIni.orderSelesai++; if (o!.tepatWaktu) d.hariIni.orderTepat++; else d.hariIni.orderTerlambat++;
      d.hariIni.paletKeluarEq += o!.paletEq; d.hariIni.pendapatan += o!.paletEq * sk.tarif.outboundPerPalet;
      if (tr) { tr.sisaTugas--; cekBerangkat(d, tr); }
      break;
    }
    default: break;
  }
}
function setelahPick(d: Dunia, o: Order) {
  o.status = 'dipick'; (o.jejak ??= {}).dipick = d.t;
  if (o.kartonLepas > 0) tugasBaru(d, 'pack', o.kartonLepas, o.batas, { order: o.id });
  else tugasBaru(d, 'cek_out', Math.max(1, Math.ceil(o.paletEq - 1e-9)), o.batas, { order: o.id });
}

function akhirHari(d: Dunia) {
  const h = hariKe(d.t), tgl = tanggal(d, d.t), sk = d.sk, nHari = hariDalamBulan(tgl);
  const stok = [...d.lpn.values()].filter(l => l.status === 'disimpan' || l.status === 'diterima').length;
  const kap = [...d.lokasi.values()].filter(l => l.tipe === 'rak' || l.tipe === 'lantai').reduce((a, l) => a + l.kapasitas, 0);
  const isiRak = [...d.lokasi.values()].filter(l => l.tipe === 'rak' || l.tipe === 'lantai').reduce((a, l) => a + l.lpn.length, 0);
  d.hariIni.pendapatan += (stok * sk.tarif.storagePerPaletBulan + sk.tarif.tetapBulan) / nHari;
  d.hariIni.biaya += (d.pekerja.reduce((a, p) => a + p.biayaBulan, 0) + sk.biaya.tetapBulan) / nHari;
  d.akrual.pendapatan += d.hariIni.pendapatan; d.akrual.biaya += d.hariIni.biaya;
  // akhir bulan: tagih (dibayar setelah term), bayar biaya bulan ini
  if (Number(tgl.slice(8)) === nHari) {
    d.piutang.push({ jatuhTempo: d.t + sk.termBayarHari * HARI, nilai: d.akrual.pendapatan, ket: `Invoice ${tgl.slice(0, 7)}` });
    jadwal(d, d.t + sk.termBayarHari * HARI, 'bayar');
    d.kas -= d.akrual.biaya; d.hariIni.kejadian.push(`Tutup bulan ${tgl.slice(0, 7)}: invoice terbit, gaji & biaya dibayar.`);
    d.akrual = { pendapatan: 0, biaya: 0 };
  }
  d.hariKasNegatif = d.kas < 0 ? d.hariKasNegatif + 1 : 0;
  if (d.hariKasNegatif >= 30 && !d.bangkrut) { d.bangkrut = true; d.hariIni.kejadian.push('BANGKRUT: kas negatif 30 hari berturut-turut.'); }
  const tertunda = [...d.order.values()].filter(o => !['terkirim', 'batal'].includes(o.status) && o.batas < d.t).length;
  const r: LaporanHarian = {
    hari: h, tanggal: tgl, operasi: hariOperasi(d, h), ...d.hariIni, orderTertunda: tertunda,
    laba: d.hariIni.pendapatan - d.hariIni.biaya, kas: d.kas, stokPalet: stok, utilisasi: kap ? isiRak / kap : 0, tugasTertunda: d.menunggu.size,
  };
  d.laporan.push(r);
  const pel = cekInvariant(d); if (pel.length) d.pelanggaran.push(...pel.map(p => `Hari ${h}: ${p}`));
}

function bayar(d: Dunia) {
  const jatuh = d.piutang.filter(p => p.jatuhTempo <= d.t);
  for (const p of jatuh) { d.kas += p.nilai; d.hariIni.kejadian.push(`${p.ket} dibayar pelanggan.`); }
  d.piutang = d.piutang.filter(p => p.jatuhTempo > d.t);
}

function proses(d: Dunia, e: EventSim) {
  d.t = e.t;
  switch (e.jenis) {
    case 'awal_hari': awalHari(d); break;
    case 'akhir_hari': akhirHari(d); break;
    case 'order_baru': orderBaru(d, Number(e.ref ?? 0)); break;
    case 'bayar': bayar(d); break;
    case 'truk_tiba': dockkan(d, d.truk.get(e.ref!)!); break;
    case 'tugas_selesai': tugasSelesai(d, d.tugas.get(e.ref!)!); break;
    case 'shift': break;
  }
  jadwalkan(d);
}

/** Jalankan simulasi sampai waktu `sampai` (detik game). */
export function jalankanSampai(d: Dunia, sampai: number) {
  for (;;) {
    const e = d.antrian.peek(); if (!e || e.t > sampai) break;
    d.antrian.pop(); proses(d, e);
  }
  d.t = Math.max(d.t, sampai);
}
/** Jalankan n hari game berikutnya (sampai laporan akhir hari ke-n ditulis). */
export const jalankanHari = (d: Dunia, n: number) => jalankanSampai(d, (d.laporan.length + n) * HARI - 1);

/** Pemeriksaan konsistensi: stok = ledger, LPN satu lokasi, kapasitas, alokasi. */
export function cekInvariant(d: Dunia): string[] {
  const salah: string[] = [];
  const perSku = new Map<string, number>(); const ledgerSku = new Map<string, number>();
  for (const l of d.lpn.values()) {
    perSku.set(l.sku, (perSku.get(l.sku) ?? 0) + l.karton);
    if (l.karton < 0 || l.dialokasi < 0 || l.dialokasi > l.karton) salah.push(`LPN ${l.id}: karton ${l.karton}, dialokasi ${l.dialokasi}`);
    const lok = d.lokasi.get(l.lokasi); if (!lok || !lok.lpn.includes(l.id)) salah.push(`LPN ${l.id} tidak tercatat di lokasi ${l.lokasi}`);
  }
  for (const x of d.ledger) if (x.tipe === 'receive' || x.tipe === 'opening' || x.tipe === 'ship' || x.tipe === 'damage') ledgerSku.set(x.sku, (ledgerSku.get(x.sku) ?? 0) + x.karton);
  for (const s of d.sku.keys()) {
    const a = perSku.get(s) ?? 0, b = d.saldo.get(s) ?? 0, c = ledgerSku.get(s) ?? 0;
    if (a !== b || b !== c) salah.push(`SKU ${s}: fisik ${a}, saldo ${b}, ledger ${c}`);
    if (b < 0) salah.push(`SKU ${s}: saldo negatif`);
  }
  for (const lok of d.lokasi.values()) {
    if (lok.lpn.length > lok.kapasitas) salah.push(`Lokasi ${lok.kode} berisi ${lok.lpn.length} > kapasitas ${lok.kapasitas}`);
    for (const x of lok.lpn) { const l = d.lpn.get(x); if (!l || l.lokasi !== lok.id) salah.push(`Lokasi ${lok.kode} memuat LPN ${x} yang tidak cocok`); }
  }
  return salah;
}

/** Ringkasan untuk laporan / uji. */
export function ringkasDunia(d: Dunia) {
  const L = d.laporan;
  const sum = (f: (r: LaporanHarian) => number) => L.reduce((a, r) => a + f(r), 0);
  const selesai = sum(r => r.orderSelesai);
  return {
    hari: L.length, pendapatan: sum(r => r.pendapatan), biaya: sum(r => r.biaya), laba: sum(r => r.laba), kas: d.kas,
    paletMasuk: sum(r => r.paletMasuk), paletKeluarEq: sum(r => r.paletKeluarEq), orderSelesai: selesai,
    sla: selesai ? sum(r => r.orderTepat) / selesai : 0, pelanggaran: d.pelanggaran.length, bangkrut: d.bangkrut,
    jamPekerja: d.pekerja.reduce((a, p) => a + p.jamKerja, 0), jamMhe: d.mhe.reduce((a, m) => a + m.jamKerja, 0),
  };
}

/** Akses fungsi internal untuk uji otomatis (jangan dipakai UI). */
export const _uji = { alokasi, lpnBaru, cariLokasiKosong, txn, urutLokasi };

/** Waktu mulai shift berikutnya setelah d.t (untuk tombol "lewati ke shift berikutnya"). */
export function shiftBerikut(d: Dunia): number {
  const h0 = hariKe(d.t);
  for (let h = h0; h <= h0 + 8; h++) {
    if (!hariOperasi(d, h)) continue;
    for (let s = 0; s < d.sk.shift.jumlah; s++) { const m = mulaiShift(d, h, s); if (m > d.t + 1) return m; }
  }
  return (h0 + 1) * HARI;
}
/** Jam & tanggal game untuk tampilan. */
export function waktuGame(d: Dunia) {
  const h = hariKe(d.t), det = d.t - h * HARI;
  const jam = Math.floor(det / JAM), menit = Math.floor((det % JAM) / 60);
  const shiftAktif = Array.from({ length: d.sk.shift.jumlah }, (_, s) => s).filter(s => bertugas(d, s, d.t));
  return { hari: h, tanggal: tanggal(d, d.t), jam, menit, teks: `${String(jam).padStart(2, '0')}:${String(menit).padStart(2, '0')}`, operasi: hariOperasi(d, h), shiftAktif };
}
