"""Bangun supabase/seed/seed.sql dari file sumber Esa.
Jalankan: python3 build_seed.py <Database_UMK_2026.xlsx> <Database_Harga.xlsx>
"""
import sys, openpyxl, datetime

umk_xlsx, harga_xlsx = sys.argv[1], sys.argv[2]
out = []
q = lambda s: "null" if s is None or s == "" else "'" + str(s).replace("'", "''") + "'"
num = lambda v: "null" if v is None or v == "" else repr(float(v))

out.append("-- Seed data awal — dibangkitkan otomatis oleh build_seed.py. Status master data = 'draft' sampai di-approve Solution Design (UC9).")
out.append("begin;")

# ---- UMP & UMK 2026 ----
wb = openpyxl.load_workbook(umk_xlsx)
su = wb["UMP_2026"]
for r in range(2, su.max_row + 1):
    p = su.cell(r, 2).value
    if not p: continue
    out.append(f"insert into public.ump (tahun, provinsi, nilai, dasar_hukum, sumber, catatan) values (2026, {q(p)}, {num(su.cell(r,3).value)}, {q(su.cell(r,4).value)}, {q(su.cell(r,5).value)}, {q(su.cell(r,6).value)});")
sk = wb["UMK_2026"]
for r in range(2, sk.max_row + 1):
    p = sk.cell(r, 2).value
    if not p: continue
    out.append("insert into public.umk (tahun, provinsi, kab_kota, jenis, nilai_umk, status_verifikasi, dasar_hukum, sumber, catatan) values "
               f"(2026, {q(p)}, {q(sk.cell(r,3).value)}, {q(sk.cell(r,4).value)}, {num(sk.cell(r,5).value)}, {q(sk.cell(r,9).value)}, {q(sk.cell(r,10).value)}, {q(sk.cell(r,11).value)}, {q(sk.cell(r,12).value)});")

# ---- Libur nasional & cuti bersama 2026 (SKB 3 Menteri, setneg.go.id) ----
SRC_LIBUR = "SKB 3 Menteri 2026 — setneg.go.id"
libur = [("2026-01-01","Tahun Baru 2026 Masehi"),("2026-01-16","Isra Mikraj"),("2026-02-17","Tahun Baru Imlek 2577"),
 ("2026-03-19","Hari Suci Nyepi"),("2026-03-21","Idulfitri 1447 H"),("2026-03-22","Idulfitri 1447 H"),("2026-04-03","Wafat Yesus Kristus"),
 ("2026-04-05","Paskah"),("2026-05-01","Hari Buruh Internasional"),("2026-05-14","Kenaikan Yesus Kristus"),("2026-05-27","Iduladha 1447 H"),
 ("2026-05-31","Hari Raya Waisak"),("2026-06-01","Hari Lahir Pancasila"),("2026-06-16","Tahun Baru Islam 1448 H"),
 ("2026-08-17","Proklamasi Kemerdekaan"),("2026-08-25","Maulid Nabi Muhammad"),("2026-12-25","Kelahiran Yesus Kristus")]
cuti = [("2026-02-16","Cuti bersama Imlek"),("2026-03-18","Cuti bersama Nyepi"),("2026-03-20","Cuti bersama Idulfitri"),
 ("2026-03-23","Cuti bersama Idulfitri"),("2026-03-24","Cuti bersama Idulfitri"),("2026-05-15","Cuti bersama Kenaikan Yesus Kristus"),
 ("2026-05-28","Cuti bersama Iduladha"),("2026-12-24","Cuti bersama Natal")]
for d, n in libur: out.append(f"insert into public.holidays values ({q(d)}, {q(n)}, 'Libur Nasional', {q(SRC_LIBUR)});")
for d, n in cuti: out.append(f"insert into public.holidays values ({q(d)}, {q(n)}, 'Cuti Bersama', {q(SRC_LIBUR)});")

# ---- Tarif listrik PLN (non-subsidi, berlaku s.d. ada keputusan baru Q4 2026) ----
SRC_PLN = "fortuneidn.com, tarif per 1 Okt 2026 (tarif Q3 masih berlaku)"
for g, mn, mx, t in [("B-2/TR",6600,200000,1444.70),("B-3/TM",200001,None,1114.74),("I-3/TM",200001,None,1114.74),
                     ("I-4/TT",30000000,None,996.74),("P-1/TR",6600,200000,1699.53),("P-2/TM",200001,None,1522.88)]:
    out.append(f"insert into public.electricity_tariffs (golongan, daya_min_va, daya_max_va, tarif_kwh, sumber, berlaku_mulai, status) values ({q(g)}, {mn}, {num(mx)}, {t}, {q(SRC_PLN)}, '2026-10-01', 'approved');")

