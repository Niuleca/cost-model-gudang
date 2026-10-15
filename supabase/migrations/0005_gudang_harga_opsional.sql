-- Harga gudang boleh kosong (database awal ada gudang tanpa harga); UI menandai 'harga belum ada'
alter table public.warehouses drop constraint if exists warehouses_check;
