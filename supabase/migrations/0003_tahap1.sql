-- =====================================================================
-- Tahap 1: master gudang + foto, MHE tipe/tonase, katalog IT (format BAP),
-- benchmark produktivitas per industri, status project + log, revisi
-- quotation, list implementasi, audit log, view perbandingan & dashboard.
-- =====================================================================

-- ---------- Kategori harga tambahan ----------
alter type public.price_category add value if not exists 'Seragam';
alter type public.price_category add value if not exists 'Konsumsi';
alter type public.price_category add value if not exists 'Printer';

-- ---------- MHE: tipe, tonase, tenaga ----------
alter table public.price_items
  add column if not exists mhe_tipe text check (mhe_tipe in ('Counter Balance','Reach Truck','Pallet Mover','Hand Pallet','Stacker','VNA','Order Picker','Clamp','Lainnya')),
  add column if not exists kapasitas_ton numeric(6,2),
  add column if not exists sumber_tenaga text check (sumber_tenaga in ('Electric','Diesel','LPG','Manual')),
  add column if not exists tinggi_angkat_m numeric(6,2),
  add column if not exists spesifikasi text;

-- View status harga diperluas dengan kolom MHE (create or replace, kolom baru di akhir — tanpa drop)
create or replace view public.price_items_status with (security_invoker = true) as
select p.id, p.kategori, p.item, p.satuan, p.harga_beli, p.harga_sewa_bulan, p.umur_ekonomis_bulan, p.daya_watt,
       p.vendor, p.sumber, p.tanggal_harga, p.berlaku_sampai, p.owner_role, p.status, p.approved_by, p.approved_at,
       p.created_by, p.updated_at,
       case when p.status = 'approved' and p.berlaku_sampai is not null and p.berlaku_sampai < current_date
            then 'expired' else p.status::text end as status_efektif,
       p.mhe_tipe, p.kapasitas_ton, p.sumber_tenaga, p.tinggi_angkat_m, p.spesifikasi
from public.price_items p;

-- ---------- Master gudang (Procurement) ----------
create table public.warehouses (
  id                 uuid primary key default gen_random_uuid(),
  nama               text not null,
  pemilik            text,
  provinsi           text not null,
  kab_kota           text not null,
  alamat             text,
  gmaps_url          text,
  latitude           numeric(9,6),
  longitude          numeric(9,6),
  luas_m2            numeric(12,2) not null check (luas_m2 > 0),
  harga_sewa_m2_bulan numeric(14,2),
  harga_per_bulan    numeric(16,2),
  tinggi_bersih_m    numeric(6,2),
  daya_lantai_ton_m2 numeric(6,2),
  jumlah_dock        int,
  daya_listrik_kva   numeric(10,2),
  tipe               text not null default 'Ambient',
  fasilitas          text,                    -- office, toilet, mushola, parkir truk, dll
  foto               text[] not null default '{}', -- path di Storage bucket 'warehouse-photos'
  kontak             text,
  sumber             text,
  tanggal_harga      date,
  berlaku_sampai     date,
  status             public.data_status not null default 'draft',
  created_by         uuid references auth.users(id) default auth.uid(),
  updated_at         timestamptz not null default now(),
  check (harga_sewa_m2_bulan is not null or harga_per_bulan is not null)
);
create trigger t_warehouses_upd before update on public.warehouses for each row execute function public.touch_updated_at();

-- ---------- Katalog IT (format BAP KLOG) ----------
create table public.it_catalog (
  id          bigint generated always as identity primary key,
  kelompok    text not null,      -- Software - WMS Solution, Hardware & Device, Networking Cabling, ...
  item        text not null,
  deskripsi   text,
  cost_type   text not null,      -- PUPM, PDPM, OTC/Unit, OTC, Transaction/Month, Cost/Month, Yearly, Cost/Mandays, Monthly/Site ...
  basis       text not null check (basis in ('Bulanan','Transaksi','Tahunan','Sekali')),
  harga       numeric(16,2) not null check (harga >= 0),
  slab_min    numeric(14,0),
  slab_max    numeric(14,0),
  urutan      int not null default 0,
  sumber      text,
  tanggal_harga date,
  berlaku_sampai date,
  status      public.data_status not null default 'draft',
  updated_at  timestamptz not null default now(),
  unique (kelompok, item)
);
create trigger t_it_catalog_upd before update on public.it_catalog for each row execute function public.touch_updated_at();

