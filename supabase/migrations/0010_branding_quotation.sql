-- Logo & tanda tangan untuk PDF quotation: disimpan di bucket privat 'quotation-branding' (path: <user_id>/<file>).
create table if not exists public.quotation_branding (
  id uuid primary key default gen_random_uuid(),
  jenis text not null check (jenis in ('logo', 'ttd')),
  nama text not null,
  path text not null unique,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.quotation_branding enable row level security;
create policy "branding: tim tender baca" on public.quotation_branding for select to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'));
create policy "branding: tambah milik sendiri" on public.quotation_branding for insert to authenticated
  with check (created_by = auth.uid() and public.current_role_is('solution_design','commercial','finance','admin'));
create policy "branding: hapus milik sendiri / admin" on public.quotation_branding for delete to authenticated
  using (created_by = auth.uid() or public.current_role_is('admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quotation-branding', 'quotation-branding', false, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
create policy "branding file: baca" on storage.objects for select to authenticated
  using (bucket_id = 'quotation-branding' and public.current_role_is('solution_design','commercial','finance','admin'));
create policy "branding file: upload ke folder sendiri" on storage.objects for insert to authenticated
  with check (bucket_id = 'quotation-branding' and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_role_is('solution_design','commercial','finance','admin'));
create policy "branding file: hapus milik sendiri / admin" on storage.objects for delete to authenticated
  using (bucket_id = 'quotation-branding' and ((storage.foldername(name))[1] = auth.uid()::text or public.current_role_is('admin')));
