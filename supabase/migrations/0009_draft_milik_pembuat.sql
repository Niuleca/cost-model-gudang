-- Draft tender hanya bisa diedit pembuatnya (dan admin/master). Akun lain tetap bisa melihat.
-- Tahap draft = draft, dihitung, review, approved (sama dengan menu "Draft tender").

create or replace function public.tender_tahap_draft(s public.tender_status) returns boolean
  language sql immutable as $$ select s in ('draft','dihitung','review','approved') $$;

-- Boleh mengubah tender (dan turunannya)?
create or replace function public.boleh_edit_tender(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenders t
    where t.id = p_id
      and public.current_role_is('solution_design','commercial','finance','admin')
      and (public.current_role_is('admin') or t.created_by = auth.uid() or not public.tender_tahap_draft(t.status))
  ) $$;

drop policy if exists "tender: tim tender" on public.tenders;
create policy "tender: tim tender baca" on public.tenders for select to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'));
create policy "tender: tim tender buat" on public.tenders for insert to authenticated
  with check (public.current_role_is('solution_design','commercial','finance','admin'));
create policy "tender: ubah (draft milik pembuat)" on public.tenders for update to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin')
         and (public.current_role_is('admin') or created_by = auth.uid() or not public.tender_tahap_draft(status)))
  with check (public.current_role_is('solution_design','commercial','finance','admin'));
create policy "tender: hapus (draft milik pembuat)" on public.tenders for delete to authenticated
  using (public.current_role_is('admin') or (public.current_role_is('solution_design','commercial','finance') and created_by = auth.uid()));

drop policy if exists "tender anak: tim tender" on public.tender_versions;
create policy "versi: tim tender baca" on public.tender_versions for select to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'));
create policy "versi: tulis bila boleh edit tender" on public.tender_versions for all to authenticated
  using (public.boleh_edit_tender(tender_id)) with check (public.boleh_edit_tender(tender_id));

drop policy if exists "quotation: tim tender" on public.quotations;
create policy "quotation: tim tender baca" on public.quotations for select to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'));
create policy "quotation: tulis bila boleh edit tender" on public.quotations for all to authenticated
  using (public.boleh_edit_tender(tender_id)) with check (public.boleh_edit_tender(tender_id));

-- Pembuat tender tidak bisa dipindahkan oleh non-admin
create or replace function public.jaga_created_by() returns trigger language plpgsql as $$
begin
  if new.created_by is distinct from old.created_by and not public.current_role_is('admin') then
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
drop trigger if exists t_tenders_jaga_pembuat on public.tenders;
create trigger t_tenders_jaga_pembuat before update on public.tenders for each row execute function public.jaga_created_by();
