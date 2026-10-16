-- 0006 · Project berjalan yang diimpor dari cost model Excel lama.
-- Datanya disimpan di tenders.asumsi->'historis' (hasil mesin hitung = null).
-- tender_overview membaca hasil mesin hitung dulu, kalau kosong pakai data historis,
-- supaya project lama ikut di daftar tender, dashboard, dan menu perbandingan harga.
create or replace view public.tender_overview with (security_invoker = true) as
with h as (
  select t.*, t.asumsi->'historis' as hs from public.tenders t
)
select h.id, h.kode, h.customer, h.industri, h.provinsi, h.kab_kota, h.tipe_gudang, h.skema, h.skenario_aset,
       h.status::text as status, h.versi, h.created_at, h.updated_at, h.tanggal_keputusan, h.alasan_hasil,
       h.durasi_kontrak_bulan, h.jumlah_shift,
       coalesce((h.hasil->>'totalBiayaBulan')::numeric, (h.hs->'ringkasan'->>'biayaBulan')::numeric)                 as biaya_bulan,
       coalesce((h.hasil->'simulasi'->0->>'pendapatanBulan')::numeric, (h.hs->'ringkasan'->>'pendapatanBulan')::numeric) as pendapatan_bulan,
       coalesce((h.hasil->'simulasi'->0->>'gpPersen')::numeric, (h.hs->'ringkasan'->>'gpPersen')::numeric)             as gp_persen,
       coalesce((h.hasil->>'totalHeadcount')::int, round((h.hs->'ringkasan'->>'headcount')::numeric)::int)              as headcount,
       coalesce((h.hasil->'space'->>'totalM2')::numeric, (h.hs->'ringkasan'->>'luasM2')::numeric)                      as luas_m2,
       coalesce((h.hasil->'space'->>'ppDesain')::numeric, (h.hs->'ringkasan'->>'posisiPalet')::numeric)                as posisi_palet,
       coalesce((select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(h.hasil->'rateCard') r where r->>'bucket' = 'storage'),
                (select (r->>'tarif')::numeric from jsonb_array_elements(h.hs->'rateCard') r where r->>'bucket' = 'storage' limit 1))      as tarif_storage,
       coalesce((select r->>'uom' from jsonb_array_elements(h.hasil->'rateCard') r where r->>'bucket' = 'storage'),
                (select r->>'uom' from jsonb_array_elements(h.hs->'rateCard') r where r->>'bucket' = 'storage' limit 1))                    as uom_storage,
       coalesce((select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(h.hasil->'rateCard') r where r->>'bucket' = 'handling_in'),
                (select (r->>'tarif')::numeric from jsonb_array_elements(h.hs->'rateCard') r where r->>'bucket' = 'handling_in' limit 1))  as tarif_handling_in,
       coalesce((select (r->>'tarifPerUnit')::numeric from jsonb_array_elements(h.hasil->'rateCard') r where r->>'bucket' = 'handling_out'),
                (select (r->>'tarif')::numeric from jsonb_array_elements(h.hs->'rateCard') r where r->>'bucket' = 'handling_out' limit 1)) as tarif_handling_out,
       coalesce((select r->>'uom' from jsonb_array_elements(h.hasil->'rateCard') r where r->>'bucket' = 'handling_in'),
                (select r->>'uom' from jsonb_array_elements(h.hs->'rateCard') r where r->>'bucket' = 'handling_in' limit 1))                as uom_handling,
       (select count(*) from jsonb_array_elements(h.hasil->'redFlags') f where f->>'level' = 'kritis')                                as red_flag_kritis,
       (h.hs is not null)                                                                                                             as dari_excel
from h;
