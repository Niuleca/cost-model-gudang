// Fixture uji Leca Game: tender contoh (bukan data pelanggan) → TenderRow + hasil hitung engine.
import { hitungTender } from '../../src/lib/engine/index';
import { ASUMSI_DEFAULT, type TenderRow } from '../../src/lib/tender';
import { contohMaster, contohTender } from '../fixtures/contoh';

export function fixtureTender() {
  const c = contohTender;
  const t = {
    id: 'contoh', kode: 'CTH-01', customer: c.customer, industri: null, provinsi: c.provinsi, kab_kota: c.kabKota, alamat_lokasi: null,
    tipe_gudang: 'Ambient', skema: 'Dedicated', skenario_aset: c.skenarioAset, durasi_kontrak_bulan: c.durasiKontrakBulan, tanggal_go_live: '2026-01-05',
    jumlah_shift: c.jumlahShift, jam_kerja_per_shift: 8, jam_efektif_per_shift: c.jamEfektifPerShift, hari_kerja_per_minggu: c.hariKerjaPerMinggu as 5,
    payment_term_hari: c.paymentTermHari, status: 'draft', versi: 1, updated_at: '2026-01-01', warehouse_id: null, pic: null, alasan_hasil: null, tanggal_keputusan: null, hasil: null,
    asumsi: { ...ASUMSI_DEFAULT, volumes: c.volumes, aktivitas: c.aktivitas, peranTetap: c.peranTetap, faktorProduktivitas: c.faktorProduktivitas, efisiensi: c.efisiensi, mhe: c.mhe, space: { ...ASUMSI_DEFAULT.space, ...c.space } },
  } as unknown as TenderRow;
  const h = hitungTender(c, contohMaster);
  return { t, h };
}
