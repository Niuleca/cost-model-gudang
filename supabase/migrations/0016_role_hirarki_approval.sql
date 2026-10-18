-- Hirarki role + approval quotation.
-- master admin : bebas tanpa hambatan
-- admin/manager: tender & quotation tanpa review, input harga, approve pekerjaan SD & BD
-- solution_design / commercial (= Business Development): tender, quotation (unduh/print/kirim menunggu approval), input harga, productivity
-- procurement / it / hr: update Price Inquiry · operations (Operational): update Productivity
-- finance / engineering: tetap seperti sebelumnya

alter type public.app_role add value if not exists 'manager';

-- Cek role berbasis teks (aman dipakai di transaksi yang sama dengan penambahan nilai enum). Master selalu lolos.
create or replace function public.punya_role(variadic roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aktif'
                 and (p.is_master or p.role::text = any(roles)));
$$;
create or replace function public.is_approver() returns boolean language sql stable security definer set search_path = public as $$
  select public.punya_role('admin', 'manager');
$$;

-- ---------- Tim tender (tender, versi, quotation, log, branding, implementasi) ----------
do $$
declare tim text := $t$public.punya_role('admin','manager','solution_design','commercial','finance')$t$;
begin
  execute 'drop policy if exists "tender: tim tender" on public.tenders';
  execute format('create policy "tender: tim tender" on public.tenders for all to authenticated using (%s) with check (%s)', tim, tim);
  execute 'drop policy if exists "tender anak: tim tender" on public.tender_versions';
  execute format('create policy "tender anak: tim tender" on public.tender_versions for all to authenticated using (%s) with check (%s)', tim, tim);
  execute 'drop policy if exists "quotation: tim tender" on public.quotations';
  execute format('create policy "quotation: tim tender" on public.quotations for all to authenticated using (%s) with check (%s)', tim, tim);
  execute 'drop policy if exists "status log: tim tender" on public.tender_status_log';
  execute format('create policy "status log: tim tender" on public.tender_status_log for select to authenticated using (%s)', tim);
  execute 'drop policy if exists "audit: baca tim tender" on public.audit_log';
  execute format('create policy "audit: baca tim tender" on public.audit_log for select to authenticated using (%s)', tim);
  execute 'drop policy if exists "implementasi: tim tender kelola" on public.implementation_tasks';
  execute format('create policy "implementasi: tim tender kelola" on public.implementation_tasks for all to authenticated using (%s) with check (%s)', tim, tim);
  execute 'drop policy if exists "branding: tim tender baca" on public.quotation_branding';
  execute format('create policy "branding: tim tender baca" on public.quotation_branding for select to authenticated using (%s)', tim);
  execute 'drop policy if exists "branding: tambah milik sendiri" on public.quotation_branding';
  execute format('create policy "branding: tambah milik sendiri" on public.quotation_branding for insert to authenticated with check (created_by = auth.uid() and %s)', tim);
end $$;

-- Draft milik pembuat: admin / manager / master boleh mengubah & menghapus draft siapa pun
create or replace function public.boleh_edit_tender(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenders t where t.id = p_id
    and (public.punya_role('admin','manager') or t.created_by = auth.uid() or not public.tender_tahap_draft(t.status)));
$$;
drop policy if exists "draft milik pembuat: ubah" on public.tenders;
create policy "draft milik pembuat: ubah" on public.tenders as restrictive for update to authenticated
  using (public.punya_role('admin','manager') or created_by = auth.uid() or not public.tender_tahap_draft(status));
drop policy if exists "draft milik pembuat: hapus" on public.tenders;
create policy "draft milik pembuat: hapus" on public.tenders as restrictive for delete to authenticated
  using (public.punya_role('admin','manager') or created_by = auth.uid());
drop policy if exists "hapus tender: hanya tahap draft kecuali admin" on public.tenders;
create policy "hapus tender: hanya tahap draft kecuali admin" on public.tenders as restrictive for delete to authenticated
  using (public.punya_role('admin','manager') or public.tender_tahap_draft(status));

-- ---------- Price Inquiry (input harga): manager, SD, BD, procurement, IT, HR ----------
drop policy if exists "tulis pemilik harga" on public.price_items;
create policy "tulis pemilik harga" on public.price_items for insert to authenticated
  with check (public.punya_role('admin','manager','solution_design','commercial','procurement','it','hr') or public.current_role_is(owner_role));
drop policy if exists "ubah pemilik/approver harga" on public.price_items;
create policy "ubah pemilik/approver harga" on public.price_items for update to authenticated
  using (public.punya_role('admin','manager','solution_design','commercial','procurement','it','hr') or public.current_role_is(owner_role))
  with check (public.punya_role('admin','manager','solution_design','commercial','procurement','it','hr') or public.current_role_is(owner_role));
drop policy if exists "hapus pemilik harga" on public.price_items;
create policy "hapus pemilik harga" on public.price_items for delete to authenticated
  using (public.punya_role('admin','manager') or (public.current_role_is(owner_role) and status = 'draft'));

drop policy if exists "tulis Procurement" on public.warehouses;
create policy "tulis Procurement" on public.warehouses for all to authenticated
  using (public.punya_role('admin','manager','solution_design','commercial','procurement'))
  with check (public.punya_role('admin','manager','solution_design','commercial','procurement'));
drop policy if exists "tulis IT" on public.it_catalog;
create policy "tulis IT" on public.it_catalog for all to authenticated
  using (public.punya_role('admin','manager','solution_design','commercial','it'))
  with check (public.punya_role('admin','manager','solution_design','commercial','it'));
