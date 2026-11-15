-- Skema satuan harga transport & intermodal: tambah per shipment, per km, per pcs, per koli di Market Price.
-- Dijalankan manual di Supabase SQL Editor. Hanya mengganti CHECK constraint kolom basis (data lama tetap valid).
alter table public.transport_rates drop constraint if exists transport_rates_basis_check;
alter table public.transport_rates add constraint transport_rates_basis_check
  check (basis in ('trip', 'shipment', 'km', 'kg', 'ton', 'cbm', 'liter', 'pallet', 'pcs', 'koli', 'container'));
