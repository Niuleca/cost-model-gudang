-- Radar jadwal tender gudang / logistik perusahaan di Indonesia (Beranda).
-- Diisi otomatis oleh Claude (scheduled task, sumber publik) dan oleh akun (manual).
create table if not exists public.tender_radar (
  id uuid primary key default gen_random_uuid(),
  perusahaan text not null,
  judul text not null,
  kategori text not null default 'Warehousing',      -- Warehousing / 3PL / Transport / Freight / Lainnya
  industri text,
  lokasi text,
  platform text,                                      -- Coupa / SAP Ariba / SPSE-LPSE / e-Proc BUMN / Website / Lainnya
  nomor_tender text,
  tanggal_terbit date,
  batas_daftar date,
  batas_penawaran date,
  nilai_estimasi numeric,
  status text not null default 'dibuka' check (status in ('rencana', 'dibuka', 'ditutup', 'dibatalkan', 'selesai')),
  link text,
  pic_nama text,
  pic_email text,
  pic_telepon text,
  catatan text,
  sumber text not null default 'manual' check (sumber in ('manual', 'claude')),
  sumber_url text,
  terverifikasi boolean not null default false,
  dibuat_oleh uuid references auth.users(id) on delete set null,
  diubah_oleh uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tender_radar_unik on public.tender_radar (lower(perusahaan), lower(judul));
create index if not exists tender_radar_batas on public.tender_radar (batas_penawaran);

create or replace function public.tender_radar_jejak() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.diubah_oleh := auth.uid();
    if tg_op = 'INSERT' then new.dibuat_oleh := coalesce(new.dibuat_oleh, auth.uid()); end if;
  end if;
  return new;
end $$;
drop trigger if exists tender_radar_jejak on public.tender_radar;
create trigger tender_radar_jejak before insert or update on public.tender_radar for each row execute function public.tender_radar_jejak();

alter table public.tender_radar enable row level security;
drop policy if exists "gerbang: akun aktif" on public.tender_radar;
create policy "gerbang: akun aktif" on public.tender_radar as restrictive for all to authenticated using (public.is_aktif()) with check (public.is_aktif());
drop policy if exists "radar: baca" on public.tender_radar;
create policy "radar: baca" on public.tender_radar for select to authenticated using (true);
drop policy if exists "radar: tambah" on public.tender_radar;
create policy "radar: tambah" on public.tender_radar for insert to authenticated with check (true);
drop policy if exists "radar: ubah" on public.tender_radar;
create policy "radar: ubah" on public.tender_radar for update to authenticated using (true) with check (true);
drop policy if exists "radar: hapus" on public.tender_radar;
create policy "radar: hapus" on public.tender_radar for delete to authenticated using (public.is_master() or public.punya_role('admin', 'manager') or dibuat_oleh = auth.uid());