-- ---------- Produktivitas: benchmark per industri ----------
alter table public.productivity
  add column if not exists benchmark jsonb not null default '{}'::jsonb,   -- {"Retail-Consumer":"30-40", ...}
  add column if not exists catatan text,
  add column if not exists detik_per_uom numeric(12,2) generated always as (round(3600 / prod_per_jam, 2)) stored;

-- ---------- Status project ----------
alter type public.tender_status add value if not exists 'negosiasi';
alter type public.tender_status add value if not exists 'drop';
alter type public.tender_status add value if not exists 'implementasi';
alter type public.tender_status add value if not exists 'go_live';
alter type public.tender_status add value if not exists 'selesai';

alter table public.tenders
  add column if not exists warehouse_id uuid references public.warehouses(id),
  add column if not exists pic text,
  add column if not exists alasan_hasil text,          -- alasan menang / kalah / drop
  add column if not exists tanggal_keputusan date;

create table public.tender_status_log (
  id          bigint generated always as identity primary key,
  tender_id   uuid not null references public.tenders(id) on delete cascade,
  dari        text,
  ke          text not null,
  catatan     text,
  oleh        uuid references auth.users(id) default auth.uid(),
  waktu       timestamptz not null default now()
);
create or replace function public.log_tender_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.tender_status_log (tender_id, dari, ke, catatan) values (new.id, null, new.status::text, 'Tender dibuat');
  elsif new.status is distinct from old.status then
    insert into public.tender_status_log (tender_id, dari, ke, catatan) values (new.id, old.status::text, new.status::text, new.alasan_hasil);
  end if;
  return new;
end $$;
create trigger t_tender_status_log after insert or update of status on public.tenders
  for each row execute function public.log_tender_status();

-- ---------- Quotation: revisi ----------
alter table public.quotations
  add column if not exists revisi int not null default 0,
  add column if not exists parent_id uuid references public.quotations(id),
  add column if not exists catatan_revisi text,
  add column if not exists tagihan_sekali jsonb not null default '[]'::jsonb,   -- one-time charge (IT, setup)
  add column if not exists info_gudang jsonb;                                  -- snapshot gudang untuk PDF
alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations add constraint quotations_status_check check (status in ('draft','approved','terkirim','direvisi','batal'));

-- ---------- List implementasi ----------
create table public.implementation_tasks (
  id          bigint generated always as identity primary key,
  tender_id   uuid not null references public.tenders(id) on delete cascade,
  fase        text not null,
  tugas       text not null,
  departemen  public.app_role,
  pic         text,
  mulai       date,
  target      date,
  selesai     date,
  status      text not null default 'Belum mulai' check (status in ('Belum mulai','Berjalan','Selesai','Terlambat','Blocked')),
  progress    int not null default 0 check (progress between 0 and 100),
  catatan     text,
  urutan      int not null default 0,
  updated_at  timestamptz not null default now()
);
create trigger t_impl_upd before update on public.implementation_tasks for each row execute function public.touch_updated_at();

