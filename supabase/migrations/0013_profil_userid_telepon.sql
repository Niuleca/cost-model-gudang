-- Profil: user ID (unik, huruf kecil) & nomor telepon
alter table public.profiles add column if not exists username text, add column if not exists telepon text;
update public.profiles set username = lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9._-]', '', 'g')) where username is null and email is not null;
create unique index if not exists profiles_username_unik on public.profiles (lower(username));
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9._-]{3,30}$');
