-- PIC gudang sewa + lampiran quotation vendor di Price Inquiry.
alter table public.warehouses add column if not exists pic_nama text, add column if not exists pic_telepon text;
alter table public.price_items add column if not exists quotation_path text, add column if not exists quotation_nama text;
alter table public.it_catalog add column if not exists quotation_path text, add column if not exists quotation_nama text;

create or replace view public.price_items_status with (security_invoker = true) as
 select id, kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, daya_watt, vendor, sumber, tanggal_harga, berlaku_sampai,
    owner_role, status, approved_by, approved_at, created_by, updated_at,
    case when status = 'approved'::data_status and berlaku_sampai is not null and berlaku_sampai < current_date then 'expired'::text else status::text end as status_efektif,
    mhe_tipe, kapasitas_ton, sumber_tenaga, tinggi_angkat_m, spesifikasi, quotation_path, quotation_nama
   from public.price_items p;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supplier-quotations', 'supplier-quotations', false, 10485760, array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
drop policy if exists "quotation vendor: baca" on storage.objects;
create policy "quotation vendor: baca" on storage.objects for select to authenticated
  using (bucket_id = 'supplier-quotations' and public.is_aktif());
drop policy if exists "quotation vendor: upload" on storage.objects;
create policy "quotation vendor: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'supplier-quotations' and public.punya_role('admin','manager','solution_design','commercial','procurement','it','hr','engineering'));
drop policy if exists "quotation vendor: hapus" on storage.objects;
create policy "quotation vendor: hapus" on storage.objects for delete to authenticated
  using (bucket_id = 'supplier-quotations' and public.punya_role('admin','manager','solution_design','commercial','procurement','it','hr','engineering'));
