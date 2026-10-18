-- File storage (logo/TTD quotation & foto gudang) mengikuti hirarki role baru: Manager & Business Development ikut boleh.
drop policy if exists "branding file: baca" on storage.objects;
create policy "branding file: baca" on storage.objects for select to authenticated
  using (bucket_id = 'quotation-branding' and public.punya_role('admin','manager','solution_design','commercial','finance'));
drop policy if exists "branding file: upload ke folder sendiri" on storage.objects;
create policy "branding file: upload ke folder sendiri" on storage.objects for insert to authenticated
  with check (bucket_id = 'quotation-branding' and (storage.foldername(name))[1] = auth.uid()::text
    and public.punya_role('admin','manager','solution_design','commercial','finance'));
drop policy if exists "branding file: hapus milik sendiri / admin" on storage.objects;
create policy "branding file: hapus milik sendiri / admin" on storage.objects for delete to authenticated
  using (bucket_id = 'quotation-branding' and ((storage.foldername(name))[1] = auth.uid()::text or public.punya_role('admin','manager')));
drop policy if exists "foto gudang: upload" on storage.objects;
create policy "foto gudang: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'warehouse-photos' and public.punya_role('admin','manager','solution_design','commercial','procurement'));
drop policy if exists "foto gudang: hapus" on storage.objects;
create policy "foto gudang: hapus" on storage.objects for delete to authenticated
  using (bucket_id = 'warehouse-photos' and public.punya_role('admin','manager','solution_design','commercial','procurement'));
-- hapus logo/TTD: Manager boleh juga (tabel)
drop policy if exists "branding: hapus milik sendiri / admin" on public.quotation_branding;
create policy "branding: hapus milik sendiri / admin" on public.quotation_branding for delete to authenticated
  using (created_by = auth.uid() or public.punya_role('admin','manager'));
