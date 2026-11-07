-- UAT B7–B11: harga untuk daftar default Technology & Equipment (Services, Consumable, Asuransi, jaringan IT, slab WMS).
-- Semua baris berstatus draft (perlu approval Procurement) — sumber & tanggal harga dicatat.

-- 1) Services: security & cleaning (outsourcing) — dasar UMK Kab. Bekasi 2026 Rp5.938.885 × 1,38
--    (BPJS ±14,2%, THR 8,3%, seragam & perlengkapan ±3%, fee vendor 10%). Di tender, harga dihitung ulang dari UMK lokasi.
insert into price_items (kategori, item, satuan, harga_sewa_bulan, sumber, tanggal_harga, status)
select v.kategori::price_category, v.item, v.satuan, v.harga, v.sumber, date '2026-11-08', 'draft'
from (values
  ('Security', 'Security Guard / Satpam outsourcing (8 jam/shift)', 'orang/bln', 8200000::numeric,
   'UMK Kab. Bekasi 2026 × 1,38 (BPJS, THR, seragam, fee vendor 10%); gaji satpam outsourcing 2026 Rp3,5–5 jt rata-rata nasional (dealls.com)'),
  ('Security', 'Komandan Regu (Danru) Security', 'orang/bln', 9000000::numeric,
   'UMK Kab. Bekasi 2026 × 1,1 × 1,38 (tunjangan jabatan ±10%)'),
  ('Cleaning', 'Cleaning Service outsourcing (8 jam/hari)', 'orang/bln', 8200000::numeric,
   'UMK Kab. Bekasi 2026 × 1,38 (BPJS, THR, seragam, fee vendor 10%); gaji cleaning service outsourcing 2026 Rp3–4,5 jt rata-rata nasional (dealls.com)'),
  ('Cleaning', 'Chemical & perlengkapan kebersihan (sabun, pel, tisu, kantong sampah)', 'paket/bln per 1.000 m²', 350000::numeric,
   'Estimasi — minta quotation vendor cleaning'),
  ('Cleaning', 'Pengangkutan sampah non-B3 (kontrak bulanan)', 'site/bln', 1500000::numeric,
   'Estimasi — minta quotation pengelola kawasan / vendor')
) as v(kategori, item, satuan, harga, sumber)
where not exists (select 1 from price_items p where p.item = v.item);

-- 2) Consumable gudang
insert into price_items (kategori, item, satuan, harga_beli, sumber, tanggal_harga, status)
select 'Consumable', 'Stretch Film 50 cm × 300 m, 17 mic (wrapping palet)', 'roll', 140000,
  'Tokopedia: 10 listing stretch film 50 cm × 300 m (Rp74.500–175.000, median ±Rp140.000), Nov 2026', date '2026-11-08', 'draft'
where not exists (select 1 from price_items p where p.item = 'Stretch Film 50 cm × 300 m, 17 mic (wrapping palet)');
-- lakban & label thermal dipakai di lantai gudang (bukan alat tulis kantor)
update price_items set kategori = 'Consumable'
where kategori = 'ATK' and item in ('Lakban Bening/Coklat', 'Lakban Fragile', 'Lakban OPP', 'Direct Thermal Label');

-- 3) Asuransi stok/barang: tarif batas bawah asuransi kebakaran (FLEXAS) SEOJK 6/SEOJK.05/2017 Lampiran I.
--    Harga per Rp1 miliar nilai stok: harga_beli = premi per tahun, harga_sewa_bulan = premi per bulan.
update price_items set item = 'Asuransi Gudang dan Barang (premi paket, contoh)' where item = 'Asuransi Gudang dam Barang';
insert into price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, sumber, tanggal_harga, status)
select 'Asuransi', v.item, 'per Rp1 miliar nilai stok', v.tahun, round(v.tahun / 12.0), v.sumber, date '2026-11-08', 'draft'
from (values
  ('Asuransi stok — gudang umum / 3PL, konstruksi kelas 1 (okupasi 29378)', 2255000::numeric, 'SEOJK 6/SEOJK.05/2017 Lampiran I: 2,255‰/tahun (batas bawah), kelas konstruksi 1'),
  ('Asuransi stok — gudang umum / 3PL, konstruksi kelas 2 (okupasi 29378)', 3382000::numeric, 'SEOJK 6/SEOJK.05/2017 Lampiran I: 3,382‰/tahun (batas bawah), kelas konstruksi 2'),
  ('Asuransi stok — gudang pribadi / dedicated, konstruksi kelas 1 (okupasi 29371)', 1127000::numeric, 'SEOJK 6/SEOJK.05/2017 Lampiran I: 1,127‰/tahun (batas bawah), kelas konstruksi 1'),
  ('Asuransi stok — gudang berikat, konstruksi kelas 1 (okupasi 29394)', 2004000::numeric, 'SEOJK 6/SEOJK.05/2017 Lampiran I: 2,004‰/tahun (batas bawah), kelas konstruksi 1')
) as v(item, tahun, sumber)
where not exists (select 1 from price_items p where p.item = v.item);

-- 4) Katalog IT: jaringan WiFi untuk RF scanner (harga Citraweb, belum PPN 11%)
insert into it_catalog (kelompok, item, deskripsi, cost_type, basis, harga, urutan, sumber, tanggal_harga, status)
select v.kelompok, v.item, v.deskripsi, v.cost_type, v.basis, v.harga, v.urutan, v.sumber, date '2026-11-08', 'draft'
from (values
  ('Networking Device', 'WiFi Access Point (WiFi 6, enterprise)', 'Coverage RF scanner area gudang & office', 'OTC/Unit', 'Sekali', 3450000::numeric, 30,
   'Citraweb (UniFi U6 Pro Rp3.450.000, belum PPN), Nov 2026'),
  ('Networking Device', 'Switch PoE 24 port', 'Daya & jaringan untuk access point dan kamera CCTV', 'OTC/Unit', 'Sekali', 7720000::numeric, 31,
   'Citraweb (UniFi Standard 24 PoE Rp7.720.000, belum PPN), Nov 2026'),
  ('Networking Cabling', 'Instalasi kabel LAN per titik (Cat6, termasuk konektor)', 'Titik access point, PC, printer', 'OTC', 'Sekali', 750000::numeric, 32,
   'Estimasi — minta quotation vendor jaringan')
) as v(kelompok, item, deskripsi, cost_type, basis, harga, urutan, sumber)
where not exists (select 1 from it_catalog c where c.item = v.item);

-- 5) Slab WMS SaaS per transaksi/bulan (asumsi awal — ubah di Price Inquiry → IT bila kontrak vendor berbeda)
update it_catalog set slab_min = 0, slab_max = 20000 where item = 'WMS SaaS – slab 1' and slab_min is null;
update it_catalog set slab_min = 20001, slab_max = 100000 where item = 'WMS SaaS – slab 2' and slab_min is null;
update it_catalog set slab_min = 100001, slab_max = null where item = 'WMS SaaS – slab 3' and slab_min is null;
