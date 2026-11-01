-- Update trend bisnis: email corsec / investor relation dipisah dari email utama (hanya cadangan, bukan jalur pengadaan).
alter table public.lg_customer add column if not exists email_corsec text;
update public.lg_customer
   set email_corsec = email, email = null, email_jenis = null, email_cek = null
 where email ~* '(corsec|corpsec|corp\.sec|corpsecretary|corporate\.secretary|sekper|investor|corporate@|corp\.comm|^ir@)';
