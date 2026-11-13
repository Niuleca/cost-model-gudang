-- Model BERBAGI per project (menggantikan rancangan multi-perusahaan yang dibatalkan).
-- Aturan melihat tender:
--   pembuat · Super Admin · dibagikan ke saya / ke tim saya · "contoh publik" (baca saja)
--   · admin/manager bila ada quotation menunggu approval · departemen pelaksana yang punya tugas implementasi.
-- Aturan mengubah tender:
--   pembuat · Super Admin · dibagikan ke saya dengan hak Edit
--   · dibagikan ke tim dengan hak Edit (draft milik orang lain hanya oleh admin/manager, seperti aturan lama)
--   · admin/manager untuk tender yang quotation-nya menunggu approval.
-- Penguji boleh membuat & melihat tender miliknya sendiri; master (harga, gaji, dll.) tetap tertutup untuk penguji.

-- ============ 1) Tabel ============
create table if not exists public.tim (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null check (length(btrim(nama)) between 1 and 80),
  pemilik    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ix_tim_pemilik on public.tim (pemilik);

create table if not exists public.tim_anggota (
  tim_id        uuid not null references public.tim(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  ditambah_oleh uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (tim_id, user_id)
);
create index if not exists ix_tim_anggota_user on public.tim_anggota (user_id);
create index if not exists ix_tim_anggota_ditambah on public.tim_anggota (ditambah_oleh);

create table if not exists public.tender_akses (
  id             bigint generated always as identity primary key,
  tender_id      uuid not null references public.tenders(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete cascade,
  tim_id         uuid references public.tim(id) on delete cascade,
  hak            text not null default 'lihat' check (hak in ('lihat', 'edit')),
  dibagikan_oleh uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint tender_akses_satu_tujuan check (num_nonnulls(user_id, tim_id) = 1)
);
create unique index if not exists uq_tender_akses_user on public.tender_akses (tender_id, user_id) where user_id is not null;
create unique index if not exists uq_tender_akses_tim on public.tender_akses (tender_id, tim_id) where tim_id is not null;
create index if not exists ix_tender_akses_user on public.tender_akses (user_id);
create index if not exists ix_tender_akses_tim on public.tender_akses (tim_id);
create index if not exists ix_tender_akses_oleh on public.tender_akses (dibagikan_oleh);

alter table public.tenders add column if not exists contoh_publik boolean not null default false;
alter table public.profiles add column if not exists tim_bawaan uuid references public.tim(id) on delete set null;
create index if not exists ix_profiles_tim_bawaan on public.profiles (tim_bawaan);

alter table public.tim enable row level security;
alter table public.tim_anggota enable row level security;
alter table public.tender_akses enable row level security;

-- ============ 2) Fungsi bantu (security definer → tidak memicu RLS berulang) ============
create or replace function public.tim_saya()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.tim where pemilik = auth.uid()
  union
  select tim_id from public.tim_anggota where user_id = auth.uid();
$$;

create or replace function public.bisa_lihat_tender(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenders t
    where t.id = p_id and (
      t.created_by = auth.uid()
      or t.contoh_publik
      or public.is_master()
      or exists (select 1 from public.tender_akses a
                 where a.tender_id = t.id and (a.user_id = auth.uid() or a.tim_id in (select public.tim_saya())))
      or (public.punya_role('admin', 'manager')
          and exists (select 1 from public.quotations q where q.tender_id = t.id and q.status = 'menunggu'))
      or exists (select 1 from public.implementation_tasks it where it.tender_id = t.id and it.departemen = public.my_role())
    ));
$$;

create or replace function public.bisa_edit_tender(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenders t
    where t.id = p_id and (
      t.created_by = auth.uid()
      or public.is_master()
      or exists (select 1 from public.tender_akses a
                 where a.tender_id = t.id and a.hak = 'edit' and a.user_id = auth.uid())
      or (exists (select 1 from public.tender_akses a
                  where a.tender_id = t.id and a.hak = 'edit' and a.tim_id in (select public.tim_saya()))
          and (not public.tender_tahap_draft(t.status) or public.punya_role('admin', 'manager')))
      or (public.punya_role('admin', 'manager')
          and exists (select 1 from public.quotations q where q.tender_id = t.id and q.status = 'menunggu'))
    ));
$$;

-- Pengaturan berbagi: hanya pembuat tender & Super Admin
create or replace function public.bisa_kelola_akses(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_master() or exists (select 1 from public.tenders t where t.id = p_id and t.created_by = auth.uid());
$$;

-- Aturan lama dipakai banyak kebijakan quotation/versi → ikut aturan berbagi
create or replace function public.boleh_edit_tender(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.bisa_edit_tender(p_id);
$$;

-- File SOP disimpan di folder "<id tender>/..."
create or replace function public.tender_dari_path(p_nama text)
returns uuid language sql immutable set search_path = public as $$
  select case when split_part(p_nama, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_nama, '/', 1)::uuid end;
$$;

-- ============ 3) RPC untuk layar berbagi ============
-- Cari pengguna lewat email / username PERSIS (tidak bisa menelusuri daftar pengguna)
create or replace function public.cari_pengguna(p_kunci text)
returns table (id uuid, nama text, username text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.username, 'Pengguna'), p.username
  from public.profiles p
  where public.is_aktif() and p.status = 'aktif' and length(btrim(coalesce(p_kunci, ''))) >= 3
    and (lower(p.email) = lower(btrim(p_kunci)) or lower(p.username) = lower(btrim(p_kunci)))
  limit 1;
$$;

create or replace function public.daftar_akses_tender(p_tender uuid)
returns table (id bigint, user_id uuid, tim_id uuid, hak text, nama text, keterangan text)
language sql stable security definer set search_path = public as $$
  select a.id, a.user_id, a.tim_id, a.hak,
         coalesce(tm.nama, nullif(p.full_name, ''), p.username, 'Pengguna'),
         case when a.tim_id is not null
              then (select count(*) from public.tim_anggota x where x.tim_id = a.tim_id)::text || ' anggota'
              else coalesce(p.username, '') end
  from public.tender_akses a
  left join public.profiles p on p.id = a.user_id
  left join public.tim tm on tm.id = a.tim_id
  where a.tender_id = p_tender and public.bisa_lihat_tender(p_tender)
  order by a.tim_id is null, a.created_at;
$$;

create or replace function public.anggota_tim(p_tim uuid)
returns table (user_id uuid, nama text, username text, pemilik boolean)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.username, 'Pengguna'), p.username, p.id = t.pemilik
  from public.tim t
  join public.profiles p on p.id = t.pemilik or p.id in (select a.user_id from public.tim_anggota a where a.tim_id = t.id)
  where t.id = p_tim and (p_tim in (select public.tim_saya()) or public.is_master())
  order by p.id = t.pemilik desc, 2;
$$;

-- ============ 4) Trigger ============
-- Tender baru otomatis dibagikan ke tim bawaan pembuat (hak Edit)
create or replace function public.tender_bagikan_tim_bawaan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tim uuid;
begin
  select p.tim_bawaan into v_tim from public.profiles p where p.id = new.created_by;
  if v_tim is not null and exists (
       select 1 from public.tim t where t.id = v_tim and (t.pemilik = new.created_by
         or exists (select 1 from public.tim_anggota a where a.tim_id = t.id and a.user_id = new.created_by))) then
    insert into public.tender_akses (tender_id, tim_id, hak, dibagikan_oleh)
    values (new.id, v_tim, 'edit', new.created_by) on conflict do nothing;
  end if;
  return new;
end $$;

-- "Contoh publik" hanya boleh dinyalakan Super Admin / admin
create or replace function public.jaga_contoh_publik()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.contoh_publik and (tg_op = 'INSERT' or not old.contoh_publik)
     and auth.uid() is not null and not (public.is_master() or public.punya_role('admin')) then
    raise exception 'Hanya admin yang bisa menjadikan project sebagai contoh publik.';
  end if;
  return new;
end $$;

-- Tim bawaan harus tim yang diikuti / dimiliki pemilik profil
create or replace function public.jaga_tim_bawaan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tim_bawaan is not null and new.tim_bawaan is distinct from old.tim_bawaan and auth.uid() is not null
     and not exists (select 1 from public.tim t where t.id = new.tim_bawaan and (t.pemilik = new.id
                     or exists (select 1 from public.tim_anggota a where a.tim_id = t.id and a.user_id = new.id))) then
    raise exception 'Tim bawaan harus tim yang Anda ikuti.';
  end if;
  return new;
end $$;

-- Keluar / dikeluarkan dari tim → tim bawaan dikosongkan
create or replace function public.tim_anggota_keluar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set tim_bawaan = null where id = old.user_id and tim_bawaan = old.tim_id;
  return old;
end $$;

-- ============ 5) Data lama: semua tender masuk "Tim Leca" berisi seluruh pengguna internal ============
do $$
declare v_master uuid; v_tim uuid;
begin
  select id into v_master from public.profiles where is_master order by is_pemilik desc, created_at limit 1;
  if v_master is null then return; end if;
  select id into v_tim from public.tim where nama = 'Tim Leca' and pemilik = v_master limit 1;
  if v_tim is null then
    insert into public.tim (nama, pemilik) values ('Tim Leca', v_master) returning id into v_tim;
  end if;
  insert into public.tim_anggota (tim_id, user_id, ditambah_oleh)
    select v_tim, p.id, v_master from public.profiles p where p.role <> 'penguji' on conflict do nothing;
  insert into public.tender_akses (tender_id, tim_id, hak, dibagikan_oleh)
    select t.id, v_tim, 'edit', v_master from public.tenders t on conflict do nothing;
  update public.profiles set tim_bawaan = v_tim where role <> 'penguji' and tim_bawaan is null;
