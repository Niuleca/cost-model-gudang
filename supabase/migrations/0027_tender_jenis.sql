-- Jenis tender: warehouse (cost model gudang), transportation (rute darat), intermodal (3 stage: first mile, main leg laut/udara, last mile).
alter table public.tenders add column if not exists jenis_tender text not null default 'warehouse'
  check (jenis_tender in ('warehouse', 'transportation', 'intermodal'));
create index if not exists tenders_jenis_tender_idx on public.tenders (jenis_tender);
