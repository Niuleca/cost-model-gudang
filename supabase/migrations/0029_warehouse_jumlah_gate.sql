-- Price Inquiry → List Rental Warehouse: jumlah gate (pintu masuk/keluar kendaraan & orang, selain pintu dock)
alter table public.warehouses add column if not exists jumlah_gate integer check (jumlah_gate is null or jumlah_gate >= 0);
comment on column public.warehouses.jumlah_gate is 'Jumlah gate (pintu gedung selain dock: gate in / gate out / pintu kendaraan & orang)';
