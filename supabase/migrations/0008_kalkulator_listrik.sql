-- 0008 · Kalkulator kebutuhan listrik (format Excel: peralatan × ruang → kWh, LWBP/WBP, biaya beban kVA).
create table public.electricity_simulations (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null,
  is_template boolean not null default false,
  tender_id   uuid references public.tenders(id) on delete set null,
  data        jsonb not null,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger t_elec_sim_upd before update on public.electricity_simulations for each row execute function public.touch_updated_at();
alter table public.electricity_simulations enable row level security;
create policy "baca" on public.electricity_simulations for select to authenticated using (true);
create policy "tulis tim" on public.electricity_simulations for all to authenticated
  using (public.current_role_is('engineering','procurement','solution_design','admin'))
  with check (public.current_role_is('engineering','procurement','solution_design','admin'));

-- Template standar dari Excel kalkulator listrik Esa (Vacuum Cleaner 1.000 W: angka di file tidak terbaca, perlu dicek)
insert into public.electricity_simulations (nama, is_template, data, created_by)
values ('Template standar (Excel Esa)', true, '{"hariPerBulan": 25, "allowance": 0, "porsiLwbp": 0.666667, "tarifLwbp": 996.74, "tarifWbp": 996.74, "golongan": "I-4/TT", "tarifKvarh": 2042, "porsiKvarh": 0, "bebanPerKva": 43667, "kvaTerpasang": 6, "powerFactor": 0.85, "alat": [{"nama": "Pallet Mover", "watt": 2000, "jam": 12, "id": "a1"}, {"nama": "Reach truck", "watt": 5000, "jam": 12, "id": "a2"}, {"nama": "Electric Forklift", "watt": 5000, "jam": 6, "id": "a3"}, {"nama": "Vacuum Cleaner", "watt": 1000, "jam": 21, "id": "a4"}, {"nama": "Exhaust Fan", "watt": 45, "jam": 21, "id": "a5"}, {"nama": "Sirene", "watt": 0, "jam": 0, "id": "a6"}, {"nama": "Loud Speaker", "watt": 0, "jam": 0, "id": "a7"}, {"nama": "Blower", "watt": 0, "jam": 21, "id": "a8"}, {"nama": "CCTV & alarm", "watt": 20, "jam": 24, "id": "a9"}, {"nama": "Rotary Warning Light", "watt": 100, "jam": 21, "id": "a10"}, {"nama": "Lampu TL", "watt": 18, "jam": 21, "id": "a11"}, {"nama": "Lampu Parkir", "watt": 250, "jam": 12, "id": "a12"}, {"nama": "Lampu hemat energi", "watt": 60, "jam": 21, "id": "a13"}, {"nama": "Emergency light", "watt": 80, "jam": 21, "id": "a14"}, {"nama": "Lampu gudang", "watt": 100, "jam": 6, "id": "a15"}, {"nama": "Computer", "watt": 300, "jam": 12, "id": "a16"}, {"nama": "UPS", "watt": 300, "jam": 24, "id": "a17"}, {"nama": "Printer", "watt": 500, "jam": 12, "id": "a18"}, {"nama": "Mesin Fax", "watt": 35, "jam": 21, "id": "a19"}, {"nama": "Mesin absensi", "watt": 35, "jam": 24, "id": "a20"}, {"nama": "AC", "watt": 1500, "jam": 12, "id": "a21"}, {"nama": "Dispenser", "watt": 300, "jam": 12, "id": "a22"}, {"nama": "Fan", "watt": 80, "jam": 21, "id": "a23"}, {"nama": "Copy machine", "watt": 650, "jam": 12, "id": "a24"}, {"nama": "Other IT Peripherals", "watt": 100, "jam": 24, "id": "a25"}, {"nama": "LED", "watt": 10, "jam": 21, "id": "a26"}], "ruang": [{"nama": "Gudang", "qty": {"a9": 1, "a15": 2, "a16": 1, "a21": 1, "a22": 1, "a24": 1}}, {"nama": "Office", "qty": {}}, {"nama": "Area Parking", "qty": {}}, {"nama": "Pos Security", "qty": {}}, {"nama": "Musollah", "qty": {}}]}'::jsonb, null);