end $$;

drop trigger if exists t_tender_bagikan_tim_bawaan on public.tenders;
create trigger t_tender_bagikan_tim_bawaan after insert on public.tenders
  for each row execute function public.tender_bagikan_tim_bawaan();
drop trigger if exists t_tenders_jaga_contoh on public.tenders;
create trigger t_tenders_jaga_contoh before insert or update of contoh_publik on public.tenders
  for each row execute function public.jaga_contoh_publik();
drop trigger if exists t_profiles_jaga_tim_bawaan on public.profiles;
create trigger t_profiles_jaga_tim_bawaan before update of tim_bawaan on public.profiles
  for each row execute function public.jaga_tim_bawaan();
drop trigger if exists t_tim_anggota_keluar on public.tim_anggota;
create trigger t_tim_anggota_keluar after delete on public.tim_anggota
  for each row execute function public.tim_anggota_keluar();

-- ============ 6) RLS ============
-- tim & anggota
create policy "gerbang: akun aktif" on public.tim as restrictive for all to authenticated using (public.is_aktif()) with check (public.is_aktif());
create policy "tim: lihat" on public.tim for select to authenticated using (id in (select public.tim_saya()) or public.is_master());
create policy "tim: buat" on public.tim for insert to authenticated with check (pemilik = (select auth.uid()));
create policy "tim: ubah" on public.tim for update to authenticated
  using (pemilik = (select auth.uid()) or public.is_master()) with check (pemilik = (select auth.uid()) or public.is_master());
