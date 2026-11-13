-- Merapikan temuan Supabase advisor (keamanan & performa). Tidak mengubah siapa boleh melihat/ubah data.

-- 1) Fungsi bantu & admin: tidak boleh dipanggil pengunjung tanpa login (anon). Pengguna login tetap perlu
--    karena dipakai di aturan RLS / tombol admin (fungsi admin sendiri sudah memeriksa Super Admin).
revoke execute on function public.boleh_edit_tender(uuid) from public, anon;
revoke execute on function public.is_aktif() from public, anon;
revoke execute on function public.is_approver() from public, anon;
revoke execute on function public.is_master() from public, anon;
revoke execute on function public.punya_role(variadic text[]) from public, anon;
revoke execute on function public.current_role_is(variadic public.app_role[]) from public, anon;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.hapus_akun(uuid) from public, anon;
revoke execute on function public.set_password_akun(uuid, text) from public, anon;
grant execute on function public.boleh_edit_tender(uuid), public.is_aktif(), public.is_approver(), public.is_master(),
  public.punya_role(variadic text[]), public.current_role_is(variadic public.app_role[]), public.my_role(),
  public.hapus_akun(uuid), public.set_password_akun(uuid, text) to authenticated;

-- 2) Fungsi trigger: hanya dijalankan oleh trigger, tidak perlu bisa dipanggil lewat API sama sekali
revoke execute on function public.jaga_profil() from public, anon, authenticated;
revoke execute on function public.lg_customer_jejak() from public, anon, authenticated;
revoke execute on function public.sinkron_email_profil() from public, anon, authenticated;
revoke execute on function public.tender_radar_jejak() from public, anon, authenticated;
revoke execute on function public.warehouse_layouts_jejak() from public, anon, authenticated;
revoke execute on function public.jaga_created_by() from public, anon, authenticated;

-- 3) search_path tetap untuk 2 fungsi
alter function public.tender_tahap_draft(public.tender_status) set search_path = public;
alter function public.jaga_created_by() set search_path = public;

-- 4) RLS: auth.uid() dibungkus (select …) supaya dihitung sekali per query, bukan per baris (isi aturan sama persis)
alter policy "profil: ubah diri sendiri (bukan role)" on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()) and role = public.my_role());
alter policy "gerbang: akun aktif" on public.profiles using (public.is_aktif() or id = (select auth.uid()));
alter policy "radar: hapus" on public.tender_radar
  using (public.is_master() or public.punya_role('admin', 'manager') or dibuat_oleh = (select auth.uid()));
alter policy "branding: tambah milik sendiri" on public.quotation_branding
  with check (created_by = (select auth.uid()) and public.punya_role('admin', 'manager', 'solution_design', 'commercial', 'finance'));
alter policy "branding: hapus milik sendiri / admin" on public.quotation_branding
  using (created_by = (select auth.uid()) or public.punya_role('admin', 'manager'));
alter policy "draft milik pembuat: ubah" on public.tenders
  using (public.punya_role('admin', 'manager') or created_by = (select auth.uid()) or not public.tender_tahap_draft(status));
alter policy "draft milik pembuat: hapus" on public.tenders
  using (public.punya_role('admin', 'manager') or created_by = (select auth.uid()));
alter policy "layout pribadi: milik pembuat" on public.warehouse_layouts
  using (tender_id is null and dibuat_oleh = (select auth.uid()) and public.is_aktif())
  with check (tender_id is null and dibuat_oleh = (select auth.uid()) and public.is_aktif());

-- 5) Index untuk setiap foreign key yang belum punya index (join & hapus lebih cepat saat data bertambah)
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tabel, a.attname as kolom, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    execute format('create index if not exists %I on %s (%I)', 'ix_' || r.conname, r.tabel, r.kolom);
  end loop;
end $$;
