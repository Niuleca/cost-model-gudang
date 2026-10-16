-- Draft tender (draft, dihitung, review, approved) hanya bisa diedit pembuatnya dan admin/master.
-- Akun lain tetap bisa melihat. Memakai policy RESTRICTIVE sehingga policy lama tidak perlu dihapus.

create or replace function public.tender_tahap_draft(s public.tender_status) returns boolean
  language sql immutable as $$ select s in ('draft','dihitung','review','approved') $$;

create or replace function public.boleh_edit_tender(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenders t
    where t.id = p_id
      and (public.current_role_is('admin') or t.created_by = auth.uid() or not public.tender_tahap_draft(t.status))
  ) $$;

create policy "draft milik pembuat: ubah" on public.tenders as restrictive for update to authenticated
  using (public.current_role_is('admin') or created_by = auth.uid() or not public.tender_tahap_draft(status));
create policy "draft milik pembuat: hapus" on public.tenders as restrictive for delete to authenticated
  using (public.current_role_is('admin') or created_by = auth.uid());

create policy "draft milik pembuat: versi tambah" on public.tender_versions as restrictive for insert to authenticated
  with check (public.boleh_edit_tender(tender_id));
create policy "draft milik pembuat: versi ubah" on public.tender_versions as restrictive for update to authenticated
  using (public.boleh_edit_tender(tender_id));
create policy "draft milik pembuat: versi hapus" on public.tender_versions as restrictive for delete to authenticated
  using (public.boleh_edit_tender(tender_id));

create policy "draft milik pembuat: quotation tambah" on public.quotations as restrictive for insert to authenticated
  with check (public.boleh_edit_tender(tender_id));
create policy "draft milik pembuat: quotation ubah" on public.quotations as restrictive for update to authenticated
  using (public.boleh_edit_tender(tender_id));
create policy "draft milik pembuat: quotation hapus" on public.quotations as restrictive for delete to authenticated
  using (public.boleh_edit_tender(tender_id));

-- Pembuat tender tidak bisa dipindahkan oleh non-admin
create or replace function public.jaga_created_by() returns trigger language plpgsql as $$
begin
  if new.created_by is distinct from old.created_by and not public.current_role_is('admin') then
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
create trigger t_tenders_jaga_pembuat before update on public.tenders for each row execute function public.jaga_created_by();
