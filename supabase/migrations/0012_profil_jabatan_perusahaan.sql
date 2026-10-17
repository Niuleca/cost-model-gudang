-- Profil: jabatan & perusahaan (dipakai sebagai default penanda tangan quotation)
alter table public.profiles add column if not exists jabatan text, add column if not exists perusahaan text;
