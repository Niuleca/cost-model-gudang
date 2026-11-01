-- Update trend bisnis: kontak customer yang tepat sasaran & tervalidasi.
-- Corsec / investor relation hanya cadangan; utamakan jalur pengadaan (portal vendor / procurement) & sales/umum
-- dari situs resmi perusahaan, plus status pengecekan email (MX domain + muncul di halaman resmi).
alter table public.lg_customer
  add column if not exists portal_vendor text,                 -- URL portal pendaftaran vendor / e-procurement resmi
  add column if not exists email_pengadaan text,               -- email procurement / purchasing / supply chain yang dipublikasikan resmi
  add column if not exists email_jenis text,                   -- jenis email di kolom email
  add column if not exists email_cek text,                     -- hasil validasi email
  add column if not exists email_dicek date,
  add column if not exists sumber_resmi boolean;               -- true = kontak diambil dari situs resmi perusahaan sendiri

do $$ begin
  alter table public.lg_customer add constraint lg_customer_email_jenis_chk
    check (email_jenis is null or email_jenis in ('Pengadaan / SCM', 'Sales / umum', 'Corsec / IR', 'Lainnya'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.lg_customer add constraint lg_customer_email_cek_chk
    check (email_cek is null or email_cek in ('Terverifikasi', 'MX aktif', 'Domain tanpa MX', 'Usang', 'Belum dicek'));
exception when duplicate_object then null; end $$;

-- isi awal jenis email dari pola alamat
update public.lg_customer set email_jenis = case
    when email ~* '(corsec|corpsec|corp\.sec|corporate\.secretary|sekper|investor|^ir@|corp\.comm|^corporate@)' then 'Corsec / IR'
    when email ~* '^(procure|purchas|vendor|supply|scm|pengadaan|logistic)' then 'Pengadaan / SCM'
    when email ~* '^(info|sales|marketing|cs|customer|export|contact|hello|order|halo)' then 'Sales / umum'
    else 'Lainnya' end
  where email is not null and email <> '' and email_jenis is null;
