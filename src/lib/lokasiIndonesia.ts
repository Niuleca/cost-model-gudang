// Kota, pelabuhan & bandara utama Indonesia dengan koordinat perkiraan (derajat desimal).
// Dipakai untuk pilihan origin / destination tender transport & intermodal, estimasi jarak, dan simulasi rute.
// Koordinat = titik pusat kota / terminal (perkiraan ±2 km) — cukup untuk estimasi jarak & peta, bukan navigasi.

export type JenisLokasi = 'kota' | 'pelabuhan' | 'bandara';
export interface Lokasi { nama: string; jenis: JenisLokasi; pulau: string; lat: number; lon: number; kode?: string }

const k = (nama: string, pulau: string, lat: number, lon: number): Lokasi => ({ nama, jenis: 'kota', pulau, lat, lon });
const p = (nama: string, pulau: string, lat: number, lon: number, kode?: string): Lokasi => ({ nama, jenis: 'pelabuhan', pulau, lat, lon, kode });
const b = (nama: string, pulau: string, lat: number, lon: number, kode: string): Lokasi => ({ nama, jenis: 'bandara', pulau, lat, lon, kode });

export const LOKASI: Lokasi[] = [
  // Jawa — Jabodetabek & Banten
  k('Jakarta', 'Jawa', -6.2088, 106.8456), k('Bekasi', 'Jawa', -6.2383, 106.9756), k('Cikarang', 'Jawa', -6.2615, 107.152),
  k('Karawang', 'Jawa', -6.3227, 107.3376), k('Bogor', 'Jawa', -6.5971, 106.806), k('Depok', 'Jawa', -6.4025, 106.7942),
  k('Tangerang', 'Jawa', -6.1783, 106.6319), k('Serang', 'Jawa', -6.1201, 106.1503), k('Cilegon', 'Jawa', -6.0025, 106.0111),
  // Jawa Barat
  k('Bandung', 'Jawa', -6.9175, 107.6191), k('Purwakarta', 'Jawa', -6.5569, 107.4431), k('Subang', 'Jawa', -6.5714, 107.7587),
  k('Sukabumi', 'Jawa', -6.9277, 106.93), k('Cirebon', 'Jawa', -6.732, 108.5523), k('Tasikmalaya', 'Jawa', -7.3274, 108.2207),
  // Jawa Tengah & DIY
  k('Semarang', 'Jawa', -6.9667, 110.4167), k('Surakarta (Solo)', 'Jawa', -7.5755, 110.8243), k('Yogyakarta', 'Jawa', -7.7956, 110.3695),
  k('Tegal', 'Jawa', -6.8694, 109.1402), k('Pekalongan', 'Jawa', -6.8898, 109.6746), k('Kudus', 'Jawa', -6.8048, 110.8405),
  k('Purwokerto', 'Jawa', -7.4245, 109.234), k('Magelang', 'Jawa', -7.4797, 110.2177), k('Cilacap', 'Jawa', -7.7268, 109.0091),
  // Jawa Timur
  k('Surabaya', 'Jawa', -7.2575, 112.7521), k('Sidoarjo', 'Jawa', -7.4478, 112.7183), k('Gresik', 'Jawa', -7.1539, 112.6561),
  k('Pasuruan', 'Jawa', -7.6453, 112.9075), k('Malang', 'Jawa', -7.9666, 112.6326), k('Mojokerto', 'Jawa', -7.4726, 112.4381),
  k('Kediri', 'Jawa', -7.848, 112.0178), k('Madiun', 'Jawa', -7.6298, 111.5239), k('Jember', 'Jawa', -8.1845, 113.6681),
  k('Banyuwangi', 'Jawa', -8.2192, 114.3691), k('Probolinggo', 'Jawa', -7.7543, 113.2159), k('Tuban', 'Jawa', -6.8976, 112.0649),
  // Bali & Nusa Tenggara
  k('Denpasar', 'Bali', -8.6705, 115.2126), k('Mataram', 'Nusa Tenggara', -8.5833, 116.1167), k('Kupang', 'Nusa Tenggara', -10.1772, 123.607),
  // Sumatra
  k('Banda Aceh', 'Sumatra', 5.5483, 95.3238), k('Medan', 'Sumatra', 3.5952, 98.6722), k('Pekanbaru', 'Sumatra', 0.5071, 101.4478),
  k('Dumai', 'Sumatra', 1.665, 101.4473), k('Padang', 'Sumatra', -0.9471, 100.4172), k('Jambi', 'Sumatra', -1.6101, 103.6131),
  k('Palembang', 'Sumatra', -2.9761, 104.7754), k('Bengkulu', 'Sumatra', -3.7928, 102.2608), k('Bandar Lampung', 'Sumatra', -5.3971, 105.2668),
  k('Batam', 'Kepulauan Riau', 1.0456, 104.0305), k('Pangkal Pinang', 'Bangka Belitung', -2.1316, 106.117),
  // Kalimantan
  k('Pontianak', 'Kalimantan', -0.0263, 109.3425), k('Palangka Raya', 'Kalimantan', -2.2161, 113.9135), k('Banjarmasin', 'Kalimantan', -3.3186, 114.5944),
  k('Balikpapan', 'Kalimantan', -1.2379, 116.8529), k('Samarinda', 'Kalimantan', -0.5022, 117.1536), k('Tarakan', 'Kalimantan', 3.3, 117.6333),
  // Sulawesi
  k('Makassar', 'Sulawesi', -5.1477, 119.4327), k('Pare-Pare', 'Sulawesi', -4.0135, 119.6255), k('Kendari', 'Sulawesi', -3.9985, 122.513),
  k('Palu', 'Sulawesi', -0.8917, 119.8707), k('Gorontalo', 'Sulawesi', 0.5435, 123.0568), k('Manado', 'Sulawesi', 1.4748, 124.8421),
  k('Bitung', 'Sulawesi', 1.4404, 125.1217),
  // Maluku & Papua
  k('Ambon', 'Maluku', -3.6954, 128.1814), k('Ternate', 'Maluku', 0.7893, 127.38), k('Sorong', 'Papua', -0.8762, 131.2558),
  k('Jayapura', 'Papua', -2.5337, 140.7181), k('Timika', 'Papua', -4.5468, 136.887), k('Merauke', 'Papua', -8.4932, 140.4018),

  // Kawasan industri & kota penyangga (koordinat perkiraan pusat kawasan)
  k('Cibitung', 'Jawa', -6.2667, 107.0833), k('MM2100 (Cibitung)', 'Jawa', -6.2847, 107.0619), k('Jababeka (Cikarang)', 'Jawa', -6.2963, 107.1615),
  k('EJIP (Cikarang)', 'Jawa', -6.3236, 107.1675), k('Lippo Cikarang', 'Jawa', -6.3369, 107.1453), k('Deltamas (Cikarang)', 'Jawa', -6.3678, 107.1778),
  k('Cikampek', 'Jawa', -6.4186, 107.4567), k('KIIC (Karawang)', 'Jawa', -6.365, 107.282), k('Suryacipta (Karawang)', 'Jawa', -6.4069, 107.3711),
  k('Cileungsi', 'Jawa', -6.3953, 106.9592), k('Gunung Putri', 'Jawa', -6.428, 106.9233), k('Citeureup', 'Jawa', -6.4856, 106.8817),
  k('Cibinong', 'Jawa', -6.4817, 106.8541), k('Sentul', 'Jawa', -6.5642, 106.865), k('Pulogadung (JIEP)', 'Jawa', -6.1925, 106.9036),
  k('Cakung', 'Jawa', -6.1847, 106.9367), k('Marunda', 'Jawa', -6.1033, 106.9592), k('Cengkareng', 'Jawa', -6.15, 106.7333),
  k('Cikupa', 'Jawa', -6.2361, 106.5083), k('Balaraja', 'Jawa', -6.2008, 106.4528), k('Cikande', 'Jawa', -6.1756, 106.3489),
  k('Serpong (BSD)', 'Jawa', -6.3, 106.6667), k('Cimahi', 'Jawa', -6.8722, 107.5425), k('Padalarang', 'Jawa', -6.8433, 107.48),
  k('Rancaekek', 'Jawa', -6.9636, 107.7767), k('Sumedang', 'Jawa', -6.8378, 107.9264), k('Garut', 'Jawa', -7.2128, 107.9), k('Indramayu', 'Jawa', -6.3264, 108.32),
  k('Kendal', 'Jawa', -6.9208, 110.2003), k('Batang', 'Jawa', -6.9075, 109.73), k('Salatiga', 'Jawa', -7.3305, 110.5084), k('Klaten', 'Jawa', -7.7058, 110.6065),
  k('Boyolali', 'Jawa', -7.5317, 110.596), k('Jepara', 'Jawa', -6.5886, 110.6687), k('Rembang', 'Jawa', -6.7083, 111.3417), k('Brebes', 'Jawa', -6.8694, 109.04),
  k('Ngoro (Mojokerto)', 'Jawa', -7.56, 112.62), k('Rungkut (SIER)', 'Jawa', -7.3333, 112.7667), k('Mojosari', 'Jawa', -7.5175, 112.5567),
  k('JIIPE (Gresik)', 'Jawa', -7.07, 112.6), k('Lamongan', 'Jawa', -7.1167, 112.4167), k('Bojonegoro', 'Jawa', -7.15, 111.8833), k('Jombang', 'Jawa', -7.5458, 112.2333),
  k('Nganjuk', 'Jawa', -7.605, 111.9036), k('Ngawi', 'Jawa', -7.4044, 111.4464), k('Blitar', 'Jawa', -8.0983, 112.1681), k('Tulungagung', 'Jawa', -8.0656, 111.9028),
  k('Ponorogo', 'Jawa', -7.8681, 111.4664), k('Lumajang', 'Jawa', -8.1333, 113.2167), k('Batu', 'Jawa', -7.8706, 112.5267), k('Bangkalan', 'Jawa', -7.0333, 112.7333),
  k('Sumenep', 'Jawa', -7.0167, 113.8667), k('Singaraja', 'Bali', -8.112, 115.0882),
  k('Bima', 'Nusa Tenggara', -8.4667, 118.7167), k('Sumbawa Besar', 'Nusa Tenggara', -8.5, 117.4167), k('Labuan Bajo', 'Nusa Tenggara', -8.4964, 119.8877),
  k('Ende', 'Nusa Tenggara', -8.8432, 121.6623), k('Maumere', 'Nusa Tenggara', -8.6199, 122.2111), k('Waingapu', 'Nusa Tenggara', -9.6566, 120.2641),
  k('Lhokseumawe', 'Sumatra', 5.1801, 97.1507), k('Binjai', 'Sumatra', 3.6, 98.4833), k('Pematangsiantar', 'Sumatra', 2.9595, 99.0687),
  k('Duri', 'Sumatra', 1.2833, 101.2167), k('Bukittinggi', 'Sumatra', -0.3056, 100.3692), k('Lubuklinggau', 'Sumatra', -3.2967, 102.8617),
  k('Prabumulih', 'Sumatra', -3.4328, 104.2353), k('Metro', 'Sumatra', -5.1131, 105.3067), k('Tanjung Pinang', 'Kepulauan Riau', 0.9186, 104.4469),
  k('Singkawang', 'Kalimantan', 0.9, 108.9833), k('Ketapang', 'Kalimantan', -1.85, 109.98), k('Sampit', 'Kalimantan', -2.5333, 112.95),
  k('Pangkalan Bun', 'Kalimantan', -2.6833, 111.6167), k('Kotabaru', 'Kalimantan', -3.2333, 116.2167), k('Bontang', 'Kalimantan', 0.1333, 117.5),
  k('Berau (Tanjung Redeb)', 'Kalimantan', 2.15, 117.4833), k('Nusantara (IKN)', 'Kalimantan', -0.97, 116.7),
  k('Palopo', 'Sulawesi', -2.9925, 120.1969), k('Morowali (IMIP)', 'Sulawesi', -2.83, 122.13), k('Kolaka', 'Sulawesi', -4.05, 121.5833),
  k('Luwuk', 'Sulawesi', -0.95, 122.79), k('Mamuju', 'Sulawesi', -2.6806, 118.8861), k('Bau-Bau', 'Sulawesi', -5.4667, 122.6167),
  k('Tual', 'Maluku', -5.64, 132.75), k('Manokwari', 'Papua', -0.8615, 134.062), k('Biak', 'Papua', -1.18, 136.08), k('Nabire', 'Papua', -3.3667, 135.4833),
  k('Fakfak', 'Papua', -2.9167, 132.3),

  // Pelabuhan peti kemas utama
  p('Tanjung Priok', 'Jawa', -6.1043, 106.8805, 'IDTPP'), p('Patimban', 'Jawa', -6.245, 107.915), p('Tanjung Emas', 'Jawa', -6.9475, 110.4237, 'IDSRG'),
  p('Tanjung Perak', 'Jawa', -7.1985, 112.7326, 'IDSUB'), p('Benoa', 'Bali', -8.7442, 115.2108, 'IDBOA'), p('Tenau Kupang', 'Nusa Tenggara', -10.2, 123.53, 'IDKOE'),
  p('Belawan', 'Sumatra', 3.7833, 98.6833, 'IDBLW'), p('Teluk Bayur', 'Sumatra', -1.0, 100.37, 'IDTBR'), p('Boom Baru Palembang', 'Sumatra', -2.98, 104.78, 'IDPLM'),
  p('Panjang Lampung', 'Sumatra', -5.47, 105.32, 'IDPNJ'), p('Dumai Port', 'Sumatra', 1.6833, 101.45, 'IDDUM'), p('Batu Ampar Batam', 'Kepulauan Riau', 1.1667, 104.0, 'IDBTM'),
  p('Pontianak Port', 'Kalimantan', -0.0167, 109.3333, 'IDPNK'), p('Trisakti Banjarmasin', 'Kalimantan', -3.3333, 114.5667, 'IDBDJ'),
  p('Semayang Balikpapan', 'Kalimantan', -1.2667, 116.8, 'IDBPN'), p('Palaran Samarinda', 'Kalimantan', -0.58, 117.2, 'IDSRI'),
  p('Makassar New Port', 'Sulawesi', -5.1167, 119.4083, 'IDMAK'), p('Bitung Port', 'Sulawesi', 1.44, 125.19, 'IDBIT'), p('Pantoloan Palu', 'Sulawesi', -0.71, 119.86, 'IDPTL'),
  p('Kendari New Port', 'Sulawesi', -3.97, 122.6, 'IDKDI'), p('Yos Sudarso Ambon', 'Maluku', -3.69, 128.18, 'IDAMQ'), p('Sorong Port', 'Papua', -0.88, 131.25, 'IDSOQ'),
  p('Jayapura Port', 'Papua', -2.54, 140.71, 'IDDJJ'), p('Merauke Port', 'Papua', -8.48, 140.39, 'IDMKQ'),

  p('Merak', 'Jawa', -5.9306, 105.9989), p('Bakauheni', 'Sumatra', -5.8717, 105.75), p('Ketapang Banyuwangi', 'Jawa', -8.1436, 114.4003),
  p('Gilimanuk', 'Bali', -8.1667, 114.4333), p('Lembar Lombok', 'Nusa Tenggara', -8.73, 116.07), p('Kuala Tanjung', 'Sumatra', 3.36, 99.46, 'IDKTG'),
  p('Tanjung Intan Cilacap', 'Jawa', -7.74, 109.0, 'IDCXP'), p('Gresik Port', 'Jawa', -7.15, 112.65, 'IDGRE'), p('Cirebon Port', 'Jawa', -6.7167, 108.5667, 'IDCBN'),
  p('Kariangau Balikpapan', 'Kalimantan', -1.18, 116.8, 'IDKRG'),
  // Bandara kargo utama
  b('Soekarno-Hatta (CGK)', 'Jawa', -6.1256, 106.6558, 'CGK'), b('Juanda (SUB)', 'Jawa', -7.3798, 112.7869, 'SUB'), b('Ahmad Yani (SRG)', 'Jawa', -6.9727, 110.3742, 'SRG'),
  b('Kualanamu (KNO)', 'Sumatra', 3.6422, 98.8853, 'KNO'), b('Hang Nadim (BTH)', 'Kepulauan Riau', 1.121, 104.1186, 'BTH'), b('Ngurah Rai (DPS)', 'Bali', -8.7482, 115.1672, 'DPS'),
  b('Sepinggan (BPN)', 'Kalimantan', -1.2683, 116.8945, 'BPN'), b('Syamsudin Noor (BDJ)', 'Kalimantan', -3.4424, 114.7626, 'BDJ'), b('Supadio (PNK)', 'Kalimantan', -0.1507, 109.4039, 'PNK'),
  b('Sultan Hasanuddin (UPG)', 'Sulawesi', -5.0617, 119.554, 'UPG'), b('Sam Ratulangi (MDC)', 'Sulawesi', 1.5493, 124.9258, 'MDC'),
  b('Halim (HLP)', 'Jawa', -6.2666, 106.8911, 'HLP'), b('Kertajati (KJT)', 'Jawa', -6.6489, 108.1667, 'KJT'), b('Yogyakarta Intl (YIA)', 'Jawa', -7.9006, 110.0569, 'YIA'),
  b('Adi Soemarmo (SOC)', 'Jawa', -7.5161, 110.7569, 'SOC'), b('Minangkabau (PDG)', 'Sumatra', -0.7869, 100.2806, 'PDG'), b('SMB II Palembang (PLM)', 'Sumatra', -2.8983, 104.7, 'PLM'),
  b('SSK II Pekanbaru (PKU)', 'Sumatra', 0.4608, 101.4447, 'PKU'), b('Radin Inten II (TKG)', 'Sumatra', -5.2422, 105.1758, 'TKG'), b('Sultan Iskandar Muda (BTJ)', 'Sumatra', 5.5236, 95.4203, 'BTJ'),
  b('Sultan Thaha (DJB)', 'Sumatra', -1.638, 103.6444, 'DJB'), b('Fatmawati (BKS)', 'Sumatra', -3.8637, 102.339, 'BKS'), b('Depati Amir (PGK)', 'Bangka Belitung', -2.1622, 106.1389, 'PGK'),
  b('Lombok (LOP)', 'Nusa Tenggara', -8.7573, 116.2767, 'LOP'), b('El Tari (KOE)', 'Nusa Tenggara', -10.1716, 123.6711, 'KOE'), b('Juwata (TRK)', 'Kalimantan', 3.3267, 117.5658, 'TRK'),
  b('APT Pranoto (AAP)', 'Kalimantan', -0.3736, 117.2556, 'AAP'), b('Tjilik Riwut (PKY)', 'Kalimantan', -2.225, 113.9425, 'PKY'), b('Haluoleo (KDI)', 'Sulawesi', -4.0817, 122.4183, 'KDI'),
  b('Mutiara (PLW)', 'Sulawesi', -0.9186, 119.9097, 'PLW'), b('DEO Sorong (SOQ)', 'Papua', -0.8919, 131.2875, 'SOQ'), b('Frans Kaisiepo (BIK)', 'Papua', -1.19, 136.108, 'BIK'),
  b('Mopah (MKQ)', 'Papua', -8.5203, 140.4181, 'MKQ'),
  b('Pattimura (AMQ)', 'Maluku', -3.7103, 128.0891, 'AMQ'), b('Sentani (DJJ)', 'Papua', -2.5769, 140.5164, 'DJJ'), b('Mozes Kilangin (TIM)', 'Papua', -4.5283, 136.8873, 'TIM'),
];