# ---- Parameter payroll ----
SRC_P = "Database Harga Esa (MP Cost) + regulasi BPJS"
params = [("bpjs_jht","BPJS TK — JHT (pemberi kerja)",0.037,"PP 46/2015"),
          ("bpjs_jkk","BPJS TK — JKK kelas risiko III",0.0089,"PP 44/2015; sesuaikan kelas risiko 0,24%–1,74%"),
          ("bpjs_jkm","BPJS TK — JKM",0.003,"PP 44/2015"),
          ("bpjs_jp","BPJS TK — Jaminan Pensiun (pemberi kerja)",0.02,"PP 45/2015; ada batas upah"),
          ("bpjs_kes","BPJS Kesehatan (pemberi kerja)",0.04,"Perpres 64/2020; ada batas upah Rp12 jt"),
          ("batas_upah_jp","Batas upah iuran JP (Rp)",10547400,"Nilai 2025 — perbarui tiap Maret"),
          ("batas_upah_kes","Batas upah iuran BPJS Kesehatan (Rp)",12000000,"Perpres 64/2020"),
          ("thr","Cadangan THR (1/12 upah)",1/12,"Permenaker 6/2016"),
          ("pesangon","Cadangan kompensasi/pesangon",0.08,"Asumsi Esa — review HR"),
          ("contingency_os","Contingency biaya OS",0.07,"Use case UC3 — keputusan Esa 16 Okt 2026"),
          ("fee_os","Fee/management fee outsourcing",0.05,"Database Harga Esa")]
for k, l, v, d in params:
    out.append(f"insert into public.payroll_params (key, label, nilai, dasar_hukum, status) values ({q(k)}, {q(l)}, {v}, {q(d)}, 'draft');")

# ---- Parameter keuangan & margin (default, Finance wajib review) ----
for k, l, v, c in [("bunga_modal_tahun","Cost of capital per tahun",0.10,"Default — Finance review"),
                   ("ap_hari","Hari bayar ke vendor (AP)",30,"Default"),
                   ("overhead_persen","Overhead korporat",0.03,"Template KLOG memakai 2,7–3%"),
                   ("pph_grossup","Gross-up PPh 23",0.02,"PPh 23 jasa 2%"),
                   ("gp_minimum","Batas GP minimum (red flag)",0.08,"Default — Finance review")]:
    out.append(f"insert into public.finance_params values ({q(k)}, {q(l)}, {v}, {q(c)});")
for k, v, c in [("Rendah",0.08,"Biaya tetap & back-to-back: sewa, utilitas, consumable"),
                ("Sedang",0.12,"Biaya volume-driven: manpower, MHE sewa, IT"),
                ("Tinggi",0.18,"Investasi melebihi kontrak, startup, racking")]:
    out.append(f"insert into public.margin_policy (kategori_risiko, margin, keterangan) values ({q(k)}, {v}, {q(c)});")

# ---- Database Harga: item, jabatan, produktivitas ----
wh = openpyxl.load_workbook(harga_xlsx, data_only=True)
SRC_H = "Database Harga Esa (Okt 2026) — tanpa vendor/tanggal, wajib dilengkapi"
KAT = {"Uniform":"HSE","MHE":"MHE","Racking":"Racking","Stationery":"ATK","IT":"IT","HSE":"HSE",
       "Operational":"Konstruksi","Office":"Office","Pest Control":"Pest Control","Asuransi":"Asuransi"}
