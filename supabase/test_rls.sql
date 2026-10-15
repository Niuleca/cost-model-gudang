-- Uji RLS lokal (jalankan setelah bootstrap + migrations)
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant select on all tables in schema public to anon;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000001','proc@x.id'),
 ('00000000-0000-0000-0000-000000000002','sd@x.id'),
 ('00000000-0000-0000-0000-000000000003','ops@x.id'),
 ('00000000-0000-0000-0000-000000000004','hr@x.id');
update public.profiles set role='procurement' where email='proc@x.id';
update public.profiles set role='solution_design' where email='sd@x.id';
update public.profiles set role='operations' where email='ops@x.id';
update public.profiles set role='hr' where email='hr@x.id';

create temp table hasil (uji text, lolos boolean);
grant all on hasil to authenticated;

set role authenticated;

-- 1. Procurement tambah harga → boleh
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  insert into public.price_items (kategori,item,satuan,harga_sewa_bulan,owner_role) values ('MHE','Forklift 2.5T','unit',19000000,'procurement');
  insert into hasil values ('procurement tambah harga', true);
exception when others then insert into hasil values ('procurement tambah harga', false); end $$;

-- 2. Procurement approve sendiri → ditolak
do $$ begin
  update public.price_items set status='approved' where item='Forklift 2.5T';
  insert into hasil values ('procurement approve DITOLAK', false);
exception when others then insert into hasil values ('procurement approve DITOLAK', true); end $$;

-- 3. Ops tambah harga milik procurement → ditolak
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  insert into public.price_items (kategori,item,satuan,harga_beli,owner_role) values ('IT','Laptop','unit',17500000,'procurement');
  insert into hasil values ('ops tambah harga procurement DITOLAK', false);
exception when others then insert into hasil values ('ops tambah harga procurement DITOLAK', true); end $$;

-- 4. SD approve → boleh, approved_by terisi
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare n int; begin
  update public.price_items set status='approved' where item='Forklift 2.5T';
  select count(*) into n from public.price_items where item='Forklift 2.5T' and status='approved' and approved_by is not null;
  insert into hasil values ('SD approve harga', n=1);
exception when others then insert into hasil values ('SD approve harga', false); end $$;

-- 5. SD buat tender → boleh
do $$ begin
  insert into public.tenders (customer, provinsi, kab_kota) values ('Demix','Jawa Timur','Kota Surabaya');
  insert into hasil values ('SD buat tender', true);
exception when others then insert into hasil values ('SD buat tender', false); end $$;

-- 6. HR lihat tender → 0 baris; HR buat tender → ditolak
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$ declare n int; begin
  select count(*) into n from public.tenders;
  insert into hasil values ('HR tidak melihat tender', n=0);
end $$;
do $$ begin
  insert into public.tenders (customer, provinsi, kab_kota) values ('X','Bali','Kota Denpasar');
  insert into hasil values ('HR buat tender DITOLAK', false);
exception when others then insert into hasil values ('HR buat tender DITOLAK', true); end $$;

-- 7. HR ubah role sendiri jadi admin → ditolak
do $$ declare r text; begin
  update public.profiles set role='admin' where id = auth.uid();
  select role into r from public.profiles where id = auth.uid();
  insert into hasil values ('HR naik jadi admin DITOLAK', r <> 'admin');
exception when others then insert into hasil values ('HR naik jadi admin DITOLAK', true); end $$;

-- 8. Semua user baca master data
do $$ declare n int; begin
  select count(*) into n from public.price_items;
  insert into hasil values ('HR baca master harga', n>=1);
end $$;

-- ===== Tahap 1 =====
-- 9. Procurement tambah gudang → boleh
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  insert into public.warehouses (nama, provinsi, kab_kota, luas_m2, harga_sewa_m2_bulan, gmaps_url)
  values ('Gudang Uji Cikarang','Jawa Barat','Kabupaten Bekasi',5000,65000,'https://maps.google.com/?q=-6.3,107.1');
  insert into hasil values ('procurement tambah gudang', true);
exception when others then insert into hasil values ('procurement tambah gudang', false); end $$;

-- 10. Procurement tambah katalog IT → ditolak (milik IT)
do $$ begin
  insert into public.it_catalog (kelompok,item,cost_type,basis,harga) values ('Hardware & Device','Uji','PDPM','Bulanan',1);
  insert into hasil values ('procurement isi katalog IT DITOLAK', false);
exception when others then insert into hasil values ('procurement isi katalog IT DITOLAK', true); end $$;

-- 11. Ops tambah gudang → ditolak
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  insert into public.warehouses (nama, provinsi, kab_kota, luas_m2, harga_per_bulan) values ('X','Bali','Kota Denpasar',100,1);
  insert into hasil values ('ops tambah gudang DITOLAK', false);
exception when others then insert into hasil values ('ops tambah gudang DITOLAK', true); end $$;

-- 12. SD: status tender berubah → log tercatat; checklist implementasi dibuat
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare t uuid; n int; m int; begin
  insert into public.tenders (customer, provinsi, kab_kota, kode) values ('PT Uji Log','Jawa Timur','Kota Surabaya','TND-UJI-LOG') returning id into t;
  update public.tenders set status='menang', alasan_hasil='harga kompetitif' where id=t;
  select count(*) into n from public.tender_status_log where tender_id=t;
  m := public.buat_checklist_implementasi(t, date '2027-01-15');
  insert into hasil values ('status log + checklist implementasi', n=2 and m=19);
exception when others then insert into hasil values ('status log + checklist implementasi: '||sqlerrm, false); end $$;

-- 13. Ops update tugas departemennya → boleh; tugas HR → tidak berubah
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ declare a int; b int; begin
  update public.implementation_tasks set progress=50 where departemen='operations';
  get diagnostics a = row_count;
  update public.implementation_tasks set progress=50 where departemen='hr';
  get diagnostics b = row_count;
  insert into hasil values ('ops update tugas sendiri saja', a>0 and b=0);
exception when others then insert into hasil values ('ops update tugas sendiri saja: '||sqlerrm, false); end $$;

-- 14. Audit log & view overview terbaca tim tender
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare n int; v int; begin
  select count(*) into n from public.audit_log where tabel='tenders';
  select count(*) into v from public.tender_overview where status='menang';
  insert into hasil values ('audit log + tender_overview', n>=2 and v=1);
exception when others then insert into hasil values ('audit log + tender_overview: '||sqlerrm, false); end $$;

reset role;
select * from hasil;
