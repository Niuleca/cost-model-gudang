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
| `src/app/` | Halaman: login, tender, tender baru, workspace tender (7 tab), master data, admin, akun |

## Langkah deploy (sekali saja)

### 1. Supabase
1. Buat project baru di supabase.com (region **Singapore**).
2. **SQL Editor → New query**, tempel seluruh isi `supabase/setup_all.sql`, klik **Run**.
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
npm test        # uji mesin hitung
npm run dev     # http://localhost:3000
```
