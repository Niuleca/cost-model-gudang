-- Super Admin mengatur password baru untuk akun lain (password lama tidak bisa dilihat: tersimpan sebagai hash bcrypt).
create or replace function public.set_password_akun(target uuid, password_baru text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.is_master() then raise exception 'Hanya Super Admin yang bisa mengatur password akun lain.'; end if;
  if exists (select 1 from public.profiles where id = target and is_pemilik) and target <> auth.uid() then
    raise exception 'Password akun pemilik hanya bisa diganti pemiliknya sendiri.'; end if;
  if length(coalesce(password_baru, '')) < 8 then raise exception 'Password minimal 8 karakter.'; end if;
  update auth.users set encrypted_password = extensions.crypt(password_baru, extensions.gen_salt('bf')), updated_at = now() where id = target;
  if not found then raise exception 'Akun tidak ditemukan.'; end if;
end $$;
revoke all on function public.set_password_akun(uuid, text) from public, anon;
grant execute on function public.set_password_akun(uuid, text) to authenticated;