drop policy if exists "tulis HR" on public.job_levels;
create policy "tulis HR" on public.job_levels for all to authenticated
  using (public.punya_role('admin','manager','solution_design','commercial','hr'))
  with check (public.punya_role('admin','manager','solution_design','commercial','hr'));
drop policy if exists "tulis HR" on public.payroll_params;
create policy "tulis HR" on public.payroll_params for all to authenticated
  using (public.punya_role('admin','manager','solution_design','commercial','hr'))
  with check (public.punya_role('admin','manager','solution_design','commercial','hr'));
drop policy if exists "tulis HR" on public.umk;
create policy "tulis HR" on public.umk for all to authenticated using (public.punya_role('admin','manager','hr')) with check (public.punya_role('admin','manager','hr'));
drop policy if exists "tulis HR" on public.ump;
create policy "tulis HR" on public.ump for all to authenticated using (public.punya_role('admin','manager','hr')) with check (public.punya_role('admin','manager','hr'));
drop policy if exists "tulis tim" on public.electricity_simulations;
create policy "tulis tim" on public.electricity_simulations for all to authenticated
  using (public.punya_role('admin','manager','solution_design','commercial','procurement','engineering'))
  with check (public.punya_role('admin','manager','solution_design','commercial','procurement','engineering'));
drop policy if exists "tulis Engineering" on public.electricity_tariffs;
create policy "tulis Engineering" on public.electricity_tariffs for all to authenticated
  using (public.punya_role('admin','manager','engineering')) with check (public.punya_role('admin','manager','engineering'));

-- ---------- Productivity: manager, SD, BD, Operational ----------
drop policy if exists "tulis Ops" on public.productivity;
create policy "tulis Ops" on public.productivity for all to authenticated
  using (public.punya_role('admin','manager','solution_design','commercial','operations'))
  with check (public.punya_role('admin','manager','solution_design','commercial','operations'));

-- ---------- Master lain ----------
drop policy if exists "tulis Ops" on public.holidays;
create policy "tulis Ops" on public.holidays for all to authenticated using (public.punya_role('admin','manager','operations','hr')) with check (public.punya_role('admin','manager','operations','hr'));
drop policy if exists "tulis Finance" on public.finance_params;
create policy "tulis Finance" on public.finance_params for all to authenticated using (public.punya_role('admin','manager','finance')) with check (public.punya_role('admin','manager','finance'));
drop policy if exists "tulis Finance" on public.margin_policy;
create policy "tulis Finance" on public.margin_policy for all to authenticated using (public.punya_role('admin','manager','finance')) with check (public.punya_role('admin','manager','finance'));
drop policy if exists "tulis Commercial" on public.tc_templates;
create policy "tulis Commercial" on public.tc_templates for all to authenticated using (public.punya_role('admin','manager','commercial')) with check (public.punya_role('admin','manager','commercial'));

-- ---------- Approval quotation ----------
-- status: draft → menunggu (diajukan SD/BD) → approved (langsung diproses) | revisi (note wajib) | ditolak (note wajib)
-- approved → terkirim; direvisi / batal tetap seperti sebelumnya.
alter table public.quotations
  add column if not exists catatan_approval text,
  add column if not exists diputus_oleh uuid references auth.users(id),
  add column if not exists diputus_at timestamptz,
  add column if not exists diajukan_at timestamptz;

create or replace function public.guard_quotation_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- manager / admin / master: langsung approved tanpa review; lainnya mulai sebagai draft
  if public.is_approver() then
    if new.status in ('draft', 'menunggu') then new.status := 'approved'; end if;
  elsif new.status not in ('draft', 'menunggu') then
    new.status := 'draft';
  end if;
  if new.status = 'menunggu' then new.diajukan_at := now(); end if;
  if new.status = 'approved' then new.approved_by := auth.uid(); new.approved_at := now(); new.diputus_oleh := auth.uid(); new.diputus_at := now(); end if;
  return new;
end $$;

create or replace function public.guard_quotation_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('approved', 'revisi', 'ditolak') and not public.is_approver() then
      raise exception 'Hanya manager / master admin yang bisa approve, minta revisi, atau menolak quotation.';
    end if;
    if new.status in ('revisi', 'ditolak') and coalesce(btrim(new.catatan_approval), '') = '' then
      raise exception 'Catatan wajib diisi untuk revisi / tolak.';
    end if;
    if new.status = 'terkirim' and old.status not in ('approved', 'terkirim') then
      raise exception 'Quotation harus di-approve dulu sebelum dikirim.';
    end if;
    if new.status = 'menunggu' then new.diajukan_at := now(); end if;
    if new.status in ('approved', 'revisi', 'ditolak') then new.diputus_oleh := auth.uid(); new.diputus_at := now(); end if;
    if new.status = 'approved' then new.approved_by := auth.uid(); new.approved_at := now(); end if;
  end if;
  -- isi quotation yang sudah approved/terkirim tidak boleh diubah non-approver (kecuali status → direvisi/batal)
  if old.status in ('approved', 'terkirim') and not public.is_approver()
     and new.status not in ('direvisi', 'batal', 'terkirim')
     and (new.rate_card is distinct from old.rate_card or new.term_condition is distinct from old.term_condition or new.nomor is distinct from old.nomor) then
    raise exception 'Quotation yang sudah di-approve tidak bisa diubah. Buat revisi.';
  end if;
  return new;
end $$;
