// Leca Game · inti simulasi (M1). Tanpa React/Three — dipakai halaman game & diuji di Node.
export * from './tipe';
export { buatRng } from './dasar';
export { buatDunia, jalankanSampai, jalankanHari, cekInvariant, ringkasDunia, bertugas, shiftBerikut, waktuGame, WAKTU_DOCK } from './dunia';
export { posisiTrukDock, faseTrukTeks } from './trukVisual';
export { skenarioDariTender, prodDariAktivitas, PROD_DEFAULT, type OpsiSkenario } from './skenario';
export { hitungRedFlag, type RedFlag, type TingkatFlag } from './redflag';