create policy "tim: hapus" on public.tim for delete to authenticated using (pemilik = (select auth.uid()) or public.is_master());

create policy "gerbang: akun aktif" on public.tim_anggota as restrictive for all to authenticated using (public.is_aktif()) with check (public.is_aktif());
create policy "anggota: lihat" on public.tim_anggota for select to authenticated using (tim_id in (select public.tim_saya()) or public.is_master());
create policy "anggota: tambah" on public.tim_anggota for insert to authenticated
  with check (public.is_master() or exists (select 1 from public.tim t where t.id = tim_id and t.pemilik = (select auth.uid())));
create policy "anggota: keluarkan / keluar" on public.tim_anggota for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_master()
         or exists (select 1 from public.tim t where t.id = tim_id and t.pemilik = (select auth.uid())));

-- akses tender
create policy "gerbang: akun aktif" on public.tender_akses as restrictive for all to authenticated using (public.is_aktif()) with check (public.is_aktif());
create policy "akses: lihat" on public.tender_akses for select to authenticated
  using (user_id = (select auth.uid()) or tim_id in (select public.tim_saya()) or public.bisa_kelola_akses(tender_id));
create policy "akses: tambah" on public.tender_akses for insert to authenticated
  with check (public.bisa_kelola_akses(tender_id) and (tim_id is null or tim_id in (select public.tim_saya()) or public.is_master()));
create policy "akses: ubah" on public.tender_akses for update to authenticated
  using (public.bisa_kelola_akses(tender_id)) with check (public.bisa_kelola_akses(tender_id));
create policy "akses: hapus" on public.tender_akses for delete to authenticated using (public.bisa_kelola_akses(tender_id));

-- tenders: dari "semua peran tim tender" → "milik / dibagikan"
drop policy if exists "tender: tim tender" on public.tenders;
drop policy if exists "tender: departemen pelaksana baca" on public.tenders;
drop policy if exists "draft milik pembuat: ubah" on public.tenders;
drop policy if exists "penguji: tanpa akses data kerja" on public.tenders;
create policy "tender: lihat" on public.tenders for select to authenticated
  using (created_by = (select auth.uid()) or contoh_publik or public.bisa_lihat_tender(id));
create policy "tender: buat" on public.tenders for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "tender: ubah" on public.tenders for update to authenticated
  using (created_by = (select auth.uid()) or public.bisa_edit_tender(id))
  with check (created_by = (select auth.uid()) or public.bisa_edit_tender(id));
create policy "tender: hapus" on public.tenders for delete to authenticated
  using (created_by = (select auth.uid()) or public.bisa_edit_tender(id));
-- (tetap berlaku: "draft milik pembuat: hapus" & "hapus tender: hanya tahap draft kecuali admin")