-- Checklist standar implementasi gudang (dibuat saat tender menang)
create or replace function public.buat_checklist_implementasi(p_tender uuid, p_golive date default null)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if exists (select 1 from public.implementation_tasks where tender_id = p_tender) then return 0; end if;
  insert into public.implementation_tasks (tender_id, fase, tugas, departemen, target, urutan)
  select p_tender, f, t, d::public.app_role, case when p_golive is null then null else p_golive + h end, row_number() over ()
  from (values
    ('1. Persiapan','Kick-off meeting & project charter ditandatangani','solution_design',-60),
    ('1. Persiapan','Kontrak / PO customer diterima','commercial',-55),
    ('2. Fasilitas','Kontrak sewa gudang & serah terima','procurement',-45),
    ('2. Fasilitas','Fit-out: office, toilet, charging area, pencahayaan','engineering',-30),
    ('2. Fasilitas','Instalasi listrik & titik lampu sesuai hitungan','engineering',-30),
    ('2. Fasilitas','HSE: APAR, rambu, P3K, jalur evakuasi','engineering',-20),
    ('3. MHE & Racking','PO racking & instalasi','procurement',-30),
    ('3. MHE & Racking','Sewa/PO forklift & MHE lain','procurement',-20),
    ('4. IT & WMS','Jaringan, WiFi, CCTV terpasang','it',-20),
    ('4. IT & WMS','Konfigurasi WMS & master data SKU','it',-15),
    ('4. IT & WMS','Interface/EDI customer diuji (UAT)','it',-10),
    ('5. Manpower','Rekrutmen sesuai headcount cost model','hr',-20),
    ('5. Manpower','Training operator, K3, dan WMS','operations',-7),
    ('6. SOP & WI','SOP inbound, storage, outbound, return disetujui','operations',-10),
    ('6. SOP & WI','Work instruction & visual display di area','operations',-5),
    ('7. Go-live','Migrasi stok & stock opname awal','operations',0),
    ('7. Go-live','Go-live & hypercare 2 minggu','operations',14),
    ('8. Monitoring','KPI bulan pertama vs asumsi cost model (volume, produktivitas, biaya)','solution_design',30),
    ('8. Monitoring','Review profitabilitas aktual vs P&L tender','finance',60)
  ) as v(f, t, d, h);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Audit log (historis pekerjaan) ----------
create table public.audit_log (
  id        bigint generated always as identity primary key,
  tabel     text not null,
  row_id    text,
  aksi      text not null,
  ringkas   text,
  oleh      uuid default auth.uid(),
  waktu     timestamptz not null default now()
);
create index on public.audit_log (waktu desc);

