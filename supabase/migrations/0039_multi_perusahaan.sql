-- Multi-perusahaan (tenant).
--  • Tender & turunannya (versi, status log, quotation, implementasi, simulasi listrik, layout, file SOP) terpisah per perusahaan.
--  • Master data dipakai bersama (lingkup NULL) oleh perusahaan biasa (LXPI, KLOG, …); perusahaan ber-"master_sendiri"
--    (UJI = penguji) memakai salinan master berisi angka contoh (lingkup = id perusahaan itu).
--  • Trend bisnis (radar tender, kontak customer, jalan, tren) tetap dibagikan ke semua perusahaan (penguji tetap tidak).
--  • Daftar akun: isi kode perusahaan; tanpa/ salah kode → UJI. Super Admin melihat semua tender.
--  • Penguji (role) hanya bisa membuka & mengelola tender buatannya sendiri.

-- ---------- 1. Perusahaan
create table if not exists public.perusahaan (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique check (kode = upper(kode) and length(kode) between 2 and 12),
  nama text not null,
  master_sendiri boolean not null default false,
  dibuat_at timestamptz not null default now()
);
alter table public.perusahaan enable row level security;
drop policy if exists "perusahaan: baca" on public.perusahaan;
create policy "perusahaan: baca" on public.perusahaan for select to authenticated using (true);
drop policy if exists "perusahaan: kelola super admin" on public.perusahaan;
create policy "perusahaan: kelola super admin" on public.perusahaan for all to authenticated using (public.is_master()) with check (public.is_master());
insert into public.perusahaan (kode, nama, master_sendiri) values
  ('LXPI', 'PT LX Pantos Indonesia', false), ('KLOG', 'PT Kamadjaja Logistics', false), ('UJI', 'Penguji Leca (beta)', true)
on conflict (kode) do nothing;

-- ---------- 2. Profil
alter table public.profiles add column if not exists perusahaan_id uuid references public.perusahaan(id);
update public.profiles set perusahaan_id = (select id from public.perusahaan where kode = case when role = 'penguji' then 'UJI' else 'LXPI' end)
 where perusahaan_id is null;
create index if not exists ix_profiles_perusahaan on public.profiles (perusahaan_id);

create or replace function public.my_perusahaan() returns uuid language sql stable security definer set search_path = public as $$
  select perusahaan_id from public.profiles where id = auth.uid();
