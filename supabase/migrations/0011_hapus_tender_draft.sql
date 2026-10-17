-- Pembuat hanya boleh menghapus tender yang masih tahap draft; admin boleh kapan saja.
create policy "hapus tender: hanya tahap draft kecuali admin" on public.tenders as restrictive for delete to authenticated
  using (public.current_role_is('admin') or public.tender_tahap_draft(status));