create or replace function public.tulis_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb; label text;
begin
  r := to_jsonb(coalesce(new, old));
  label := coalesce(r->>'kode', r->>'nomor', r->>'item', r->>'nama', r->>'aktivitas', r->>'kab_kota', r->>'customer', r->>'tugas', '');
  insert into public.audit_log (tabel, row_id, aksi, ringkas)
  values (tg_table_name, coalesce(r->>'id', r->>'key', r->>'tanggal'), lower(tg_op),
          label || case when tg_op = 'UPDATE' and (to_jsonb(old)->>'status') is distinct from (to_jsonb(new)->>'status')
                        then ' · status ' || coalesce(to_jsonb(old)->>'status','') || ' → ' || coalesce(to_jsonb(new)->>'status','') else '' end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['tenders','quotations','price_items','warehouses','it_catalog','productivity','umk','job_levels','payroll_params','implementation_tasks','margin_policy']
  loop execute format('create trigger t_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.tulis_audit()', t); end loop;
end $$;

-- ---------- View: ringkasan tender untuk dashboard & perbandingan ----------
create view public.tender_overview with (security_invoker = true) as
select t.id, t.kode, t.customer, t.industri, t.provinsi, t.kab_kota, t.tipe_gudang, t.skema, t.skenario_aset,
       t.status::text as status, t.versi, t.created_at, t.updated_at, t.tanggal_keputusan, t.alasan_hasil,
       t.durasi_kontrak_bulan, t.jumlah_shift,
       (t.hasil->>'totalBiayaBulan')::numeric                         as biaya_bulan,
       (t.hasil->'simulasi'->0->>'pendapatanBulan')::numeric           as pendapatan_bulan,
       (t.hasil->'simulasi'->0->>'gpPersen')::numeric                  as gp_persen,
       (t.hasil->>'totalHeadcount')::int                               as headcount,
       (t.hasil->'space'->>'totalM2')::numeric                         as luas_m2,
       (t.hasil->'space'->>'ppDesain')::numeric                        as posisi_palet,
       (select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(t.hasil->'rateCard') r where r->>'bucket' = 'storage')      as tarif_storage,
       (select r->>'uom' from jsonb_array_elements(t.hasil->'rateCard') r where r->>'bucket' = 'storage')                         as uom_storage,
       (select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(t.hasil->'rateCard') r where r->>'bucket' = 'handling_in')  as tarif_handling_in,
       (select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(t.hasil->'rateCard') r where r->>'bucket' = 'handling_out') as tarif_handling_out,
       (select r->>'uom' from jsonb_array_elements(t.hasil->'rateCard') r where r->>'bucket' = 'handling_in')                     as uom_handling,
       (select count(*) from jsonb_array_elements(t.hasil->'redFlags') f where f->>'level' = 'kritis')                            as red_flag_kritis
from public.tenders t;

-- ---------- RLS tabel baru ----------
alter table public.warehouses enable row level security;
alter table public.it_catalog enable row level security;
alter table public.tender_status_log enable row level security;
alter table public.implementation_tasks enable row level security;
alter table public.audit_log enable row level security;

create policy "baca" on public.warehouses for select to authenticated using (true);
create policy "tulis Procurement" on public.warehouses for all to authenticated
  using (public.current_role_is('procurement','admin','solution_design')) with check (public.current_role_is('procurement','admin','solution_design'));
create policy "baca" on public.it_catalog for select to authenticated using (true);
create policy "tulis IT" on public.it_catalog for all to authenticated
  using (public.current_role_is('it','admin','solution_design')) with check (public.current_role_is('it','admin','solution_design'));
create policy "status log: tim tender" on public.tender_status_log for select to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'));
-- Implementasi: tim tender + departemen pelaksana boleh lihat & update tugasnya
create policy "implementasi: baca" on public.implementation_tasks for select to authenticated using (true);
create policy "implementasi: tim tender kelola" on public.implementation_tasks for all to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'))
  with check (public.current_role_is('solution_design','commercial','finance','admin'));
create policy "implementasi: departemen update tugasnya" on public.implementation_tasks for update to authenticated
  using (departemen = public.my_role()) with check (departemen = public.my_role());
create policy "audit: baca tim tender" on public.audit_log for select to authenticated
  using (public.current_role_is('solution_design','commercial','finance','admin'));

create trigger t_warehouses_approval before update on public.warehouses for each row execute function public.guard_status_approval();
create trigger t_it_catalog_approval before update on public.it_catalog for each row execute function public.guard_status_approval();

-- ---------- Storage foto gudang (hanya di Supabase) ----------
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('warehouse-photos', 'warehouse-photos', true) on conflict (id) do nothing;
    execute $p$create policy "foto gudang: baca" on storage.objects for select to authenticated using (bucket_id = 'warehouse-photos')$p$;
    execute $p$create policy "foto gudang: upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'warehouse-photos' and public.current_role_is('procurement','admin','solution_design'))$p$;
    execute $p$create policy "foto gudang: hapus" on storage.objects for delete to authenticated
      using (bucket_id = 'warehouse-photos' and public.current_role_is('procurement','admin','solution_design'))$p$;
  end if;
end $$;

-- Departemen pelaksana boleh melihat tender yang punya tugas implementasi untuk mereka
create policy "tender: departemen pelaksana baca" on public.tenders for select to authenticated
  using (exists (select 1 from public.implementation_tasks it where it.tender_id = tenders.id and it.departemen = public.my_role()));

-- Quotation baru selalu draft (kecuali dibuat oleh Commercial/Finance/Admin)
create or replace function public.guard_quotation_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'draft' and not public.current_role_is('commercial','finance','admin') then
    new.status := 'draft';
  end if;
  if new.status = 'approved' then new.approved_by := auth.uid(); new.approved_at := now(); end if;
  return new;
end $$;
create trigger t_quotation_insert before insert on public.quotations for each row execute function public.guard_quotation_insert();
