-- Desain gudang tanpa project: layout pribadi (tender_id kosong) yang hanya bisa dibaca & diubah pembuatnya.
alter table public.warehouse_layouts alter column tender_id drop not null;
create index if not exists warehouse_layouts_pribadi on public.warehouse_layouts (dibuat_oleh, updated_at desc) where tender_id is null;

drop policy if exists "layout pribadi: milik pembuat" on public.warehouse_layouts;
create policy "layout pribadi: milik pembuat" on public.warehouse_layouts for all to authenticated
  using (tender_id is null and dibuat_oleh = auth.uid() and public.is_aktif())
  with check (tender_id is null and dibuat_oleh = auth.uid() and public.is_aktif());
