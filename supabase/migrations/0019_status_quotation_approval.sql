-- Status approval quotation diizinkan + semua quotation mulai sebagai draft (manager / Super Admin approve sendiri dengan tombol).
alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations add constraint quotations_status_check
  check (status in ('draft', 'menunggu', 'revisi', 'ditolak', 'approved', 'terkirim', 'direvisi', 'batal'));

create or replace function public.guard_quotation_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('draft', 'menunggu') then new.status := 'draft'; end if;
  if new.status = 'menunggu' then new.diajukan_at := now(); end if;
  return new;
end $$;
