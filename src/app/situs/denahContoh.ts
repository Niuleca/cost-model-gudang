// Denah contoh untuk landing page — DIHITUNG oleh mesin layout Leca (area rak adaptif), bukan digambar tangan.
// Gudang 72 × 36 m, grid kolom 12 × 12 m (kolom 0,4 m), rak SPR kedalaman 1,0 m, back-to-back celah 0,5 m (kolom di celah),
// lorong 3,5 m, bay 2,7 m, staging inbound/outbound + jalur utama 4 m di sisi dock. Semua satuan meter.
export const DENAH = {
  L: 72, W: 36, bayW: 2.7, kolomW: 0.4,
  /** baris rak: x, z, panjang (x), dalam (z), hadap (1 = muka ke +z, -1 = muka ke -z) */
  rak: [[11.6, 0.45, 59.4, 1, 1], [11.6, 4.95, 59.4, 1, -1], [11.6, 6.45, 59.4, 1, 1], [11.6, 10.95, 59.4, 1, -1], [11.6, 12.45, 59.4, 1, 1], [11.6, 16.95, 59.4, 1, -1], [11.6, 18.45, 59.4, 1, 1], [11.6, 22.95, 59.4, 1, -1], [11.6, 24.45, 59.4, 1, 1], [11.6, 28.95, 59.4, 1, -1], [11.6, 30.45, 59.4, 1, 1]] as [number, number, number, number, number][],
  /** pusat kolom */
  kolom: [[0.2, 0.2], [0.2, 12.2], [0.2, 24.2], [0.2, 35.8], [12.2, 0.2], [12.2, 12.2], [12.2, 24.2], [12.2, 35.8], [24.2, 0.2], [24.2, 12.2], [24.2, 24.2], [24.2, 35.8], [36.2, 0.2], [36.2, 12.2], [36.2, 24.2], [36.2, 35.8], [48.2, 0.2], [48.2, 12.2], [48.2, 24.2], [48.2, 35.8], [60.2, 0.2], [60.2, 12.2], [60.2, 24.2], [60.2, 35.8], [71.8, 0.2], [71.8, 12.2], [71.8, 24.2], [71.8, 35.8]] as [number, number][],
  stagingIn: [0.6, 0.6, 6.6, 17.1], stagingOut: [0.6, 18.3, 6.6, 17.1], jalur: [7.6, 0, 4, 36],
  /** lorong & celah melintang (z): jenis, z0, z1 */
  lorong: [["lorong", 1.45, 4.95], ["spacer", 5.95, 6.45], ["lorong", 7.45, 10.95], ["spacer", 11.95, 12.45], ["lorong", 13.45, 16.95], ["spacer", 17.95, 18.45], ["lorong", 19.45, 22.95], ["spacer", 23.95, 24.45], ["lorong", 25.45, 28.95], ["spacer", 29.95, 30.45], ["lorong", 31.45, 34.95], ["sisa", 34.95, 36]] as [string, number, number][],
};
