// Leca Game · inti simulasi (M1). Tanpa React/Three — dipakai halaman game & diuji di Node.
export * from './tipe';
export { buatRng } from './dasar';
export { buatDunia, jalankanSampai, jalankanHari, cekInvariant, ringkasDunia, bertugas, shiftBerikut, waktuGame } from './dunia';
export { skenarioDariTender, prodDariAktivitas, PROD_DEFAULT, type OpsiSkenario } from './skenario';
export { hitungRedFlag, type RedFlag, type TingkatFlag } from './redflag';
