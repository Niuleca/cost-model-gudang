'use client';
import { useState } from 'react';
import TableEditor, { type Kolom } from '@/components/TableEditor';
import { useProfile } from '@/lib/useProfile';
import type { AppRole } from '@/lib/format';

const KAT_HARGA = ['Gudang','MHE','Racking','Palet','Office','ATK','Rental Office','IT','Software','HSE','Konstruksi','Pest Control','Asuransi','Security','Cleaning','Utilitas','Lainnya'];
const ROLES: AppRole[] = ['procurement','it','engineering','operations','hr','finance','commercial','solution_design','admin'];

interface Tab {
  id: string; label: string; pemilik: string; table: string; view?: string; idKey?: string;
  kolom: Kolom[]; editorRoles: AppRole[]; approval?: boolean; orderBy?: { col: string; asc?: boolean }[];
  cari?: string[]; catatan?: string; defaults?: Record<string, unknown>;
}

const TABS: Tab[] = [
  { id: 'umk', label: 'UMK / UMP', pemilik: 'HR', table: 'umk', editorRoles: ['hr'],
    orderBy: [{ col: 'provinsi' }, { col: 'kab_kota' }], cari: ['provinsi', 'kab_kota', 'status_verifikasi'],
    catatan: 'Nilai UMK kosong = mengikuti UMP provinsi. Status "Asumsi ikut UMP" wajib diverifikasi ke SK sebelum quotation final.',
    defaults: { tahun: 2026 },
    kolom: [
      { key: 'tahun', label: 'Tahun', type: 'number', width: 70 },
      { key: 'provinsi', label: 'Provinsi' }, { key: 'kab_kota', label: 'Kabupaten/Kota' },
      { key: 'jenis', label: 'Jenis', type: 'select', options: ['Kabupaten', 'Kota'] },
      { key: 'nilai_umk', label: 'UMK (Rp)', type: 'number' },
      { key: 'status_verifikasi', label: 'Verifikasi', type: 'select', options: ['SK resmi', 'Media + no. SK', 'Media', 'Asumsi ikut UMP'] },
      { key: 'dasar_hukum', label: 'Dasar hukum' }, { key: 'sumber', label: 'Sumber' }, { key: 'catatan', label: 'Catatan' },
    ] },
  { id: 'ump', label: 'UMP Provinsi', pemilik: 'HR', table: 'ump', editorRoles: ['hr'], orderBy: [{ col: 'provinsi' }],
    defaults: { tahun: 2026 },
    kolom: [
      { key: 'tahun', label: 'Tahun', type: 'number', width: 70 }, { key: 'provinsi', label: 'Provinsi' },
      { key: 'nilai', label: 'UMP (Rp)', type: 'number' }, { key: 'dasar_hukum', label: 'Dasar hukum' },
      { key: 'sumber', label: 'Sumber' }, { key: 'catatan', label: 'Catatan' },
    ] },
  { id: 'jabatan', label: 'Jabatan', pemilik: 'HR', table: 'job_levels', editorRoles: ['hr', 'solution_design'], approval: true,
    orderBy: [{ col: 'klasifikasi' }, { col: 'role_name' }],
    catatan: 'Upah = UMK lokasi × faktor. Outsourcing = kena contingency 7% dan fee OS.',
    kolom: [
      { key: 'role_name', label: 'Jabatan' },
      { key: 'klasifikasi', label: 'Klasifikasi', type: 'select', options: ['Blue Collar', 'White Collar'] },
      { key: 'faktor_umk', label: 'Faktor × UMK', type: 'number', width: 80 },
      { key: 'tunjangan_bulan', label: 'Tunjangan/bln', type: 'number' },
      { key: 'is_outsourcing', label: 'Outsourcing', type: 'bool' }, { key: 'sumber', label: 'Sumber' },
    ] },
  { id: 'payroll', label: 'Komponen OS', pemilik: 'HR', table: 'payroll_params', idKey: 'key', editorRoles: ['hr', 'solution_design'], approval: true,
    orderBy: [{ col: 'key' }],
    catatan: 'Persentase diisi dalam %. Batas upah diisi dalam Rupiah (kolom nilai).',
    kolom: [
      { key: 'key', label: 'Kode', readonly: true }, { key: 'label', label: 'Komponen' },
      { key: 'nilai', label: 'Nilai', type: 'number' }, { key: 'dasar_hukum', label: 'Dasar hukum' }, { key: 'catatan', label: 'Catatan' },
    ] },
  { id: 'harga', label: 'Harga item', pemilik: 'Procurement / IT / Engineering', table: 'price_items', view: 'price_items_status', editorRoles: ['procurement', 'it', 'engineering'],
    approval: true, orderBy: [{ col: 'kategori' }, { col: 'item' }], cari: ['kategori', 'item', 'vendor', 'sumber'],
    catatan: 'Isi vendor, tanggal harga, dan masa berlaku. Harga yang lewat masa berlaku otomatis berstatus expired dan muncul sebagai red flag di tender.',
    kolom: [
      { key: 'kategori', label: 'Kategori', type: 'select', options: KAT_HARGA }, { key: 'item', label: 'Item', width: 240 },
      { key: 'satuan', label: 'Satuan', width: 90 },
      { key: 'harga_beli', label: 'Harga beli', type: 'number' }, { key: 'harga_sewa_bulan', label: 'Sewa/bln', type: 'number' },
      { key: 'umur_ekonomis_bulan', label: 'Umur (bln)', type: 'number', width: 70 }, { key: 'daya_watt', label: 'Watt', type: 'number', width: 70 },
      { key: 'vendor', label: 'Vendor' }, { key: 'tanggal_harga', label: 'Tgl harga', type: 'date' }, { key: 'berlaku_sampai', label: 'Berlaku s.d.', type: 'date' },
      { key: 'owner_role', label: 'Pemilik', type: 'select', options: ROLES }, { key: 'sumber', label: 'Sumber', width: 220 },
    ] },
  { id: 'produktivitas', label: 'Produktivitas', pemilik: 'Operations', table: 'productivity', editorRoles: ['operations', 'solution_design'], approval: true,
    orderBy: [{ col: 'tahap' }, { col: 'aktivitas' }], cari: ['aktivitas', 'tahap', 'tool', 'role_name', 'uom', 'industri'],
    catatan: 'Hasil time motion study atau benchmark. Kelas berat: light / medium / heavy cargo.',
    kolom: [
      { key: 'tahap', label: 'Tahap' }, { key: 'aktivitas', label: 'Aktivitas', width: 240 }, { key: 'tool', label: 'Tool', width: 90 },
      { key: 'role_name', label: 'Role' },
      { key: 'uom', label: 'UoM', type: 'select', options: ['pcs', 'bag', 'karton', 'palet', 'ton', 'cbm', 'order', 'lokasi', 'line'] },
      { key: 'kelas_berat', label: 'Kelas berat', type: 'select', options: ['semua', 'light', 'medium', 'heavy'] },
      { key: 'industri', label: 'Industri' }, { key: 'prod_per_jam', label: 'Prod/jam', type: 'number', width: 80 },
      { key: 'metode', label: 'Metode', type: 'select', options: ['Time Motion Study', 'Benchmark', 'Asumsi'] },
      { key: 'sumber', label: 'Sumber' }, { key: 'tanggal', label: 'Tanggal', type: 'date' },
    ] },
  { id: 'kalender', label: 'Kalender libur', pemilik: 'Operations', table: 'holidays', idKey: 'tanggal', editorRoles: ['operations', 'hr'],
    orderBy: [{ col: 'tanggal' }],
    kolom: [
      { key: 'tanggal', label: 'Tanggal', type: 'date' }, { key: 'nama', label: 'Nama' },
      { key: 'jenis', label: 'Jenis', type: 'select', options: ['Libur Nasional', 'Cuti Bersama'] }, { key: 'sumber', label: 'Sumber' },
    ] },
  { id: 'listrik', label: 'Tarif listrik', pemilik: 'Engineering', table: 'electricity_tariffs', editorRoles: ['engineering'], approval: true,
    orderBy: [{ col: 'golongan' }],
    kolom: [
      { key: 'golongan', label: 'Golongan' }, { key: 'daya_min_va', label: 'Daya min (VA)', type: 'number' },
      { key: 'daya_max_va', label: 'Daya maks (VA)', type: 'number' }, { key: 'tarif_kwh', label: 'Tarif/kWh', type: 'number' },
      { key: 'berlaku_mulai', label: 'Berlaku mulai', type: 'date' }, { key: 'sumber', label: 'Sumber' },
    ] },
  { id: 'keuangan', label: 'Parameter keuangan', pemilik: 'Finance', table: 'finance_params', idKey: 'key', editorRoles: ['finance'],
    orderBy: [{ col: 'key' }],
    kolom: [{ key: 'key', label: 'Kode', readonly: true }, { key: 'label', label: 'Parameter' }, { key: 'nilai', label: 'Nilai', type: 'number' }, { key: 'catatan', label: 'Catatan' }] },
  { id: 'margin', label: 'Margin per risiko', pemilik: 'Finance', table: 'margin_policy', idKey: 'kategori_risiko', editorRoles: ['finance'],
    orderBy: [{ col: 'margin' }],
    kolom: [{ key: 'kategori_risiko', label: 'Kategori risiko', readonly: true }, { key: 'margin', label: 'Margin', type: 'percent' }, { key: 'keterangan', label: 'Berlaku untuk', width: 320 }] },
  { id: 'tc', label: 'Template T&C', pemilik: 'Commercial', table: 'tc_templates', editorRoles: ['commercial'],
    orderBy: [{ col: 'nama' }],
    catatan: 'Placeholder {payment_term} dan {durasi} otomatis diganti saat quotation dibuat.',
    kolom: [{ key: 'nama', label: 'Nama' }, { key: 'isi', label: 'Isi', type: 'textarea', width: 480 }, { key: 'aktif', label: 'Aktif', type: 'bool' }] },
];

export default function MasterPage() {
  const { profile } = useProfile();
  const [tab, setTab] = useState(TABS[0].id);
  const t = TABS.find(x => x.id === tab)!;
  return (
    <>
      <div className="head">
        <div><div className="eyebrow">UC1–UC9 · Master data</div><h1>Master data</h1></div>
        <span className="small muted">Pemilik tab ini: <b>{t.pemilik}</b>. Approve oleh Solution Design.</span>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(x => <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>{x.label}</button>)}
      </div>
      <TableEditor key={t.id} table={t.table} view={t.view} idKey={t.idKey} kolom={t.kolom} editorRoles={t.editorRoles}
        approval={t.approval} orderBy={t.orderBy} cari={t.cari} catatan={t.catatan} defaults={t.defaults} profile={profile} />
    </>
  );
}
