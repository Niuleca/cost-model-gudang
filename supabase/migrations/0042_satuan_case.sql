-- Tambah satuan "per case" di Market Price transport (lanjutan 0041). Jalankan di Supabase SQL Editor.
alter table public.transport_rates drop constraint if exists transport_rates_basis_check;
alter table public.transport_rates add constraint transport_rates_basis_check
  check (basis in ('trip', 'shipment', 'km', 'kg', 'ton', 'cbm', 'liter', 'pallet', 'pcs', 'case', 'koli', 'container'));
