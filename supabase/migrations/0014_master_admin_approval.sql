-- Master admin + persetujuan akun baru. eghaesa = pemilik (master permanen); master bisa menunjuk/mencabut master lain.
-- Akun baru berstatus 'pending' dan tidak bisa membaca/menulis data apa pun sampai disetujui master admin.
alter table public.profiles
  add column if not exists status text not null default 'pending',
  add column if not exists is_master boolean not null default false,
  add column if not exists is_pemilik boolean not null default false,
  add column if not exists disetujui_oleh uuid references public.profiles(id),
  add column if not exists disetujui_at timestamptz;
alter table public.profiles drop constraint if exists profiles_status_cek;
alter table public.profiles add constraint profiles_status_cek check (status in ('pending', 'aktif', 'ditolak'));

-- Akun yang sudah ada tetap aktif; eghaesa = pemilik & master admin
update public.profiles set status = 'aktif', disetujui_at = coalesce(disetujui_at, now()) where status = 'pending';
update public.profiles set is_master = true, is_pemilik = true, role = 'admin', status = 'aktif' where lower(email) = 'eghaesa@gmail.com';
create unique index if not exists profiles_satu_pemilik on public.profiles (is_pemilik) where is_pemilik;

create or replace function public.is_aktif() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aktif');
$$;
create or replace function public.is_master() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_master and p.status = 'aktif');
$$;
-- Role hanya berlaku untuk akun aktif
create or replace function public.current_role_is(variadic roles app_role[]) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aktif' and p.role = any(roles));
$$;

-- Penjaga: status, role, master hanya bisa diubah master admin; pemilik (eghaesa) tidak bisa diturunkan / dihapus;
-- master selalu admin & aktif (pemilik menjamin selalu ada minimal satu master).
create or replace function public.jaga_profil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_pemilik then raise exception 'Akun pemilik (master utama) tidak bisa dihapus.'; end if;
    if auth.uid() is not null and not public.is_master() then raise exception 'Hanya master admin yang bisa menghapus akun.'; end if;
    return old;
  end if;
  if new.is_pemilik is distinct from old.is_pemilik and auth.uid() is not null then raise exception 'Status pemilik tidak bisa diubah.'; end if;
  if old.is_pemilik and (new.role <> 'admin' or new.status <> 'aktif' or not new.is_master) then
    raise exception 'Akun pemilik harus tetap master admin & aktif.';
  end if;
  if new.is_master and (new.role <> 'admin' or new.status <> 'aktif') then
    raise exception 'Master admin harus ber-role admin & aktif.';
  end if;
  if auth.uid() is not null and not public.is_master()
     and (new.status is distinct from old.status or new.role is distinct from old.role or new.is_master is distinct from old.is_master
          or new.disetujui_oleh is distinct from old.disetujui_oleh or new.disetujui_at is distinct from old.disetujui_at) then
    raise exception 'Hanya master admin yang bisa mengubah role / status / master akun.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_jaga on public.profiles;
create trigger profiles_jaga before update or delete on public.profiles for each row execute function public.jaga_profil();

-- Gerbang di semua tabel: akun harus aktif (policy RESTRICTIVE, digabung AND dengan policy yang sudah ada)
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'profiles' loop
    execute format('drop policy if exists "gerbang: akun aktif" on public.%I', r.relname);
    execute format('create policy "gerbang: akun aktif" on public.%I as restrictive for all to authenticated using (public.is_aktif()) with check (public.is_aktif())', r.relname);
  end loop;
end $$;
-- profiles: akun pending hanya boleh melihat profilnya sendiri (untuk layar "menunggu persetujuan")
drop policy if exists "gerbang: akun aktif" on public.profiles;
create policy "gerbang: akun aktif" on public.profiles as restrictive for select to authenticated using (public.is_aktif() or id = auth.uid());
drop policy if exists "gerbang: akun aktif ubah" on public.profiles;
create policy "gerbang: akun aktif ubah" on public.profiles as restrictive for update to authenticated using (public.is_aktif()) with check (public.is_aktif());
-- file (logo, tanda tangan, foto gudang)
drop policy if exists "gerbang: akun aktif" on storage.objects;
create policy "gerbang: akun aktif" on storage.objects as restrictive for all to authenticated using (public.is_aktif()) with check (public.is_aktif());

-- Ganti email: setelah user mengonfirmasi email baru di Supabase Auth, profiles.email ikut diperbarui
create or replace function public.sinkron_email_profil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists auth_users_sinkron_email on auth.users;
create trigger auth_users_sinkron_email after update of email on auth.users for each row execute function public.sinkron_email_profil();
