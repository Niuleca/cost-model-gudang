-- Productivity per kategori bisnis + master UoM (UN/ECE Rec. 21) & kelas berat.
-- 1) UoM: daftar diperluas (kemasan, liquid container, unit load, weight, volume, order)
alter table public.productivity drop constraint if exists productivity_uom_check;
alter table public.productivity add constraint productivity_uom_check check (uom = any (array[
  'pcs','unit','set','pair','sheet','inner','pack','box','karton','crate','bag','jumbo_bag','bale','bundle','roll','reel','coil',
  'pail','jerrican','drum','ibc','cylinder','palet','skid','container','kg','ton','liter','cbm','order','line','lokasi']));
-- 2) Kelas berat: kode umum (light..heavylift) + kode per UoM (mis. bag-50, fibc-1000, plt-heavy); 'semua' = berlaku untuk semua berat
alter table public.productivity drop constraint if exists productivity_kelas_berat_check;
alter table public.productivity add constraint productivity_kelas_berat_check check (kelas_berat ~ '^[a-z0-9-]{2,24}$');
-- 3) Industri lama → kategori bisnis (English)
update public.productivity set industri = 'General Cargo' where industri in ('Umum', '') or industri is null;
update public.productivity p set benchmark = (
  select jsonb_object_agg(coalesce(m.baru, e.key), e.value)
  from jsonb_each(p.benchmark) e
  left join (values ('Retail-Consumer','Retail & E-commerce'), ('E-Commerce','Retail & E-commerce'), ('Tech','Technology & Electronics'),
    ('Fashion Retail','Fashion, Textile & Footwear'), ('Healthcare','Healthcare & Pharma'), ('Healthcare + Cold Chain','Cold Chain'),
    ('FMCG','FMCG'), ('Bahan bangunan','Building Materials'), ('Otomotif','Automotive & Spare Parts'), ('Kimia','Chemicals (non-DG)')) m(lama, baru)
    on m.lama = e.key)
where p.benchmark is not null and p.benchmark <> '{}'::jsonb;
update public.tenders set industri = case lower(trim(industri))
  when 'fmcg' then 'FMCG' when 'fmcg (makanan & minuman)' then 'FMCG' when 'retail-consumer' then 'Retail & E-commerce' when 'e-commerce' then 'Retail & E-commerce'
  when 'tech' then 'Technology & Electronics' when 'fashion retail' then 'Fashion, Textile & Footwear' when 'healthcare' then 'Healthcare & Pharma'
  when 'healthcare + cold chain' then 'Cold Chain' when 'bahan bangunan' then 'Building Materials' when 'otomotif' then 'Automotive & Spare Parts'
  when 'kimia' then 'Chemicals (non-DG)' else industri end
where industri is not null;
comment on column public.productivity.industri is 'Kategori bisnis (English): FMCG, Retail & E-commerce, …, General Cargo (berlaku semua kategori)';
