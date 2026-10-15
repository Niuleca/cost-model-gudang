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
  'Security', 'Cleaning', 'Utilitas', 'Lainnya'
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
create type public.tender_status as enum ('draft','dihitung','review','approved','quotation_terkirim','menang','kalah','batal');

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
