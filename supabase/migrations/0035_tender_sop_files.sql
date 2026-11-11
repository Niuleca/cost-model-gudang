-- File SOP per proses (tab VSM Map & SOP di tender): Word / PDF yang menggantikan SOP draft otomatis.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tender-sop', 'tender-sop', false, 15728640, array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
drop policy if exists "sop tender: baca" on storage.objects;
create policy "sop tender: baca" on storage.objects for select to authenticated
  using (bucket_id = 'tender-sop' and public.is_aktif());
drop policy if exists "sop tender: upload" on storage.objects;
create policy "sop tender: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'tender-sop' and public.punya_role('admin','manager','solution_design','commercial','procurement','it','hr','engineering'));
drop policy if exists "sop tender: hapus" on storage.objects;
create policy "sop tender: hapus" on storage.objects for delete to authenticated
  using (bucket_id = 'tender-sop' and public.punya_role('admin','manager','solution_design','commercial','procurement','it','hr','engineering'));
