-- UAT D1–D2: Market Price transport & intermodal (harga beli vendor per rute).
-- Dijalankan manual di Supabase SQL Editor (tanpa operasi drop supaya tidak memicu peringatan "destructive").
create table if not exists public.transport_rates (
  id bigint generated always as identity primary key,
  moda text not null default 'darat' check (moda in ('darat', 'laut', 'udara', 'kereta')),
  origin text not null,
  destination text not null,
  armada text not null,
  basis text not null default 'trip' check (basis in ('trip', 'cbm', 'ton', 'kg', 'pallet', 'liter', 'container')),
  harga numeric not null default 0 check (harga >= 0),
  vendor text not null default '',
  lead_time_hari numeric,
  min_charge numeric,
  cakupan text,
  berlaku_dari date,
  berlaku_sampai date,
  sumber text,
  catatan text,
  status public.data_status not null default 'draft',
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create unique index if not exists transport_rates_kunci
  on public.transport_rates (moda, lower(origin), lower(destination), lower(armada), basis, lower(vendor));

alter table public.transport_rates enable row level security;

create policy "transport_rates gerbang" on public.transport_rates
  as restrictive for all to authenticated
  using (public.is_aktif()) with check (public.is_aktif());

create policy "transport_rates baca" on public.transport_rates
  for select to authenticated using (true);

create policy "transport_rates tambah" on public.transport_rates
  for insert to authenticated
  with check (public.punya_role('admin', 'manager', 'solution_design', 'commercial', 'procurement'));

create policy "transport_rates ubah" on public.transport_rates
  for update to authenticated
  using (public.punya_role('admin', 'manager', 'solution_design', 'commercial', 'procurement'))
  with check (public.punya_role('admin', 'manager', 'solution_design', 'commercial', 'procurement'));

create policy "transport_rates hapus" on public.transport_rates
  for delete to authenticated
  using (public.punya_role('admin', 'manager') or (status = 'draft' and public.punya_role('solution_design', 'commercial', 'procurement')));
