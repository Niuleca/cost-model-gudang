'use client';
import { saranGudang, solusiUntuk, type Saran } from '@/lib/solusiFlag';
import VsmMapPanel from './VsmMapPanel';
import { InputPanjang, useSatuanPanjang } from '@/lib/satuanPanjang';
import { T, useT } from '@/lib/i18n';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useTabUrl } from '@/lib/useTabUrl';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ASUMSI_DEFAULT, STARTUP_DEFAULT, PAJAK_DEFAULT, ESKALASI_DEFAULT, keInput, muatMaster, aktivitasAktif, bersihkanRoleTerhapus, type Asumsi, type TenderRow } from '@/lib/tender';
import { hitungTender, type HasilTender, type Arus, type Bucket, type Kelompok, type KategoriRisiko, type TarifTambahanInput } from '@/lib/engine/index.ts';
import { Num, Pct, Txt, Sel, ubahArray, AngkaInput, AngkaVolume } from '@/components/fields';
import { skemaVsmDefault, VSM_DEFAULT, tagDariDefault } from '@/lib/vsmDefault';
import { alatRak, sesuaikanAlatRak, BATAS_ANGKAT_CBT_MM } from '@/lib/alatRak';
import { sesuaikanMhe } from '@/lib/mheOtomatis';
import { RE_SECURITY, RE_CLEANING, KUNCI_GANDA_MANPOWER, kebutuhanSecurityCleaning } from '@/lib/biayaLainDefault';
import { PROSES_MUAT, PORSI_MUAT_DEFAULT, OPSI_TAG, labelTag, persenDariPorsi, terapkanPorsiMuat } from '@/lib/porsiMuat';
import { rp, angka, persen, BUCKET_LABEL, INDUSTRI, labelKelompok } from '@/lib/format';
import { faktorUom, pengaliEfektif, isRoleSupervisor, headcountTetap, volumeEfektif, paletEkuivalen, uraiUom, kelasUom, volumeSalahRibuan, gabungPerArus, MUATAN_DEFAULT, type BasisTarif } from '@/lib/engine/types';
import ProfilVolumePanel from './ProfilVolumePanel';
import BiayaManpowerPanel from './BiayaManpowerPanel';
import ExportPanel from './ExportPanel';
import UploadExcelPanel from './UploadExcelPanel';
import { namaFileExport } from '@/lib/exportTender';
import type { DaftarWeb } from '@/lib/exportWebUtil';
import InterestPanel from './InterestPanel';
import { rincianBiayaRole, PARAM_BIAYA_MP_DEFAULT } from '@/lib/engine/biayaMp';
import { aktivitasDenganOrderAdmin, isAktivitasAdmin, orderAdmin, stokDariPalet, PARAM_DEFAULT, JALUR, jalurBaris, porsiJalur, terapkanPorsiJalur, MODA, type ProfilVolume } from '@/lib/profilVolume';
import { tampilSpek, ubahSpek, cekSpek, volSpek, type KolomSpek } from '@/lib/volumeSpek';
import { useProfile } from '@/lib/useProfile';
import { bolehExport, sinkronStatusTender } from '@/lib/akses';
import QuotationPanel from './QuotationPanel';
import GudangPicker from './GudangPicker';
import ItPanel from './ItPanel';
import BiayaLainPanel from './BiayaLainPanel';
import HapusTender from './HapusTender';
import ListrikTender from './ListrikTender';
import { KATEGORI_UMUM, kategoriDari } from '@/lib/kategoriBisnis';
import AirPanel from './AirPanel';
import type { DriverListrik } from '@/lib/utilitas';
import ProcessDesignPanel from './ProcessDesignPanel';
import SpacePanel from './SpacePanel';
import ProdukPanel from './ProdukPanel';
import { dasarKekuatan } from '@/lib/kekuatan';
import { ATURAN_BERAT_DEFAULT, adaProdukNyata, hitungProduk, paletDariSpace, produkEfektif, terapkanProduk, type AturanBerat, type PerubahanTender, type ProdukTender } from '@/lib/produk';
import { hitungLevelRak } from '@/lib/engine/space';
import MhePanel from './MhePanel';
import BiayaSpacePanel from './BiayaSpacePanel';
import { hitungSpaceExcel, lengkapiSpaceExcel, ringkasPalet, daftarPalet, type SpaceExcel, type PaletTipe } from '@/lib/engine/space';
import { hitungProcessDesign, PD_DEFAULT, ratakanBebanShift } from '@/lib/engine/processDesign';
import HistorisPanel from './HistorisPanel';
import CostAllocation from './PembagianLayanan';
import HasilKomersial, { type Kurs, type Pajak } from './HasilKomersial';
import Grafik, { warnaKe, ringkasRp } from '@/components/Grafik';
import PerbesarTabel from '@/components/PerbesarTabel';
import StatusControl from '@/components/StatusControl';
import { PilihUom, SelKonversi, gantiUom, RingkasanVolumeSemuaUom, RingkasanOrder } from './VolumeUom';
import BagikanTender from '@/components/BagikanTender';
import { labelStatus, STATUS_DRAFT } from '@/lib/status';
import { IT_SHEET_DEFAULT, ringkasIt } from '@/lib/it';
import InputDesimal from '@/components/InputDesimal';

interface Prod { id: number; aktivitas: string; tahap: string; tool: string; role_name: string; uom: string; kelas_berat: string; industri: string; prod_per_jam: number; status: string; benchmark: Record<string, string> | null }
interface Item { id: number; kategori: string; item: string; satuan: string; vendor?: string | null; tinggi_angkat_m?: number | null; harga_beli: number | null; harga_sewa_bulan: number | null; umur_ekonomis_bulan: number | null; daya_watt: number | null; status_efektif: string; mhe_tipe: string | null; kapasitas_ton: number | null; sumber_tenaga: string | null }
interface Tarif { golongan: string; tarif_kwh: number }
interface Jab { role_name: string }

const TAB_EXCEL = 'Data project (Excel)' as const;
const TABS = ['Key Assumption', 'Volume', 'Warehouse Planning', 'Produk', 'Value Stream Mapping', 'Landmark VSM', 'Loan & Interest Calculator', 'Technology & Equipment', 'Utilities Management', 'Cost Allocation', 'Result', 'Quotation', 'Export'] as const;
/** Porsi rak masih nilai bawaan aplikasi (SPR 20% / DDR 80%), bukan isian pengguna. */
const porsiBawaan = (x?: Partial<SpaceExcel> | null) => { const p = x?.porsi; if (!p) return true;
  const z = (v?: number) => Number(v) || 0; return Math.abs(z(p.spr) - 0.2) < 1e-9 && Math.abs(z(p.ddr) - 0.8) < 1e-9 && !z(p.block) && !z(p.floor); };
/** Simple CM Warehouse — wizard 5 menu & sub-langkah, mengikuti Spesifikasi Menu Tender Warehouse (versi rapi). */
type MenuSimple = { no: number; nama: string; tab: (typeof TABS)[number]; langkah: { id: string; nama: string; ke: string }[] };
const MENU_SIMPLE: MenuSimple[] = [
  { no: 1, nama: 'Key Assumption', tab: 'Key Assumption', langkah: [
    { id: '1.1', nama: 'Data customer & proyek', ke: 'Area kota + go-live → UMK → biaya manpower · durasi kontrak → skema biaya & capex · customer → kode produk & quotation' },
    { id: '1.2', nama: 'Pola kerja & produktivitas', ke: 'Shift, group, jam efektif, produktivitas & efisiensi → kapasitas kerja per orang → manpower & MHE · payment term → quotation' },
    { id: '1.3', nama: 'Pallet', ke: 'Ukuran & tebal palet → susunan produk per palet (1.4), luas block stack & tinggi rak (Warehouse Planning), layout 2D / 3D' },
    { id: '1.4', nama: 'Product input', ke: 'Sumber data: berat, CBM & tinggi per palet, isi per palet, stok storage, level rak, cek muatan kendaraan' },
    { id: '1.5', nama: 'Workload palletize vs loose', ke: 'Porsi proses palet vs manual → Value Stream Mapping, manpower & MHE' },
    { id: '1.6', nama: 'Working day', ke: 'Hari operasional → volume per hari (Volume, transport, staging) · man-hour per bulan → manpower' },
    { id: '1.7', nama: 'Workload shift', ke: 'Beban inbound / outbound / VAS per shift → manpower per shift' },
    { id: '1.8', nama: 'Workload transportation', ke: 'Porsi per jalur (import / local / export / inland / sea / air / rail) → volume transport per hari (2.3) → gate & loading dock' },
    { id: '1.9', nama: 'Capacity requirement', ke: 'Total posisi palet (dari Volume storage) dibagi porsi SPR / DDR / block stack → Block stack / racking space (3.2)' },
  ] },
  { no: 2, nama: 'Volume', tab: 'Volume', langkah: [
    { id: '2.1', nama: 'Volume storage', ke: 'Stok (posisi palet) → capacity requirement (3.2) · Volume 1 bulan = dasar tarif storage' },
    { id: '2.2', nama: 'Throughput inbound & outbound', ke: 'Volume 1 bulan = dasar tarif handling · Max = sizing manpower, MHE & staging' },
    { id: '2.3', nama: 'Volume transport per hari', ke: 'Unit kendaraan per hari → gate, loading dock & staging · order per hari → admin' },
    { id: '2.4', nama: 'Summary volume', ke: 'Ringkasan per hari / bulan / tahun dalam palet, CBM, ton, case, pcs' },
  ] },
  { no: 3, nama: 'Warehouse Planning', tab: 'Warehouse Planning', langkah: [
    { id: '3.1', nama: 'List gudang per area', ke: 'Harga sewa per m² / sewa utuh → Rental space (Summary cost 4.2)' },
    { id: '3.2', nama: 'Block stack / racking space', ke: 'Porsi dari Capacity requirement (1.9) → footprint per tipe, jumlah bay & level → biaya racking' },
    { id: '3.3', nama: 'Staging inbound & outbound', ke: 'Footprint staging → footprint total' },
    { id: '3.4', nama: 'Footprint requirement (total)', ke: 'Luas acuan (kalkulasi atau CAD) → layout & Rental space' },
    { id: '3.5', nama: 'Building dimension', ke: 'P × L × T, gate, loading dock, trapesium, kekuatan lantai → layout 2D / 3D' },
    { id: '3.6', nama: 'Layout 2D & simulasi 3D', ke: 'Dibuat otomatis dari langkah 1.3–3.5; bisa digeser & diatur, lalu disimpan' },
    { id: '3.7', nama: 'Summary layout', ke: 'Komposisi luas per area: m², posisi palet, CBM, ton, % space' },
  ] },
  { no: 4, nama: 'Result', tab: 'Result', langkah: [
    { id: '4.1', nama: 'Tarif per layanan', ke: 'Storage, handling in / out (+ VAS): satuan, MGV, biaya per bulan, GP, tarif · ubah GP % & cost allocation' },
    { id: '4.2', nama: 'Summary cost', ke: 'Rental space, manpower, storage, MHE, IT, consumable & ATK, HSE, office, utility, overhead, loan & interest, lainnya — tiap kategori bisa dibuka perhitungannya' },
    { id: '4.3', nama: 'Konversi mata uang', ke: 'Tarif & simulasi dalam mata uang lain' },
    { id: '4.4', nama: 'Capex & Opex', ke: 'Item apa saja di capex dan opex, persentase biaya' },
    { id: '4.5', nama: 'Summary manpower', ke: 'Manpower summary & rincian per task' },
    { id: '4.6', nama: 'Buat quotation', ke: 'Mengambil tarif, asumsi utama & volume dasar' },
    { id: '4.7', nama: 'Export Excel', ke: 'Seluruh hasil hitung dalam satu file Excel' },
  ] },
];
/** Dua menu utama Simple CM: Input (Key Assumption, Volume, Warehouse Planning) dan Result. */
const INDUK_SIMPLE: { nama: 'Input' | 'Result'; menu: number[] }[] = [{ nama: 'Input', menu: [1, 2, 3] }, { nama: 'Result', menu: [4] }];
const indukDari = (no: number) => INDUK_SIMPLE.find(x => x.menu.includes(no))?.nama ?? 'Input';
const LANGKAH_SIMPLE = MENU_SIMPLE.flatMap(m => m.langkah.map(l => ({ ...l, menu: m })));
const LANGKAH_ID = LANGKAH_SIMPLE.map(l => l.id);
const cariLangkah = (id: string) => LANGKAH_SIMPLE.find(l => l.id === id) ?? LANGKAH_SIMPLE[0];
/** Tab rincian yang dibuka dari Result → langkah wizard (sisanya tetap dibuka sebagai halaman rincian). */
const LANGKAH_DARI_TAB: Partial<Record<string, string>> = { 'Key Assumption': '1.1', 'Volume': '2.1', 'Warehouse Planning': '3.4', 'Produk': '1.4', 'Result': '4.1', 'Quotation': '4.6', 'Export': '4.7' };
const ARUS: { v: Arus; l: string }[] = [{ v: 'inbound', l: 'Inbound' }, { v: 'outbound', l: 'Outbound' }, { v: 'storage', l: 'Storage (stok)' }, { v: 'vas', l: 'VAS' }];
const TOOLS = ['Manual', 'FL Counter Balance', 'FL Reach Truck SPR', 'FL Reach Truck DD', 'CBT', 'RT', 'Pallet Mover', 'Hand Pallet', 'Trolley', 'PC', 'Laptop', 'HT', 'Printer', 'Scanner RDT', 'RF', 'Wrapping Machine'];
const UOM_ISI = ['case', 'karton', 'dus', 'inner', 'bag', 'sak', 'pack', 'pail', 'drum', 'ibc', 'pcs', 'botol', 'kaleng', 'sachet', 'unit', 'kg', 'liter'];
const UOM = ['palet', 'case', 'karton', 'pcs', 'bag', 'ton', 'cbm', 'liter', 'pail', 'drum', 'ibc', 'pack', 'roll', 'order', 'line', 'lokasi'];
const KELOMPOK: Kelompok[] = ['IT', 'Office', 'Consumable', 'HSE', 'Asuransi', 'Startup', 'Fasilitas', 'Utilitas', 'Racking', 'Lainnya'];
const RISIKO: KategoriRisiko[] = ['Rendah', 'Sedang', 'Tinggi'];
const ALOKASI: Record<string, Partial<Record<Bucket, number>>> = {
  'Manajemen (overhead)': { manajemen: 1 },
  'Merata': { storage: 0.4, handling_in: 0.3, handling_out: 0.3 },
  'Storage': { storage: 1 }, 'Handling in+out': { handling_in: 0.5, handling_out: 0.5 },
  'Inbound': { handling_in: 1 }, 'Outbound': { handling_out: 1 }, 'VAS': { vas: 1 },
};
const KAT_KE_KELOMPOK: Record<string, Kelompok> = {
  IT: 'IT', Software: 'IT', Office: 'Office', ATK: 'Consumable', 'Rental Office': 'Office', HSE: 'HSE', Konstruksi: 'Startup',
  'Pest Control': 'HSE', Asuransi: 'Asuransi', Palet: 'Consumable', Racking: 'Racking', Security: 'Lainnya', Cleaning: 'Lainnya', Utilitas: 'Utilitas', Gudang: 'Fasilitas', Seragam: 'Consumable', Konsumsi: 'Consumable', Consumable: 'Consumable', Printer: 'Office',
};
/** Input daftar alat dipisah koma (datalist equipment). Di level modul supaya fokus tidak hilang. */
function AlatInput({ value, onChange, ...rest }: { value: string[]; onChange: (v: string[]) => void; id?: string; 'aria-label'?: string }) {
  return <input {...rest} list="dl-tool" placeholder="mis. PC, HT" value={value.join(', ')} style={{ minWidth: 160 }}
    onChange={e => onChange(e.target.value.split(',').map(x => x.trimStart()))}
    onBlur={e => onChange(e.target.value.split(',').map(x => x.trim()).filter(Boolean))} />;
}
/** Isi satu baris aktivitas dari database produktivitas (dipakai saat tambah & saat ganti pilihan aktivitas). */
const dariProd = (p: Prod) => ({ productivityId: p.id, aktivitas: p.aktivitas, tahap: p.tahap, tool: p.tool, roleName: p.role_name, uom: p.uom,
  prodPerJam: Number(p.prod_per_jam), arus: (p.tahap.toLowerCase().startsWith('outbound') ? 'outbound' : p.tahap.toLowerCase().startsWith('inventory') ? 'storage' : 'inbound') as Arus });
/** Nama preset alokasi; kosong = Manajemen (sama dengan default engine untuk peran tetap) */
const kunciAlokasi = (a: Partial<Record<Bucket, number>>) => Object.entries(a).filter(([, v]) => Number(v) > 0).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => `${k}:${Number(v)}`).join('|');
const isCaseUom = (u: string) => ['case', 'karton', 'dus', 'carton', 'ctn', 'box'].includes((u ?? '').trim().toLowerCase());
const namaAlokasi = (a?: Partial<Record<Bucket, number>>) => !a || !Object.keys(a).length ? 'Manajemen (overhead)'
  : Object.entries(ALOKASI).find(([, v]) => kunciAlokasi(v) === kunciAlokasi(a))?.[0] ?? 'Manajemen (overhead)';

