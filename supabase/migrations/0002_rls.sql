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
