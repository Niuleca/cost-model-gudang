-- Layout gudang 2D/3D yang bisa diedit (menu Simulasi Warehouse · Layout editor).
-- Beberapa versi per tender (mis. Opsi A / Opsi B). Hak akses mengikuti tender: siapa yang bisa membuka tender, bisa membaca & menyimpan layoutnya.
create table if not exists public.warehouse_layouts (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  nama text not null default 'Layout',
  data jsonb not null default '{}'::jsonb,
  dibuat_oleh uuid references auth.users(id) on delete set null,
  diubah_oleh uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists warehouse_layouts_tender on public.warehouse_layouts (tender_id, updated_at desc);

create or replace function public.warehouse_layouts_jejak() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.diubah_oleh := auth.uid();
    if tg_op = 'INSERT' then new.dibuat_oleh := coalesce(new.dibuat_oleh, auth.uid()); end if;
  end if;
  return new;
end $$;
drop trigger if exists warehouse_layouts_jejak on public.warehouse_layouts;
create trigger warehouse_layouts_jejak before insert or update on public.warehouse_layouts for each row execute function public.warehouse_layouts_jejak();

alter table public.warehouse_layouts enable row level security;
drop policy if exists "layout: ikut akses tender" on public.warehouse_layouts;
create policy "layout: ikut akses tender" on public.warehouse_layouts for all to authenticated
  using (exists (select 1 from public.tenders t where t.id = tender_id))
  with check (exists (select 1 from public.tenders t where t.id = tender_id));