$$;
-- lingkup master milik pengguna: NULL = master bersama; id perusahaan = salinan khusus (perusahaan master_sendiri)
create or replace function public.lingkup_master() returns uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles pr join public.perusahaan p on p.id = pr.perusahaan_id where pr.id = auth.uid() and p.master_sendiri;
$$;
create or replace function public.sekantor(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_master() or exists (select 1 from public.profiles where id = p_user and perusahaan_id = public.my_perusahaan());
$$;

-- daftar akun: kode perusahaan dari form daftar
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare kd text := upper(trim(coalesce(new.raw_user_meta_data->>'kode_perusahaan', ''))); pid uuid;
begin
  select id into pid from public.perusahaan where kode = kd;
  if pid is null then select id into pid from public.perusahaan where kode = 'UJI'; end if;
  insert into public.profiles (id, full_name, email, perusahaan_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email, pid)
  on conflict (id) do nothing;
  return new;
end $$;

-- hanya Super Admin yang boleh memindah perusahaan akun
create or replace function public.jaga_profil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_pemilik then raise exception 'Akun pemilik (master utama) tidak bisa dihapus.'; end if;
    if auth.uid() is not null and not public.is_master() then raise exception 'Hanya master admin yang bisa menghapus akun.'; end if;
    return old;
  end if;
  if new.is_pemilik is distinct from old.is_pemilik and auth.uid() is not null then raise exception 'Status pemilik tidak bisa diubah.'; end if;
  if old.is_pemilik and (new.role <> 'admin' or new.status <> 'aktif' or not new.is_master) then
    raise exception 'Akun pemilik harus tetap master admin & aktif.';
  end if;
  if new.is_master and (new.role <> 'admin' or new.status <> 'aktif') then
    raise exception 'Master admin harus ber-role admin & aktif.';
  end if;
  if auth.uid() is not null and not public.is_master()
     and (new.status is distinct from old.status or new.role is distinct from old.role or new.is_master is distinct from old.is_master
          or new.disetujui_oleh is distinct from old.disetujui_oleh or new.disetujui_at is distinct from old.disetujui_at
          or new.perusahaan_id is distinct from old.perusahaan_id) then
    raise exception 'Hanya master admin yang bisa mengubah role / status / perusahaan akun.';
  end if;
  return new;
end $$;

-- ---------- 3. Tender per perusahaan
alter table public.tenders add column if not exists perusahaan_id uuid references public.perusahaan(id);
update public.tenders set perusahaan_id = (select id from public.perusahaan where kode = 'LXPI') where perusahaan_id is null;
alter table public.tenders alter column perusahaan_id set not null;
create index if not exists ix_tenders_perusahaan on public.tenders (perusahaan_id);

create or replace function public.tender_set_perusahaan() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_master() then new.perusahaan_id := public.my_perusahaan(); end if;
    new.perusahaan_id := coalesce(new.perusahaan_id, public.my_perusahaan(), (select id from public.perusahaan where kode = 'UJI'));
  elsif new.perusahaan_id is distinct from old.perusahaan_id and auth.uid() is not null and not public.is_master() then
    new.perusahaan_id := old.perusahaan_id;
  end if;
  return new;
end $$;
drop trigger if exists tender_set_perusahaan on public.tenders;
create trigger tender_set_perusahaan before insert or update on public.tenders for each row execute function public.tender_set_perusahaan();

-- tender boleh dilihat: Super Admin semua; selain itu perusahaan yang sama; penguji hanya buatannya sendiri
create or replace function public.tender_terlihat(p_tender uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenders t where t.id = p_tender
    and (public.is_master() or t.perusahaan_id = public.my_perusahaan())
    and (not public.is_penguji() or t.created_by = auth.uid()));
$$;
create or replace function public.tender_terlihat_path(p_path text) returns boolean language plpgsql stable security definer set search_path = public as $$
declare d text := split_part(coalesce(p_path, ''), '/', 1);
begin
  if d !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return public.is_master(); end if;
  return public.tender_terlihat(d::uuid);
end $$;
revoke execute on function public.my_perusahaan(), public.lingkup_master(), public.sekantor(uuid), public.tender_terlihat(uuid),
  public.tender_terlihat_path(text) from public, anon;
grant execute on function public.my_perusahaan(), public.lingkup_master(), public.sekantor(uuid), public.tender_terlihat(uuid),
  public.tender_terlihat_path(text) to authenticated;
revoke execute on function public.handle_new_user(), public.jaga_profil(), public.tender_set_perusahaan() from public, anon, authenticated;

drop policy if exists "perusahaan: tender perusahaan sendiri" on public.tenders;
create policy "perusahaan: tender perusahaan sendiri" on public.tenders as restrictive for all to authenticated
  using (public.is_master() or perusahaan_id = public.my_perusahaan())
  with check (public.is_master() or perusahaan_id = public.my_perusahaan());

-- penguji: tender buatannya sendiri (mengganti larangan total dari 0037)
drop policy if exists "penguji: tanpa akses data kerja" on public.tenders;
drop policy if exists "penguji: hanya tender sendiri" on public.tenders;
create policy "penguji: hanya tender sendiri" on public.tenders as restrictive for all to authenticated
  using (not public.is_penguji() or created_by = (select auth.uid()))
  with check (not public.is_penguji() or created_by = (select auth.uid()));
drop policy if exists "penguji: kelola tender sendiri" on public.tenders;
create policy "penguji: kelola tender sendiri" on public.tenders for all to authenticated
  using (public.is_penguji() and created_by = (select auth.uid()))
  with check (public.is_penguji() and created_by = (select auth.uid()));

-- turunan tender: ikut tender
do $$
declare t text;
begin
  foreach t in array array['quotations', 'tender_versions', 'tender_status_log', 'implementation_tasks'] loop
    execute format('drop policy if exists "penguji: tanpa akses data kerja" on public.%I', t);
    execute format('drop policy if exists "perusahaan: ikut tender" on public.%I', t);
    execute format('create policy "perusahaan: ikut tender" on public.%I as restrictive for all to authenticated
                    using (public.tender_terlihat(tender_id)) with check (public.tender_terlihat(tender_id))', t);
    execute format('drop policy if exists "penguji: turunan tender sendiri" on public.%I', t);
    execute format('create policy "penguji: turunan tender sendiri" on public.%I for all to authenticated
                    using (public.is_penguji() and public.tender_terlihat(tender_id))
                    with check (public.is_penguji() and public.tender_terlihat(tender_id))', t);
  end loop;
end $$;

drop policy if exists "penguji: tanpa akses data kerja" on public.electricity_simulations;
drop policy if exists "perusahaan: ikut tender" on public.electricity_simulations;
create policy "perusahaan: ikut tender" on public.electricity_simulations as restrictive for all to authenticated
  using ((tender_id is null and not public.is_penguji()) or (tender_id is not null and public.tender_terlihat(tender_id)))
  with check ((tender_id is null and not public.is_penguji()) or (tender_id is not null and public.tender_terlihat(tender_id)));
drop policy if exists "penguji: simulasi listrik tender sendiri" on public.electricity_simulations;
create policy "penguji: simulasi listrik tender sendiri" on public.electricity_simulations for all to authenticated
  using (public.is_penguji() and tender_id is not null and public.tender_terlihat(tender_id))
  with check (public.is_penguji() and tender_id is not null and public.tender_terlihat(tender_id));

drop policy if exists "penguji: hanya layout pribadi" on public.warehouse_layouts;
drop policy if exists "perusahaan: ikut tender" on public.warehouse_layouts;
create policy "perusahaan: ikut tender" on public.warehouse_layouts as restrictive for all to authenticated
  using (tender_id is null or public.tender_terlihat(tender_id))
  with check (tender_id is null or public.tender_terlihat(tender_id));

drop policy if exists "perusahaan: sekantor" on public.audit_log;
create policy "perusahaan: sekantor" on public.audit_log as restrictive for all to authenticated
  using (oleh is null or public.sekantor(oleh)) with check (true);

-- file SOP tender ikut tender; penguji tetap tanpa quotation vendor & branding
drop policy if exists "penguji: tanpa file kerja" on storage.objects;
create policy "penguji: tanpa file kerja" on storage.objects as restrictive for all to authenticated
  using (not (public.is_penguji() and bucket_id in ('supplier-quotations', 'quotation-branding')))
  with check (not (public.is_penguji() and bucket_id in ('supplier-quotations', 'quotation-branding')));
drop policy if exists "perusahaan: sop ikut tender" on storage.objects;
create policy "perusahaan: sop ikut tender" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'tender-sop' or public.tender_terlihat_path(name))
  with check (bucket_id <> 'tender-sop' or public.tender_terlihat_path(name));

-- ---------- 4. Master: lingkup bersama / salinan khusus
alter table public.finance_params drop constraint if exists finance_params_pkey;
alter table public.finance_params add column if not exists id bigint generated by default as identity primary key;
alter table public.margin_policy drop constraint if exists margin_policy_pkey;
alter table public.margin_policy add column if not exists id bigint generated by default as identity primary key;
alter table public.payroll_params drop constraint if exists payroll_params_pkey;
alter table public.payroll_params add column if not exists id bigint generated by default as identity primary key;
alter table public.job_levels drop constraint if exists job_levels_role_name_key;
alter table public.it_catalog drop constraint if exists it_catalog_kelompok_item_key;
alter table public.productivity drop constraint if exists productivity_aktivitas_tool_uom_kelas_berat_industri_key;
alter table public.tc_templates drop constraint if exists tc_templates_nama_key;

do $$
declare t text;
begin
  foreach t in array array['price_items', 'warehouses', 'transport_rates', 'it_catalog', 'job_levels', 'payroll_params',
                           'finance_params', 'margin_policy', 'productivity', 'tc_templates'] loop
    execute format('alter table public.%I add column if not exists lingkup uuid references public.perusahaan(id)', t);
    execute format('alter table public.%I alter column lingkup set default public.lingkup_master()', t);
    execute format('create index if not exists %I on public.%I (lingkup)', 'ix_' || t || '_lingkup', t);
    execute format('drop policy if exists "penguji: tanpa akses data kerja" on public.%I', t);
    execute format('drop policy if exists "perusahaan: lingkup master" on public.%I', t);
    execute format('create policy "perusahaan: lingkup master" on public.%I as restrictive for all to authenticated
                    using (lingkup is not distinct from public.lingkup_master())
                    with check (lingkup is not distinct from public.lingkup_master())', t);
  end loop;
end $$;

alter table public.finance_params add constraint finance_params_key_lingkup unique nulls not distinct (key, lingkup);
alter table public.margin_policy add constraint margin_policy_kategori_lingkup unique nulls not distinct (kategori_risiko, lingkup);
alter table public.payroll_params add constraint payroll_params_key_lingkup unique nulls not distinct (key, lingkup);
alter table public.job_levels add constraint job_levels_role_lingkup unique nulls not distinct (role_name, lingkup);
alter table public.it_catalog add constraint it_catalog_kelompok_item_lingkup unique nulls not distinct (kelompok, item, lingkup);
alter table public.productivity add constraint productivity_kunci_lingkup unique nulls not distinct (aktivitas, tool, uom, kelas_berat, industri, lingkup);
alter table public.tc_templates add constraint tc_templates_nama_lingkup unique nulls not distinct (nama, lingkup);

-- ---------- 5. Salinan master berisi angka contoh untuk perusahaan UJI (penguji)
do $$
declare u uuid := (select id from public.perusahaan where kode = 'UJI');
begin
  if exists (select 1 from public.finance_params where lingkup = u) then return; end if;
  insert into public.finance_params (key, label, nilai, catatan, lingkup)
    select key, label, nilai, 'Data contoh', u from public.finance_params where lingkup is null;
  insert into public.margin_policy (kategori_risiko, margin, keterangan, lingkup)
    select kategori_risiko, case kategori_risiko when 'Rendah' then 0.10 when 'Sedang' then 0.15 when 'Tinggi' then 0.20 else margin end, 'Data contoh', u
    from public.margin_policy where lingkup is null;
  insert into public.payroll_params (key, label, nilai, dasar_hukum, catatan, status, lingkup)
    select key, label, nilai, dasar_hukum, 'Data contoh', status, u from public.payroll_params where lingkup is null;
  insert into public.job_levels (role_name, klasifikasi, faktor_umk, tunjangan_bulan, is_outsourcing, status, sumber, lingkup)
    select role_name, klasifikasi, faktor_umk, round(tunjangan_bulan * (0.9 + random() * 0.2)::numeric, -3), is_outsourcing, status, 'Data contoh', u
    from public.job_levels where lingkup is null;
  insert into public.productivity (aktivitas, tahap, tool, role_name, uom, kelas_berat, industri, prod_per_jam, metode, sumber, tanggal, status, benchmark, catatan, detik_per_uom, lingkup)
    select aktivitas, tahap, tool, role_name, uom, kelas_berat, industri, prod_per_jam, metode, 'Data contoh', tanggal, status, null, catatan, detik_per_uom, u
    from public.productivity where lingkup is null;
  insert into public.tc_templates (nama, isi, aktif, lingkup) select nama, isi, aktif, u from public.tc_templates where lingkup is null;
  insert into public.it_catalog (kelompok, item, deskripsi, cost_type, basis, harga, slab_min, slab_max, urutan, sumber, tanggal_harga, berlaku_sampai, status, lingkup)
    select kelompok, item, deskripsi, cost_type, basis, round(harga * (0.9 + random() * 0.2)::numeric, -3), slab_min, slab_max, urutan, 'Data contoh',
      tanggal_harga, berlaku_sampai, status, u from public.it_catalog where lingkup is null;
  insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, daya_watt, vendor, sumber, tanggal_harga,
      berlaku_sampai, owner_role, status, mhe_tipe, kapasitas_ton, sumber_tenaga, tinggi_angkat_m, spesifikasi, created_by, lingkup)
    select kategori, item, satuan, round(harga_beli * (0.85 + random() * 0.3)::numeric, -3), round(harga_sewa_bulan * (0.85 + random() * 0.3)::numeric, -3),
      umur_ekonomis_bulan, daya_watt, 'Vendor Contoh ' || chr(65 + (row_number() over (order by id))::int % 6), 'Data contoh', tanggal_harga,
      berlaku_sampai, owner_role, status, mhe_tipe, kapasitas_ton, sumber_tenaga, tinggi_angkat_m, spesifikasi, null, u
    from public.price_items where lingkup is null;
  insert into public.transport_rates (moda, origin, destination, armada, basis, harga, vendor, lead_time_hari, min_charge, cakupan, berlaku_dari,
      berlaku_sampai, sumber, catatan, status, created_by, lingkup)
    select moda, origin, destination, armada, basis, round(harga * (0.85 + random() * 0.3)::numeric, -3), 'Vendor Contoh ' || chr(65 + (row_number() over (order by id))::int % 6),
      lead_time_hari, min_charge, cakupan, berlaku_dari, berlaku_sampai, 'Data contoh', null, status, null, u
    from public.transport_rates where lingkup is null;
  insert into public.warehouses (nama, pemilik, provinsi, kab_kota, alamat, luas_m2, harga_sewa_m2_bulan, harga_per_bulan, tinggi_bersih_m,
      daya_lantai_ton_m2, jumlah_dock, daya_listrik_kva, tipe, fasilitas, foto, sumber, tanggal_harga, berlaku_sampai, status, jumlah_gate, created_by, lingkup)
    select 'Gudang Contoh ' || n, 'Pemilik Contoh', provinsi, kab_kota, 'Kawasan Industri Contoh, ' || coalesce(kab_kota, ''), luas_m2,
      round(harga_sewa_m2_bulan * (0.85 + random() * 0.3)::numeric, -2), round(harga_per_bulan * (0.85 + random() * 0.3)::numeric, -4), tinggi_bersih_m,
      daya_lantai_ton_m2, jumlah_dock, daya_listrik_kva, tipe, fasilitas, '{}', 'Data contoh', tanggal_harga, berlaku_sampai, status, jumlah_gate, null, u
    from (select *, row_number() over (order by luas_m2) as n from public.warehouses where lingkup is null) w where n <= 4;
end $$;