OWN = {"IT":"it","Konstruksi":"engineering"}
UMUR = {"MHE":60,"Racking":120,"IT":36,"Office":48,"HSE":24,"Konstruksi":60}
db = wh["Database"]
seen = set()
for r in range(4, db.max_row + 1):
    kat, item, beli, sewa = db.cell(r,2).value, db.cell(r,3).value, db.cell(r,4).value, db.cell(r,5).value
    if not item or (beli in (None,"") and sewa in (None,"")): continue
    k = KAT.get(kat, "Lainnya")
    if item in ("Pallet Kayu","Pallet Plastik"): k = "Palet"
    key = (k, item, beli)
    if key in seen: continue
    seen.add(key)
    sat = "per m² (estimasi)" if "Construction" in item else ("posisi palet" if k=="Racking" and "Mezzanine" not in item else ("m²" if "Mezzanine" in item else "unit"))
    note = SRC_H + ("; item ganda dengan harga berbeda — pilih satu" if sum(1 for x in seen if x[1]==item) > 1 else "")
    out.append("insert into public.price_items (kategori, item, satuan, harga_beli, harga_sewa_bulan, umur_ekonomis_bulan, sumber, owner_role, status) values "
               f"({q(k)}, {q(item)}, {q(sat)}, {num(beli)}, {num(sewa)}, {UMUR.get(k,'null')}, {q(note)}, {q(OWN.get(k,'procurement'))}, 'draft');")

UOM = {"Pallet":"palet","Carton":"karton","Box":"karton","Order":"order","Order Line":"line","Pcs":"pcs"}
pr = wh["Productivity"]
roles = {}
for r in range(5, 30):
    rn, kl = pr.cell(r,15).value, pr.cell(r,16).value
    if rn and kl: roles[rn] = "White Collar" if "White" in kl else "Blue Collar"
FAKTOR = {"Manager / Ka Gudang":3.2,"Operational SPV":1.8,"QHSE / K3":1.3,"Admin Inbound-Outbound":1.3,"Security":1.3,
          "Inbound Admin":1.1,"Outbound Admin":1.1,"Stock Controller":1.05,"Inventory Controller":1.05,
          "Operator Forklift (CBT)":1.05,"Operator Reach Truck":1.05}
for rn, kl in roles.items():
    out.append(f"insert into public.job_levels (role_name, klasifikasi, faktor_umk, is_outsourcing, sumber, status) values ({q(rn)}, {q(kl)}, {FAKTOR.get(rn,1.0)}, {'false' if rn in ('Manager / Ka Gudang','Operational SPV') else 'true'}, 'Database Harga Esa (MP Kalkulator); faktor role selain kantor = asumsi', 'draft');")
for r in range(5, 60):
    akt = pr.cell(r,2).value
    if not akt: continue
    tool, role, tahap, prod, uom, src = pr.cell(r,3).value, pr.cell(r,4).value, pr.cell(r,6).value, pr.cell(r,7).value, pr.cell(r,8).value, (pr.cell(r,9).value or "").strip()
    out.append("insert into public.productivity (aktivitas, tahap, tool, role_name, uom, prod_per_jam, metode, sumber, status) values "
               f"({q(akt)}, {q(tahap)}, {q(tool)}, {q(role)}, {q(UOM.get(uom, 'karton'))}, {prod}, {q('Benchmark')}, {q(src or 'Database Harga Esa — sumber belum dicatat')}, 'draft') on conflict do nothing;")

# ---- Template T&C default ----
TC = """1. Harga belum termasuk PPN 11% dan sudah memperhitungkan PPh 23.
2. Penawaran berlaku 30 hari sejak tanggal quotation.
3. Tagihan bulanan dengan minimum charge sesuai volume komitmen (MGV); volume di atas MGV ditagih sesuai tarif.
4. Pembayaran {payment_term} hari setelah invoice diterima; keterlambatan dikenakan denda 2% per bulan.
5. Tarif disesuaikan setiap tahun mengikuti kenaikan UMK dan inflasi, serta bila terjadi perubahan regulasi.
6. Tanggung jawab kehilangan/kerusakan dibatasi maksimal nilai tarif handling atas barang terkait, kecuali terbukti lalai; barang wajib diasuransikan oleh pemilik barang.
7. Perubahan profil volume, SKU, atau proses di luar asumsi penawaran akan dihitung ulang.
8. Kontrak minimum {durasi} bulan; pengakhiran lebih awal mengganti sisa investasi yang belum tersusutkan."""
out.append(f"insert into public.tc_templates (nama, isi) values ('Standar Gudang', {q(TC)});")

out.append("commit;")
open(sys.argv[3] if len(sys.argv) > 3 else "seed.sql", "w").write("\n".join(out) + "\n")
print(len(out), "baris SQL")
