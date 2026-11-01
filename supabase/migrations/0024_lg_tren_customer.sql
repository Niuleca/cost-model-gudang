-- LG (Dashboard): ranking harian sektor / komoditas yang sedang naik di Indonesia (target pasar) + daftar calon customer.
-- Diisi otomatis oleh Claude (scheduled task harian dari sumber publik: BPS, ekspor-impor, investasi, laporan & berita dunia)
-- dan dilengkapi manual oleh akun (status follow-up, catatan). Kontak customer hanya kontak resmi perusahaan yang dipublikasikan.
create table if not exists public.lg_tren (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  peringkat int not null,
  sektor text not null,                       -- sektor / sub-sektor
  komoditas text,                             -- contoh komoditas / HS / produk
  skor numeric not null default 0,            -- 0–100 (pertumbuhan, momentum berita, investasi, ekspor-impor)
  perubahan int,                              -- naik (+) / turun (−) peringkat dibanding laporan sebelumnya; null = baru
  tren text not null default 'naik' check (tren in ('naik', 'stabil', 'turun')),
  kebutuhan_logistik text not null default 'Sedang' check (kebutuhan_logistik in ('Tinggi', 'Sedang', 'Rendah')),
  layanan text,                               -- layanan logistik yang relevan (gudang ambient, cold chain, bonded, trucking, dst.)
  wilayah text,                               -- pusat pertumbuhan
  alasan text,                                -- ringkasan kenapa naik
  indikator jsonb not null default '[]'::jsonb,   -- [{nama, nilai, periode, sumber}]
  sumber jsonb not null default '[]'::jsonb,      -- [{judul, penerbit, tanggal, url}]
  created_at timestamptz not null default now(),
  unique (tanggal, sektor)
);
create index if not exists lg_tren_tanggal on public.lg_tren (tanggal desc, peringkat);

create table if not exists public.lg_customer (
  id uuid primary key default gen_random_uuid(),
  nama text not null,                          -- nama perusahaan
  sektor text,
  komoditas text,
  peran text check (peran in ('Eksportir', 'Importir', 'Eksportir & Importir', 'Produsen', 'Distributor', 'Ritel / e-commerce', 'Lainnya')),
  kota text, provinsi text, alamat text,
  website text,
  email text,                                  -- email resmi perusahaan yang dipublikasikan (bukan email pribadi)
  telepon text,                                -- telepon kantor yang dipublikasikan
  hs_code text,
  alasan text,                                 -- kenapa calon customer (ekspansi, pabrik baru, volume ekspor, dst.)
  skor int check (skor between 0 and 100),     -- prioritas prospek
  sumber_nama text, sumber_url text,           -- sumber kontak / data
  status text not null default 'Baru' check (status in ('Baru', 'Dihubungi', 'Prospek', 'Penawaran', 'Tidak cocok')),
  catatan text,
  oleh_claude boolean not null default true,
  ditemukan date not null default current_date,
  dibuat_oleh uuid references auth.users(id) on delete set null,
  diubah_oleh uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lg_customer_unik on public.lg_customer (lower(nama));
create index if not exists lg_customer_sektor on public.lg_customer (sektor);

create table if not exists public.lg_jalan (
  id bigint generated always as identity primary key,
  tanggal date not null default current_date,
  ringkasan text,
  n_sumber int,
  n_tren int, n_customer_baru int,
  created_at timestamptz not null default now()
);

create or replace function public.lg_customer_jejak() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.diubah_oleh := auth.uid();
    if tg_op = 'INSERT' then new.dibuat_oleh := coalesce(new.dibuat_oleh, auth.uid()); new.oleh_claude := false; end if;
  end if;
  return new;
end $$;
drop trigger if exists lg_customer_jejak on public.lg_customer;
create trigger lg_customer_jejak before insert or update on public.lg_customer for each row execute function public.lg_customer_jejak();

alter table public.lg_tren enable row level security;
alter table public.lg_customer enable row level security;
alter table public.lg_jalan enable row level security;
drop policy if exists "gerbang: akun aktif" on public.lg_tren;
create policy "gerbang: akun aktif" on public.lg_tren as restrictive for all to authenticated using (public.is_aktif()) with check (public.is_aktif());
drop policy if exists "gerbang: akun aktif" on public.lg_customer;
create policy "gerbang: akun aktif" on public.lg_customer as restrictive for all to authenticated using (public.is_aktif()) with check (public.is_aktif());
drop policy if exists "gerbang: akun aktif" on public.lg_jalan;
create policy "gerbang: akun aktif" on public.lg_jalan as restrictive for all to authenticated using (public.is_aktif()) with check (public.is_aktif());
-- tim tender membaca; ranking & log hanya ditulis Claude (service), customer boleh ditambah / diubah tim tender
drop policy if exists "lg tren: baca" on public.lg_tren;
create policy "lg tren: baca" on public.lg_tren for select to authenticated using (public.punya_role('admin', 'manager', 'solution_design', 'commercial', 'finance'));
drop policy if exists "lg jalan: baca" on public.lg_jalan;
create policy "lg jalan: baca" on public.lg_jalan for select to authenticated using (public.punya_role('admin', 'manager', 'solution_design', 'commercial', 'finance'));
drop policy if exists "lg customer: baca" on public.lg_customer;
create policy "lg customer: baca" on public.lg_customer for select to authenticated using (public.punya_role('admin', 'manager', 'solution_design', 'commercial', 'finance'));
drop policy if exists "lg customer: tambah" on public.lg_customer;
create policy "lg customer: tambah" on public.lg_customer for insert to authenticated with check (public.punya_role('admin', 'manager', 'solution_design', 'commercial', 'finance'));
drop policy if exists "lg customer: ubah" on public.lg_customer;
create policy "lg customer: ubah" on public.lg_customer for update to authenticated using (public.punya_role('admin', 'manager', 'solution_design', 'commercial', 'finance')) with check (public.punya_role('admin', 'manager', 'solution_design', 'commercial', 'finance'));
drop policy if exists "lg customer: hapus" on public.lg_customer;
create policy "lg customer: hapus" on public.lg_customer for delete to authenticated using (public.is_master() or public.punya_role('admin', 'manager'));
