// Leca Game · red flag: mendeteksi masalah operasi yang akan dihadapi dari keadaan simulasi.
// Tiap flag: tingkat (kritis/peringatan/info), judul, angka bukti, dan saran tindakan.
import { HARI, JAM, type Dunia, type JenisTugas, type Kemampuan } from './tipe';

export type TingkatFlag = 'kritis' | 'peringatan' | 'info';
export interface RedFlag { kode: string; tingkat: TingkatFlag; judul: string; detail: string; saran: string }

const LABEL: Record<JenisTugas, string> = {
  admin_in: 'admin inbound', bongkar: 'bongkar', cek_in: 'cek inbound', putaway: 'putaway', admin_out: 'admin outbound',
  pick_palet: 'pick palet', pick_karton: 'pick karton', pack: 'packing', cek_out: 'cek outbound', muat: 'muat',
};
const PERAN: Record<Kemampuan, string> = { admin: 'Admin', checker: 'Checker', operator: 'Operator MHE', picker: 'Picker', tkbm: 'TKBM' };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const ang = (v: number, k = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: k });

/** Fraksi jam kerja hari ini yang sudah lewat (0..1). */
function fraksiHari(d: Dunia) {
  const jam = (d.t % HARI) / JAM; const sk = d.sk;
  return Math.max(0, Math.min(1, (jam - sk.shift.mulaiJam) / (sk.shift.jumlah * sk.shift.jamKerja)));
}

