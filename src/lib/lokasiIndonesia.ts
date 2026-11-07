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

  // Pelabuhan peti kemas utama
  p('Tanjung Priok', 'Jawa', -6.1043, 106.8805, 'IDTPP'), p('Patimban', 'Jawa', -6.245, 107.915), p('Tanjung Emas', 'Jawa', -6.9475, 110.4237, 'IDSRG'),
  p('Tanjung Perak', 'Jawa', -7.1985, 112.7326, 'IDSUB'), p('Benoa', 'Bali', -8.7442, 115.2108, 'IDBOA'), p('Tenau Kupang', 'Nusa Tenggara', -10.2, 123.53, 'IDKOE'),
  p('Belawan', 'Sumatra', -3.7833, 98.6833, 'IDBLW'), p('Teluk Bayur', 'Sumatra', -1.0, 100.37, 'IDTBR'), p('Boom Baru Palembang', 'Sumatra', -2.98, 104.78, 'IDPLM'),
  p('Panjang Lampung', 'Sumatra', -5.47, 105.32, 'IDPNJ'), p('Dumai Port', 'Sumatra', 1.6833, 101.45, 'IDDUM'), p('Batu Ampar Batam', 'Kepulauan Riau', 1.1667, 104.0, 'IDBTM'),
  p('Pontianak Port', 'Kalimantan', -0.0167, 109.3333, 'IDPNK'), p('Trisakti Banjarmasin', 'Kalimantan', -3.3333, 114.5667, 'IDBDJ'),
  p('Semayang Balikpapan', 'Kalimantan', -1.2667, 116.8, 'IDBPN'), p('Palaran Samarinda', 'Kalimantan', -0.58, 117.2, 'IDSRI'),
  p('Makassar New Port', 'Sulawesi', -5.1167, 119.4083, 'IDMAK'), p('Bitung Port', 'Sulawesi', 1.44, 125.19, 'IDBIT'), p('Pantoloan Palu', 'Sulawesi', -0.71, 119.86, 'IDPTL'),
  p('Kendari New Port', 'Sulawesi', -3.97, 122.6, 'IDKDI'), p('Yos Sudarso Ambon', 'Maluku', -3.69, 128.18, 'IDAMQ'), p('Sorong Port', 'Papua', -0.88, 131.25, 'IDSOQ'),
  p('Jayapura Port', 'Papua', -2.54, 140.71, 'IDDJJ'), p('Merauke Port', 'Papua', -8.48, 140.39, 'IDMKQ'),

  // Bandara kargo utama
  b('Soekarno-Hatta (CGK)', 'Jawa', -6.1256, 106.6558, 'CGK'), b('Juanda (SUB)', 'Jawa', -7.3798, 112.7869, 'SUB'), b('Ahmad Yani (SRG)', 'Jawa', -6.9727, 110.3742, 'SRG'),
  b('Kualanamu (KNO)', 'Sumatra', 3.6422, 98.8853, 'KNO'), b('Hang Nadim (BTH)', 'Kepulauan Riau', 1.121, 104.1186, 'BTH'), b('Ngurah Rai (DPS)', 'Bali', -8.7482, 115.1672, 'DPS'),
  b('Sepinggan (BPN)', 'Kalimantan', -1.2683, 116.8945, 'BPN'), b('Syamsudin Noor (BDJ)', 'Kalimantan', -3.4424, 114.7626, 'BDJ'), b('Supadio (PNK)', 'Kalimantan', -0.1507, 109.4039, 'PNK'),
  b('Sultan Hasanuddin (UPG)', 'Sulawesi', -5.0617, 119.554, 'UPG'), b('Sam Ratulangi (MDC)', 'Sulawesi', 1.5493, 124.9258, 'MDC'),
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
