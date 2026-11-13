-- Akun baru default ber-peran "penguji": setelah di-ACC admin, akun ini TIDAK bisa melihat data kerja
-- (tender, quotation, harga, gudang, kontak customer, profil pengguna lain, file SOP/quotation vendor).
-- Yang tetap terbuka hanya referensi publik: UMK, UMP, hari libur, tarif listrik PLN.
-- Super Admin (is_master) tidak pernah dianggap penguji.

alter table public.profiles alter column role set default 'penguji';

create or replace function public.is_penguji()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'penguji' and not p.is_master);
$$;
revoke execute on function public.is_penguji() from public, anon;
grant execute on function public.is_penguji() to authenticated;

-- Tabel data kerja: penguji ditolak seluruhnya (kebijakan RESTRICTIVE → berlaku di atas semua kebijakan lain)
do $$
declare t text;
begin
  foreach t in array array[
    'tenders','tender_versions','tender_status_log','quotations','quotation_branding','implementation_tasks',
    'price_items','warehouses','transport_rates','it_catalog','job_levels','payroll_params','finance_params',
    'margin_policy','productivity','tc_templates','electricity_simulations','tender_radar','lg_customer',
    'lg_jalan','lg_tren','audit_log']
  loop
    execute format('drop policy if exists "penguji: tanpa akses data kerja" on public.%I', t);
    execute format('create policy "penguji: tanpa akses data kerja" on public.%I as restrictive for all to authenticated
                    using (not public.is_penguji()) with check (not public.is_penguji())', t);
  end loop;
end $$;

-- Profil: penguji hanya melihat & mengubah profilnya sendiri (nama, email, telepon pengguna lain tersembunyi)
drop policy if exists "penguji: hanya profil sendiri" on public.profiles;
create policy "penguji: hanya profil sendiri" on public.profiles as restrictive for all to authenticated
  using (not public.is_penguji() or id = (select auth.uid()))
  with check (not public.is_penguji() or id = (select auth.uid()));

-- Layout gudang yang terhubung ke tender: penguji hanya boleh layout pribadi miliknya
drop policy if exists "penguji: hanya layout pribadi" on public.warehouse_layouts;
create policy "penguji: hanya layout pribadi" on public.warehouse_layouts as restrictive for all to authenticated
  using (not public.is_penguji() or (tender_id is null and dibuat_oleh = (select auth.uid())))
  with check (not public.is_penguji() or (tender_id is null and dibuat_oleh = (select auth.uid())));

-- File: SOP tender, quotation vendor & branding tertutup untuk penguji
drop policy if exists "penguji: tanpa file kerja" on storage.objects;
create policy "penguji: tanpa file kerja" on storage.objects as restrictive for all to authenticated
  using (not (public.is_penguji() and bucket_id in ('tender-sop', 'supplier-quotations', 'quotation-branding')))
  with check (not (public.is_penguji() and bucket_id in ('tender-sop', 'supplier-quotations', 'quotation-branding')));
