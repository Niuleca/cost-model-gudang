-- Item Konsumsi: air minum galon bulanan (estimasi, status draft — wajib dicek harga vendor/depot setempat)
insert into public.price_items (kategori, item, satuan, harga_beli, sumber, status, owner_role)
select 'Konsumsi', 'Air Minum Galon 19 L (isi ulang) — bulanan', 'galon', 22000, 'Estimasi awal (Okt 2026) — wajib dicek harga vendor/depot setempat', 'draft', 'procurement'
where not exists (select 1 from public.price_items where item ilike 'Air Minum Galon%');
