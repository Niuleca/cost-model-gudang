-- ============================================================
-- SETUP LENGKAP: jalankan SEKALI di Supabase → SQL Editor → New query → Run
-- Berisi: skema (0001), keamanan/RLS (0002), tahap 1 (0003), data awal (seed, katalog IT)
-- ============================================================
-- =====================================================================
-- Cost Model Gudang — skema database (Supabase / PostgreSQL)
-- Mengikuti use case Esa: master data (UC1–UC9) → tender (UC10–UC16)
-- → komersial (UC17–UC19) → pendukung (UC20–UC21)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Role pengguna (aktor use case) ----------
create type public.app_role as enum (
  'admin', 'solution_design', 'commercial', 'finance',
  'hr', 'procurement', 'it', 'engineering', 'operations'
);

create type public.data_status as enum ('draft', 'approved', 'rejected', 'expired');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  role        public.app_role not null default 'solution_design',
  created_at  timestamptz not null default now()
);

-- Profil otomatis dibuat saat user mendaftar
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_role_is(variadic roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any(roles));
$$;

-- Kolom audit standar untuk master data
-- (sumber, tanggal harga, masa berlaku, status approval UC9)

-- =====================================================================
-- MASTER DATA
-- =====================================================================

-- UC1 · HR — UMP & UMK
create table public.ump (
  id          bigint generated always as identity primary key,
  tahun       int not null,
  provinsi    text not null,
  nilai       numeric(14,2) not null check (nilai > 0),
  dasar_hukum text,
  sumber      text,
  catatan     text,
  unique (tahun, provinsi)
);

create table public.umk (
  id                bigint generated always as identity primary key,
  tahun             int not null,
  provinsi          text not null,
  kab_kota          text not null,
  jenis             text not null check (jenis in ('Kabupaten','Kota')),
  nilai_umk         numeric(14,2),           -- null = mengikuti UMP
  status_verifikasi text not null default 'Media',
  dasar_hukum       text,
  sumber            text,
  catatan           text,
  unique (tahun, provinsi, kab_kota)
);

-- Upah minimum yang berlaku = UMK kalau ada, kalau tidak UMP provinsi
create view public.upah_minimum_berlaku with (security_invoker = true) as
select k.id, k.tahun, k.provinsi, k.kab_kota, k.jenis,
       coalesce(k.nilai_umk, u.nilai) as upah_berlaku,
       case when k.nilai_umk is null then 'Mengikuti UMP' else 'UMK sendiri' end as dasar_penetapan,
       u.nilai as ump, k.status_verifikasi, k.dasar_hukum, k.sumber, k.catatan
from public.umk k
join public.ump u on u.tahun = k.tahun and u.provinsi = k.provinsi;

-- UC1/UC2 · HR — level jabatan (faktor x UMK) dan komponen biaya OS
create table public.job_levels (
  id            bigint generated always as identity primary key,
  role_name     text not null unique,          -- mis. 'Operator Forklift', 'Checker'
  klasifikasi   text not null check (klasifikasi in ('Blue Collar','White Collar')),
  faktor_umk    numeric(6,3) not null default 1, -- upah = UMK x faktor
  tunjangan_bulan numeric(14,2) not null default 0,
  is_outsourcing boolean not null default true,
  status        public.data_status not null default 'draft',
  sumber        text,
  updated_at    timestamptz not null default now()
);

create table public.payroll_params (
  key         text primary key,                -- mis. 'bpjs_jht'
  label       text not null,
  nilai       numeric(18,6) not null,          -- pecahan (0.037 = 3,7%) atau Rupiah untuk batas upah
  dasar_hukum text,
  catatan     text,
  status      public.data_status not null default 'draft',
  updated_at  timestamptz not null default now()
);

-- UC4/UC5/UC6 · Procurement, IT, Engineering — harga item
create type public.price_category as enum (
  'Gudang', 'MHE', 'Racking', 'Palet', 'Office', 'ATK', 'Rental Office',
  'IT', 'Software', 'HSE', 'Konstruksi', 'Pest Control', 'Asuransi',
  'Security', 'Cleaning', 'Utilitas', 'Seragam', 'Konsumsi', 'Printer', 'Lainnya'
);

create table public.price_items (
  id                 bigint generated always as identity primary key,
  kategori           public.price_category not null,
  item               text not null,
  satuan             text not null default 'unit',
  harga_beli         numeric(16,2),
  harga_sewa_bulan   numeric(16,2),
  umur_ekonomis_bulan int,
  daya_watt          numeric(10,2),             -- untuk hitung listrik (UC6)
  vendor             text,
  sumber             text,
  tanggal_harga      date,
  berlaku_sampai     date,
  owner_role         public.app_role not null default 'procurement',
  status             public.data_status not null default 'draft',
  approved_by        uuid references auth.users(id),
  approved_at        timestamptz,
  created_by         uuid references auth.users(id) default auth.uid(),
  updated_at         timestamptz not null default now(),
  check (harga_beli is not null or harga_sewa_bulan is not null)
);
create index on public.price_items (kategori, status);

-- UC6 · Engineering — tarif listrik per golongan
create table public.electricity_tariffs (
  id          bigint generated always as identity primary key,
  golongan    text not null unique,      -- mis. 'B-2', 'B-3', 'I-3'
  daya_min_va numeric(14,0) not null,
  daya_max_va numeric(14,0),
  tarif_kwh   numeric(10,2) not null,
  sumber      text,
  berlaku_mulai date,
  status      public.data_status not null default 'draft'
);

-- UC7 · Operations — produktivitas (time motion study / benchmark)
create table public.productivity (
  id            bigint generated always as identity primary key,
  aktivitas     text not null,
  tahap         text not null,     -- Inbound, Putaway, Storage, Replenishment, Picking, Outbound, VAS, Admin, Inventory
  tool          text not null default 'Manual',
  role_name     text not null,     -- harus ada di job_levels
  uom           text not null check (uom in ('pcs','bag','karton','palet','ton','cbm','order','lokasi','line')),
  kelas_berat   text not null default 'semua' check (kelas_berat in ('light','medium','heavy','semua')),
  industri      text not null default 'Umum',
  prod_per_jam  numeric(12,3) not null check (prod_per_jam > 0),
  metode        text not null default 'Benchmark' check (metode in ('Time Motion Study','Benchmark','Asumsi')),
  sumber        text,
  tanggal       date,
  status        public.data_status not null default 'draft',
  updated_at    timestamptz not null default now(),
  unique (aktivitas, tool, uom, kelas_berat, industri)
);

-- UC8 · Operations — kalender libur
create table public.holidays (
  tanggal   date primary key,
  nama      text not null,
  jenis     text not null default 'Libur Nasional' check (jenis in ('Libur Nasional','Cuti Bersama')),
  sumber    text
);

-- Kebijakan margin per kategori risiko (UC17, milik Finance)
create table public.margin_policy (
  kategori_risiko text primary key,      -- 'Rendah','Sedang','Tinggi'
  margin          numeric(6,4) not null, -- 0.10 = 10%
  keterangan      text,
  updated_at      timestamptz not null default now()
);

-- Parameter keuangan umum (Finance)
create table public.finance_params (
  key     text primary key,
  label   text not null,
  nilai   numeric(12,6) not null,
  catatan text
);

-- =====================================================================
-- TENDER (UC10–UC16)
-- =====================================================================
create type public.tender_status as enum ('draft','dihitung','review','approved','quotation_terkirim','negosiasi','menang','kalah','drop','batal','implementasi','go_live','selesai');