export default function TenderPage() {
  const { id } = useParams<{ id: string }>();
  const sb = supabaseBrowser();
  const { profile } = useProfile();
  const [t, setT] = useState<TenderRow | null>(null);
  const tr = useT();
  // Daftar provinsi / kab-kota + UMK berlaku (sama dengan form Tender baru)
  const [upahList, setUpahList] = useState<{ provinsi: string; kab_kota: string; upah_berlaku: number; status_verifikasi: string; tahun: number }[]>([]);
  useEffect(() => {
    supabaseBrowser().from('upah_minimum_berlaku').select('provinsi, kab_kota, upah_berlaku, status_verifikasi, tahun').order('provinsi').order('kab_kota').order('tahun', { ascending: false }).limit(3000)
      .then(({ data }: { data: typeof upahList | null }) => {
        const m = new Map<string, (typeof upahList)[number]>();
        for (const u of data ?? []) { const k = `${u.provinsi}|${u.kab_kota}`; if (!m.has(k)) m.set(k, u); }
        setUpahList(Array.from(m.values()));
      });
  }, []);
  const [basisRingkas, setBasisRingkas] = useState<'peakBulan' | 'rataRataBulan' | 'komitmenBulan'>('peakBulan');
  const [tab, setTab] = useTabUrl<(typeof TABS)[number] | typeof TAB_EXCEL>([TAB_EXCEL, ...TABS], 'Key Assumption');
  // Simple CM Warehouse (/simple/[id]): 5 tab mengikuti Spesifikasi Menu Tender Warehouse —
  // 1 Key Assumption → 2 Volume → 3 Warehouse Planning → 4 Result → 5 Output (Quotation & Export).
  // Angka di Result tetap bisa dibuka (drill-down) ke tab rincian versi lengkap (VSM, Technology & Equipment, …), lalu kembali ke Result.
  const simple = (usePathname() ?? '').startsWith('/simple/');
  const [langkah, setLangkahS] = useTabUrl<string>(LANGKAH_ID, '1.1', 'langkah');
  const [pop, setPop] = useState<(typeof TABS)[number] | null>(null);
  const tabAktif: string = simple ? cariLangkah(langkah).menu.tab : tab;
  const tabIsi: string = simple && pop ? pop : tabAktif;
  const lihat = (x: string) => tabIsi === x || (simple && !pop && tabAktif === 'Result' && (x === 'Quotation' || x === 'Export'));
  /** Simple CM: rincian kategori biaya (Summary cost) dibuka di dalam wizard */
  const [popKat, setPopKat] = useState<string | null>(null);
  /** Simple CM 4.2: kategori yang rinciannya sedang dibuka (tampil / sembunyi) */
  const [bukaKat, setBukaKat] = useState<Record<string, boolean>>({});
  const akarSimple = useRef<HTMLDivElement>(null);
  /** langkah asal ketika membuka tab rincian (mis. Manpower dari Summary cost 4.2) */
  const [popDari, setPopDari] = useState<string | null>(null);
  // Summary cost (4.2) hanya tampilan; revisi tiap kategori dibuka sebagai pop-up
  const modalBuka = simple && langkah === '4.2' && (!!popKat || (!!pop && popDari === '4.2'));
  const tutupModalRef = useRef<() => void>(() => {});
  const tutupModal = () => tutupModalRef.current();
  useEffect(() => {
    if (!modalBuka) return;
    const lama = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') tutupModal(); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = lama; window.removeEventListener('keydown', esc); };
  }, [modalBuka]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Simple CM: sub-langkah wizard yang sedang tampil */
  const di = (id: string) => !simple || (!pop && langkah === id);
  const [kunciLayout, setKunciLayout] = useState(0);
  useEffect(() => { if (simple && langkah === '3.6' && kunciLayout === 0) setKunciLayout(1); }, [simple, langkah, kunciLayout]);
  const keLangkah = (id: string) => {
    setPop(null); setPopKat(null); setLangkahS(id); window.scrollTo({ top: 0 });
    // layout 2D / 3D dibaca dari data tersimpan → simpan dulu input terbaru, lalu muat ulang iframe
    if (id === '3.6') { if (bisaEdit && kotorAkhir.current) void simpan().then(() => setKunciLayout(k => k + 1)); else setKunciLayout(k => k + 1); }
  };
  const keTab = (x: string) => {
    if (!simple) { setTab(x as (typeof TABS)[number]); return; }
    const id = LANGKAH_DARI_TAB[x];
    if (id) keLangkah(id); else { setPop(x as (typeof TABS)[number]); window.scrollTo({ top: 0 }); }
  };
  const bukaRincian = keTab;
  const [prods, setProds] = useState<Prod[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tarif, setTarif] = useState<Tarif[]>([]);
  const [jabatan, setJabatan] = useState<string[]>([]);
  const [hasil, setHasil] = useState<HasilTender | null>(null);
  const [catatanMaster, setCatatanMaster] = useState<string[]>([]);
  const [pesan, setPesan] = useState<string | null>(null);
  const [kotor, setKotorS] = useState(false);
  const kotorAkhir = useRef(false);
  const setKotor = (v: boolean) => { kotorAkhir.current = v; setKotorS(v); };
  const [pembuat, setPembuat] = useState<string | null>(null);
  const [hakEdit, setHakEdit] = useState<boolean | null>(null);
  const [konfirmVsm, setKonfirmVsm] = useState(false);
  const seret = useRef<number | null>(null);

  const muat = useCallback(async () => {
    const [tr, p, it, tf, jb] = await Promise.all([
      sb.from('tenders').select('*').eq('id', id).single(),
      sb.from('productivity').select('id, aktivitas, tahap, tool, role_name, uom, kelas_berat, industri, prod_per_jam, status, benchmark').order('tahap').order('aktivitas'),
      sb.from('price_items_status').select('id, kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, daya_watt, status_efektif, mhe_tipe, kapasitas_ton, sumber_tenaga, vendor, tinggi_angkat_m').order('kategori').order('item'),
      sb.from('electricity_tariffs').select('golongan, tarif_kwh').order('golongan'),
      sb.from('job_levels').select('role_name').order('role_name'),
    ]);
    if (tr.error) { setPesan(tr.error.message); return; }
    const row = tr.data as TenderRow;
    // tender Transportation / Intermodal punya halaman sendiri
    const jenis = (row as TenderRow & { jenis_tender?: string }).jenis_tender;
    if (jenis === 'transportation' || jenis === 'intermodal') { window.location.replace(`/${jenis === 'transportation' ? 'transport' : 'intermodal'}/${row.id}`); return; }
    // status tender dicocokkan dengan quotation (mis. quotation terkirim dibatalkan → kembali Dihitung)
    const stSinkron = await sinkronStatusTender(sb, row.id).catch(() => null);
    if (stSinkron) row.status = stSinkron;
    row.asumsi = { ...ASUMSI_DEFAULT, ...(row.asumsi ?? {}) };
    row.asumsi.it = { ...IT_SHEET_DEFAULT, ...(row.asumsi.it ?? {}) };
    // Tender baru / kosong: isi skema default VSM; buang peran tetap default lama "Admin Inbound-Outbound" (admin sudah dihitung di Aktivitas)
    let disesuaikan = false;
    if (!row.asumsi.historis && !(row.asumsi.aktivitas ?? []).length) { row.asumsi.aktivitas = skemaVsmDefault((p.data ?? []) as Prod[]); disesuaikan = true; }
    row.asumsi.aktivitas = tagDariDefault(row.asumsi.aktivitas ?? []);
    const pt0 = row.asumsi.peranTetap ?? [];
    const sisaPt = pt0.filter(r => !(r.roleName === 'Admin Inbound-Outbound' && Number(r.qty) === 1 && !(r.alat ?? []).length));
    if (sisaPt.length !== pt0.length) { row.asumsi.peranTetap = sisaPt; disesuaikan = true; }
    riwayat.current = { lalu: [], depan: [], terakhir: 0 };
    setT(row); if (disesuaikan) setKotor(true); setProds((p.data ?? []) as Prod[]); setItems((it.data ?? []) as Item[]); setTarif((tf.data ?? []) as Tarif[]);
    setJabatan(((jb.data ?? []) as Jab[]).map(j => j.role_name));
    if (row.hasil) setHasil(row.hasil as HasilTender);
    if (row.asumsi.historis && !new URLSearchParams(window.location.search).get('tab')) setTab(TAB_EXCEL);
    sb.rpc('bisa_edit_tender', { p_id: id }).then(({ data, error }: { data: boolean | null; error: unknown }) => setHakEdit(error ? null : !!data));
    if (row.created_by) {
      const { data: pc } = await sb.from('profiles').select('full_name, email').eq('id', row.created_by).maybeSingle();
      setPembuat(pc ? (pc.full_name || pc.email) : null);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { muat(); }, [muat]);
  // Revisi biaya dari tab kategori (tab browser lain) → muat ulang tender ini
  const kotorRef = kotorAkhir;
  useEffect(() => {
    const f = (e: StorageEvent) => {
      if (e.key !== 'leca.tenderDiubah' || !e.newValue?.startsWith(`${id}|`)) return;
      if (kotorRef.current) { setPesan('Biaya direvisi di tab lain — simpan / batalkan perubahan di sini lalu muat ulang halaman.'); return; }
      muat().then(() => setPesan('Revisi biaya dari tab kategori sudah dimuat.'));
    };
    window.addEventListener('storage', f);
    return () => window.removeEventListener('storage', f);
  }, [id, muat]);
  // Data master (UMK, jabatan, payroll) untuk biaya default per orang di Manpower Summary
  const [masterMp, setMasterMp] = useState<Awaited<ReturnType<typeof muatMaster>>['master'] | null>(null);
  const kunciMaster = t ? `${t.id}|${t.kab_kota}|${t.provinsi}` : '';
  useEffect(() => { if (!t) return; muatMaster(sb, t).then(r => setMasterMp(r.master)).catch(() => {}); }, [kunciMaster]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hitung langsung untuk sheet Interest cost (hasil bunga live) dan Technology & Equipment (startup & implementation otomatis live)
  const tLive = useDeferredValue(t);
  const hasilInterest = useMemo(() => {
    if (!tLive || !masterMp || (tabIsi !== 'Loan & Interest Calculator' && tabIsi !== 'Technology & Equipment')) return null;
    try { return hitungTender(keInput(tLive), masterMp); } catch { return null; }
  }, [tLive, masterMp, tab]);

  // ---- Undo / redo: setiap perubahan input dicatat; ketikan beruntun (< 800 ms) digabung jadi satu langkah ----
  const tRef = useRef<TenderRow | null>(null); tRef.current = t;
  const riwayat = useRef<{ lalu: TenderRow[]; depan: TenderRow[]; terakhir: number }>({ lalu: [], depan: [], terakhir: 0 });
  const [, setVerRiwayat] = useState(0);
  const catat = () => {
    const r = riwayat.current, now = Date.now();
    if (tRef.current && now - r.terakhir > 800) { r.lalu.push(tRef.current); if (r.lalu.length > 100) r.lalu.shift(); r.depan = []; setVerRiwayat(v => v + 1); }
    r.terakhir = now;
  };
  const undo = () => { const r = riwayat.current; const prev = r.lalu.pop(); if (!prev || !tRef.current) return; r.depan.push(tRef.current); r.terakhir = 0; setT(prev); setKotor(true); setVerRiwayat(v => v + 1); };
  const redo = () => { const r = riwayat.current; const nxt = r.depan.pop(); if (!nxt || !tRef.current) return; r.lalu.push(tRef.current); r.terakhir = 0; setT(nxt); setKotor(true); setVerRiwayat(v => v + 1); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const setKol = <K extends keyof TenderRow>(k: K, v: TenderRow[K]) => { catat(); setT(x => x && ({ ...x, [k]: v })); setKotor(true); };
  // Ganti jumlah shift: porsi beban shift tambahan yang masih 0% langsung dibagi rata (tidak menimpa porsi yang sudah diisi)
  const gantiShift = (n: number) => {
    catat();
    setT(x => x && ({ ...x, jumlah_shift: n, asumsi: { ...x.asumsi, processDesign: ratakanBebanShift(x.asumsi.processDesign ?? PD_DEFAULT, n) } }));
    setKotor(true);
  };
  const setA = (patch: Partial<Asumsi>) => {
    catat();
    const peran = 'aktivitas' in patch || 'peranTetap' in patch || 'spanOfControl' in patch || 'roleSupervisor' in patch;
    setT(x => x && ({ ...x, asumsi: peran ? bersihkanRoleTerhapus(x.asumsi, { ...x.asumsi, ...patch }) : { ...x.asumsi, ...patch } }));
    setKotor(true);
  };
  // Produk = sumber data tender: setiap perubahan produk / aturan berat langsung diterapkan ke Volume, Parameter muatan & Space
  const [dampakProduk, setDampakProduk] = useState<PerubahanTender[]>([]);
  const ubahProduk = (produk: ProdukTender[] | undefined, aturanBerat: AturanBerat | undefined = t?.asumsi.aturanBerat, aktifkan = false, basis: Partial<Asumsi> = {}) => {
    if (!t) return;
    const a0 = { ...t.asumsi, ...basis }; const sinkron = aktifkan || a0.produkSinkron !== false;
    if (sinkron && adaProdukNyata(produk)) {
      // baris otomatis dibekukan dulu supaya tidak ikut berubah oleh parameter yang baru diterapkan
      const tetap = (produk ?? []).map(x => (x.otomatis ? { ...x, otomatis: false } : x));
      const levelRak = Math.max(1, hitungLevelRak(lengkapiSpaceExcel(a0.space.excel).rak).level || 1);
      const { patch, perubahan } = terapkanProduk(a0, tetap, aturanBerat ?? ATURAN_BERAT_DEFAULT, levelRak);
      setA({ ...basis, produk: tetap, aturanBerat, produkSinkron: true, ...(patch as Partial<Asumsi>) });
      if (perubahan.length) setDampakProduk(d => { const m = new Map(d.map(x => [`${x.bagian}|${x.item}`, x])); for (const x of perubahan) { const k = `${x.bagian}|${x.item}`; const lama = m.get(k); m.set(k, lama ? { ...x, dari: lama.dari } : x); } return Array.from(m.values()); });
    } else setA({ ...basis, produk, aturanBerat, ...(aktifkan ? { produkSinkron: true } : {}) });
  };
  // Space (Warehouse Planning / Key Assumption): ukuran / tebal palet berubah → susunan produk per palet dihitung ulang (bila produk jadi sumber data)
  const ubahSpaceExcel = (excel: SpaceExcel) => {
    if (!t) return;
    const s0 = lengkapiSpaceExcel(t.asumsi.space.excel);
    const space = { ...t.asumsi.space, excel };
    const paletBerubah = JSON.stringify(s0.paletTipe) !== JSON.stringify(excel.paletTipe) || s0.palet.panjang !== excel.palet.panjang || s0.palet.lebar !== excel.palet.lebar || s0.rak.palletMm !== excel.rak.palletMm;
    if (paletBerubah && t.asumsi.produk && adaProdukNyata(t.asumsi.produk)) ubahProduk(t.asumsi.produk, t.asumsi.aturanBerat, false, { space });
    else setA({ space });
  };

  async function simpan(extra: Partial<TenderRow> = {}) {
    if (!t) return false;
    const { id: _id, updated_at: _u, ...rest } = { ...t, ...extra };
    if (!bisaEdit) { setPesan('Draft ini milik akun lain — hanya bisa dilihat.'); return false; }
    const { data: upd, error } = await sb.from('tenders').update(rest).eq('id', t.id).select('id');
    if (error) { setPesan(`Gagal menyimpan: ${error.message}`); return false; }
    if (!upd?.length) { setPesan('Tidak tersimpan: draft ini hanya bisa diedit oleh pembuatnya.'); return false; }
    setKotor(false); setPesan('Tersimpan.'); setTimeout(() => setPesan(null), 2500);
    return true;
  }

  // Simpan otomatis 2,5 detik setelah perubahan terakhir + peringatan bila halaman ditutup sebelum tersimpan
  const [simpanOto, setSimpanOto] = useState(false);
  useEffect(() => {
    if (!kotor || !t || !profile || !bisaEdit) return;
    const id = setTimeout(async () => { setSimpanOto(true); await simpan(); setSimpanOto(false); }, 2500);
    return () => clearTimeout(id);
  }, [kotor, t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (kotorAkhir.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, []);

  async function hitung(pindahTab = true) {
    if (!t) return;
    setPesan('Menghitung…');
    const { master, catatan } = await muatMaster(sb, t);
    const h = hitungTender(keInput(t), master);
    for (const c of catatan) h.redFlags.push({ level: 'peringatan', kode: 'MASTER_DATA', pesan: c });
    for (const pesan of cekProduk()) h.redFlags.push({ level: 'peringatan', kode: 'PRODUK', pesan });
    setHasil(h); setCatatanMaster(catatan); if (pindahTab) keTab('Result'); setPesan(pindahTab ? null : 'Dihitung ulang — hasil terbaru ada di tab Result.'); if (!pindahTab) setTimeout(() => setPesan(null), 3000);
  }

  /** Upload Excel: terapkan kolom tender & asumsi dari file, lalu hitung ulang dengan data master terbaru. */
  async function terapkanExcel(kolom: Partial<TenderRow>, asumsiBaru: TenderRow['asumsi']) {
    if (!t) return;
    const nt: TenderRow = { ...t, ...kolom, asumsi: asumsiBaru };
    catat(); setT(nt); setKotor(true);
    const { master, catatan } = await muatMaster(sb, nt);
    const h = hitungTender(keInput(nt), master);
    for (const c of catatan) h.redFlags.push({ level: 'peringatan', kode: 'MASTER_DATA', pesan: c });
    setHasil(h); setCatatanMaster(catatan);
  }

  /** Peringatan dari tab Produk: palet berat vs posisi level 1 / lantai, total palet vs posisi simpan. */
  function cekProduk(): string[] {
    if (!t || !adaProdukNyata(t.asumsi.produk)) return [];
    const sx = lengkapiSpaceExcel(t.asumsi.space.excel); const lvR = Math.max(1, hitungLevelRak(sx.rak).level || 1);
    const at = t.asumsi.aturanBerat ?? ATURAN_BERAT_DEFAULT;
    const hs = produkEfektif(t.asumsi.produk, t.asumsi.volumes, t.asumsi.profilVolume).map(x => ({ x, h: hitungProduk(x, at, lvR, sx.rak.productMm, paletDariSpace(sx)) }));
    const out: string[] = [];
    const sH = spaceH; if (!sH) return out;
    const posL1 = sH.sd.bay * sH.sd.paletPerLevel + sH.dd.bay * sH.dd.paletPerLevel * (sH.dd.deep ?? 2) + Math.ceil(sH.floor.ppReq) + sH.block.tapak;
    const pL1 = hs.reduce((s, r) => s + (r.h.levelMaks <= 1 ? r.h.palet : 0), 0);
    if (pL1 > posL1) out.push(`Produk: ${pL1} palet berat hanya boleh di level 1 / lantai, posisi level 1 hanya ${posL1} — tambah porsi pallet floor / block stack atau bay rak.`);
    for (const r of hs) for (const w of r.h.peringatan) if (/beam|Tinggi muatan/.test(w)) out.push(`Produk ${r.x.kode}: ${w}`);
    return out.slice(0, 8);
  }

  async function simpanHasil() {
    if (!t || !hasil) return;
    const versi = (t.versi ?? 1) + (t.hasil ? 1 : 0);
    const ok = await simpan({ hasil, status: t.status === 'draft' ? 'dihitung' : t.status, versi } as Partial<TenderRow>);
    if (!ok) return;
    await sb.from('tender_versions').insert({ tender_id: t.id, versi, snapshot: { input: t, hasil }, catatan: `Hitung ulang v${versi}` });
    setT(x => x && ({ ...x, hasil, versi, status: x.status === 'draft' ? 'dihitung' : x.status }));
    setPesan(`Hasil disimpan sebagai versi ${versi}.`);
  }

  // Buka tab Hasil → selalu hitung ulang dari input terbaru (mis. Interest cost, revisi), supaya angka tidak basi
  useEffect(() => {
    if ((tabIsi !== 'Result' && tabIsi !== 'Cost Allocation') || !t) return;
    hitung(false);
  }, [tab, !!t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Margin diubah di tab Hasil → hitung ulang otomatis (tanpa pindah tab)
  const kunciMargin = JSON.stringify([t?.asumsi.marginManual ?? {}, t?.asumsi.pajak ?? null, t?.asumsi.uomRateCard ?? {}, t?.asumsi.uomManual ?? {}, t?.asumsi.hariTarifHarian ?? null, t?.asumsi.alokasiKategori ?? null, t?.asumsi.handlingSetara ?? null, t?.asumsi.basisTarif ?? null, t?.asumsi.layananJual ?? null, t?.asumsi.tarifTambahan ?? null]);
  useEffect(() => {
    if (!hasil || (tabIsi !== 'Result' && tabIsi !== 'Cost Allocation')) return;
    const id = setTimeout(() => { hitung(false); }, 400);
    return () => clearTimeout(id);
  }, [kunciMargin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hak edit mengikuti aturan berbagi di database (pembuat, dibagikan dengan hak Edit, Super Admin, approver quotation).
  const bisaEdit = !!t && !!profile && (hakEdit ?? (!!profile.is_master || t.created_by === profile.id));
  const bolehKelolaAkses = !!t && !!profile && (!!profile.is_master || t.created_by === profile.id);
  // Alat aktivitas rak (putaway / replenishment / picking palet) mengikuti Warehouse Planning: CBT ⇄ RT (kecuali diubah manual di VSM)
  useEffect(() => {
    if (!t || !bisaEdit) return;
    const baru = sesuaikanAlatRak(t.asumsi.aktivitas, t.asumsi.space?.excel, t.asumsi.batasAngkatCbtMm);
    if (baru) { setT(x => x && ({ ...x, asumsi: { ...x.asumsi, aktivitas: baru } })); setKotor(true); }
  }, [t?.asumsi.aktivitas, t?.asumsi.space, t?.asumsi.batasAngkatCbtMm, bisaEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const toolsDipakai = useMemo(() => Array.from(new Set((t?.asumsi.aktivitas ?? []).map(a => a.tool).filter(x => x && x !== 'Manual'))), [t]);
  const spaceH = useMemo(() => {
    if (!t) return null;
    const v = (ar: Arus) => paletEkuivalen(gabungPerArus(volumeEfektif(t.asumsi.volumes, t.asumsi.profilVolume?.param)).find(x => x.arus === ar)).palet;
    return hitungSpaceExcel(lengkapiSpaceExcel(t.asumsi.space.excel), v('storage'), v('inbound'), v('outbound'), t.jumlah_shift);
  }, [t]);
  const pdFull = useMemo(() => t ? hitungProcessDesign(aktivitasDenganOrderAdmin(terapkanPorsiMuat(aktivitasAktif(t.asumsi.aktivitas), t.asumsi.porsiMuat), gabungPerArus(volumeEfektif(t.asumsi.volumes, t.asumsi.profilVolume?.param)), t.asumsi.profilVolume, t.asumsi.processDesign?.hariKerjaBulan ?? 25), gabungPerArus(volumeEfektif(t.asumsi.volumes, t.asumsi.profilVolume?.param)), { ...PD_DEFAULT, ...(t.asumsi.processDesign ?? {}) },
    t.asumsi.faktorProduktivitas, t.asumsi.efisiensi, t.jumlah_shift,
    { spanOfControl: t.asumsi.spanOfControl, roleSupervisor: t.asumsi.roleSupervisor, alatSupervisor: t.asumsi.alatSupervisor, peranTetap: t.asumsi.peranTetap }) : null, [t]);
  const pdMhe = pdFull?.mhe ?? [];
  // MHE: item harga otomatis = termurah yang memenuhi kapasitas (berat palet) & tinggi angkat (beam teratas), kecuali dipilih manual
  const opsiPilihMhe = t ? { tonPerPalet: { ...PARAM_DEFAULT, ...(t.asumsi.profilVolume?.param ?? {}) }.tonPerPalet,
    tinggiBeamM: alatRak(t.asumsi.space?.excel, t.asumsi.batasAngkatCbtMm ?? BATAS_ANGKAT_CBT_MM).tinggiBeamMm / 1000 || undefined } : {};
  const kunciMheOto = JSON.stringify([pdMhe.map(r => r.nama), opsiPilihMhe, items.length, t?.asumsi.mhe]);
  useEffect(() => {
    if (!t || !bisaEdit || !items.length || !pdMhe.length) return;
    const baru = sesuaikanMhe(t.asumsi.mhe, pdMhe.map(r => r.nama), items, opsiPilihMhe);
    if (baru) { setT(x => x && ({ ...x, asumsi: { ...x.asumsi, mhe: baru } })); setKotor(true); }
  }, [kunciMheOto, bisaEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  // Simple CM: porsi SPR/DDR/block tidak diisi nilai bawaan — dikosongkan sampai pengguna mengisi sendiri (Capacity requirement 1.9)
  useEffect(() => {
    if (!simple || !t || !bisaEdit) return;
    const x = t.asumsi.space?.excel;
    if (!x?.porsiDiisi && porsiBawaan(x) && (x?.porsi?.spr || x?.porsi?.ddr || !x?.porsi)) {
      setT(y => y && ({ ...y, asumsi: { ...y.asumsi, space: { ...y.asumsi.space, excel: { ...lengkapiSpaceExcel(y.asumsi.space.excel), porsi: { spr: 0, ddr: 0, block: 0, floor: 0 } } } } })); setKotor(true);
    }
  }, [simple, t?.id, bisaEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  // Simple CM: produk = sumber data — saat dibuka, Parameter muatan / Volume / Space disamakan dengan produk bila belum
  // (mis. produk tanpa qty stok yang dulu belum terbaca). Menunggu reset porsi bawaan di atas selesai dulu.
  const sinkronProdukAwal = useRef<string | null>(null);
  const porsiSiap = !(() => { const x = t?.asumsi.space?.excel; return !x?.porsiDiisi && porsiBawaan(x) && !!(x?.porsi?.spr || x?.porsi?.ddr || !x?.porsi); })();
  useEffect(() => {
    if (!simple || !t || !bisaEdit || !porsiSiap || sinkronProdukAwal.current === t.id) return;
    sinkronProdukAwal.current = t.id;
    if (!adaProdukNyata(t.asumsi.produk)) return;
    const levelRak = Math.max(1, hitungLevelRak(lengkapiSpaceExcel(t.asumsi.space.excel).rak).level || 1);
    const tetap = (t.asumsi.produk ?? []).map(x => (x.otomatis ? { ...x, otomatis: false } : x));
    if (terapkanProduk(t.asumsi, tetap, t.asumsi.aturanBerat ?? ATURAN_BERAT_DEFAULT, levelRak).perubahan.length) ubahProduk(t.asumsi.produk, t.asumsi.aturanBerat, true);
  }, [simple, t?.id, bisaEdit, porsiSiap]); // eslint-disable-line react-hooks/exhaustive-deps
  // Simple CM: security & cleaning masuk VSM sebagai peran tetap (bukan jasa di Lainnya) — jumlah orang dari aturan pos jaga & luas
  const luasScVsm = spaceH?.luasDipakai || spaceH?.spaceRent || 0;
  useEffect(() => {
    if (!simple || !t || !bisaEdit || t.asumsi.securityCleaningVsm || !(luasScVsm > 0)) return;
    const a0 = t.asumsi;
    const officeM2 = lengkapiSpaceExcel(a0.space.excel).fasilitas.filter(f => /office|meeting|control/i.test(f.nama)).reduce((x, f) => x + (Number(f.m2) || 0), 0);
    const k = kebutuhanSecurityCleaning({ luasM2: luasScVsm, officeM2, userKantor: 1, kategori: kategoriDari(t.industri) ?? KATEGORI_UMUM });
    const ada = (re: RegExp) => a0.peranTetap.some(p => re.test(p.roleName)) || aktivitasAktif(a0.aktivitas).some(x => re.test(x.roleName));
    const tambah: typeof a0.peranTetap = [];
    if (!ada(RE_SECURITY)) { tambah.push({ roleName: 'Security', qty: k.satpam }); if (k.danru) tambah.push({ roleName: 'Komandan Regu Security', qty: k.danru }); }
    if (!ada(RE_CLEANING)) tambah.push({ roleName: 'Cleaning Service', qty: k.cleaner });
    const jasaOrang = (c: (typeof a0.costLines)[number]) => {
      const b = c as typeof c & { kunci?: string };
      return (!!b.kunci && KUNCI_GANDA_MANPOWER.includes(b.kunci)) || /^(security guard|komandan regu|cleaning service|satpam)/i.test(c.deskripsi);
    };
    setT(y => y && ({ ...y, asumsi: { ...y.asumsi, securityCleaningVsm: true, peranTetap: [...y.asumsi.peranTetap, ...tambah],
      costLines: y.asumsi.costLines.filter(c => !jasaOrang(c)) } })); setKotor(true);
  }, [simple, t?.id, bisaEdit, luasScVsm > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  // Simple CM: racking memakai skema sewa per posisi palet (default Rp25.000/PP/bln) bila belum pernah dipilih
  useEffect(() => {
    if (!simple || !t || !bisaEdit || t.asumsi.space?.rakSkema) return;
    setT(y => y && ({ ...y, asumsi: { ...y.asumsi, space: { ...y.asumsi.space, rakSkema: 'sewa', sewaRakPerPPBulan: y.asumsi.space.sewaRakPerPPBulan ?? 25000 } } })); setKotor(true);
  }, [simple, t?.id, bisaEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  // Simple CM: gudang belum dipilih & tarif sewa belum diisi → harga sewa per m² otomatis = median database harga pasar di kab/kota (atau provinsi)
  useEffect(() => {
    if (!simple || !t || !bisaEdit || t.skenario_aset !== 'Rental' || t.asumsi.gudang || t.asumsi.space.tarifManual || (t.asumsi.space.tarifSewaM2Bulan ?? 0) > 0) return;
    sb.from('warehouses').select('kab_kota, provinsi, harga_sewa_m2_bulan, harga_per_bulan, luas_m2').eq('provinsi', t.provinsi)
      .then(({ data }: { data: { kab_kota: string; harga_sewa_m2_bulan: number | null; harga_per_bulan: number | null; luas_m2: number }[] | null }) => {
        const m2 = (w: { harga_sewa_m2_bulan: number | null; harga_per_bulan: number | null; luas_m2: number }) => Number(w.harga_sewa_m2_bulan ?? (Number(w.harga_per_bulan) || 0) / Math.max(1, Number(w.luas_m2))) || 0;
        const kab = (data ?? []).filter(w => w.kab_kota === t.kab_kota && m2(w) > 0), prov = (data ?? []).filter(w => m2(w) > 0);
        const pakai = kab.length ? kab : prov; if (!pakai.length) return;
        const xs = pakai.map(m2).sort((p1, p2) => p1 - p2), med = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
        const sumber = `median ${pakai.length} gudang di ${kab.length ? t.kab_kota : t.provinsi} (database harga pasar)`;
        setT(y => y && ({ ...y, asumsi: { ...y.asumsi, space: { ...y.asumsi.space, tarifSewaM2Bulan: Math.round(med), tarifSumber: sumber } } })); setKotor(true);
      });
  }, [simple, t?.id, t?.kab_kota, t?.asumsi.gudang?.id, bisaEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  // headcount total untuk konsumsi (galon): hasil Hitung bila ada, kalau tidak dari process design (direct + indirect/tetap)
  const headcountTotal = (hasil?.manpower?.reduce((s, m) => s + m.headcount, 0)) || ((pdFull?.totalMp ?? 0) + (pdFull?.indirect.total ?? 0));

  // Utilities Management → Electrical: driver default peralatan dari tab lain
  const driverListrik = useMemo<DriverListrik | undefined>(() => {
    if (!t) return undefined;
    const x = lengkapiSpaceExcel(t.asumsi.space.excel);
    const officeM2 = x.fasilitas.filter(f => /office|meeting|control/i.test(f.nama)).reduce((s2, f) => s2 + (Number(f.m2) || 0), 0);
    const it = t.asumsi.it?.lines ?? [];
    const q = (re: RegExp) => it.filter(l => re.test(l.item)).reduce((s2, l) => s2 + (Number(l.qty) || 0), 0);
    const mhe = pdFull?.mhe ?? [];
    return {
      luasM2: hasil?.space.totalM2 ?? spaceH?.luasDipakai ?? 0, officeM2, tinggiM: x.rak.sideMm / 1000,
      shift: t.jumlah_shift || 1, jamPerShift: (t.asumsi.processDesign?.mp?.jamWeekday ?? PD_DEFAULT.mp.jamWeekday) + 1,
      dock: Number(t.asumsi.gudang?.jumlah_dock) || 0,
      mheListrik: mhe.length ? mhe.filter(e => /reach|\bRT\b|pallet mover|stacker|electric|listrik/i.test(e.nama)).reduce((s2, e) => s2 + e.resources, 0) : null,
      pc: q(/PC Desktop|^PC\b/i), laptop: q(/laptop/i), rf: q(/scanner|HHT|\bRF\b|RDT/i), printer: q(/printer/i), cctv: q(/kamera cctv|camera cctv/i), ap: q(/access point|wifi|wi-fi/i),
      adaIt: it.length > 0,
    };
  }, [t, hasil, spaceH, pdFull]);

  const [nomorQ, setNomorQ] = useState<string | null>(null);
  if (!t) return <p className="muted">{pesan ?? 'Memuat tender…'}</p>;
  const a = t.asumsi;
  const hariOps = a.processDesign?.hariKerjaBulan ?? 25;
  const volEfBaris = volumeEfektif(a.volumes, a.profilVolume?.param);   // per baris (tabel Volume & ringkasan per satuan)
  const volEf = gabungPerArus(volEfBaris);                              // per arus (beberapa baris karton + pail + drum → total palet ekuivalen)
  const aktEf = aktivitasDenganOrderAdmin(terapkanPorsiMuat(a.aktivitas, a.porsiMuat), volEf, a.profilVolume, hariOps);
  const aktEfAktif = aktivitasDenganOrderAdmin(terapkanPorsiMuat(aktivitasAktif(a.aktivitas), a.porsiMuat), volEf, a.profilVolume, hariOps);   // hanya aktivitas aktif (VSM Map) → process design / manpower / MHE
  const paramMp = { ...PARAM_BIAYA_MP_DEFAULT, batasUpahPensiun: masterMp?.payroll.batasUpahJp || PARAM_BIAYA_MP_DEFAULT.batasUpahPensiun, batasUpahKs: masterMp?.payroll.batasUpahKes || PARAM_BIAYA_MP_DEFAULT.batasUpahKs, ...(a.paramBiayaMp ?? {}) };
  const qtyRole = new Map<string, number>();
  for (const r of pdFull?.mp ?? []) if (r.resources > 0) qtyRole.set(r.nama, (qtyRole.get(r.nama) ?? 0) + r.resources);
  for (const r of pdFull?.indirect.rows ?? []) if (r.qty > 0) qtyRole.set(r.nama, (qtyRole.get(r.nama) ?? 0) + r.qty);
  const rincianMp = Array.from(qtyRole, ([role, qty]) => rincianBiayaRole(role, qty, masterMp, a.rincianBiayaMp?.[role], paramMp, a.processDesign?.hariKerjaKaryawan ?? 25, t.kab_kota, { levelGaji: a.levelGaji, levelRole: a.levelRole }));
  // ---- Driver default Technology & Equipment (IT + biaya lain) dari tab lain ----
  const reKantor = /admin|spv|supervisor|manager|ka gudang|kepala gudang|controller|qhse|k3/i, reManajer = /spv|supervisor|manager|ka gudang|kepala gudang/i;
  const reScan = /checker|picker|picking|receiv|put ?away|inventory|cycle|stock ?count|stock ?opname/i;
  const barisRole = Array.from(qtyRole, ([nama, n]) => ({ nama, n }));
  const nRole = (re: RegExp) => barisRole.filter(r => re.test(r.nama)).reduce((x, r) => x + r.n, 0);
  const oa = orderAdmin(a.profilVolume, volEf, hariOps);
  const volArus = (ar: Arus) => volEf.find(v => v.arus === ar);
  const orderDariVol = (ar: Arus) => { const v = volArus(ar); return v && /^(order|do|line)$/i.test(v.uom.trim()) ? Number(v.peakBulan) || 0 : 0; };
  const orderIn = orderDariVol('inbound') || oa.inbound.orderBulan, orderOut = orderDariVol('outbound') || oa.outbound.orderBulan;
  const unitMhe = (re: RegExp) => pdMhe.filter(e => re.test(e.nama)).reduce((x, e) => x + e.resources, 0);
  const luasDriver = hasil?.space.totalM2 || spaceH?.luasDipakai || spaceH?.spaceRent || 0;
  const driverIt = {
    luasM2: luasDriver, officeM2: driverListrik?.officeM2 ?? 0, shift: t.jumlah_shift || 1,
    transaksiBulan: volEf.filter(v => v.arus === 'inbound' || v.arus === 'outbound').reduce((x, v) => x + paletEkuivalen(v).palet, 0),
    orderBulan: orderIn + orderOut, userKantor: nRole(reKantor), manajer: nRole(reManajer), operatorScan: nRole(reScan),
    unitRf: unitMhe(/^(RF|RDT|HHT|scanner)/i), unitPc: unitMhe(/^(PC|komputer|desktop)/i), unitLaptop: unitMhe(/laptop/i) };
  // manpower sendiri (peran tetap + role aktivitas aktif) untuk security / cleaning → jasa outsourcing tidak direkomendasikan dobel
  const jumlahRole = (re: RegExp) => a.peranTetap.filter(p => re.test(p.roleName)).reduce((s2, p) => s2 + (Number(p.qty) || 0), 0)
    + aktEfAktif.filter(x => re.test(x.roleName)).length;
  const driverBiaya = {
    headcount: headcountTotal, userKantor: driverIt.userKantor, manajer: driverIt.manajer, luasM2: luasDriver, officeM2: driverIt.officeM2,
    posisiPalet: Math.ceil((spaceH?.sd.ppReq ?? 0) + (spaceH?.dd.ppReq ?? 0) + (spaceH?.block.ppReq ?? 0) + (spaceH?.floor.ppReq ?? 0) - 1e-9),
    paletInBulan: paletEkuivalen(volArus('inbound')).palet, paletOutBulan: paletEkuivalen(volArus('outbound')).palet,
    orderInBulan: orderIn, orderOutBulan: orderOut, hariKerjaBulan: hariOps, kategori: kategoriDari(t.industri) ?? KATEGORI_UMUM,
    umk: masterMp?.upahMinimum ?? 0, skenarioAset: t.skenario_aset, tipeGudang: t.tipe_gudang ?? '', nilaiStokRp: a.nilaiStokRp ?? 0,
    securityInhouse: jumlahRole(RE_SECURITY), cleaningInhouse: jumlahRole(RE_CLEANING) };
  const fasilitasGudang = lengkapiSpaceExcel(a.space.excel).fasilitas.map(f => ({ nama: f.nama, m2: Number(f.m2) || 0 })).filter(f => f.m2 > 0);

  /** Data lengkap untuk tab Export: hitung ulang dengan master terbaru. */
  async function siapkanExport() {
    if (!t) throw new Error('Tender belum dimuat');
    const { master, catatan } = await muatMaster(sb, t);
    const h = hitungTender(keInput(t), master);
    // Nomor quotation untuk nama file: yang approved/terkirim terbaru, kalau tidak ada → quotation terbaru
    const { data: qs } = await sb.from('quotations').select('nomor, status, created_at').eq('tender_id', t.id).order('created_at', { ascending: false });
    const ql = (qs ?? []) as { nomor: string; status: string }[];
    const nomorQuotation = (ql.find(q => q.status === 'approved' || q.status === 'terkirim') ?? ql.find(q => q.status !== 'batal') ?? ql[0])?.nomor ?? null;
    setNomorQ(nomorQuotation);
    // Daftar master untuk droplist & lookup di Excel (sheet Daftar)
    const [wh, itk] = await Promise.all([
      sb.from('warehouses').select('id, nama, kab_kota, provinsi, luas_m2, harga_sewa_m2_bulan, harga_per_bulan').order('provinsi').order('kab_kota'),
      sb.from('it_catalog').select('id, kelompok, item, cost_type, harga').order('urutan').order('item'),
    ]);
    const daftar = { prods, items, jabatan, upah: upahList, tarif, gudang: (wh.data ?? []) as DaftarWeb['gudang'], itKatalog: (itk.data ?? []) as DaftarWeb['itKatalog'] };
    return { t, hasil: h, master, catatanMaster: catatan, pd: pdFull, rincianMp, paramMp,
      profil: a.profilVolume, orderAdmin: orderAdmin(a.profilVolume, volEf, hariOps), nomorQuotation, daftar };
  }

  const aksi = (atas: boolean) => (
    <div className="row" style={atas ? undefined : { justifyContent: 'flex-end' }}>
      {pesan && <span className="small" role="status">{pesan}</span>}
      {bisaEdit && <>
        <button className="ghost" onClick={undo} disabled={!riwayat.current.lalu.length} title="Undo (Ctrl+Z)" aria-label="Undo">↶ {tr('Undo')}</button>
        <button className="ghost" onClick={redo} disabled={!riwayat.current.depan.length} title="Redo (Ctrl+Y)" aria-label="Redo">↷ {tr('Redo')}</button>
      </>}
      {bisaEdit && <button className="ghost" onClick={() => simpan()} disabled={!kotor} title="Perubahan juga disimpan otomatis 2,5 detik setelah berhenti mengetik">{simpanOto ? 'Menyimpan…' : tr(kotor ? 'Simpan input' : 'Tersimpan')}</button>}
      <button onClick={() => hitung(false)}>{tr('Hitung')}</button>
    </div>);

  const panelPalet = <PaletTender excel={lengkapiSpaceExcel(a.space.excel)} onChange={ubahSpaceExcel}
    cbmPerPalet={{ ...PARAM_DEFAULT, ...(a.profilVolume?.param ?? {}) }.cbmPerPalet}
    onCbmPerPalet={cbm => setA({ profilVolume: { inbound: [], outbound: [], ...(a.profilVolume ?? {}), param: { ...PARAM_DEFAULT, ...(a.profilVolume?.param ?? {}), cbmPerPalet: cbm } } })} />;
  const panelDesain = <ProcessDesignPanel bagian="desain" aktivitas={aktEfAktif} volumes={volEf} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
    jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={gantiShift} />;
  const panelProduk = <ProdukPanel produk={a.produk} aturan={a.aturanBerat} volumes={volEf} profil={a.profilVolume} spaceExcel={a.space.excel} spaceH={spaceH}
    namaCustomer={t.customer} sinkron={a.produkSinkron !== false} dampak={dampakProduk}
    onChange={produk => ubahProduk(produk)} onAturan={aturanBerat => ubahProduk(a.produk, aturanBerat)}
    onSinkron={v => { if (v) ubahProduk(a.produk, a.aturanBerat, true); else setA({ produkSinkron: false }); }} />;
  const panelParamMuatan = (() => {
            const sp = stokDariPalet(a.volumes, a.profilVolume);
            const pm = sp.param;
            const setP = (patch: Partial<typeof pm>) => setA({ profilVolume: { inbound: [], outbound: [], ...(a.profilVolume ?? {}), param: { ...pm, ...patch } } });
            return <>
              <h3><T>Parameter muatan</T></h3>
              <p className="small muted">Satu sumber untuk <b>tarif storage alternatif</b> (per kg / CBM / liter) dan <b>Profil order</b> (cek muatan kendaraan). Isi per palet dan per case; total stok dihitung otomatis.</p>
              <div className="grid3">
                <Num id="kgplt" label="Berat per palet" suffix="kg" value={Math.round(pm.tonPerPalet * 1000 * 100) / 100} onChange={v => setP({ tonPerPalet: v / 1000 })} />
                <Num id="cbmplt" label="Volume per palet" suffix="CBM" value={pm.cbmPerPalet} onChange={v => setP({ cbmPerPalet: v })} />
                <Num id="ltrplt" label="Isi cair per palet" suffix="liter, opsional" value={pm.literPerPalet ?? 0} onChange={v => setP({ literPerPalet: v })} />
                <Num id="kgcs" label="Berat per case" suffix="kg" value={pm.kgPerCase} onChange={v => setP({ kgPerCase: v })} />
                <Num id="cbmcs" label="Volume per case" suffix="CBM" value={pm.cbmPerCase} onChange={v => setP({ cbmPerCase: v })} />
              </div>
              <div className="umk-box">
                <div><div className="small muted">Stok rata-rata</div><b>{angka(sp.palet)} palet</b></div>
                <div><div className="small muted">Berat</div><b>{angka(sp.kg)} kg</b> <span className="small muted">({angka(sp.ton, 1)} ton)</span></div>
                <div><div className="small muted">Volume</div><b>{angka(sp.cbm, 1)} CBM</b></div>
                {sp.liter > 0 && <div><div className="small muted">Cair</div><b>{angka(sp.liter)} liter</b></div>}
                <div className="small muted" style={{ flex: 1, minWidth: 200 }}>{sp.palet > 0 ? 'Dipakai untuk tarif storage per kg / CBM / liter di Hasil (rate card & storage alternatif).' : 'Storage belum bisa dihitung ke palet — lengkapi isi per palet / parameter muatan.'}</div>
              </div>
            </>;
          })();
  const panelRingkasOrder = <RingkasanOrder gabung={simple} volumes={volEfBaris} muatan={a.profilVolume?.param} basis={basisRingkas} hariOps={hariOps} utama={a.satuanUtamaOrder ?? 'input'} onUtama={u => setA({ satuanUtamaOrder: u })}
            labelArus={x => ARUS.find(o => o.v === x)?.l ?? x}
            ekstra={<label className="f" htmlFor="basis-ringkas">Basis
              <select id="basis-ringkas" value={basisRingkas} onChange={e => setBasisRingkas(e.target.value as typeof basisRingkas)} style={{ minWidth: 150 }}>
                <option value="peakBulan">Peak (sizing)</option><option value="rataRataBulan">Rata-rata</option><option value="komitmenBulan">Komitmen (MGV)</option>
              </select></label>} />;
  // ---------- Simple CM: blok baru sesuai spesifikasi
  const pvSimple: ProfilVolume = { inbound: [], outbound: [], ...(a.profilVolume ?? {}), param: { ...PARAM_DEFAULT, ...(a.profilVolume?.param ?? {}) } };
  const setParamMuat = (patch: Partial<ProfilVolume['param']>) => setA({ profilVolume: { ...pvSimple, param: { ...pvSimple.param, ...patch } } });
  const totalPorsi = (ar: 'inbound' | 'outbound') => pvSimple[ar].reduce((x, r) => x + (Number(r.persen) || 0), 0);
  const adaVolume = (ar: string) => a.volumes.some(v => v.arus === ar && volSpek(v) > 0);
  const panelJalur = <div className="card">
    <h2><T>Workload transportation (receiving & delivery)</T></h2>
    <p className="small muted">Porsi volume per jalur transport. Moda (kontainer 20ft / 40ft / 40HC atau jenis truk) dan cara muat diatur di langkah <b>2.2 Volume transport per hari</b>; jalur baru otomatis mendapat moda default (kontainer 40HC untuk jalur kontainer, truk CDE palletize untuk local / inland).</p>
    <div className="grid2">{(['inbound', 'outbound'] as const).map(ar => {
      const porsi = porsiJalur(pvSimple[ar], ar), tot = totalPorsi(ar);
      return <div key={ar} style={{ minWidth: 0 }}>
        <h3>{ar === 'inbound' ? 'Inbound' : 'Outbound'}</h3>
        <div className="tablewrap"><table>
          <thead><tr><th>Jalur</th><th className="num">Porsi</th><th>Moda saat ini</th></tr></thead>
          <tbody>{JALUR[ar].map(j => {
            const rows = pvSimple[ar].filter(r => jalurBaris(r, ar) === j.v);
            return <tr key={j.v}><td><b>{j.l}</b>{j.kontainer && <div className="small muted">kontainer</div>}</td>
              <td className="num"><div className="row" style={{ flexWrap: 'nowrap', gap: 2, justifyContent: 'flex-end' }}>
                <AngkaInput aria-label={`Porsi ${j.l} %`} min={0} max={100} step="any" value={Math.round((porsi[j.v] ?? 0) * 1000) / 10} style={{ width: 70, minWidth: 70 }}
                  onValue={n => setA({ profilVolume: { ...pvSimple, [ar]: terapkanPorsiJalur(pvSimple[ar], ar, { ...porsi, [j.v]: Math.min(100, Math.max(0, n)) / 100 }) } })} />%</div></td>
              <td className="small">{rows.length ? rows.map((r, k) => <div key={k}>{MODA.find(m => m.v === r.moda)?.l ?? r.moda}{r.kendaraan && !r.moda.startsWith('cont') ? ` · ${r.kendaraan}` : ''}</div>) : <span className="muted">—</span>}</td></tr>;
          })}
            <tr className="pd-sub"><td><b>Total</b></td><td className="num"><b style={{ color: adaVolume(ar) && Math.abs(tot - 1) > 0.005 ? 'var(--bad, #b91c1c)' : undefined }}>{angka(tot * 100, 1)}%</b></td><td className="small muted">{Math.abs(tot - 1) > 0.005 ? (tot < 1 ? `kurang ${angka((1 - tot) * 100, 1)}%` : `lebih ${angka((tot - 1) * 100, 1)}%`) : 'lengkap'}</td></tr>
          </tbody></table></div>
      </div>;
    })}</div>
  </div>;
  const KOLOM_SPEK: [KolomSpek, string, string][] = [['vol', 'Volume 1 bulan', 'Dasar tarif (komitmen / MGV)'], ['max', 'Max / bulan', 'Untuk sizing (peak); kosong = Volume 1 bulan'], ['avg', 'Avg / bulan', 'Kosong = Volume 1 bulan'], ['min', 'Min / bulan', 'Opsional — dasar tarif Min']];
  const GRUP_ARUS: { ar: string; l: string; ket: string }[] = [
    { ar: 'storage', l: 'Volume storage', ket: 'Jumlah stok (posisi) dalam 1 bulan' },
    { ar: 'inbound', l: 'Throughput inbound', ket: 'Barang masuk per bulan' },
    { ar: 'outbound', l: 'Throughput outbound', ket: 'Barang keluar per bulan' },
    { ar: 'vas', l: 'VAS & lainnya', ket: 'Opsional' },
  ];
  const panelVolumeSpek = (grupDipakai: string[]) => <div className="card">
    <p className="small muted"><b>Volume 1 bulan</b> wajib — menjadi dasar tarif (komitmen / MGV). <b>Max</b> dipakai untuk sizing gudang, manpower & MHE; <b>Max / Avg</b> yang dikosongkan otomatis sama dengan Volume 1 bulan. Ketik ribuan dengan titik (10.673).</p>
    {(() => { const xs = volumeSalahRibuan(a.volumes); if (!xs.length) return null;
      const kali = (x: number) => (x > 0 && x < 1000 && !Number.isInteger(x) ? Math.round(x * 1000) : x);
      return <p className="notice small" role="alert" style={{ borderColor: 'var(--bad, #c0392b)' }}>
        Volume {xs.map(({ v }) => `${v.arus} ${v.uom}`).join(' · ')} tercatat <b>desimal</b> — kemungkinan maksudnya ribuan.{' '}
        <button className="ghost" onClick={() => setA({ volumes: a.volumes.map((v, i) => xs.some(x => x.i === i) ? { ...v, rataRataBulan: kali(v.rataRataBulan), peakBulan: kali(v.peakBulan), komitmenBulan: kali(v.komitmenBulan) } : v) })}>Perbaiki jadi ribuan (× 1.000)</button></p>; })()}
    {GRUP_ARUS.filter(g => grupDipakai.includes(g.ar)).map(g => {
      const idx = a.volumes.map((v, i) => ({ v, i })).filter(({ v }) => (g.ar === 'vas' ? !['storage', 'inbound', 'outbound'].includes(v.arus) : v.arus === g.ar));
      const kurang = g.ar !== 'vas' && !idx.some(({ v }) => volSpek(v) > 0);
      return <div key={g.ar} className="vol-grup">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>{g.l} <span className="small muted" style={{ fontWeight: 400 }}>· {g.ket}</span></h3>
          {kurang && <span className="pill bad">belum diisi</span>}
        </div>
        {idx.length > 0 && <div className="tablewrap"><table>
          <thead><tr>{g.ar === 'vas' && <th>Arus</th>}<th>UoM</th>{KOLOM_SPEK.map(([k, l, ket]) => <th key={k} className="num" title={ket}>{l}</th>)}<th title="Berapa satuan baris ini dalam 1 palet">Isi per palet</th><th title="1 case = … pcs / kg / liter">Isi per kemasan</th><th></th></tr></thead>
          <tbody>{idx.map(({ v, i }) => {
            const tp = tampilSpek(v), cek = cekSpek(v), vol = tp.vol ?? 0;
            return <tr key={i}>
              {g.ar === 'vas' && <td><select aria-label="Arus" value={v.arus} style={{ minWidth: 110 }} onChange={e => setA({ volumes: ubahArray(a.volumes, i, { arus: e.target.value as Arus }) })}>{ARUS.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select></td>}
              <td><PilihUom value={v.uom} onChange={u => setA({ volumes: ubahArray(a.volumes, i, gantiUom(v, u)) })} /></td>
              {KOLOM_SPEK.map(([k, l]) => <td key={k} className="num"><AngkaVolume aria-label={`${l} ${v.uom}`} value={tp[k]}
                placeholder={k === 'max' || k === 'avg' ? (vol ? `= ${vol.toLocaleString('id-ID')}` : '') : k === 'min' ? '—' : ''}
                style={{ width: k === 'vol' ? 104 : 92, minWidth: k === 'vol' ? 104 : 92, ...(k === 'vol' && !(vol > 0) ? { borderColor: 'var(--bad, #c0392b)' } : {}) }}
                onValue={n => setA({ volumes: ubahArray(a.volumes, i, ubahSpek(v, k, n)) })} />
                {k === 'vol' && cek.length > 0 && <div className="small" style={{ color: 'var(--bad, #b91c1c)' }}>{cek.join(' · ')}</div>}</td>)}
              <SelKonversi v={volEfBaris[i] ?? v} onKonversi={konversi => setA({ volumes: ubahArray(a.volumes, i, { konversi }) })} />
              <td><button className="danger" onClick={() => setA({ volumes: a.volumes.filter((_, j) => j !== i) })}>Hapus</button></td>
            </tr>;
          })}</tbody></table></div>}
        <div className="row"><button className="ghost" onClick={() => setA({ volumes: [...a.volumes, { arus: (g.ar === 'vas' ? 'vas' : g.ar) as Arus, uom: g.ar === 'storage' || g.ar === 'inbound' ? 'palet' : 'karton', rataRataBulan: 0, peakBulan: 0, komitmenBulan: 0 }] })}>+ Tambah UoM {g.ar === 'vas' ? 'VAS' : g.l.toLowerCase()}</button></div>
      </div>;
    })}
    <p className="small muted" style={{ margin: 0 }}>Isi per palet & per kemasan terisi otomatis dari <b>Product input (1.4)</b>; berat & CBM per palet juga dihitung dari sana (lihat Summary volume 2.4).</p>
  </div>;
  const produkAda = adaProdukNyata(a.produk ?? []);
  const porsiTotal = (['spr', 'ddr', 'block', 'floor'] as const).reduce((x, k) => x + (Number(a.space.excel?.porsi?.[k]) || 0), 0);
  const porsiSudahDiisi = !!a.space.excel?.porsiDiisi || (!porsiBawaan(a.space.excel) && porsiTotal > 0);
  const panelMuatanProduk = <div className="card">
    <h2><T>Berat & volume per palet</T> <span className="small muted" style={{ fontWeight: 400 }}>· dihitung dari Product input</span></h2>
    <div className="umk-box">
      <div><div className="small muted">Berat per palet</div><b>{angka(pvSimple.param.tonPerPalet * 1000)} kg</b></div>
      <div><div className="small muted">CBM per palet</div><b>{angka(pvSimple.param.cbmPerPalet, 2)} CBM</b></div>
      <div><div className="small muted">Berat per case</div><b>{angka(pvSimple.param.kgPerCase, 2)} kg</b></div>
      <div><div className="small muted">CBM per case</div><b>{angka(pvSimple.param.cbmPerCase, 3)} CBM</b></div>
      <div className="small muted" style={{ flex: 1, minWidth: 220 }}>{produkAda
        ? <>Rata-rata tertimbang dari {(a.produk ?? []).filter(x => !x.otomatis).length} SKU di <b>Product input</b> — ubah di sana, angka ini ikut berubah.</>
        : <>Belum ada data produk — sementara memakai nilai standar. <button type="button" className="link-kecil" onClick={() => keLangkah('1.4')}>Isi Product input (1.4) →</button></>}</div>
    </div>
  </div>;
  const panelPaletSimple = <PaletTender tinggiDariProduk excel={lengkapiSpaceExcel(a.space.excel)} onChange={ubahSpaceExcel} />;
  const panelProdukSimple = <ProdukPanel wajibSinkron produk={a.produk} aturan={a.aturanBerat} volumes={volEf} profil={a.profilVolume} spaceExcel={a.space.excel} spaceH={spaceH}
    namaCustomer={t.customer} sinkron dampak={dampakProduk}
    onChange={produk => ubahProduk(produk, a.aturanBerat, true)} onAturan={aturanBerat => ubahProduk(a.produk, aturanBerat, true)} onSinkron={() => ubahProduk(a.produk, a.aturanBerat, true)} />;
  const panelBiayaSpace = <BiayaSpacePanel space={a.space} gudang={a.gudang} items={items} spaceRentM2={spaceH?.spaceRent ?? 0}
    posSpr={Math.ceil((spaceH?.sd.ppReq ?? 0) - 1e-9)} posDdr={Math.ceil((spaceH?.dd.ppReq ?? 0) - 1e-9)}
    posBlock={Math.ceil(spaceH?.block.ppReq ?? 0)} posFloor={Math.ceil(spaceH?.floor.ppReq ?? 0)}
    skenarioAset={t.skenario_aset} kontrakBulan={t.durasi_kontrak_bulan}
    onSpace={space => setA({ space })} onGudang={gudang => setA({ gudang })} />;
  const panelSummaryLayout = (() => {
    if (!spaceH) return <div className="card"><p className="muted">Lengkapi langkah 3.2–3.6 terlebih dahulu.</p></div>;
    const kg = pvSimple.param.tonPerPalet * 1000, cbm = pvSimple.param.cbmPerPalet, tot = Math.max(1, spaceH.spaceRent);
    const baris: [string, number, number | null][] = [
      ['Rak SPR', spaceH.sd.footprint, spaceH.sd.ppReq], ['Rak DDR', spaceH.dd.footprint, spaceH.dd.ppReq],
      ['Block stack', spaceH.block.footprint, spaceH.block.ppReq], ['Pallet floor', spaceH.floor.footprint, spaceH.floor.ppReq],
      ['Staging inbound', spaceH.inbound.footprint, spaceH.inbound.perSequence ?? null], ['Staging outbound', spaceH.outbound.footprint, spaceH.outbound.perSequence ?? null],
      ['Fasilitas (office, MHE area, dll.)', spaceH.fasilitasM2, null], ['Pembulatan', spaceH.spaceRent - spaceH.subtotal, null],
    ];
    const isi = baris.filter(([, m2]) => m2 > 0.05);
    const pp = isi.reduce((x, [, , n]) => x + (n ?? 0), 0);
    // urut dari luas terbesar; pembulatan tetap paling bawah
    const urut = [...isi].sort((x, y) => (x[0] === 'Pembulatan' ? 1 : 0) - (y[0] === 'Pembulatan' ? 1 : 0) || y[1] - x[1]);
    return <div className="card">
      <div className="sc-atas">
        <div className="sc-total">
          <div className="utama"><span>Total space</span><b>{angka(spaceH.spaceRent)} m²</b></div>
          <div><span>Posisi palet</span><b>{angka(Math.ceil(pp))}</b></div>
          <div><span>Volume · berat</span><b>{angka(pp * cbm, 0)} CBM · {angka(pp * kg / 1000, 0)} ton</b></div>
        </div>
        <Grafik judul="Komposisi space" keterangan="luas per area (m²)" kategori={urut.map(([l]) => l)} seri={[{ nama: 'Luas (m²)', nilai: urut.map(([, m2]) => m2) }]}
          jenis="donut" pilihan={['donut', 'pie', 'batang', 'kolom']} fmt={v => `${angka(v)} m²`} fmtSumbu={v => angka(v)} warnaPerKategori tinggi={200} tengah={`${angka(spaceH.spaceRent)} m²`} />
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Area</th><th className="num">Luas (m²)</th><th className="num">Posisi palet</th><th className="num">CBM</th><th className="num">Ton</th><th className="num">% space</th></tr></thead>
        <tbody>{urut.map(([l, m2, n]) => <tr key={l}><td>{l}</td><td className="num">{angka(m2)}</td>
          <td className="num">{n != null ? angka(Math.ceil(n - 1e-9)) : '—'}</td><td className="num">{n != null ? angka(n * cbm, 1) : '—'}</td><td className="num">{n != null ? angka(n * kg / 1000, 1) : '—'}</td>
          <td className="num">{angka(m2 / tot * 100, 1)}%</td></tr>)}
          <tr className="pd-sub"><td><b>Total</b></td><td className="num"><b>{angka(spaceH.spaceRent)}</b></td><td className="num"><b>{angka(Math.ceil(pp))}</b></td><td className="num"><b>{angka(pp * cbm, 1)}</b></td><td className="num"><b>{angka(pp * kg / 1000, 1)}</b></td><td className="num"><b>100%</b></td></tr>
        </tbody></table></div>
      <p className="small muted">CBM & ton = posisi palet × {angka(cbm, 2)} CBM & {angka(kg)} kg per palet (dari Product input). Posisi palet staging = kapasitas staging per sequence.</p>
    </div>;
  })();
  const panelManpowerSimple = <><ProcessDesignPanel bagian="ringkasan" indirect={{ spanOfControl: a.spanOfControl, roleSupervisor: a.roleSupervisor, alatSupervisor: a.alatSupervisor, peranTetap: a.peranTetap }} aktivitas={aktEfAktif} volumes={volEf} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
              jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={gantiShift}
              biaya={{
                perOrang: role => { const r = rincianMp.find(x => x.role === role); return (r?.total ?? 0) * (r?.porsi ?? 1) * (1 + paramMp.feePersen); },
                persenTahun: (a.eskalasiManpower ?? ESKALASI_DEFAULT).persenTahun, onPersen: persenTahun => setA({ eskalasiManpower: { ...(a.eskalasiManpower ?? ESKALASI_DEFAULT), persenTahun } }),
                mulai: a.eskalasiManpower?.mulai ?? null, mulaiDefault: t.tanggal_go_live?.slice(0, 7) ?? null,
                onMulai: mulai => setA({ eskalasiManpower: { ...(a.eskalasiManpower ?? ESKALASI_DEFAULT), mulai } }),
                kontrakBulan: t.durasi_kontrak_bulan,
              }} />
    <ProcessDesignPanel bagian="rincian" aktivitas={aktEfAktif} volumes={volEf} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
              jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={gantiShift} /></>;

  // ---------- Simple CM 4.2 Summary cost — kategori persis Spesifikasi (Word)
  const KAT_SC: { k: string; l: string; kel: Kelompok[]; isi: string; tab?: string; seksi?: string[] }[] = [
    { k: 'rental', l: 'Rental Space', kel: ['Fasilitas'], isi: 'Space yang dibutuhkan, harga space per m², biaya per hari / bulan / tahun' },
    { k: 'manpower', l: 'Manpower', kel: ['Manpower'], isi: 'Biaya manpower, Value Stream Mapping, skema biaya selama kontrak, matriks multi-skill, indirect & peran tetap, productivity & man-hour', tab: 'Value Stream Mapping' },
    { k: 'storage', l: 'Storage', kel: ['Racking'], isi: 'Racking, pallet (plastik / kayu), CCTV', seksi: ['palet'] },
    { k: 'mhe', l: 'MHE', kel: ['MHE'], isi: 'Rincian MHE (jenis, unit, sewa / beli)' },
    { k: 'it', l: 'IT', kel: ['IT'], isi: 'Laptop, monitor, PC, RF, Wi-Fi, software, WMS' },
    { k: 'consumable', l: 'Consumable & ATK', kel: ['Consumable'], isi: 'Air minum, kertas HVS, galon, seragam, ATK + item manual', seksi: ['atk', 'consumable'] },
    { k: 'hse', l: 'HSE', kel: ['HSE'], isi: 'APAR, sprinkler, P3K, safety sign, emergency lamp, papan informasi & training K3, helm, safety shoes, vest, sarung tangan, pencuci mata', seksi: ['hse'] },
    { k: 'office', l: 'Office', kel: ['Office'], isi: 'Printer, dot matrix, kursi, meja, TV, papan tulis, meja meeting, AC, kipas, lemari, loker, renovasi office + custom', seksi: ['office'] },
    { k: 'utility', l: 'Utility', kel: ['Utilitas'], isi: 'Listrik, air (bisa tidak dibebankan)', tab: 'Utilities Management' },
    { k: 'overhead', l: 'Overhead', kel: ['Overhead'], isi: '% × subtotal biaya' },
    { k: 'loan', l: 'Loan & Interest cost', kel: ['Interest cost', 'Finance'], isi: 'Bunga pinjaman / modal kerja', tab: 'Loan & Interest Calculator' },
    { k: 'lainnya', l: 'Lainnya', kel: ['Asuransi', 'Startup', 'Lainnya'], isi: 'Services (pest control, chemical & sampah), asuransi, startup + item manual — security & cleaning ada di Manpower (VSM)', seksi: ['services', 'asuransi', 'startup', 'lainnya'] },
  ];
  const katBaris = (b: { kelompok: Kelompok; deskripsi: string }) =>
    /cctv/i.test(b.deskripsi) || (b.kelompok === 'Consumable' && /pal+et/i.test(b.deskripsi)) ? 'storage' : KAT_SC.find(x => x.kel.includes(b.kelompok))?.k ?? 'lainnya';
  const luasSewa = hasil?.space.totalM2 ?? spaceH?.luasDipakai ?? 0;
  const tarifSewaPakai = a.gudang && !a.space.tarifManual ? Math.round(Number(a.gudang.harga_sewa_m2_bulan ?? (a.gudang.harga_per_bulan ?? 0) / Math.max(1, Number(a.gudang.luas_m2)))) : (a.space.tarifSewaM2Bulan ?? 0);
  const sewaUtuh = !!a.gudang?.sewaUtuh;
  const sewaBulanLive = t.skenario_aset !== 'Rental' ? 0 : sewaUtuh ? Number(a.gudang?.harga_per_bulan ?? tarifSewaPakai * Number(a.gudang?.luas_m2 ?? 0)) : luasSewa * tarifSewaPakai;
  const sumberTarif = a.gudang && !a.space.tarifManual ? `database gudang ${a.gudang.nama}` : a.space.tarifManual ? 'diisi manual' : a.space.tarifSumber ?? (tarifSewaPakai > 0 ? 'isian' : 'belum ada');
  const barisSewaLain = a.costLines.map((c, i) => ({ c, i })).filter(x => x.c.kelompok === 'Fasilitas');
  const panelRental = <div className="sc-rental">
    <div><div className="small muted">Space yang dibutuhkan</div><b>{angka(luasSewa)} m²</b><div className="small muted">Footprint requirement (3.4)</div></div>
    <div><div className="small muted">Harga space</div><b>{sewaUtuh ? `sewa utuh ${rp(sewaBulanLive)}/bln` : `${rp(tarifSewaPakai)} /m²/bln`}</b><div className="small muted">{sumberTarif}</div></div>
    <div><div className="small muted">Biaya per hari</div><b>{rp(sewaBulanLive / 30)}</b></div>
    <div><div className="small muted">Biaya per bulan</div><b>{rp(sewaBulanLive)}</b></div>
    <div><div className="small muted">Biaya per tahun</div><b>{rp(sewaBulanLive * 12)}</b></div>
  </div>;
  const editRental = <div className="card" style={{ gap: 12 }}>
    <div className="sc-rental" style={{ margin: 0 }}>
      <div><div className="small muted">Space yang dibutuhkan (otomatis)</div><b>{angka(luasSewa)} m²</b><div className="small muted">dari Footprint requirement (3.4)</div></div>
      <div><div className="small muted">Gudang</div><b>{a.gudang ? a.gudang.nama : 'belum dipilih'}</b><div className="small muted">{a.gudang ? `${a.gudang.kab_kota} · ${angka(Number(a.gudang.luas_m2))} m²` : 'pilih di Input 3.1 List gudang'}</div></div>
      <div><div className="small muted">Harga space per m² / bulan</div>
        {sewaUtuh ? <b>sewa utuh {rp(sewaBulanLive)}/bln</b>
          : <AngkaInput aria-label="Harga sewa per m² per bulan" value={tarifSewaPakai} style={{ width: 140, minWidth: 140 }}
            onValue={v => setA({ space: { ...a.space, tarifSewaM2Bulan: Math.max(0, Math.round(v)), tarifManual: true, tarifSumber: 'diisi manual' } })} />}
        <div className="small muted">sumber: {sumberTarif}</div>
        {a.space.tarifManual && <button type="button" className="link-kecil" onClick={() => setA({ space: { ...a.space, tarifManual: false, tarifSewaM2Bulan: 0, tarifSumber: undefined } })}>Kembalikan ke harga otomatis</button>}</div>
    </div>
    <div className="tablewrap"><table>
      <thead><tr><th>Biaya sewa</th><th className="num">Per hari</th><th className="num">Per bulan</th><th className="num">Per tahun</th><th /></tr></thead>
      <tbody>
        <tr><td>Sewa gudang {sewaUtuh ? '(sewa utuh)' : `${angka(luasSewa)} m² × ${rp(tarifSewaPakai)}`}</td><td className="num">{rp(sewaBulanLive / 30)}</td><td className="num"><b>{rp(sewaBulanLive)}</b></td><td className="num">{rp(sewaBulanLive * 12)}</td><td /></tr>
        {barisSewaLain.map(({ c, i }) => { const bln = (Number(c.qty) || 0) * (Number(c.hargaSatuan) || 0);
          const ub = (patch: Partial<typeof c>) => setA({ costLines: a.costLines.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return <tr key={i}><td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <input aria-label="Nama sewa" value={c.deskripsi} placeholder="mis. sewa area office / parkir" onChange={e => ub({ deskripsi: e.target.value })} style={{ minWidth: 220 }} />
              <AngkaInput aria-label="Qty" value={c.qty} onValue={v => ub({ qty: v })} style={{ width: 70, minWidth: 70 }} /> ×
              <AngkaInput aria-label="Harga per bulan" value={c.hargaSatuan} onValue={v => ub({ hargaSatuan: v })} style={{ width: 130, minWidth: 130 }} /></div></td>
            <td className="num">{rp(bln / 30)}</td><td className="num"><b>{rp(bln)}</b></td><td className="num">{rp(bln * 12)}</td>
            <td><button className="danger" onClick={() => setA({ costLines: a.costLines.filter((_, j) => j !== i) })}>Hapus</button></td></tr>; })}
      </tbody></table></div>
    <div className="row"><button className="ghost" onClick={() => setA({ costLines: [...a.costLines, { deskripsi: '', kelompok: 'Fasilitas', mode: 'bulanan', qty: 1, hargaSatuan: 0, seksi: 'rental' } as (typeof a.costLines)[number]] })}>+ Tambah biaya sewa lain</button>
      <span className="small muted">Per hari = per bulan ÷ 30.</span></div>
  </div>;
  const panelSummaryCost = (() => {
    if (!hasil) return <div className="card"><p>Belum dihitung.</p><div className="row"><button onClick={() => hitung(false)}>Hitung sekarang</button></div></div>;
    const rows = hasil.biaya.map(b => ({ ...b, kat: katBaris(b) }));
    const total = hasil.totalBiayaBulan, tot = total || 1;
    // kategori diurutkan dari biaya terbesar → terkecil; item di dalamnya juga
    const kats = KAT_SC.map(c => { const xs = rows.filter(r => r.kat === c.k).sort((x, y) => y.biayaBulan - x.biayaBulan); return { c, xs, sub: xs.reduce((x, r) => x + r.biayaBulan, 0) }; })
      .sort((x, y) => y.sub - x.sub);
    const isi = kats.filter(k => k.sub > 0);
    const maks = Math.max(...kats.map(k => k.sub), 1);
    const semuaBuka = kats.every(k => bukaKat[k.c.k]);
    const param = (k: (typeof kats)[number]) => k.c.k === 'rental' ? (sewaUtuh ? 'sewa utuh gudang' : `${angka(luasSewa)} m² × ${rp(tarifSewaPakai)}/m²/bln`)
      : k.c.k === 'manpower' ? `${hasil.totalHeadcount} orang · ${k.xs.length} role`
      : k.xs.length === 1 ? k.xs[0].dasar : k.xs.length ? `${k.xs.length} item` : '—';
    const pct = (v: number) => `${angka(v / tot * 100, 1)}%`;
    return <div className="card">
      <div className="sc-kepala">
        <div><h2 style={{ margin: 0 }}>Summary cost</h2>
          <span className="small muted">Urut dari biaya terbesar · klik nama kategori untuk tampil / sembunyikan rincian · <b>Revisi</b> membuka pop-up ubah harga</span></div>
        <div className="row" style={{ margin: 0 }}>
          <button type="button" className="ghost sc-revisi" onClick={() => setBukaKat(semuaBuka ? {} : Object.fromEntries(kats.map(k => [k.c.k, true])))}>{semuaBuka ? '▴ Tutup semua rincian' : '▾ Buka semua rincian'}</button>
          <button type="button" className="ghost sc-revisi" onClick={() => hitung(false)}>Hitung ulang</button></div>
      </div>
      <div className="sc-atas">
        <div className="sc-total">
          <div className="utama"><span>Total biaya / bulan</span><b>{rp(total)}</b></div>
          <div><span>Total biaya / tahun</span><b>{rp(total * 12)}</b></div>
          {isi[0] && <div><span>Biaya terbesar</span><b>{isi[0].c.l} · {pct(isi[0].sub)}</b></div>}
          {isi[1] && <div><span>Terbesar ke-2</span><b>{isi[1].c.l} · {pct(isi[1].sub)}</b></div>}
        </div>
        <Grafik judul="Komposisi biaya per kategori" keterangan="per bulan" kategori={isi.map(k => k.c.l)} seri={[{ nama: 'Biaya/bln', nilai: isi.map(k => k.sub) }]}
          jenis="donut" pilihan={['donut', 'pie', 'batang', 'kolom', 'combo']} fmt={rp} fmtSumbu={ringkasRp} warnaPerKategori tinggi={210} />
      </div>
      <div className="tablewrap"><table className="sc-tabel">
        <colgroup><col style={{ width: '33%' }} /><col style={{ width: '25%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '16%' }} /></colgroup>
        <thead><tr><th>Kategori</th><th>Parameter (dasar hitung)</th><th className="num">Biaya/bln</th><th className="num">Biaya/thn</th><th>% dari total</th></tr></thead>
        <tbody>{kats.map((k, ix) => {
          const b = !!bukaKat[k.c.k], warna = k.sub > 0 ? warnaKe(ix) : undefined;
          return [
            <tr key={k.c.k} className={`kat-head${k.sub > 0 ? '' : ' sc-nol'}`}>
              <td><div className="sc-kat-sel">
                <button type="button" className="sc-kat" aria-expanded={b} title={`${b ? 'Sembunyikan' : 'Tampilkan'} rincian · isi: ${k.c.isi}`} onClick={() => setBukaKat(x => ({ ...x, [k.c.k]: !b }))}>
                  <span className="sc-panah">{b ? '▾' : '▸'}</span><i className="sc-sw" style={{ background: warna ?? 'transparent' }} /><span className="sc-nama">{k.c.l}</span>
                  {k.xs.length > 0 && <span className="sc-jml">{k.xs.length}</span>}</button>
                <button type="button" className="ghost sc-revisi" onClick={() => bukaRincianBiaya(k.c.k)}>Revisi</button></div></td>
              <td className="small muted" title={param(k)}>{param(k)}</td>
              <td className="num"><b>{rp(k.sub)}</b></td><td className="num">{rp(k.sub * 12)}</td>
              <td><div className="sc-pct"><span>{pct(k.sub)}</span>{k.sub > 0 && <i style={{ width: `${k.sub / maks * 100}%`, background: warna }} />}</div></td></tr>,
            ...(!b ? [] : [
              ...(k.c.k === 'rental' ? [<tr key="rental-isi" className="sc-item"><td colSpan={5}>{panelRental}</td></tr>] : []),
              ...k.xs.map((r, i) => <tr key={`${k.c.k}-${i}`} className="sc-item"><td style={{ paddingLeft: 36 }} title={r.deskripsi}>{r.deskripsi}</td><td className="small muted" title={r.dasar}>{r.dasar}</td>
                <td className="num">{rp(r.biayaBulan)}</td><td className="num">{rp(r.biayaBulan * 12)}</td>
                <td><div className="sc-pct kecil"><span>{pct(r.biayaBulan)}</span><i style={{ width: `${r.biayaBulan / maks * 100}%`, background: warna }} /></div></td></tr>),
              ...(k.xs.length === 0 && k.c.k !== 'rental' ? [<tr key={`${k.c.k}-0`} className="sc-item"><td colSpan={5} className="small muted" style={{ paddingLeft: 36 }}>Belum ada biaya — klik Revisi untuk mengisi.</td></tr>] : []),
            ]),
          ];
        })}
          <tr className="pd-sub"><td colSpan={2}><b>Total</b></td><td className="num out">{rp(total)}</td><td className="num out">{rp(total * 12)}</td><td><b>100%</b></td></tr>
        </tbody></table></div>
    </div>;
  })();
  const bukaRincianBiaya = (k: string) => {
    const c = KAT_SC.find(x => x.k === k); if (!c) return;
    if (c.tab) { setPopDari('4.2'); setPop(c.tab as (typeof TABS)[number]); setPopKat(null); } else { setPopKat(k); }
  };
  const panelLain = (seksi: string[]) => <BiayaLainPanel hanyaSeksi={seksi} lines={a.costLines} items={items} kontrakBulan={t.durasi_kontrak_bulan}
            onChange={(costLines, tandai, dibuang) => setA({ costLines, ...(tandai ? { biayaDefaultDiisi: true } : {}), ...(dibuang ? { biayaDefaultDibuang: dibuang } : {}) })}
            dibuang={a.biayaDefaultDibuang}
            startup={a.startupAuto ?? STARTUP_DEFAULT} onStartup={startupAuto => setA({ startupAuto })}
            hasilBaris={hasilInterest?.biaya ?? hasil?.biaya} onHitung={() => hitung(false)}
            driver={driverBiaya} defaultDiisi={!!a.biayaDefaultDiisi} onNilaiStok={nilaiStokRp => setA({ nilaiStokRp })} fasilitas={fasilitasGudang} />;
  const rincianBiayaSimple = (k: string) => {
    const c = KAT_SC.find(x => x.k === k);
    switch (k) {
      case 'rental': return editRental;
      case 'storage': return <>
        <div className="card" style={{ gap: 10 }}>
          <h2>Racking</h2>
          <div className="tabs" role="tablist" aria-label="Skema racking" style={{ display: 'inline-flex', width: 'fit-content' }}>
            {([['sewa', 'Sewa per posisi palet'], ['beli', 'Beli (investasi, depresiasi)']] as const).map(([v, l]) =>
              <button key={v} type="button" role="tab" aria-selected={(a.space.rakSkema ?? 'beli') === v} className={(a.space.rakSkema ?? 'beli') === v ? 'on' : ''}
                onClick={() => setA({ space: { ...a.space, rakSkema: v, ...(v === 'sewa' && !(a.space.sewaRakPerPPBulan ?? 0) ? { sewaRakPerPPBulan: 25000 } : {}) } })}>{l}</button>)}
          </div>
          {a.space.rakSkema === 'sewa' ? (() => {
            const tarif = a.space.sewaRakPerPPBulan ?? 25000;
            const ps = [['SPR · Selective Pallet Rack', Math.ceil((spaceH?.sd.ppReq ?? 0) - 1e-9)], ['DDR · Double Deep Rack', Math.ceil((spaceH?.dd.ppReq ?? 0) - 1e-9)]] as const;
            const totPos = ps.reduce((x, [, n]) => x + n, 0);
            return <>
              <label className="f" style={{ maxWidth: 260 }}>Sewa racking per posisi palet / bulan
                <AngkaInput aria-label="Sewa racking per PP per bulan" value={tarif} onValue={v => setA({ space: { ...a.space, sewaRakPerPPBulan: Math.max(0, Math.round(v)) } })} /></label>
              <div className="tablewrap"><table>
                <thead><tr><th>Jenis rak</th><th className="num">Posisi palet</th><th className="num">Sewa/PP/bln</th><th className="num">Per bulan</th><th className="num">Per tahun</th></tr></thead>
                <tbody>{ps.filter(([, n]) => n > 0).map(([l, n]) => <tr key={l}><td>{l}</td><td className="num">{angka(n)}</td><td className="num">{rp(tarif)}</td><td className="num"><b>{rp(n * tarif)}</b></td><td className="num">{rp(n * tarif * 12)}</td></tr>)}
                  {totPos === 0 && <tr><td colSpan={5} className="muted">Belum ada posisi rak — isi porsi SPR / DDR di Capacity requirement (1.9).</td></tr>}
                  <tr className="pd-sub"><td><b>Total sewa racking</b></td><td className="num"><b>{angka(totPos)}</b></td><td /><td className="num"><b>{rp(totPos * tarif)}</b></td><td className="num"><b>{rp(totPos * tarif * 12)}</b></td></tr></tbody>
              </table></div>
              <p className="small muted">Posisi palet dari Block stack / racking space (3.2). Block stack & pallet floor tidak memakai rak.</p></>;
          })() : <BiayaSpacePanel hanyaRak space={a.space} gudang={a.gudang} items={items} spaceRentM2={spaceH?.spaceRent ?? 0}
            posSpr={Math.ceil((spaceH?.sd.ppReq ?? 0) - 1e-9)} posDdr={Math.ceil((spaceH?.dd.ppReq ?? 0) - 1e-9)}
            posBlock={Math.ceil(spaceH?.block.ppReq ?? 0)} posFloor={Math.ceil(spaceH?.floor.ppReq ?? 0)}
            skenarioAset={t.skenario_aset} kontrakBulan={t.durasi_kontrak_bulan} onSpace={space => setA({ space })} onGudang={gudang => setA({ gudang })} />}
        </div>
        <div className="card">{panelLain(['palet'])}</div>
        <div className="card"><h2>CCTV</h2>
          {(hasil?.biaya ?? []).filter(b => /cctv/i.test(b.deskripsi)).length
            ? <div className="tablewrap"><table><tbody>{(hasil?.biaya ?? []).filter(b => /cctv/i.test(b.deskripsi)).map((b, i) => <tr key={i}><td>{b.deskripsi}</td><td className="small muted">{b.dasar}</td><td className="num">{rp(b.biayaBulan)}</td></tr>)}</tbody></table></div>
            : <p className="small muted">Belum ada baris CCTV.</p>}
          <p className="small muted">Jumlah kamera otomatis dari luas gudang (1 per 400 m², min. 8). Qty & harga CCTV diubah di <button type="button" className="link-kecil" onClick={() => setPopKat('it')}>Revisi IT</button>.</p></div>
      </>;
      case 'mhe': return <><ProcessDesignPanel bagian="mhe" aktivitas={aktEfAktif} volumes={volEf} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
          jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={gantiShift} />
        <MhePanel mhe={a.mhe} items={items} metodeExcel={true} onChange={mhe => setA({ mhe })} kontrakBulan={t.durasi_kontrak_bulan} opsiPilih={opsiPilihMhe}
          alatRak={{ ...alatRak(a.space.excel, a.batasAngkatCbtMm ?? BATAS_ANGKAT_CBT_MM), batasMm: a.batasAngkatCbtMm ?? BATAS_ANGKAT_CBT_MM, onBatas: mm => setA({ batasAngkatCbtMm: mm }),
            manual: a.aktivitas.filter(x => x.alatManual && x.porsiMuat?.muat === 'palet').length }}
          kebutuhan={true
            ? pdMhe.map(r => ({ nama: r.nama, fte: r.fte, unit: r.resources }))
            : toolsDipakai.map(tl => { const r = hasil?.mhe.find(x => x.tool === tl); return { nama: tl, fte: null, unit: r ? r.unitDasar : null }; })} /></>;
      case 'it': return <ItPanel sheet={a.it} onChange={it => setA({ it })} kontrakBulan={t.durasi_kontrak_bulan} driver={driverIt} />;
      case 'overhead': return <div className="card"><h2>Overhead</h2>
        <div className="grid3"><Pct id="overhead" label="Overhead (× subtotal biaya)" value={a.overheadPersen ?? ((Number(hasil?.biaya.find(b => b.kelompok === 'Overhead')?.dasar.match(/^([0-9.]+)%/)?.[1]) || 3) / 100)}
          onChange={v => setA({ overheadPersen: Math.max(0, v) })} /></div>
        <p className="small muted">Overhead = persen × subtotal semua biaya lain. Default dari master Finance; isian di sini khusus tender ini. Klik Hitung ulang setelah mengubah.</p></div>;
      default: return c?.seksi ? <div className="card"><h2>{c.l}</h2><p className="small muted">{c.isi} — qty otomatis dari volume, luas & manpower; bisa diedit dan ditambah.</p>{panelLain(c.seksi)}</div> : null;
    }
  };
  const judulModal = popKat ? KAT_SC.find(x => x.k === popKat)?.l ?? popKat : KAT_SC.find(x => x.tab === pop)?.l ?? (pop ? tr(pop) : '');
  tutupModalRef.current = () => { setPopKat(null); setPop(null); setPopDari(null); hitung(false); };
  const pctTxt = (x: number) => `${angka(x * 100, 1)}%`;
  /** Simple CM: apa saja yang masih kurang per langkah (dasar tanda "!") */
  const kurangLangkah = (id: string): string[] => {
    const k: string[] = [];
    const cekJalur = () => (['inbound', 'outbound'] as const).forEach(ar => {
      if (!adaVolume(ar)) return;
      if (!pvSimple[ar].length) k.push(`Porsi jalur ${ar} belum diisi (langkah 1.8)`);
      else if (Math.abs(totalPorsi(ar) - 1) > 0.005) k.push(`Total porsi jalur ${ar} ${pctTxt(totalPorsi(ar))} — harus 100%`);
    });
    switch (id) {
      case '1.1':
        if (!t.customer?.trim()) k.push('Customer name'); if (!t.provinsi) k.push('Provinsi project'); if (!t.kab_kota) k.push('Area kota (menentukan UMK)');
        if (!(t.durasi_kontrak_bulan > 0)) k.push('Durasi kontrak'); if (!t.tanggal_go_live) k.push('Tanggal go-live'); break;
      case '1.2':
        if (!(t.jumlah_shift > 0)) k.push('Jumlah shift'); if (!(Number(t.jam_kerja_per_shift) > 0)) k.push('Jam kerja per shift');
        if (!(Number(t.jam_efektif_per_shift) > 0)) k.push('Jam efektif per shift');
        else if (Number(t.jam_efektif_per_shift) > Number(t.jam_kerja_per_shift)) k.push('Jam efektif lebih besar dari jam kerja per shift'); break;
      case '1.3': {
        const r = ringkasPalet(daftarPalet(a.space.excel));
        if (!r.list.length) k.push('Jenis pallet belum ada'); else if (Math.abs(r.totalPorsi - 1) > 0.0005) k.push(`Total pemakaian palet ${pctTxt(r.totalPorsi)} — harus 100%`); break;
      }
      case '1.4': {
        if (!produkAda) { k.push('Belum ada produk / SKU — berat, CBM & tinggi per palet masih memakai nilai standar'); break; }
        const tdk = (a.produk ?? []).filter(x => !x.otomatis && (!(x.p > 0 && x.l > 0 && x.t > 0) && !(Number(x.cbm) > 0) || !(x.beratKg > 0) || !(x.upp > 0)));
        if (tdk.length) k.push(`${tdk.length} SKU belum lengkap (dimensi / berat per UoM / UPP): ${tdk.slice(0, 3).map(x => x.kode || x.nama).join(', ')}${tdk.length > 3 ? ', …' : ''}`); break;
      }
      case '1.6': if (!((a.processDesign?.hariKerjaBulan ?? 25) > 0)) k.push('Hari operasional gudang per bulan'); break;
      case '1.7': {
        const pd = a.processDesign as Record<string, unknown> | undefined;
        for (const [kunci, l] of [['bebanShiftInbound', 'inbound'], ['bebanShiftOutbound', 'outbound'], ['bebanShift', 'storage / VAS']] as const) {
          const arr = pd?.[kunci] as number[] | undefined; if (!arr?.length) continue;
          const tot = arr.slice(0, t.jumlah_shift).reduce((x, y) => x + (Number(y) || 0), 0);
          if (Math.abs(tot - 1) > 0.005) k.push(`Total workload ${l} per shift ${pctTxt(tot)} — harus 100%`);
        } break;
      }
      case '1.8': case '2.3': cekJalur(); break;
      case '1.9':
        if (!porsiSudahDiisi) k.push('Porsi SPR / DDR / block stack belum diisi');
        else if (Math.abs(porsiTotal - 1) > 0.0005) k.push(`Total porsi ${pctTxt(porsiTotal)} — harus 100%`);
        if (!adaVolume('storage')) k.push('Volume storage belum diisi (langkah 2.1) — total posisi palet masih 0'); break;
      case '2.1': if (!adaVolume('storage')) k.push('Volume storage 1 bulan'); break;
      case '2.2': if (!adaVolume('inbound')) k.push('Throughput inbound 1 bulan'); if (!adaVolume('outbound')) k.push('Throughput outbound 1 bulan'); break;
      case '2.4': if (!['storage', 'inbound', 'outbound'].every(adaVolume)) k.push('Volume belum lengkap — isi langkah 2.1 & 2.2'); break;
      case '3.1':
        if (t.skenario_aset === 'Rental' && !a.gudang && !((a.space.tarifSewaM2Bulan ?? 0) > 0)) k.push('Gudang belum dipilih dan harga sewa per m² belum ada (database harga pasar di area ini kosong)'); break;
      case '3.2': if (!porsiSudahDiisi || Math.abs(porsiTotal - 1) > 0.0005) k.push('Porsi SPR / DDR / block stack belum lengkap (langkah 1.9)'); break;
      case '3.3': if (!adaVolume('inbound') || !adaVolume('outbound')) k.push('Throughput inbound / outbound belum diisi (langkah 2.2)'); break;
      case '3.4': if (!((spaceH?.spaceRent ?? 0) > 0)) k.push('Luas belum bisa dihitung — lengkapi langkah 1.9 & 2.1'); break;
      case '3.5': if (!(Number(a.space.excel?.lebarGudangM) > 0)) k.push('Lebar gudang (L)'); break;
      case '4.1': case '4.2': case '4.4': case '4.5':
        if (!hasil) { k.push('Belum dihitung — klik Hitung'); break; }
        if (id === '4.2' && t.skenario_aset === 'Rental' && !((hasil.perKelompok?.Fasilitas ?? 0) > 0)) k.push('Sewa gudang Rp0 — pilih gudang (3.1) atau isi harga sewa per m² di Rental Space');
        break;
    }
    return k;
  };
  const OPSIONAL_SIMPLE = ['3.6', '3.7', '4.3', '4.6', '4.7'];
  const statusLangkah = (id: string): 'ok' | 'kurang' | 'opsional' => (kurangLangkah(id).length ? 'kurang' : OPSIONAL_SIMPLE.includes(id) ? 'opsional' : 'ok');
  const barisLangkah = (m: MenuSimple) => <ol>{m.langkah.map(l => { const st = statusLangkah(l.id); return <li key={l.id}>
    <button type="button" aria-current={!pop && langkah === l.id ? 'step' : undefined} className={!pop && langkah === l.id ? 'on' : undefined} onClick={() => keLangkah(l.id)}>
      <span className={`wiz-st ${st}`} title={st === 'ok' ? 'Lengkap' : st === 'kurang' ? `Kurang: ${kurangLangkah(l.id).join('; ')}` : 'Opsional'}>{st === 'ok' ? '✓' : st === 'kurang' ? '!' : '○'}</span>
      <span><b>{l.id}</b> {tr(l.nama)}</span></button></li>; })}</ol>;
  const hitungSt = (ms: MenuSimple[]) => { const st = ms.flatMap(m => m.langkah.map(l => statusLangkah(l.id))); return { wajib: st.filter(x => x !== 'opsional').length, ok: st.filter(x => x === 'ok').length }; };
  const menuAktif = cariLangkah(langkah).menu.no;
  const navWizard = <nav className="wiz-nav" aria-label="Langkah Cost Model Warehouse">
    {INDUK_SIMPLE.map(g => {
      const ms = MENU_SIMPLE.filter(m => g.menu.includes(m.no)), { wajib, ok } = hitungSt(ms), aktif = !pop && g.menu.includes(menuAktif);
      return <div key={g.nama} className={`wiz-induk${aktif ? ' on' : ''}`}>
        <button type="button" className="wiz-induk-judul" onClick={() => keLangkah(ms[0].langkah[0].id)}>
          <span>{tr(g.nama)}</span>{wajib > 0 && <small className={ok === wajib ? 'ok' : undefined}>{ok}/{wajib}</small>}</button>
        {ms.length === 1 ? <div className="wiz-menu on">{barisLangkah(ms[0])}</div>
          : ms.map(m => { const h = hitungSt([m]);
            return <div key={m.no} className={`wiz-menu${menuAktif === m.no && !pop ? ' on' : ''}`}>
              <button type="button" className="wiz-menu-judul" onClick={() => keLangkah(m.langkah[0].id)}>
                <i>{m.no}</i><span>{tr(m.nama)}</span>{h.wajib > 0 && <small className={h.ok === h.wajib ? 'ok' : undefined}>{h.ok}/{h.wajib}</small>}</button>
              {barisLangkah(m)}
            </div>; })}
      </div>;
    })}
    <a className="small wiz-lengkap" href={`/tender/${t.id}?tab=${tabAktif.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`} title="Buka semua tab (versi lengkap Logistics Tender)">Versi lengkap ↗</a>
  </nav>;
  const idxLangkah = LANGKAH_ID.indexOf(langkah);
  const lanjutSimple = simple && !pop && idxLangkah >= 0 && <div className="aksi-bawah wiz-bawah">
    {idxLangkah > 0 && <button className="ghost" onClick={() => keLangkah(LANGKAH_ID[idxLangkah - 1])}>← {LANGKAH_ID[idxLangkah - 1]} {tr(cariLangkah(LANGKAH_ID[idxLangkah - 1]).nama)}</button>}
    <span style={{ flex: 1 }} />
    {tabIsi !== 'Result' && tabIsi !== 'Quotation' && aksi(false)}
    {idxLangkah < LANGKAH_ID.length - 1 && <button onClick={() => { const nx = LANGKAH_ID[idxLangkah + 1]; if (nx === '4.1') hitung(false); keLangkah(nx); }}>Lanjut ke {LANGKAH_ID[idxLangkah + 1]} {tr(cariLangkah(LANGKAH_ID[idxLangkah + 1]).nama)} →</button>}
  </div>;

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{simple ? 'Cost Model Warehouse · ' : ''}{t.kode} · v{t.versi} · {labelStatus(t.status)}</div>
          <h1>{t.customer}</h1>
          <p className="muted">{t.kab_kota}, {t.provinsi} · {t.skenario_aset} · {t.jumlah_shift} shift · kontrak {t.durasi_kontrak_bulan} bln</p>
        </div>
        {aksi(true)}
      </div>
      {profile && !bisaEdit && <div className="ro-banner" role="note"><b>Hanya lihat</b> · Project ini milik {pembuat ?? 'akun lain'}{t.contoh_publik ? ' dan dibuka sebagai contoh publik' : ' dan dibagikan ke Anda dengan hak Lihat'}. Anda bisa melihat isi dan menjalankan Hitung untuk simulasi, tetapi tidak bisa menyimpan perubahan, mengubah status, atau membuat quotation.</div>}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        {bisaEdit ? <StatusControl tender={t} onBerubah={st => setT(x => x && ({ ...x, status: st }))} /> : <span />}
        <div className="row" style={{ margin: 0 }}>
          {profile && <BagikanTender tenderId={t.id} bolehKelola={bolehKelolaAkses} bolehContoh={!!profile.is_master || profile.role === 'admin'}
            contohPublik={!!t.contoh_publik} onContoh={v => setT(x => x && ({ ...x, contoh_publik: v }))} />}
          {profile && bisaEdit && (profile.role === 'admin' || profile.role === 'manager' || (t.created_by === profile.id && STATUS_DRAFT.includes(t.status))) && <HapusTender id={t.id} kode={t.kode ?? t.customer} customer={t.customer} />}
        </div>
      </div>

      {!simple && <div className="tabs tabs-beku" role="tablist">
        {([...(a.historis ? [TAB_EXCEL] : []), ...TABS.filter(x => x !== 'Export' || bolehExport(profile))] as ((typeof TABS)[number] | typeof TAB_EXCEL)[]).map(x => <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>{tr(x)}</button>)}
      </div>}
      <div className={simple ? 'wiz simple-cm' : 'wiz-mati'} ref={simple ? akarSimple : undefined}>
      {simple && <PerbesarTabel akar={akarSimple} />}
      {simple && navWizard}
      <div className={simple ? 'wiz-isi' : 'wiz-mati'}>
      {simple && (pop && popDari !== '4.2'
        ? <div className="rincian-bar" role="note"><button type="button" onClick={() => { const d = popDari; setPopDari(null); if (d) keLangkah(d); else keTab('Result'); }}>← Kembali ke {popDari === '4.2' ? 'Summary cost' : 'Result'}</button>
          <span>Rincian: <b>{tr(pop)}</b> — ubah di sini, angka di Result ikut dihitung ulang.</span></div>
        : <div className="wiz-kepala">
          <div className="small muted">{tr(indukDari(cariLangkah(langkah).menu.no))}{cariLangkah(langkah).menu.no < 4 ? ` · ${cariLangkah(langkah).menu.no}. ${tr(cariLangkah(langkah).menu.nama)}` : ''}</div>
          <div className="wiz-judul"><i>{langkah}</i>{tr(cariLangkah(langkah).nama)}</div>
          <div className="small klem" title="Klik untuk membaca selengkapnya"><span className="muted">Terhubung ke:</span> {cariLangkah(langkah).ke}</div>
          {kurangLangkah(langkah).length > 0 && <div className="wiz-kurang" role="status"><b>Yang masih kurang di langkah ini:</b>
            <ul>{kurangLangkah(langkah).map(x => <li key={x}>{x}</li>)}</ul></div>}
        </div>)}

      {tab === TAB_EXCEL && a.historis && <HistorisPanel h={a.historis} nama={(t.kode ?? t.customer).replace(/[^\w]+/g, '_')} />}

      {simple && langkah === '4.2' && panelSummaryCost}
      <div className={modalBuka ? 'sc-lapis' : 'wiz-mati'} onMouseDown={e => { if (modalBuka && e.target === e.currentTarget) tutupModal(); }}>
      <div className={modalBuka ? 'sc-modal' : 'wiz-mati'} role={modalBuka ? 'dialog' : undefined} aria-modal={modalBuka || undefined} aria-label={modalBuka ? `Revisi ${judulModal}` : undefined}>
      {modalBuka && <div className="sc-modal-kepala">
        <div><div className="small muted">Summary cost · Revisi</div><h2 style={{ margin: 0 }}>{judulModal}</h2></div>
        <span style={{ flex: 1 }} /><button type="button" onClick={tutupModal}>Selesai & hitung ulang</button>
        <button type="button" className="ghost" aria-label="Tutup" onClick={tutupModal}>✕</button></div>}
      <fieldset className="ro-fieldset" disabled={!bisaEdit}>
      {lihat('Key Assumption') && (di('1.1') || di('1.2')) && (
        <div className="card">
          {!simple && <h2><T>Key Assumption</T></h2>}
          {(() => {
            const dataProyek = <>
            <Txt id="cust" label="Customer" value={t.customer} onChange={v => setKol('customer', v)} />
            <Sel id="ind" label="Business category (produktivitas)" value={t.industri ?? ''} options={Array.from(new Set(['', ...INDUSTRI, t.industri ?? ''])).map(v => ({ v, l: v || '—' }))} onChange={v => setKol('industri', v || null)} />
            <Txt id="pic" label="PIC / account" value={t.pic ?? ''} onChange={v => setKol('pic', v)} />
            <Txt id="alamat" label="Alamat / site" value={t.alamat_lokasi ?? ''} onChange={v => setKol('alamat_lokasi', v)} />
            {(() => {
              const provs = Array.from(new Set(upahList.map(u => u.provinsi)));
              const kabs = upahList.filter(u => u.provinsi === t.provinsi);
              const um = upahList.find(u => u.provinsi === t.provinsi && u.kab_kota === t.kab_kota);
              return <>
                <label className="f" htmlFor="prov-tender">Provinsi project
                  <select id="prov-tender" value={t.provinsi} onChange={e => { const p = e.target.value; setT(x => x && ({ ...x, provinsi: p, kab_kota: '' })); catat(); setKotor(true); }}>
                    {!provs.includes(t.provinsi) && <option value={t.provinsi}>{t.provinsi || '— pilih provinsi —'}</option>}
                    {provs.map(p => <option key={p}>{p}</option>)}
                  </select></label>
                <label className="f" htmlFor="kab-tender">Area / kab-kota (menentukan UMK)
                  <select id="kab-tender" value={t.kab_kota} onChange={e => setKol('kab_kota', e.target.value)}>
                    {!kabs.some(k => k.kab_kota === t.kab_kota) && <option value={t.kab_kota}>{t.kab_kota || '— pilih kab/kota —'}</option>}
                    {kabs.map(k => <option key={k.kab_kota} value={k.kab_kota}>{k.kab_kota} — UMK {rp(k.upah_berlaku)}</option>)}
                  </select>
                  <span className="small muted">{um ? <>UMK {um.tahun}: <b>{rp(um.upah_berlaku)}</b> · {um.status_verifikasi} — dipakai sebagai gaji pokok default di Rincian biaya manpower</> : 'Pilih kab/kota agar UMK terisi'}</span></label>
              </>;
            })()}
            <Sel id="skema" label="Skema" value={t.skema} options={[{ v: 'Dedicated', l: 'Dedicated' }, { v: 'Shared', l: 'Shared' }]} onChange={v => setKol('skema', v)} />
            <Sel id="aset" label="Skenario aset" value={t.skenario_aset} options={(['Rental', 'Own Asset', 'Built-to-Suit'] as const).map(v => ({ v, l: v }))} onChange={v => setKol('skenario_aset', v)} />
            <Num id="kontrak" label="Durasi kontrak" suffix="bulan" value={t.durasi_kontrak_bulan} onChange={v => setKol('durasi_kontrak_bulan', v)} />
            <label className="f" htmlFor="golive">Go-live (menentukan tahun kalender & UMK)<input id="golive" type="date" value={t.tanggal_go_live ?? ''} onChange={e => setKol('tanggal_go_live', e.target.value || null)} /></label>
            </>;
            const polaKerja = <>
            <Sel id="shift" label="Jumlah shift" value={t.jumlah_shift} options={[1, 2, 3].map(v => ({ v, l: String(v) }))} onChange={v => gantiShift(v)} />
            <Sel id="hk" label="Hari kerja per minggu" value={t.hari_kerja_per_minggu} options={([5, 6, 7] as const).map(v => ({ v, l: `${v} hari` }))} onChange={v => setKol('hari_kerja_per_minggu', v)} />
            <Num id="jk" label="Jam kerja per shift" suffix="jam" value={t.jam_kerja_per_shift} onChange={v => setKol('jam_kerja_per_shift', v)} />
            <Num id="je" label="Jam efektif per shift" suffix="jam" value={t.jam_efektif_per_shift} onChange={v => setKol('jam_efektif_per_shift', v)} hint="Setelah istirahat, briefing, ganti baterai" />
            </>;
            const termin = <>
            <Num id="top" label="Payment term" suffix="hari" value={t.payment_term_hari} onChange={v => setKol('payment_term_hari', v)} />
            </>;
            const faktor = <>
            <Num id="cuti" label="Cuti tahunan per orang" suffix="hari" value={a.cutiTahunanHari} onChange={v => setA({ cutiTahunanHari: v })} hint="Masuk ke faktor pengganti headcount" />
            <Pct id="fp" label="Faktor produktivitas" value={a.faktorProduktivitas} onChange={v => setA({ faktorProduktivitas: v })} />
            <Pct id="ef" label="Efisiensi kerja" value={a.efisiensi} onChange={v => setA({ efisiensi: v })} />
            </>;
            return simple ? (langkah === '1.1'
              ? <div className="grid3 ka-grid">{dataProyek}</div>
              : <div className="grid3 ka-grid">
                {(polaKerja.props.children as React.ReactNode[])[0]}
                <Num id="group" label="Jumlah group" value={a.processDesign?.group ?? 1} onChange={v => setA({ processDesign: { ...(a.processDesign ?? PD_DEFAULT), group: Math.max(1, Math.round(v)) } })} />
                {(polaKerja.props.children as React.ReactNode[]).slice(1)}
                {termin}
                <Pct id="fp" label="Faktor produktivitas" value={a.faktorProduktivitas} onChange={v => setA({ faktorProduktivitas: v })} />
                <Pct id="ef" label="Efisiensi kerja" value={a.efisiensi} onChange={v => setA({ efisiensi: v })} />
              </div>) : <div className="grid3 ka-grid">{dataProyek}{polaKerja}{termin}{faktor}</div>;
          })()}
        </div>
      )}
      {simple && di('1.3') && <>{panelPaletSimple}{panelMuatanProduk}</>}
      {simple && di('1.4') && panelProdukSimple}
      {simple && di('1.6') && <ProcessDesignPanel hanya="kalender" bagian="desain" aktivitas={aktEfAktif} volumes={volEf} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
        jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd, cutiTahunanHari: pd.mp?.cuti ?? a.cutiTahunanHari })} onFaktor={patch => setA(patch)} onShift={gantiShift} />}
      {simple && di('1.7') && <ProcessDesignPanel hanya="shift" bagian="desain" aktivitas={aktEfAktif} volumes={volEf} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
        jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={gantiShift} />}
      {simple && di('1.8') && panelJalur}
      {simple && di('2.1') && panelVolumeSpek(['storage'])}
      {simple && di('2.2') && panelVolumeSpek(['inbound', 'outbound', 'vas'])}
      {simple && di('2.4') && <><div className="card">{panelRingkasOrder}
        <p className="small muted">Per hari = per bulan ÷ {hariOps} hari operasional (Working day, langkah 1.6); per tahun = per bulan × 12.</p></div>
        {(() => {
          const m = { ...MUATAN_DEFAULT, ...(a.profilVolume?.param ?? {}) };
          const xs = volEf.filter(v => v.arus !== 'storage');
          const pal = (v: (typeof xs)[number], q: number | undefined) => uraiUom(v, Number(q) || 0, m).palet ?? 0;
          const adaMin = xs.some(v => Number(v.minBulan) > 0);
          const seri = [
            ...(adaMin ? [{ nama: 'Min', nilai: xs.map(v => pal(v, v.minBulan)) }] : []),
            { nama: 'Mid (rata-rata)', nilai: xs.map(v => pal(v, v.rataRataBulan)) },
            { nama: 'MGV (komitmen)', nilai: xs.map(v => pal(v, v.komitmenBulan)) },
            { nama: 'Peak', nilai: xs.map(v => pal(v, v.peakBulan)) },
          ];
          return xs.length > 0 && <div className="card"><Grafik judul="Volume per arus" keterangan={`palet ekuivalen per bulan — ${seri.map(x => x.nama.split(' ')[0]).join(' / ')}`} kategori={xs.map(v => ARUS.find(o => o.v === v.arus)?.l ?? v.arus)}
            seri={seri} jenis="kolom" pilihan={['kolom', 'batang']} fmt={v => `${angka(v, 0)} palet`} fmtSumbu={v => angka(v, 0)} tinggi={220} /></div>;
        })()}
        {panelMuatanProduk}</>}
      {lihat('Volume') && !simple && (
        <div className="card">
          <h2><T>Volume</T></h2>
          <p className="small muted">Sizing memakai <b>peak</b>. Tarif dihitung dari <b>volume komitmen</b> (MGV). Storage diisi jumlah stok (posisi), arus lain per bulan.</p>
          {a.volumes.some(v => v.rataRataBulan > 0 && (!(v.peakBulan > 0) || !(v.komitmenBulan > 0))) && <p className="notice small" role="alert">
            Peak/bln atau Komitmen/bln masih 0 — sementara dihitung memakai <b>rata-rata/bln</b> (sizing, volume aktivitas, ringkasan order, tarif). Isi peak & komitmen sebenarnya bila berbeda.{' '}
            <button className="ghost" onClick={() => setA({ volumes: a.volumes.map(v => v.rataRataBulan > 0 ? { ...v, peakBulan: v.peakBulan > 0 ? v.peakBulan : v.rataRataBulan, komitmenBulan: v.komitmenBulan > 0 ? v.komitmenBulan : v.rataRataBulan } : v) })}>Isi yang kosong = rata-rata/bln</button>
            {' '}lalu sesuaikan bila peak / komitmen berbeda.</p>}
          {(() => { const xs = volumeSalahRibuan(a.volumes); if (!xs.length) return null;
            const kali = (x: number) => (x > 0 && x < 1000 && !Number.isInteger(x) ? Math.round(x * 1000) : x);
            return <p className="notice small" role="alert" style={{ borderColor: 'var(--bad, #c0392b)' }}>
              Volume {xs.map(({ v }) => `${v.arus} ${v.uom} ${String(v.peakBulan).replace('.', ',')}`).join(' · ')} tercatat <b>desimal</b> — kemungkinan maksudnya ribuan
              ({xs.map(({ v }) => Math.round(v.peakBulan * 1000).toLocaleString('id-ID')).join(' · ')}). Inilah yang membuat tarif handling per unit sangat besar.{' '}
              <button className="ghost" onClick={() => setA({ volumes: a.volumes.map((v, i) => xs.some(x => x.i === i) ? { ...v, rataRataBulan: kali(v.rataRataBulan), peakBulan: kali(v.peakBulan), komitmenBulan: kali(v.komitmenBulan) } : v) })}>Perbaiki jadi ribuan (× 1.000)</button></p>; })()}
          <div className="tablewrap"><table>
            <thead><tr><th>Arus</th><th>UoM</th><th className="num">Rata-rata/bln</th><th className="num">Peak/bln</th><th className="num">Komitmen/bln (MGV)</th><th className="num" title="Volume terendah per bulan (opsional) — dasar tarif Min">Min/bln</th><th className="num">Faktor peak</th><th title="Berapa satuan baris ini dalam 1 palet (atau isi 1 palet untuk baris palet)">Isi per palet</th><th title="Isi kecil per kemasan: 1 case = … pcs / kg / liter">Isi per kemasan</th><th></th></tr></thead>
            <tbody>{a.volumes.map((v, i) => (
              <tr key={i}>
                <td><select aria-label="Arus" value={v.arus} style={{ minWidth: 130 }} onChange={e => setA({ volumes: ubahArray(a.volumes, i, { arus: e.target.value as Arus }) })}>{ARUS.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select></td>
                <td><PilihUom value={v.uom} onChange={u => setA({ volumes: ubahArray(a.volumes, i, gantiUom(v, u)) })} /></td>
                {(['rataRataBulan', 'peakBulan', 'komitmenBulan'] as const).map(k => (
                  <td key={k} className="num"><AngkaVolume aria-label={k} value={v[k]}
                    style={k !== 'rataRataBulan' && !(v[k] > 0) && v.rataRataBulan > 0 ? { borderColor: 'var(--bad, #c0392b)' } : undefined}
                    onValue={n => setA({ volumes: ubahArray(a.volumes, i, k === 'rataRataBulan'
                      // peak & komitmen ikut rata-rata selama masih kosong / sama dengan rata-rata lama
                      ? { rataRataBulan: n, ...(!(v.peakBulan > 0) || v.peakBulan === v.rataRataBulan ? { peakBulan: n } : {}), ...(!(v.komitmenBulan > 0) || v.komitmenBulan === v.rataRataBulan ? { komitmenBulan: n } : {}) }
                      : { [k]: n }) })} /></td>
                ))}
                <td className="num"><AngkaVolume aria-label="minBulan" value={v.minBulan || undefined} placeholder={(() => { const xs = [v.rataRataBulan, v.komitmenBulan, v.peakBulan].map(Number).filter(x => x > 0); return xs.length ? Math.min(...xs).toLocaleString('id-ID') : ''; })()}
                  onValue={n => setA({ volumes: ubahArray(a.volumes, i, { minBulan: n > 0 ? n : undefined }) })} /></td>
                <td className="num">{v.rataRataBulan > 0 ? (v.peakBulan / v.rataRataBulan).toFixed(2) + '×' : '—'}</td>
                <SelKonversi v={volEfBaris[i] ?? v} onKonversi={konversi => setA({ volumes: ubahArray(a.volumes, i, { konversi }) })} />
                <td><button className="danger" onClick={() => setA({ volumes: a.volumes.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>))}
            </tbody></table></div>
          {!simple && <RingkasanVolumeSemuaUom volumes={volEfBaris} muatan={a.profilVolume?.param} basis={basisRingkas} hariOps={hariOps} />}
          {panelRingkasOrder}
          <p className="small muted">Per hari = per bulan ÷ {hariOps} hari operasional (Working Days di Process Design); per tahun = per bulan × 12. Satuan yang tidak bisa dikonversi (isi per palet / Parameter muatan belum ada) dikosongkan.
            {a.volumes.some(v => (v.konversi?.per1 ?? 0) > 0) && ' Aktivitas dengan UoM case/pcs (mis. Case Picking per karton) otomatis memakai konversi ini bila pengali UoM-nya 1.'}</p>
          <div className="row"><button className="ghost" onClick={() => setA({ volumes: [...a.volumes, { arus: 'vas', uom: 'karton', rataRataBulan: 0, peakBulan: 0, komitmenBulan: 0 }] })}>Tambah baris volume</button></div>
          {panelParamMuatan}
        </div>
      )}

      {lihat('Key Assumption') && !simple && panelPalet}
      {lihat('Key Assumption') && !simple && <ProfilVolumePanel ringkas profil={a.profilVolume} volumes={volEf} hariBulan={a.processDesign?.hariKerjaBulan ?? 25}
        onChange={profilVolume => setA({ profilVolume })} />}
      {lihat('Key Assumption') && di('1.5') && (() => {
        const pm = { ...PORSI_MUAT_DEFAULT, ...(a.porsiMuat ?? {}) };
        const dipakai = (pr: string) => a.aktivitas.filter(x => x.porsiMuat?.proses === pr);
        return <div className="card">
          <h2><T>Workload palletize vs loose</T></h2>
          <p className="small muted">Porsi volume yang ditangani <b>palletize</b> vs <b>loose</b> (curah / case) per proses. Aktivitas di tab Value Stream Mapping yang kolom % volume-nya "Ikut porsi" otomatis memakai angka ini.
            Replenishment dihitung dari volume <b>case picking</b> (outbound × loose picking), lalu dibagi turun palet vs loose case.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Proses</th><th className="num">Palletize</th><th className="num">Loose</th><th>Keterangan</th><th>Aktivitas yang ikut</th></tr></thead>
            <tbody>{PROSES_MUAT.map(p => {
              const v = pm[p.v]; const xs = dipakai(p.v);
              return <tr key={p.v}><td><b>{p.l}</b></td>
                <td className="num"><div className="row" style={{ flexWrap: 'nowrap', gap: 2, justifyContent: 'flex-end' }}>
                  <AngkaInput aria-label={`${p.l} palletize %`} min={0} max={100} step="any" value={Math.round(v * 1000) / 10} style={{ width: 70, minWidth: 70 }}
                    onValue={n => setA({ porsiMuat: { ...pm, [p.v]: Math.min(100, Math.max(0, n)) / 100 } })} />%</div></td>
                <td className="num"><b>{angka((1 - v) * 100, 1)}%</b></td>
                <td className="small muted">{p.ket}{p.v === 'replenishment' && <> · basis {angka((1 - pm.picking) * 100, 1)}% outbound</>}</td>
                <td className="small">{xs.length ? xs.map((x, k) => <div key={k}>{x.aktivitas} <span className="muted">({x.porsiMuat!.muat === 'palet' ? 'palletize' : x.porsiMuat!.muat} · {angka(persenDariPorsi(x.porsiMuat!, pm) * 100, 1)}%)</span></div>) : <span className="muted">belum ada aktivitas</span>}</td></tr>;
            })}</tbody>
          </table></div>
          {a.porsiMuat && <div className="row"><button className="ghost" onClick={() => setA({ porsiMuat: undefined })}>Kembalikan ke default</button></div>}
        </div>;
      })()}
      {lihat('Key Assumption') && !simple && panelDesain}

      {(lihat('Warehouse Planning') || (simple && di('1.9'))) && (<>
        {(!simple || di('3.1')) && <GudangPicker provinsi={t.provinsi} terpilih={a.gudang} kebutuhanM2={hasil?.space.totalM2} onPilih={(g, tarifM2) => {
          setKol('warehouse_id', g?.id ?? null);
          setA({ gudang: g, space: { ...a.space, tarifManual: g ? false : a.space.tarifManual, tarifSewaM2Bulan: g ? Math.round(tarifM2) : a.space.tarifSewaM2Bulan } });
        }} />}
        {(!simple || ['1.9', '3.2', '3.3', '3.4', '3.5'].includes(langkah)) && !pop && <SpacePanel bagian={simple ? ({ '1.9': 'a', '3.2': 'b', '3.3': 'c', '3.4': 'd', '3.5': 'e' } as const)[langkah as '3.2'] : undefined}
          porsiKosong={simple && !porsiSudahDiisi} excel={a.space.excel} ppTotal={paletEkuivalen(volEf.find(v => v.arus === 'storage')).palet}
          inboundBulan={paletEkuivalen(volEf.find(v => v.arus === 'inbound')).palet} outboundBulan={paletEkuivalen(volEf.find(v => v.arus === 'outbound')).palet}
          uomIn={paletEkuivalen(volEf.find(v => v.arus === 'inbound')).ok ? 'palet' : volEf.find(v => v.arus === 'inbound')?.uom ?? 'palet'} uomOut={paletEkuivalen(volEf.find(v => v.arus === 'outbound')).ok ? 'palet' : volEf.find(v => v.arus === 'outbound')?.uom ?? 'palet'}
          jumlahShift={t.jumlah_shift} onChange={ubahSpaceExcel}
          kekuatan={dasarKekuatan(a, t.customer)}
          komersial={panelBiayaSpace} />}
        {simple && di('3.6') && <div className="wiz-layout">
          <p className="small muted" style={{ margin: 0 }}>Layout dibuat dari input langkah 1.3–3.5 (palet, produk, volume, porsi rak, staging, footprint, gate, loading dock, trapesium) yang sudah disimpan.
            Bila input diubah sesudah layout terakhir disimpan, layout dibuat ulang otomatis. Komponen bisa digeser & diatur di sini, lalu klik Simpan di dalam editor.</p>
          {kunciLayout > 0 ? <iframe key={kunciLayout} className="wiz-frame" title="Layout 2D & simulasi 3D" src={`/simulasi?id=${t.id}&embed=1&dari=simple`} />
            : <p className="small">Menyimpan input & menyiapkan layout…</p>}
        </div>}
        {simple && di('3.7') && panelSummaryLayout}
      </>)}

      {lihat('Volume') && di('2.3') && <ProfilVolumePanel pakaiJalur={simple} judul={simple ? 'Moda & volume transport per hari' : undefined} profil={a.profilVolume} volumes={volEf} hariBulan={a.processDesign?.hariKerjaBulan ?? 25}
        onChange={profilVolume => setA({ profilVolume })} />}

      {lihat('Produk') && panelProduk}

      {lihat('Landmark VSM') && <VsmMapPanel tenderId={t.id} kode={t.kode ?? ''} customer={t.customer} aktivitas={a.aktivitas} pd={pdFull} vsm={a.vsm} bisaEdit={bisaEdit}
        onVsm={vsm => setA({ vsm })} onAktif={(idx, aktif) => setA({ aktivitas: a.aktivitas.map((x, i) => (idx.includes(i) ? { ...x, nonaktif: aktif ? undefined : true } : x)) })} />}
      {lihat('Value Stream Mapping') && (<>
        {<>
          <ProcessDesignPanel bagian="ringkasan" indirect={{ spanOfControl: a.spanOfControl, roleSupervisor: a.roleSupervisor, alatSupervisor: a.alatSupervisor, peranTetap: a.peranTetap }} aktivitas={aktEfAktif} volumes={volEf} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
              jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={gantiShift}
              biaya={{
                perOrang: role => { const r = rincianMp.find(x => x.role === role); return (r?.total ?? 0) * (r?.porsi ?? 1) * (1 + paramMp.feePersen); },
                persenTahun: (a.eskalasiManpower ?? ESKALASI_DEFAULT).persenTahun, onPersen: persenTahun => setA({ eskalasiManpower: { ...(a.eskalasiManpower ?? ESKALASI_DEFAULT), persenTahun } }),
                mulai: a.eskalasiManpower?.mulai ?? null, mulaiDefault: t.tanggal_go_live?.slice(0, 7) ?? null,
                onMulai: mulai => setA({ eskalasiManpower: { ...(a.eskalasiManpower ?? ESKALASI_DEFAULT), mulai } }),
                kontrakBulan: t.durasi_kontrak_bulan,
              }} />
          <BiayaManpowerPanel rows={rincianMp} param={paramMp} input={a.rincianBiayaMp ?? {}} bisaEdit={bisaEdit}
            umk={masterMp?.upahMinimum ?? 0} lokasi={t.kab_kota} levelGaji={a.levelGaji ?? {}} levelRole={a.levelRole ?? {}}
            onLevelGaji={levelGaji => setA({ levelGaji })} onLevelRole={levelRole => setA({ levelRole })}
            onInput={rincianBiayaMp => setA({ rincianBiayaMp })} onParam={p => setA({ paramBiayaMp: { ...(a.paramBiayaMp ?? {}), ...p } })} />
          <ProcessDesignPanel bagian="rincian" aktivitas={aktEfAktif} volumes={volEf} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
              jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={gantiShift} />
          <ProcessDesignPanel bagian="matriks" aktivitas={aktEfAktif} volumes={volEf} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
              jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={gantiShift} />
          <p className="small muted">Working day, workload shift, dan faktor produktivitas ada di tab <b>Key Assumption</b>.</p>
        </>}
        <div className="card">
          <h2><T>Indirect & peran tetap</T></h2>
          {(() => {
            const shiftN = Math.max(1, t.jumlah_shift || 1);
            const roleDirect = new Set(a.aktivitas.map(x => x.roleName));
            const spvOpsi = jabatan.filter(isRoleSupervisor);
            const spvList = spvOpsi.includes(a.roleSupervisor) || !a.roleSupervisor ? spvOpsi : [a.roleSupervisor, ...spvOpsi];
            const tetapOpsi = (cur: string) => { const xs = jabatan.filter(j => !roleDirect.has(j)); return cur && !xs.includes(cur) ? [cur, ...xs] : xs; };
            const spvManual = a.peranTetap.some(p => p.roleName === a.roleSupervisor);
            const tambah = () => {
              const pakai = new Set(a.peranTetap.map(p => p.roleName));
              const role = tetapOpsi('').find(j => !pakai.has(j)) ?? tetapOpsi('')[0] ?? jabatan[0] ?? '';
              setA({ peranTetap: [...a.peranTetap, { roleName: role, qty: 1, perShift: !isRoleSupervisor(role), alokasi: { manajemen: 1 } }] });
            };
            return <>
          <div className="grid3">
            <Num id="span" label="Span of control" suffix="direct per supervisor" value={a.spanOfControl} onChange={v => setA({ spanOfControl: v })} />
            <label className="f" htmlFor="spv">Role supervisor (hanya role SPV / Leader / Manager)
              <select id="spv" value={a.roleSupervisor} onChange={e => setA({ roleSupervisor: e.target.value })}>
                {spvList.map(j => <option key={j} value={j}>{j}{isRoleSupervisor(j) ? '' : ' — bukan role supervisor'}</option>)}</select></label>
            <label className="f" htmlFor="alat-spv">Alat pendukung supervisor
              <AlatInput id="alat-spv" value={a.alatSupervisor ?? []} onChange={v => setA({ alatSupervisor: v })} /></label>
          </div>
          {!spvManual && a.spanOfControl > 0 && !isRoleSupervisor(a.roleSupervisor) && <p className="notice small" role="alert"><b>{a.roleSupervisor}</b> bukan role supervisi, tetapi sekarang jumlahnya dihitung dari span of control. Pilih role SPV/Leader di atas; untuk Security, QHSE, admin, dsb. masukkan di tabel peran tetap.
            {' '}<button className="ghost" onClick={() => {
              const lama = a.roleSupervisor; const spvBaru = spvOpsi.find(j => a.peranTetap.some(p => p.roleName === j)) ?? spvOpsi[0] ?? 'Operational SPV';
              const tetap = a.peranTetap.some(p => p.roleName === lama) ? a.peranTetap : [...a.peranTetap, { roleName: lama, qty: 1, perShift: true, alokasi: { manajemen: 1 } }];
              setA({ roleSupervisor: spvBaru, spanOfControl: a.spanOfControl < 5 ? 15 : a.spanOfControl, peranTetap: tetap });
            }}>Perbaiki otomatis: {a.roleSupervisor} → peran tetap 1/shift, supervisor → {spvOpsi.find(j => a.peranTetap.some(p => p.roleName === j)) ?? spvOpsi[0] ?? 'Operational SPV'}{a.spanOfControl < 5 ? ', span 15' : ''}</button></p>}
          {!spvManual && a.spanOfControl > 0 && a.spanOfControl < 5 && <p className="notice small" role="alert">Span of control <b>{a.spanOfControl}</b> berarti 1 supervisor untuk setiap {a.spanOfControl} orang direct per shift — terlalu kecil. Umumnya 10–20.</p>}
          <p className="small muted">Supervisor otomatis = ROUNDUP(direct per shift ÷ span) × shift aktif — kecuali role supervisor sudah diisi di tabel peran tetap (maka jumlahnya mengikuti input). Isi span 0 untuk mematikan perhitungan otomatis.
            Peran tetap: isi <b>Headcount</b> lalu pilih <b>Basis</b> — <i>per shift</i> (mis. Security 1 orang/shift × {shiftN} shift = {shiftN} orang) atau <i>total</i> (mis. 1 Manager untuk seluruh gudang). Dropdown role hanya menampilkan role yang tidak dipakai sebagai direct di Aktivitas. Alat pendukung dihitung 1 unit per orang dan masuk MHE Summary; pisahkan dengan koma.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Role</th><th className="num">Headcount</th><th>Basis</th><th className="num">Total orang</th><th>Alat pendukung</th><th>Alokasi biaya</th><th></th></tr></thead>
            <tbody>{a.peranTetap.map((r, i) => (
              <tr key={i}>
                <td><select aria-label="Role" value={r.roleName} onChange={e => setA({ peranTetap: ubahArray(a.peranTetap, i, { roleName: e.target.value }) })}>{tetapOpsi(r.roleName).map(j => <option key={j} value={j}>{j}</option>)}</select></td>
                <td className="num"><AngkaInput aria-label="Headcount" min={0} step={1} bulat value={r.qty} onValue={v => setA({ peranTetap: ubahArray(a.peranTetap, i, { qty: Math.max(0, v) }) })} /></td>
                <td><select aria-label="Basis headcount" value={r.perShift ? 'shift' : 'total'} onChange={e => setA({ peranTetap: ubahArray(a.peranTetap, i, { perShift: e.target.value === 'shift' }) })}>
                  <option value="total">Total</option><option value="shift">Per shift</option></select></td>
                <td className="num"><b>{headcountTetap(r, shiftN)}</b>{r.perShift ? <div className="small muted">{r.qty} × {shiftN} shift</div> : null}</td>
                <td><AlatInput aria-label={`Alat pendukung ${r.roleName}`} value={r.alat ?? []} onChange={v => setA({ peranTetap: ubahArray(a.peranTetap, i, { alat: v }) })} /></td>
                <td><select aria-label="Alokasi" value={namaAlokasi(r.alokasi)} onChange={e => setA({ peranTetap: ubahArray(a.peranTetap, i, { alokasi: ALOKASI[e.target.value] }) })}>{Object.keys(ALOKASI).map(k => <option key={k} value={k}>{k}</option>)}</select></td>
                <td><button className="danger" title={r.roleName === a.roleSupervisor ? 'Hapus supervisor — perhitungan otomatis dari span of control ikut dimatikan' : undefined}
                  onClick={() => setA({ peranTetap: a.peranTetap.filter((_, j) => j !== i), ...(r.roleName === a.roleSupervisor && !a.peranTetap.some((p, j) => j !== i && p.roleName === r.roleName) ? { spanOfControl: 0 } : {}) })}>Hapus</button></td>
              </tr>))}
              {!spvManual && a.spanOfControl > 0 && (pdFull?.indirect.spv ?? 0) > 0 && (
                <tr className="baris-otomatis">
                  <td><b>{a.roleSupervisor}</b><div className="small muted">otomatis dari span of control</div></td>
                  <td className="num"><span className="small muted">span 1:{a.spanOfControl}</span></td>
                  <td><span className="small muted">Per shift</span></td>
                  <td className="num"><b>{pdFull?.indirect.spv}</b><div className="small muted">⌈direct/shift ÷ {a.spanOfControl}⌉ × shift</div></td>
                  <td className="small muted">{(a.alatSupervisor ?? []).join(', ') || '–'}</td>
                  <td className="small muted">Manajemen</td>
                  <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    <button className="ghost" title="Jadikan peran tetap dengan jumlah yang bisa diisi sendiri" onClick={() => setA({ peranTetap: [...a.peranTetap, { roleName: a.roleSupervisor, qty: Math.max(1, Math.round((pdFull?.indirect.spv ?? 1) / shiftN)), perShift: true, alat: a.alatSupervisor ?? [], alokasi: { manajemen: 1 } }] })}>Ubah manual</button>
                    <button className="danger" title="Hapus supervisor (span of control = 0)" onClick={() => setA({ spanOfControl: 0 })}>Hapus</button></div></td>
                </tr>)}
              {!a.peranTetap.length && !(a.spanOfControl > 0 && (pdFull?.indirect.spv ?? 0) > 0) && <tr><td colSpan={7} className="muted small">Belum ada peran tetap.</td></tr>}</tbody></table></div>
          {a.spanOfControl === 0 && !spvManual && <p className="small muted" style={{ margin: 0 }}>Supervisor tidak dihitung (span of control 0). <button className="link-kecil" onClick={() => setA({ spanOfControl: 15 })}>Aktifkan lagi (span 15)</button></p>}
          <div className="row"><button className="ghost" onClick={tambah} disabled={!jabatan.length}>Tambah peran tetap</button></div>
            </>;
          })()}
        </div>
        <div className="card">
          <h2>Productivity & Man-Hour</h2>
          <p className="small muted">Pilih aktivitas dari database produktivitas (Operations) atau tambah baris kosong. Semua kolom kuning bisa diubah: task, aktivitas, equipment, alat pendukung, role, produktivitas, UoM, arus, volume, %. Volume/bln kosong = volume peak arus × pengali. <b>Arus</b> = alur barang yang menjadi dasar volume aktivitas: Inbound (barang masuk), Outbound (barang keluar), Storage (stok/penyimpanan), VAS (value added service).</p>
          <div className="notice small" style={{ display: 'grid', gap: 6 }}>
            <div><b>Skema default VSM</b> ({VSM_DEFAULT.length} aktivitas, prosedur gudang standar): unloading curah oleh TKBM / palet dengan forklift CB → admin receiving → checker & tally → staging → admin input putaway → putaway reach truck → cycle count & input inventory → input & replenishment reach truck → admin input picking → picking case (picker) / palet (reach truck) → staging outbound → checker outbound → loading curah (TKBM) / paletan (forklift CB) → admin barang keluar & print handover list → checker serahkan HO ke driver.
              Porsi awal: 50% curah / 50% palet di inbound, 50% case / 50% palet di picking & loading — sesuaikan kolom %, hapus, atau ganti baris sesuai kebutuhan.</div>
            <div className="row">
              {!konfirmVsm
                ? <button className="ghost" onClick={() => a.aktivitas.length ? setKonfirmVsm(true) : setA({ aktivitas: skemaVsmDefault(prods) })}>{a.aktivitas.length ? 'Ganti dengan skema default' : 'Isi skema default'}</button>
                : <><span>Ganti {a.aktivitas.length} aktivitas yang ada dengan skema default?</span>
                  <button className="danger" onClick={() => { setA({ aktivitas: skemaVsmDefault(prods) }); setKonfirmVsm(false); }}>Ya, ganti</button>
                  <button className="ghost" onClick={() => setKonfirmVsm(false)}>Batal</button></>}
              {a.aktivitas.length > 0 && !konfirmVsm && <button className="ghost" onClick={() => setA({ aktivitas: [...a.aktivitas, ...skemaVsmDefault(prods)] })}>Tambahkan di bawah aktivitas yang ada</button>}
              <span className="muted">Bisa di-Undo.</span>
            </div>
          </div>
          {(() => {
            // Aktivitas yang diambil dari database Productivity tetapi data di database sudah berubah (role, tool, UoM, produktivitas)
            const beda = a.aktivitas.map((x, i) => ({ x, i, p: x.productivityId ? prods.find(q => q.id === x.productivityId) : undefined }))
              .filter(o => o.p && (o.p.role_name !== o.x.roleName || o.p.tool !== o.x.tool || o.p.uom !== o.x.uom || Number(o.p.prod_per_jam) !== Number(o.x.prodPerJam)));
            if (!beda.length) return null;
            const contoh = Array.from(new Set(beda.filter(o => o.p!.role_name !== o.x.roleName).map(o => `${o.x.roleName} → ${o.p!.role_name}`))).slice(0, 4);
            return <div className="notice small" role="status" style={{ display: 'grid', gap: 6 }}>
              <div><b>{beda.length} aktivitas berbeda dengan database Productivity</b> (data di tender adalah salinan saat aktivitas ditambahkan).
                {contoh.length > 0 && <> Role: {contoh.join(' · ')}.</>} Klik sinkronkan agar role, equipment, UoM & produktivitas mengikuti database; volume, %, arus, porsi & urutan tidak berubah.</div>
              <div className="row"><button className="ghost" onClick={() => setA({ aktivitas: a.aktivitas.map(x => {
                const p = x.productivityId ? prods.find(q => q.id === x.productivityId) : undefined;
                return p ? { ...x, roleName: p.role_name, tool: p.tool, uom: p.uom, prodPerJam: Number(p.prod_per_jam) } : x;
              }) })}>Sinkronkan {beda.length} aktivitas dengan database</button><span className="muted">Bisa di-Undo.</span></div>
            </div>;
          })()}
          <TambahAktivitas prods={prods} industri={t.industri} onTambah={p => setA({ aktivitas: [...a.aktivitas, { ...dariProd(p), persenVolume: 1, pengaliUom: 1 }] })} />
          <div className="row">
            <button className="ghost" onClick={() => setA({ aktivitas: [...a.aktivitas, { aktivitas: 'Aktivitas baru', tahap: a.aktivitas.at(-1)?.tahap ?? 'Inbound', tool: 'Manual', roleName: jabatan[0] ?? '',
              uom: 'palet', prodPerJam: 20, arus: 'inbound', persenVolume: 1, pengaliUom: 1 }] })}>Tambah baris kosong</button>
            <span className="small muted">Manpower dihitung dengan FTE per bulan (Process Design) + multi-skill pooling. Operator RT/Forklift CB hanya saling backup sesama operator; TKBM & Helper (daily worker) tidak dirangkap.</span>
          </div>
          <datalist id="dl-tool">{TOOLS.concat(prods.map(p => p.tool), a.mhe.map(m => m.tool)).filter((v, k, xs) => v && xs.indexOf(v) === k).map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="dl-tahap">{Array.from(new Set([...prods.map(p => p.tahap), ...a.aktivitas.map(x => x.tahap)])).map(v => <option key={v} value={v} />)}</datalist>
          <div className="tablewrap"><table className="akt-edit">
            <thead><tr><th title="Geser urutan: tombol ▲▼ atau seret nomor baris">Urutan</th><th>Task / tahap</th><th>Aktivitas (workload driver)</th><th>Equipment</th><th>Alat pendukung</th><th>Role (man power)</th><th className="num">Prod/jam</th><th>UoM</th><th title="Alur barang yang menjadi dasar volume aktivitas">Arus (alur barang)</th>
              <th className="num" title="Kosongkan untuk memakai volume peak arus × pengali">Volume/bln</th><th className="num">% volume</th><th className="num">Pengali UoM</th><th></th></tr></thead>
            <tbody>
              {a.aktivitas.length === 0 && <tr><td colSpan={13} className="muted">Belum ada aktivitas. Tambahkan dari daftar di atas atau baris kosong.</td></tr>}
              {a.aktivitas.map((x, i) => {
                const ub = (patch: Partial<typeof x>) => setA({ aktivitas: ubahArray(a.aktivitas, i, patch) });
                const vArus = volEf.find(v => v.arus === x.arus);
                const pEf = pengaliEfektif(x, vArus);
                const ef = aktEf[i];
                const vAuto = ef?.volumeDariProfil ? Number(ef.volumeManual) : (vArus?.peakBulan ?? 0) * pEf;
                const pindah = (dari: number, ke: number) => {
                  if (ke < 0 || ke >= a.aktivitas.length || dari === ke) return;
                  const xs = [...a.aktivitas]; const [m] = xs.splice(dari, 1); xs.splice(ke, 0, m); setA({ aktivitas: xs });
                };
                return (
                <tr key={i} className={x.nonaktif ? 'akt-nonaktif' : undefined} onDragOver={e => { if (seret.current != null) e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); if (seret.current != null) pindah(seret.current, i); seret.current = null; }}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div className="row" style={{ flexWrap: 'nowrap', gap: 2, alignItems: 'center' }}>
                      <span draggable onDragStart={e => { seret.current = i; e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { seret.current = null; }}
                        title="Seret untuk memindah baris" style={{ cursor: 'grab', padding: '0 4px', fontWeight: 600 }}>⋮⋮ {i + 1}</span>
                      <input type="checkbox" aria-label={`Aktivitas ${i + 1} dipakai`} title={x.nonaktif ? 'Tidak dipakai (tidak dihitung) — centang untuk memakai lagi' : 'Dipakai — hilangkan centang untuk mematikan (Landmark VSM)'}
                        checked={!x.nonaktif} onChange={e => ub({ nonaktif: e.target.checked ? undefined : true })} />
                      <button className="ghost" style={{ padding: '2px 6px' }} aria-label={`Naikkan baris ${i + 1}`} title="Naikkan" disabled={i === 0} onClick={() => pindah(i, i - 1)}>▲</button>
                      <button className="ghost" style={{ padding: '2px 6px' }} aria-label={`Turunkan baris ${i + 1}`} title="Turunkan" disabled={i === a.aktivitas.length - 1} onClick={() => pindah(i, i + 1)}>▼</button>
                    </div></td>
                  <td><input aria-label="Tahap" list="dl-tahap" value={x.tahap} onChange={e => ub({ tahap: e.target.value })} style={{ minWidth: 140 }} /></td>
                  <td><select aria-label="Aktivitas" value={x.productivityId ? String(x.productivityId) : 'manual'} style={{ minWidth: 220 }}
                    onChange={e => { const p = prods.find(q => q.id === Number(e.target.value)); if (p) ub(dariProd(p)); }}>
                    {!x.productivityId && <option value="manual">{x.aktivitas} (manual)</option>}
                    {Array.from(new Set(prods.map(p => p.tahap))).map(th => (
                      <optgroup key={th} label={th}>{prods.filter(p => p.tahap === th).map(p => <option key={p.id} value={p.id}>{p.aktivitas} · {p.tool} · {p.prod_per_jam} {p.uom}/jam</option>)}</optgroup>))}
                  </select></td>
                  <td><input aria-label="Equipment" list="dl-tool" value={x.tool} onChange={e => ub({ tool: e.target.value, alatManual: true })} style={{ minWidth: 130 }} />
                    {x.alatManual && x.porsiMuat?.muat === 'palet' && <div className="small muted">manual · <button type="button" className="linkbtn" onClick={() => ub({ alatManual: undefined })} title="Ikut otomatis lagi (CBT / RT dari tinggi rak)">otomatis</button></div>}</td>
                  <td><input aria-label="Alat pendukung" list="dl-tool" placeholder="mis. Scanner RDT" value={(x.alatTambahan ?? []).join(', ')}
                    onChange={e => ub({ alatTambahan: e.target.value.split(',').map(t => t.trimStart()) })} onBlur={e => ub({ alatTambahan: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} style={{ minWidth: 130 }} /></td>
                  <td><select aria-label="Role" value={x.roleName} onChange={e => ub({ roleName: e.target.value })} style={{ minWidth: 160 }}>
                    {(() => { const semua = Array.from(new Set([...jabatan, ...prods.map(q => q.role_name).filter(Boolean)])).sort(); return (semua.includes(x.roleName) ? semua : [x.roleName, ...semua]); })().map(j => <option key={j}>{j}</option>)}</select>
                    {x.roleName && jabatan.length > 0 && !jabatan.includes(x.roleName) && <div className="small" style={{ color: 'var(--warn, #b45309)' }} title="Tambahkan role ini di master Jabatan (job level) agar faktor UMK & tunjangan sesuai">belum ada di master Jabatan</div>}</td>
                  <td className="num db"><InputDesimal aria-label="Produktivitas" step="any" value={x.prodPerJam} onChange={e => ub({ prodPerJam: Number(e.target.value) })} style={{ width: 80, minWidth: 80 }} /></td>
                  <td><select aria-label="UoM" value={x.uom} style={{ minWidth: 100 }} onChange={e => ub({ uom: e.target.value })}>{(UOM.includes(x.uom) ? UOM : [x.uom, ...UOM]).map(u => <option key={u}>{u}</option>)}</select></td>
                  <td><select aria-label="Arus" value={x.arus} style={{ minWidth: 130 }} title="Alur barang: inbound (masuk), outbound (keluar), storage (penyimpanan), VAS" onChange={e => ub({ arus: e.target.value as Arus })}>{ARUS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></td>
                  <td className="num"><InputDesimal aria-label="Volume per bulan" step="any" placeholder={Math.round(vAuto).toLocaleString('id-ID')} value={x.volumeManual ?? ''}
                    onChange={e => ub({ volumeManual: e.target.value === '' ? null : Number(e.target.value) })} style={{ width: 96, minWidth: 96 }} />
                    {ef?.volumeDariProfil && <div className="small muted" title="Order admin dari Profil order (tab Volume): mobil/hari × input admin per mobil × hari operasional">auto dari profil order</div>}
                    {!ef?.volumeDariProfil && isAktivitasAdmin(x) && x.volumeManual == null && <div className="small muted" title="Isi Profil order di tab Volume agar volume admin terisi otomatis">isi profil order</div>}</td>
                  <td className="num"><div className="sel-persen">
                    {x.porsiMuat
                      ? <div className="nilai" title="Ikut porsi palletize/loose di Key Assumption">{angka(persenDariPorsi(x.porsiMuat, a.porsiMuat) * 100, 1)}%</div>
                      : <div className="row" style={{ flexWrap: 'nowrap', gap: 2, justifyContent: 'flex-end' }}><InputDesimal aria-label="Persen volume" step="any" value={+(x.persenVolume * 100).toFixed(2)} onChange={e => ub({ persenVolume: Number(e.target.value) / 100 })} style={{ width: 70, minWidth: 70 }} /><span className="small">%</span></div>}
                    <select aria-label="Sumber % volume" title={x.porsiMuat ? `Ikut porsi: ${labelTag(x.porsiMuat)}` : '% diisi manual'} value={x.porsiMuat ? `${x.porsiMuat.proses}:${x.porsiMuat.muat}` : ''}
                      onChange={e => { const o = OPSI_TAG.find(q => q.k === e.target.value); ub(o ? { porsiMuat: o.t } : { porsiMuat: undefined, persenVolume: x.porsiMuat ? persenDariPorsi(x.porsiMuat, a.porsiMuat) : x.persenVolume }); }}>
                      <option value="">% manual</option>
                      {OPSI_TAG.map(o => <option key={o.k} value={o.k}>Porsi {labelTag(o.t)}</option>)}</select>
                  </div></td>
                  <td className="num"><InputDesimal aria-label="Pengali UoM" step="any" value={x.pengaliUom} onChange={e => ub({ pengaliUom: Number(e.target.value) })} title="Mis. 1 palet = 40 karton → 40. Biarkan 1 agar memakai konversi di tab Volume." style={{ width: 70, minWidth: 70 }} />
                    {(x.pengaliUom || 1) === 1 && pEf !== 1 && <div className="small muted" title="dari konversi di tab Volume">{pEf > 0 && pEf < 1 ? `auto ÷${angka(1 / pEf, 1 / pEf % 1 ? 1 : 0)}` : `auto ×${angka(pEf)}`}</div>}
                    {vArus && faktorUom(vArus, x.uom) == null && (x.pengaliUom || 1) === 1 && <div className="small" style={{ color: 'var(--warn, #b45309)' }} title={`UoM ${x.uom} belum ada di konversi arus (${vArus.uom})`}>isi konversi</div>}</td>
                  <td className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                    <button className="ghost" title="Duplikat baris" onClick={() => setA({ aktivitas: [...a.aktivitas.slice(0, i + 1), { ...x }, ...a.aktivitas.slice(i + 1)] })}>Salin</button>
                    <button className="danger" onClick={() => setA({ aktivitas: a.aktivitas.filter((_, j) => j !== i) })}>Hapus</button></td>
                </tr>); })}
            </tbody></table></div>
        </div>
      </>)}

      {lihat('Loan & Interest Calculator') && <InterestPanel nilai={a.interestCost} onChange={interestCost => setA({ interestCost })} hasilLive={hasilInterest} kontrakBulan={t.durasi_kontrak_bulan} />}

      {lihat('Technology & Equipment') && <>
        <ProcessDesignPanel bagian="mhe" aktivitas={aktEfAktif} volumes={volEf} pd={a.processDesign} faktorProduktivitas={a.faktorProduktivitas} efisiensi={a.efisiensi}
          jumlahShift={t.jumlah_shift} onPd={pd => setA({ processDesign: pd })} onFaktor={patch => setA(patch)} onShift={gantiShift} />
        <MhePanel mhe={a.mhe} items={items} metodeExcel={true} onChange={mhe => setA({ mhe })} kontrakBulan={t.durasi_kontrak_bulan} opsiPilih={opsiPilihMhe}
          alatRak={{ ...alatRak(a.space.excel, a.batasAngkatCbtMm ?? BATAS_ANGKAT_CBT_MM), batasMm: a.batasAngkatCbtMm ?? BATAS_ANGKAT_CBT_MM, onBatas: mm => setA({ batasAngkatCbtMm: mm }),
            manual: a.aktivitas.filter(x => x.alatManual && x.porsiMuat?.muat === 'palet').length }}
          kebutuhan={true
            ? pdMhe.map(r => ({ nama: r.nama, fte: r.fte, unit: r.resources }))
            : toolsDipakai.map(tl => { const r = hasil?.mhe.find(x => x.tool === tl); return { nama: tl, fte: null, unit: r ? r.unitDasar : null }; })} />
        <BiayaSpacePanel hanyaRak space={a.space} gudang={a.gudang} items={items} spaceRentM2={spaceH?.spaceRent ?? 0}
          posSpr={Math.ceil((spaceH?.sd.ppReq ?? 0) - 1e-9)} posDdr={Math.ceil((spaceH?.dd.ppReq ?? 0) - 1e-9)}
          posBlock={Math.ceil(spaceH?.block.ppReq ?? 0)} posFloor={Math.ceil(spaceH?.floor.ppReq ?? 0)}
          skenarioAset={t.skenario_aset} kontrakBulan={t.durasi_kontrak_bulan} onSpace={space => setA({ space })} onGudang={gudang => setA({ gudang })} />
        <ItPanel sheet={a.it} onChange={it => setA({ it })} kontrakBulan={t.durasi_kontrak_bulan} driver={driverIt} />

        <div className="card">
          <h2>Office, stationery, consumable, pallet, HSE, services, asuransi & startup</h2>
          {a.it.lines.length > 0 && <p className="small notice">IT di atas ikut dihitung otomatis: ±{rp(ringkasIt(a.it, { kontrakBulan: t.durasi_kontrak_bulan, bungaTahun: 0 }).totalBulan)}/bln (termasuk depresiasi/amortisasi OTC {rp(ringkasIt(a.it).sekali)}). Jangan diinput dua kali di sini.</p>}
          <p className="small muted">Dipisah per klasifikasi sesuai Price Inquiry; pilihan item di tiap bagian hanya dari kategorinya. Bulanan/sewa = qty × harga per bulan. Beli = depresiasi selama min(umur, kontrak) + bunga modal. Sekali = diamortisasi selama kontrak + bunga modal.</p>
          <BiayaLainPanel lines={a.costLines} items={items} kontrakBulan={t.durasi_kontrak_bulan}
            onChange={(costLines, tandai, dibuang) => setA({ costLines, ...(tandai ? { biayaDefaultDiisi: true } : {}), ...(dibuang ? { biayaDefaultDibuang: dibuang } : {}) })}
            dibuang={a.biayaDefaultDibuang}
            startup={a.startupAuto ?? STARTUP_DEFAULT} onStartup={startupAuto => setA({ startupAuto })}
            hasilBaris={hasilInterest?.biaya ?? hasil?.biaya} onHitung={() => hitung(false)}
            driver={driverBiaya} defaultDiisi={!!a.biayaDefaultDiisi} onNilaiStok={nilaiStokRp => setA({ nilaiStokRp })} fasilitas={fasilitasGudang} />

        </div>
      </>}

      {lihat('Utilities Management') && (<>
        <div className="card">
          <h2>Electrical</h2>
          <p className="small muted">Daftar default dihitung dari Warehouse Planning (luas, office, tinggi), Value Stream Mapping (shift), dan Technology & Equipment (MHE, IT). Baris <span style={{ color: 'var(--bad)', fontWeight: 600 }}>merah</span> = datanya belum diketahui; qty 0 sampai datanya dilengkapi.</p>
          <ListrikTender simulasi={a.listrikSimulasi} listrik={a.listrik} golongan={a.golonganListrik} tarifKwh={a.tarifListrikKwh} tarif={tarif} items={items}
            onSimulasi={listrikSimulasi => setA({ listrikSimulasi })} onListrik={listrik => setA({ listrik })}
            onTarif={(golonganListrik, tarifListrikKwh) => setA({ golonganListrik, tarifListrikKwh })} driver={driverListrik} />
        </div>
        <div className="card">
          <h2>Water</h2>
          <AirPanel air={a.air} headcount={headcountTotal} luasM2={hasil?.space.totalM2 ?? spaceH?.luasDipakai ?? 0} hariKerjaBulan={a.processDesign?.hariKerjaBulan ?? 25} onChange={air => setA({ air })} />
        </div>
      </>)}

      {simple && langkah === '4.2' && popKat && rincianBiayaSimple(popKat)}
      {lihat('Result') && (!simple || (!popKat && ['4.1', '4.3', '4.4', '4.5'].includes(langkah))) && <HasilPanel langkah={simple && !pop ? langkah : undefined} onBukaKategori={simple ? k => { keLangkah('4.2'); setTimeout(() => bukaRincianBiaya(katBaris({ kelompok: k as Kelompok, deskripsi: '' })), 0); } : undefined}
        ekstraManpower={simple ? panelManpowerSimple : undefined} drill={simple} onBukaTab={bukaRincian} saran={hasil ? saranGudang(hasil, a, Number(t.jam_efektif_per_shift) || 7) : []} belumDisimpan={!!hasil && JSON.stringify(hasil.totalBiayaBulan) !== JSON.stringify((t.hasil as HasilTender | null)?.totalBiayaBulan) || JSON.stringify(hasil?.rateCard?.map(r => r.tarifPerUnit)) !== JSON.stringify((t.hasil as HasilTender | null)?.rateCard?.map(r => r.tarifPerUnit))} hasil={hasil} catatan={catatanMaster} onSimpan={simpanHasil} onHitung={() => hitung()}
        marginManual={a.marginManual ?? {}} onMargin={marginManual => setA({ marginManual })} kurs={a.kurs} onKurs={kurs => setA({ kurs })} kontrakBulan={t.durasi_kontrak_bulan}
        pajak={a.pajak ?? PAJAK_DEFAULT} onPajak={pajak => setA({ pajak })} gudang={a.gudang}
        uomRateCard={a.uomRateCard ?? {}} onUomRateCard={uomRateCard => setA({ uomRateCard })} hariTarif={a.hariTarifHarian} onHariTarif={hariTarifHarian => setA({ hariTarifHarian })} uomManual={a.uomManual ?? {}} onUomManual={uomManual => setA({ uomManual })} onBukaAlokasi={() => bukaRincian('Cost Allocation')}
        layananJual={a.layananJual ?? {}} onLayananJual={layananJual => setA({ layananJual })} tambahan={a.tarifTambahan ?? []} onTambahan={tarifTambahan => setA({ tarifTambahan })}
        basisTarif={a.basisTarif} onBasisTarif={basisTarif => setA({ basisTarif })} />}
      {lihat('Cost Allocation') && <CostAllocation h={hasil} tenderId={t.id} onKeResult={() => keTab('Result')}
        alokasiKategori={a.alokasiKategori ?? {}} onAlokasiKategori={alokasiKategori => setA({ alokasiKategori })}
        handlingSetara={a.handlingSetara !== false} onHandlingSetara={v => setA({ handlingSetara: v })} />}
      {lihat('Quotation') && di('4.6') && <QuotationPanel tender={t} profile={profile} />}
      </fieldset>
      </div></div>
      {lihat('Export') && di('4.7') && !bolehExport(profile) && <div className="card"><p>Export Excel hanya untuk <b>Super Admin</b> dan <b>manager</b>.</p></div>}
      {lihat('Export') && di('4.7') && bolehExport(profile) && <ExportPanel siapkan={siapkanExport} namaFile={namaFileExport(nomorQ, t.kode ?? t.customer)} />}
      {lihat('Export') && di('4.7') && bolehExport(profile) && <UploadExcelPanel t={t} bisaEdit={bisaEdit} onTerapkan={terapkanExcel} />}
      {!simple && tabIsi !== 'Result' && tabIsi !== 'Quotation' && tabIsi !== 'Export' && <div className="aksi-bawah">{aksi(false)}</div>}
      {simple && pop && !modalBuka && tabIsi !== 'Result' && <div className="aksi-bawah">{aksi(false)}</div>}
      {lanjutSimple}
      </div></div>
    </>
  );
}

function TambahAktivitas({ prods, industri, onTambah }: { prods: Prod[]; industri: string | null; onTambah: (p: Prod) => void }) {
  const [q, setQ] = useState('');
  const [pilih, setPilih] = useState('');
  // produktivitas kategori bisnis tender + General Cargo (berlaku semua kategori)
  const kat = kategoriDari(industri);
  const daftar = prods.filter(p => (!kat || !p.industri || p.industri === kat || p.industri === KATEGORI_UMUM) && (!q || `${p.tahap} ${p.aktivitas} ${p.tool} ${p.role_name} ${p.uom}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="row">
      <input aria-label="Cari aktivitas" placeholder="Cari aktivitas, tool, role…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 240 }} />
      <select aria-label="Aktivitas" value={pilih} onChange={e => setPilih(e.target.value)} style={{ maxWidth: 460 }}>
        <option value="">Pilih aktivitas ({daftar.length})</option>
        {daftar.map(p => <option key={p.id} value={p.id}>{p.tahap} · {p.aktivitas} · {p.tool} · {p.prod_per_jam} {p.uom}/jam{p.industri && p.industri !== KATEGORI_UMUM ? ` · ${p.industri}` : ''}{kat && p.benchmark?.[kat] ? ` · benchmark ${kat}: ${p.benchmark[kat]}` : ''}{p.status !== 'approved' ? ' (draft)' : ''}</option>)}
      </select>
      <button disabled={!pilih} onClick={() => { const p = prods.find(x => x.id === Number(pilih)); if (p) { onTambah(p); setPilih(''); } }}>Tambah</button>
    </div>
  );
}

function HasilPanel({ langkah, onBukaKategori, ekstraManpower, drill = false, belumDisimpan, hasil, catatan, onSimpan, onHitung, marginManual, onMargin, kurs, onKurs, kontrakBulan, pajak, onPajak, gudang, uomRateCard, onUomRateCard, uomManual, onUomManual, onBukaAlokasi, layananJual, onLayananJual, tambahan, onTambahan, hariTarif, onHariTarif, onBukaTab, saran, basisTarif, onBasisTarif }: {
  /** Simple CM: angka Result bisa diklik untuk membuka rinciannya */
  drill?: boolean;
  /** Simple CM: langkah wizard 4.1–4.5 — tampilkan satu bagian Result sesuai Spesifikasi */
  langkah?: string; onBukaKategori?: (k: string) => void; ekstraManpower?: React.ReactNode;
  basisTarif?: Partial<BasisTarif>; onBasisTarif: (b: BasisTarif) => void;
  onBukaAlokasi: () => void; hariTarif?: number; onHariTarif: (n: number | undefined) => void;
  onBukaTab: (tab: string) => void; saran: Saran[];
  uomManual: Partial<Record<Bucket, { uom: string; volume: number }>>; onUomManual: (u: Partial<Record<Bucket, { uom: string; volume: number }>>) => void;
  layananJual: Partial<Record<Bucket, 'jual' | 'termasuk'>>; onLayananJual: (x: Partial<Record<Bucket, 'jual' | 'termasuk'>>) => void;
  tambahan: TarifTambahanInput[]; onTambahan: (x: TarifTambahanInput[]) => void;
  uomRateCard: Partial<Record<Bucket, string>>; onUomRateCard: (u: Partial<Record<Bucket, string>>) => void;
  belumDisimpan?: boolean; hasil: HasilTender | null; catatan: string[]; onSimpan: () => void; onHitung: () => void; gudang: { nama: string; luas_m2: number } | null | undefined;
  marginManual: Partial<Record<Bucket, number | null>>; onMargin: (m: Partial<Record<Bucket, number | null>>) => void;
  kurs: Kurs | null | undefined; onKurs: (k: Kurs | null) => void; kontrakBulan: number; pajak: Pajak; onPajak: (p: Pajak) => void;
}) {
  const { id: tenderId } = useParams<{ id: string }>();
  // Red flag bisa disembunyikan / ditampilkan — pilihan diingat di perangkat ini
  const [sembunyiFlag, setSembunyiFlagS] = useState<boolean>(() => { try { return localStorage.getItem('leca.sembunyiRedFlag') === '1'; } catch { return false; } });
  const setSembunyiFlag = (v: boolean) => { setSembunyiFlagS(v); try { localStorage.setItem('leca.sembunyiRedFlag', v ? '1' : '0'); } catch { /* abaikan */ } };
  const [bagian, setBagianS] = useState<'ringkasan' | 'harga' | 'biaya' | 'operasional'>(() => { try { const v = localStorage.getItem('leca.hasilBagian'); return v === 'harga' || v === 'biaya' || v === 'operasional' ? v : 'ringkasan'; } catch { return 'ringkasan'; } });
  const setBagian = (v: typeof bagian) => { setBagianS(v); try { localStorage.setItem('leca.hasilBagian', v); } catch { /* abaikan */ } };
  if (!hasil) return <div className="card"><p>Belum dihitung.</p><div className="row"><button onClick={onHitung}>Hitung sekarang</button></div></div>;
  const h = hasil;
  const kritis = h.redFlags.filter(f => f.level === 'kritis').length;
  const bagianTampil = langkah ? null : bagian;
  const komersialProps = { hariTarif, onHariTarif, h, marginManual, onMargin, kurs, onKurs, kontrakBulan, pajak, onPajak, uomRateCard, onUomRateCard, uomManual, onUomManual, layananJual, onLayananJual, tambahan, onTambahan, basisTarif, onBasisTarif, onBukaKategori };
  return (
    <>
      {(!langkah || langkah === '4.1') && (() => {
        const s0 = h.simulasi[0];
        const sell = s0?.pendapatanBulan ?? 0, cost = h.totalBiayaBulan, profit = s0?.gp ?? sell - cost;
        const kpi: [string, string, string?, boolean?][] = [
          ['Cost per bulan', rp(cost), `per tahun ${rp(cost * 12)}`],
          ['Selling per bulan', rp(sell), `per tahun ${rp(sell * 12)} · bersih setelah PPh`, true],
          ['Profit per bulan', rp(profit), `per tahun ${rp(profit * 12)}`, true],
          ['Margin (GP%)', persen(s0?.gpPersen), 'atas volume komitmen', true],
          ['Jumlah manpower', `${h.totalHeadcount} orang`, 'headcount setelah rangkap'],
          ['Luas gudang', `${angka(h.space.totalM2)} m²`, gudang ? `${gudang.nama} · dari ${angka(Number(gudang.luas_m2))} m²` : 'gudang belum dipilih'],
        ];
        const kom = Object.entries(h.perKelompok ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        const totKom = kom.reduce((t2, [, v]) => t2 + v, 0) || 1;
        const WARNA = ['#1e56a0', '#f28c28', '#0f766e', '#7c3aed', '#be123c', '#ca8a04', '#0891b2', '#4d7c0f', '#9a3412', '#475569'];
        return <section className={`hasil-hero${langkah ? ' ringkas' : ''}`} aria-label="Ringkasan hasil">
          <div className="hasil-hero-kepala">
            <div><h2 style={{ margin: 0 }}>Hasil hitung</h2>
              {belumDisimpan ? <span className="small" style={{ color: 'var(--warn, #b45309)' }}>Dihitung ulang dari input terbaru dan <b>belum disimpan</b> — simpan supaya quotation & export memakai angka ini.</span>
                : <span className="small muted">Sesuai versi tersimpan</span>}</div>
            <div className="row hasil-aksi" style={{ margin: 0 }}><button className="ghost" onClick={onHitung}><T>Hitung ulang</T></button><button onClick={onSimpan}><T>Simpan hasil sebagai versi baru</T></button></div>
          </div>
          <div className="kpis kpis-hasil">{kpi.map(([l, v, k, utama]) => {
            // drill-down: klik angka → buka rinciannya (tab lengkap / bagian Result) untuk dilihat & diubah
            const ke: Record<string, [string, () => void]> = {
              'Cost per bulan': ['Rincian biaya per kategori', () => setBagian('biaya')],
              'Selling per bulan': ['Harga, satuan tarif & GP%', () => setBagian('harga')],
              'Profit per bulan': ['Harga, satuan tarif & GP%', () => setBagian('harga')],
              'Margin (GP%)': ['Harga, satuan tarif & GP%', () => setBagian('harga')],
              'Jumlah manpower': ['Value Stream Mapping (aktivitas, produktivitas, manpower)', () => onBukaTab('Value Stream Mapping')],
              'Luas gudang': ['Warehouse Planning (space & racking)', () => onBukaTab('Warehouse Planning')],
            };
            const d = drill ? ke[l] : undefined;
            const isi = <><span className="small muted"><T>{l}</T></span><b>{v}</b>{k && <span className="small muted">{k}</span>}{d && <span className="small kpi-buka">Buka rincian →</span>}</>;
            const kls = `kpi${utama && langkah ? ' kpi-utama' : ''}`;
            return d ? <button key={l} type="button" className={`${kls} kpi-klik`} title={`Buka: ${d[0]}`} onClick={d[1]}>{isi}</button> : <div key={l} className={kls}>{isi}</div>;
          })}</div>
          {kom.length > 0 && !langkah && <div className="komposisi">
            <div className="komposisi-bar" role="img" aria-label={`Komposisi biaya: ${kom.map(([k, v]) => `${k} ${Math.round((v / totKom) * 100)}%`).join(', ')}`}>
              {kom.map(([k, v], j) => <i key={k} style={{ width: `${(v / totKom) * 100}%`, background: WARNA[j % WARNA.length] }} title={`${k} · ${rp(v)}/bln · ${persen(v / totKom)}`} />)}</div>
            <div className="komposisi-legenda">{kom.map(([k, v], j) => drill
              ? (onBukaKategori ? <button type="button" key={k} className="link-kecil" onClick={() => onBukaKategori(k)}><i style={{ background: WARNA[j % WARNA.length] }} />{labelKelompok(k)} <b>{persen(v / totKom, 0)}</b></button> : <a key={k} href={`/tender/${tenderId}/kategori/${encodeURIComponent(k)}`} target="_blank" rel="noopener" title={`Buka & revisi harga ${labelKelompok(k)} (tab baru)`}><i style={{ background: WARNA[j % WARNA.length] }} />{labelKelompok(k)} <b>{persen(v / totKom, 0)}</b></a>)
              : <span key={k}><i style={{ background: WARNA[j % WARNA.length] }} />{labelKelompok(k)} <b>{persen(v / totKom, 0)}</b></span>)}</div>
          </div>}
        </section>;
      })()}
      {langkah === '4.1' && h.rateCard.length > 0 && (() => {
        const totA = h.rateCard.reduce((x, r) => x + r.biayaBulan, 0) || 1;
        const ubah = h.alokasiLayanan?.matriks?.filter(r => r.override).length ?? 0;
        return <div className="card ca-sorot">
          <div className="sc-kepala">
            <div><h2 style={{ margin: 0 }}>Cost allocation</h2>
              <span className="small muted">Pembagian biaya ke tiap layanan — dasar tarif per layanan · {ubah ? `${ubah} kategori diubah manual` : 'default simulasi (cost-to-serve)'}</span></div>
            {h.alokasiLayanan && <button type="button" onClick={onBukaAlokasi}>Atur cost allocation</button>}
          </div>
          <div className="ca-isi">
            <div className="ca-angka">{h.rateCard.map((r, i) => <div key={r.bucket} className="ca-item">
              <i style={{ background: warnaKe(i) }} /><span>{BUCKET_LABEL[r.bucket]}</span>
              <b>{persen(r.biayaBulan / totA)}</b><span className="small muted">{rp(r.biayaBulan)}/bln</span></div>)}</div>
            <Grafik judul="Porsi biaya per layanan" kategori={h.rateCard.map(r => BUCKET_LABEL[r.bucket])} seri={[{ nama: 'Biaya/bln', nilai: h.rateCard.map(r => r.biayaBulan) }]}
              jenis="donut" pilihan={['donut', 'pie', 'batang', 'kolom']} fmt={rp} fmtSumbu={ringkasRp} warnaPerKategori tanpaLegenda tinggi={190} tengah={ringkasRp(totA)} />
          </div>
        </div>;
      })()}
      {langkah === '4.1' && <HasilKomersial bagian="tarif" ringkas {...komersialProps} />}
      {langkah === '4.3' && <HasilKomersial bagian="kurs" {...komersialProps} />}
      {langkah === '4.4' && <HasilKomersial bagian="capex" ringkas {...komersialProps} />}
      {langkah === '4.5' && (() => {
        const mp = h.manpower.filter(m => m.headcount > 0).sort((x, y) => y.headcount - x.headcount);
        const al = h.mhe.filter(m => m.unit > 0).sort((x, y) => y.unit - x.unit);
        return (mp.length > 0 || al.length > 0) && <div className="card"><div className="grid2">
          {mp.length > 0 && <Grafik judul="Headcount per role" keterangan={`total ${h.totalHeadcount} orang`} kategori={mp.map(m => m.roleName)} seri={[{ nama: 'Headcount', nilai: mp.map(m => m.headcount) }]}
            jenis="batang" pilihan={['batang', 'kolom', 'donut']} fmt={v => `${angka(v)} orang`} fmtSumbu={v => angka(v)} warnaPerKategori />}
          {al.length > 0 && <Grafik judul="Unit MHE" keterangan="unit operasi (tanpa spare)" kategori={al.map(m => m.nama)} seri={[{ nama: 'Unit', nilai: al.map(m => m.unit) }]}
            jenis="batang" pilihan={['batang', 'kolom', 'donut']} fmt={v => `${angka(v)} unit`} fmtSumbu={v => angka(v)} warnaPerKategori />}
        </div></div>;
      })()}
      {langkah === '4.5' && ekstraManpower}
      {!langkah && <div className="tabs hasil-tab" role="tablist" aria-label="Bagian hasil">
        {([['ringkasan', 'Ringkasan & red flag', 'hasil'], ['harga', 'Harga & margin', 'isian'], ['biaya', 'Rincian biaya', 'hasil'], ['operasional', 'Manpower, MHE & space', 'hasil']] as const).map(([k, l, j]) => (
          <button key={k} role="tab" aria-selected={bagian === k} className={bagian === k ? 'on' : ''} onClick={() => setBagian(k)}>{l}{j === 'isian' && <span className="pill warn" style={{ marginLeft: 6, fontSize: 11 }}>ada isian</span>}</button>))}
      </div>}

      {(bagianTampil === 'ringkasan' || langkah === '4.1') && <>
      {!langkah && <div className="card">
        <h2>Tarif per layanan</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Layanan</th><th>Satuan</th><th className="num">Volume komitmen/bln</th><th className="num">Biaya/bln</th><th className="num">GP%</th><th className="num">Tarif {pajak.ppn === 'include' ? 'incl.' : 'excl.'} PPN</th></tr></thead>
          <tbody>{h.rateCard.map(r => <tr key={r.bucket}><td>{BUCKET_LABEL[r.bucket]}</td><td>per {r.uom}</td><td className="num">{angka(r.volumeKomitmen)}</td><td className="num">{rp(r.biayaBulan)}</td>
            <td className="num">{persen(r.gpPersen)}</td><td className="num"><b>{rp(pajak.ppn === 'include' ? (r.tarifInclPpn ?? r.tarifPerUnit) : r.tarifPerUnit)}</b></td></tr>)}</tbody>
        </table></div>
        <div className="row"><button className="ghost" onClick={() => setBagian('harga')}>Atur satuan tarif & GP% →</button></div>
      </div>}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Red flag {kritis > 0 ? <span className="pill bad">{kritis} kritis</span> : <span className="pill ok">tidak ada yang kritis</span>}</h2>
          {h.redFlags.length > 0 && <button className="ghost" aria-expanded={!sembunyiFlag} onClick={() => setSembunyiFlag(!sembunyiFlag)}>
            {sembunyiFlag ? `▸ Tampilkan (${h.redFlags.length})` : '▾ Sembunyikan'}</button>}
        </div>
        {h.redFlags.length === 0 && <p className="muted">Tidak ada red flag.</p>}
        {sembunyiFlag && h.redFlags.length > 0 && <p className="small muted">
          {(['kritis', 'peringatan', 'info'] as const).map(l => { const n = h.redFlags.filter(f => f.level === l).length; return n ? <span key={l} className={`pill ${l === 'kritis' ? 'bad' : l === 'peringatan' ? 'warn' : 'info'}`} style={{ marginRight: 6 }}>{n} {l}</span> : null; })}
          disembunyikan — tekan Tampilkan untuk melihat detail.</p>}
        {!sembunyiFlag && h.redFlags.map((f, i) => { const so = solusiUntuk(f.kode); return <div key={i} className={`flag ${f.level}`}><b className="small">{f.level.toUpperCase()} · {f.kode}</b><div>{f.pesan}</div>
          {so && <div className="solusi"><b>Solusi:</b> {so.solusi}{so.tab && <> <button className="link-kecil" onClick={() => onBukaTab(so.tab!)}>Buka {so.tab} →</button></>}</div>}</div>; })}
        {!sembunyiFlag && catatan.length > 0 && <p className="small muted">Catatan master data ikut dimasukkan sebagai red flag MASTER_DATA.</p>}
      </div>

      {saran.length > 0 && <div className="card">
        <h2>Saran solusi gudang</h2>
        <p className="small muted">Peluang efisiensi & mitigasi risiko dari angka tender ini — pertimbangkan sebelum quotation final.</p>
        <div className="saran-gudang">{saran.map((x, i) => <div key={i} className="saran"><i>{i + 1}</i><div><b>{x.judul}</b><div className="small">{x.isi}{x.tab && <> <button className="link-kecil" onClick={() => onBukaTab(x.tab!)}>Buka {x.tab} →</button></>}</div></div></div>)}</div>
      </div>}

      {!langkah && h.alokasiLayanan && <div className="card row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <span className="small"><b>Pembagian biaya ke layanan:</b> {h.alokasiLayanan.matriks?.filter(r => r.override).length ? `${h.alokasiLayanan.matriks.filter(r => r.override).length} kategori diubah` : 'default simulasi (cost-to-serve)'}
          {' · '}{h.rateCard.map(r => `${BUCKET_LABEL[r.bucket]} ${persen(r.biayaBulan / (h.marginTotal.biayaBulan || 1))}`).join(' · ')}</span>
        <button className="ghost" onClick={onBukaAlokasi}>Atur di Cost Allocation →</button></div>}
      </>}
      {bagianTampil === 'harga' && <HasilKomersial bagian="harga" hariTarif={hariTarif} onHariTarif={onHariTarif} h={h} marginManual={marginManual} onMargin={onMargin} kurs={kurs} onKurs={onKurs} kontrakBulan={kontrakBulan} pajak={pajak} onPajak={onPajak} uomRateCard={uomRateCard} onUomRateCard={onUomRateCard} uomManual={uomManual} onUomManual={onUomManual}
        layananJual={layananJual} onLayananJual={onLayananJual} tambahan={tambahan} onTambahan={onTambahan} basisTarif={basisTarif} onBasisTarif={onBasisTarif} />}

      {(bagianTampil === 'operasional' || langkah === '4.5') && <>{!langkah && <div className="grid2">
        <div className="card">
          <h2><T>Kalender & volume desain</T></h2>
          <table><tbody>
            <tr><td>Hari kerja kalender</td><td className="num">{h.kalender.hariKalenderKerja}</td></tr>
            <tr><td>Libur nasional & cuti bersama di hari kerja</td><td className="num">−{h.kalender.liburDiHariKerja}</td></tr>
            <tr><td><b>Hari operasional gudang</b></td><td className="num"><b>{h.kalender.hariOperasional}</b></td></tr>
            <tr><td>Cuti tahunan per orang</td><td className="num">−{h.kalender.cuti}</td></tr>
            <tr><td>Hari kerja per orang</td><td className="num">{h.kalender.hariKerjaOrang}</td></tr>
            <tr><td>Faktor pengganti</td><td className="num">{h.kalender.faktorPengganti}×</td></tr>
          </tbody></table>
          <table><thead><tr><th>Arus</th><th className="num">Peak/bln</th><th className="num">Faktor peak</th><th className="num">Desain/shift</th></tr></thead>
            <tbody>{h.volume.map((v, i) => <tr key={i}><td>{v.arus} ({v.uom})</td><td className="num">{angka(v.peakBulan)}</td><td className="num">{v.faktorPeak}×</td><td className="num">{angka(v.desainPerShift, 1)}</td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h2><T>Space</T></h2>
          <table><tbody>
            <tr><td>Posisi palet desain (peak)</td><td className="num">{angka(h.space.ppDesain)}</td></tr>
            <tr><td>m² per posisi</td><td className="num">{angka(h.space.m2PerPP, 3)}</td></tr>
            <tr><td>Area simpan</td><td className="num">{angka(h.space.storageM2, 1)} m²</td></tr>
            <tr><td>Staging inbound / outbound</td><td className="num">{angka(h.space.stagingInM2, 1)} / {angka(h.space.stagingOutM2, 1)} m²</td></tr>
            <tr><td>Fasilitas</td><td className="num">{angka(h.space.fasilitasM2)} m²</td></tr>
            <tr><td>Allowance</td><td className="num">{angka(h.space.allowanceM2, 1)} m²</td></tr>
            <tr><td><b>Total</b></td><td className="num out">{angka(h.space.totalM2)} m²</td></tr>
          </tbody></table>
        </div>
      </div>}

      <div className="card">
        {drill ? <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={{ margin: 0 }}><T>Kebutuhan manpower & MHE</T></h2>
          <div className="row" style={{ margin: 0 }}><button className="ghost" onClick={() => onBukaTab('Value Stream Mapping')}>Ubah manpower (VSM) →</button>
            <button className="ghost" onClick={() => onBukaTab('Technology & Equipment')}>Ubah MHE & IT →</button></div></div>
          : <h2><T>Kebutuhan manpower & MHE</T></h2>}
        <p className="small muted">Bagian ini hanya menunjukkan <b>jumlah</b> (berapa orang / unit dan seberapa sibuk). Biayanya ada di <b>Rincian biaya per bulan</b> di bawah, kategori Manpower & MHE — supaya angka rupiah tidak tampil dua kali.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Role</th><th>Jenis</th><th className="num">Jam kerja/shift</th><th className="num">MP/shift</th><th className="num">Headcount</th><th className="num">Utilisasi</th><th>Skema</th></tr></thead>
          <tbody>{h.manpower.map(m => {
            const r = m as typeof m & { skema?: string; porsi?: number };
            return <tr key={m.roleName + m.jenis} className={m.headcount ? undefined : 'muted'}><td>{m.roleName}</td><td>{m.jenis}</td><td className="num">{m.jenis === 'Direct' ? angka(m.jamPerShift, 2) : '—'}</td><td className="num">{m.mpPerShift || '—'}</td>
              <td className="num"><b>{m.headcount}</b>{!m.headcount && m.jenis === 'Direct' ? <span className="small"> (dirangkap)</span> : ''}</td><td className="num">{m.jenis === 'Direct' && m.headcount ? persen(m.utilisasi, 0) : '—'}</td>
              <td className="small">{r.skema === 'sharing' ? `sharing ${(r.porsi ?? 1).toLocaleString('id-ID')}` : 'dedicated'}</td></tr>;
          })}
            <tr className="pd-sub"><td colSpan={4}><b>Total</b></td><td className="num"><b>{h.totalHeadcount}</b></td><td colSpan={2} /></tr></tbody>
        </table></div>
        <h3><T>MHE</T></h3>
        {(() => { const ada = h.mhe.filter(m => m.unit > 0 || (m.spare ?? 0) > 0); const nol = h.mhe.length - ada.length;
          return <><table><thead><tr><th>MHE</th><th>Mode</th><th className="num">Jam pakai/shift</th><th className="num">Unit</th></tr></thead>
            <tbody>{ada.map(m => <tr key={m.tool + m.nama}><td>{m.nama} ({m.tool})</td><td>{m.mode}</td><td className="num">{m.jamPerShift > 0 ? angka(m.jamPerShift, 2) : '—'}</td><td className="num"><b>{m.unit}</b>{m.spare ? ` (spare ${m.spare})` : ''}</td></tr>)}</tbody></table>
            {nol > 0 && <p className="small muted">{nol} alat tidak dipakai (0 unit) disembunyikan: {h.mhe.filter(m => !(m.unit > 0 || (m.spare ?? 0) > 0)).map(m => `${m.nama} (${m.tool})`).join(', ')}.</p>}</>; })()}
      </div>

      </>}

      {bagianTampil === 'biaya' && <><div className="card">
        <h2><T>Rincian biaya per bulan</T></h2>
        <p className="small muted">Dikelompokkan per kategori. Klik <b>Rincian & revisi</b> untuk membuka kategori{onBukaKategori ? '' : ' di tab baru'} dan merevisi / menambah barisnya.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Baris</th><th>Risiko</th><th>Dasar hitung</th><th className="num">Biaya/bln</th></tr></thead>
          <tbody>{(() => {
            const urut = Object.entries(h.perKelompok).sort((a, b) => b[1] - a[1]).map(([k]) => k);
            return urut.map(k => { const rows = h.biaya.filter(b => b.kelompok === k); if (!rows.length) return null; const sub = rows.reduce((s2, b) => s2 + b.biayaBulan, 0);
              return [
                <tr key={`h-${k}`} className="kat-head"><td colSpan={3}><b>{labelKelompok(k)}</b> <span className="small muted">· {rows.length} baris · {persen(sub / (h.totalBiayaBulan || 1))}</span>
                  {' '}{onBukaKategori ? <button type="button" className="link-kecil" onClick={() => onBukaKategori(k)}>Rincian & revisi →</button>
                    : <a className="small" href={`/tender/${tenderId}/kategori/${encodeURIComponent(k)}`} target="_blank" rel="noopener">Rincian & revisi ↗</a>}</td><td className="num"><b>{rp(sub)}</b></td></tr>,
                ...rows.map((b, i) => <tr key={`${k}-${i}`}><td style={{ paddingLeft: 22 }}>{b.deskripsi}{b.biayaSistem != null && <span className="pill warn small" style={{ marginLeft: 6 }}>direvisi</span>}</td><td>{b.kategoriRisiko}</td><td className="small muted">{b.dasar}</td><td className="num">{rp(b.biayaBulan)}</td></tr>),
              ]; });
          })()}
            <tr className="pd-sub"><td colSpan={3}><b>Total</b></td><td className="num out">{rp(h.totalBiayaBulan)}</td></tr></tbody>
        </table></div>
      </div>
      <HasilKomersial bagian="biaya" {...komersialProps} /></>}
    </>
  );
}

const PALET_PRESET: (Omit<PaletTipe, 'id' | 'porsi'> & { label: string })[] = [
  { label: 'Standar kayu · 1.200 × 1.000 mm', nama: 'Standar kayu', panjang: 1.2, lebar: 1.0, tebalMm: 150 },
  { label: 'Jumbo · 1.200 × 1.200 mm', nama: 'Jumbo', panjang: 1.2, lebar: 1.2, tebalMm: 150 },
  { label: 'Plastik · 1.200 × 1.000 mm', nama: 'Plastik', panjang: 1.2, lebar: 1.0, tebalMm: 150 },
  { label: 'JIS / Asia · 1.100 × 1.100 mm', nama: 'JIS', panjang: 1.1, lebar: 1.1, tebalMm: 150 },
  { label: 'EUR · 1.200 × 800 mm', nama: 'EUR', panjang: 1.2, lebar: 0.8, tebalMm: 144 },
  { label: 'Custom (isi sendiri)', nama: 'Palet custom', panjang: 1.2, lebar: 1.0, tebalMm: 150 },
];
const fmtN = (x: number, d = 2) => x.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: d });
/** Jenis palet (Key Assumption) — satu sumber untuk semua ukuran palet: Produk (susunan per palet), block stack / pallet floor (luas rata-rata), racking (tebal terbesar), simulasi 3D. */
function PaletTender({ excel, onChange, cbmPerPalet, onCbmPerPalet, tertanam = false, tinggiDariProduk = false }: { tinggiDariProduk?: boolean; excel: SpaceExcel; onChange: (x: SpaceExcel) => void; cbmPerPalet?: number; onCbmPerPalet?: (v: number) => void; tertanam?: boolean }) {
  const list = daftarPalet(excel), r = ringkasPalet(list);
  const simpan = (xs: PaletTipe[]) => onChange({ ...excel, paletTipe: xs });
  const ubah = (i: number, patch: Partial<PaletTipe>) => simpan(list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const tambah = (k: number) => { const p = PALET_PRESET[k]; if (!p) return; const { label: _l, ...isi } = p;
    simpan([...list, { ...isi, id: `p${Date.now().toString(36)}`, porsi: Math.max(0, Math.round((1 - r.totalPorsi) * 1000) / 1000) }]); };
  const kecil = { width: 96, minWidth: 96, textAlign: 'right' as const };
  const { satuan: sp, fmt } = useSatuanPanjang();
  const totOk = Math.abs(r.totalPorsi - 1) < 0.0005;
  return <div className={tertanam ? undefined : 'card'} style={tertanam ? { display: 'grid', gap: 8, marginTop: 12 } : undefined}>
    {tertanam ? <h3>Jenis palet</h3> : <h2>Jenis palet</h2>}
    <p className="small muted">Palet yang dipakai di gudang ini + porsi pemakaiannya. Otomatis dipakai di: <b>Produk</b> (isi per layer & tinggi muatan, sesuai jenis palet tiap produk),
      <b> Warehouse Planning</b> (luas block stack / pallet floor = luas rata-rata tertimbang; Pallet di racking = tebal terbesar), dan <b>simulasi 3D</b>.</p>
    <div className="tablewrap"><table className="palet-tabel" style={{ width: 'auto', minWidth: '100%' }}>
      <thead><tr><th>Nama palet</th><th className="num">Panjang ({sp})</th><th className="num">Lebar ({sp})</th><th className="num">Tebal ({sp})</th><th className="num" title="Tinggi muatan produk di atas palet (tanpa tebal palet)">Tinggi produk ({sp})</th><th className="num" title="Tebal palet + tinggi produk">Tinggi total</th><th className="num" title="Panjang × lebar × tinggi produk">CBM muatan</th><th className="num">Pemakaian (%)</th><th className="num">Luas (m²)</th><th className="num">Bobot</th><th>Default produk</th><th /></tr></thead>
      <tbody>{list.map((p, i) => <tr key={p.id}>
        <td><input aria-label={`Nama palet ${i + 1}`} value={p.nama} onChange={e => ubah(i, { nama: e.target.value })} style={{ width: 200, minWidth: 160 }} /></td>
        <td className="num"><InputPanjang aria-label={`Panjang palet ${i + 1}`} min={0} nilai={p.panjang} basis="m" style={kecil} onNilai={v => ubah(i, { panjang: v ?? 0 })} /></td>
        <td className="num"><InputPanjang aria-label={`Lebar palet ${i + 1}`} min={0} nilai={p.lebar} basis="m" style={kecil} onNilai={v => ubah(i, { lebar: v ?? 0 })} /></td>
        <td className="num"><InputPanjang aria-label={`Tebal palet ${i + 1}`} min={0} nilai={p.tebalMm} basis="mm" style={kecil} onNilai={v => ubah(i, { tebalMm: v ?? 0 })} /></td>
        <td className="num">{tinggiDariProduk ? <span title="Dihitung dari Product input (tinggi produk × layer)">{fmt(Number(p.tinggiProdukMm) > 0 ? Number(p.tinggiProdukMm) : excel.rak.productMm, 'mm')}</span> : <InputPanjang aria-label={`Tinggi produk palet ${i + 1}`} min={0} nilai={p.tinggiProdukMm ?? null} basis="mm" style={kecil} kosong placeholderDasar={excel.rak.productMm}
          onNilai={v => ubah(i, { tinggiProdukMm: v && v > 0 ? v : null })} />}</td>
        <td className="num">{Number(p.tinggiProdukMm) > 0 ? fmt((Number(p.tebalMm) || 0) + Number(p.tinggiProdukMm), 'mm') : <span className="muted">—</span>}</td>
        <td className="num">{Number(p.tinggiProdukMm) > 0 ? fmtN(r.cbmMuatan(p), 2) : <span className="muted">—</span>}</td>
        <td className="num"><AngkaInput aria-label={`Pemakaian palet ${i + 1}`} step="any" min={0} max={100} value={Math.round((p.porsi || 0) * 1000) / 10} style={kecil} onValue={v => ubah(i, { porsi: Math.max(0, v) / 100 })} /></td>
        <td className="num">{fmtN((p.panjang || 0) * (p.lebar || 0), 3)}</td>
        <td className="num muted">{fmtN(r.bobot[i] * 100, 1)}%</td>
        <td>{p.id === r.dominan.id && <span className="pill info" title="Pemakaian terbesar — dipakai produk yang belum memilih jenis palet">✓ default</span>}</td>
        <td><button className="danger" style={{ padding: '4px 10px' }} disabled={list.length <= 1} title={list.length <= 1 ? 'Minimal satu jenis palet' : 'Hapus jenis palet'} onClick={() => simpan(list.filter((_, j) => j !== i))}>Hapus</button></td>
      </tr>)}</tbody>
      <tfoot><tr><td><b>Total</b></td><td /><td /><td /><td className="num">{r.adaTinggi ? <><b>{fmt(r.tinggiProdukMaks, 'mm')}</b><div className="small muted">terbesar</div></> : null}</td><td /><td className="num">{r.adaTinggi ? <><b>{fmtN(r.cbmRata, 2)}</b><div className="small muted">rata-rata</div></> : null}</td><td className="num"><b style={{ color: totOk ? undefined : 'var(--warn, #b45309)' }}>{fmtN(r.totalPorsi * 100, 1)}%</b></td>
        <td className="num"><b>{fmtN(r.luasRata, 3)}</b><div className="small muted">rata-rata</div></td><td /><td /><td /></tr></tfoot>
    </table></div>
    {!totOk && <p className="small" style={{ color: 'var(--warn, #b45309)', margin: 0 }}>Total pemakaian {fmtN(r.totalPorsi * 100, 1)}% (bukan 100%) — {r.totalPorsi > 0 ? 'dihitung proporsional (kolom Bobot)' : 'semua 0 → dibagi rata'}.</p>}
    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select aria-label="Tambah jenis palet" value="" onChange={e => { tambah(Number(e.target.value)); e.target.value = ''; }} style={{ width: 'auto' }}>
        <option value="" disabled>＋ Tambah palet…</option>
        {PALET_PRESET.map((p, k) => <option key={k} value={k}>{p.nama === 'Palet custom' ? p.label : `${p.label.split(' · ')[0]} · ${fmt(p.panjang, 'm', { tanpaSatuan: true })} × ${fmt(p.lebar, 'm')}`}</option>)}
      </select>
      <span className="small muted">Luas rata-rata <b>{fmtN(r.luasRata, 3)} m²</b> → block stack / pallet floor · tebal terbesar <b>{fmt(r.tebalMaks, 'mm')}</b> → racking{r.adaTinggi && <> · tinggi produk terbesar <b>{fmt(r.tinggiProdukMaks, 'mm')}</b> → bukaan rak (Product)</>} · default produk <b>{r.dominan.nama || '—'}</b></span>
    </div>
    {r.adaTinggi && r.cbmRata > 0 && onCbmPerPalet && Math.abs((cbmPerPalet ?? 0) - r.cbmRata) > 0.005 && <p className="notice small" style={{ margin: 0 }}>
      CBM muatan per palet dari ukuran palet × tinggi produk = <b>{fmtN(r.cbmRata, 2)} CBM</b>, sedangkan Parameter muatan (tab Volume) memakai <b>{fmtN(cbmPerPalet ?? 0, 2)} CBM</b>.{' '}
      <button type="button" className="ghost" onClick={() => onCbmPerPalet(Math.round(r.cbmRata * 1000) / 1000)}>Pakai {fmtN(r.cbmRata, 2)} CBM per palet</button></p>}
  </div>;
}
