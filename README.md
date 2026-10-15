# Cost Model Gudang

Aplikasi web cost model & quotation gudang, dari login sampai unduh quotation PDF.
Mengikuti use case Esa: master data per departemen → tender → hitung → rate card → quotation.

**Stack:** Next.js 14 (App Router) · Supabase (Auth + PostgreSQL + Row Level Security) · Vercel.

## Isi repo

| Path | Isi |
|---|---|
| `src/lib/engine/` | Mesin hitung (TypeScript murni, tanpa dependensi): kalender, peak, space, manpower × shift, MHE, payroll, CAPEX/OPEX, biaya modal, cost-to-serve, margin per risiko, rate card, red flag |
| `tests/engine.test.ts` | Uji mesin hitung (`npm test`) |
| `supabase/setup_all.sql` | Skema + keamanan + data awal dalam satu file |
| `supabase/migrations/` | Skema (0001) dan RLS/approval (0002) terpisah |
| `supabase/seed/` | Data awal: 514 UMK 2026, 38 UMP, libur 2026, tarif PLN, harga & produktivitas dari Database Harga Esa |
| `src/lib/it.ts` | Lembar IT format BAP → baris biaya (bulanan, tahunan ÷ 12, OTC amortisasi / ditagih terpisah) |
| `supabase/migrations/0003_tahap1.sql` | Gudang + foto, MHE tipe/tonase, katalog IT, benchmark produktivitas, status project + log, revisi quotation, implementasi, audit log, view dashboard |
| `src/app/` | Halaman: login dan menu di bawah |

## Menu

| # | Menu | Siapa | Isi |
|---|---|---|---|
| 15 | Dashboard | Tim tender | Customer, pipeline, menang/kalah/drop, win rate, sebaran per provinsi (heat table), per industri |
| 14 | Status project | Tim tender | Papan status, lama di status, tanda macet, ubah status + alasan |
| 5 | Tender & cost model | Tim tender | Input → hitung → manpower, biaya, harga jual/beli, red flag; pilih gudang & IT dari master |
| 6 | Quotation (di tab tender) | SD buat, Commercial/Finance approve | PDF dengan data gudang, biaya sekali, revisi Rev.1, Rev.2… |
| 10 | Perbandingan harga | Tim tender | Tarif storage/handling vs median project lain dengan UoM sama |
| 9 | Riwayat | Tim tender | Versi cost model, perjalanan status, log perubahan data |
| 13 | Implementasi | Semua (departemen update tugasnya) | Checklist standar saat menang, target, progress, terlambat |
| 1 | Procurement | Procurement | Gudang (foto, Google Maps, harga/bln & per m²), MHE (tipe, tonase), ATK, printer, seragam, konsumsi, palet, pest control |
| 2 | IT | IT | Katalog format BAP: PUPM, PDPM, OTC, Transaction/Month (slab), Yearly, Mandays, Monthly/Site |
| 3 | Operations | Operations | Produktivitas per jam, detik per UoM, rentang benchmark per industri |
| 4 | HR · UMK | HR | UMK/UMP, jabatan, komponen OS |

Tahap 2 (berikutnya): export Excel berumus (7), import harga & kebutuhan (8), feasibility study & P&L (11), project charter (12).

## Langkah deploy (sekali saja)

### 1. Supabase
1. Buat project baru di supabase.com (region **Singapore**).
2. **SQL Editor → New query**, tempel seluruh isi `supabase/setup_all.sql`, klik **Run**.
   - Sudah pernah menjalankan versi sebelumnya? Cukup jalankan `supabase/migrations/0003_tahap1.sql` lalu `supabase/seed/seed_it.sql`.
   - Bucket foto gudang `warehouse-photos` dibuat otomatis oleh skrip (cek di **Storage**).
3. **Authentication → URL Configuration**
   - Site URL: `https://<domain-aplikasi>` (mis. `https://costmodel.esapanghegar.my.id`)
   - Redirect URLs: `https://<domain-aplikasi>/auth/callback` dan `http://localhost:3000/auth/callback`
4. **Project Settings → API**: catat `Project URL` dan `anon public key`.

### 2. Vercel
1. vercel.com → **Add New → Project** → import repo GitHub ini.
2. **Environment Variables**: `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` dari langkah 1.4.
3. **Deploy**.

### 3. Domain
1. Vercel → Project → **Settings → Domains** → tambahkan domain aplikasi.
2. Di pengelola DNS domain `esapanghegar.my.id`, buat record sesuai instruksi Vercel
   (subdomain: `CNAME costmodel → cname.vercel-dns.com`).

### 4. Admin pertama
1. Buka aplikasi → **Buat akun** dengan email Anda → konfirmasi email.
2. Supabase → SQL Editor, jalankan:
   ```sql
   update public.profiles set role = 'admin' where email = 'email-anda@contoh.com';
   ```
3. Masuk ke aplikasi → menu **Pengguna** untuk memberi role ke rekan (HR, Procurement, IT, Engineering, Operations, Solution Design, Commercial, Finance).

## Role & hak akses

| Role | Boleh |
|---|---|
| HR | UMK/UMP, jabatan, komponen OS |
| Procurement | Harga gudang, MHE, racking, palet, office, ATK, rental, pest control, asuransi |
| IT | Harga IT & software |
| Engineering | Tarif listrik, harga konstruksi |
| Operations | Produktivitas, kalender libur |
| Solution Design | Approve master data, buat & hitung tender, draft quotation |
| Commercial / Finance | Tender, approve quotation; Finance juga margin & parameter keuangan |
| Admin | Semua, termasuk atur role |

Keamanan ditegakkan di database (RLS + trigger), bukan hanya di tampilan.

## Logika hitung (ringkas)

- **Hari operasional** = hari kerja kalender − libur nasional & cuti bersama di hari kerja. Volume harian = volume peak ÷ (hari operasional ÷ 12).
- **Cuti tahunan** tidak mengurangi pembagi volume; masuk sebagai **faktor pengganti** = hari operasional ÷ (hari operasional − cuti).
- **Manpower**: jam per shift = volume per shift × % ÷ (produktivitas × faktor) ÷ efisiensi, dipool per role → MP per shift = ROUNDUP(jam ÷ jam efektif) → headcount = ROUNDUP(MP per shift × shift × faktor pengganti).
- **MHE**: unit = ROUNDUP(jam alat per shift ÷ (jam efektif × ketersediaan)) + spare (alat tidak dikali shift).
- **Payroll**: UMK lokasi × faktor jabatan + BPJS (JHT, JKK, JKM, JP dengan batas upah, Kesehatan dengan batas upah) + THR 1/12 + pesangon; outsourcing + contingency 7% + fee OS.
- **CAPEX**: depresiasi selama min(umur, kontrak) + bunga atas rata-rata nilai buku. Startup diamortisasi selama kontrak.
- **Biaya modal**: bunga advance sewa (saldo menurun), deposit, working capital (payment term − AP).
- **Harga**: biaya per aktivitas × (1 + margin kategori risiko) ÷ (1 − PPh 2%) ÷ volume komitmen, dibulatkan ke atas.

## Pengembangan lokal

```bash
cp .env.example .env.local   # isi URL & anon key
npm install
npm test        # uji mesin hitung + konversi IT
npm run dev     # http://localhost:3000
```