create table public.tenders (
  id                uuid primary key default gen_random_uuid(),
  kode              text unique,
  customer          text not null,
  industri          text,
  provinsi          text not null,
  kab_kota          text not null,
  alamat_lokasi     text,
  tipe_gudang       text not null default 'Ambient',
  skema             text not null default 'Dedicated' check (skema in ('Dedicated','Shared')),
  skenario_aset     text not null default 'Rental' check (skenario_aset in ('Rental','Own Asset','Built-to-Suit')),
  durasi_kontrak_bulan int not null default 12 check (durasi_kontrak_bulan > 0),
  tanggal_go_live   date,
  jumlah_shift      int not null default 1 check (jumlah_shift between 1 and 3),
  jam_kerja_per_shift numeric(5,2) not null default 8,
  jam_efektif_per_shift numeric(5,2) not null default 6.5,
  hari_kerja_per_minggu int not null default 5 check (hari_kerja_per_minggu between 5 and 7),
  payment_term_hari int not null default 30,
  -- semua input lain yang tidak perlu kolom sendiri (space, fasilitas, pilihan item)
  asumsi            jsonb not null default '{}'::jsonb,
  hasil             jsonb,                   -- snapshot hasil mesin hitung
  status            public.tender_status not null default 'draft',
  versi             int not null default 1,
  created_by        uuid references auth.users(id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Seluruh input tender (volume rata-rata/peak/komitmen, aktivitas VSM, space, MHE,
-- baris biaya, listrik) disimpan di tenders.asumsi (jsonb) mengikuti tipe TenderInput
-- di src/lib/engine/types.ts. Snapshot hasil hitung di tenders.hasil.

-- UC20 · versi & histori
create table public.tender_versions (
  id          bigint generated always as identity primary key,
  tender_id   uuid not null references public.tenders(id) on delete cascade,
  versi       int not null,
  snapshot    jsonb not null,
  catatan     text,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (tender_id, versi)
);

-- =====================================================================
-- QUOTATION (UC18–UC19)
-- =====================================================================
create table public.quotations (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tenders(id) on delete cascade,
  nomor           text unique not null,
  tanggal         date not null default current_date,
  berlaku_sampai  date not null default (current_date + 30),
  kepada          text,
  rate_card       jsonb not null,           -- baris tarif yang dikirim ke customer
  term_condition  text not null,
  status          text not null default 'draft' check (status in ('draft','approved','terkirim','batal')),
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  created_by      uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now()
);

-- Template T&C default (milik Commercial)
create table public.tc_templates (
  id        bigint generated always as identity primary key,
  nama      text not null unique,
  isi       text not null,
  aktif     boolean not null default true
);

-- updated_at otomatis
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger t_price_items_upd before update on public.price_items for each row execute function public.touch_updated_at();
create trigger t_productivity_upd before update on public.productivity for each row execute function public.touch_updated_at();
create trigger t_job_levels_upd before update on public.job_levels for each row execute function public.touch_updated_at();
create trigger t_tenders_upd before update on public.tenders for each row execute function public.touch_updated_at();

-- Harga yang lewat masa berlaku dianggap kedaluwarsa (dipakai red flag)
create view public.price_items_status with (security_invoker = true) as
select p.*,
       case when p.status = 'approved' and p.berlaku_sampai is not null and p.berlaku_sampai < current_date
            then 'expired' else p.status::text end as status_efektif
from public.price_items p;
-- =====================================================================
-- Keamanan per baris (Row Level Security)
-- Prinsip: semua user login boleh BACA master data.
-- Tulis master data hanya oleh departemen pemiliknya (+ admin).
-- Approve master data (UC9) hanya Solution Design / admin.
-- Tender & quotation: Solution Design, Commercial, Finance, admin.
-- =====================================================================

alter table public.profiles            enable row level security;
alter table public.ump                 enable row level security;
alter table public.umk                 enable row level security;
alter table public.job_levels          enable row level security;
alter table public.payroll_params      enable row level security;
alter table public.price_items         enable row level security;
alter table public.electricity_tariffs enable row level security;
alter table public.productivity        enable row level security;
alter table public.holidays            enable row level security;
alter table public.margin_policy       enable row level security;
alter table public.finance_params      enable row level security;
alter table public.tenders             enable row level security;
alter table public.tender_versions     enable row level security;
alter table public.quotations          enable row level security;
alter table public.tc_templates        enable row level security;

-- profiles
create policy "profil: baca semua" on public.profiles for select to authenticated using (true);
create or replace function public.my_role() returns public.app_role
  language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create policy "profil: ubah diri sendiri (bukan role)" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());
create policy "profil: admin kelola" on public.profiles for all to authenticated
  using (public.current_role_is('admin')) with check (public.current_role_is('admin'));

-- helper macro via repeated policies --------------------------------------
-- Baca untuk semua user login
create policy "baca" on public.ump                 for select to authenticated using (true);
create policy "baca" on public.umk                 for select to authenticated using (true);
create policy "baca" on public.job_levels          for select to authenticated using (true);
create policy "baca" on public.payroll_params      for select to authenticated using (true);
create policy "baca" on public.price_items         for select to authenticated using (true);
create policy "baca" on public.electricity_tariffs for select to authenticated using (true);
create policy "baca" on public.productivity        for select to authenticated using (true);
create policy "baca" on public.holidays            for select to authenticated using (true);
create policy "baca" on public.margin_policy       for select to authenticated using (true);
create policy "baca" on public.finance_params      for select to authenticated using (true);
create policy "baca" on public.tc_templates        for select to authenticated using (true);

-- Tulis per pemilik
create policy "tulis HR" on public.ump for all to authenticated
  using (public.current_role_is('hr','admin')) with check (public.current_role_is('hr','admin'));
create policy "tulis HR" on public.umk for all to authenticated
  using (public.current_role_is('hr','admin')) with check (public.current_role_is('hr','admin'));
create policy "tulis HR" on public.job_levels for all to authenticated
  using (public.current_role_is('hr','admin','solution_design')) with check (public.current_role_is('hr','admin','solution_design'));
create policy "tulis HR" on public.payroll_params for all to authenticated
  using (public.current_role_is('hr','admin','solution_design')) with check (public.current_role_is('hr','admin','solution_design'));

-- price_items: pemilik sesuai owner_role; SD/admin boleh approve (ubah status)
create policy "tulis pemilik harga" on public.price_items for insert to authenticated
  with check (public.current_role_is('admin') or public.current_role_is(owner_role));
create policy "ubah pemilik/approver harga" on public.price_items for update to authenticated
  using (public.current_role_is('admin','solution_design') or public.current_role_is(owner_role))
  with check (public.current_role_is('admin','solution_design') or public.current_role_is(owner_role));
create policy "hapus pemilik harga" on public.price_items for delete to authenticated
  using (public.current_role_is('admin') or (public.current_role_is(owner_role) and status = 'draft'));

create policy "tulis Engineering" on public.electricity_tariffs for all to authenticated
  using (public.current_role_is('engineering','admin')) with check (public.current_role_is('engineering','admin'));
create policy "tulis Ops" on public.productivity for all to authenticated
  using (public.current_role_is('operations','admin','solution_design')) with check (public.current_role_is('operations','admin','solution_design'));
create policy "tulis Ops" on public.holidays for all to authenticated
  using (public.current_role_is('operations','admin','hr')) with check (public.current_role_is('operations','admin','hr'));
create policy "tulis Finance" on public.margin_policy for all to authenticated
  using (public.current_role_is('finance','admin')) with check (public.current_role_is('finance','admin'));
create policy "tulis Finance" on public.finance_params for all to authenticated
  using (public.current_role_is('finance','admin')) with check (public.current_role_is('finance','admin'));
create policy "tulis Commercial" on public.tc_templates for all to authenticated
  using (public.current_role_is('commercial','admin')) with check (public.current_role_is('commercial','admin'));

-- Tender & turunannya
create policy "tender: tim tender" on public.tenders for all to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'))
  with check (public.current_role_is('solution_design','commercial','finance','admin'));

create policy "tender anak: tim tender" on public.tender_versions for all to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'))
  with check (public.current_role_is('solution_design','commercial','finance','admin'));

create policy "quotation: tim tender" on public.quotations for all to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'))
  with check (public.current_role_is('solution_design','commercial','finance','admin'));

-- Approval quotation hanya Commercial/Finance/admin (UC19)
create or replace function public.guard_quotation_approval() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('approved','terkirim') and old.status = 'draft'
     and not public.current_role_is('commercial','finance','admin') then
    raise exception 'Hanya Commercial/Finance yang boleh approve quotation';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  return new;
end $$;
create trigger t_quotation_approval before update on public.quotations
  for each row execute function public.guard_quotation_approval();

-- Approval master data harga hanya SD/admin (UC9)
create or replace function public.guard_price_approval() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected')
     and not public.current_role_is('solution_design','admin') then
    raise exception 'Hanya Solution Design yang boleh approve/reject master data';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  return new;
end $$;
create trigger t_price_approval before update on public.price_items
  for each row execute function public.guard_price_approval();

-- Approval master data lain (jabatan, komponen OS, produktivitas, tarif listrik) hanya SD/admin
create or replace function public.guard_status_approval() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected')
     and not public.current_role_is('solution_design','admin') then
    raise exception 'Hanya Solution Design yang boleh approve/reject master data';
  end if;
  return new;
end $$;
create trigger t_job_levels_approval before update on public.job_levels for each row execute function public.guard_status_approval();
create trigger t_payroll_params_approval before update on public.payroll_params for each row execute function public.guard_status_approval();
create trigger t_productivity_approval before update on public.productivity for each row execute function public.guard_status_approval();
create trigger t_tariff_approval before update on public.electricity_tariffs for each row execute function public.guard_status_approval();
create policy "approve SD" on public.electricity_tariffs for update to authenticated
  using (public.current_role_is('solution_design')) with check (public.current_role_is('solution_design'));
-- =====================================================================
-- Tahap 1: master gudang + foto, MHE tipe/tonase, katalog IT (format BAP),
-- benchmark produktivitas per industri, status project + log, revisi
-- quotation, list implementasi, audit log, view perbandingan & dashboard.
-- =====================================================================

-- ---------- Kategori harga tambahan ----------
alter type public.price_category add value if not exists 'Seragam';
alter type public.price_category add value if not exists 'Konsumsi';
alter type public.price_category add value if not exists 'Printer';

-- ---------- MHE: tipe, tonase, tenaga ----------
alter table public.price_items
  add column if not exists mhe_tipe text check (mhe_tipe in ('Counter Balance','Reach Truck','Pallet Mover','Hand Pallet','Stacker','VNA','Order Picker','Clamp','Lainnya')),
  add column if not exists kapasitas_ton numeric(6,2),
  add column if not exists sumber_tenaga text check (sumber_tenaga in ('Electric','Diesel','LPG','Manual')),
  add column if not exists tinggi_angkat_m numeric(6,2),
  add column if not exists spesifikasi text;

-- View status harga diperluas dengan kolom MHE (create or replace, kolom baru di akhir — tanpa drop)
create or replace view public.price_items_status with (security_invoker = true) as
select p.id, p.kategori, p.item, p.satuan, p.harga_beli, p.harga_sewa_bulan, p.umur_ekonomis_bulan, p.daya_watt,
       p.vendor, p.sumber, p.tanggal_harga, p.berlaku_sampai, p.owner_role, p.status, p.approved_by, p.approved_at,
       p.created_by, p.updated_at,
       case when p.status = 'approved' and p.berlaku_sampai is not null and p.berlaku_sampai < current_date
            then 'expired' else p.status::text end as status_efektif,
       p.mhe_tipe, p.kapasitas_ton, p.sumber_tenaga, p.tinggi_angkat_m, p.spesifikasi
from public.price_items p;

-- ---------- Master gudang (Procurement) ----------
create table public.warehouses (
  id                 uuid primary key default gen_random_uuid(),
  nama               text not null,
  pemilik            text,
  provinsi           text not null,
  kab_kota           text not null,
  alamat             text,
  gmaps_url          text,
  latitude           numeric(9,6),
  longitude          numeric(9,6),
  luas_m2            numeric(12,2) not null check (luas_m2 > 0),
  harga_sewa_m2_bulan numeric(14,2),
  harga_per_bulan    numeric(16,2),
  tinggi_bersih_m    numeric(6,2),
  daya_lantai_ton_m2 numeric(6,2),
  jumlah_dock        int,
  daya_listrik_kva   numeric(10,2),
  tipe               text not null default 'Ambient',
  fasilitas          text,                    -- office, toilet, mushola, parkir truk, dll
  foto               text[] not null default '{}', -- path di Storage bucket 'warehouse-photos'
  kontak             text,
  sumber             text,
  tanggal_harga      date,
  berlaku_sampai     date,
  status             public.data_status not null default 'draft',
  created_by         uuid references auth.users(id) default auth.uid(),
  updated_at         timestamptz not null default now(),
  check (harga_sewa_m2_bulan is not null or harga_per_bulan is not null)
);
create trigger t_warehouses_upd before update on public.warehouses for each row execute function public.touch_updated_at();

-- ---------- Katalog IT (format BAP KLOG) ----------
create table public.it_catalog (
  id          bigint generated always as identity primary key,
  kelompok    text not null,      -- Software - WMS Solution, Hardware & Device, Networking Cabling, ...
  item        text not null,
  deskripsi   text,
  cost_type   text not null,      -- PUPM, PDPM, OTC/Unit, OTC, Transaction/Month, Cost/Month, Yearly, Cost/Mandays, Monthly/Site ...
  basis       text not null check (basis in ('Bulanan','Transaksi','Tahunan','Sekali')),
  harga       numeric(16,2) not null check (harga >= 0),
  slab_min    numeric(14,0),
  slab_max    numeric(14,0),
  urutan      int not null default 0,
  sumber      text,
  tanggal_harga date,
  berlaku_sampai date,
  status      public.data_status not null default 'draft',
  updated_at  timestamptz not null default now(),
  unique (kelompok, item)
);
create trigger t_it_catalog_upd before update on public.it_catalog for each row execute function public.touch_updated_at();

-- ---------- Produktivitas: benchmark per industri ----------
alter table public.productivity
  add column if not exists benchmark jsonb not null default '{}'::jsonb,   -- {"Retail-Consumer":"30-40", ...}
  add column if not exists catatan text,
  add column if not exists detik_per_uom numeric(12,2) generated always as (round(3600 / prod_per_jam, 2)) stored;

-- ---------- Status project ----------
alter type public.tender_status add value if not exists 'negosiasi';
alter type public.tender_status add value if not exists 'drop';
alter type public.tender_status add value if not exists 'implementasi';
alter type public.tender_status add value if not exists 'go_live';
alter type public.tender_status add value if not exists 'selesai';

alter table public.tenders
  add column if not exists warehouse_id uuid references public.warehouses(id),
  add column if not exists pic text,
  add column if not exists alasan_hasil text,          -- alasan menang / kalah / drop
  add column if not exists tanggal_keputusan date;

create table public.tender_status_log (
  id          bigint generated always as identity primary key,
  tender_id   uuid not null references public.tenders(id) on delete cascade,
  dari        text,
  ke          text not null,
  catatan     text,
  oleh        uuid references auth.users(id) default auth.uid(),
  waktu       timestamptz not null default now()
);
create or replace function public.log_tender_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.tender_status_log (tender_id, dari, ke, catatan) values (new.id, null, new.status::text, 'Tender dibuat');
  elsif new.status is distinct from old.status then
    insert into public.tender_status_log (tender_id, dari, ke, catatan) values (new.id, old.status::text, new.status::text, new.alasan_hasil);
  end if;
  return new;
end $$;
create trigger t_tender_status_log after insert or update of status on public.tenders
  for each row execute function public.log_tender_status();

-- ---------- Quotation: revisi ----------
alter table public.quotations
  add column if not exists revisi int not null default 0,
  add column if not exists parent_id uuid references public.quotations(id),
  add column if not exists catatan_revisi text,
  add column if not exists tagihan_sekali jsonb not null default '[]'::jsonb,   -- one-time charge (IT, setup)
  add column if not exists info_gudang jsonb;                                  -- snapshot gudang untuk PDF
alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations add constraint quotations_status_check check (status in ('draft','approved','terkirim','direvisi','batal'));

-- ---------- List implementasi ----------
create table public.implementation_tasks (
  id          bigint generated always as identity primary key,
  tender_id   uuid not null references public.tenders(id) on delete cascade,
  fase        text not null,
  tugas       text not null,
  departemen  public.app_role,
  pic         text,
  mulai       date,
  target      date,
  selesai     date,
  status      text not null default 'Belum mulai' check (status in ('Belum mulai','Berjalan','Selesai','Terlambat','Blocked')),
  progress    int not null default 0 check (progress between 0 and 100),
  catatan     text,
  urutan      int not null default 0,
  updated_at  timestamptz not null default now()
);
create trigger t_impl_upd before update on public.implementation_tasks for each row execute function public.touch_updated_at();

-- Checklist standar implementasi gudang (dibuat saat tender menang)
create or replace function public.buat_checklist_implementasi(p_tender uuid, p_golive date default null)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if exists (select 1 from public.implementation_tasks where tender_id = p_tender) then return 0; end if;
  insert into public.implementation_tasks (tender_id, fase, tugas, departemen, target, urutan)
  select p_tender, f, t, d::public.app_role, case when p_golive is null then null else p_golive + h end, row_number() over ()
  from (values
    ('1. Persiapan','Kick-off meeting & project charter ditandatangani','solution_design',-60),
    ('1. Persiapan','Kontrak / PO customer diterima','commercial',-55),
    ('2. Fasilitas','Kontrak sewa gudang & serah terima','procurement',-45),
    ('2. Fasilitas','Fit-out: office, toilet, charging area, pencahayaan','engineering',-30),
    ('2. Fasilitas','Instalasi listrik & titik lampu sesuai hitungan','engineering',-30),
    ('2. Fasilitas','HSE: APAR, rambu, P3K, jalur evakuasi','engineering',-20),
    ('3. MHE & Racking','PO racking & instalasi','procurement',-30),
    ('3. MHE & Racking','Sewa/PO forklift & MHE lain','procurement',-20),
    ('4. IT & WMS','Jaringan, WiFi, CCTV terpasang','it',-20),
    ('4. IT & WMS','Konfigurasi WMS & master data SKU','it',-15),
    ('4. IT & WMS','Interface/EDI customer diuji (UAT)','it',-10),
    ('5. Manpower','Rekrutmen sesuai headcount cost model','hr',-20),
    ('5. Manpower','Training operator, K3, dan WMS','operations',-7),
    ('6. SOP & WI','SOP inbound, storage, outbound, return disetujui','operations',-10),
    ('6. SOP & WI','Work instruction & visual display di area','operations',-5),
    ('7. Go-live','Migrasi stok & stock opname awal','operations',0),
    ('7. Go-live','Go-live & hypercare 2 minggu','operations',14),
    ('8. Monitoring','KPI bulan pertama vs asumsi cost model (volume, produktivitas, biaya)','solution_design',30),
    ('8. Monitoring','Review profitabilitas aktual vs P&L tender','finance',60)
  ) as v(f, t, d, h);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Audit log (historis pekerjaan) ----------
create table public.audit_log (
  id        bigint generated always as identity primary key,
  tabel     text not null,
  row_id    text,
  aksi      text not null,
  ringkas   text,
  oleh      uuid default auth.uid(),
  waktu     timestamptz not null default now()
);
create index on public.audit_log (waktu desc);

create or replace function public.tulis_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb; label text;
begin
  r := to_jsonb(coalesce(new, old));
  label := coalesce(r->>'kode', r->>'nomor', r->>'item', r->>'nama', r->>'aktivitas', r->>'kab_kota', r->>'customer', r->>'tugas', '');
  insert into public.audit_log (tabel, row_id, aksi, ringkas)
  values (tg_table_name, coalesce(r->>'id', r->>'key', r->>'tanggal'), lower(tg_op),
          label || case when tg_op = 'UPDATE' and (to_jsonb(old)->>'status') is distinct from (to_jsonb(new)->>'status')
                        then ' · status ' || coalesce(to_jsonb(old)->>'status','') || ' → ' || coalesce(to_jsonb(new)->>'status','') else '' end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['tenders','quotations','price_items','warehouses','it_catalog','productivity','umk','job_levels','payroll_params','implementation_tasks','margin_policy']
  loop execute format('create trigger t_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.tulis_audit()', t); end loop;
end $$;

-- ---------- View: ringkasan tender untuk dashboard & perbandingan ----------
create view public.tender_overview with (security_invoker = true) as
select t.id, t.kode, t.customer, t.industri, t.provinsi, t.kab_kota, t.tipe_gudang, t.skema, t.skenario_aset,
       t.status::text as status, t.versi, t.created_at, t.updated_at, t.tanggal_keputusan, t.alasan_hasil,
       t.durasi_kontrak_bulan, t.jumlah_shift,
       (t.hasil->>'totalBiayaBulan')::numeric                         as biaya_bulan,
       (t.hasil->'simulasi'->0->>'pendapatanBulan')::numeric           as pendapatan_bulan,
       (t.hasil->'simulasi'->0->>'gpPersen')::numeric                  as gp_persen,
       (t.hasil->>'totalHeadcount')::int                               as headcount,
       (t.hasil->'space'->>'totalM2')::numeric                         as luas_m2,
       (t.hasil->'space'->>'ppDesain')::numeric                        as posisi_palet,
       (select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(t.hasil->'rateCard') r where r->>'bucket' = 'storage')      as tarif_storage,
       (select r->>'uom' from jsonb_array_elements(t.hasil->'rateCard') r where r->>'bucket' = 'storage')                         as uom_storage,
       (select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(t.hasil->'rateCard') r where r->>'bucket' = 'handling_in')  as tarif_handling_in,
       (select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(t.hasil->'rateCard') r where r->>'bucket' = 'handling_out') as tarif_handling_out,
       (select r->>'uom' from jsonb_array_elements(t.hasil->'rateCard') r where r->>'bucket' = 'handling_in')                     as uom_handling,
       (select count(*) from jsonb_array_elements(t.hasil->'redFlags') f where f->>'level' = 'kritis')                            as red_flag_kritis
from public.tenders t;

-- ---------- RLS tabel baru ----------
alter table public.warehouses enable row level security;
alter table public.it_catalog enable row level security;
alter table public.tender_status_log enable row level security;
alter table public.implementation_tasks enable row level security;
alter table public.audit_log enable row level security;

create policy "baca" on public.warehouses for select to authenticated using (true);
create policy "tulis Procurement" on public.warehouses for all to authenticated
  using (public.current_role_is('procurement','admin','solution_design')) with check (public.current_role_is('procurement','admin','solution_design'));
create policy "baca" on public.it_catalog for select to authenticated using (true);
create policy "tulis IT" on public.it_catalog for all to authenticated
  using (public.current_role_is('it','admin','solution_design')) with check (public.current_role_is('it','admin','solution_design'));
create policy "status log: tim tender" on public.tender_status_log for select to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'));
-- Implementasi: tim tender + departemen pelaksana boleh lihat & update tugasnya
create policy "implementasi: baca" on public.implementation_tasks for select to authenticated using (true);
create policy "implementasi: tim tender kelola" on public.implementation_tasks for all to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'))
  with check (public.current_role_is('solution_design','commercial','finance','admin'));
create policy "implementasi: departemen update tugasnya" on public.implementation_tasks for update to authenticated
  using (departemen = public.my_role()) with check (departemen = public.my_role());
create policy "audit: baca tim tender" on public.audit_log for select to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'));

create trigger t_warehouses_approval before update on public.warehouses for each row execute function public.guard_status_approval();
create trigger t_it_catalog_approval before update on public.it_catalog for each row execute function public.guard_status_approval();

-- ---------- Storage foto gudang (hanya di Supabase) ----------
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('warehouse-photos', 'warehouse-photos', true) on conflict (id) do nothing;
    execute $p$create policy "foto gudang: baca" on storage.objects for select to authenticated using (bucket_id = 'warehouse-photos')$p$;
    execute $p$create policy "foto gudang: upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'warehouse-photos' and public.current_role_is('procurement','admin','solution_design'))$p$;
    execute $p$create policy "foto gudang: hapus" on storage.objects for delete to authenticated
      using (bucket_id = 'warehouse-photos' and public.current_role_is('procurement','admin','solution_design'))$p$;
  end if;
end $$;

-- Departemen pelaksana boleh melihat tender yang punya tugas implementasi untuk mereka
create policy "tender: departemen pelaksana baca" on public.tenders for select to authenticated
  using (exists (select 1 from public.implementation_tasks it where it.tender_id = tenders.id and it.departemen = public.my_role()));

-- Quotation baru selalu draft (kecuali dibuat oleh Commercial/Finance/Admin)
create or replace function public.guard_quotation_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'draft' and not public.current_role_is('commercial','finance','admin') then
    new.status := 'draft';
  end if;
  if new.status = 'approved' then new.approved_by := auth.uid(); new.approved_at := now(); end if;
  return new;
end $$;
create trigger t_quotation_insert before insert on public.quotations for each row execute function public.guard_quotation_insert();
-- Seed data awal — dibangkitkan otomatis oleh build_seed.py. Status master data = 'draft' sampai di-approve Solution Design (UC9).
begin;
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 3932552.0, null, 'data.goodstats.id (Daftar UMK Aceh 2026)', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 3228971.0, 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 3182955.0, 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Riau', 3780495.85, null, 'ekonomi.bisnis.com 20251224/12/1939347', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Riau', 3879520.0, null, 'data.goodstats.id (UMK Kepri 2026)', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 3471497.0, 'Kepgub 1153/KEP.GUB/DISNAKERTRANS-3.3/2025', 'data.goodstats.id (UMK Jambi 2026)', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 3942963.0, 'Kepgub 963/KPTS/Disnakertrans/2025', 'dealls.com/pengembangan-karir/ump-sumatera-selatan', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Bangka Belitung', 4035000.0, 'Kepgub 100.3.3.1/654/DISNAKER/2025', 'dealls.com/ump-bangka-belitung; agitya.com 2026/08', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Bengkulu', 2827251.0, 'Kepgub K.646.DKKTRANS Tahun 2025', 'data.goodstats.id (UMK Bengkulu 2026)', 'hitungpajak.online menulis Rp2.827.250 (selisih Rp1)');
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 3047734.0, null, 'dealls.com/pengembangan-karir/ump-lampung', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'DKI Jakarta', 5729876.0, null, 'hitungpajak.online/umr', 'DKI tidak menetapkan UMK; seluruh wilayah memakai UMP');
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 2317601.0, null, 'hitungpajak.online/umr', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Banten', 3100881.0, null, 'hitungpajak.online/umr', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 2327386.0, null, 'hitungpajak.online/umr', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'DI Yogyakarta', 2417495.0, null, 'detik.com/jogja d-8275395', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 2446881.0, null, 'hitungpajak.online/umr', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Bali', 3207459.0, null, 'hitungpajak.online/umr', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Barat', 2673861.0, null, 'hitungpajak.online/umr', 'detik.com/bali d-8287566 menulis Rp2.673.898 — verifikasi ke SK');
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 2455898.0, 'Kepgub 528/HK/2025', 'detik.com/bali d-8287703', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 3054552.0, null, 'hitungpajak.online/umr', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 3686138.0, null, 'hitungpajak.online/umr', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 3725000.0, null, 'wageindicator.org (Kalimantan Selatan)', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Timur', 3762431.0, 'Pengumuman Gub 500.15.14.1/5097/DTKT.Srk-IV/2025', 'dealls.com/ump-kalimantan-timur', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Utara', 3775243.0, null, 'beraupost.jawapos.com; tribunkaltara', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 4002630.0, 'Kepgub 404 Tahun 2025', 'data.goodstats.id (UMK Sulut 2026)', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 3179565.0, 'Kepgub 500.15.14.1/485/dis.nakertrans-g.st/2025', 'dealls.com/ump-sulawesi-tengah', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 3921088.79, null, 'dealls.com/ump-sulawesi-selatan', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 3306496.18, 'Kepgub 110.3.3.1/581', 'dealls.com/ump-sulawesi-tenggara', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Gorontalo', 3405144.0, 'Kepgub 434/34/XII/2025', 'data.goodstats.id (UMK Gorontalo 2026)', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Barat', 3315934.0, null, 'wageindicator.org (West Sulawesi)', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 3334490.0, 'Kepgub 5430 Tahun 2025', 'data.goodstats.id (UMK Maluku 2026)', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Maluku Utara', 3552840.0, null, 'hitungpajak.online/umr', 'dealls.com menulis Rp3.510.240 (Kepgub 524/KPTS/MU/2025) — VERIFIKASI ke SK');
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Papua', 4436283.0, null, 'gajihub.com/blog/ump-papua', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat', 3841000.0, null, 'gajihub.com/blog/ump-papua', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat Daya', 3766000.0, null, 'gajihub.com/blog/ump-papua', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Papua Tengah', 4285848.0, null, 'gajihub.com/blog/ump-papua', 'Tidak naik dari 2025 (pertumbuhan ekonomi negatif)');
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Papua Selatan', 4508100.0, null, 'gajihub.com/blog/ump-papua', null);
insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, 'Papua Pegunungan', 4508714.0, null, 'data.goodstats.id (UMK Papua Pegunungan 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kota Banda Aceh', 'Kota', 4162965.0, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Aceh Tamiang', 'Kabupaten', 3978204.0, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kota Langsa', 'Kota', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kota Lhokseumawe', 'Kota', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kota Sabang', 'Kota', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kota Subulussalam', 'Kota', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Aceh Barat', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Aceh Barat Daya', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Aceh Besar', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Aceh Jaya', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Aceh Selatan', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Aceh Singkil', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Aceh Tengah', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Aceh Tenggara', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Aceh Timur', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Aceh Utara', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Bener Meriah', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Bireuen', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Gayo Lues', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Nagan Raya', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Pidie', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Pidie Jaya', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Aceh', 'Kabupaten Simeulue', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Aceh 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Mandailing Natal', 'Kabupaten', 3355900.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Tapanuli Selatan', 'Kabupaten', 3567941.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Tapanuli Tengah', 'Kabupaten', 3509004.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Tapanuli Utara', 'Kabupaten', 3307618.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Toba', 'Kabupaten', 3404422.49, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Labuhanbatu', 'Kabupaten', 3748181.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Asahan', 'Kabupaten', 3531361.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'fahum.umsu.ac.id menulis Rp3.531.403');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Simalungun', 'Kabupaten', 3351403.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Karo', 'Kabupaten', 3843153.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Deli Serdang', 'Kabupaten', 4041543.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Langkat', 'Kabupaten', 3402892.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Serdang Bedagai', 'Kabupaten', 3605983.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Batu Bara', 'Kabupaten', 3970000.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Padang Lawas', 'Kabupaten', 3478237.41, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Labuhanbatu Selatan', 'Kabupaten', 3690000.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Labuhanbatu Utara', 'Kabupaten', 3603415.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kota Sibolga', 'Kota', 3668667.5, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kota Tanjungbalai', 'Kota', 3496856.58, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kota Tebing Tinggi', 'Kota', 3229957.7, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kota Medan', 'Kota', 4335198.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kota Binjai', 'Kota', 3367913.55, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kota Padangsidimpuan', 'Kota', 3416803.0, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Dairi', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'Tidak punya dewan pengupahan, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Humbang Hasundutan', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'Tidak punya dewan pengupahan, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Samosir', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'Tidak punya dewan pengupahan, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Padang Lawas Utara', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'Tidak punya dewan pengupahan, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Pakpak Bharat', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'Tidak punya dewan pengupahan, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Nias', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'Tidak punya dewan pengupahan, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Nias Barat', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'Tidak punya dewan pengupahan, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Nias Utara', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'Tidak punya dewan pengupahan, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kabupaten Nias Selatan', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'Tidak punya dewan pengupahan, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kota Gunungsitoli', 'Kota', null, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'Tidak punya dewan pengupahan, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Utara', 'Kota Pematangsiantar', 'Kota', null, 'Media + no. SK', 'Kepgub 188.44/908/KPTS/2025', 'detik.com/sumut d-8278149', 'Tidak punya dewan pengupahan, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Agam', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Dharmasraya', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Kepulauan Mentawai', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Lima Puluh Kota', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Padang Pariaman', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Pasaman', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Pasaman Barat', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Pesisir Selatan', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Sijunjung', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Solok', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Solok Selatan', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kabupaten Tanah Datar', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kota Bukittinggi', 'Kota', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kota Padang', 'Kota', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kota Padang Panjang', 'Kota', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kota Pariaman', 'Kota', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kota Payakumbuh', 'Kota', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kota Sawahlunto', 'Kota', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Barat', 'Kota Solok', 'Kota', null, 'Media + no. SK', 'Kepgub 562-851-2025', 'data.goodstats.id (UMK Sumbar 2026)', 'Semua daerah Sumbar memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kota Dumai', 'Kota', 4431174.69, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kabupaten Bengkalis', 'Kabupaten', 4155317.75, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kabupaten Siak', 'Kabupaten', 4001327.33, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kota Pekanbaru', 'Kota', 3998179.46, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kabupaten Indragiri Hulu', 'Kabupaten', 3988406.31, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kabupaten Kuantan Singingi', 'Kabupaten', 3949466.98, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kabupaten Kampar', 'Kabupaten', 3898260.7, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kabupaten Pelalawan', 'Kabupaten', 3894260.58, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kabupaten Rokan Hulu', 'Kabupaten', 3819353.01, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kabupaten Rokan Hilir', 'Kabupaten', 3783052.9, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kabupaten Kepulauan Meranti', 'Kabupaten', null, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', 'Nilai sama dengan UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Riau', 'Kabupaten Indragiri Hilir', 'Kabupaten', null, 'Media', null, 'ekonomi.bisnis.com 20251224/12/1939347', 'Nilai sama dengan UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Riau', 'Kota Batam', 'Kota', 5357982.0, 'Media', null, 'data.goodstats.id (UMK Kepri 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Riau', 'Kabupaten Bintan', 'Kabupaten', 4583221.0, 'Media', null, 'data.goodstats.id (UMK Kepri 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Riau', 'Kabupaten Kepulauan Anambas', 'Kabupaten', 4279851.0, 'Media', null, 'data.goodstats.id (UMK Kepri 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Riau', 'Kabupaten Karimun', 'Kabupaten', 4241935.0, 'Media', null, 'data.goodstats.id (UMK Kepri 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Riau', 'Kota Tanjungpinang', 'Kota', null, 'Media', null, 'data.goodstats.id (UMK Kepri 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Riau', 'Kabupaten Lingga', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Kepri 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Riau', 'Kabupaten Natuna', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Kepri 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 'Kota Jambi', 'Kota', 3868963.0, 'Media', null, 'data.goodstats.id (UMK Jambi 2026)', 'SK UMK Kota Jambi: 1201/KEP.GUB/DISNAKERTRANS-3.3/2025');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 'Kabupaten Muaro Jambi', 'Kabupaten', 3651917.0, 'Media', null, 'data.goodstats.id (UMK Jambi 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 'Kabupaten Tanjung Jabung Barat', 'Kabupaten', 3551430.0, 'Media', null, 'data.goodstats.id (UMK Jambi 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 'Kabupaten Sarolangun', 'Kabupaten', 3533562.0, 'Media', null, 'data.goodstats.id (UMK Jambi 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 'Kabupaten Tanjung Jabung Timur', 'Kabupaten', 3486521.0, 'Media', null, 'data.goodstats.id (UMK Jambi 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 'Kota Sungai Penuh', 'Kota', null, 'Media', null, 'data.goodstats.id (UMK Jambi 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 'Kabupaten Batanghari', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Jambi 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 'Kabupaten Bungo', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Jambi 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 'Kabupaten Kerinci', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Jambi 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 'Kabupaten Merangin', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Jambi 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jambi', 'Kabupaten Tebo', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Jambi 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kota Palembang', 'Kota', 4215412.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Muara Enim', 'Kabupaten', 4159781.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Musi Rawas', 'Kabupaten', 4089327.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Musi Rawas Utara', 'Kabupaten', 4089328.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Musi Banyuasin', 'Kabupaten', 4070921.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Ogan Komering Ulu Timur', 'Kabupaten', 4041762.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Banyuasin', 'Kabupaten', 3998654.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kota Prabumulih', 'Kota', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Ogan Ilir', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Ogan Komering Ilir', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Ogan Komering Ulu', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Ogan Komering Ulu Selatan', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Lahat', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Empat Lawang', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kota Pagar Alam', 'Kota', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kota Lubuklinggau', 'Kota', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sumatera Selatan', 'Kabupaten Penukal Abab Lematang Ilir', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sumatera-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Bangka Belitung', 'Kota Pangkalpinang', 'Kota', null, 'Asumsi ikut UMP', null, 'agitya.com (2026/08)', 'Belum ditemukan SK UMK 2026; sumber media menyebut seluruh daerah = UMP. VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Bangka Belitung', 'Kabupaten Bangka', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'agitya.com (2026/08)', 'Belum ditemukan SK UMK 2026; sumber media menyebut seluruh daerah = UMP. VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Bangka Belitung', 'Kabupaten Bangka Barat', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'agitya.com (2026/08)', 'Belum ditemukan SK UMK 2026; sumber media menyebut seluruh daerah = UMP. VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Bangka Belitung', 'Kabupaten Bangka Selatan', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'agitya.com (2026/08)', 'Belum ditemukan SK UMK 2026; sumber media menyebut seluruh daerah = UMP. VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Bangka Belitung', 'Kabupaten Bangka Tengah', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'agitya.com (2026/08)', 'Belum ditemukan SK UMK 2026; sumber media menyebut seluruh daerah = UMP. VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Bangka Belitung', 'Kabupaten Belitung', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'agitya.com (2026/08)', 'Belum ditemukan SK UMK 2026; sumber media menyebut seluruh daerah = UMP. VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kepulauan Bangka Belitung', 'Kabupaten Belitung Timur', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'agitya.com (2026/08)', 'Belum ditemukan SK UMK 2026; sumber media menyebut seluruh daerah = UMP. VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bengkulu', 'Kabupaten Mukomuko', 'Kabupaten', 3217086.0, 'Media + no. SK', 'Kepgub K.647.DKKTRANS Tahun 2025', 'data.goodstats.id (UMK Bengkulu 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bengkulu', 'Kota Bengkulu', 'Kota', 3089219.0, 'Media + no. SK', 'Kepgub K.647.DKKTRANS Tahun 2025', 'data.goodstats.id (UMK Bengkulu 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bengkulu', 'Kabupaten Bengkulu Tengah', 'Kabupaten', 2945142.0, 'Media + no. SK', 'Kepgub K.647.DKKTRANS Tahun 2025', 'data.goodstats.id (UMK Bengkulu 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bengkulu', 'Kabupaten Bengkulu Utara', 'Kabupaten', 2906159.0, 'Media + no. SK', 'Kepgub K.647.DKKTRANS Tahun 2025', 'data.goodstats.id (UMK Bengkulu 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bengkulu', 'Kabupaten Rejang Lebong', 'Kabupaten', 2841749.0, 'Media + no. SK', 'Kepgub K.647.DKKTRANS Tahun 2025', 'data.goodstats.id (UMK Bengkulu 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bengkulu', 'Kabupaten Bengkulu Selatan', 'Kabupaten', null, 'Media + no. SK', 'Kepgub K.647.DKKTRANS Tahun 2025', 'data.goodstats.id (UMK Bengkulu 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bengkulu', 'Kabupaten Kaur', 'Kabupaten', null, 'Media + no. SK', 'Kepgub K.647.DKKTRANS Tahun 2025', 'data.goodstats.id (UMK Bengkulu 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bengkulu', 'Kabupaten Kepahiang', 'Kabupaten', null, 'Media + no. SK', 'Kepgub K.647.DKKTRANS Tahun 2025', 'data.goodstats.id (UMK Bengkulu 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bengkulu', 'Kabupaten Lebong', 'Kabupaten', null, 'Media + no. SK', 'Kepgub K.647.DKKTRANS Tahun 2025', 'data.goodstats.id (UMK Bengkulu 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bengkulu', 'Kabupaten Seluma', 'Kabupaten', null, 'Media + no. SK', 'Kepgub K.647.DKKTRANS Tahun 2025', 'data.goodstats.id (UMK Bengkulu 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kota Bandar Lampung', 'Kota', 3491889.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Mesuji', 'Kabupaten', 3227333.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Lampung Selatan', 'Kabupaten', 3219609.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Way Kanan', 'Kabupaten', 3215764.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kota Metro', 'Kota', 3050498.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Lampung Barat', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Lampung Tengah', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Lampung Timur', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Lampung Utara', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Pesawaran', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Pesisir Barat', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Pringsewu', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Tanggamus', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Tulang Bawang', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Lampung', 'Kabupaten Tulang Bawang Barat', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-lampung', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'DKI Jakarta', 'Kota Adm. Jakarta Pusat', 'Kota', null, 'Media', null, 'hitungpajak.online/umr', 'DKI hanya menetapkan UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'DKI Jakarta', 'Kota Adm. Jakarta Utara', 'Kota', null, 'Media', null, 'hitungpajak.online/umr', 'DKI hanya menetapkan UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'DKI Jakarta', 'Kota Adm. Jakarta Barat', 'Kota', null, 'Media', null, 'hitungpajak.online/umr', 'DKI hanya menetapkan UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'DKI Jakarta', 'Kota Adm. Jakarta Selatan', 'Kota', null, 'Media', null, 'hitungpajak.online/umr', 'DKI hanya menetapkan UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'DKI Jakarta', 'Kota Adm. Jakarta Timur', 'Kota', null, 'Media', null, 'hitungpajak.online/umr', 'DKI hanya menetapkan UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'DKI Jakarta', 'Kabupaten Adm. Kepulauan Seribu', 'Kabupaten', null, 'Media', null, 'hitungpajak.online/umr', 'DKI hanya menetapkan UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kota Bekasi', 'Kota', 5999443.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Bekasi', 'Kabupaten', 5938885.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Karawang', 'Kabupaten', 5886853.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Purwakarta', 'Kabupaten', 5052856.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Subang', 'Kabupaten', 3737482.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kota Depok', 'Kota', 5522662.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kota Bogor', 'Kota', 5437203.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Bogor', 'Kabupaten', 5161769.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Sukabumi', 'Kabupaten', 3831926.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', 'bisnis.com menulis Rp3.893.201 — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Cianjur', 'Kabupaten', 3316191.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', 'bisnis.com menulis Rp3.338.359 — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kota Sukabumi', 'Kota', 3192807.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kota Bandung', 'Kota', 4737678.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kota Cimahi', 'Kota', 4090568.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Bandung Barat', 'Kabupaten', 3984711.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', 'bisnis.com menulis Rp3.990.428 — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Sumedang', 'Kabupaten', 3949856.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Bandung', 'Kabupaten', 3972202.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Indramayu', 'Kabupaten', 2910254.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kota Cirebon', 'Kota', 2878646.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Cirebon', 'Kabupaten', 2880798.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Majalengka', 'Kabupaten', 2595368.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Kuningan', 'Kabupaten', 2369380.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kota Tasikmalaya', 'Kota', 2980336.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Tasikmalaya', 'Kabupaten', 2871874.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Garut', 'Kabupaten', 2472227.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Ciamis', 'Kabupaten', 2373644.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kabupaten Pangandaran', 'Kabupaten', 2351250.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Barat', 'Kota Banjar', 'Kota', 2361241.0, 'Media + no. SK', 'Kepgub 561.7/Kep/862-Kesra/2025', 'hukumonline.com/berita/a/ump-dan-umk-jabar-2026-lt695805af72d43', 'bisnis.com menulis Rp2.361.777 — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kota Semarang', 'Kota', 3701709.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Demak', 'Kabupaten', 3122805.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Kendal', 'Kabupaten', 2992994.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Semarang', 'Kabupaten', 2940088.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Kudus', 'Kabupaten', 2818585.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Cilacap', 'Kabupaten', 2773184.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Jepara', 'Kabupaten', 2756501.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kota Pekalongan', 'Kota', 2700926.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kota Salatiga', 'Kota', 2698273.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Batang', 'Kabupaten', 2708520.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Pekalongan', 'Kabupaten', 2633700.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Magelang', 'Kabupaten', 2607790.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Karanganyar', 'Kabupaten', 2592154.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kota Surakarta', 'Kota', 2570000.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Klaten', 'Kabupaten', 2538691.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Boyolali', 'Kabupaten', 2537949.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kota Tegal', 'Kota', 2526510.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Sukoharjo', 'Kabupaten', 2500000.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Pati', 'Kabupaten', 2485000.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Tegal', 'Kabupaten', 2484162.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Banyumas', 'Kabupaten', 2474599.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Purbalingga', 'Kabupaten', 2474722.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Wonosobo', 'Kabupaten', 2455038.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Pemalang', 'Kabupaten', 2433254.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kota Magelang', 'Kota', 2429285.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Purworejo', 'Kabupaten', 2401962.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Brebes', 'Kabupaten', 2400350.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Kebumen', 'Kabupaten', 2400000.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Grobogan', 'Kabupaten', 2399186.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Temanggung', 'Kabupaten', 2397000.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Rembang', 'Kabupaten', 2386305.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Blora', 'Kabupaten', 2345695.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Sragen', 'Kabupaten', 2337700.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Wonogiri', 'Kabupaten', 2335126.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Tengah', 'Kabupaten Banjarnegara', 'Kabupaten', 2327813.0, 'Media + no. SK', 'Kepgub 100.3.3.1/505', 'ekonomi.bisnis.com 20251228/12/1939935', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'DI Yogyakarta', 'Kota Yogyakarta', 'Kota', 2827593.0, 'Media', null, 'detik.com/jogja d-8275395', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'DI Yogyakarta', 'Kabupaten Sleman', 'Kabupaten', 2624387.0, 'Media', null, 'detik.com/jogja d-8275395', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'DI Yogyakarta', 'Kabupaten Bantul', 'Kabupaten', 2509001.0, 'Media', null, 'detik.com/jogja d-8275395', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'DI Yogyakarta', 'Kabupaten Kulon Progo', 'Kabupaten', 2504520.0, 'Media', null, 'detik.com/jogja d-8275395', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'DI Yogyakarta', 'Kabupaten Gunungkidul', 'Kabupaten', 2468378.0, 'Media', null, 'detik.com/jogja d-8275395', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kota Surabaya', 'Kota', 5288796.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Gresik', 'Kabupaten', 5195401.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Sidoarjo', 'Kabupaten', 5191541.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Pasuruan', 'Kabupaten', 5187681.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Mojokerto', 'Kabupaten', 5176101.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Malang', 'Kabupaten', 3802862.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kota Malang', 'Kota', 3736101.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kota Batu', 'Kota', 3562484.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kota Pasuruan', 'Kota', 3555301.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Jombang', 'Kabupaten', 3320770.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Tuban', 'Kabupaten', 3229092.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kota Mojokerto', 'Kota', 3208556.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Lamongan', 'Kabupaten', 3196328.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Probolinggo', 'Kabupaten', 3164526.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kota Probolinggo', 'Kota', 3045172.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Jember', 'Kabupaten', 3012197.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Banyuwangi', 'Kabupaten', 2989145.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kota Kediri', 'Kota', 2742806.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Bojonegoro', 'Kabupaten', 2685983.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Kediri', 'Kabupaten', 2651603.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kota Blitar', 'Kota', 2639518.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Tulungagung', 'Kabupaten', 2628190.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kota Madiun', 'Kota', 2588794.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Lumajang', 'Kabupaten', 2578320.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Blitar', 'Kabupaten', 2567744.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Nganjuk', 'Kabupaten', 2564627.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Ngawi', 'Kabupaten', 2556815.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Magetan', 'Kabupaten', 2553866.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Sumenep', 'Kabupaten', 2553688.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Madiun', 'Kabupaten', 2553221.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Bangkalan', 'Kabupaten', 2550274.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Ponorogo', 'Kabupaten', 2549876.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Trenggalek', 'Kabupaten', 2530313.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Pamekasan', 'Kabupaten', 2528004.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Pacitan', 'Kabupaten', 2514892.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Bondowoso', 'Kabupaten', 2496886.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Sampang', 'Kabupaten', 2484443.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Jawa Timur', 'Kabupaten Situbondo', 'Kabupaten', 2483962.0, 'Media + no. SK', 'Kepgub 100.3.3.1/937/013/2025', 'kumparan.com (UMK 2026 38 kab/kota Jatim)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Banten', 'Kabupaten Pandeglang', 'Kabupaten', 3360078.06, 'SK resmi', 'Kepgub Banten 703 Tahun 2025', 'ppid.bantenprov.go.id (Kepgub UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Banten', 'Kabupaten Lebak', 'Kabupaten', 3330010.62, 'SK resmi', 'Kepgub Banten 703 Tahun 2025', 'ppid.bantenprov.go.id (Kepgub UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Banten', 'Kabupaten Tangerang', 'Kabupaten', 5210377.0, 'SK resmi', 'Kepgub Banten 703 Tahun 2025', 'ppid.bantenprov.go.id (Kepgub UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Banten', 'Kabupaten Serang', 'Kabupaten', 5178521.19, 'SK resmi', 'Kepgub Banten 703 Tahun 2025', 'ppid.bantenprov.go.id (Kepgub UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Banten', 'Kota Tangerang', 'Kota', 5399405.69, 'SK resmi', 'Kepgub Banten 703 Tahun 2025', 'ppid.bantenprov.go.id (Kepgub UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Banten', 'Kota Cilegon', 'Kota', 5469922.59, 'SK resmi', 'Kepgub Banten 703 Tahun 2025', 'ppid.bantenprov.go.id (Kepgub UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Banten', 'Kota Serang', 'Kota', 4665927.94, 'SK resmi', 'Kepgub Banten 703 Tahun 2025', 'ppid.bantenprov.go.id (Kepgub UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Banten', 'Kota Tangerang Selatan', 'Kota', 5247870.0, 'SK resmi', 'Kepgub Banten 703 Tahun 2025', 'ppid.bantenprov.go.id (Kepgub UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bali', 'Kabupaten Badung', 'Kabupaten', 3791002.57, 'SK resmi', 'Kepgub Bali 1021/03-M/HK/2025', 'bursakerja.denpasarkota.go.id (Pengumuman UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bali', 'Kota Denpasar', 'Kota', 3499878.78, 'SK resmi', 'Kepgub Bali 1021/03-M/HK/2025', 'bursakerja.denpasarkota.go.id (Pengumuman UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bali', 'Kabupaten Gianyar', 'Kabupaten', 3316798.48, 'SK resmi', 'Kepgub Bali 1021/03-M/HK/2025', 'bursakerja.denpasarkota.go.id (Pengumuman UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bali', 'Kabupaten Tabanan', 'Kabupaten', 3287678.87, 'SK resmi', 'Kepgub Bali 1021/03-M/HK/2025', 'bursakerja.denpasarkota.go.id (Pengumuman UMK 2026, PDF)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bali', 'Kabupaten Bangli', 'Kabupaten', null, 'SK resmi', 'Kepgub Bali 1021/03-M/HK/2025', 'bursakerja.denpasarkota.go.id (Pengumuman UMK 2026, PDF)', 'Pengumuman resmi: memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bali', 'Kabupaten Buleleng', 'Kabupaten', null, 'SK resmi', 'Kepgub Bali 1021/03-M/HK/2025', 'bursakerja.denpasarkota.go.id (Pengumuman UMK 2026, PDF)', 'Pengumuman resmi: memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bali', 'Kabupaten Jembrana', 'Kabupaten', null, 'SK resmi', 'Kepgub Bali 1021/03-M/HK/2025', 'bursakerja.denpasarkota.go.id (Pengumuman UMK 2026, PDF)', 'Pengumuman resmi: memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bali', 'Kabupaten Karangasem', 'Kabupaten', null, 'SK resmi', 'Kepgub Bali 1021/03-M/HK/2025', 'bursakerja.denpasarkota.go.id (Pengumuman UMK 2026, PDF)', 'Pengumuman resmi: memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Bali', 'Kabupaten Klungkung', 'Kabupaten', null, 'SK resmi', 'Kepgub Bali 1021/03-M/HK/2025', 'bursakerja.denpasarkota.go.id (Pengumuman UMK 2026, PDF)', 'Pengumuman resmi: memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Barat', 'Kabupaten Sumbawa Barat', 'Kabupaten', 3136468.0, 'Media + no. SK', 'Kepgub 100.3.3.1-683', 'detik.com/bali d-8287566', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Barat', 'Kota Mataram', 'Kota', 3019015.0, 'Media + no. SK', 'Kepgub 100.3.3.1-683', 'detik.com/bali d-8287566', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Barat', 'Kota Bima', 'Kota', 2831163.0, 'Media + no. SK', 'Kepgub 100.3.3.1-683', 'detik.com/bali d-8287566', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Barat', 'Kabupaten Bima', 'Kabupaten', 2767580.0, 'Media + no. SK', 'Kepgub 100.3.3.1-683', 'detik.com/bali d-8287566', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Barat', 'Kabupaten Lombok Utara', 'Kabupaten', 2758221.0, 'Media + no. SK', 'Kepgub 100.3.3.1-683', 'detik.com/bali d-8287566', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Barat', 'Kabupaten Dompu', 'Kabupaten', 2751290.0, 'Media + no. SK', 'Kepgub 100.3.3.1-683', 'detik.com/bali d-8287566', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Barat', 'Kabupaten Sumbawa', 'Kabupaten', 2747478.0, 'Media + no. SK', 'Kepgub 100.3.3.1-683', 'detik.com/bali d-8287566', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Barat', 'Kabupaten Lombok Timur', 'Kabupaten', 2744628.0, 'Media + no. SK', 'Kepgub 100.3.3.1-683', 'detik.com/bali d-8287566', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Barat', 'Kabupaten Lombok Tengah', 'Kabupaten', 2741526.0, 'Media + no. SK', 'Kepgub 100.3.3.1-683', 'detik.com/bali d-8287566', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Barat', 'Kabupaten Lombok Barat', 'Kabupaten', 2712254.0, 'Media + no. SK', 'Kepgub 100.3.3.1-683', 'detik.com/bali d-8287566', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kota Kupang', 'Kota', 2532852.0, 'Media', null, 'detik.com/bali d-8287703', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Alor', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Belu', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Ende', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Flores Timur', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Kupang', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Lembata', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Malaka', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Manggarai', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Manggarai Barat', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Manggarai Timur', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Nagekeo', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Ngada', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Rote Ndao', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Sabu Raijua', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Sikka', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Sumba Barat', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Sumba Barat Daya', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Sumba Tengah', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Sumba Timur', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Timor Tengah Selatan', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Nusa Tenggara Timur', 'Kabupaten Timor Tengah Utara', 'Kabupaten', null, 'Media', null, 'detik.com/bali d-8287703', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Ketapang', 'Kabupaten', 3561801.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Kayong Utara', 'Kabupaten', 3370586.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Bengkayang', 'Kabupaten', 3252580.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kota Singkawang', 'Kota', 3247387.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Mempawah', 'Kabupaten', 3220801.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Landak', 'Kabupaten', 3211256.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kota Pontianak', 'Kota', 3205220.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Sambas', 'Kabupaten', 3202663.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Sintang', 'Kabupaten', 3187965.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Sanggau', 'Kabupaten', 3121747.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Melawi', 'Kabupaten', 3109431.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Kapuas Hulu', 'Kabupaten', 3106259.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Kubu Raya', 'Kabupaten', 3100000.0, 'Media + no. SK', 'Kepgub 1355/NAKERTRAN/2025', 'data.goodstats.id (UMK Kalbar 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Barat', 'Kabupaten Sekadau', 'Kabupaten', null, 'Asumsi ikut UMP', null, null, 'Tidak tercantum di daftar UMK Kalbar 2026 — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kota Palangka Raya', 'Kota', 3724677.99, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Pulang Pisau', 'Kabupaten', 3701205.0, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Kapuas', 'Kabupaten', 3710096.5, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Katingan', 'Kabupaten', 3729766.91, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Seruyan', 'Kabupaten', 4051079.97, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Kotawaringin Timur', 'Kabupaten', 3756643.61, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Kotawaringin Barat', 'Kabupaten', 3909005.9, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Lamandau', 'Kabupaten', 3938998.0, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Sukamara', 'Kabupaten', 3912098.21, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Gunung Mas', 'Kabupaten', 3770716.78, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Barito Selatan', 'Kabupaten', 4045059.0, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Barito Timur', 'Kabupaten', 3716006.0, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Barito Utara', 'Kabupaten', 4093071.54, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Tengah', 'Kabupaten Murung Raya', 'Kabupaten', 3998046.0, 'Media + no. SK', 'Kepgub 188.44/492/2025', 'mamikos.com/info/umk-kalteng-setelah-kenaikan-kry', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kabupaten Kotabaru', 'Kabupaten', 3904645.0, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kota Banjarmasin', 'Kota', 3855894.0, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kota Banjarbaru', 'Kota', 3843037.66, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kabupaten Tabalong', 'Kabupaten', 3827935.0, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kabupaten Tanah Bumbu', 'Kabupaten', 3736000.0, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kabupaten Balangan', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kabupaten Banjar', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kabupaten Barito Kuala', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kabupaten Hulu Sungai Selatan', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kabupaten Hulu Sungai Tengah', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kabupaten Hulu Sungai Utara', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kabupaten Tanah Laut', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Selatan', 'Kabupaten Tapin', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 100.3.3.1/01107/KUM/2025', 'wageindicator.org (Kalimantan Selatan); data.goodstats.id', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Timur', 'Kabupaten Berau', 'Kabupaten', 4391337.55, 'Media + no. SK', 'Pengumuman Gub 500.15.14.1/5096/DTKT.Srk-IV/2025', 'dealls.com/pengembangan-karir/ump-kalimantan-timur', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Timur', 'Kabupaten Kutai Barat', 'Kabupaten', 4231617.4, 'Media + no. SK', 'Pengumuman Gub 500.15.14.1/5096/DTKT.Srk-IV/2025', 'dealls.com/pengembangan-karir/ump-kalimantan-timur', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Timur', 'Kabupaten Penajam Paser Utara', 'Kabupaten', 4181134.0, 'Media + no. SK', 'Pengumuman Gub 500.15.14.1/5096/DTKT.Srk-IV/2025', 'dealls.com/pengembangan-karir/ump-kalimantan-timur', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Timur', 'Kabupaten Kutai Kartanegara', 'Kabupaten', 3991797.0, 'Media + no. SK', 'Pengumuman Gub 500.15.14.1/5096/DTKT.Srk-IV/2025', 'dealls.com/pengembangan-karir/ump-kalimantan-timur', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Timur', 'Kota Samarinda', 'Kota', 3983882.0, 'Media + no. SK', 'Pengumuman Gub 500.15.14.1/5096/DTKT.Srk-IV/2025', 'dealls.com/pengembangan-karir/ump-kalimantan-timur', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Timur', 'Kabupaten Kutai Timur', 'Kabupaten', 4067436.0, 'Media + no. SK', 'Pengumuman Gub 500.15.14.1/5096/DTKT.Srk-IV/2025', 'dealls.com/pengembangan-karir/ump-kalimantan-timur', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Timur', 'Kota Balikpapan', 'Kota', 3856694.43, 'Media + no. SK', 'Pengumuman Gub 500.15.14.1/5096/DTKT.Srk-IV/2025', 'dealls.com/pengembangan-karir/ump-kalimantan-timur', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Timur', 'Kota Bontang', 'Kota', 3799480.0, 'Media + no. SK', 'Pengumuman Gub 500.15.14.1/5096/DTKT.Srk-IV/2025', 'dealls.com/pengembangan-karir/ump-kalimantan-timur', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Timur', 'Kabupaten Paser', 'Kabupaten', 3776998.06, 'Media + no. SK', 'Pengumuman Gub 500.15.14.1/5096/DTKT.Srk-IV/2025', 'dealls.com/pengembangan-karir/ump-kalimantan-timur', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Timur', 'Kabupaten Mahakam Ulu', 'Kabupaten', null, 'Asumsi ikut UMP', null, null, 'Tidak tercantum di daftar UMK Kaltim 2026 — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Utara', 'Kota Tarakan', 'Kota', 4742169.0, 'Media', null, 'beraupost.jawapos.com; tribunkaltara (UMK Kaltara 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Utara', 'Kabupaten Malinau', 'Kabupaten', 4040073.0, 'Media', null, 'beraupost.jawapos.com; tribunkaltara (UMK Kaltara 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Utara', 'Kabupaten Bulungan', 'Kabupaten', 3900396.0, 'Media', null, 'beraupost.jawapos.com; tribunkaltara (UMK Kaltara 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Utara', 'Kabupaten Tana Tidung', 'Kabupaten', 3870800.0, 'Media', null, 'beraupost.jawapos.com; tribunkaltara (UMK Kaltara 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Kalimantan Utara', 'Kabupaten Nunukan', 'Kabupaten', 3845251.23, 'Media', null, 'beraupost.jawapos.com; tribunkaltara (UMK Kaltara 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kota Manado', 'Kota', 4022017.0, 'Media + no. SK', 'Kepgub 407 Tahun 2025', 'data.goodstats.id (UMK Sulut 2026)', 'SK UMK Manado: Kepgub 407 Tahun 2025');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kota Bitung', 'Kota', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kota Kotamobagu', 'Kota', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kota Tomohon', 'Kota', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kabupaten Bolaang Mongondow', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kabupaten Bolaang Mongondow Selatan', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kabupaten Bolaang Mongondow Timur', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kabupaten Bolaang Mongondow Utara', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kabupaten Kepulauan Sangihe', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kabupaten Kepulauan Siau Tagulandang Biaro', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kabupaten Kepulauan Talaud', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kabupaten Minahasa', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kabupaten Minahasa Selatan', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kabupaten Minahasa Tenggara', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Utara', 'Kabupaten Minahasa Utara', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 404 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Sulut 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Morowali Utara', 'Kabupaten', 4408209.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Morowali', 'Kabupaten', 4223000.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kota Palu', 'Kota', 3619466.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Poso', 'Kabupaten', 3268227.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Buol', 'Kabupaten', 3198109.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Donggala', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Sigi', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Parigi Moutong', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Tojo Una-Una', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Banggai', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Banggai Laut', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Banggai Kepulauan', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tengah', 'Kabupaten Toli-Toli', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tengah', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kota Makassar', 'Kota', 4148179.0, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kota Palopo', 'Kota', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kota Parepare', 'Kota', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Bantaeng', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Barru', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Bone', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Bulukumba', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Enrekang', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Gowa', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Jeneponto', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Kepulauan Selayar', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Luwu', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Luwu Timur', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Luwu Utara', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Maros', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Pangkajene dan Kepulauan', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Pinrang', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Sidenreng Rappang', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Sinjai', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Soppeng', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Takalar', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Tana Toraja', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Toraja Utara', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Selatan', 'Kabupaten Wajo', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-selatan', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Kolaka', 'Kabupaten', 3688130.26, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kota Kendari', 'Kota', 3516070.42, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Konawe Utara', 'Kabupaten', 3510505.7, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Bombana', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Buton', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Buton Selatan', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Buton Tengah', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Buton Utara', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Kolaka Timur', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Kolaka Utara', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Konawe', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Konawe Kepulauan', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Konawe Selatan', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Muna', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Muna Barat', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kabupaten Wakatobi', 'Kabupaten', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Tenggara', 'Kota Baubau', 'Kota', null, 'Media', null, 'dealls.com/pengembangan-karir/ump-sulawesi-tenggara', 'Sumber menyebut belum semua UMK terpublikasi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Gorontalo', 'Kota Gorontalo', 'Kota', null, 'Media + no. SK', 'Kepgub 434/34/XII/2025', 'data.goodstats.id (UMK Gorontalo 2026)', 'Belum ada dewan pengupahan kab/kota; seluruh daerah memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Gorontalo', 'Kabupaten Boalemo', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 434/34/XII/2025', 'data.goodstats.id (UMK Gorontalo 2026)', 'Belum ada dewan pengupahan kab/kota; seluruh daerah memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Gorontalo', 'Kabupaten Bone Bolango', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 434/34/XII/2025', 'data.goodstats.id (UMK Gorontalo 2026)', 'Belum ada dewan pengupahan kab/kota; seluruh daerah memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Gorontalo', 'Kabupaten Gorontalo', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 434/34/XII/2025', 'data.goodstats.id (UMK Gorontalo 2026)', 'Belum ada dewan pengupahan kab/kota; seluruh daerah memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Gorontalo', 'Kabupaten Gorontalo Utara', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 434/34/XII/2025', 'data.goodstats.id (UMK Gorontalo 2026)', 'Belum ada dewan pengupahan kab/kota; seluruh daerah memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Gorontalo', 'Kabupaten Pohuwato', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 434/34/XII/2025', 'data.goodstats.id (UMK Gorontalo 2026)', 'Belum ada dewan pengupahan kab/kota; seluruh daerah memakai UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Barat', 'Kabupaten Mamuju', 'Kabupaten', 3363847.0, 'Media', null, 'wageindicator.org (West Sulawesi)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Barat', 'Kabupaten Polewali Mandar', 'Kabupaten', 3327886.0, 'Media', null, 'wageindicator.org (West Sulawesi)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Barat', 'Kabupaten Majene', 'Kabupaten', null, 'Media', null, 'wageindicator.org (West Sulawesi)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Barat', 'Kabupaten Mamasa', 'Kabupaten', null, 'Media', null, 'wageindicator.org (West Sulawesi)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Barat', 'Kabupaten Mamuju Tengah', 'Kabupaten', null, 'Media', null, 'wageindicator.org (West Sulawesi)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Sulawesi Barat', 'Kabupaten Pasangkayu', 'Kabupaten', null, 'Media', null, 'wageindicator.org (West Sulawesi)', 'wageindicator: = UMP; judul goodstats menyebut Pasangkayu UMK tertinggi — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 'Kota Ambon', 'Kota', 3381225.0, 'Media + no. SK', 'Kepgub 5434 Tahun 2025', 'data.goodstats.id (UMK Maluku 2026)', 'SK UMK Ambon: Kepgub 5434 Tahun 2025');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 'Kota Tual', 'Kota', null, 'Media + no. SK', 'Kepgub 5430 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Maluku 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 'Kabupaten Buru', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 5430 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Maluku 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 'Kabupaten Buru Selatan', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 5430 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Maluku 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 'Kabupaten Kepulauan Aru', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 5430 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Maluku 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 'Kabupaten Kepulauan Tanimbar', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 5430 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Maluku 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 'Kabupaten Maluku Barat Daya', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 5430 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Maluku 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 'Kabupaten Maluku Tengah', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 5430 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Maluku 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 'Kabupaten Maluku Tenggara', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 5430 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Maluku 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 'Kabupaten Seram Bagian Barat', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 5430 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Maluku 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku', 'Kabupaten Seram Bagian Timur', 'Kabupaten', null, 'Media + no. SK', 'Kepgub 5430 Tahun 2025 (UMP)', 'data.goodstats.id (UMK Maluku 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku Utara', 'Kota Ternate', 'Kota', 3599562.0, 'Media', null, 'ternate.tribunnews.com (UMK Ternate 2026)', null);
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku Utara', 'Kabupaten Halmahera Tengah', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'dealls.com/ump-maluku-utara-2026', 'Sumber menyebut nilai sementara (UMK belum final). Halmahera Tengah 2025 punya UMK sendiri — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku Utara', 'Kabupaten Halmahera Barat', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'dealls.com/ump-maluku-utara-2026', 'Sumber menyebut nilai sementara (UMK belum final). Halmahera Tengah 2025 punya UMK sendiri — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku Utara', 'Kabupaten Halmahera Selatan', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'dealls.com/ump-maluku-utara-2026', 'Sumber menyebut nilai sementara (UMK belum final). Halmahera Tengah 2025 punya UMK sendiri — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku Utara', 'Kabupaten Halmahera Timur', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'dealls.com/ump-maluku-utara-2026', 'Sumber menyebut nilai sementara (UMK belum final). Halmahera Tengah 2025 punya UMK sendiri — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku Utara', 'Kabupaten Halmahera Utara', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'dealls.com/ump-maluku-utara-2026', 'Sumber menyebut nilai sementara (UMK belum final). Halmahera Tengah 2025 punya UMK sendiri — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku Utara', 'Kabupaten Kepulauan Sula', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'dealls.com/ump-maluku-utara-2026', 'Sumber menyebut nilai sementara (UMK belum final). Halmahera Tengah 2025 punya UMK sendiri — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku Utara', 'Kabupaten Pulau Morotai', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'dealls.com/ump-maluku-utara-2026', 'Sumber menyebut nilai sementara (UMK belum final). Halmahera Tengah 2025 punya UMK sendiri — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku Utara', 'Kabupaten Pulau Taliabu', 'Kabupaten', null, 'Asumsi ikut UMP', null, 'dealls.com/ump-maluku-utara-2026', 'Sumber menyebut nilai sementara (UMK belum final). Halmahera Tengah 2025 punya UMK sendiri — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Maluku Utara', 'Kota Tidore Kepulauan', 'Kota', null, 'Asumsi ikut UMP', null, 'dealls.com/ump-maluku-utara-2026', 'Sumber menyebut nilai sementara (UMK belum final). Halmahera Tengah 2025 punya UMK sendiri — VERIFIKASI');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua', 'Kota Jayapura', 'Kota', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua', 'Kabupaten Jayapura', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua', 'Kabupaten Biak Numfor', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua', 'Kabupaten Keerom', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua', 'Kabupaten Kepulauan Yapen', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua', 'Kabupaten Mamberamo Raya', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua', 'Kabupaten Sarmi', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua', 'Kabupaten Supiori', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua', 'Kabupaten Waropen', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat', 'Kabupaten Manokwari', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat', 'Kabupaten Manokwari Selatan', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat', 'Kabupaten Fakfak', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat', 'Kabupaten Kaimana', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat', 'Kabupaten Pegunungan Arfak', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat', 'Kabupaten Teluk Bintuni', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat', 'Kabupaten Teluk Wondama', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat Daya', 'Kota Sorong', 'Kota', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat Daya', 'Kabupaten Sorong', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat Daya', 'Kabupaten Sorong Selatan', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat Daya', 'Kabupaten Maybrat', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat Daya', 'Kabupaten Raja Ampat', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Barat Daya', 'Kabupaten Tambrauw', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Tengah', 'Kabupaten Mimika', 'Kabupaten', 5005678.0, 'Media', null, 'timikabisnis.com; gajihub.com', 'Tidak naik dari 2025 (timikabisnis.com)');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Tengah', 'Kabupaten Nabire', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Tengah', 'Kabupaten Deiyai', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Tengah', 'Kabupaten Dogiyai', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Tengah', 'Kabupaten Intan Jaya', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Tengah', 'Kabupaten Paniai', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Tengah', 'Kabupaten Puncak', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Tengah', 'Kabupaten Puncak Jaya', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Selatan', 'Kabupaten Merauke', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Selatan', 'Kabupaten Asmat', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Selatan', 'Kabupaten Boven Digoel', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Selatan', 'Kabupaten Mappi', 'Kabupaten', null, 'Media', null, 'gajihub.com/blog/ump-papua', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Pegunungan', 'Kabupaten Jayawijaya', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Papua Pegunungan 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Pegunungan', 'Kabupaten Lanny Jaya', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Papua Pegunungan 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Pegunungan', 'Kabupaten Mamberamo Tengah', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Papua Pegunungan 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Pegunungan', 'Kabupaten Nduga', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Papua Pegunungan 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Pegunungan', 'Kabupaten Pegunungan Bintang', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Papua Pegunungan 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Pegunungan', 'Kabupaten Tolikara', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Papua Pegunungan 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Pegunungan', 'Kabupaten Yahukimo', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Papua Pegunungan 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values (2026, 'Papua Pegunungan', 'Kabupaten Yalimo', 'Kabupaten', null, 'Media', null, 'data.goodstats.id (UMK Papua Pegunungan 2026)', 'Tidak menetapkan UMK, mengikuti UMP');
insert into public.holidays values ('2026-01-01', 'Tahun Baru 2026 Masehi', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-01-16', 'Isra Mikraj', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-02-17', 'Tahun Baru Imlek 2577', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-03-19', 'Hari Suci Nyepi', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-03-21', 'Idulfitri 1447 H', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-03-22', 'Idulfitri 1447 H', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-04-03', 'Wafat Yesus Kristus', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-04-05', 'Paskah', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-05-01', 'Hari Buruh Internasional', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-05-14', 'Kenaikan Yesus Kristus', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-05-27', 'Iduladha 1447 H', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-05-31', 'Hari Raya Waisak', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-06-01', 'Hari Lahir Pancasila', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-06-16', 'Tahun Baru Islam 1448 H', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-08-17', 'Proklamasi Kemerdekaan', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-08-25', 'Maulid Nabi Muhammad', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-12-25', 'Kelahiran Yesus Kristus', 'Libur Nasional', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-02-16', 'Cuti bersama Imlek', 'Cuti Bersama', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-03-18', 'Cuti bersama Nyepi', 'Cuti Bersama', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-03-20', 'Cuti bersama Idulfitri', 'Cuti Bersama', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-03-23', 'Cuti bersama Idulfitri', 'Cuti Bersama', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-03-24', 'Cuti bersama Idulfitri', 'Cuti Bersama', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-05-15', 'Cuti bersama Kenaikan Yesus Kristus', 'Cuti Bersama', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-05-28', 'Cuti bersama Iduladha', 'Cuti Bersama', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.holidays values ('2026-12-24', 'Cuti bersama Natal', 'Cuti Bersama', 'SKB 3 Menteri 2026 — setneg.go.id');
insert into public.electricity_tariffs (golongan, daya_min_va, daya_max_va, tarif_kwh, sumber, berlaku_mulai, status) values ('B-2/TR', 6600, 200000.0, 1444.7, 'fortuneidn.com, tarif per 1 Okt 2026 (tarif Q3 masih berlaku)', '2026-10-01', 'approved');
insert into public.electricity_tariffs (golongan, daya_min_va, daya_max_va, tarif_kwh, sumber, berlaku_mulai, status) values ('B-3/TM', 200001, null, 1114.74, 'fortuneidn.com, tarif per 1 Okt 2026 (tarif Q3 masih berlaku)', '2026-10-01', 'approved');
insert into public.electricity_tariffs (golongan, daya_min_va, daya_max_va, tarif_kwh, sumber, berlaku_mulai, status) values ('I-3/TM', 200001, null, 1114.74, 'fortuneidn.com, tarif per 1 Okt 2026 (tarif Q3 masih berlaku)', '2026-10-01', 'approved');
insert into public.electricity_tariffs (golongan, daya_min_va, daya_max_va, tarif_kwh, sumber, berlaku_mulai, status) values ('I-4/TT', 30000000, null, 996.74, 'fortuneidn.com, tarif per 1 Okt 2026 (tarif Q3 masih berlaku)', '2026-10-01', 'approved');
insert into public.electricity_tariffs (golongan, daya_min_va, daya_max_va, tarif_kwh, sumber, berlaku_mulai, status) values ('P-1/TR', 6600, 200000.0, 1699.53, 'fortuneidn.com, tarif per 1 Okt 2026 (tarif Q3 masih berlaku)', '2026-10-01', 'approved');
insert into public.electricity_tariffs (golongan, daya_min_va, daya_max_va, tarif_kwh, sumber, berlaku_mulai, status) values ('P-2/TM', 200001, null, 1522.88, 'fortuneidn.com, tarif per 1 Okt 2026 (tarif Q3 masih berlaku)', '2026-10-01', 'approved');
insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ('bpjs_jht', 'BPJS TK — JHT (pemberi kerja)', 0.037, 'PP 46/2015', 'draft');
insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ('bpjs_jkk', 'BPJS TK — JKK kelas risiko III', 0.0089, 'PP 44/2015; sesuaikan kelas risiko 0,24%–1,74%', 'draft');
insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ('bpjs_jkm', 'BPJS TK — JKM', 0.003, 'PP 44/2015', 'draft');
insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ('bpjs_jp', 'BPJS TK — Jaminan Pensiun (pemberi kerja)', 0.02, 'PP 45/2015; ada batas upah', 'draft');
insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ('bpjs_kes', 'BPJS Kesehatan (pemberi kerja)', 0.04, 'Perpres 64/2020; ada batas upah Rp12 jt', 'draft');
insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ('batas_upah_jp', 'Batas upah iuran JP (Rp)', 10547400, 'Nilai 2025 — perbarui tiap Maret', 'draft');
insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ('batas_upah_kes', 'Batas upah iuran BPJS Kesehatan (Rp)', 12000000, 'Perpres 64/2020', 'draft');
insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ('thr', 'Cadangan THR (1/12 upah)', 0.08333333333333333, 'Permenaker 6/2016', 'draft');
insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ('pesangon', 'Cadangan kompensasi/pesangon', 0.08, 'Asumsi Esa — review HR', 'draft');
insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ('contingency_os', 'Contingency biaya OS', 0.07, 'Use case UC3 — keputusan Esa 16 Okt 2026', 'draft');
insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ('fee_os', 'Fee/management fee outsourcing', 0.05, 'Database Harga Esa', 'draft');
insert into public.finance_params values ('bunga_modal_tahun', 'Cost of capital per tahun', 0.1, 'Default — Finance review');
insert into public.finance_params values ('ap_hari', 'Hari bayar ke vendor (AP)', 30, 'Default');
insert into public.finance_params values ('overhead_persen', 'Overhead korporat', 0.03, 'Template KLOG memakai 2,7–3%');
insert into public.finance_params values ('pph_grossup', 'Gross-up PPh 23', 0.02, 'PPh 23 jasa 2%');
insert into public.finance_params values ('gp_minimum', 'Batas GP minimum (red flag)', 0.08, 'Default — Finance review');
insert into public.margin_policy (kategori_risiko, margin, keterangan) values ('Rendah', 0.08, 'Biaya tetap & back-to-back: sewa, utilitas, consumable');
insert into public.margin_policy (kategori_risiko, margin, keterangan) values ('Sedang', 0.12, 'Biaya volume-driven: manpower, MHE sewa, IT');
insert into public.margin_policy (kategori_risiko, margin, keterangan) values ('Tinggi', 0.18, 'Investasi melebihi kontrak, startup, racking');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Sepatu Safety (Steel Toe, SNI)', 'unit', 250000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Helm Safety (SNI)', 'unit', 45000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Rompi Safety Reflective', 'unit', 45000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Sarung Tangan Kerja (per pasang, konsumsi 4x/tahun)', 'unit', 15000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Masker (konsumsi bulanan, per orang)', 'unit', 60000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Kacamata Safety (Goggles)', 'unit', 35000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Ear Plug (per pasang)', 'unit', 5000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Seragam/Uniform Kerja (2 stel/tahun)', 'unit', 350000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Respirator + Cartridge (khusus Hazmat/B3)', 'unit', 450000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Chemical Suit / Apron Tahan Kimia (khusus Hazmat/B3)', 'unit', 280000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Jaket Cold Storage (khusus Cold Storage/Freezer)', 'unit', 550000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('MHE', 'Hand Pallet Truck (Manual, 2-2.5 Ton)', 'unit', 2500000.0, 1000000.0, 60, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('MHE', 'Pallet Mover (1.5-2 Ton)', 'unit', 65000000.0, 8000000.0, 60, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('MHE', 'Counterbalance Electric 2.5 Ton ', 'unit', 190000000.0, 19000000.0, 60, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('MHE', 'Counterbalance Electric 3 Ton ', 'unit', 190000000.0, 22000000.0, 60, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('MHE', 'Counterbalance Electric 5 Ton ', 'unit', 280000000.0, 25000000.0, 60, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('MHE', 'Counterbalance Electric 10 Ton ', 'unit', 280000000.0, 30000000.0, 60, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('MHE', 'Reach Truck Electric 2-2.5 Ton (tinggi angkat s.d 11m)', 'unit', 350000000.0, 28000000.0, 60, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Racking', 'Selective Pallet Racking (SPR)', 'posisi palet', 650000.0, null, 120, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Racking', 'Double Deep Racking', 'posisi palet', 650000.0, null, 120, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Racking', 'Drive-In Racking', 'posisi palet', 700000.0, null, 120, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Racking', 'Shelving Rack', 'posisi palet', 2500000.0, null, 120, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Racking', 'Mezzanine Floor ', 'm²', 3500000.0, null, 120, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Kertas HVS A4', 'unit', 54000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Kertas HVS A4', 'unit', 48600.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi; item ganda dengan harga berbeda — pilih satu', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Kertas HVS F4', 'unit', 62675.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Kertas HVS A4', 'unit', 70000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi; item ganda dengan harga berbeda — pilih satu', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Kertas HVS A4', 'unit', 243750.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi; item ganda dengan harga berbeda — pilih satu', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Amplop Putih', 'unit', 22300.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Amplop Coklat A4', 'unit', 35600.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Nota Kontan', 'unit', 37900.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Nota Surat Jalan', 'unit', 110000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Pulpen', 'unit', 18103.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Pulpen', 'unit', 43900.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi; item ganda dengan harga berbeda — pilih satu', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Pulpen', 'unit', 24500.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi; item ganda dengan harga berbeda — pilih satu', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Pulpen', 'unit', 2100.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi; item ganda dengan harga berbeda — pilih satu', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Pensil 2B', 'unit', 13150.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Penghapus', 'unit', 5000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Highlighter', 'unit', 10000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Correction Tape', 'unit', 7050.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Spidol Permanent', 'unit', 8575.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Spidol Whiteboard', 'unit', 10000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Refill tinta marker', 'unit', 13000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Spidol Whiteboard', 'unit', 2731.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi; item ganda dengan harga berbeda — pilih satu', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Stapler', 'unit', 15650.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Stapler', 'unit', 18375.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi; item ganda dengan harga berbeda — pilih satu', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Isi Staples No.10', 'unit', 2875.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Binder Clip', 'unit', 14900.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Binder Clip', 'unit', 3650.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi; item ganda dengan harga berbeda — pilih satu', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Binder Clip', 'unit', 12200.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi; item ganda dengan harga berbeda — pilih satu', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Paper Clip', 'unit', 3600.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Paper Fastener', 'unit', 10000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'File Fastener', 'unit', 24350.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Cutter Besar', 'unit', 21250.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Isi Cutter Besar', 'unit', 8900.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Cutter Kecil', 'unit', 7350.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Gunting', 'unit', 9800.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Double Tape', 'unit', 3675.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Lakban Bening/Coklat', 'unit', 7560.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Lakban OPP', 'unit', 11500.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Lakban Fragile', 'unit', 8500.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Tape Dispenser', 'unit', 26445.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Glue Stick', 'unit', 4950.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Map L Clear A4', 'unit', 36750.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Map Plastik L', 'unit', 2200.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Pocket File A4', 'unit', 16000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Ordner', 'unit', 45000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Box File Plastik', 'unit', 18000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Label Sticker', 'unit', 8575.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Direct Thermal Label', 'unit', 18375.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Label Price Gun', 'unit', 78400.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Alat Label Harga', 'unit', 59795.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Desk Organizer', 'unit', 32800.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Pen Holder', 'unit', 72500.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Penggaris', 'unit', 5000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Sticky Notes', 'unit', 9000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Kalkulator', 'unit', 65000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Stamp Pad', 'unit', 14000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Stempel', 'unit', 35950.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'ID Card Holder', 'unit', 5000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Kertas Thermal', 'unit', 35000.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('ATK', 'Kertas Thermal', 'unit', 17300.0, null, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi; item ganda dengan harga berbeda — pilih satu', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'PC Desktop Core i7 Fullset (CPU+Monitor 19"+Keyboard+Mouse)', 'unit', 13500000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'Laptop Core i7, RAM 8GB, SSD 512GB', 'unit', 17500000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'Printer Multifungsi Inkjet Epson L3210 (Print/Scan/Copy A4)', 'unit', 2850000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'UPS 1000VA (APC BV1000I-MS / setara)', 'unit', 1473000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'Barcode Scanner Handheld 2D USB (Zebra DS4608 / setara)', 'unit', 3225000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'Printer Label Thermal Barcode 100mm (Xprinter XP420B USB/BT/WiFi)', 'unit', 1089000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'Mobile Computer / PDT Android 2D (Zebra TC22 / setara)', 'unit', 9980000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'Router WiFi Dual Band (TP-Link Archer C64 AC1200 / setara)', 'unit', 700000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'Switch Hub Gigabit 8 Port (TP-Link TL-SG1008D)', 'unit', 320000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'Kabel LAN UTP Cat6 (1 roll @305m) + Konektor RJ45', 'unit', 850000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'Paket CCTV Hikvision 4 Channel (NVR + 4 Kamera 2MP + kabel, tanpa HDD)', 'unit', 2100000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'Hard Disk CCTV 1TB (Surveillance grade)', 'unit', 750000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'Stavolt / Extension Kabel Listrik + Kabel Data tambahan', 'unit', 100000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('IT', 'TV LED', 'unit', 8000000.0, null, 36, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'it', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'APAR / Fire Extinguisher 6kg', 'unit', 450000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Hydrant Box + Selang + Nozzle', 'unit', 3500000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Fire Alarm / Smoke Detector (per titik)', 'unit', 350000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Sprinkler System (per titik, estimasi)', 'unit', 650000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'P3K Kit Standar (per titik)', 'unit', 750000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Safety Sign & Rambu K3 (1 set per zona)', 'unit', 1200000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Spill Kit (khusus Hazmat/B3)', 'unit', 2500000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Eyewash Station + Shower Darurat (khusus Hazmat/B3)', 'unit', 3500000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Gas Detector Portable (khusus Hazmat/Cold Storage amonia)', 'unit', 4500000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Emergency Lamp / Lampu Darurat', 'unit', 350000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Papan Informasi K3 + Struktur P2K3', 'unit', 850000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('HSE', 'Training K3/HSE Induction (per batch, per tahun)', 'unit', 5000000.0, null, 24, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Konstruksi', 'Office Construction', 'per m² (estimasi)', 2000000.0, null, 60, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'engineering', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Konstruksi', 'Cool Room Construction', 'per m² (estimasi)', 3000000.0, null, 60, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'engineering', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Konstruksi', 'Toilet Construction', 'per m² (estimasi)', 2000000.0, null, 60, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'engineering', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Konstruksi', 'Vas Area Construction', 'per m² (estimasi)', 2000000.0, null, 60, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'engineering', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Palet', 'Pallet Kayu', 'unit', 250000.0, 6000.0, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Palet', 'Pallet Plastik', 'unit', 450000.0, 40000.0, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Meja Kerja Staff 120x60cm (kayu PB board + laci)', 'unit', 750000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Meja Kerja Supervisor/Ka. Gudang 140-150cm (dengan laci/credenza)', 'unit', 1800000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Kursi Kantor Staff (hidrolik, sandaran kain/mesh)', 'unit', 495000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Lemari Arsip Besi 2 Pintu (sliding/swing, dengan kunci)', 'unit', 1800000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Filing Cabinet Besi 4 Laci', 'unit', 1475000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Rak Buku/Dokumen Terbuka', 'unit', 450000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Whiteboard Magnetic 120x240cm (single/double face)', 'unit', 1200000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Jam Dinding Kantor', 'unit', 75000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Papan Struktur Organisasi / Info Board kecil', 'unit', 250000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Tempat Sampah Kantor', 'unit', 45000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Keset & Tirai/Gorden ruang office', 'unit', 350000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'AC Split 1 PK (standar, non-inverter)', 'unit', 3900000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Dispenser Galon Bawah (bottom loading, hot-cool)', 'unit', 1200000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Kipas Angin Dinding/Berdiri', 'unit', 350000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Map/Folder Arsip Bantex + Ordner', 'unit', 35000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Kalkulator Meja', 'unit', 65000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Telepon Kantor (single line, kabel)', 'unit', 150000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Office', 'Kotak P3K + Isi Obat Standar', 'unit', 200000.0, null, 48, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Pest Control', 'Pest Control Umum (kecoa, semut, nyamuk) - kontrak bulanan', 'unit', 9000000.0, 750000.0, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Pest Control', 'Rodent Control (tikus) - kontrak bulanan', 'unit', 6000000.0, 500000.0, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Pest Control', 'Termite/Rayap Treatment (kondisional)', 'unit', 36000000.0, 3000000.0, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values ('Asuransi', 'Asuransi Gudang dam Barang', 'unit', 30750000.0, 2562500.0, null, 'Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi', 'procurement', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Operator Forklift (CBT)', 'Blue Collar', 1.05, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('TKBM', 'Blue Collar', 1.0, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Checker', 'Blue Collar', 1.0, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Loader', 'Blue Collar', 1.0, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Helper', 'Blue Collar', 1.0, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('TKBM (Runner)', 'Blue Collar', 1.0, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Inbound Admin', 'White Collar', 1.1, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Operator Reach Truck', 'Blue Collar', 1.05, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Inventory Staff', 'Blue Collar', 1.0, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Stock Controller', 'Blue Collar', 1.05, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Inventory Controller', 'Blue Collar', 1.05, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Picker', 'Blue Collar', 1.0, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Sorter', 'Blue Collar', 1.0, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Packer', 'Blue Collar', 1.0, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Outbound Admin', 'White Collar', 1.1, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Warehouse Operator', 'Blue Collar', 1.0, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('VAS Operator', 'Blue Collar', 1.0, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Manager / Ka Gudang', 'White Collar', 3.2, false, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Operational SPV', 'White Collar', 1.8, false, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('QHSE / K3', 'White Collar', 1.3, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Admin Inbound-Outbound', 'White Collar', 1.3, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ('Security', 'Blue Collar', 1.3, true, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Unload Full Pallets', 'Inbound - Receiving', 'CBT', 'Operator Forklift (CBT)', 'palet', 40, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Unload Loose Cases', 'Inbound - Receiving', 'Manual', 'TKBM', 'karton', 350, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Unload Loose Cases - Returns', 'Inbound - Receiving', 'Manual', 'TKBM', 'karton', 250, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Inspect Pallets', 'Inbound - Receiving', 'RF', 'Checker', 'palet', 30, 'Benchmark', 'Benchmark KLOG (validasi: sama dgn  )', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Inspect Pallets', 'Inbound - Receiving', 'Manual', 'Checker', 'palet', 60, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Inspect Cases', 'Inbound - Receiving', 'RF', 'Checker', 'karton', 475, 'Benchmark', 'Benchmark KLOG (update dari 250, median n=8)', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Inspect Pieces', 'Inbound - Receiving', 'RF', 'Checker', 'karton', 400, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Inspect Pieces - Returns', 'Inbound - Receiving', 'Manual', 'Checker', 'karton', 250, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Palletize Loose Cases', 'Inbound - Receiving', 'Manual', 'Loader', 'karton', 300, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Palletize Loose Cases', 'Inbound - Receiving', 'RF', 'Loader', 'palet', 30, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Stretch-Wrap Pallets', 'Inbound - Receiving', 'Hand Wrapper', 'Helper', 'palet', 30, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Move Pallets to Gangway', 'Inbound - Receiving', 'Hand Pallet', 'TKBM (Runner)', 'palet', 20, 'Benchmark', 'Benchmark KLOG (update dari 30, Runner)', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Move Pallets to Staging (Inbound)', 'Inbound - Receiving', 'Hand Pallet', 'TKBM (Runner)', 'palet', 20, 'Benchmark', 'Benchmark KLOG (update dari 30, Runner)', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Inbound Admin - ASN Acknowledgement', 'Inbound - Receiving', 'PC', 'Inbound Admin', 'order', 30, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Inbound Admin - Receipt Confirmation', 'Inbound - Receiving', 'PC', 'Inbound Admin', 'order', 30, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Put Away Pallets', 'Inbound - Putaway', 'Manual', 'Operator Reach Truck', 'palet', 25, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Put Away Pallets', 'Inbound - Putaway', 'RT', 'Operator Reach Truck', 'palet', 30, 'Benchmark', 'Benchmark KLOG (update dari 25)', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Put Away Pallets', 'Inbound - Putaway', 'CBT', 'Operator Forklift (CBT)', 'palet', 15, 'Benchmark', 'Benchmark KLOG (BARU - Car Putaway)', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Put Away Loose Cases', 'Inbound - Putaway', 'Manual', 'Inventory Staff', 'karton', 900, 'Benchmark', 'Benchmark KLOG (update dari 250)', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Put Away Loose Cases - Returns', 'Inbound - Putaway', 'Manual', 'Inventory Staff', 'karton', 150, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Inbound Admin - Put-Away Update', 'Inbound - Putaway', 'PC', 'Inbound Admin', 'line', 60, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Cycle Count', 'Inventory', 'RF', 'Stock Controller', 'palet', 60, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Replenish Pallets to Case-Pick Area', 'Inventory', 'RT', 'Operator Reach Truck', 'palet', 20, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Replenish Cases to Unit-Pick Area', 'Inventory', 'Manual', 'Inventory Controller', 'karton', 300, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Order Replenishment', 'Inventory', 'Manual', 'Inventory Controller', 'karton', 100, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Replenishment Update', 'Inventory', 'PC', 'Inventory Controller', 'line', 60, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Pallet Picking', 'Outbound - Picking', 'CBT', 'Operator Forklift (CBT)', 'palet', 22, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Pallet Picking', 'Outbound - Picking', 'RT', 'Operator Reach Truck', 'palet', 22, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Case Picking', 'Outbound - Picking', 'RF', 'Picker', 'karton', 220, 'Benchmark', 'Benchmark KLOG (update dari 200)', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Single Picking', 'Outbound - Picking', 'Manual', 'Picker', 'karton', 300, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Single Picking', 'Outbound - Picking', 'RF', 'Picker', 'karton', 300, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Single Picking', 'Outbound - Picking', 'PC', 'Picker', 'line', 80, 'Benchmark', 'Benchmark KLOG (validasi: sama dgn  )', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Move Pallets to Staging (Outbound)', 'Outbound - Picking', 'Hand Pallet', 'TKBM (Runner)', 'palet', 20, 'Benchmark', 'Benchmark KLOG (update dari 30, Runner)', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Sort by Order / Delivery Point', 'Outbound - Picking', 'RF', 'Sorter', 'karton', 400, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Order Packing', 'Outbound - Picking', 'Manual', 'Packer', 'karton', 80, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Outbound Admin - Initial Order Processing', 'Outbound - Picking', 'PC', 'Outbound Admin', 'order', 80, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Outbound Admin - Pick Confirm', 'Outbound - Picking', 'PC', 'Outbound Admin', 'order', 60, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Check Pallet', 'Outbound - Dispatching', 'RF', 'Checker', 'palet', 60, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Check Case', 'Outbound - Dispatching', 'Manual', 'Checker', 'karton', 300, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Check Case', 'Outbound - Dispatching', 'RF', 'Checker', 'karton', 300, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Check Single', 'Outbound - Dispatching', 'Manual', 'Checker', 'karton', 350, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Check Single', 'Outbound - Dispatching', 'RF', 'Checker', 'karton', 400, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Palletize and Stretchwrap', 'Outbound - Dispatching', 'Hand Wrapper', 'Warehouse Operator', 'palet', 20, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Load Pallet', 'Outbound - Dispatching', 'CBT', 'Operator Forklift (CBT)', 'palet', 40, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Load Loose Case', 'Outbound - Dispatching', 'Manual', 'TKBM', 'karton', 300, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Generate and Apply Labels', 'Outbound - Misc/VAS', 'Manual', 'Helper', 'karton', 20, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Process Returns', 'Outbound - Misc/VAS', 'Manual', 'Inventory Staff', 'karton', 150, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Re-Package or Re-Furbish Cases', 'Outbound - Misc/VAS', 'Manual', 'Packer', 'karton', 20, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('Weigh / Measure Cases', 'Outbound - Misc/VAS', 'Manual', 'Checker', 'karton', 150, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values ('VAS Labelling', 'Outbound - Misc/VAS', 'Manual', 'VAS Operator', 'karton', 200, 'Benchmark', 'Database Harga Esa — sumber belum dicatat', 'draft') on conflict do nothing;
insert into public.tc_templates (nama, isi) values ('Standar Gudang', '1. Harga belum termasuk PPN 11% dan sudah memperhitungkan PPh 23.
2. Penawaran berlaku 30 hari sejak tanggal quotation.
3. Tagihan bulanan dengan minimum charge sesuai volume komitmen (MGV); volume di atas MGV ditagih sesuai tarif.
4. Pembayaran {payment_term} hari setelah invoice diterima; keterlambatan dikenakan denda 2% per bulan.
5. Tarif disesuaikan setiap tahun mengikuti kenaikan UMK dan inflasi, serta bila terjadi perubahan regulasi.
6. Tanggung jawab kehilangan/kerusakan dibatasi maksimal nilai tarif handling atas barang terkait, kecuali terbukti lalai; barang wajib diasuransikan oleh pemilik barang.
7. Perubahan profil volume, SKU, atau proses di luar asumsi penawaran akan dihitung ulang.
8. Kontrak minimum {durasi} bulan; pengakhiran lebih awal mengganti sisa investasi yang belum tersusutkan.');
commit;
-- Katalog IT awal, dari contoh BAP KLOG (Nabati Majalengka, BAP-71/02/2019).
-- Status draft: harga 2019, perlu dicek ulang & di-approve oleh IT / Solution Design.
-- Rentang slab transaksi WMS belum diisi (isi slab_min / slab_max dari kontrak KLOG).
insert into public.it_catalog (kelompok, item, cost_type, basis, harga, urutan, sumber, tanggal_harga) values
 ('Software - WMS Solution','KLOG WMS SaaS – slab 1','Transaction/Month','Transaksi',3400,1,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','KLOG WMS SaaS – slab 2','Transaction/Month','Transaksi',2750,2,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','KLOG WMS SaaS – slab 3','Transaction/Month','Transaksi',2000,3,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','Office Tools','OTC/Unit','Sekali',950000,4,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','Antivirus','PUPM','Bulanan',39375,5,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','Email','PUPM','Bulanan',115000,6,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','Power BI','PUPM','Bulanan',131039,7,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Scanner HHT','PDPM','Bulanan',475000,10,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','PC Desktop','PDPM','Bulanan',350000,11,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Laptop CYOD','PUPM','Bulanan',450000,12,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Laptop Operasional','PDPM','Bulanan',500000,13,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Printer Dot Matrix','OTC/Unit','Sekali',10000000,14,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','TV Display','OTC/Unit','Sekali',14000000,15,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Printer All-in-One','OTC/Unit','Sekali',5000000,16,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Printer Barcode','OTC/Unit','Sekali',4000000,17,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','UPS','OTC/Unit','Sekali',1500000,18,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('CCTV','Kamera CCTV','OTC/Unit','Sekali',2500000,30,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('CCTV','NVR','OTC/Unit','Sekali',15000000,31,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('CCTV','TV Monitor CCTV','OTC/Unit','Sekali',4000000,32,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('CCTV','KVM','OTC/Unit','Sekali',1000000,33,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('CCTV','Cabling CCTV','OTC','Sekali',2000000,34,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Connection','Firewall & WAN – instalasi','OTC','Sekali',8360000,40,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Connection','Firewall & WAN – bulanan','Monthly/Site','Bulanan',12000000,41,'BAP-71/02/2019 Nabati Majalengka','2019-02-01')
on conflict (kelompok, item) do nothing;
-- Pengamanan fungsi (hasil Supabase security advisor)
alter function public.touch_updated_at() set search_path = public;
revoke execute on function public.guard_price_approval(), public.guard_quotation_approval(), public.guard_quotation_insert(),
  public.guard_status_approval(), public.handle_new_user(), public.log_tender_status(), public.tulis_audit()
  from public, anon, authenticated;
revoke execute on function public.current_role_is(variadic public.app_role[]), public.my_role() from public, anon;
grant execute on function public.current_role_is(variadic public.app_role[]), public.my_role() to authenticated;
revoke execute on function public.buat_checklist_implementasi(uuid, date) from public, anon;
grant execute on function public.buat_checklist_implementasi(uuid, date) to authenticated;

-- Isi tipe/tonase MHE dari nama item seed
update public.price_items set
  mhe_tipe = case when item ilike 'Counterbalance%' then 'Counter Balance' when item ilike 'Reach Truck%' then 'Reach Truck' when item ilike 'Pallet Mover%' then 'Pallet Mover' when item ilike 'Hand Pallet%' then 'Hand Pallet' end,
  kapasitas_ton = case when item ilike '%10 Ton%' then 10 when item ilike '%5 Ton%' and item not ilike '%2.5 Ton%' and item not ilike '%1.5%' then 5 when item ilike '% 3 Ton%' then 3 when item ilike '%2.5 Ton%' then 2.5 when item ilike '%1.5-2 Ton%' then 2 end,
  sumber_tenaga = case when item ilike '%Electric%' or item ilike 'Pallet Mover%' then 'Electric' when item ilike '%Manual%' then 'Manual' end,
  tinggi_angkat_m = case when item ilike '%11m%' then 11 end
where kategori = 'MHE' and mhe_tipe is null;
-- Harga gudang boleh kosong (database awal ada gudang tanpa harga); UI menandai 'harga belum ada'
alter table public.warehouses drop constraint if exists warehouses_check;
-- 0006 · Project berjalan yang diimpor dari cost model Excel lama.
-- Datanya disimpan di tenders.asumsi->'historis' (hasil mesin hitung = null).
-- tender_overview membaca hasil mesin hitung dulu, kalau kosong pakai data historis,
-- supaya project lama ikut di daftar tender, dashboard, dan menu perbandingan harga.
create or replace view public.tender_overview with (security_invoker = true) as
with h as (
  select t.*, t.asumsi->'historis' as hs from public.tenders t
)
select h.id, h.kode, h.customer, h.industri, h.provinsi, h.kab_kota, h.tipe_gudang, h.skema, h.skenario_aset,
       h.status::text as status, h.versi, h.created_at, h.updated_at, h.tanggal_keputusan, h.alasan_hasil,
       h.durasi_kontrak_bulan, h.jumlah_shift,
       coalesce((h.hasil->>'totalBiayaBulan')::numeric, (h.hs->'ringkasan'->>'biayaBulan')::numeric)                 as biaya_bulan,
       coalesce((h.hasil->'simulasi'->0->>'pendapatanBulan')::numeric, (h.hs->'ringkasan'->>'pendapatanBulan')::numeric) as pendapatan_bulan,
       coalesce((h.hasil->'simulasi'->0->>'gpPersen')::numeric, (h.hs->'ringkasan'->>'gpPersen')::numeric)             as gp_persen,
       coalesce((h.hasil->>'totalHeadcount')::int, round((h.hs->'ringkasan'->>'headcount')::numeric)::int)              as headcount,
       coalesce((h.hasil->'space'->>'totalM2')::numeric, (h.hs->'ringkasan'->>'luasM2')::numeric)                      as luas_m2,
       coalesce((h.hasil->'space'->>'ppDesain')::numeric, (h.hs->'ringkasan'->>'posisiPalet')::numeric)                as posisi_palet,
       coalesce((select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(h.hasil->'rateCard') r where r->>'bucket' = 'storage'),
                (select (r->>'tarif')::numeric from jsonb_array_elements(h.hs->'rateCard') r where r->>'bucket' = 'storage' limit 1))      as tarif_storage,
       coalesce((select r->>'uom' from jsonb_array_elements(h.hasil->'rateCard') r where r->>'bucket' = 'storage'),
                (select r->>'uom' from jsonb_array_elements(h.hs->'rateCard') r where r->>'bucket' = 'storage' limit 1))                    as uom_storage,
       coalesce((select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(h.hasil->'rateCard') r where r->>'bucket' = 'handling_in'),
                (select (r->>'tarif')::numeric from jsonb_array_elements(h.hs->'rateCard') r where r->>'bucket' = 'handling_in' limit 1))  as tarif_handling_in,
       coalesce((select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(h.hasil->'rateCard') r where r->>'bucket' = 'handling_out'),
                (select (r->>'tarif')::numeric from jsonb_array_elements(h.hs->'rateCard') r where r->>'bucket' = 'handling_out' limit 1)) as tarif_handling_out,
       coalesce((select r->>'uom' from jsonb_array_elements(h.hasil->'rateCard') r where r->>'bucket' = 'handling_in'),
                (select r->>'uom' from jsonb_array_elements(h.hs->'rateCard') r where r->>'bucket' = 'handling_in' limit 1))                as uom_handling,
       (select count(*) from jsonb_array_elements(h.hasil->'redFlags') f where f->>'level' = 'kritis')                                as red_flag_kritis,
       (h.hs is not null)                                                                                                             as dari_excel
from h;
-- 0007 · UoM produktivitas ditambah liter, pail, pack, roll (menu Productivity per UoM).
alter table public.productivity drop constraint productivity_uom_check;
alter table public.productivity add constraint productivity_uom_check
  check (uom = any (array['pcs','bag','karton','palet','ton','cbm','order','lokasi','line','liter','pail','pack','roll']));
