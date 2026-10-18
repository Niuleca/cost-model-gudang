-- Hapus akun (khusus master admin). Data kerja akun itu (tender, quotation, harga, gudang, log) TIDAK ikut hilang:
-- kepemilikannya dialihkan ke master yang menghapus. Logo & TTD milik akun itu ikut dihapus.
create or replace function public.hapus_akun(target uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare saya uuid := auth.uid();
begin
  if not public.is_master() then raise exception 'Hanya master admin yang bisa menghapus akun.'; end if;
  if target = saya then raise exception 'Tidak bisa menghapus akun sendiri.'; end if;
  if exists (select 1 from public.profiles where id = target and is_pemilik) then raise exception 'Akun pemilik tidak bisa dihapus.'; end if;
  if not exists (select 1 from auth.users where id = target) then raise exception 'Akun tidak ditemukan.'; end if;

  update public.tenders set created_by = saya where created_by = target;
  update public.tender_versions set created_by = saya where created_by = target;
  update public.quotations set created_by = saya where created_by = target;
  update public.quotations set approved_by = saya where approved_by = target;
  update public.price_items set created_by = saya where created_by = target;
  update public.price_items set approved_by = saya where approved_by = target;
  update public.warehouses set created_by = saya where created_by = target;
  update public.tender_status_log set oleh = saya where oleh = target;
  update public.electricity_simulations set created_by = saya where created_by = target;
  delete from public.quotation_branding where created_by = target;
  update public.profiles set disetujui_oleh = null where disetujui_oleh = target;

  delete from auth.users where id = target;   -- profil ikut terhapus (on delete cascade)
end $$;
revoke all on function public.hapus_akun(uuid) from public, anon;
grant execute on function public.hapus_akun(uuid) to authenticated;