const norm = (s: string) => s.toLowerCase().replace(/^(kota|kabupaten|kab\.?|kota adm\.?)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Cari lokasi dari nama bebas (tidak peka huruf besar; "Kota Bekasi" → Bekasi; "Solo" → Surakarta). */
export function cariLokasi(nama?: string | null): Lokasi | null {
  const n = norm(nama ?? ''); if (!n) return null;
  const dasar = (l: Lokasi) => norm(l.nama.replace(/\s*\(.*\)/, ''));
  const kata = ` ${n} `;
  return LOKASI.find(l => norm(l.nama) === n || dasar(l) === n || (l.kode && l.kode.toLowerCase() === n))
    // nama lokasi terkandung utuh di teks (mis. "Tanjung Perak Surabaya", "Kawasan Industri Cikarang") — ambil yang terpanjang
    ?? [...LOKASI].filter(l => kata.includes(` ${dasar(l)} `)).sort((x, y) => dasar(y).length - dasar(x).length)[0]
    // alias di dalam kurung (mis. "Solo" → Surakarta (Solo), "CGK")
    ?? LOKASI.find(l => norm(l.nama).split(' ').slice(dasar(l).split(' ').length).includes(n))
    // ketikan sebagian
    ?? LOKASI.find(l => dasar(l).startsWith(n))
    ?? null;
}

/** Jarak garis lurus (km). */
export function jarakLurusKm(a: { lat: number; lon: number }, c: { lat: number; lon: number }) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (c.lat - a.lat) * rad, dLon = (c.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(c.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Faktor jalan / jalur terhadap garis lurus (perkiraan): darat 1,3 · laut 1,15 · udara 1,05 · kereta 1,25. */
export const FAKTOR_JALUR = { darat: 1.3, laut: 1.15, udara: 1.05, kereta: 1.25 } as const;

/** Perkiraan jarak tempuh (km) antar nama lokasi; null bila salah satu tidak dikenal. */
export function jarakKm(dari?: string | null, ke?: string | null, moda: keyof typeof FAKTOR_JALUR = 'darat'): number | null {
  const a = cariLokasi(dari), c = cariLokasi(ke);
  if (!a || !c) return null;
  return Math.round(jarakLurusKm(a, c) * FAKTOR_JALUR[moda]);
}

/** Darat hanya bisa bila satu pulau (Jawa–Bali dianggap tersambung ferry pendek; Sumatra–Jawa lewat Merak–Bakauheni). */
const TERSAMBUNG: string[][] = [['Jawa', 'Bali', 'Sumatra']];
export function bisaDarat(dari?: string | null, ke?: string | null) {
  const a = cariLokasi(dari), c = cariLokasi(ke);
  if (!a || !c) return true;
  return a.pulau === c.pulau || TERSAMBUNG.some(g => g.includes(a.pulau) && g.includes(c.pulau));
}