-- versi tender
drop policy if exists "tender anak: tim tender" on public.tender_versions;
drop policy if exists "penguji: tanpa akses data kerja" on public.tender_versions;
create policy "versi: lihat" on public.tender_versions for select to authenticated using (public.bisa_lihat_tender(tender_id));
create policy "versi: tulis" on public.tender_versions for all to authenticated
  using (public.bisa_edit_tender(tender_id)) with check (public.bisa_edit_tender(tender_id));

-- quotation
drop policy if exists "quotation: tim tender" on public.quotations;
drop policy if exists "penguji: tanpa akses data kerja" on public.quotations;
create policy "quotation: lihat" on public.quotations for select to authenticated using (public.bisa_lihat_tender(tender_id));
create policy "quotation: tulis" on public.quotations for all to authenticated
  using (public.bisa_edit_tender(tender_id)) with check (public.bisa_edit_tender(tender_id));

-- riwayat status
drop policy if exists "status log: tim tender" on public.tender_status_log;
drop policy if exists "penguji: tanpa akses data kerja" on public.tender_status_log;
create policy "status log: lihat" on public.tender_status_log for select to authenticated using (public.bisa_lihat_tender(tender_id));

-- implementasi
drop policy if exists "implementasi: baca" on public.implementation_tasks;
drop policy if exists "implementasi: tim tender kelola" on public.implementation_tasks;
drop policy if exists "penguji: tanpa akses data kerja" on public.implementation_tasks;
create policy "implementasi: lihat" on public.implementation_tasks for select to authenticated
  using (departemen = public.my_role() or public.bisa_lihat_tender(tender_id));
create policy "implementasi: kelola" on public.implementation_tasks for all to authenticated
  using (public.bisa_edit_tender(tender_id)) with check (public.bisa_edit_tender(tender_id));
-- (tetap: "implementasi: departemen update tugasnya")

-- simulasi listrik yang terhubung ke tender ikut akses tender
alter policy "baca" on public.electricity_simulations using (tender_id is null or public.bisa_lihat_tender(tender_id));

-- layout gudang tender
drop policy if exists "layout: ikut akses tender" on public.warehouse_layouts;
drop policy if exists "penguji: hanya layout pribadi" on public.warehouse_layouts;
create policy "layout tender: lihat" on public.warehouse_layouts for select to authenticated
  using (tender_id is not null and public.bisa_lihat_tender(tender_id));
create policy "layout tender: tulis" on public.warehouse_layouts for all to authenticated
  using (tender_id is not null and public.bisa_edit_tender(tender_id))
  with check (tender_id is not null and public.bisa_edit_tender(tender_id));

-- file SOP tender: ikut akses tender (folder = id tender)
drop policy if exists "sop tender: baca" on storage.objects;
drop policy if exists "sop tender: upload" on storage.objects;
drop policy if exists "sop tender: hapus" on storage.objects;
create policy "sop tender: baca" on storage.objects for select to authenticated
  using (bucket_id = 'tender-sop' and public.bisa_lihat_tender(public.tender_dari_path(name)));
create policy "sop tender: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'tender-sop' and public.bisa_edit_tender(public.tender_dari_path(name)));
create policy "sop tender: hapus" on storage.objects for delete to authenticated
  using (bucket_id = 'tender-sop' and public.bisa_edit_tender(public.tender_dari_path(name)));
drop policy if exists "penguji: tanpa file kerja" on storage.objects;
create policy "penguji: tanpa file kerja" on storage.objects as restrictive for all to authenticated
  using (not (public.is_penguji() and bucket_id in ('supplier-quotations', 'quotation-branding')))
  with check (not (public.is_penguji() and bucket_id in ('supplier-quotations', 'quotation-branding')));

-- ============ 7) Hak eksekusi fungsi ============
revoke execute on function public.tim_saya(), public.bisa_lihat_tender(uuid), public.bisa_edit_tender(uuid),
  public.bisa_kelola_akses(uuid), public.tender_dari_path(text), public.cari_pengguna(text),
  public.daftar_akses_tender(uuid), public.anggota_tim(uuid) from public, anon;
grant execute on function public.tim_saya(), public.bisa_lihat_tender(uuid), public.bisa_edit_tender(uuid),
  public.bisa_kelola_akses(uuid), public.tender_dari_path(text), public.cari_pengguna(text),
  public.daftar_akses_tender(uuid), public.anggota_tim(uuid) to authenticated;
revoke execute on function public.tender_bagikan_tim_bawaan(), public.jaga_contoh_publik(),
  public.jaga_tim_bawaan(), public.tim_anggota_keluar() from public, anon, authenticated;
