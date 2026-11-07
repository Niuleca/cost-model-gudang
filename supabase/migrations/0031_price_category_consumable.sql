-- Kategori harga baru "Consumable" (stretch film, lakban, label) untuk bagian Consumable di Technology & Equipment.
-- Dipisah dari migrasi isi data karena nilai enum baru belum bisa dipakai di transaksi yang sama.
alter type price_category add value if not exists 'Consumable';
