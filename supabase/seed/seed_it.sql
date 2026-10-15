-- Katalog IT awal, dari contoh BAP KLOG (Nabati Majalengka, BAP-71/02/2019).
-- Status draft: harga 2019, perlu dicek ulang & di-approve oleh IT / Solution Design.
-- Rentang slab transaksi WMS belum diisi (isi slab_min / slab_max dari kontrak KLOG).
insert into public.it_catalog (kelompok, item, cost_type, basis, harga, urutan, sumber, tanggal_harga) values
 ('Software - WMS Solution','KLOG WMS SaaS – slab 1','Transaction/Month','Transaksi',3400,1,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','KLOG WMS SaaS – slab 2','Transaction/Month','Transaksi',2750,2,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','KLOG WMS SaaS – slab 3','Transaction/Month','Transaksi',2000,3,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','Office Tools','OTC/Unit','Sekali',950000,4,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','Antivirus','PUPM','Bulanan',39375,5,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','Email','PUPM','Bulanan',115000,6,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Software - WMS Solution','Power BI','PUPM','Bulanan',131039,7,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Scanner HHT','PDPM','Bulanan',475000,10,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','PC Desktop','PDPM','Bulanan',350000,11,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Laptop CYOD','PUPM','Bulanan',450000,12,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Laptop Operasional','PDPM','Bulanan',500000,13,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Printer Dot Matrix','OTC/Unit','Sekali',10000000,14,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','TV Display','OTC/Unit','Sekali',14000000,15,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Printer All-in-One','OTC/Unit','Sekali',5000000,16,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','Printer Barcode','OTC/Unit','Sekali',4000000,17,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Hardware & Device','UPS','OTC/Unit','Sekali',1500000,18,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('CCTV','Kamera CCTV','OTC/Unit','Sekali',2500000,30,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('CCTV','NVR','OTC/Unit','Sekali',15000000,31,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('CCTV','TV Monitor CCTV','OTC/Unit','Sekali',4000000,32,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('CCTV','KVM','OTC/Unit','Sekali',1000000,33,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('CCTV','Cabling CCTV','OTC','Sekali',2000000,34,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Connection','Firewall & WAN – instalasi','OTC','Sekali',8360000,40,'BAP-71/02/2019 Nabati Majalengka','2019-02-01'),
 ('Connection','Firewall & WAN – bulanan','Monthly/Site','Bulanan',12000000,41,'BAP-71/02/2019 Nabati Majalengka','2019-02-01')
on conflict (kelompok, item) do nothing;
