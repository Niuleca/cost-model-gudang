-- 0007 · UoM produktivitas ditambah liter, pail, pack, roll (menu Productivity per UoM).
alter table public.productivity drop constraint productivity_uom_check;
alter table public.productivity add constraint productivity_uom_check
  check (uom = any (array['pcs','bag','karton','palet','ton','cbm','order','lokasi','line','liter','pail','pack','roll']));
