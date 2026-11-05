-- 0027 · Master UOM & Product Handling Weight (unit + pallet)
-- Jalankan setelah seluruh migration 0001–0026 pada Supabase.

create table if not exists public.uom_catalog (
  code text primary key,
  label text not null,
  category text not null,
  measurement_type text not null check (measurement_type in ('count','mass','volume','length','area','dimension','handling','workflow')),
  standard_code text,
  standard_reference text check (standard_reference in ('Rec20','Rec21','Internal') or standard_reference is null),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

insert into public.uom_catalog (code, label, category, measurement_type, standard_code, standard_reference, sort_order) values
('pcs','Piece','Unit / Piece','count','H87','Rec20',10),
('ea','Each','Unit / Piece','count','C62','Rec20',11),
('unit','Unit','Unit / Piece','count','C62','Rec20',12),
('set','Set','Unit / Piece','count',null,'Internal',13),
('kit','Kit','Unit / Piece','count',null,null,'Internal',14),
('pair','Pair','Unit / Piece','count','PR','Rec20',15),
('dozen','Dozen','Unit / Piece','count','DZN','Rec20',16),
('pack','Pack','Packaging','count','PK','Rec21',20),
('inner_pack','Inner Pack','Packaging','count',null,null,'Internal',21),
('box','Box','Packaging','count','BX','Rec21',22),
('karton','Carton','Packaging','count','CT','Rec21',23),
('case','Case','Packaging','count',null,null,'Internal',24),
('bundle','Bundle','Packaging','count',null,null,'Internal',25),
('bag','Bag','Bag / Sack','count','BG','Rec21',30),
('sack','Sack','Bag / Sack','count','SA','Rec21',31),
('big_bag','Big Bag','Bag / Sack','count',null,null,'Internal',32),
('fibc','FIBC','Bag / Sack','count',null,null,'Internal',33),
('pail','Pail','Container','count',null,null,'Internal',40),
('bucket','Bucket','Container','count',null,null,'Internal',41),
('drum','Drum','Container','count',null,null,'Internal',42),
('barrel','Barrel','Container','count','BA','Rec21',43),
('jerry_can','Jerry Can','Container','count',null,null,'Internal',44),
('ibc','IBC','Container','count',null,null,'Internal',45),
('roll','Roll','Roll / Material','count','RO','Rec20',50),
('coil','Coil','Roll / Material','count',null,null,'Internal',51),
('spool','Spool','Roll / Material','count',null,null,'Internal',52),
('reel','Reel','Roll / Material','count','RL','Rec21',53),
('sheet','Sheet','Roll / Material','count','ST','Rec21',54),
('bale','Bale','Roll / Material','count',null,null,'Internal',55),
('palet','Pallet','Pallet / Handling','count','PX','Rec21',60),
('half_pallet','Half Pallet','Pallet / Handling','count',null,null,'Internal',61),
('tote','Tote','Pallet / Handling','count',null,null,'Internal',62),
('bin','Bin','Pallet / Handling','count',null,null,'Internal',63),
('crate','Crate','Pallet / Handling','count',null,null,'Internal',64),
('g','Gram','Weight','mass','GRM','Rec20',70),
('kg','Kilogram','Weight','mass','KGM','Rec20',71),
('ton','Metric Tonne','Weight','mass','TNE','Rec20',72),
('ml','Millilitre','Volume','volume','MLT','Rec20',80),
('liter','Litre','Volume','volume','LTR','Rec20',81),
('gallon','Gallon','Volume','volume','GLL','Rec20',82),
('mm','Millimetre','Dimension','length','MMT','Rec20',90),
('cm','Centimetre','Dimension','length','CMT','Rec20',91),
('meter','Metre','Dimension','length','MTR','Rec20',92),
('sqm','Square Metre','Dimension','area','MTK','Rec20',93),
('cbm','Cubic Metre','Volume','volume','MTQ','Rec20',94),
('order','Order','Order Processing','workflow',null,null,'Internal',100),
('line','Order Line','Order Processing','workflow',null,null,'Internal',101),
('shipment','Shipment','Order Processing','workflow',null,null,'Internal',102),
('parcel','Parcel','Order Processing','workflow',null,null,'Internal',103),
('lokasi','Storage Location','Warehouse Location','handling',null,null,'Internal',110),
('pick','Pick','Order Processing','workflow',null,null,'Internal',111)
on conflict (code) do update set
  label = excluded.label, category = excluded.category,
  measurement_type = excluded.measurement_type,
  standard_code = excluded.standard_code, standard_reference = excluded.standard_reference, sort_order = excluded.sort_order;

create table if not exists public.product_handling_master (
  id bigint generated always as identity primary key,
  product_code text not null unique,
  product_name text not null,
  product_category text not null,
  uom_code text not null references public.uom_catalog(code),
  unit_net_weight_kg numeric(14,4) not null check (unit_net_weight_kg >= 0),
  unit_gross_weight_kg numeric(14,4) not null check (unit_gross_weight_kg >= unit_net_weight_kg),
  unit_weight_class text generated always as (
    case
      when unit_gross_weight_kg <= 1 then 'micro'
      when unit_gross_weight_kg <= 5 then 'light'
      when unit_gross_weight_kg <= 15 then 'medium'
      when unit_gross_weight_kg <= 25 then 'standard'
      when unit_gross_weight_kg <= 50 then 'heavy'
      when unit_gross_weight_kg <= 100 then 'very_heavy'
      when unit_gross_weight_kg <= 200 then 'extra_heavy'
      when unit_gross_weight_kg <= 500 then 'bulk_heavy'
      when unit_gross_weight_kg <= 1000 then 'jumbo_fibc'
      else 'industrial_bulk'
    end
  ) stored,
  qty_per_pallet numeric(14,3) check (qty_per_pallet is null or qty_per_pallet > 0),
  pallet_tare_weight_kg numeric(14,4) not null default 0 check (pallet_tare_weight_kg >= 0),
  pallet_packaging_weight_kg numeric(14,4) not null default 0 check (pallet_packaging_weight_kg >= 0),
  net_pallet_weight_kg numeric(18,4) generated always as (
    case when qty_per_pallet is null then null
    else unit_net_weight_kg * qty_per_pallet end
  ) stored,
  gross_pallet_weight_kg numeric(18,4) generated always as (
    case when qty_per_pallet is null then null
    else unit_gross_weight_kg * qty_per_pallet + pallet_tare_weight_kg + pallet_packaging_weight_kg end
  ) stored,
  pallet_weight_class text generated always as (
    case
      when qty_per_pallet is null then null
      when unit_gross_weight_kg * qty_per_pallet + pallet_tare_weight_kg + pallet_packaging_weight_kg <= 1 then 'micro'
      when unit_gross_weight_kg * qty_per_pallet + pallet_tare_weight_kg + pallet_packaging_weight_kg <= 5 then 'light'
      when unit_gross_weight_kg * qty_per_pallet + pallet_tare_weight_kg + pallet_packaging_weight_kg <= 15 then 'medium'
      when unit_gross_weight_kg * qty_per_pallet + pallet_tare_weight_kg + pallet_packaging_weight_kg <= 25 then 'standard'
      when unit_gross_weight_kg * qty_per_pallet + pallet_tare_weight_kg + pallet_packaging_weight_kg <= 50 then 'heavy'
      when unit_gross_weight_kg * qty_per_pallet + pallet_tare_weight_kg + pallet_packaging_weight_kg <= 100 then 'very_heavy'
      when unit_gross_weight_kg * qty_per_pallet + pallet_tare_weight_kg + pallet_packaging_weight_kg <= 200 then 'extra_heavy'
      when unit_gross_weight_kg * qty_per_pallet + pallet_tare_weight_kg + pallet_packaging_weight_kg <= 500 then 'bulk_heavy'
      when unit_gross_weight_kg * qty_per_pallet + pallet_tare_weight_kg + pallet_packaging_weight_kg <= 1000 then 'jumbo_fibc'
      else 'industrial_bulk'
    end
  ) stored,
  source text,
  source_date date,
  notes text,
  status public.data_status not null default 'draft',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_handling_master_uom_idx on public.product_handling_master (uom_code);
create index if not exists product_handling_master_weight_idx on public.product_handling_master (unit_weight_class, pallet_weight_class);

alter table public.productivity add column if not exists basis_berat text not null default 'unit';
alter table public.productivity drop constraint if exists productivity_uom_check;
alter table public.productivity add constraint productivity_uom_check
  check (uom = any (array[
    'pcs','ea','unit','set','kit','pair','dozen','pack','inner_pack','box','karton','case','bundle',
    'bag','sack','big_bag','fibc','pail','bucket','drum','barrel','jerry_can','ibc',
    'roll','coil','spool','reel','sheet','bale','palet','half_pallet','tote','bin','crate',
    'g','kg','ton','ml','liter','gallon','mm','cm','meter','sqm','cbm',
    'order','line','shipment','parcel','lokasi','pick'
  ]));
alter table public.productivity drop constraint if exists productivity_kelas_berat_check;
alter table public.productivity add constraint productivity_kelas_berat_check
  check (kelas_berat = any (array[
    'semua','micro','light','medium','standard','heavy','very_heavy','extra_heavy','bulk_heavy','jumbo_fibc','industrial_bulk'
  ]));
alter table public.productivity add constraint productivity_basis_berat_check
  check (basis_berat in ('unit','pallet'));

alter table public.uom_catalog enable row level security;
alter table public.product_handling_master enable row level security;

create policy "uom catalog: baca user login" on public.uom_catalog
  for select to authenticated using (true);
create policy "uom catalog: kelola ops sd admin" on public.uom_catalog
  for all to authenticated
  using (public.current_role_is('operations','solution_design','admin'))
  with check (public.current_role_is('operations','solution_design','admin'));

create policy "product handling: baca user login" on public.product_handling_master
  for select to authenticated using (true);
create policy "product handling: tulis ops sd admin" on public.product_handling_master
  for all to authenticated
  using (public.current_role_is('operations','solution_design','admin'))
  with check (public.current_role_is('operations','solution_design','admin'));

create or replace function public.guard_product_handling_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected')
     and not public.current_role_is('solution_design','admin') then
    raise exception 'Hanya Solution Design/admin yang boleh approve atau reject Product Handling Master';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end $$;

create trigger t_product_handling_approval
  before update on public.product_handling_master
  for each row execute function public.guard_product_handling_approval();

create or replace function public.touch_product_handling_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger t_product_handling_updated_at
  before update on public.product_handling_master
  for each row execute function public.touch_product_handling_updated_at();
