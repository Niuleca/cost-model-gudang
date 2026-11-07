-- UAT D1–D2: Market price transport & intermodal (harga beli vendor per rute). Dipakai tender Transportation & Intermodal
-- sebagai referensi harga beli; diisi manual atau lewat Excel (Export → ubah → Import).
create table if not exists public.transport_rates (
  id bigint generated always as identity primary key,
  moda text not null default 'darat' check (moda in ('darat', 'laut', 'udara', 'kereta')),
  origin text not null,
  destination text not null,
  armada text not null,                         -- jenis armada / container (CDD, Wingbox, Container 20 ft, Air cargo, …)
  basis text not null default 'trip' check (basis in ('trip', 'cbm', 'ton', 'kg', 'pallet', 'liter', 'container')),
  harga numeric not null default 0 check (harga >= 0),   -- harga beli per basis (Rp)
  vendor text not null default '',
  lead_time_hari numeric,
  min_charge numeric,
  cakupan text,                                 -- termasuk / tidak termasuk (tol, BBM, bongkar muat, asuransi, THC, …)
  berlaku_dari date,
  berlaku_sampai date,
  sumber text,
  catatan text,
  status data_status not null default 'draft',
  approved_by uuid, approved_at timestamptz,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create unique index if not exists transport_rates_kunci on public.transport_rates (moda, lower(origin), lower(destination), lower(armada), basis, lower(vendor));
create index if not exists transport_rates_rute on public.transport_rates (lower(origin), lower(destination));

alter table public.transport_rates enable row level security;
create policy "gerbang: akun aktif" on public.transport_rates as restrictive for all to authenticated using (public.is_aktif()) with check (public.is_aktif());
create policy "baca" on public.transport_rates for select to authenticated using (true);
create policy "tulis tim tender & procurement" on public.transport_rates for insert to authenticated
  with check (punya_role(variadic array['admin', 'manager', 'solution_design', 'commercial', 'procurement']));
create policy "ubah tim tender & procurement" on public.transport_rates for update to authenticated
  using (punya_role(variadic array['admin', 'manager', 'solution_design', 'commercial', 'procurement']))
  with check (punya_role(variadic array['admin', 'manager', 'solution_design', 'commercial', 'procurement']));
create policy "hapus admin/manager atau draft" on public.transport_rates for delete to authenticated
  using (punya_role(variadic array['admin', 'manager']) or (status = 'draft' and punya_role(variadic array['solution_design', 'commercial', 'procurement'])));

create or replace function public.transport_rates_updated() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists transport_rates_updated on public.transport_rates;
create trigger transport_rates_updated before update on public.transport_rates for each row execute function public.transport_rates_updated();