export function hitungRedFlag(d: Dunia, tambahan: RedFlag[] = []): RedFlag[] {
  const f: RedFlag[] = [];
  const sk = d.sk, st = d.stat;
  const laporan = [...d.laporan, { ...d.hariIni, operasi: true }];
  const hariOps = d.laporan.filter(r => r.operasi).length + fraksiHari(d);

  // 1. Antrean tugas menumpuk → bottleneck
  const antre: Partial<Record<JenisTugas, number>> = {};
  for (const id of d.menunggu) { const t = d.tugas.get(id); if (t) antre[t.jenis] = (antre[t.jenis] ?? 0) + 1; }
  for (const [j, n] of Object.entries(antre) as [JenisTugas, number][]) {
    if (n < 15) continue;
    const peran = j === 'putaway' || j === 'pick_palet' ? 'operator MHE / unit MHE' : j === 'pick_karton' || j === 'pack' ? 'picker' : j.startsWith('cek') ? 'checker' : j.startsWith('admin') ? 'admin' : 'operator / TKBM';
    f.push({ kode: `ANTRE_${j}`, tingkat: n >= 40 ? 'kritis' : 'peringatan', judul: `Bottleneck ${LABEL[j]}`, detail: `${n} tugas ${LABEL[j]} menunggu.`, saran: `Tambah ${peran} atau naikkan productivity ${LABEL[j]}; cek apakah volume harian melebihi kapasitas jam kerja.` });
  }

  // 2. Utilisasi per peran (overload / kelebihan orang)
  if (hariOps >= 0.5) {
    const per = new Map<Kemampuan, { kerja: number; n: number }>();
    for (const p of d.pekerja) if (p.kemampuan) { const x = per.get(p.kemampuan) ?? { kerja: 0, n: 0 }; x.kerja += p.jamKerja; x.n++; per.set(p.kemampuan, x); }
    for (const [k, x] of per) {
      const tersedia = x.n * sk.shift.jamKerja * hariOps * (1 - sk.peluang.absenPerOrang);
      if (tersedia <= 0) continue;
      const u = x.kerja / tersedia;
      if (u > 0.9) f.push({ kode: `UTIL_${k}`, tingkat: u > 1 ? 'kritis' : 'peringatan', judul: `${PERAN[k]} overload`, detail: `Utilisasi ${pct(u)} (${x.n} orang, ${ang(x.kerja, 1)} jam kerja).`, saran: `Tambah ${PERAN[k].toLowerCase()} atau sebar beban ke shift lain; overload memicu lembur & keterlambatan.` });
      else if (u < 0.35 && x.n >= 2) f.push({ kode: `IDLE_${k}`, tingkat: 'info', judul: `${PERAN[k]} banyak menganggur`, detail: `Utilisasi ${pct(u)} (${x.n} orang).`, saran: `Pertimbangkan kurangi headcount atau gabungkan peran (multi-skill) untuk menekan biaya manpower.` });
    }
    // MHE
    if (d.mhe.length) {
      const kerja = d.mhe.reduce((a, m) => a + m.jamKerja, 0), tersedia = d.mhe.length * sk.shift.jumlah * sk.shift.jamKerja * hariOps;
      const u = tersedia ? kerja / tersedia : 0;
      if (u > 0.85) f.push({ kode: 'UTIL_MHE', tingkat: u > 0.95 ? 'kritis' : 'peringatan', judul: 'MHE hampir penuh terpakai', detail: `Utilisasi MHE ${pct(u)} (${d.mhe.length} unit).`, saran: 'Tambah unit MHE atau jadwal charging/servis di luar jam puncak.' });
    }
  }

  // 3. Lembur
  if (st.lemburJam > 0.5) {
    const perHari = st.lemburJam / Math.max(1, hariOps);
    f.push({ kode: 'LEMBUR', tingkat: perHari > 4 ? 'kritis' : 'peringatan', judul: 'Pekerjaan melewati jam shift (lembur)', detail: `${ang(st.lemburJam, 1)} jam lembur (≈ ${ang(perHari, 1)} jam/hari).`, saran: 'Biaya lembur belum ada di cost model — tambah orang/shift atau masukkan biaya lembur ke tender.' });
  }

  // 4. Antrean & waktu tunggu truk → kekurangan dock
  const antreTruk = d.antreDock.inbound.length + d.antreDock.outbound.length;
  const rataTunggu = st.tungguTruk.n ? st.tungguTruk.jam / st.tungguTruk.n : 0;
  if (antreTruk >= 2 || rataTunggu > 0.5 || st.tungguTruk.maks > 2)
    f.push({ kode: 'DOCK', tingkat: rataTunggu > 1 || antreTruk >= 4 ? 'kritis' : 'peringatan', judul: 'Truk menunggu dock', detail: `${antreTruk} truk antre sekarang; rata-rata tunggu ${ang(rataTunggu * 60)} menit, maks ${ang(st.tungguTruk.maks * 60)} menit.`, saran: 'Tambah dock / atur slot jadwal kedatangan (appointment) / percepat bongkar-muat.' });

  // 5. SLA pengiriman
  let kirim = 0, tepat = 0, telat = 0; for (const r of laporan) { kirim += r.orderSelesai; tepat += r.orderTepat; telat += r.orderTerlambat; }
  const tertunda = [...d.order.values()].filter(o => !['terkirim', 'batal'].includes(o.status) && o.batas < d.t).length;
  if (kirim >= 5 && tepat / kirim < 0.95) f.push({ kode: 'SLA', tingkat: tepat / kirim < 0.85 ? 'kritis' : 'peringatan', judul: 'SLA tepat waktu di bawah 95%', detail: `${pct(tepat / kirim)} tepat waktu (${telat} terlambat dari ${kirim}).`, saran: 'Cari bottleneck outbound (pick/cek/muat) atau majukan jam order masuk / cutoff.' });
  if (tertunda > 0) f.push({ kode: 'TERTUNDA', tingkat: tertunda >= 5 ? 'kritis' : 'peringatan', judul: 'Order melewati batas kirim', detail: `${tertunda} order belum terkirim padahal batas sudah lewat.`, saran: 'Prioritaskan order lewat batas; cek kapasitas pick & muat.' });

  // 6. Kapasitas rak & stok
  let isi = 0, kap = 0; for (const l of d.lokasi.values()) if (l.tipe === 'rak' || l.tipe === 'lantai') { kap += l.kapasitas; isi += l.lpn.length; }
  const okup = kap ? isi / kap : 0;
  if (okup > 0.9) f.push({ kode: 'RAK_PENUH', tingkat: okup > 0.97 ? 'kritis' : 'peringatan', judul: 'Rak hampir penuh', detail: `Okupansi ${pct(okup)} (${ang(isi)} / ${ang(kap)} posisi).`, saran: 'Tambah posisi rak / block stack di Desain gudang, atau kurangi stok (FEFO, retur barang lambat).' });
  const putawayTanpaLokasi = (antre.putaway ?? 0) > 0 && okup > 0.99;
  if (putawayTanpaLokasi) f.push({ kode: 'PUTAWAY_BUNTU', tingkat: 'kritis', judul: 'Putaway tertahan — tidak ada lokasi kosong', detail: 'Palet menumpuk di staging inbound.', saran: 'Kapasitas simpan kurang dari kebutuhan; perbesar gudang atau ubah metode simpan.' });
  let kurang = 0; for (const r of laporan) kurang += r.kartonKurang;
  if (kurang > 0) f.push({ kode: 'STOK_KURANG', tingkat: 'peringatan', judul: 'Order tidak terpenuhi (stok kurang)', detail: `${ang(kurang)} karton tidak tersedia saat alokasi.`, saran: 'Cek pola replenishment / safety stock pelanggan; risiko klaim fill-rate.' });
  const hariIni = Math.floor(d.t / HARI);
  let dekatExp = 0; for (const l of d.lpn.values()) if (l.expiry != null && l.expiry - hariIni <= 30 && l.status === 'disimpan') dekatExp++;
  if (dekatExp > 0) f.push({ kode: 'EXPIRY', tingkat: dekatExp > 20 ? 'peringatan' : 'info', judul: 'Stok mendekati kedaluwarsa', detail: `${dekatExp} palet kedaluwarsa ≤ 30 hari.`, saran: 'Jalankan FEFO ketat & laporkan ke pelanggan sebelum jadi klaim.' });

  // 7. Staging menumpuk
  const stgIn = [...d.lokasi.values()].find(l => l.tipe === 'staging_in')?.lpn.length ?? 0;
  const stgOut = [...d.lokasi.values()].find(l => l.tipe === 'staging_out')?.lpn.length ?? 0;
  if (stgIn > Math.max(30, sk.permintaan.paletInHari * 0.5)) f.push({ kode: 'STG_IN', tingkat: 'peringatan', judul: 'Staging inbound menumpuk', detail: `${stgIn} palet menunggu putaway.`, saran: 'Putaway kalah cepat dari bongkar — tambah operator/MHE putaway atau area staging.' });
  if (stgOut > Math.max(40, sk.permintaan.paletOutHari * 0.6)) f.push({ kode: 'STG_OUT', tingkat: 'peringatan', judul: 'Staging outbound menumpuk', detail: `${stgOut} palet menunggu dimuat.`, saran: 'Truk outbound terlambat / muat lambat — atur jadwal truk atau tambah tenaga muat.' });

  // 8. Aktivitas di luar tender (scope gap)
  const luar = (Object.keys(sk.prod) as JenisTugas[]).filter(j => sk.prod[j].luar && (st.selesai[j]?.n ?? 0) > 0);
  if (luar.length) f.push({ kode: 'SCOPE', tingkat: 'info', judul: 'Aktivitas tidak ada di tender', detail: `${luar.map(j => LABEL[j]).join(', ')} dikerjakan pihak luar di simulasi.`, saran: 'Pastikan di kontrak siapa yang mengerjakan (sopir/vendor/pelanggan); kalau gudang, tambahkan aktivitas & manpower-nya di tender.' });

  // 9. Keuangan
  if (d.kas < 0) f.push({ kode: 'KAS', tingkat: d.hariKasNegatif > 10 ? 'kritis' : 'peringatan', judul: 'Kas negatif', detail: `Kas ${ang(d.kas / 1e6, 1)} jt, sudah ${d.hariKasNegatif} hari negatif.`, saran: 'Modal kerja kurang untuk menutup term pembayaran pelanggan — tambah modal atau negosiasi term lebih pendek.' });
  let pend = 0, biaya = 0; for (const r of laporan) { pend += r.pendapatan; biaya += r.biaya; }
  if (hariOps >= 3 && pend < biaya) f.push({ kode: 'RUGI', tingkat: 'kritis', judul: 'Operasi rugi', detail: `Pendapatan ${ang(pend / 1e6, 1)} jt < biaya ${ang(biaya / 1e6, 1)} jt.`, saran: 'Volume aktual di bawah komitmen atau tarif terlalu rendah — cek minimum volume (MGV) di kontrak.' });

  f.push(...tambahan);
  const urut: Record<TingkatFlag, number> = { kritis: 0, peringatan: 1, info: 2 };
  return f.sort((a, b) => urut[a.tingkat] - urut[b.tingkat]);
}
