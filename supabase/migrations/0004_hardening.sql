-- Pengamanan fungsi (hasil Supabase security advisor)
alter function public.touch_updated_at() set search_path = public;
revoke execute on function public.guard_price_approval(), public.guard_quotation_approval(), public.guard_quotation_insert(),
  public.guard_status_approval(), public.handle_new_user(), public.log_tender_status(), public.tulis_audit()
  from public, anon, authenticated;
revoke execute on function public.current_role_is(variadic public.app_role[]), public.my_role() from public, anon;
grant execute on function public.current_role_is(variadic public.app_role[]), public.my_role() to authenticated;
revoke execute on function public.buat_checklist_implementasi(uuid, date) from public, anon;
grant execute on function public.buat_checklist_implementasi(uuid, date) to authenticated;

-- Isi tipe/tonase MHE dari nama item seed
update public.price_items set
  mhe_tipe = case when item ilike 'Counterbalance%' then 'Counter Balance' when item ilike 'Reach Truck%' then 'Reach Truck' when item ilike 'Pallet Mover%' then 'Pallet Mover' when item ilike 'Hand Pallet%' then 'Hand Pallet' end,
  kapasitas_ton = case when item ilike '%10 Ton%' then 10 when item ilike '%5 Ton%' and item not ilike '%2.5 Ton%' and item not ilike '%1.5%' then 5 when item ilike '% 3 Ton%' then 3 when item ilike '%2.5 Ton%' then 2.5 when item ilike '%1.5-2 Ton%' then 2 end,
  sumber_tenaga = case when item ilike '%Electric%' or item ilike 'Pallet Mover%' then 'Electric' when item ilike '%Manual%' then 'Manual' end,
  tinggi_angkat_m = case when item ilike '%11m%' then 11 end
where kategori = 'MHE' and mhe_tipe is null;
