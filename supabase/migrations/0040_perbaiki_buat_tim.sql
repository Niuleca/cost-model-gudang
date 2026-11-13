-- Perbaikan: tim yang baru dibuat langsung bisa dibaca pembuatnya (insert ... returning).
-- tim_saya() tidak melihat baris yang dibuat dalam perintah yang sama, jadi cek pemilik ditulis langsung.
alter policy "tim: lihat" on public.tim
  using (pemilik = (select auth.uid()) or id in (select public.tim_saya()) or public.is_master());
